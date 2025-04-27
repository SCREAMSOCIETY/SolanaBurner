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
const cnftBurnServer = require('./cnft-burn-server');
const cnftTransferServer = require('./cnft-transfer-server');

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
  
  // Check if we have tree authority and address in environment
  const hasTreeAuthority = !!process.env.TREE_AUTHORITY_SECRET_KEY;
  const treeAddress = process.env.TREE_ADDRESS || '';
  
  return { 
    solscanApiKey: process.env.SOLSCAN_API_KEY || '',
    quicknodeRpcUrl: process.env.QUICKNODE_RPC_URL || '',
    heliusApiKey: process.env.HELIUS_API_KEY ? 'present' : '', // Don't expose actual key
    environment: process.env.NODE_ENV || 'development',
    // Include tree information for the client side
    treeInfo: {
      hasTreeAuthority: hasTreeAuthority,
      treeAddress: treeAddress,
      isSimulationMode: false // We're overriding simulation mode
    }
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

// Import the Solana web3.js library
const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// Create a Solana connection
const solanaRpcUrl = process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpcUrl);
console.log('Connected to Solana RPC at', solanaRpcUrl);

// Helper function to find metadata PDA
function findMetadataPda(mintAddress) {
  try {
    const metadataProgramId = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const seed = Buffer.from('metadata');
    const mintPubkey = new PublicKey(mintAddress);
    
    const [pda] = PublicKey.findProgramAddressSync(
      [
        seed,
        metadataProgramId.toBuffer(),
        mintPubkey.toBuffer(),
      ],
      metadataProgramId
    );
    
    return pda.toBase58();
  } catch (error) {
    console.error('Error finding metadata PDA:', error);
    return null;
  }
}

