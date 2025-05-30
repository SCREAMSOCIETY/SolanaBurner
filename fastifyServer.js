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
const serverTransfer = require('./server-transfer');
const queueTransferManager = require('./queue-transfer-manager');
const delegatedTransfer = require('./delegated-cnft-transfer');

// Solana imports for vacant account burning
const { Connection, PublicKey, Transaction, clusterApiUrl } = require('@solana/web3.js');
const { createCloseAccountInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const nacl = require('tweetnacl');

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
  
  const heliusApiKey = process.env.HELIUS_API_KEY || '';
  const heliusPresent = heliusApiKey ? 'present' : '';
  
  // Log environment variable status for debugging
  fastify.log.info(`API Config: Helius API Key ${heliusPresent ? 'is present' : 'is missing'}`);
  fastify.log.info(`API Config: QuickNode RPC URL ${process.env.QUICKNODE_RPC_URL ? 'is present' : 'is missing'}`);
  fastify.log.info(`API Config: Solscan API Key ${process.env.SOLSCAN_API_KEY ? 'is present' : 'is missing'}`);
  
  return { 
    solscanApiKey: process.env.SOLSCAN_API_KEY || '',
    quicknodeRpcUrl: process.env.QUICKNODE_RPC_URL || '',
    heliusApiKey: heliusPresent, // Don't expose actual key in response
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

// Endpoint to get wallet tokens via Helius API
fastify.get('/api/wallet-tokens/:walletAddress', async (request, reply) => {
  const { walletAddress } = request.params;
  
  if (!walletAddress) {
    return reply.code(400).send({ error: 'Wallet address is required' });
  }

  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    
    const requestBody = {
      jsonrpc: '2.0',
      id: 'wallet-tokens',
      method: 'getTokenAccountsByOwner',
      params: [
        walletAddress,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' }
      ]
    };

    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'Helius API error');
    }

    const tokens = [];
    if (data.result && data.result.value) {
      for (const account of data.result.value) {
        const parsedInfo = account.account.data.parsed.info;
        const tokenAmount = parsedInfo.tokenAmount;
        
        if (Number(tokenAmount.amount) > 0) {
          tokens.push({
            mint: parsedInfo.mint,
            amount: Number(tokenAmount.amount),
            decimals: tokenAmount.decimals,
            tokenAccount: account.pubkey
          });
        }
      }
    }

    return {
      success: true,
      tokens: tokens,
      count: tokens.length
    };

  } catch (error) {
    fastify.log.error(`Error fetching wallet tokens: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch wallet tokens',
      message: error.message
    });
  }
});

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

// Connection and other imports already defined above

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

// Rent estimate endpoint for token accounts
fastify.get('/api/rent-estimate/:walletAddress', async (request, reply) => {
  const { walletAddress } = request.params;
  
  fastify.log.info(`Rent estimate endpoint hit for wallet: ${walletAddress}`);
  
  if (!walletAddress) {
    return reply.code(400).send({ error: 'Wallet address is required' });
  }
  
  try {
    fastify.log.info(`Calculating rent estimate for wallet: ${walletAddress}`);
    
    const ownerPubkey = new PublicKey(walletAddress);
    
    // Get all token accounts for this wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      ownerPubkey,
      { programId: TOKEN_PROGRAM_ID }
    );
    
    // Calculate rent for token account (the actual rent users get back)
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(165); // Token account size
    
    const totalAccounts = tokenAccounts.value.length;
    
    // Separate NFTs, tokens, and vacant accounts for detailed breakdown
    let nftAccounts = 0;
    let tokenAccounts_count = 0;
    let vacantAccounts = 0;
    
    for (const account of tokenAccounts.value) {
      const parsedInfo = account.account.data.parsed.info;
      const amount = Number(parsedInfo.tokenAmount.amount);
      const decimals = parsedInfo.tokenAmount.decimals;
      
      if (amount === 1 && decimals === 0) {
        nftAccounts++;
      } else if (amount > 0) {
        tokenAccounts_count++;
      } else if (amount === 0) {
        vacantAccounts++;
      }
    }
    
    // Calculate rent estimate with burning fees
    // Set burning fee for vacant accounts (in lamports)
    const vacantAccountBurningFee = 40000; // 0.00004 SOL fee per vacant account
    
    // NFTs and tokens return full rent, vacant accounts have rent minus burning fee
    const nftRentTotal = nftAccounts * tokenAccountRent;
    const tokenRentTotal = tokenAccounts_count * tokenAccountRent;
    const vacantRentAfterFee = Math.max(0, tokenAccountRent - vacantAccountBurningFee);
    const vacantRentTotal = vacantAccounts * vacantRentAfterFee;
    const totalRentEstimate = nftRentTotal + tokenRentTotal + vacantRentTotal;
    
    // Calculate total fees collected
    const totalBurningFees = vacantAccounts * vacantAccountBurningFee;
    
    return {
      success: true,
      data: {
        totalAccounts,
        nftAccounts,
        tokenAccounts: tokenAccounts_count,
        vacantAccounts,
        rentPerAccount: tokenAccountRent / 1e9, // Convert to SOL (basic token account)
        totalRentEstimate: totalRentEstimate / 1e9, // Convert to SOL
        breakdown: {
          nftRent: nftRentTotal / 1e9, // Full token account rent returned
          tokenRent: tokenRentTotal / 1e9,
          vacantRent: vacantRentTotal / 1e9 // Rent minus burning fee
        },
        fees: {
          vacantAccountBurningFee: vacantAccountBurningFee / 1e9, // Fee per vacant account
          totalBurningFees: totalBurningFees / 1e9 // Total fees for all vacant accounts
        }
      }
    };
  } catch (error) {
    fastify.log.error(`Error calculating rent estimate: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to calculate rent estimate',
      message: error.message
    });
  }
});

