// Use CommonJS require for better compatibility with serverless environments
const fetch = require('node-fetch');

// Enable CORS for all routes
const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  
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
    // Try multiple possible environment variable names for the API key
    const apiKey = process.env.COINBASE_COMMERCE_API_KEY || process.env.VITE_COINBASE_COMMERCE_API_KEY;
    const apiUrl = 'https://api.commerce.coinbase.com/charges';

    if (!apiKey) {
      console.error('Missing Coinbase Commerce API key in environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error: Missing API key',
        details: 'Please configure COINBASE_COMMERCE_API_KEY in environment variables'
      });
    }

    // Validate request body
    const { amount, currency = 'USD', name = 'Document Payment', description = 'Payment for document upload', metadata = {} } = req.body;

    if (!amount) {
      return res.status(400).json({ 
        error: 'Missing required parameter: amount',
        details: 'Please provide a valid amount for the charge'
      });
    }

    // Prepare request payload
    const payload = {
      name,
      description,
      pricing_type: 'fixed_price',
      local_price: { amount: amount.toString(), currency },
      metadata
    };

    // Make request to Coinbase Commerce API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        console.error('Coinbase Commerce API error:', errorData);
        return res.status(response.status).json({ 
          error: errorData.message || 'Failed to create charge',
          details: errorData.details || errorData.error || 'Please check your API key and try again'
        });
      } catch (parseError) {
        console.error('Failed to parse error response:', parseError);
        return res.status(response.status).json({ 
          error: 'Invalid response from Coinbase Commerce API',
          details: 'Please check your API key and try again'
        });
      }
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Charge creation error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: 'Please check your internet connection and try again'
    });
  }
};

// Apply CORS to our handler
module.exports = allowCors(handler);
// For backwards compatibility with ES modules
module.exports.default = allowCors(handler);
