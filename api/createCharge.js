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
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON in request body'));
        }
      });
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
    // Parse request body
    const body = await parseRequestBody(req);
    
    // Extract required fields
    const { 
      amount, 
      currency = 'USD',
      name = 'Tuma File Transfer',
      description = 'File transfer service',
      metadata = {}
    } = body;

    // Validate required fields
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount',
        message: 'A valid payment amount is required'
      });
    }

    // Get API key from environment variables
    const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
    if (!apiKey) {
      console.error('Missing Coinbase Commerce API key in environment variables');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
        message: 'Payment service is not properly configured'
      });
    }

    // Prepare the request to Coinbase Commerce API
    const payload = {
      name,
      description,
      pricing_type: 'fixed_price',
      local_price: {
        amount: amount.toString(),
        currency: currency.toUpperCase()
      },
      metadata: {
        ...metadata,
        service: 'tuma-file-transfer'
      }
    };

    console.log('Creating charge with payload:', JSON.stringify(payload, null, 2));

    // Make request to Coinbase Commerce API
    const response = await fetch('https://api.commerce.coinbase.com/charges', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': apiKey,
        'X-CC-Version': '2018-03-22'
      },
      body: JSON.stringify(payload)
    });

    // Handle response
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to create charge:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      
      return res.status(response.status).json({
        success: false,
        error: 'Payment processing failed',
        message: errorData.message || 'Failed to process payment',
        details: errorData
      });
    }

    const data = await response.json();
    
    // Return the charge information
    return res.status(200).json({
      success: true,
      data: data.data
    });

  } catch (error) {
    console.error('Error in createCharge:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Export the CORS-wrapped handler
module.exports = allowCors(handler);
