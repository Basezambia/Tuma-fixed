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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    // Ensure COINBASE_COMMERCE_API_KEY is set
    const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY ?? '';
    const COINBASE_COMMERCE_API_URL = 'https://api.commerce.coinbase.com/charges';

    if (!COINBASE_COMMERCE_API_KEY) {
      console.error('Coinbase Commerce API key not configured');
      return res.status(500).json({ error: 'Coinbase Commerce API key not configured' });
    }

    const response = await fetch(COINBASE_COMMERCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22',
      },
      body: JSON.stringify(req.body),
    });
    const data = /** @type {any} */ (await response.json());
    if (response.status === 201) {
      res.status(201).json(data);
    } else {
      res.status(response.status).json({ error: data?.error || 'Coinbase Commerce API error' });
    }
  } catch (error) {
    console.error('Charge error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    });
  }
}
