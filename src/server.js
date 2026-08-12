require('dotenv').config();
const express = require('express');
const { captureRawBody } = require('./middleware/verifySignature');
const webhookRouter = require('./routes/webhook');
const dashboardRouter = require('./routes/dashboard');
const adminRouter = require('./routes/admin');
const demoRouter = require('./routes/demo');

// Only FB_VERIFY_TOKEN is needed to serve Meta's GET verify handshake,
// so that's the only thing fatal at boot. The others are needed once
// real POST events start arriving (signature check, moderation) but
// shouldn't block the server from coming up before they're set.
// Per-client credentials (Page/IG tokens) live in data/clients.json via
// the admin screen now, not env vars -- this app can serve many clients
// from one deployment, so there's no single PAGE_ACCESS_TOKEN anymore.
if (!process.env.FB_VERIFY_TOKEN) {
  console.error('Missing required environment variable: FB_VERIFY_TOKEN');
  process.exit(1);
}
const OPTIONAL_ENV = [
  'FB_APP_SECRET',
  'OPENAI_API_KEY',
  'DASHBOARD_USER',
  'DASHBOARD_PASSWORD',
];
const missingOptional = OPTIONAL_ENV.filter((key) => !process.env[key]);
if (missingOptional.length) {
  console.warn(
    `Warning: not set yet (POST /webhook handling will fail until they are): ${missingOptional.join(', ')}`
  );
}

const app = express();
app.use(express.json({ verify: captureRawBody }));

app.use('/webhook', webhookRouter);
app.use('/webhook', dashboardRouter);
app.use('/webhook', adminRouter);
// Public, unauthenticated -- the sandbox demo prospective clients see
// before they've handed over any Facebook/Instagram access.
app.use(demoRouter);

app.get('/health', (_req, res) => res.sendStatus(200));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
