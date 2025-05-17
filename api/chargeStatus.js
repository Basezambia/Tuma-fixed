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
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || 'Failed to get charge status' });
    }
    const timeline = data.data.timeline || [];
    const statusName = timeline.length > 0 ? timeline[timeline.length - 1].status : data.data.status;
    return res.status(200).json({ statusName });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = allowCors(handler);
