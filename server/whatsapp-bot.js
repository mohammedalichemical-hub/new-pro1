const { pool } = require('./db');
const { getAvailableSlots } = require('./slots');

function normalizeNumber(raw) {
  return String(raw).replace(/[^0-9]/g, '');
}

async function getState(whatsapp_number) {
  const { rows } = await pool.query(
    'SELECT * FROM conversation_states WHERE whatsapp_number = $1',
    [whatsapp_number]
  );
  if (rows.length) return rows[0];
  const { rows: created } = await pool.query(
    `INSERT INTO conversation_states (whatsapp_number, step, context)
     VALUES ($1, 'idle', '{}') RETURNING *`,
    [whatsapp_number]
  );
  return created[0];
}

async function setState(whatsapp_number, step, context) {
  await pool.query(
    `UPDATE conversation_states SET step = $2, context = $3 WHERE whatsapp_number = $1`,
    [whatsapp_number, step, JSON.stringify(context || {})]
  );
}

async function resetState(whatsapp_number) {
  await setState(whatsapp_number, 'idle', {});
}

async function findPatient(whatsapp_number) {
  const { rows } = await pool.query(
    'SELECT * FROM patients WHERE whatsapp_number = $1 AND is_active = true',
    [whatsapp_number]
  );
  return rows[0] || null;
}

async function listServices() {
  const { rows } = await pool.query(
    'SELECT * FROM services WHERE is_active = true ORDER BY name_ar'
  );
  return rows;
}

async function getSingleDoctor() {
  // MVP: نفترض طبيب واحد نشط. إذا صار أكثر من طبيب لاحقاً، نضيف خطوة اختيار الطبيب هنا.
  const { rows } = await pool.query(
    'SELECT * FROM doctors WHERE is_active = true ORDER BY created_at LIMIT 1'
  );
  return rows[0] || null;
}

function formatServicesList(services) {
  return services
    .map((s, i) => `${i + 1}. ${s.name_ar} - ${Number(s.price).toLocaleString()} د.ع`)
    .join('\n');
}

