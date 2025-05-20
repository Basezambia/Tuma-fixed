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

// Helper function to parse request body
async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (typeof req.body === 'string') {
        try {
          resolve(JSON.parse(req.body));
        } catch (e) {
          reject(new Error('Invalid JSON in request body'));
        }
      } else if (typeof req.body === 'object') {
        resolve(req.body);
      } else {
        reject(new Error('Unexpected request body format'));
      }
    } else {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON in request body'));
        }
      });
      req.on('error', reject);
    }
  });
}

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed',
      message: 'Only POST requests are allowed'
    });
  }

  try {
    // Try multiple possible environment variable names for the API key
    const apiKey = process.env.COINBASE_COMMERCE_API_KEY || process.env.VITE_COINBASE_COMMERCE_API_KEY;
    const apiUrl = 'https://api.commerce.coinbase.com/charges';

    if (!apiKey) {
      console.error('Missing Coinbase Commerce API key in environment variables');
      return res.status(500).json({ 
        success: false,
        error: 'Server configuration error',
        message: 'Missing Coinbase Commerce API key in environment variables',
        details: 'Please configure COINBASE_COMMERCE_API_KEY in your environment variables'
      });
    }

    // Parse request body
    let body;
    try {
      body = await parseRequestBody(req);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Could not parse request body',
        details: e.message
      });
    }

    // Validate request body
    const { amount, currency = 'USD', name = 'Document Payment', description = 'Payment for document upload', metadata = {} } = body;

    if (typeof amount === 'undefined' || amount === null || amount === '') {
      return res.status(400).json({ 
        success: false,
        error: 'Validation error',
        message: 'Missing required parameter: amount',
        details: 'Please provide a valid amount for the charge'
      });
    }

    // Prepare request payload
    const payload = {
      name,
      description,
      pricing_type: 'fixed_price',
      local_price: { 
        amount: parseFloat(amount).toFixed(2), 
        currency 
      },
      metadata: {
        ...metadata,
        service: 'tuma-file-upload',
        timestamp: new Date().toISOString()
      }
    };

    console.log('Creating charge with payload:', JSON.stringify(payload, null, 2));

    // Make request to Coinbase Commerce API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': apiKey,
        'X-CC-Version': '2018-03-22'
      },
      body: JSON.stringify(payload)
    });

    let responseData;
    try {
      responseData = await response.text();
      responseData = responseData ? JSON.parse(responseData) : {};
    } catch (e) {
      console.error('Failed to parse response:', responseData);
      return res.status(500).json({
        success: false,
        error: 'Invalid response',
        message: 'Failed to parse response from Coinbase Commerce API',
        details: responseData || 'No response data'
      });
    }

    if (!response.ok) {
      console.error('Coinbase Commerce API error:', responseData);
      return res.status(response.status).json({
        success: false,
        error: responseData.error?.type || 'API Error',
        message: responseData.error?.message || 'Failed to create charge',
        details: responseData.error || 'Unknown error occurred'
      });
    }

    console.log('Successfully created charge:', responseData.data?.id);
    
    // Return success response
    return res.status(200).json({
      success: true,
      data: responseData.data
    });

  } catch (error) {
    console.error('Charge creation error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      details: error.message || 'No additional error details available'
    });
  }
};

// Apply CORS to our handler
module.exports = allowCors(handler);
// For backwards compatibility with ES modules
module.exports.default = allowCors(handler);
