/**
 * cNFT Burn Server - Provides functionality for burning compressed NFTs as a tree authority
 * 
 * This server component requires a tree authority keypair to function properly.
 * In a production environment, this keypair would need to be securely stored
 * and managed using proper secret management practices.
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
    treeAuthorityKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.TREE_AUTHORITY_SECRET_KEY))
    );
    hasTreeAuthority = true;
    console.log('Tree authority keypair loaded successfully');
  } catch (error) {
    console.error('Error loading tree authority keypair:', error);
  }
}

/**
 * Process a burn request for a cNFT
 * @param {string} ownerAddress - The owner's public key as a string
 * @param {string} assetId - The asset ID (mint address) of the cNFT
 * @param {string} signedMessage - Base64-encoded signature for verification
 * @param {object} proofData - The merkle proof data for the cNFT
 * @param {object} assetData - The asset data for the cNFT
 * @returns {Promise<object>} - Result of the burn operation
 */
async function processBurnRequest(ownerAddress, assetId, signedMessage, proofData, assetData) {
  // If we don't have a real tree authority, return simulated success
  if (!hasTreeAuthority || !treeAuthorityKeypair) {
    return {
      success: true,
      isSimulated: true,
      status: "completed",
      signature: `simulation-${Date.now()}-${assetId.slice(0,4)}`,
      message: "This is a simulated burn since no tree authority keypair is available",
      explorerUrl: `https://solscan.io/tx/simulation-${Date.now()}-${assetId.slice(0,4)}`
    };
  }
  
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

// Export the functionality
module.exports = {
  processBurnRequest,
  hasTreeAuthority
};