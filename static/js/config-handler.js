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

/**
 * Get application configuration from the server
 * @returns {Promise<object>} Application configuration
 */
export async function getConfig() {
  try {
    // Use cached config if available
    if (configCache) {
      return configCache;
    }
    
    // Fetch config from server
    const response = await axios.get('/api/config');
    
    if (response.data && response.data.config) {
      // Cache the config
      configCache = response.data.config;
      return configCache;
    }
    
    throw new Error('Invalid configuration response');
  } catch (error) {
    console.error('Error fetching configuration:', error);
    // Return default config in case of error
    return {
      projectWallet: 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK',
      heliusEnabled: false,
      heliusApiKey: null,
      rpcEndpoint: 'https://api.mainnet-beta.solana.com'
    };
  }
}

/**
 * Force refresh the configuration cache
 * @returns {Promise<object>} Fresh configuration
 */
export async function refreshConfig() {
  try {
    // Clear the cache
    configCache = null;
    
    // Fetch fresh config
    const response = await axios.get('/api/config?refresh=true');
    
    if (response.data && response.data.config) {
      // Cache the config
      configCache = response.data.config;
      return configCache;
    }
    
    throw new Error('Invalid configuration response');
  } catch (error) {
    console.error('Error refreshing configuration:', error);
    throw error;
  }
}

/**
 * Get the project wallet address
 * @returns {Promise<string>} Project wallet address
 */
export async function getProjectWallet() {
  const config = await getConfig();
  return config.projectWallet || 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';
}

/**
 * Check if Helius API is enabled
 * @returns {Promise<boolean>} Whether Helius API is enabled
 */
export async function isHeliusEnabled() {
  const config = await getConfig();
  return config.heliusEnabled === true;
}

/**
 * Get the appropriate RPC endpoint based on configuration
 * @returns {Promise<string>} RPC endpoint URL
 */
export async function getRpcEndpoint() {
  const config = await getConfig();
  return config.rpcEndpoint || 'https://api.mainnet-beta.solana.com';
}