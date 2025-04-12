// Simplified fastify server implementation
const path = require('path');
const fastify = require('fastify')({
  logger: {
    level: 'info'
  }
});
const fastifyStatic = require('@fastify/static');
const fs = require('fs');
const axios = require('axios');
const heliusApi = require('./helius-api');

// Log startup info
console.log('[FASTIFY SERVER] Starting with environment:', {
  env: process.env.NODE_ENV,
  cwd: process.cwd()
});

// Specific endpoint for default token icon SVG
fastify.get('/default-token-icon.svg', async (request, reply) => {
  const svgPath = path.join(__dirname, 'static', 'default-token-icon.svg');
  if (fs.existsSync(svgPath)) {
    return reply.type('image/svg+xml').send(fs.readFileSync(svgPath));
  } else {
    fastify.log.error(`SVG file not found at: ${svgPath}`);
    return reply.code(404).send({ error: 'SVG not found' });
  }
});

// Specific endpoint for default NFT image SVG
fastify.get('/default-nft-image.svg', async (request, reply) => {
  const svgPath = path.join(__dirname, 'static', 'default-nft-image.svg');
  if (fs.existsSync(svgPath)) {
    return reply.type('image/svg+xml').send(fs.readFileSync(svgPath));
  } else {
    fastify.log.error(`SVG file not found at: ${svgPath}`);
    return reply.code(404).send({ error: 'SVG not found' });
  }
});

// Register static files from static directory
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'static'),
  prefix: '/static/'
});

// Register static files from static/dist directory (webpack output)
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'static', 'dist'),
  prefix: '/static/dist/',
  decorateReply: false
});

// Serve index.html for root route
fastify.get('/', async (request, reply) => {
  fastify.log.info('Serving index.html for root path');
  return reply.sendFile('index.html', path.join(__dirname, 'templates'));
});

// Simple test endpoint
fastify.get('/ping', async (request, reply) => {
  fastify.log.info('Ping endpoint hit');
  return { status: 'ok', time: new Date().toISOString() };
});

// API Config endpoint
fastify.get('/api/config', async (request, reply) => {
  fastify.log.info('API config endpoint hit');
  return { 
    solscanApiKey: process.env.SOLSCAN_API_KEY || '',
    quicknodeRpcUrl: process.env.QUICKNODE_RPC_URL || '',
    heliusApiKey: process.env.HELIUS_API_KEY ? 'present' : '', // Don't expose actual key
    environment: process.env.NODE_ENV || 'development'
  };
});

// Import local token metadata
const tokenMetadata = require('./token-metadata');

// Endpoint for token metadata that uses local data instead of external API
fastify.get('/api/token-metadata/:tokenAddress', async (request, reply) => {
  const { tokenAddress } = request.params;
  
  if (!tokenAddress) {
    return reply.code(400).send({ error: 'Token address is required' });
  }
  
  try {
    fastify.log.info(`Request for token metadata: ${tokenAddress}`);
    
    // Try to get enhanced metadata with URI support first
    try {
      const enhancedMetadata = await tokenMetadata.getTokenMetadataWithUri(tokenAddress);
      if (enhancedMetadata) {
        fastify.log.info(`Enhanced token metadata for ${tokenAddress}: ${JSON.stringify(enhancedMetadata)}`);
        return enhancedMetadata;
      }
    } catch (enhancedError) {
      fastify.log.warn(`Enhanced metadata lookup failed, falling back to basic metadata: ${enhancedError.message}`);
    }
    
    // Fallback to basic metadata if enhanced lookup fails
    const metadata = tokenMetadata.getTokenMetadata(tokenAddress);
    
    fastify.log.info(`Token metadata for ${tokenAddress}: ${JSON.stringify(metadata)}`);
    return metadata;
  } catch (error) {
    fastify.log.error(`Error fetching token metadata: ${error.message}`);
    return reply.code(500).send({ 
      error: 'Failed to fetch token metadata',
      message: error.message
    });
  }
});

