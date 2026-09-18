module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    status: 'ok',
    service: 'FieldWindow',
    version: '0.2.0',
    mcpProtocol: '2025-11-25',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'local'
  });
};
