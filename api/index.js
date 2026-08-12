// Vercel serverless entry point. Files under /api become functions;
// this one just hands every request to the same Express app used by
// the traditional server (src/server.js) -- no app.listen() here,
// Vercel invokes this as (req, res) per request instead.
module.exports = require('../src/app');
