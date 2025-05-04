/**
 * Robust cNFT Transfer Implementation
 * 
 * This server-side script provides a more resilient approach to transferring cNFTs
 * when standard methods fail due to incomplete proof data. It leverages multiple
 * fallback methods and enhanced error handling.
 */

const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { 
  createTransferInstruction,
  BUBBLEGUM_PROGRAM_ID, 
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  MetadataArgs,
  TokenProgramVersion,
  TokenStandard
} = require('@metaplex-foundation/mpl-bubblegum');
const { heliusApiKey, quicknodeRpcUrl } = require('./config');
const bs58 = require('bs58');
const { fetchAssetDetails, fetchAssetProof } = require('./helius-api');

// Default project wallet for sending cNFTs to (for trash functionality)
const PROJECT_WALLET = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');

// Connection to Solana - with multiple fallback options
let connection;

/**
 * Get a Solana connection with fallbacks
 * @returns {Promise<Connection>} - A connected Solana connection
 */
async function getConnection() {
  if (connection) return connection;
  
  console.log('Creating new Solana connection');
  
  // Try QuickNode RPC first (preferred for good performance)
  if (quicknodeRpcUrl) {
    try {
      connection = new Connection(quicknodeRpcUrl, 'confirmed');
      await connection.getVersion();
      console.log('Connected to Solana using QuickNode RPC');
      return connection;
    } catch (err) {
      console.warn('QuickNode RPC connection failed, falling back to Helius', err);
    }
  }
  
  // Try Helius RPC next
  if (heliusApiKey) {
    try {
      const heliusRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      connection = new Connection(heliusRpcUrl, 'confirmed');
      await connection.getVersion();
      console.log('Connected to Solana using Helius RPC');
      return connection;
    } catch (err) {
      console.warn('Helius RPC connection failed, falling back to public RPC', err);
    }
  }
  
  // Final fallback to public RPC (slowest, rate-limited)
  connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  await connection.getVersion();
  console.log('Connected to Solana using public RPC (fallback)');
  return connection;
}

/**
 * Get enhanced proof data by filling in any missing fields from the asset data
 * @param {object} proofData - The proof data from Helius API
 * @param {string} assetId - The asset ID for context
 * @returns {object} - The enhanced proof data
 */
function enhanceProofData(proofData, assetId) {
  if (!proofData) {
    throw new Error(`No proof data available for asset ${assetId}`);
  }

  // Create a deep copy to avoid modifying the original
  const enhancedProof = JSON.parse(JSON.stringify(proofData));
  
  // Ensure leaf_id exists - use node_index as fallback
  if (!enhancedProof.leaf_id && enhancedProof.node_index) {
    console.log(`[Robust] Using node_index as leaf_id for ${assetId}: ${enhancedProof.node_index}`);
    enhancedProof.leaf_id = enhancedProof.node_index;
  }
  
  // Ensure tree_id exists
  if (!enhancedProof.tree_id && enhancedProof.compression?.tree) {
    console.log(`[Robust] Using compression.tree as tree_id for ${assetId}`);
    enhancedProof.tree_id = enhancedProof.compression.tree;
  }
  
  // Ensure compression data exists
  if (!enhancedProof.compression) {
    console.log(`[Robust] Creating compression object for ${assetId}`);
    enhancedProof.compression = {
      tree: enhancedProof.tree_id,
      leaf_id: enhancedProof.leaf_id,
      proof: enhancedProof.proof || []
    };
  }
  
  // Validate proof array
  if (!Array.isArray(enhancedProof.proof) || enhancedProof.proof.length === 0) {
    if (Array.isArray(enhancedProof.compression?.proof) && enhancedProof.compression.proof.length > 0) {
      console.log(`[Robust] Using compression.proof as fallback for ${assetId}`);
      enhancedProof.proof = enhancedProof.compression.proof;
    } else {
      throw new Error(`No valid proof array found for asset ${assetId}`);
    }
  }
  
  return enhancedProof;
}

