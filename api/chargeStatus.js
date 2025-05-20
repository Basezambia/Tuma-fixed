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

// Helper function to ensure JSON response
const jsonResponse = (res, status, data) => {
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).json(data);
};

const handler = async (req, res) => {
  // Set response content type to JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    // Validate HTTP method
    if (req.method !== "GET") {
      return jsonResponse(res, 405, { 
        error: "Method not allowed",
        message: "Only GET method is supported"
      });
    }

    const { chargeId } = req.query;
    // Try multiple possible environment variable names for the API key
    const apiKey = process.env.COINBASE_COMMERCE_API_KEY || process.env.VITE_COINBASE_COMMERCE_API_KEY;

    // Validate chargeId parameter
    if (!chargeId) {
      return jsonResponse(res, 400, { 
        error: "Validation Error",
        message: "Missing required parameter: chargeId"
      });
    }

    // Validate API key
    if (!apiKey) {
      console.error('Missing Coinbase Commerce API key in environment variables');
      return jsonResponse(res, 500, { 
        error: "Configuration Error",
        message: "Server configuration error. Please contact support."
      });
    }

    // Make request to Coinbase Commerce API
    let response;
    try {
      response = await fetch(`https://api.commerce.coinbase.com/charges/${chargeId}`, {
        method: "GET",
        headers: {
          "X-CC-Api-Key": apiKey,
          "X-CC-Version": "2018-03-22",
          "Accept": "application/json",
        },
      });
    } catch (err) {
      console.error('Network error when calling Coinbase Commerce API:', err);
      return jsonResponse(res, 503, {
        error: "Service Unavailable",
        message: "Unable to connect to payment service. Please try again later."
      });
    }

    // Parse response
    let responseData;
    try {
      responseData = await response.json();
    } catch (err) {
      console.error('Failed to parse Coinbase Commerce API response:', err);
      return jsonResponse(res, 502, {
        error: "Bad Gateway",
        message: "Received invalid response from payment service"
      });
    }

    // Handle non-OK responses
    if (!response.ok) {
      console.error('Coinbase Commerce API error:', {
        status: response.status,
        statusText: response.statusText,
        data: responseData
      });
      
      return jsonResponse(res, response.status, {
        error: responseData.error || "Payment Service Error",
        message: responseData.message || "Failed to get charge status"
      });
    }

    // Process successful response
    const timeline = responseData.data?.timeline || [];
    const statusName = timeline.length > 0 
      ? timeline[timeline.length - 1].status 
      : (responseData.data?.status || "pending");

    return jsonResponse(res, 200, {
      statusName,
      timeline,
      data: responseData.data || {}
    });

  } catch (err) {
    // Catch any unexpected errors
    console.error('Unexpected error in chargeStatus endpoint:', err);
    return jsonResponse(res, 500, {
      error: "Internal Server Error",
      message: "An unexpected error occurred. Please try again later.",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Apply CORS to our handler
module.exports = allowCors(handler);
// For backwards compatibility with ES modules
module.exports.default = allowCors(handler);