// Endpoint to identify vacant token accounts
fastify.post('/api/burn-vacant-accounts', async (request, reply) => {
  const { ownerAddress, signedMessage } = request.body;
  
  if (!ownerAddress) {
    return reply.code(400).send({ 
      error: 'Owner address is required' 
    });
  }
  
  try {
    fastify.log.info(`Identifying vacant accounts for wallet: ${ownerAddress}`);
    
    const ownerPubkey = new PublicKey(ownerAddress);
    
    // Get all token accounts for this wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      ownerPubkey,
      { programId: TOKEN_PROGRAM_ID }
    );
    
    // Find vacant accounts (amount = 0)
    const vacantAccounts = [];
    for (const account of tokenAccounts.value) {
      const parsedInfo = account.account.data.parsed.info;
      const amount = Number(parsedInfo.tokenAmount.amount);
      
      if (amount === 0) {
        vacantAccounts.push({
          address: account.pubkey.toString(),
          mint: parsedInfo.mint
        });
      }
    }
    
    if (vacantAccounts.length === 0) {
      return {
        success: true,
        message: 'No vacant accounts found',
        accountCount: 0,
        potentialRentRecovery: 0
      };
    }
    
    // Calculate potential rent recovery
    const rentPerAccount = await connection.getMinimumBalanceForRentExemption(165);
    const totalRentRecovery = vacantAccounts.length * rentPerAccount;
    
    return {
      success: true,
      message: `Found ${vacantAccounts.length} vacant accounts ready for burning`,
      vacantAccounts: vacantAccounts,
      accountCount: vacantAccounts.length,
      potentialRentRecovery: totalRentRecovery / 1e9 // Convert to SOL
    };
    
  } catch (error) {
    fastify.log.error(`Error identifying vacant accounts: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to identify vacant accounts',
      message: error.message
    });
  }
});

// Endpoint to prepare burn transactions
fastify.post('/api/prepare-burn-transactions', async (request, reply) => {
  const { ownerAddress, vacantAccounts } = request.body;
  
  if (!ownerAddress || !vacantAccounts || !Array.isArray(vacantAccounts)) {
    return reply.code(400).send({ 
      error: 'Owner address and vacant accounts array are required' 
    });
  }
  
  try {
    fastify.log.info(`Preparing burn transactions for ${vacantAccounts.length} vacant accounts`);
    
    const ownerPubkey = new PublicKey(ownerAddress);
    const transaction = new Transaction();
    
    // Create close account instructions for each vacant account
    for (const account of vacantAccounts) {
      const accountPubkey = new PublicKey(account.address);
      
      const closeInstruction = createCloseAccountInstruction(
        accountPubkey,  // Account to close
        ownerPubkey,    // Destination for rent SOL
        ownerPubkey     // Owner of the account
      );
      
      transaction.add(closeInstruction);
    }
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = ownerPubkey;
    
    // Serialize the transaction for client signing
    const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
    
    return {
      success: true,
      transaction: serializedTransaction.toString('base64'),
      accountCount: vacantAccounts.length,
      message: 'Transaction prepared successfully'
    };
    
  } catch (error) {
    fastify.log.error(`Error preparing burn transactions: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to prepare burn transactions',
      message: error.message
    });
  }
});