// Helius API endpoints for NFTs and cNFTs
fastify.get('/api/helius/wallet/nfts/:walletAddress', async (request, reply) => {
  const { walletAddress } = request.params;
  
  if (!walletAddress) {
    return reply.code(400).send({ error: 'Wallet address is required' });
  }
  
  try {
    fastify.log.info(`Fetching all NFTs (regular + compressed) for wallet: ${walletAddress} using v0 API`);
    const result = await heliusApi.fetchAllWalletNFTs(walletAddress);
    
    // Format all NFTs to match our application's format
    const formattedRegularNfts = result.regularNfts.map(heliusApi.formatHeliusV0NFTData);
    const formattedCompressedNfts = result.compressedNfts.map(heliusApi.formatHeliusV0NFTData);
    
    return {
      success: true,
      data: {
        regularNfts: formattedRegularNfts,
        compressedNfts: formattedCompressedNfts
      }
    };
  } catch (error) {
    fastify.log.error(`Error fetching wallet NFTs: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch wallet NFTs',
      message: error.message
    });
  }
});

// Legacy endpoints - keeping for backward compatibility
fastify.get('/api/helius/assets/:walletAddress', async (request, reply) => {
  const { walletAddress } = request.params;
  
  if (!walletAddress) {
    return reply.code(400).send({ error: 'Wallet address is required' });
  }
  
  try {
    fastify.log.info(`Fetching all NFT assets for wallet: ${walletAddress} using RPC API`);
    const assets = await heliusApi.fetchAllNFTsByOwner(walletAddress);
    
    // Format the assets to match our application's format
    const formattedAssets = assets.map(heliusApi.formatHeliusNFTData);
    
    return {
      success: true,
      data: formattedAssets
    };
  } catch (error) {
    fastify.log.error(`Error fetching NFT assets: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch NFT assets',
      message: error.message
    });
  }
});

fastify.get('/api/helius/cnfts/:walletAddress', async (request, reply) => {
  const { walletAddress } = request.params;
  
  if (!walletAddress) {
    return reply.code(400).send({ error: 'Wallet address is required' });
  }
  
  try {
    fastify.log.info(`Fetching compressed NFTs for wallet: ${walletAddress} using RPC API`);
    const cnfts = await heliusApi.fetchCompressedNFTsByOwner(walletAddress);
    
    // Format the cNFTs to match our application's format
    const formattedCnfts = cnfts.map(heliusApi.formatHeliusNFTData);
    
    return {
      success: true,
      data: formattedCnfts
    };
  } catch (error) {
    fastify.log.error(`Error fetching compressed NFTs: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch compressed NFTs',
      message: error.message
    });
  }
});

fastify.get('/api/helius/asset/:assetId', async (request, reply) => {
  const { assetId } = request.params;
  
  if (!assetId) {
    return reply.code(400).send({ error: 'Asset ID is required' });
  }
  
  try {
    fastify.log.info(`Fetching details for asset: ${assetId}`);
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      return reply.code(404).send({
        success: false,
        error: 'Asset not found'
      });
    }
    
    // Format the asset to match our application's format
    const formattedAsset = heliusApi.formatHeliusNFTData(assetDetails);
    
    return {
      success: true,
      data: formattedAsset
    };
  } catch (error) {
    fastify.log.error(`Error fetching asset details: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch asset details',
      message: error.message
    });
  }
});

// Catch-all route for SPA - always serve index.html
fastify.setNotFoundHandler(async (request, reply) => {
  fastify.log.info(`Not found handler for: ${request.url}, serving index.html`);
  return reply.sendFile('index.html', path.join(__dirname, 'templates'));
});

// Log uncaught errors
process.on('uncaughtException', (err) => {
  fastify.log.error({
    msg: 'Uncaught Exception',
    error: err.toString(),
    stack: err.stack,
    time: new Date().toISOString()
  });
});

process.on('unhandledRejection', (reason, promise) => {
  fastify.log.error({
    msg: 'Unhandled Rejection',
    reason: reason.toString(),
    stack: reason.stack,
    time: new Date().toISOString()
  });
});

// Start the server - use port 5001 for Replit
const port = process.env.PORT || 5001;
const start = async () => {
  try {
    await fastify.listen({ port: port, host: '0.0.0.0' });
    fastify.log.info(`Server running at http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(`Error starting server: ${err}`);
    process.exit(1);
  }
};

start();