// Helius API endpoints for NFTs and cNFTs
fastify.get('/api/helius/wallet/nfts/:walletAddress', async (request, reply) => {
  const { walletAddress } = request.params;
  
  if (!walletAddress) {
    return reply.code(400).send({ error: 'Wallet address is required' });
  }
  
  try {
    // Use RPC API instead of v0 API since the RPC endpoint is more reliable
    fastify.log.info(`Fetching all NFTs for wallet: ${walletAddress} using RPC API`);
    const assets = await heliusApi.fetchAllNFTsByOwner(walletAddress);
    
    // Filter assets by compression
    const regularNfts = assets.filter(nft => !nft.compression?.compressed);
    const compressedNfts = assets.filter(nft => nft.compression?.compressed);
    
    fastify.log.info(`Found ${regularNfts.length} regular NFTs and ${compressedNfts.length} compressed NFTs`);
    
    // For regular NFTs, also fetch token accounts and metadata accounts
    const enhancedRegularNfts = await Promise.all(
      regularNfts.map(async (nft) => {
        // Format base NFT data
        const formattedNft = heliusApi.formatHeliusNFTData(nft);
        
        try {
          // Find token account for this NFT
          const ownerPubkey = new PublicKey(walletAddress);
          const mintPubkey = new PublicKey(nft.id);
          
          const tokenAccounts = await connection.getTokenAccountsByOwner(
            ownerPubkey,
            { mint: mintPubkey }
          );
          
          if (tokenAccounts.value.length > 0) {
            formattedNft.tokenAddress = tokenAccounts.value[0].pubkey.toBase58();
          }
          
          // Find metadata PDA
          formattedNft.metadataAddress = findMetadataPda(nft.id);
        } catch (error) {
          console.error(`Error enhancing NFT data for ${nft.id}:`, error);
        }
        
        return formattedNft;
      })
    );
    
    // Format compressed NFTs
    const formattedCompressedNfts = compressedNfts.map(heliusApi.formatHeliusNFTData);
    
    return {
      success: true,
      data: {
        regularNfts: enhancedRegularNfts,
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

// Endpoint for delegating authority for a cNFT to our server
fastify.post('/api/cnft/delegate', async (request, reply) => {
  try {
    const { ownerAddress, assetId, signedMessage, delegatePublicKey } = request.body;
    
    if (!ownerAddress || !assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Owner address and asset ID are required'
      });
    }
    
    // Log the request
    fastify.log.info(`Received delegation request for cNFT: ${assetId} from owner: ${ownerAddress}`);
    
    // 1. Fetch asset details to confirm ownership
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      return reply.code(404).send({
        success: false,
        error: 'Asset not found'
      });
    }
    
    // Verify ownership
    if (assetDetails.ownership.owner !== ownerAddress) {
      return reply.code(403).send({
        success: false,
        error: 'Ownership verification failed'
      });
    }
    
    fastify.log.info(`Ownership verified: ${ownerAddress}`);
    
    // 2. Fetch the asset proof data (required for delegation)
    const proofData = await heliusApi.fetchAssetProof(assetId);
    
    if (!proofData || !proofData.proof) {
      return reply.code(404).send({
        success: false,
        error: 'Proof data not available'
      });
    }
    
    fastify.log.info(`Processing delegation request for cNFT: ${assetId}`);
    
    // Import required libraries
    const { 
      Connection, 
      PublicKey, 
      Transaction,
      ComputeBudgetProgram
    } = require('@solana/web3.js');
    
    // Get Bubblegum Program ID
    const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
    
    // 3. Create a transaction for the client to sign
    try {
      // Extract tree ID from proof data
      const treeId = proofData.tree_id;
      const treeAddress = new PublicKey(treeId);
      
      // Derive the tree authority PDA
      const [treeAuthority] = PublicKey.findProgramAddressSync(
        [treeAddress.toBuffer()],
        BUBBLEGUM_PROGRAM_ID
      );
      
      // Get our server's public key to use as delegate
      // In a real scenario, this would be a dedicated keypair
      const serverDelegateKey = new PublicKey(delegatePublicKey || 'HomZPVRkJsD8yRJyGVYBfCsLJ6YBGnqZRpMDBDVzKjh6');
      
      // We'll return instructions for the client to create a delegate transaction
      return {
        success: true,
        message: "Delegation request processed. You need to sign a transaction to delegate authority.",
        data: {
          assetId,
          owner: ownerAddress,
          delegate: serverDelegateKey.toString(),
          treeId,
          treeAuthority: treeAuthority.toString(),
          requiredProof: proofData
        },
        // This is a simulation since we're not completing the actual delegation
        isSimulated: true
      };
    } catch (error) {
      fastify.log.error(`Error creating delegation transaction: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: `Error creating delegation transaction: ${error.message}`
      });
    }
  } catch (error) {
    fastify.log.error(`Error processing delegation request: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to process delegation request',
      message: error.message
    });
  }
});

// Endpoint for processing cNFT burn requests
fastify.post('/api/cnft/burn-request', async (request, reply) => {
  try {
    const { ownerAddress, assetId, signedMessage } = request.body;
    
    if (!ownerAddress || !assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Owner address and asset ID are required'
      });
    }
    
    // Log the request
    fastify.log.info(`Received burn request for cNFT: ${assetId} from owner: ${ownerAddress}`);
    
    // 1. Fetch asset details to confirm ownership
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      return reply.code(404).send({
        success: false,
        error: 'Asset not found'
      });
    }
    
    // Verify ownership
    if (assetDetails.ownership.owner !== ownerAddress) {
      return reply.code(403).send({
        success: false,
        error: 'Ownership verification failed'
      });
    }
    
    fastify.log.info(`Ownership verified: ${ownerAddress}`);
    
    // 2. Fetch the asset proof data (required for burning)
    const proofData = await heliusApi.fetchAssetProof(assetId);
    
    if (!proofData || !proofData.proof) {
      return reply.code(404).send({
        success: false,
        error: 'Proof data not available'
      });
    }
    
    fastify.log.info(`Processing burn request for cNFT: ${assetId}`);
    fastify.log.info(`Asset data and proof available`);
    
    // 3. Process the burn request through our cnft-burn-server
    const result = await cnftBurnServer.processBurnRequest(
      ownerAddress,
      assetId,
      signedMessage,
      proofData,
      assetDetails
    );
    
    if (result.success) {
      if (result.isSimulated) {
        fastify.log.info(`[TRANSACTION] Simulating burn process for ${assetId}`);
      } else {
        fastify.log.info(`[TRANSACTION] Successfully burned ${assetId} with signature: ${result.signature}`);
      }
      return reply.code(200).send(result);
    } else {
      fastify.log.error(`[TRANSACTION] Failed to burn ${assetId}: ${result.error}`);
      return reply.code(500).send(result);
    }
  } catch (error) {
    fastify.log.error(`Error processing cNFT burn request: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to process cNFT burn request',
      message: error.message
    });
  }
});

// Endpoint for transferring a cNFT to the project wallet
fastify.post('/api/cnft/transfer-request', async (request, reply) => {
  try {
    const { ownerAddress, assetId, signedMessage, destinationAddress } = request.body;
    
    if (!ownerAddress || !assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Owner address and asset ID are required'
      });
    }
    
    // Log the request
    fastify.log.info(`Received transfer request for cNFT: ${assetId} from owner: ${ownerAddress}`);
    fastify.log.info(`Destination address: ${destinationAddress || 'Using default project wallet'}`);
    
    // 1. Fetch asset details to confirm ownership
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      return reply.code(404).send({
        success: false,
        error: 'Asset not found'
      });
    }
    
    // Verify ownership
    if (assetDetails.ownership.owner !== ownerAddress) {
      return reply.code(403).send({
        success: false,
        error: 'Ownership verification failed'
      });
    }
    
    fastify.log.info(`Ownership verified: ${ownerAddress}`);
    
    // 2. Fetch the asset proof data (required for transferring)
    const proofData = await heliusApi.fetchAssetProof(assetId);
    
    if (!proofData || !proofData.proof) {
      return reply.code(404).send({
        success: false,
        error: 'Proof data not available'
      });
    }
    
    fastify.log.info(`Processing transfer request for cNFT: ${assetId}`);
    fastify.log.info(`Asset data and proof available`);
    
    // 3. Process the transfer request through our cnft-transfer-server
    const result = await cnftTransferServer.processTransferRequest(
      ownerAddress,
      assetId,
      signedMessage,
      proofData,
      assetDetails,
      destinationAddress
    );
    
    if (result.success) {
      if (result.isSimulated) {
        fastify.log.info(`[TRANSACTION] Simulating transfer process for ${assetId}`);
      } else {
        fastify.log.info(`[TRANSACTION] Successfully transferred ${assetId} with signature: ${result.signature}`);
      }
      return reply.code(200).send(result);
    } else {
      fastify.log.error(`[TRANSACTION] Failed to transfer ${assetId}: ${result.error}`);
      return reply.code(500).send(result);
    }
  } catch (error) {
    fastify.log.error(`Error processing cNFT transfer request: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to process cNFT transfer request',
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

// Endpoint specifically for fetching asset proof data for cNFTs
fastify.get('/api/helius/asset-proof/:assetId', async (request, reply) => {
  try {
    const { assetId } = request.params;
    
    if (!assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Asset ID is required'
      });
    }
    
    // Use Helius API to get the asset details with proof
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }
    
    fastify.log.info(`Fetching proof data for asset: ${assetId}`);
    
    // Construct the RPC payload to request proof data
    const payload = {
      jsonrpc: '2.0',
      id: 'helius-test',
      method: 'getAssetProof',
      params: {
        id: assetId
      }
    };
    
    // Make the request to Helius RPC API
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
      payload
    );
    
    if (response.data && response.data.result) {
      // Extract the proof and return it with some additional metadata
      const proofData = response.data.result;
      
      fastify.log.info(`Successfully fetched proof data for asset ${assetId}`);
      
      return {
        success: true,
        data: {
          assetId,
          proof: proofData.proof,
          root: proofData.root,
          tree_id: proofData.tree_id,
          node_index: proofData.node_index,
          leaf: proofData.leaf
        }
      };
    } else {
      throw new Error('Invalid response format from Helius API');
    }
  } catch (error) {
    console.error('Error fetching asset proof:', error);
    return reply.code(500).send({
      success: false,
      error: `Error fetching asset proof: ${error.message}`
    });
  }
});