// Endpoint to submit signed burn transaction
fastify.post('/api/submit-burn-transaction', async (request, reply) => {
  const { signedTransaction, accountCount } = request.body;
  
  if (!signedTransaction) {
    return reply.code(400).send({ 
      error: 'Signed transaction is required' 
    });
  }
  
  try {
    fastify.log.info(`Submitting burn transaction for ${accountCount || 'unknown'} accounts`);
    
    // Deserialize the signed transaction
    const transactionBuffer = Buffer.from(signedTransaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);
    
    // Submit the transaction to the network
    const signature = await connection.sendRawTransaction(transaction.serialize());
    
    // Confirm the transaction
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    fastify.log.info(`Burn transaction successful: ${signature}`);
    
    return {
      success: true,
      signature: signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      accountCount: accountCount || 0,
      message: 'Vacant accounts burned successfully'
    };
    
  } catch (error) {
    fastify.log.error(`Error submitting burn transaction: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to submit burn transaction',
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

// Endpoint to fetch asset proof data
fastify.get('/api/helius/asset-proof/:assetId', async (request, reply) => {
  const { assetId } = request.params;
  
  if (!assetId) {
    return reply.code(400).send({ 
      success: false,
      error: 'Asset ID is required' 
    });
  }
  
  // Add caching wrapper to avoid multiple requests for the same asset
  const cacheKey = `asset-proof-${assetId}`;
  const assetCache = require('./asset-cache'); // Import the cache module
  
  // Try to get from cache first
  const cachedProofData = assetCache.getProofData(assetId);
  if (cachedProofData) {
    console.log(`[Asset Cache] Hit for proof data: ${assetId}`);
    console.log(`[Delegated Transfer] Using cached proof data for: ${assetId}`);
    return {
      success: true,
      data: cachedProofData
    };
  }
  
  try {
    console.log(`[Delegated Transfer] Fetching proof data for asset: ${assetId}`);
    fastify.log.info(`[Helius API] Fetching proof data for asset: ${assetId}`);
    
    // Method 1: Try the enhanced implementation first
    try {
      fastify.log.info(`[Helius API] Attempt 1: Using delegatedTransfer module`);
      const proofData = await delegatedTransfer.fetchAssetProof(assetId);
      
      if (proofData && proofData.proof && Array.isArray(proofData.proof)) {
        fastify.log.info(`[Helius API] Successfully fetched proof using delegatedTransfer`);
        
        // Cache the proof data
        assetCache.cacheProofData(assetId, proofData);
        
        // Return the proof data wrapped in a success response
        return {
          success: true,
          data: proofData
        };
      } else {
        fastify.log.warn(`[Helius API] delegatedTransfer failed to provide valid proof data`);
        throw new Error('Invalid proof data from delegatedTransfer');
      }
    } catch (method1Error) {
      fastify.log.warn(`[Helius API] Method 1 failed: ${method1Error.message}`);
    }
    
    // Method 2: Fall back to the original heliusApi module
    try {
      fastify.log.info(`[Helius API] Attempt 2: Using original heliusApi module`);
      const proofData = await heliusApi.fetchAssetProof(assetId);
      
      if (proofData && proofData.proof && Array.isArray(proofData.proof)) {
        fastify.log.info(`[Helius API] Successfully fetched proof using heliusApi`);
        
        // Cache the proof data
        assetCache.cacheProofData(assetId, proofData);
        
        // Return the proof data wrapped in a success response
        return {
          success: true,
          data: proofData
        };
      } else {
        fastify.log.warn(`[Helius API] heliusApi failed to provide valid proof data`);
        throw new Error('Invalid proof data from heliusApi');
      }
    } catch (method2Error) {
      fastify.log.warn(`[Helius API] Method 2 failed: ${method2Error.message}`);
    }
    
    // Method 3: Direct RPC call as last resort
    try {
      fastify.log.info(`[Helius API] Attempt 3: Using direct RPC call`);
      
      const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
      
      const response = await axios.post(HELIUS_RPC_URL, {
        jsonrpc: '2.0',
        id: 'helius-js',
        method: 'getAssetProof',
        params: {
          id: assetId
        }
      });
      
      if (response.data && response.data.result && response.data.result.proof) {
        fastify.log.info(`[Helius API] Successfully fetched proof using direct RPC call`);
        
        // Cache the proof data
        assetCache.cacheProofData(assetId, response.data.result);
        
        // Return the proof data wrapped in a success response
        return {
          success: true,
          data: response.data.result
        };
      } else {
        fastify.log.warn(`[Helius API] Direct RPC call failed to provide valid proof data`);
        throw new Error('Invalid proof data from direct RPC call');
      }
    } catch (method3Error) {
      fastify.log.warn(`[Helius API] Method 3 failed: ${method3Error.message}`);
    }
    
    // If all methods fail, return a more detailed error
    fastify.log.error(`[Helius API] All proof fetching methods failed for asset: ${assetId}`);
    return reply.code(404).send({
      success: false,
      error: 'Asset proof not found after multiple attempts',
      message: 'All three proof fetching methods failed',
      assetId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Enhanced error response with more diagnostic information
    fastify.log.error(`[Helius API] Fatal error fetching asset proof: ${error.message}`);
    
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch asset proof',
      message: error.message,
      details: `General error in asset proof endpoint. This could be due to rate limiting, network issues, or invalid asset ID.`,
      assetId,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Asset Diagnostics Endpoint
 * Provides comprehensive details about an asset, including proof data and troubleshooting info
 */
fastify.get('/api/asset/diagnostic/:assetId', async (request, reply) => {
  const { assetId } = request.params;
  console.log(`[Diagnostic API] Running comprehensive analysis for asset: ${assetId}`);
  
  try {
    // Step 1: Get asset details
    console.log(`[Diagnostic API] Fetching asset details for ${assetId}`);
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      return reply.code(404).send({ 
        success: false, 
        error: 'Asset not found',
        assetId
      });
    }

    // Step 2: Get proof data using multiple methods
    let proofData = null;
    let proofError = null;
    let proofMethod = null;
    
    try {
      // Method 1: Standard Helius getAssetProof
      console.log(`[Diagnostic API] Method 1: Using Helius getAssetProof for ${assetId}`);
      proofData = await heliusApi.fetchAssetProof(assetId);
      proofMethod = 'helius-standard';
      console.log(`[Diagnostic API] Successfully obtained proof data using standard method`);
    } catch (error) {
      console.warn(`[Diagnostic API] Standard proof method failed: ${error.message}`);
      proofError = error.message;
      
      // Method 2: Try delegated transfer module
      try {
        console.log(`[Diagnostic API] Method 2: Using delegated transfer module`);
        
        // Get proof through delegatedTransfer's specialized method
        const delegatedTransfer = require('./delegated-cnft-transfer');
        proofData = await delegatedTransfer.fetchAssetProof(assetId);
        proofMethod = 'delegated-transfer';
        console.log(`[Diagnostic API] Successfully obtained proof data using delegated transfer module`);
      } catch (error2) {
        console.warn(`[Diagnostic API] Delegated transfer module method failed: ${error2.message}`);
        
        // Method 3: Try RPC direct call with custom parameters
        try {
          console.log(`[Diagnostic API] Method 3: Using direct RPC call`);
          
          // Make direct RPC call to Helius
          const axios = require('axios');
          const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=' + process.env.HELIUS_API_KEY;
          const response = await axios.post(
            HELIUS_RPC_URL,
            {
              jsonrpc: '2.0',
              id: 'diagnostic-' + Date.now(),
              method: 'getAssetProof',
              params: { id: assetId }
            }
          );
          
          if (response.data && response.data.result) {
            proofData = response.data.result;
            proofMethod = 'direct-rpc';
            console.log(`[Diagnostic API] Successfully obtained proof data using direct RPC call`);
          } else {
            throw new Error('Invalid response from RPC call');
          }
        } catch (error3) {
          console.error(`[Diagnostic API] All proof fetch methods failed, cannot obtain proof data`);
          proofError = 'All proof fetch methods failed: ' + error.message;
        }
      }
    }
    
    // Step 3: Analyze compression suitability
    let compressionAnalysis = {
      isCompressed: assetDetails.compression?.compressed === true,
      hasProofData: !!proofData,
      validProofStructure: false,
      validLeafId: false,
      canProcessTransfer: false,
      treeId: assetDetails.compression?.tree || null
    };
    
    if (proofData) {
      // Check for critical proof structure
      compressionAnalysis.validProofStructure = Array.isArray(proofData.proof) || 
                                            (proofData.compression && Array.isArray(proofData.compression.proof));
      
      // Check for valid leaf ID which is critical for transfers
      const leafId = proofData.leaf_id || 
                     proofData.leafId || 
                     proofData.compression?.leaf_id || 
                     proofData.node_index;
                     
      compressionAnalysis.validLeafId = typeof leafId === 'number' || typeof leafId === 'string';
      
      // Overall assessment: can we process a transfer with this data
      compressionAnalysis.canProcessTransfer = compressionAnalysis.validProofStructure && 
                                             compressionAnalysis.validLeafId && 
                                             !!compressionAnalysis.treeId;
    }

    // Return comprehensive diagnostic data
    return reply.send({
      success: true,
      assetId,
      details: {
        asset: assetDetails,
        proof: proofData,
        proofMethod,
        proofError,
        compressionAnalysis,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error(`[Diagnostic API] Error analyzing asset:`, error);
    return reply.code(500).send({ 
      success: false, 
      error: error.message || 'Failed to analyze asset',
      assetId
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

// Original server-side transfer endpoints were replaced with improved versions near the end of the file

// Original transfer endpoint
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

// Route for standalone cNFT transfer page
fastify.get('/standalone', async (request, reply) => {
  fastify.log.info('Serving standalone cNFT transfer page');
  return reply.sendFile('standalone.html');
});

// Route for server-side cNFT transfer page
fastify.get('/server-side', async (request, reply) => {
  fastify.log.info('Serving server-side cNFT transfer page');
  return reply.sendFile('server-side-transfer.html');
});

// Route for ultra-minimal cNFT transfer page
fastify.get('/ultra', async (request, reply) => {
  fastify.log.info('Serving ultra-minimal cNFT transfer page');
  return reply.sendFile('ultra-minimal.html');
});

// Route for working cNFT transfer implementation
fastify.get('/working', async (request, reply) => {
  fastify.log.info('Serving working cNFT transfer implementation');
  return reply.sendFile('working-transfer.html');
});

// Route for pure manual cNFT transfer implementation
fastify.get('/pure', async (request, reply) => {
  fastify.log.info('Serving pure manual cNFT transfer implementation');
  return reply.sendFile('pure-browser-transfer.html');
});

// Route for direct CLI-based cNFT transfer implementation
fastify.get('/direct', async (request, reply) => {
  fastify.log.info('Serving direct CLI-based cNFT transfer page');
  return reply.sendFile('direct-cnft-transfer.html');
});

// Import server-side cNFT handler
const serverSideCnftHandler = require('./server-side-cnft-handler');

// Endpoint for generating a transfer transaction
fastify.post('/api/cnft/generate-transfer', async (request, reply) => {
  try {
    return await serverSideCnftHandler.processTransferRequest(request, reply);
  } catch (error) {
    fastify.log.error(`Error in generate-transfer endpoint: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Error generating transfer: ${error.message}`
    });
  }
});

// Endpoint for submitting a signed transaction
fastify.post('/api/cnft/submit-transaction', async (request, reply) => {
  try {
    return await serverSideCnftHandler.submitTransaction(request, reply);
  } catch (error) {
    fastify.log.error(`Error in submit-transaction endpoint: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Error submitting transaction: ${error.message}`
    });
  }
});

// New endpoint for direct CLI-based transfer
fastify.post('/api/cnft/direct-transfer', async (request, reply) => {
  try {
    const { encoded_private_key, asset_id, destination_address } = request.body;
    
    if (!encoded_private_key || !asset_id) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameters: encoded_private_key and asset_id are required'
      });
    }
    
    fastify.log.info(`Received direct-transfer request for asset ${asset_id}`);
    
    // Import required modules
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // Create command (don't log the private key!)
    let command = `node cli-transfer-cnft.js "${encoded_private_key}" "${asset_id}"`;
    
    // Add destination address if provided
    if (destination_address) {
      command += ` "${destination_address}"`;
    }
    
    fastify.log.info(`Executing CLI command for asset ${asset_id}`);
    
    // Execute the command with improved error handling
    fastify.log.info(`About to execute CLI transfer command`);
    try {
      const { stdout, stderr } = await execPromise(command);
      
      // Log the complete output for debugging
      fastify.log.info(`Command stdout: ${stdout}`);
      
      if (stderr) {
        fastify.log.error(`Command stderr: ${stderr}`);
        return reply.code(500).send({
          success: false,
          error: stderr
        });
      }
    } catch (execError) {
      fastify.log.error(`Command execution failed: ${execError.message}`);
      
      // Check if we have stderr in the execError
      if (execError.stderr) {
        fastify.log.error(`Command stderr from error: ${execError.stderr}`);
      }
      
      return reply.code(500).send({
        success: false,
        error: `Command execution failed: ${execError.message}`,
        details: execError.stderr || 'No additional error details'
      });
    }
    
    // Since we moved the stdout capture inside the try block, we need to define it here
    let stdout = '';
    
    // Ensure stdout is properly defined in the enclosing scope
    try {
      // Get the stdout value from the correct scope
      const lastResponse = await execPromise(command);
      stdout = lastResponse.stdout;
      
      // Parse the output to find transaction signature
      let signature = null;
      const signatureMatch = stdout.match(/Transaction Signature: ([a-zA-Z0-9]+)/);
      if (signatureMatch && signatureMatch[1]) {
        signature = signatureMatch[1];
      }
      
      // Check for success message
      const success = stdout.includes('Successfully transferred cNFT');
      
      fastify.log.info(`CLI command completed with success=${success}`);
      
      // If we have a signature but success is false, log this unusual state
      if (signature && !success) {
        fastify.log.warn(`Found signature ${signature} but success indicator is false. Full stdout: ${stdout}`);
      }
      
      return reply.code(200).send({
        success,
        output: stdout,
        signature,
        explorerUrl: signature ? `https://solscan.io/tx/${signature}` : null
      });
    } catch (error) {
      fastify.log.error(`Error parsing command output: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: `Error parsing command output: ${error.message}`,
        output: stdout || 'No output available'
      });
    }
  } catch (error) {
    fastify.log.error(`Error in direct-transfer endpoint: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Error with direct transfer: ${error.message}`
    });
  }
});

// Endpoint for fetching all assets for a wallet
fastify.get('/api/helius/wallet-assets/:walletAddress', async (request, reply) => {
  try {
    const { walletAddress } = request.params;
    
    if (!walletAddress) {
      return reply.code(400).send({
        success: false,
        error: 'Wallet address is required'
      });
    }
    
    fastify.log.info(`Fetching all NFTs for wallet: ${walletAddress}`);
    
    // Use Helius API to get the assets
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }
    
    fastify.log.info(`Fetching all NFTs for wallet: ${walletAddress} using RPC API`);
    
    // Make the RPC request
    const payload = {
      jsonrpc: '2.0',
      id: 'helius-assets',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: walletAddress,
        displayOptions: {
          showUnverifiedCollections: true,
          showCollectionMetadata: true,
          showFungible: true
        }
      }
    };
    
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
      payload
    );
    
    // Check if we got a valid response
    if (!response.data || !response.data.result || !response.data.result.items) {
      throw new Error('Invalid response format from Helius API');
    }
    
    // Extract the assets
    const assets = response.data.result.items;
    
    // Filter for compressed NFTs
    const compressedNFTs = assets.filter(asset => 
      asset.compression && asset.compression.compressed
    );
    
    fastify.log.info(`Found ${compressedNFTs.length} compressed NFTs out of ${assets.length} total assets`);
    
    return {
      success: true,
      data: assets,
      stats: {
        total: assets.length,
        compressed: compressedNFTs.length
      }
    };
  } catch (error) {
    fastify.log.error(`Error fetching wallet assets: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Error fetching wallet assets: ${error.message}`
    });
  }
});

// Catch-all route for SPA - always serve index.html
// But distinguish between API requests and frontend routes
fastify.setNotFoundHandler(async (request, reply) => {
  // If this is an API request that wasn't found, return a JSON error
  if (request.url.startsWith('/api/')) {
    fastify.log.warn(`API endpoint not found: ${request.url}`);
    return reply
      .code(404)
      .header('Content-Type', 'application/json')
      .send(JSON.stringify({
        success: false,
        error: `API endpoint not found: ${request.url}`
      }));
  }
  
  // Otherwise, serve the SPA
  fastify.log.info(`Not found handler for: ${request.url}, serving index.html`);
  return reply.sendFile('index.html', path.join(__dirname, 'templates'));
});

// Diagnostic endpoint for testing cNFT transfer issues
fastify.get('/api/cnft/diagnostic/:assetId', async (request, reply) => {
  // Set content type to JSON
  reply.type('application/json');
  
  try {
    const { assetId } = request.params;
    
    if (!assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Asset ID is required'
      });
    }
    
    fastify.log.info(`Running diagnostic tests for cNFT: ${assetId}`);
    
    // 1. Fetch asset details
    fastify.log.info(`Step 1: Fetching asset details...`);
    const assetDetails = await heliusApi.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      return reply.code(404).send({
        success: false,
        error: 'Asset not found via Helius API'
      });
    }
    
    // 2. Fetch the asset proof data
    fastify.log.info(`Step 2: Fetching proof data...`);
    const proofData = await heliusApi.fetchAssetProof(assetId);
    
    if (!proofData || !proofData.proof) {
      return reply.code(404).send({
        success: false,
        error: 'Proof data not available'
      });
    }
    
    // 3. Check for leaf_id or node_index
    let leafId = null;
    
    if (proofData.leaf_id !== undefined) {
      leafId = proofData.leaf_id;
      fastify.log.info(`Found leaf_id: ${leafId}`);
    } else if (proofData.node_index !== undefined) {
      leafId = proofData.node_index;
      fastify.log.info(`Found node_index: ${leafId}`);
    } else if (proofData.compression && proofData.compression.leaf_id !== undefined) {
      leafId = proofData.compression.leaf_id;
      fastify.log.info(`Found compression.leaf_id: ${leafId}`);
    } else if (proofData.compression && proofData.compression.node_index !== undefined) {
      leafId = proofData.compression.node_index;
      fastify.log.info(`Found compression.node_index: ${leafId}`);
    } else {
      fastify.log.warn(`No leaf_id or node_index found in proof data`);
    }
    
    // 4. Validate proof array
    let proofArrayValid = Array.isArray(proofData.proof);
    let proofArrayLength = proofData.proof ? proofData.proof.length : 0;
    
    fastify.log.info(`Proof array valid: ${proofArrayValid}, length: ${proofArrayLength}`);
    
    // 5. Return the diagnostic results
    return {
      success: true,
      diagnostics: {
        asset_found: true,
        proof_found: true,
        asset_id: assetId,
        tree_id: proofData.tree_id || (proofData.compression && proofData.compression.tree),
        leaf_id: leafId,
        proof_array_valid: proofArrayValid,
        proof_array_length: proofArrayLength,
        owner: assetDetails.ownership?.owner || 'Unknown',
        compression_data_present: !!proofData.compression,
        content_type: 'cNFT'
      },
      details: {
        asset: assetDetails,
        proof: proofData
      }
    };
  } catch (error) {
    fastify.log.error(`Error in diagnostic endpoint: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Diagnostic failed: ${error.message}`
    });
  }
});

// New robust endpoint for cNFT transfers that can handle incomplete proof data
fastify.post('/api/cnft/robust-transfer', async (request, reply) => {
  try {
    const { assetId, senderPrivateKey, destinationAddress } = request.body;
    
    if (!assetId || !senderPrivateKey) {
      return reply.code(400).send({
        success: false,
        error: 'Required parameters missing: assetId and senderPrivateKey are required'
      });
    }
    
    // Use our robust transfer implementation
    const bs58 = require('bs58');
    const { Keypair } = require('@solana/web3.js');
    
    // Create the sender keypair
    const secretKey = bs58.decode(senderPrivateKey);
    const senderKeypair = Keypair.fromSecretKey(secretKey);
    
    // For security, redact the private key in logs
    fastify.log.info({
      msg: 'Processing robust cNFT transfer',
      assetId,
      sender: senderKeypair.publicKey.toString(),
      destination: destinationAddress || PROJECT_WALLET
    });
    
    // Import our robust transfer module
    const { transferCnft } = require('./robust-cnft-transfer');
    
    // Attempt the transfer
    const result = await transferCnft(
      senderKeypair,
      assetId,
      destinationAddress || PROJECT_WALLET
    );
    
    if (result.success) {
      fastify.log.info({
        msg: 'cNFT transfer successful',
        assetId,
        signature: result.signature
      });
      
      return {
        success: true,
        message: 'Asset transferred successfully',
        data: {
          assetId,
          signature: result.signature,
          explorerUrl: `https://solscan.io/tx/${result.signature}`
        }
      };
    } else {
      fastify.log.error({
        msg: 'cNFT transfer failed',
        assetId,
        error: result.error
      });
      
      return {
        success: false,
        error: result.error,
        data: {
          assetId
        }
      };
    }
  } catch (error) {
    fastify.log.error({
      msg: 'Error in robust cNFT transfer endpoint',
      error: error.message,
      stack: error.stack
    });
    
    return reply.code(500).send({
      success: false,
      error: `Error in robust transfer: ${error.message}`
    });
  }
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
    let cachedProofData = null;
    
    // Check if the request has body data with cached proof data
    if (request.body && request.body.cachedProofData) {
      cachedProofData = request.body.cachedProofData;
      fastify.log.info(`Received cached proof data for ${assetId} in request`);
      console.log('Using provided cached proof data');
    }
    
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
      
      // Use cached proof data if available
      let proofData = null;
      
      if (cachedProofData) {
        fastify.log.info(`Using cached proof data for cNFT ${assetId}`);
        proofData = cachedProofData;
      } else {
        // Now get the proof data from Helius API
        const heliusApiKey = process.env.HELIUS_API_KEY;
        if (!heliusApiKey) {
          throw new Error('HELIUS_API_KEY environment variable is not set');
        }
        
        // Try to get proof from our asset-proof endpoint first (which has caching)
        try {
          fastify.log.info(`Trying to fetch proof from asset-proof endpoint for ${assetId}`);
          const proofEndpointResponse = await axios.get(
            `http://localhost:5001/api/helius/asset-proof/${assetId}`
          );
          
          if (proofEndpointResponse.data && proofEndpointResponse.data.success && proofEndpointResponse.data.data) {
            fastify.log.info(`Successfully fetched proof from asset-proof endpoint for ${assetId}`);
            proofData = proofEndpointResponse.data.data;
          }
        } catch (proofEndpointError) {
          fastify.log.warn(`Failed to fetch from asset-proof endpoint: ${proofEndpointError.message}`);
        }
        
        // Fallback to direct RPC call if endpoint approach failed
        if (!proofData) {
          // Make the request to Helius RPC API for proof data
          fastify.log.info(`Falling back to direct RPC call for proof data for ${assetId}`);
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
          
          proofData = proofResponse.data.result;
        }
      }
      
      fastify.log.info(`Successfully fetched/retrieved proof data for cNFT ${assetId}`);
      
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

