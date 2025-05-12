/**
 * Configuration Handler
 * 
 * This module provides a central place to fetch and manage configuration
 * settings for the application, particularly API keys and endpoints.
 * It caches configuration to avoid repeated API calls.
 */

import axios from 'axios';

// Cache for configuration
let configCache = null;
let lastFetchTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute cache time to live

/**
 * Fetch configuration from server
 * @returns {Promise<object>} Configuration object
 */
export async function getConfig() {
  const now = Date.now();
  
  // Return cached config if valid
  if (configCache && (now - lastFetchTime < CACHE_TTL)) {
    return configCache;
  }
  
  try {
    console.log('[Config] Fetching fresh configuration from server');
    const response = await axios.get('/api/config');
    
    if (response.data && response.data.success) {
      // Update cache
      configCache = {
        heliusApiKey: response.data.heliusApiKey || null,
        quicknodeRpcUrl: response.data.quicknodeRpcUrl || null,
        solscanApiKey: response.data.solscanApiKey || null,
        projectWallet: response.data.projectWallet || 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK',
        ...response.data.additional
      };
      lastFetchTime = now;
      
      return configCache;
    } else {
      console.error('[Config] Invalid config response from server:', response.data);
      throw new Error('Invalid configuration response');
    }
  } catch (error) {
    console.error('[Config] Error fetching configuration:', error);
    
    // Fallback to cached config if available, otherwise return default values
    if (configCache) {
      return configCache;
    }
    
    return {
      heliusApiKey: null,
      quicknodeRpcUrl: null,
      solscanApiKey: null,
      projectWallet: 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK'
    };
  }
}

/**
 * Force refresh the configuration cache
 * @returns {Promise<object>} Fresh configuration
 */
export async function refreshConfig() {
  // Invalidate cache
  configCache = null;
  lastFetchTime = 0;
  
  // Fetch fresh config
  return await getConfig();
}

/**
 * Get the project wallet address
 * @returns {Promise<string>} Project wallet address
 */
export async function getProjectWallet() {
  const config = await getConfig();
  return config.projectWallet || 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';
}