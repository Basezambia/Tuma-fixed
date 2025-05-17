// /api/chargeStatus.js (Vercel Serverless Function)
// @ts-check
/**
 * @typedef {import('@vercel/node').VercelRequest} VercelRequest
 * @typedef {import('@vercel/node').VercelResponse} VercelResponse
 */

// Dynamic import for node-fetch with proper typing
/**
 * @typedef {import('node-fetch').RequestInfo} RequestInfo
 * @typedef {import('node-fetch').RequestInit} RequestInit
 * @typedef {import('node-fetch').Response} Response
 */

/**
 * @param {RequestInfo} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
const fetch = async (url, options) => {
  const { default: fetchFn } = await import('node-fetch');
  return fetchFn(url, options);
};

/**
 * @param {VercelRequest} req
 * @param {VercelResponse} res
 */
module.exports = async (req, res) => {
  const { chargeId } = req.query;
  const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!chargeId || !apiKey) {
    return res.status(400).json({ error: 'Missing chargeId or API key' });
  }
  try {
    const response = await fetch(`https://api.commerce.coinbase.com/charges/${chargeId}`, {
      headers: {
        'X-CC-Api-Key': apiKey,
        'X-CC-Version': '2018-03-22',
        'Content-Type': 'application/json',
      },
    });
    const data = /** @type {any} */ (await response.json());
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error || 'Failed to get charge status' });
    }
    const timeline = data?.data?.timeline || [];
    const statusName = timeline.length > 0 ? timeline[timeline.length - 1].status : data?.data?.status;
    return res.status(200).json({ statusName });
  } catch (err) {
    console.error('Error in chargeStatus:', err);
    return res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Internal server error' 
    });
  }
}