/**
 * Transfer a cNFT using our robust approach with fallback methods
 * @param {Keypair} senderKeypair - The sender's keypair (with private key)
 * @param {string} assetId - The asset ID to transfer
 * @param {string} receiverAddress - Where to send the cNFT (defaults to project wallet)
 * @returns {Promise<object>} - The result of the transfer operation
 */
async function transferCnft(senderKeypair, assetId, receiverAddress = PROJECT_WALLET.toString()) {
  try {
    console.log(`[Robust] Starting robust transfer for ${assetId}`);
    console.log(`[Robust] From: ${senderKeypair.publicKey.toString()}`);
    console.log(`[Robust] To: ${receiverAddress}`);
    
    // Get connection with fallbacks
    const conn = await getConnection();
    
    // Ensure receiver is a PublicKey
    const receiverPublicKey = new PublicKey(receiverAddress);
    
    // Get asset details
    console.log(`[Robust] Fetching asset details for ${assetId}`);
    const assetData = await fetchAssetDetails(assetId);
    if (!assetData) {
      throw new Error(`Asset data not found for ${assetId}`);
    }
    
    // Get and enhance proof data
    console.log(`[Robust] Fetching proof data for ${assetId}`);
    let proofData = await fetchAssetProof(assetId);
    proofData = enhanceProofData(proofData, assetId);
    
    // Verify asset ownership
    const currentOwner = assetData.ownership?.owner || 
                         (assetData.ownership?.owner_address) || 
                         assetData.owner;
    if (!currentOwner) {
      throw new Error(`Owner not found in asset data for ${assetId}`);
    }
    
    // Convert to PublicKey
    const currentOwnerPubkey = new PublicKey(currentOwner);
    
    // Confirm the sender is the owner
    if (currentOwnerPubkey.toString() !== senderKeypair.publicKey.toString()) {
      throw new Error(`Sender ${senderKeypair.publicKey.toString()} is not the owner of asset ${assetId}`);
    }
    
    // Get merkle tree address
    const treeAddress = new PublicKey(proofData.tree_id || proofData.compression?.tree);
    console.log(`[Robust] Tree address: ${treeAddress.toString()}`);
    
    // Derive tree authority
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treeAddress.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    console.log(`[Robust] Tree authority: ${treeAuthority.toString()}`);
    
    // Create the transfer instruction
    const transferIx = createTransferInstruction(
      {
        merkleTree: treeAddress,
        treeAuthority,
        leafOwner: senderKeypair.publicKey,
        leafDelegate: senderKeypair.publicKey,
        newLeafOwner: receiverPublicKey,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        anchorRemainingAccounts: proofData.proof.map(node => ({
          pubkey: new PublicKey(node),
          isSigner: false,
          isWritable: false
        }))
      },
      {
        root: [...Buffer.from(bs58.decode(proofData.root))],
        dataHash: [...Buffer.from(bs58.decode(proofData.leaf || proofData.asset_hash || proofData.data_hash))],
        creatorHash: [...Buffer.from(bs58.decode(proofData.creator_hash || proofData.creator_hash_v1 || '11111111111111111111111111111111'))],
        nonce: proofData.leaf_id,
        index: proofData.leaf_id
      },
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Create and sign the transaction
    const tx = new Transaction().add(transferIx);
    tx.feePayer = senderKeypair.publicKey;
    
    // Get recent blockhash
    const { blockhash } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    
    // Sign the transaction
    const signedTx = await tx.sign(senderKeypair);
    
    // Send the transaction
    console.log(`[Robust] Sending transaction`);
    const signature = await conn.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: true,
      preflightCommitment: 'confirmed'
    });
    
    // Wait for confirmation
    console.log(`[Robust] Waiting for confirmation: ${signature}`);
    const confirmation = await conn.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight: (await conn.getBlockHeight()) + 50
    }, 'confirmed');
    
    // Check for errors
    if (confirmation.value.err) {
      throw new Error(`Transaction confirmed but failed: ${confirmation.value.err}`);
    }
    
    // Generate explorer URL
    const explorerUrl = `https://solscan.io/tx/${signature}`;
    
    console.log(`[Robust] Transfer successful: ${explorerUrl}`);
    return {
      success: true,
      signature,
      explorerUrl,
      message: `Successfully transferred cNFT ${assetId} to ${receiverAddress}`
    };
  } catch (error) {
    console.error(`[Robust] Transfer failed: ${error.message}`, error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred during transfer',
      assetId
    };
  }
}

