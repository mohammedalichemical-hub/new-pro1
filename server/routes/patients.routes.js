const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/patients?search=... -> قائمة كل المرضى (للوحة التحكم)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM patients WHERE is_active = true';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (full_name ILIKE $${params.length} OR whatsapp_number ILIKE $${params.length})`;
    }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const { rows } = await pool.query(query, params);
    res.json({ patients: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// تطبيع رقم الواتساب (Green API يرسله مثل 9647701234567@c.us)
function normalizeNumber(raw) {
  return String(raw).replace(/[^0-9]/g, '');
}

// GET /api/patients/by-phone/:whatsapp -> يرجع المريض إذا موجود، أو 404
router.get('/by-phone/:whatsapp', async (req, res) => {
  try {
    const number = normalizeNumber(req.params.whatsapp);
    const { rows } = await pool.query(
      'SELECT * FROM patients WHERE whatsapp_number = $1 AND is_active = true',
      [number]
    );
    if (!rows.length) return res.status(404).json({ found: false });
    res.json({ found: true, patient: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/patients -> إنشاء مريض جديد { full_name, whatsapp_number, phone? }
router.post('/', async (req, res) => {
  try {
    const { full_name, whatsapp_number, phone, birth_date, notes } = req.body;
    if (!full_name || !whatsapp_number) {
      return res.status(400).json({ error: 'full_name and whatsapp_number are required' });
    }
    const number = normalizeNumber(whatsapp_number);
    const { rows } = await pool.query(
      `INSERT INTO patients (full_name, whatsapp_number, phone, birth_date, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (whatsapp_number) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING *`,
      [full_name, number, phone || null, birth_date || null, notes || null]
    );
    res.status(201).json({ patient: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
