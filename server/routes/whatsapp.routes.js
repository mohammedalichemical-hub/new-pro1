const express = require('express');
const { handleIncomingMessage } = require('../whatsapp-bot');

const router = express.Router();

const API_KEY = process.env.WHATSAPP_API_KEY;

function requireWhatsappAuth(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  next();
}

// POST /api/whatsapp/incoming { whatsapp_number, text } -> { reply }
// هذا الـ endpoint الوحيد اللي يحتاج يستدعيه n8n لكل رسالة واردة
router.post('/incoming', requireWhatsappAuth, async (req, res) => {
  try {
    const { whatsapp_number, text } = req.body;
    if (!whatsapp_number) {
      return res.status(400).json({ error: 'whatsapp_number is required' });
    }
    const result = await handleIncomingMessage(whatsapp_number, text || '');
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', reply: 'صار خطأ تقني، حاول مرة ثانية بعد شوي.' });
  }
});

module.exports = router;