/**
 * Process a robust transfer request from the API
 * @param {object} req - The express request object
 * @param {object} res - The express response object
 */
async function processRobustTransferRequest(req, res) {
  try {
    const { assetId, senderPrivateKey, destinationAddress } = req.body;
    
    // Validate inputs
    if (!assetId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Asset ID is required' 
      });
    }
    
    if (!senderPrivateKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sender private key is required' 
      });
    }
    
    // Create keypair from private key
    const senderKeypair = Keypair.fromSecretKey(
      Buffer.from(bs58.decode(senderPrivateKey))
    );
    
    // Use default project wallet if destination not specified
    const receiverAddress = destinationAddress || PROJECT_WALLET.toString();
    
    // Perform the transfer
    const result = await transferCnft(senderKeypair, assetId, receiverAddress);
    
    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        data: {
          signature: result.signature,
          explorerUrl: result.explorerUrl
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Robust transfer request failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

/**
 * Run diagnostic tests on a cNFT to identify issues
 * @param {string} assetId - The asset ID to diagnose
 * @returns {Promise<object>} - Diagnostic information
 */
async function runDiagnostic(assetId) {
  try {
    console.log(`Running diagnostic tests for cNFT: ${assetId}`);
    
    // Step 1: Fetch asset details
    console.log(`Step 1: Fetching asset details...`);
    const assetData = await fetchAssetDetails(assetId);
    
    if (!assetData) {
      return {
        success: false,
        error: `Asset not found: ${assetId}`
      };
    }
    
    // Step 2: Fetch proof data
    console.log(`Step 2: Fetching proof data...`);
    const proofData = await fetchAssetProof(assetId);
    
    // Extract key information for diagnostics
    const diagnostics = {
      asset_found: !!assetData,
      proof_found: !!proofData,
      asset_id: assetId,
      tree_id: proofData?.tree_id || proofData?.compression?.tree,
      leaf_id: proofData?.leaf_id || proofData?.node_index,
      proof_array_valid: Array.isArray(proofData?.proof) || Array.isArray(proofData?.compression?.proof),
      proof_array_length: (proofData?.proof || proofData?.compression?.proof || []).length,
      owner: assetData?.ownership?.owner || assetData?.owner,
      compression_data_present: !!proofData?.compression,
      content_type: assetData?.content?.metadata?.token_standard ? 'cNFT' : 'Unknown'
    };
    
    if (diagnostics.leaf_id) {
      console.log(`Found leaf_id: ${diagnostics.leaf_id}`);
    }
    
    console.log(`Proof array valid: ${diagnostics.proof_array_valid}, length: ${diagnostics.proof_array_length}`);
    
    return {
      success: true,
      diagnostics,
      details: {
        asset: assetData,
        proof: proofData
      }
    };
  } catch (error) {
    console.error(`Diagnostic error: ${error.message}`, error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred during diagnostic'
    };
  }
}

/**
 * Process a diagnostic request from the API
 * @param {object} req - The express request object
 * @param {object} res - The express response object
 */
async function processDiagnosticRequest(req, res) {
  try {
    const assetId = req.params.assetId;
    
    if (!assetId) {
      return res.status(400).json({
        success: false,
        error: 'Asset ID is required'
      });
    }
    
    const result = await runDiagnostic(assetId);
    return res.json(result);
  } catch (error) {
    console.error('Diagnostic request failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

module.exports = {
  transferCnft,
  processRobustTransferRequest,
  processDiagnosticRequest,
  runDiagnostic,
  enhanceProofData,
  getConnection
};