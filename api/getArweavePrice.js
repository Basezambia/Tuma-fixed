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
    
    const arPrice = coinGeckoResponse.data?.arweave?.usd || 6.47; // Updated fallback price
    
    // Use the CORRECT Arweave API endpoint for real-time pricing
    // Get price for 1MB (1024*1024 bytes) directly from network
    const oneMBInBytes = 1024 * 1024;
    const arweaveNetworkResponse = await axios.get(
      `https://arweave.net/price/${oneMBInBytes}`
    );
    
    // This returns Winston for 1MB directly
    const pricePerMBInWinston = Number(arweaveNetworkResponse.data);
    const pricePerMBInAR = pricePerMBInWinston / 1e12;
    
    // Calculate price per MB in USD
    const pricePerMBInUSD = pricePerMBInAR * arPrice;
    
    // Return the pricing information
    res.status(200).json({
      arPrice,
      pricePerMBInAR,
      pricePerMBInUSD,
      pricePerMBInWinston, // Add this for debugging
      timestamp: Date.now(),
      networkFactor: 1.0 // Base network factor
    });
  } catch (error) {
    console.error('Error fetching Arweave pricing:', error);
    
    // Provide realistic fallback values based on current network rates
    const fallbackArPrice = 6.47;
    const fallbackPricePerMBInWinston = 2370510319; // Current real rate
    const fallbackPricePerMBInAR = fallbackPricePerMBInWinston / 1e12;
    const fallbackPricePerMBInUSD = fallbackPricePerMBInAR * fallbackArPrice;
    
    res.status(200).json({
      arPrice: fallbackArPrice,
      pricePerMBInAR: fallbackPricePerMBInAR,
      pricePerMBInUSD: fallbackPricePerMBInUSD,
      pricePerMBInWinston: fallbackPricePerMBInWinston,
      timestamp: Date.now(),
      networkFactor: 1.0,
      fallback: true // Indicate this is fallback data
    });
  }
};

// Apply CORS to our handler
module.exports = allowCors(handler);
// For backwards compatibility with ES modules
module.exports.default = allowCors(handler);