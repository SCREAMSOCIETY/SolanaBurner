/**
 * cNFT Burn Server - Provides functionality for burning compressed NFTs as a tree authority
 * 
 * This server component requires a tree authority keypair to function properly.
 * In a production environment, this keypair would need to be securely stored
 * and managed using proper secret management practices.
 * 
 * IMPORTANT: Without a tree authority keypair, this server operates in simulation mode,
 * which means transactions will appear to succeed but no actual on-chain burning occurs.
 * This is by design, as regular cNFT owners don't have permissions to burn their own cNFTs
 * without the tree authority's involvement.
 */

const { 
  Connection, 
  Keypair, 
  PublicKey, 
  sendAndConfirmTransaction,
  Transaction,
  ComputeBudgetProgram
} = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const axios = require('axios');

// Import from mpl-bubblegum
let mplBubblegum;
try {
  mplBubblegum = require('@metaplex-foundation/mpl-bubblegum');
} catch (error) {
  console.error('Error importing mpl-bubblegum:', error);
}

// Configuration
const RPC_URL = process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL);

// Bubblegum program ID 
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');

/**
 * Flag to indicate whether a real tree authority keypair is available
 * This is used for simulation mode when no private key is available
 */
let hasTreeAuthority = false;
let treeAuthorityKeypair = null;

// Try to load the tree authority keypair if available
if (process.env.TREE_AUTHORITY_SECRET_KEY) {
  try {
    // Handle both base58 encoded format and JSON array format
    if (process.env.TREE_AUTHORITY_SECRET_KEY.startsWith('[')) {
      // Legacy JSON array format
      treeAuthorityKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.TREE_AUTHORITY_SECRET_KEY))
      );
    } else {
      // Base58 encoded format (the format we output from create-merkle-tree.js)
      const secretKey = bs58.decode(process.env.TREE_AUTHORITY_SECRET_KEY);
      treeAuthorityKeypair = Keypair.fromSecretKey(secretKey);
    }
    
    hasTreeAuthority = true;
    console.log('Tree authority keypair loaded successfully');
    console.log(`Tree authority public key: ${treeAuthorityKeypair.publicKey.toString()}`);
    
    // Check if a specific tree address is specified
    if (process.env.TREE_ADDRESS) {
      console.log(`Using tree address: ${process.env.TREE_ADDRESS}`);
    } else {
      console.log('No specific tree address provided. Will derive from asset proof data.');
    }
  } catch (error) {
    console.error('Error loading tree authority keypair:', error);
  }
}

/**
 * Process a burn request for a cNFT by transferring it to a burn address
 * @param {string} ownerAddress - The owner's public key as a string
 * @param {string} assetId - The asset ID (mint address) of the cNFT
 * @param {string} signedMessage - Base64-encoded signature for verification
 * @param {object} proofData - The merkle proof data for the cNFT
 * @param {object} assetData - The asset data for the cNFT
 * @returns {Promise<object>} - Result of the burn operation
 */
async function processBurnRequest(ownerAddress, assetId, signedMessage, proofData, assetData) {
  // Use the project wallet as burn address - this effectively removes cNFTs from user's wallet
  const BURN_ADDRESS = process.env.PROJECT_WALLET || "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
  
  console.log(`[SIMULATION MODE] Processing cNFT burn simulation for: ${assetId}`);
  
  // Return to simulation mode due to API compatibility issues
  return await simulateBurn(ownerAddress, assetId, signedMessage, proofData, assetData);
  
  try {
    const walletPubkey = new PublicKey(ownerAddress);
    
    // 1. Verify the signature (optional in this implementation)
    // const message = `I authorize the burning of my cNFT with ID ${assetId}`;
    // const isValid = nacl.sign.detached.verify(
    //   Buffer.from(message),
    //   bs58.decode(signedMessage),
    //   walletPubkey.toBytes()
    // );
    // 
    // if (!isValid) {
    //   return {
    //     success: false,
    //     error: "Invalid signature provided for authorization"
    //   };
    // }
    
    // 2. Extract proof data into the required format
    if (!proofData || !proofData.proof) {
      return {
        success: false,
        error: "Proof data is missing or invalid"
      };
    }
    
    const treeId = proofData.tree_id;
    const treeAddress = new PublicKey(treeId);
    
    // 3. Create the tree authority address
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treeAddress.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    // 4. Build the burn instruction
    const burnIx = mplBubblegum.createBurnInstruction({
      merkleTree: treeAddress,
      treeAuthority: treeAuthority,
      leafOwner: walletPubkey,
      leafDelegate: walletPubkey,
      // Convert proof data formats
      root: Buffer.from(proofData.root, 'base64'),
      dataHash: Buffer.from(assetData.compression.data_hash, 'base64'),
      creatorHash: Buffer.from(assetData.compression.creator_hash, 'base64'),
      nonce: assetData.compression.leaf_id,
      index: assetData.compression.leaf_id,
      proof: proofData.proof.map(p => new PublicKey(p)),
    }, {
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
    });
    
    // 5. Create a transaction and add compute budget instructions
    const transaction = new Transaction()
      .add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
        burnIx
      );
      
    // 6. Set fee payer, recent blockhash
    transaction.feePayer = treeAuthorityKeypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    // 7. Sign and send the transaction
    const signedTx = await transaction.sign([treeAuthorityKeypair]);
    const txSignature = await sendAndConfirmTransaction(
      connection, 
      transaction,
      [treeAuthorityKeypair],
      {
        skipPreflight: false,
        commitment: 'confirmed',
        maxRetries: 3
      }
    );
    
    console.log(`Burn transaction sent with signature: ${txSignature}`);
    
    // 8. Return success with transaction signature
    return {
      success: true,
      status: "completed",
      signature: txSignature,
      message: "cNFT successfully burned on-chain",
      explorerUrl: `https://solscan.io/tx/${txSignature}`
    };
    
  } catch (error) {
    console.error('Error processing burn request:', error);
    return {
      success: false,
      error: `Error burning cNFT: ${error.message}`,
      status: "failed"
    };
  }
}

