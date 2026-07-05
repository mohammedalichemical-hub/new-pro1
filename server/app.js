const express = require('express');
const cors = require('cors');

const patientsRoutes = require('./routes/patients.routes');
const servicesRoutes = require('./routes/services.routes');
const appointmentsRoutes = require('./routes/appointments.routes');
const doctorsRoutes = require('./routes/doctors.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const authRoutes = require('./routes/auth.routes');
const { requireAuth } = require('./auth');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dental-booking-api', build: '2026-07-04' });
});

app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);

app.use('/api/patients', requireAuth, patientsRoutes);
app.use('/api/services', requireAuth, servicesRoutes);
app.use('/api/appointments', requireAuth, appointmentsRoutes);
app.use('/api/doctors', requireAuth, doctorsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
});

module.exports = app;
