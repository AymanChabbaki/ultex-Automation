require('dotenv').config();
const express = require('express');
const { captureRawBody } = require('./middleware/verifySignature');
const webhookRouter = require('./routes/webhook');

// Only FB_VERIFY_TOKEN is needed to serve Meta's GET verify handshake,
// so that's the only thing fatal at boot. The others are needed once
// real POST events start arriving (signature check, moderation, delete)
// but shouldn't block the server from coming up before they're set.
if (!process.env.FB_VERIFY_TOKEN) {
  console.error('Missing required environment variable: FB_VERIFY_TOKEN');
  process.exit(1);
}
const OPTIONAL_ENV = ['FB_APP_SECRET', 'PAGE_ACCESS_TOKEN', 'OPENAI_API_KEY'];
const missingOptional = OPTIONAL_ENV.filter((key) => !process.env[key]);
if (missingOptional.length) {
  console.warn(
    `Warning: not set yet (POST /webhook handling will fail until they are): ${missingOptional.join(', ')}`
  );
}

const app = express();
app.use(express.json({ verify: captureRawBody }));

app.use('/webhook', webhookRouter);

app.get('/health', (_req, res) => res.sendStatus(200));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