// Note: Server transfer endpoints are already implemented directly in this file
// No need to register the module separately

// Import robust cNFT transfer implementation
const robustCnftTransfer = require('./robust-cnft-transfer');

// Endpoint for robust cNFT transfer
fastify.post('/api/robust-transfer', async (request, reply) => {
  try {
    return await robustCnftTransfer.processRobustTransferRequest(request, reply);
  } catch (error) {
    fastify.log.error(`Error in robust transfer endpoint: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to process robust transfer request',
      message: error.message
    });
  }
});

// Endpoint for diagnostic test on a cNFT
fastify.get('/api/diagnostic/:assetId', async (request, reply) => {
  try {
    return await robustCnftTransfer.processDiagnosticRequest(request, reply);
  } catch (error) {
    fastify.log.error(`Error in diagnostic endpoint: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to process diagnostic request',
      message: error.message
    });
  }
});

// Queue-based transfer endpoints
fastify.post('/api/queue/transfer-batch', async (request, reply) => {
  try {
    const { ownerAddress, assetIds, destinationAddress } = request.body;
    
    if (!ownerAddress || !assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return reply.code(400).send({
        success: false,
        error: 'Owner address and an array of asset IDs are required'
      });
    }
    
    fastify.log.info(`Queue transfer request received for ${assetIds.length} assets from ${ownerAddress}`);
    
    // Limit batch size to 10 assets per request
    const maxBatchSize = 10;
    if (assetIds.length > maxBatchSize) {
      return reply.code(400).send({
        success: false,
        error: `Batch size limit exceeded. Maximum ${maxBatchSize} assets per request.`
      });
    }
    
    // Queue the batch for processing
    const result = queueTransferManager.queueTransferBatch(
      ownerAddress, 
      assetIds, 
      destinationAddress
    );
    
    return {
      success: true,
      message: `Successfully queued ${assetIds.length} assets for transfer.`,
      batchId: result.batchId,
      queueStatus: result.queueStatus
    };
  } catch (error) {
    fastify.log.error(`Error queuing batch transfer: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to queue batch transfer',
      message: error.message
    });
  }
});

// Endpoint to check the status of a batch transfer
fastify.get('/api/queue/status/:batchId', async (request, reply) => {
  try {
    const { batchId } = request.params;
    
    if (!batchId) {
      return reply.code(400).send({
        success: false,
        error: 'Batch ID is required'
      });
    }
    
    const status = queueTransferManager.getBatchStatus(batchId);
    
    if (!status.success) {
      return reply.code(404).send({
        success: false,
        error: status.error || 'Batch not found'
      });
    }
    
    return status;
  } catch (error) {
    fastify.log.error(`Error checking batch status: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to check batch status',
      message: error.message
    });
  }
});

