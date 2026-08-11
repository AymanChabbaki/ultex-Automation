require('dotenv').config();
const express = require('express');
const { captureRawBody } = require('./middleware/verifySignature');
const webhookRouter = require('./routes/webhook');

const REQUIRED_ENV = [
  'FB_VERIFY_TOKEN',
  'FB_APP_SECRET',
  'PAGE_ACCESS_TOKEN',
  'OPENAI_API_KEY',
];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const app = express();
app.use(express.json({ verify: captureRawBody }));

app.use('/webhook', webhookRouter);

app.get('/health', (_req, res) => res.sendStatus(200));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
