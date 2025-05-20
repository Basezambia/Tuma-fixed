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

    console.log('Environment variables available:', Object.keys(process.env).filter(key => key.includes('COINBASE') || key.includes('VITE')));
    
    if (!apiKey) {
      console.error('Missing Coinbase Commerce API key in environment variables');
      return res.status(500).json({ error: 'Server configuration error: Missing API key' });
    }
    
    console.log('API Key available (first 4 chars):', apiKey.substring(0, 4) + '...');

    // Validate request body
    const { amount, currency = 'USD', name = 'Document Payment', description = 'Payment for document upload', metadata = {} } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Missing required parameter: amount' });
    }

    // Prepare request payload
    const payload = {
      name,
      description,
      pricing_type: 'fixed_price',
      local_price: { amount: amount.toString(), currency },
      metadata
    };

    // Log the request payload for debugging (excluding sensitive data)
    console.log('Making request to Coinbase Commerce API with payload:', {
      ...payload,
      metadata: { ...payload.metadata, sender: '[REDACTED]', recipient: '[REDACTED]' }
    });
    
    // Make request to Coinbase Commerce API
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Api-Key': apiKey,
          'X-CC-Version': '2018-03-22',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Network error when calling Coinbase Commerce API:', err);
      return res.status(503).json({ 
        error: 'Service Unavailable', 
        message: 'Unable to connect to payment service. Please try again later.' 
      });
    }

    // Parse response
    let data;
    try {
      data = await response.json();
    } catch (err) {
      console.error('Failed to parse Coinbase Commerce API response:', err);
      const responseText = await response.text().catch(() => 'Could not read response text');
      console.error('Raw response:', responseText);
      return res.status(502).json({ error: 'Invalid response from payment service' });
    }

    // Handle response based on status
    if (response.status === 201 || response.status === 200) {
      console.log('Charge created successfully:', {
        id: data.data.id,
        status: data.data.status,
        timeline: data.data.timeline
      });
      return res.status(201).json({ id: data.data.id, hosted_url: data.data.hosted_url });
    } else {
      console.error('Coinbase Commerce API error:', {
        status: response.status,
        statusText: response.statusText,
        data: JSON.stringify(data, null, 2)
      });
      
      // Provide more detailed error information
      return res.status(response.status).json({ 
        error: data.error?.message || 'Coinbase Commerce API error',
        details: data.error?.type || response.statusText,
        code: response.status
      });
    }

  } catch (error) {
    console.error('Charge creation error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
};

// Apply CORS to our handler
module.exports = allowCors(handler);
// For backwards compatibility with ES modules
module.exports.default = allowCors(handler);
