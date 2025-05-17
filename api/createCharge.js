const fetch = require('node-fetch');

// Enable CORS
const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  return await fn(req, res);
};

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
    const COINBASE_COMMERCE_API_URL = 'https://api.commerce.coinbase.com/charges';
    const response = await fetch(COINBASE_COMMERCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    if (response.status === 201) {
      res.status(201).json(data);
    } else {
      res.status(response.status).json({ error: data.error || 'Coinbase Commerce API error' });
    }
  } catch (error) {
    console.error('Charge error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = allowCors(handler);
