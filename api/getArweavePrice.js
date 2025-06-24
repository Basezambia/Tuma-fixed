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
    // Use the Arweave API endpoint for real-time storage pricing only
    // Get price for 1MB (1024*1024 bytes) directly from network
    const oneMBInBytes = 1024 * 1024;
    const arweaveNetworkResponse = await axios.get(
      `https://arweave.net/price/${oneMBInBytes}`
    );
    
    // This returns Winston for 1MB directly
    const pricePerMBInWinston = Number(arweaveNetworkResponse.data);
    const pricePerMBInAR = pricePerMBInWinston / 1e12;
    
    // Use a fixed AR to USD conversion rate for storage cost calculation
    // This focuses on storage costs rather than token speculation
    const fixedArToUsdRate = 6.50; // Fixed rate for storage cost calculation
    const pricePerMBInUSD = pricePerMBInAR * fixedArToUsdRate;
    
    // Return the storage pricing information
    res.status(200).json({
      pricePerMBInAR,
      pricePerMBInUSD,
      pricePerMBInWinston,
      timestamp: Date.now(),
      networkFactor: 1.0 // Base network factor
    });
  } catch (error) {
    console.error('Error fetching Arweave storage pricing:', error);
    
    // Provide realistic fallback values based on current network storage rates
    const fallbackPricePerMBInWinston = 2370510319; // Current real storage rate
    const fallbackPricePerMBInAR = fallbackPricePerMBInWinston / 1e12;
    const fixedArToUsdRate = 6.50; // Fixed rate for storage cost calculation
    const fallbackPricePerMBInUSD = fallbackPricePerMBInAR * fixedArToUsdRate;
    
    res.status(200).json({
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