// Endpoint to check the overall queue status
fastify.get('/api/queue/status', async (request, reply) => {
  try {
    const status = queueTransferManager.getQueueStatus();
    return status;
  } catch (error) {
    fastify.log.error(`Error checking queue status: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Failed to check queue status',
      message: error.message
    });
  }
});

// =============================================================================
// Server-side Transfer API Routes are registered at the end of the file
// =============================================================================

// Delegated cNFT Transfer API Routes
// =============================================================================

/**
 * Process a delegated cNFT transfer
 * Handles transfer of a cNFT using delegation authority
 */
fastify.post('/api/delegate/transfer', async (request, reply) => {
  try {
    const { assetId, ownerAddress, signedMessage, delegateAddress, destinationAddress, proofData } = request.body;
    
    // Validate required parameters
    if (!assetId || !ownerAddress || !signedMessage) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameters: assetId, ownerAddress, and signedMessage are required'
      });
    }
    
    // Log if proofData was provided
    if (proofData) {
      fastify.log.info(`Proof data provided by client for asset ${assetId}`);
    } else {
      fastify.log.warn(`No proof data provided by client for asset ${assetId}, will fetch server-side`);
    }
    
    fastify.log.info(`Processing delegated transfer for asset: ${assetId}`);
    
    const result = await delegatedTransfer.processDelegatedTransfer(
      assetId,
      ownerAddress,
      signedMessage,
      delegateAddress,
      destinationAddress,
      proofData
    );
    
    return result;
  } catch (error) {
    fastify.log.error(`Error processing delegated transfer: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Error processing delegated transfer'
    });
  }
});

