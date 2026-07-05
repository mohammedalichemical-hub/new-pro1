const { pool } = require('./db');

const GREEN_API_ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;

async function sendWhatsappMessage(whatsapp_number, message) {
  const url = `https://api.green-api.com/waInstance${GREEN_API_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: `${whatsapp_number}@c.us`, message }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Green API error ${res.status}: ${body}`);
  }
  await pool.query(
    `INSERT INTO whatsapp_messages (whatsapp_number, direction, message_text) VALUES ($1, 'outbound', $2)`,
    [whatsapp_number, message]
  );
}

async function sendDueReminders() {
  // مواعيد تبدأ خلال الـ 23-25 ساعة الجاية ولسا ما انبعتلها تذكير
  const { rows } = await pool.query(`
    SELECT a.id, a.start_time, p.whatsapp_number, p.full_name, s.name_ar AS service_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.status = 'confirmed'
      AND a.reminder_sent_at IS NULL
      AND a.start_time BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
  `);

  for (const appt of rows) {
    const time = new Date(appt.start_time).toTimeString().slice(0, 5);
    const date = new Date(appt.start_time).toLocaleDateString('ar-IQ');
    const message = `تذكير بموعدك بعيادتنا 🦷\nيوم ${date} الساعة ${time}\n${appt.service_name ? 'الخدمة: ' + appt.service_name : ''}\n\nإذا تحب تلغي أو تعدل الموعد، اكتب "الغاء" بهذا الرقم.`;
    try {
      await sendWhatsappMessage(appt.whatsapp_number, message);
      await pool.query(`UPDATE appointments SET reminder_sent_at = now() WHERE id = $1`, [appt.id]);
      console.log(`[scheduler] reminder sent to ${appt.whatsapp_number} for appointment ${appt.id}`);
    } catch (err) {
      console.error(`[scheduler] failed to send reminder for appointment ${appt.id}:`, err.message);
    }
  }
}

function startScheduler() {
  // فحص كل ساعة
  const ONE_HOUR = 60 * 60 * 1000;
  sendDueReminders().catch((e) => console.error('[scheduler] initial run failed:', e.message));
  setInterval(() => {
    sendDueReminders().catch((e) => console.error('[scheduler] run failed:', e.message));
  }, ONE_HOUR);
  console.log('[scheduler] appointment reminder scheduler started (checks every hour)');
}

module.exports = { startScheduler, sendDueReminders };