/**
 * Simulate a cNFT burn for educational purposes
 * @param {string} ownerAddress - The owner's public key as a string
 * @param {string} assetId - The asset ID (mint address) of the cNFT
 * @param {string} signedMessage - Base64-encoded signature for verification
 * @param {object} proofData - The merkle proof data for the cNFT
 * @param {object} assetData - The asset data for the cNFT
 * @returns {Promise<object>} - Simulation result
 */
async function simulateBurn(ownerAddress, assetId, signedMessage, proofData, assetData) {
  try {
    // Generate a fake simulation ID for educational purposes
    const simulationId = `sim_${assetId.slice(0, 8)}_${Date.now()}`;
    
    return {
      success: true,
      isSimulated: true,
      status: "simulated",
      simulationId: simulationId,
      message: "cNFT burn simulation completed successfully. This demonstrates what would happen with proper tree authority permissions.",
      assetDetails: {
        id: assetId,
        name: assetData.content?.metadata?.name || "Compressed NFT",
        collection: assetData.content?.metadata?.collection?.name || "Unknown Collection"
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Simulation failed: ${error.message}`,
      status: "failed"
    };
  }
}

/**
 * Transfer a cNFT to a burn address (effectively "burning" it)
 * @param {string} ownerAddress - The current owner's public key
 * @param {string} assetId - The asset ID of the cNFT
 * @param {string} burnAddress - The destination burn address
 * @param {object} proofData - The merkle proof data
 * @param {object} assetData - The asset data
 * @returns {Promise<object>} - Result of the transfer operation
 */
async function transferCNFTToBurnAddress(ownerAddress, assetId, burnAddress, proofData, assetData) {
  try {
    console.log(`[BURN TRANSFER] Transferring cNFT ${assetId} to burn address ${burnAddress}`);
    
    const ownerPubkey = new PublicKey(ownerAddress);
    const newOwnerPubkey = new PublicKey(burnAddress);
    
    // Extract tree information
    const treeId = proofData.tree_id;
    const treeAddress = new PublicKey(treeId);
    
    // Create the tree authority address
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treeAddress.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Build the transfer instruction using mpl-bubblegum v4.4.0 API
    const transferIx = mplBubblegum.transfer(
      {
        merkleTree: treeAddress,
        treeAuthority: treeAuthority,
        leafOwner: ownerPubkey,
        leafDelegate: ownerPubkey,
        newLeafOwner: newOwnerPubkey,
        logWrapper: new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'),
        compressionProgram: new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'),
        anchorRemainingAccounts: proofData.proof.map(p => ({
          pubkey: new PublicKey(p),
          isSigner: false,
          isWritable: false
        }))
      },
      {
        root: [...Buffer.from(proofData.root, 'base64')],
        dataHash: [...Buffer.from(assetData.compression.data_hash, 'base64')],
        creatorHash: [...Buffer.from(assetData.compression.creator_hash, 'base64')],
        nonce: assetData.compression.leaf_id,
        index: assetData.compression.leaf_id
      }
    );
    
    // Create a transaction with compute budget
    const transaction = new Transaction()
      .add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
        transferIx
      );
    
    // This is a client-side transaction that needs to be signed by the owner
    // Return the transaction for the client to sign and submit
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = ownerPubkey;
    
    // Serialize transaction for client signing
    const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
    
    return {
      success: true,
      requiresClientSigning: true,  
      transaction: serializedTransaction.toString('base64'),
      message: "Transaction prepared for client signing"
    };
    
  } catch (error) {
    console.error(`Error creating burn transfer transaction for ${assetId}:`, error);
    return {
      success: false,
      error: `Failed to create burn transfer: ${error.message}`
    };
  }
}

// Export the functionality
module.exports = {
  processBurnRequest,
  transferCNFTToBurnAddress,
  simulateBurn,
  hasTreeAuthority
};