function isValidDate(y, m, d) {
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(y, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day;
}

function parseArabicDate(text) {
  const clean = text.trim();
  const today = new Date();

  if (/اليوم/.test(clean)) {
    return today.toISOString().slice(0, 10);
  }
  if (/(بكرة|باجر|غدا)/.test(clean)) {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  }
  // صيغة YYYY-MM-DD
  const isoMatch = clean.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    if (!isValidDate(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // صيغة DD-MM-YYYY
  const fullMatch = clean.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (fullMatch) {
    const [, d, m, y] = fullMatch;
    if (!isValidDate(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // صيغة DD-MM أو DD/MM (بدون سنة، نفترض السنة الحالية)
  const shortMatch = clean.match(/(\d{1,2})[-/](\d{1,2})/);
  if (shortMatch) {
    const [, d, m] = shortMatch;
    const y = today.getFullYear();
    if (!isValidDate(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/**
 * نقطة الدخول الرئيسية: تستلم رسالة واردة وترجع الرد المناسب.
 * تدير كامل آلة حالة الحجز (تسجيل مريض جديد -> اختيار خدمة -> اختيار يوم -> اختيار وقت -> تثبيت الحجز).
 */
async function handleIncomingMessage(rawNumber, rawText) {
  const whatsapp_number = normalizeNumber(rawNumber);
  const text = (rawText || '').trim();

  // سجل الرسالة الواردة لغرض التدقيق
  await pool.query(
    `INSERT INTO whatsapp_messages (whatsapp_number, direction, message_text) VALUES ($1, 'inbound', $2)`,
    [whatsapp_number, text]
  );

  const state = await getState(whatsapp_number);
  const context = state.context || {};

  // كلمات إلغاء تعمل من أي مكان بالمحادثة
  if (/^(الغاء|إلغاء|كنسل)/.test(text)) {
    return handleCancelRequest(whatsapp_number);
  }

  let reply;

  switch (state.step) {
    case 'idle': {
      const patient = await findPatient(whatsapp_number);
      if (!patient) {
        await setState(whatsapp_number, 'awaiting_name', {});
        reply = 'أهلاً بيك بعيادتنا 🦷\nيبدو هذي أول مرة تتواصل وياگ. ممكن تعطينا اسمك الكامل حتى نسجلك بالنظام؟';
      } else {
        const services = await listServices();
        await setState(whatsapp_number, 'awaiting_service', { patient_id: patient.id });
        reply = `أهلاً بيك مرة ثانية ${patient.full_name} 👋\nشنو الخدمة اللي تريدها؟ رد برقمها:\n\n${formatServicesList(services)}`;
      }
      break;
    }

    case 'awaiting_name': {
      if (text.length < 2) {
        reply = 'من فضلك اكتب اسمك الكامل بشكل صحيح 🙏';
        break;
      }
      const { rows } = await pool.query(
        `INSERT INTO patients (full_name, whatsapp_number) VALUES ($1, $2)
         ON CONFLICT (whatsapp_number) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING *`,
        [text, whatsapp_number]
      );
      const patient = rows[0];
      const services = await listServices();
      await setState(whatsapp_number, 'awaiting_service', { patient_id: patient.id });
      reply = `تشرفنا فيك ${patient.full_name} 🌟\nشنو الخدمة اللي تريدها؟ رد برقمها:\n\n${formatServicesList(services)}`;
      break;
    }

    case 'awaiting_service': {
      const services = await listServices();
      const choice = parseInt(text, 10);
      if (!choice || choice < 1 || choice > services.length) {
        reply = `من فضلك رد برقم صحيح من القائمة:\n\n${formatServicesList(services)}`;
        break;
      }
      const service = services[choice - 1];
      const doctor = await getSingleDoctor();
      if (!doctor) {
        reply = 'عذراً، ما عدنا طبيب متاح حالياً. راح يتواصل وياك الاستقبال قريباً.';
        await resetState(whatsapp_number);
        break;
      }
      await setState(whatsapp_number, 'awaiting_date', {
        ...context,
        service_id: service.id,
        service_name: service.name_ar,
        doctor_id: doctor.id,
      });
      reply = `تمام، اخترت "${service.name_ar}" ✅\nياهو اليوم المناسب الك؟ تكدر تكتب "اليوم" أو "بكرة" أو تاريخ مثل 2026-07-10`;
      break;
    }

    case 'awaiting_date': {
      const date = parseArabicDate(text);
      if (!date) {
        reply = 'ما فهمت التاريخ 🙏 جرب تكتب "اليوم" أو "بكرة" أو بصيغة مثل 2026-07-10';
        break;
      }
      const slots = await getAvailableSlots(context.doctor_id, date);
      if (!slots.length) {
        reply = 'عذراً، ما بقه وقت متاح بهذا اليوم. جرب يوم ثاني؟';
        break;
      }
      await setState(whatsapp_number, 'awaiting_slot', { ...context, date, slots });
      const list = slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
      reply = `الأوقات المتاحة يوم ${date}:\n\n${list}\n\nرد برقم الوقت اللي يناسبك.`;
      break;
    }

    case 'awaiting_slot': {
      const choice = parseInt(text, 10);
      const slots = context.slots || [];
      if (!choice || choice < 1 || choice > slots.length) {
        reply = 'من فضلك رد برقم صحيح من قائمة الأوقات المرسلة.';
        break;
      }
      const slot = slots[choice - 1];
      try {
        const { rows } = await pool.query(
          `INSERT INTO appointments (patient_id, doctor_id, service_id, start_time, end_time, status, source)
           VALUES ($1, $2, $3, $4, $5, 'confirmed', 'whatsapp')
           RETURNING *`,
          [context.patient_id, context.doctor_id, context.service_id, slot.start_time, slot.end_time]
        );
        const appt = rows[0];
        const apptDate = new Date(appt.start_time);
        reply = `تم تثبيت موعدك بنجاح ✅\n📅 ${apptDate.toLocaleDateString('ar-IQ')} الساعة ${slot.label}\nالخدمة: ${context.service_name}\n\nنتشرف بزيارتك، وإذا تريد تلغي أو تعدل الموعد اكتب "الغاء" بأي وقت.`;
        await resetState(whatsapp_number);
      } catch (err) {
        if (err.code === '23P01') {
          reply = 'عذراً، هذا الوقت انحجز قبلك لحظات مضت 😔 جرب تختار وقت ثاني من نفس القائمة أو اكتب يوم جديد.';
        } else {
          console.error(err);
          reply = 'صار خطأ تقني، من فضلك حاول مرة ثانية بعد شوي.';
        }
      }
      break;
    }

    case 'awaiting_cancel_choice': {
      const choice = parseInt(text, 10);
      const appts = context.appointments || [];
      if (!choice || choice < 1 || choice > appts.length) {
        reply = 'رد برقم صحيح من قائمة المواعيد المرسلة، أو اكتب "تراجع" للخروج.';
        break;
      }
      const appt = appts[choice - 1];
      await pool.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [appt.id]);
      reply = `تم إلغاء موعدك يوم ${new Date(appt.start_time).toLocaleDateString('ar-IQ')} ✅\nإذا تريد تحجز وقت جديد اكتب "حجز".`;
      await resetState(whatsapp_number);
      break;
    }

    default: {
      await resetState(whatsapp_number);
      reply = 'اكتب أي شي حتى نبدأ من جديد 🙂';
    }
  }

  await pool.query(
    `INSERT INTO whatsapp_messages (whatsapp_number, direction, message_text) VALUES ($1, 'outbound', $2)`,
    [whatsapp_number, reply]
  );

  return { reply };
}

async function handleCancelRequest(whatsapp_number) {
  const patient = await findPatient(whatsapp_number);
  if (!patient) {
    await resetState(whatsapp_number);
    return { reply: 'ما عدنا مواعيد مسجلة إلك حالياً.' };
  }
  const { rows } = await pool.query(
    `SELECT a.*, s.name_ar AS service_name FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     WHERE a.patient_id = $1 AND a.status IN ('pending','confirmed') AND a.start_time > now()
     ORDER BY a.start_time`,
    [patient.id]
  );
  if (!rows.length) {
    await resetState(whatsapp_number);
    return { reply: 'ما عدنا مواعيد قادمة مسجلة إلك حالياً.' };
  }
  await setState(whatsapp_number, 'awaiting_cancel_choice', { appointments: rows });
  const list = rows
    .map((a, i) => `${i + 1}. ${new Date(a.start_time).toLocaleDateString('ar-IQ')} الساعة ${new Date(a.start_time).toTimeString().slice(0, 5)} - ${a.service_name || ''}`)
    .join('\n');
  return { reply: `هذني مواعيدك القادمة، رد برقم الموعد اللي تريد تلغيه:\n\n${list}` };
}

module.exports = { handleIncomingMessage };
