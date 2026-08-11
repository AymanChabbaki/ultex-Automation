const crypto = require('crypto');

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Protects the dashboard with HTTP Basic Auth. Fails closed: if
 * DASHBOARD_USER/DASHBOARD_PASSWORD aren't configured, the dashboard is
 * unreachable rather than silently public, since it shows real
 * commenters' text.
 */
function basicAuth(req, res, next) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;

  if (!user || !pass) {
    return res.status(503).send('Dashboard not configured: set DASHBOARD_USER and DASHBOARD_PASSWORD.');
  }

  const header = req.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    const [reqUser, reqPass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    if (
      reqUser &&
      reqPass &&
      timingSafeStringEqual(reqUser, user) &&
      timingSafeStringEqual(reqPass, pass)
    ) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Dashboard"');
  res.sendStatus(401);
}

module.exports = { basicAuth };
