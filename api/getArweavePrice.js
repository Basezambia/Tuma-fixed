// API endpoint to get current Arweave token price and calculate storage costs
const axios = require('axios');

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch Arweave token price from CoinGecko API
    const coinGeckoResponse = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd'
    );
    
    const arPrice = coinGeckoResponse.data?.arweave?.usd || 0.25; // Fallback price if API fails
    
    // Fetch current Arweave network info
    const arweaveNetworkResponse = await axios.get(
      'https://arweave.net/price/0'
    );
    
    // Base price per byte in Winston (1 AR = 1e12 Winston)
    const basePricePerByte = Number(arweaveNetworkResponse.data) || 1000000000000000; // Fallback base price
    
    // Calculate price per MB in AR
    const pricePerMBInWinston = basePricePerByte * 1024 * 1024;
    const pricePerMBInAR = pricePerMBInWinston / 1e12;
    
    // Calculate price per MB in USD
    const pricePerMBInUSD = pricePerMBInAR * arPrice;
    
    // Return the pricing information
    res.status(200).json({
      arPrice,
      pricePerMBInAR,
      pricePerMBInUSD,
      timestamp: Date.now(),
      networkFactor: 1.0 // Base network factor
    });
  } catch (error) {
    console.error('Error fetching Arweave pricing:', error);
    res.status(500).json({
      error: 'Failed to fetch Arweave pricing information',
      message: error.message || 'Unknown error'
    });
  }
};

// Apply CORS to our handler
module.exports = allowCors(handler);
// For backwards compatibility with ES modules
module.exports.default = allowCors(handler);
