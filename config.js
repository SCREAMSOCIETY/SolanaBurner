/**
 * Central configuration file for environment variables
 * All environment variables used in the application should be accessed through this file
 */

const config = {
  // Environment
  environment: process.env.NODE_ENV || 'development',
  
  // API Keys
  heliusApiKey: process.env.HELIUS_API_KEY || '',
  quicknodeRpcUrl: process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com',
  solscanApiKey: process.env.SOLSCAN_API_KEY || '',
  
  // Tree Info
  treeAddress: process.env.TREE_ADDRESS || '',
  treeAuthoritySecretKey: process.env.TREE_AUTHORITY_SECRET_KEY || '',
  
  // Project Wallet for cNFT Transfers
  projectWallet: 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK',
  
  // Port for the server
  port: process.env.PORT || 5001,
  
  // UI Labels
  cnftBurnDefaultText: 'Trash Selected cNFTs',
  
  // Function to determine if we're running in production
  isProduction: function() {
    return this.environment === 'production';
  },
  
  // Function to check if we have tree authority configured
  hasTreeAuthority: function() {
    return !!this.treeAuthoritySecretKey;
  },
  
  // Function to check if Helius API is configured
  hasHeliusApi: function() {
    return !!this.heliusApiKey;
  }
};

// Log if we're missing critical configuration
if (!config.heliusApiKey) {
  console.warn('WARNING: Helius API key is not set. NFT data may be unavailable.');
}

if (!config.quicknodeRpcUrl) {
  console.warn('WARNING: QuickNode RPC URL is not set. Using public RPC which may be rate limited.');
}

// Export the configuration
module.exports = config;