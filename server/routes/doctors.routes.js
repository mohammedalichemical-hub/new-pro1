const express = require('express');
const { pool } = require('../db');
const { getAvailableSlots } = require('../slots');

const router = express.Router();

// GET /api/doctors -> قائمة الأطباء (لعرضهم بالبوت عند وجود أكثر من طبيب)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, full_name, specialty FROM doctors WHERE is_active = true ORDER BY full_name'
    );
    res.json({ doctors: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/doctors/:doctorId/available-slots?date=YYYY-MM-DD
router.get('/:doctorId/available-slots', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

    const { rows: docRows } = await pool.query(
      'SELECT id, full_name FROM doctors WHERE id = $1 AND is_active = true',
      [doctorId]
    );
    if (!docRows.length) return res.status(404).json({ error: 'doctor_not_found' });

    const slots = await getAvailableSlots(doctorId, date);
    res.json({ doctor: docRows[0].full_name, date, slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
