/**
 * Environment Configuration
 * 
 * This file exports environment variables used throughout the application
 * to avoid repetitive process.env access and provide centralized configuration.
 */

// API Keys
const heliusApiKey = process.env.HELIUS_API_KEY || '';
const solscanApiKey = process.env.SOLSCAN_API_KEY || '';
const quicknodeRpcUrl = process.env.QUICKNODE_RPC_URL || '';

// Project configuration
const projectWallet = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';

// Tree information (for minting and burning cNFTs)
const treeAddress = process.env.TREE_ADDRESS || '';
const treeAuthoritySecretKey = process.env.TREE_AUTHORITY_SECRET_KEY || '';

// Environment
const isDevelopment = process.env.NODE_ENV !== 'production';
const environment = process.env.NODE_ENV || 'development';

// Server configuration
const port = process.env.PORT || 5001;

// Export all configuration
module.exports = {
  heliusApiKey,
  solscanApiKey,
  quicknodeRpcUrl,
  projectWallet,
  treeAddress,
  treeAuthoritySecretKey,
  isDevelopment,
  environment,
  port
};