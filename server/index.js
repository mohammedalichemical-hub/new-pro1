require('dotenv').config();
const app = require('./app');
const { startScheduler } = require('./scheduler');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`[server] dental-booking-api listening on port ${PORT}`);
  startScheduler();
});
