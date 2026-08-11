const crypto = require('crypto');

/**
 * Express raw-body capture, used by json() so we can HMAC-verify the
 * exact bytes Meta signed (a re-serialized JSON object won't match).
 */
function captureRawBody(req, _res, buf) {
  req.rawBody = buf;
}

/**
 * Rejects webhook POSTs that aren't signed by Meta with FB_APP_SECRET.
 * Without this, anyone who finds the endpoint URL could POST a forged
 * payload and trigger comment deletions.
 */
function verifySignature(req, res, next) {
  const signature = req.get('x-hub-signature-256');
  const appSecret = process.env.FB_APP_SECRET;
  console.log(`Webhook POST received (signature header present: ${!!signature})`);

  if (!signature || !appSecret) {
    console.warn('Rejecting webhook POST: missing x-hub-signature-256 header or FB_APP_SECRET is unset');
    return res.sendStatus(401);
  }

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.warn('Rejecting webhook POST: signature mismatch (check FB_APP_SECRET matches App Dashboard > Settings > Basic)');
    return res.sendStatus(401);
  }

  next();
}

module.exports = { captureRawBody, verifySignature };
