require('dotenv').config();
const app = require('./app');

// Only FB_VERIFY_TOKEN and DATABASE_URL are fatal at boot -- everything
// else (signature check, moderation, per-client tokens) is needed once
// real traffic arrives but shouldn't block the server from coming up.
// This check only runs for this traditional entrypoint (Docker/VPS);
// the Vercel entry point (api/index.js) skips it since a serverless
// function can't process.exit -- misconfiguration there just shows up
// as failed requests instead, visible in Vercel's logs.
const REQUIRED_ENV = ['FB_VERIFY_TOKEN', 'DATABASE_URL'];
const missingRequired = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingRequired.length) {
  console.error(`Missing required environment variable(s): ${missingRequired.join(', ')}`);
  process.exit(1);
}

const OPTIONAL_ENV = ['FB_APP_SECRET', 'OPENAI_API_KEY', 'DASHBOARD_USER', 'DASHBOARD_PASSWORD'];
const missingOptional = OPTIONAL_ENV.filter((key) => !process.env[key]);
if (missingOptional.length) {
  console.warn(
    `Warning: not set yet (POST /webhook handling will fail until they are): ${missingOptional.join(', ')}`
  );
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
