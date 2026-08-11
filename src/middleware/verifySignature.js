const crypto = require('crypto');

/**
 * Express raw-body capture, used by json() so we can HMAC-verify the
 * exact bytes Meta signed (a re-serialized JSON object won't match).
 */
function captureRawBody(req, _res, buf) {
  req.rawBody = buf;
}

function matchesSignature(signature, secret, rawBody) {
  if (!secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Rejects webhook POSTs that aren't signed by Meta. Checks against
 * FB_APP_SECRET (the main app, used for Facebook Page events) and, if
 * set, IG_APP_SECRET -- Instagram comment webhooks configured through
 * the separate "Instagram API with Instagram Login" product are signed
 * with that product's own distinct app secret, not the main app's.
 * Without this check, anyone who finds the endpoint URL could POST a
 * forged payload and trigger comment deletions.
 */
function verifySignature(req, res, next) {
  const signature = req.get('x-hub-signature-256');
  console.log(`Webhook POST received (signature header present: ${!!signature})`);

  if (!signature) {
    console.warn('Rejecting webhook POST: missing x-hub-signature-256 header');
    return res.sendStatus(401);
  }

  const secrets = [process.env.FB_APP_SECRET, process.env.IG_APP_SECRET];
  const matched = secrets.some((secret) => matchesSignature(signature, secret, req.rawBody));

  if (!matched) {
    console.warn('Rejecting webhook POST: signature did not match FB_APP_SECRET or IG_APP_SECRET');
    return res.sendStatus(401);
  }

  next();
}

module.exports = { captureRawBody, verifySignature };