/**
 * Alternative endpoint for delegated transfers that matches the client component
 */
fastify.post('/api/delegated-transfer', async (request, reply) => {
  try {
    const { assetId, sender, signedMessage, delegateAddress, destinationAddress, proofData } = request.body;
    
    // Validate required parameters
    if (!assetId || !sender || !signedMessage) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameters: assetId, sender, and signedMessage are required'
      });
    }
    
    // Log if proofData was provided
    if (proofData) {
      fastify.log.info(`Proof data provided by client for asset ${assetId}`);
    } else {
      fastify.log.warn(`No proof data provided by client for asset ${assetId}, will fetch server-side`);
    }
    
    fastify.log.info(`Processing delegated transfer via /api/delegated-transfer for asset: ${assetId}`);
    
    // Pass the proof data to the processDelegatedTransfer function
    const result = await delegatedTransfer.processDelegatedTransfer(
      assetId,
      sender,
      signedMessage,
      delegateAddress,
      destinationAddress,
      proofData
    );
    
    return result;
  } catch (error) {
    fastify.log.error(`Error processing delegated transfer: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Error processing delegated transfer'
    });
  }
});

/**
 * Verify if a wallet has delegate authority for a cNFT
 */
fastify.get('/api/delegate/verify/:assetId/:delegateAddress', async (request, reply) => {
  try {
    const { assetId, delegateAddress } = request.params;
    
    if (!assetId || !delegateAddress) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameters: assetId and delegateAddress are required'
      });
    }
    
    fastify.log.info(`Verifying delegate authority for asset: ${assetId}, delegate: ${delegateAddress}`);
    
    const isValidDelegate = await delegatedTransfer.verifyDelegateAuthority(assetId, delegateAddress);
    
    return {
      success: true,
      assetId,
      delegateAddress,
      isValidDelegate
    };
  } catch (error) {
    fastify.log.error(`Error verifying delegate authority: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Error verifying delegate authority'
    });
  }
});

