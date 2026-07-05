const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const JWT_SECRET = process.env.SESSION_SECRET;
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || '12h';

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[auth] FATAL: SESSION_SECRET must be set in production');
    process.exit(1);
  }
  console.warn('[auth] WARNING: SESSION_SECRET not set, using insecure default for development only');
}
const _JWT_SECRET = JWT_SECRET || 'dev_secret_do_not_use_in_production';

async function login(username, password) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND is_active = true',
    [username]
  );
  const user = rows[0];
  if (!user) return { error: 'invalid_credentials' };

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return { error: 'invalid_credentials' };

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    _JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN }
  );

  return {
    token,
    user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, _JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// middleware يحمي أي راوت يحتاج تسجيل دخول
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid_or_expired_token' });

  req.user = payload;
  next();
}

module.exports = { login, verifyToken, requireAuth };
