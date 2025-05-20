/**
 * Arweave pricing calculator with markup
 * Calculates the cost to store data on Arweave with a 70% markup for service fees
 * Uses cached pricing data with periodic updates to avoid rate limits
 */

// Default fallback values if API calls fail
const DEFAULT_AR_PRICE_USD = 50; // Fallback AR token price in USD
const DEFAULT_BYTES_PER_AR = 1_073_741_824; // ~1GB per AR token (fallback)

// Cache for pricing data
interface PricingCache {
  arPriceUsd: number;
  bytesPerAr: number;
  lastUpdated: number;
}

// Initialize cache with default values
let pricingCache: PricingCache = {
  arPriceUsd: DEFAULT_AR_PRICE_USD,
  bytesPerAr: DEFAULT_BYTES_PER_AR,
  lastUpdated: 0
};

// Cache expiration time (15 minutes)
const CACHE_EXPIRATION_MS = 15 * 60 * 1000;

/**
 * Fetch current Arweave token price from CoinGecko API
 * @returns Current AR price in USD
 */
async function fetchArweavePrice(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd'
    );
    const data = await response.json();
    return data.arweave.usd;
  } catch (error) {
    console.error('Error fetching Arweave price:', error);
    return pricingCache.arPriceUsd || DEFAULT_AR_PRICE_USD;
  }
}

/**
 * Fetch current Arweave network conditions
 * This would ideally call the Arweave network directly, but for simplicity
 * we're using a simulated approach that adjusts based on the AR price
 * @returns Bytes per AR token based on current network conditions
 */
async function fetchNetworkConditions(arPrice: number): Promise<number> {
  try {
    // In a real implementation, this would query Arweave nodes or a service
    // For now, we'll simulate network conditions based on token price
    // Higher AR price typically correlates with more bytes per AR
    const baseBytes = DEFAULT_BYTES_PER_AR;
    const priceRatio = arPrice / DEFAULT_AR_PRICE_USD;
    
    // Adjust bytes per AR based on price ratio (inverse relationship)
    // As AR price goes up, cost per byte goes down (more bytes per AR)
    return baseBytes * (priceRatio > 0 ? (1 / priceRatio) : 1);
  } catch (error) {
    console.error('Error calculating network conditions:', error);
    return pricingCache.bytesPerAr || DEFAULT_BYTES_PER_AR;
  }
}

/**
 * Update pricing cache if needed
 */
async function updatePricingCache(): Promise<void> {
  const now = Date.now();
  
  // Only update if cache is expired
  if (now - pricingCache.lastUpdated > CACHE_EXPIRATION_MS) {
    try {
      const arPrice = await fetchArweavePrice();
      const bytesPerAr = await fetchNetworkConditions(arPrice);
      
      pricingCache = {
        arPriceUsd: arPrice,
        bytesPerAr: bytesPerAr,
        lastUpdated: now
      };
      
      console.log('Updated Arweave pricing cache:', pricingCache);
    } catch (error) {
      console.error('Failed to update pricing cache:', error);
    }
  }
}

/**
 * Calculate the cost in USDC to store a file on Arweave with a 70% markup
 * Uses cached pricing data with periodic updates
 * @param sizeInBytes File size in bytes
 * @returns Cost in USDC as a string with 2 decimal places
 */
export const calculateArweaveCost = async (sizeInBytes: number): Promise<string> => {
  // Update cache if needed
  await updatePricingCache();
  
  // Get current pricing data from cache
  const { arPriceUsd, bytesPerAr } = pricingCache;
  
  // Calculate base Arweave cost in AR tokens
  const arTokens = sizeInBytes / bytesPerAr;
  
  // Convert to USD
  const baseCostUSD = arTokens * arPriceUsd;
  
  // Apply 70% markup
  const totalCostUSD = baseCostUSD * 1.7;
  
  // Round to 2 decimal places and ensure minimum cost
  const roundedCost = Math.max(0.01, Math.ceil(totalCostUSD * 100) / 100);
  
  return roundedCost.toFixed(2);
};

/**
 * Synchronous version that uses cached values only
 * This is used when we need an immediate result without waiting for API calls
 * @param sizeInBytes File size in bytes
 * @returns Cost in USDC as a string with 2 decimal places
 */
export const calculateArweaveCostSync = (sizeInBytes: number): string => {
  // Trigger an async update of the cache for future calls
  updatePricingCache().catch(console.error);
  
  // Use current cached values
  const { arPriceUsd, bytesPerAr } = pricingCache;
  
  // Calculate base Arweave cost in AR tokens
  const arTokens = sizeInBytes / bytesPerAr;
  
  // Convert to USD
  const baseCostUSD = arTokens * arPriceUsd;
  
  // Apply 70% markup
  const totalCostUSD = baseCostUSD * 1.7;
  
  // Round to 2 decimal places and ensure minimum cost
  const roundedCost = Math.max(0.01, Math.ceil(totalCostUSD * 100) / 100);
  
  return roundedCost.toFixed(2);
};

/**
 * Get a descriptive tier name based on file size
 * @param sizeInBytes File size in bytes
 * @returns Tier description string
 */
export const getFileSizeTier = (sizeInBytes: number): string => {
  const sizeKB = sizeInBytes / 1024;
  const sizeMB = sizeKB / 1024;
  
  if (sizeKB < 100) {
    return 'Tier 0 (<100KB)';
  } else if (sizeMB < 10) {
    return 'Tier 1 (100KB-10MB)';
  } else if (sizeMB < 20) {
    return 'Tier 2 (10-20MB)';
  } else if (sizeMB < 50) {
    return 'Tier 3 (20-50MB)';
  } else if (sizeMB < 100) {
    return 'Tier 4 (50-100MB) - Dynamic Pricing';
  } else {
    return 'Tier 5 (>100MB) - Dynamic Pricing';
  }
};