// NOTE: We're using the new implementation with cnft-burn-server above

// Endpoint to handle direct transaction submission for cNFTs
fastify.post('/api/helius/submit-transaction', async (request, reply) => {
  try {
    const { signedTransaction } = request.body;
    
    if (!signedTransaction) {
      return reply.code(400).send({
        success: false,
        error: 'Signed transaction is required'
      });
    }
    
    fastify.log.info(`Submitting signed transaction to Solana network`);
    
    // Decode the base64 encoded transaction
    const transactionBuffer = Buffer.from(signedTransaction, 'base64');
    
    // Create a transaction object from the buffer
    const { Transaction } = require('@solana/web3.js');
    const transaction = Transaction.from(transactionBuffer);
    
    // Submit the transaction to the network
    const signature = await connection.sendRawTransaction(transactionBuffer, {
      skipPreflight: true,
      maxRetries: 3,
      preflightCommitment: 'processed'
    });
    
    fastify.log.info(`Transaction sent with signature: ${signature}`);
    
    // Wait for confirmation
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'processed');
    
    if (confirmation.value.err) {
      fastify.log.error(`Transaction confirmed but failed: ${JSON.stringify(confirmation.value.err)}`);
      return reply.code(500).send({
        success: false,
        error: `Transaction confirmed but failed: ${JSON.stringify(confirmation.value.err)}`,
        signature
      });
    }
    
    return {
      success: true,
      data: {
        signature,
        message: 'Transaction successfully submitted and confirmed!'
      }
    };
  } catch (error) {
    fastify.log.error(`Error submitting transaction: ${error.message}`);
    console.error('Stack:', error.stack);
    return reply.code(500).send({
      success: false,
      error: `Error submitting transaction: ${error.message}`
    });
  }
});