/**
 * Get delegation info for a cNFT
 */
fastify.get('/api/delegate/info/:assetId', async (request, reply) => {
  try {
    const { assetId } = request.params;
    
    if (!assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameter: assetId'
      });
    }
    
    fastify.log.info(`Fetching delegation info for asset: ${assetId}`);
    
    const assetDetails = await delegatedTransfer.fetchAssetDetails(assetId);
    
    if (!assetDetails) {
      return reply.code(404).send({
        success: false,
        error: 'Asset not found or details unavailable'
      });
    }
    
    // Extract delegation information
    const delegationInfo = {
      assetId,
      owner: assetDetails.ownership?.owner || null,
      delegated: assetDetails.ownership?.delegated || false,
      delegate: assetDetails.ownership?.delegate || null
    };
    
    return {
      success: true,
      delegationInfo
    };
  } catch (error) {
    fastify.log.error(`Error fetching delegation info: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Error fetching delegation info'
    });
  }
});

/**
 * Get asset proof data for a cNFT
 * This is required for transferring compressed NFTs
 */
fastify.get('/api/delegate/proof/:assetId', async (request, reply) => {
  try {
    const { assetId } = request.params;
    
    if (!assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameter: assetId'
      });
    }
    
    fastify.log.info(`Fetching proof data for asset: ${assetId}`);
    
    const proofData = await delegatedTransfer.fetchAssetProof(assetId);
    
    if (!proofData) {
      return reply.code(404).send({
        success: false,
        error: 'Asset proof not found or unavailable'
      });
    }
    
    return {
      success: true,
      proofData
    };
  } catch (error) {
    fastify.log.error(`Error fetching asset proof: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Error fetching asset proof'
    });
  }
});

