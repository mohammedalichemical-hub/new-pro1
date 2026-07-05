const { pool } = require('./db');

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function getAvailableSlots(doctorId, date) {
  const { rows: docRows } = await pool.query('SELECT * FROM doctors WHERE id = $1', [doctorId]);
  const doctor = docRows[0];
  if (!doctor) return [];

  const dayIndex = new Date(date + 'T00:00:00+03:00').getDay();
  const hours = doctor.working_hours[DAY_KEYS[dayIndex]];
  if (!hours) return [];

  const [startStr, endStr] = hours;
  const slotLen = doctor.slot_duration_minutes;
  const startMin = toMinutes(startStr);
  const endMin = toMinutes(endStr);

  const { rows: booked } = await pool.query(
    `SELECT start_time, end_time FROM appointments
     WHERE doctor_id = $1 AND status NOT IN ('cancelled','no_show')
       AND start_time::date = $2::date`,
    [doctorId, date]
  );
  const bookedRanges = booked.map((b) => ({
    start: new Date(b.start_time).getTime(),
    end: new Date(b.end_time).getTime(),
  }));

  const slots = [];
  for (let m = startMin; m + slotLen <= endMin; m += slotLen) {
    const slotStart = new Date(`${date}T00:00:00+03:00`);
    slotStart.setMinutes(m);
    const slotEnd = new Date(slotStart.getTime() + slotLen * 60000);
    const overlaps = bookedRanges.some((r) => slotStart.getTime() < r.end && slotEnd.getTime() > r.start);
    const isPast = slotStart.getTime() < Date.now();
    if (!overlaps && !isPast) {
      slots.push({ start_time: slotStart.toISOString(), end_time: slotEnd.toISOString(), label: slotStart.toTimeString().slice(0, 5) });
    }
  }
  return slots;
}

module.exports = { getAvailableSlots };
