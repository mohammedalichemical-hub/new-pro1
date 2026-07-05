const express = require('express');
const { login } = require('../auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const result = await login(username, password);
  if (result.error) {
    return res.status(401).json({ error: result.error });
  }
  res.json(result);
});

module.exports = router;