// Endpoint specifically for burning a single cNFT
fastify.post('/api/burn-cnft/:assetId', async (request, reply) => {
  try {
    const { assetId } = request.params;
    
    if (!assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Asset ID is required'
      });
    }
    
    fastify.log.info(`Processing burn request for cNFT asset: ${assetId}`);
    
    // First get the asset data with proof
    try {
      // Get asset details first
      const assetDetails = await heliusApi.fetchAssetDetails(assetId);
      
      if (!assetDetails) {
        return reply.code(404).send({
          success: false,
          error: 'Asset not found'
        });
      }
      
      // Now get the proof data
      const heliusApiKey = process.env.HELIUS_API_KEY;
      if (!heliusApiKey) {
        throw new Error('HELIUS_API_KEY environment variable is not set');
      }
      
      // Make the request to Helius RPC API for proof data
      const proofResponse = await axios.post(
        `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
        {
          jsonrpc: '2.0',
          id: 'helius-proof',
          method: 'getAssetProof',
          params: { id: assetId }
        }
      );
      
      if (!proofResponse.data || !proofResponse.data.result) {
        throw new Error('Invalid response from Helius API when fetching proof');
      }
      
      const proofData = proofResponse.data.result;
      
      fastify.log.info(`Successfully fetched proof data for cNFT ${assetId}`);
      
      // Return everything the client needs to complete the burn
      return {
        success: true,
        message: "Asset and proof data ready for client-side burning",
        data: {
          asset: assetDetails,
          proof: proofData
        }
      };
      
    } catch (error) {
      fastify.log.error(`Error processing burn-cnft request: ${error.message}`);
      console.error('Stack:', error.stack);
      return reply.code(500).send({
        success: false,
        error: `Error processing burn-cnft request: ${error.message}`
      });
    }
  } catch (error) {
    fastify.log.error(`Error in burn-cnft endpoint: ${error.message}`);
    console.error('Stack:', error.stack);
    return reply.code(500).send({
      success: false,
      error: `Error in burn-cnft endpoint: ${error.message}`
    });
  }
});

// New endpoint for direct cNFT burning via server-side transaction creation
// Using a simplified approach with direct Solana web3.js methods
fastify.post('/api/helius/burn-cnft', async (request, reply) => {
  try {
    const { assetId, walletPublicKey, signedMessage } = request.body;
    
    if (!assetId || !walletPublicKey || !signedMessage) {
      return reply.code(400).send({
        success: false,
        error: 'Required parameters missing: assetId, walletPublicKey, and signedMessage are required'
      });
    }
    
    fastify.log.info(`Processing server-side cNFT burn request for asset: ${assetId}`);
    
    // 1. Get the asset proof data
    fastify.log.info(`Fetching proof data for asset: ${assetId}`);
    
    // Get Helius API key
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }
    
    // Make the request to Helius RPC API for proof data
    const proofResponse = await axios.post(
      `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
      {
        jsonrpc: '2.0',
        id: 'helius-proof',
        method: 'getAssetProof',
        params: { id: assetId }
      }
    );
    
    if (!proofResponse.data || !proofResponse.data.result) {
      throw new Error('Invalid response from Helius API when fetching proof');
    }
    
    const proofData = proofResponse.data.result;
    
    // 2. Get the asset details
    fastify.log.info(`Fetching details for asset: ${assetId}`);
    
    // Make the request to Helius RPC API for asset details
    const assetResponse = await axios.post(
      `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
      {
        jsonrpc: '2.0',
        id: 'helius-asset',
        method: 'getAsset',
        params: { id: assetId }
      }
    );
    
    if (!assetResponse.data || !assetResponse.data.result) {
      throw new Error('Invalid response from Helius API when fetching asset details');
    }
    
    const assetData = assetResponse.data.result;
    
    // 3. Import libraries
    const { 
      Transaction, 
      PublicKey, 
      ComputeBudgetProgram, 
      TransactionInstruction,
      SystemProgram
    } = require('@solana/web3.js');
    
    // 4. Create a new transaction
    const transaction = new Transaction();
    
    // Add compute budget instructions to avoid insufficient SOL errors
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
    );
    
    // 5. Extract necessary data for the burn instruction
    const walletPubkey = new PublicKey(walletPublicKey);
    const treeId = proofData.tree_id;
    const treeAddress = new PublicKey(treeId);
    const bubblegumProgramId = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
    
    // Derive tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treeAddress.toBuffer()],
      bubblegumProgramId
    );
    
    fastify.log.info(`Using treeId: ${treeId}`);
    fastify.log.info(`Tree authority: ${treeAuthority.toString()}`);
    
    // 6. Manual account creation for the burn instruction
    const logWrapperPubkey = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
    const compressionProgramId = new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
    
    // Define the accounts needed
    const accounts = [
      { pubkey: treeAuthority, isSigner: false, isWritable: true },
      { pubkey: treeAddress, isSigner: false, isWritable: true },
      { pubkey: walletPubkey, isSigner: true, isWritable: false },
      { pubkey: walletPubkey, isSigner: false, isWritable: false },
      { pubkey: logWrapperPubkey, isSigner: false, isWritable: false },
      { pubkey: compressionProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ];
    
    // Add proof accounts
    proofData.proof.forEach(node => {
      accounts.push({
        pubkey: new PublicKey(node),
        isSigner: false,
        isWritable: false
      });
    });
    
    // 7. Create a buffer for the instruction data
    // Anchor programs require 8-byte discriminator followed by instruction data
    // For bubblegum, the burn instruction discriminator is this value:
    const burnDiscriminator = Buffer.from([153, 230, 48, 185, 246, 252, 185, 193]);
    
    // No need for any additional bytes for this instruction
    const dataBuffer = burnDiscriminator;
    
    fastify.log.info(`Using discriminator buffer: ${dataBuffer.toString('hex')}`);
    
    // 8. Create the instruction
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: bubblegumProgramId,
      data: dataBuffer
    });
    
    // Add burn instruction to transaction
    transaction.add(instruction);
    
    // 9. Set the fee payer and get recent blockhash
    transaction.feePayer = walletPubkey;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    // 10. Serialize the transaction to return to the client
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64');
    
    // 11. Return the transaction for the client to sign
    return {
      success: true,
      data: {
        transaction: serializedTransaction,
        message: 'Transaction created successfully, sign and submit from client'
      }
    };
    
  } catch (error) {
    fastify.log.error(`Error processing cNFT burn request: ${error.message}`);
    console.error('Stack:', error.stack);
    return reply.code(500).send({
      success: false,
      error: `Error processing cNFT burn request: ${error.message}`
    });
  }
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