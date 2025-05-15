/**
 * Asset Cache Module
 * 
 * Provides caching functionality for asset data and proof information to reduce API calls.
 * Uses memory-based caching with expiration times.
 */

// Cache configuration
const CACHE_EXPIRY = {
  ASSET_DATA: 5 * 60 * 1000,   // 5 minutes for asset data
  PROOF_DATA: 20 * 1000,       // 20 seconds for proof data (shorter as it changes more frequently)
  WALLET_DATA: 60 * 1000       // 1 minute for wallet data
};

// Cache storage objects
const assetDataCache = new Map();
const proofDataCache = new Map();
const walletDataCache = new Map();

/**
 * Get current timestamp for expiry calculation
 * @returns {number} - Current timestamp in milliseconds
 */
const getCurrentTime = () => Date.now();

/**
 * Cache asset data
 * @param {string} assetId - The asset ID to use as key
 * @param {object} data - The asset data to cache
 */
function cacheAssetData(assetId, data) {
  if (!assetId || !data) return;
  
  assetDataCache.set(assetId, {
    data,
    expiry: getCurrentTime() + CACHE_EXPIRY.ASSET_DATA
  });
  
  console.log(`[Asset Cache] Cached asset data for: ${assetId}`);
}

/**
 * Get asset data from cache
 * @param {string} assetId - The asset ID to retrieve
 * @returns {object|null} - The cached asset data or null if not cached or expired
 */
function getAssetData(assetId) {
  if (!assetId) return null;
  
  const cached = assetDataCache.get(assetId);
  if (!cached) return null;
  
  // Check if expired
  if (cached.expiry < getCurrentTime()) {
    console.log(`[Asset Cache] Expired asset data for: ${assetId}`);
    assetDataCache.delete(assetId);
    return null;
  }
  
  console.log(`[Asset Cache] Hit for asset data: ${assetId}`);
  return cached.data;
}

/**
 * Cache proof data
 * @param {string} assetId - The asset ID to use as key
 * @param {object} data - The proof data to cache
 */
function cacheProofData(assetId, data) {
  if (!assetId || !data) return;
  
  proofDataCache.set(assetId, {
    data,
    expiry: getCurrentTime() + CACHE_EXPIRY.PROOF_DATA
  });
  
  console.log(`[Asset Cache] Cached proof data for: ${assetId}`);
}

/**
 * Get proof data from cache
 * @param {string} assetId - The asset ID to retrieve
 * @returns {object|null} - The cached proof data or null if not cached or expired
 */
function getProofData(assetId) {
  if (!assetId) return null;
  
  const cached = proofDataCache.get(assetId);
  if (!cached) return null;
  
  // Check if expired
  if (cached.expiry < getCurrentTime()) {
    console.log(`[Asset Cache] Expired proof data for: ${assetId}`);
    proofDataCache.delete(assetId);
    return null;
  }
  
  console.log(`[Asset Cache] Hit for proof data: ${assetId}`);
  return cached.data;
}

/**
 * Cache wallet data
 * @param {string} walletAddress - The wallet address to use as key
 * @param {object} data - The wallet data to cache
 */
function cacheWalletData(walletAddress, data) {
  if (!walletAddress || !data) return;
  
  walletDataCache.set(walletAddress, {
    data,
    expiry: getCurrentTime() + CACHE_EXPIRY.WALLET_DATA
  });
  
  console.log(`[Asset Cache] Cached wallet data for: ${walletAddress}`);
}

/**
 * Get wallet data from cache
 * @param {string} walletAddress - The wallet address to retrieve
 * @returns {object|null} - The cached wallet data or null if not cached or expired
 */
function getWalletData(walletAddress) {
  if (!walletAddress) return null;
  
  const cached = walletDataCache.get(walletAddress);
  if (!cached) return null;
  
  // Check if expired
  if (cached.expiry < getCurrentTime()) {
    console.log(`[Asset Cache] Expired wallet data for: ${walletAddress}`);
    walletDataCache.delete(walletAddress);
    return null;
  }
  
  console.log(`[Asset Cache] Hit for wallet data: ${walletAddress}`);
  return cached.data;
}

/**
 * Get cache statistics (for debugging)
 * @returns {object} - Statistics about the cache
 */
function getCacheStats() {
  return {
    assetDataSize: assetDataCache.size,
    proofDataSize: proofDataCache.size,
    walletDataSize: walletDataCache.size,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  cacheAssetData,
  getAssetData,
  cacheProofData,
  getProofData,
  cacheWalletData,
  getWalletData,
  getCacheStats
};