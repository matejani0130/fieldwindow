const mcp = require('./mcp');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const plan = await mcp._private.planByPlace({
      place: req.query?.place || 'Szekszard, Hungary',
      preset: req.query?.preset || 'demo_mapping',
      forecast_days: Number(req.query?.days || 2)
    });
    return res.status(200).json({
      service: 'FieldWindow',
      demo: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'local',
      ...plan
    });
  } catch (e) {
    return res.status(400).json({
      service: 'FieldWindow',
      demo: true,
      error: e.message || String(e)
    });
  }
};