// This endpoint is now implemented at the top of the file
// DO NOT UNCOMMENT - keeping for reference only
/*
fastify.get('/api/asset/diagnostic/:assetId', async (request, reply) => {
  try {
    const { assetId } = request.params;
    
    if (!assetId) {
      return reply.code(400).send({
        success: false,
        error: 'Asset ID is required'
      });
    }
    
    fastify.log.info(`[Asset Diagnostic] Running analysis for asset: ${assetId}`);
    
    // Step 1: Fetch asset details from multiple sources
    let assetDetails = null;
    try {
      fastify.log.info(`[Asset Diagnostic] Step 1: Fetching asset details`);
      assetDetails = await delegatedTransfer.fetchAssetDetails(assetId);
      fastify.log.info(`[Asset Diagnostic] Asset details fetched: ${assetDetails ? 'Success' : 'Failed'}`);
    } catch (step1Error) {
      fastify.log.error(`[Asset Diagnostic] Error fetching asset details: ${step1Error.message}`);
    }
    
    // Step 2: Fetch proof data from all possible sources
    fastify.log.info(`[Asset Diagnostic] Step 2: Fetching proof data from multiple sources`);
    
    // Try the delegated transfer module
    let delegatedProofData = null;
    try {
      fastify.log.info(`[Asset Diagnostic] Fetching proof via delegated transfer module`);
      delegatedProofData = await delegatedTransfer.fetchAssetProof(assetId);
      fastify.log.info(`[Asset Diagnostic] Delegated proof fetch: ${delegatedProofData ? 'Success' : 'Failed'}`);
    } catch (delegatedError) {
      fastify.log.error(`[Asset Diagnostic] Error in delegated proof fetch: ${delegatedError.message}`);
    }
    
    // Try direct Helius API
    let directProofData = null;
    try {
      fastify.log.info(`[Asset Diagnostic] Fetching proof via direct Helius RPC`);
      const response = await axios.post(HELIUS_RPC_URL, {
        jsonrpc: '2.0',
        id: 'helius-js',
        method: 'getAssetProof',
        params: {
          id: assetId
        }
      });
      
      if (response.data && response.data.result) {
        directProofData = response.data.result;
        fastify.log.info(`[Asset Diagnostic] Direct proof fetch: Success`);
      } else {
        fastify.log.error(`[Asset Diagnostic] Direct proof fetch: Failed (No valid response data)`);
      }
    } catch (directError) {
      fastify.log.error(`[Asset Diagnostic] Error in direct proof fetch: ${directError.message}`);
    }
    
    // Step 3: Try DAS API as a last resort
    let dasProofData = null;
    try {
      fastify.log.info(`[Asset Diagnostic] Fetching asset via DAS API`);
      const dasResponse = await axios.get(`https://api.helius.xyz/v0/assets/${assetId}?api-key=${HELIUS_API_KEY}`);
      
      if (dasResponse.data && dasResponse.data.compression) {
        dasProofData = {
          tree_id: dasResponse.data.compression.tree,
          leaf_id: dasResponse.data.compression.leaf_id || dasResponse.data.compression.leaf_index,
          compression: dasResponse.data.compression,
          // Other fields may be missing
        };
        fastify.log.info(`[Asset Diagnostic] DAS API fetch: Success`);
      } else {
        fastify.log.error(`[Asset Diagnostic] DAS API fetch: Failed (No valid compression data)`);
      }
    } catch (dasError) {
      fastify.log.error(`[Asset Diagnostic] Error in DAS API fetch: ${dasError.message}`);
    }
    
    // Step 4: Analyze what we've got and see what's usable
    const proofAnalysis = {
      delegated_method: {
        success: !!delegatedProofData,
        has_proof_array: delegatedProofData && Array.isArray(delegatedProofData.proof),
        proof_array_length: delegatedProofData && delegatedProofData.proof ? delegatedProofData.proof.length : 0,
        has_tree_id: !!delegatedProofData?.tree_id,
        has_leaf_id: delegatedProofData?.leaf_id !== undefined || delegatedProofData?.node_index !== undefined
      },
      direct_method: {
        success: !!directProofData,
        has_proof_array: directProofData && Array.isArray(directProofData.proof),
        proof_array_length: directProofData && directProofData.proof ? directProofData.proof.length : 0,
        has_tree_id: !!directProofData?.tree_id,
        has_leaf_id: directProofData?.leaf_id !== undefined || directProofData?.node_index !== undefined
      },
      das_method: {
        success: !!dasProofData,
        has_compression: !!dasProofData?.compression,
        has_tree_id: !!dasProofData?.tree_id,
        has_leaf_id: dasProofData?.leaf_id !== undefined
      }
    };
    
    // Step 5: Construct the most complete proof data possible
    const bestProofData = delegatedProofData || directProofData || dasProofData || null;
    
    return {
      success: true,
      asset_id: assetId,
      methods_tried: ['delegated_transfer', 'direct_helius', 'das_api'],
      analysis: proofAnalysis,
      asset_found: !!assetDetails,
      proof_found: !!bestProofData,
      best_available_method: delegatedProofData ? 'delegated_transfer' : 
                            (directProofData ? 'direct_helius' : 
                            (dasProofData ? 'das_api' : 'none')),
      details: {
        asset: assetDetails,
        proof: bestProofData
      }
    };
  } catch (error) {
    fastify.log.error(`[Asset Diagnostic] Fatal error: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Error running asset diagnostic: ${error.message}`
    });
  }
});
*/

// Improved server-side transfer endpoints
// These endpoints are designed to avoid TransactionInstruction dependency in the browser

// Prepare transaction endpoint
fastify.post('/api/server-transfer/prepare', async (request, reply) => {
  try {
    fastify.log.info(`[SERVER] Preparing server-side transfer transaction`);
    return await serverTransfer.prepareTransferTransaction(request, reply);
  } catch (error) {
    fastify.log.error(`[SERVER] Error preparing transfer: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Server error preparing transaction: ${error.message}`
    });
  }
});

// Submit transaction endpoint
fastify.post('/api/server-transfer/submit', async (request, reply) => {
  try {
    const { signedTransaction, assetId } = request.body;
    
    if (!signedTransaction) {
      return reply.code(400).send({
        success: false,
        error: "Missing signed transaction"
      });
    }
    
    // Log the request
    fastify.log.info(`[SERVER] Submitting transfer for asset ${assetId}`);
    
    // Submit the signed transaction
    return await serverTransfer.submitSignedTransaction(request, reply);
  } catch (error) {
    fastify.log.error(`[SERVER] Error submitting transfer: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: `Server error submitting transaction: ${error.message}`
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