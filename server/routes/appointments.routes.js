const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/appointments?date=YYYY-MM-DD -> مواعيد يوم معين (افتراضياً اليوم)، أو كل المواعيد القادمة إذا date=all
// GET /api/appointments?date=all&page=1&limit=50 -> مع pagination
router.get('/', async (req, res) => {
  try {
    const { date, page, limit } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const offset = (pageNum - 1) * pageLimit;

    let query = `
      SELECT a.*, p.full_name AS patient_name, p.whatsapp_number, d.full_name AS doctor_name, s.name_ar AS service_name
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.status NOT IN ('cancelled')
    `;
    let countQuery = `
      SELECT COUNT(*) FROM appointments a
      WHERE a.status NOT IN ('cancelled')
    `;
    const params = [];
    const countParams = [];
    if (date === 'all') {
      query += ' AND a.start_time >= now()';
      countQuery += ' AND a.start_time >= now()';
    } else {
      params.push(date || new Date().toISOString().slice(0, 10));
      countParams.push(date || new Date().toISOString().slice(0, 10));
      query += ` AND a.start_time::date = $${params.length}::date`;
      countQuery += ` AND a.start_time::date = $${countParams.length}::date`;
    }
    query += ' ORDER BY a.start_time LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(pageLimit, offset);

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);
    res.json({
      appointments: dataResult.rows,
      pagination: {
        page: pageNum,
        limit: pageLimit,
        total: parseInt(countResult.rows[0].count, 10),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/appointments -> إنشاء حجز
// body: { patient_id, doctor_id, service_id?, start_time, end_time, source }
router.post('/', async (req, res) => {
  try {
    const { patient_id, doctor_id, service_id, start_time, end_time, source, notes } = req.body;
    if (!patient_id || !doctor_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'patient_id, doctor_id, start_time, end_time are required' });
    }
    if (new Date(start_time) >= new Date(end_time)) {
      return res.status(400).json({ error: 'start_time must be before end_time' });
    }

    const { rows } = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, service_id, start_time, end_time, status, source, notes)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7)
       RETURNING *`,
      [patient_id, doctor_id, service_id || null, start_time, end_time, source || 'manual', notes || null]
    );

    res.status(201).json({ appointment: rows[0] });
  } catch (err) {
    // 23P01 = exclusion constraint violation (تعارض وقت)
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'slot_already_booked' });
    }
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/appointments/:id/cancel
router.post('/:id/cancel', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE appointments SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ appointment: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/appointments/patient/:patientId -> مواعيد مريض معين (لعرضها بالبوت عند طلب إلغاء/تأجيل)
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, d.full_name AS doctor_name, s.name_ar AS service_name
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       LEFT JOIN services s ON s.id = a.service_id
       WHERE a.patient_id = $1 AND a.status IN ('pending','confirmed')
       ORDER BY a.start_time`,
      [req.params.patientId]
    );
    res.json({ appointments: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
