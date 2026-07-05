const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/services -> قائمة الخدمات المتاحة (لعرضها بالبوت)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name_ar, name_en, price, duration_minutes FROM services WHERE is_active = true ORDER BY name_ar'
    );
    res.json({ services: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
