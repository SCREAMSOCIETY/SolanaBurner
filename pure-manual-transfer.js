/**
 * Pure Manual cNFT Transfer Implementation
 * 
 * This implementation creates the transfer instruction manually without
 * relying on the createTransferInstruction function from Metaplex libraries.
 * It assembles the necessary buffer formats directly.
 */

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');

// Important constants
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');
const PROJECT_WALLET = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');

/**
 * Creates a transfer instruction manually for Bubblegum cNFTs
 * 
 * @param {object} accounts - The accounts needed for the transfer
 * @param {object} args - The arguments needed for the transfer
 * @returns {TransactionInstruction} - The transfer instruction
 */
function createManualTransferInstruction(accounts, args) {
  console.log("Creating manual transfer instruction...");
  
  // Accounts required for the instruction
  const keys = [
    // Tree Authority - ReadOnly
    {
      pubkey: accounts.treeAuthority,
      isSigner: false,
      isWritable: false,
    },
    // Leaf Owner - ReadOnly, Signer (must sign because they're transferring)
    {
      pubkey: accounts.leafOwner,
      isSigner: true,
      isWritable: false,
    },
    // Leaf Delegate (same as owner in direct transfers) - ReadOnly, Signer
    {
      pubkey: accounts.leafDelegate,
      isSigner: true,
      isWritable: false,
    },
    // New Leaf Owner (recipient) - ReadOnly
    {
      pubkey: accounts.newLeafOwner,
      isSigner: false,
      isWritable: false,
    },
    // Merkle Tree - Writable
    {
      pubkey: accounts.merkleTree,
      isSigner: false,
      isWritable: true,
    },
    // Log Wrapper - ReadOnly
    {
      pubkey: accounts.logWrapper,
      isSigner: false,
      isWritable: false,
    },
    // Compression Program - ReadOnly
    {
      pubkey: accounts.compressionProgram,
      isSigner: false,
      isWritable: false,
    },
  ];

  // Create the instruction data buffer manually
  // 8 is a standard offset for Anchor instructions
  const instructionData = Buffer.alloc(1 + 8 + 32 + 32 + 8 + 8 + (args.proof.length * 32));
  
  // Transfer instruction discriminator (5 = transfer in Bubblegum program)
  instructionData.writeUInt8(5, 0);
  
  // Write root hash (32 bytes)
  args.root.copy(instructionData, 1 + 8);
  
  // Write data hash (32 bytes)
  args.dataHash.copy(instructionData, 1 + 8 + 32);
  
  // Write creator hash (32 bytes)
  args.creatorHash.copy(instructionData, 1 + 8 + 32 + 32);
  
  // Write nonce (8 bytes)
  instructionData.writeBigUInt64LE(BigInt(args.index), 1 + 8 + 32 + 32);
  
  // Write index (8 bytes)
  instructionData.writeBigUInt64LE(BigInt(args.index), 1 + 8 + 32 + 32 + 8);
  
  // Write proof length (4 bytes) and proofs
  let proofOffset = 1 + 8 + 32 + 32 + 8 + 8;
  for (let i = 0; i < args.proof.length; i++) {
    args.proof[i].copy(instructionData, proofOffset + (i * 32));
  }

  console.log("Created instruction data with length:", instructionData.length);
  
  // Create the instruction
  return new TransactionInstruction({
    keys,
    programId: BUBBLEGUM_PROGRAM_ID,
    data: instructionData,
  });
}

/**
 * Get proof data for a specific asset using Helius API
 * @param {string} assetId - The NFT/asset ID
 * @returns {Promise<Object>} - Asset proof data for the cNFT
 */
async function getProofData(assetId) {
  console.log(`Fetching proof for asset: ${assetId}...`);
  
  if (!process.env.HELIUS_API_KEY) {
    throw new Error("HELIUS_API_KEY environment variable is not set");
  }
  
  try {
    // Try with Helius RPC API first
    const payload = {
      jsonrpc: '2.0',
      id: 'helius-proof-request',
      method: 'getAssetProof',
      params: {
        id: assetId
      }
    };
    
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`,
      payload
    );
    
    if (!response.data || !response.data.result) {
      throw new Error('Invalid response format from Helius API');
    }
    
    // Extract the proof data
    const proofData = response.data.result;
    return {
      assetId,
      proof: proofData.proof.map(p => Buffer.from(p, 'base64')),
      root: Buffer.from(proofData.root, 'base64'),
      tree_id: proofData.tree_id || proofData.tree,
      node_index: proofData.node_index,
      leaf: proofData.leaf,
      compression: {
        tree: proofData.tree_id || proofData.tree,
        root: proofData.root,
        leaf_id: proofData.node_index,
        data_hash: proofData.leaf?.data_hash || '11111111111111111111111111111111',
        creator_hash: proofData.leaf?.creator_hash || '11111111111111111111111111111111',
        compressed: true
      }
    };
  } catch (error) {
    console.error("Error fetching proof data:", error.message);
    throw error;
  }
}

/**
 * Get asset details from Helius API
 * @param {string} assetId - The NFT/asset ID
 * @returns {Promise<Object>} - Asset details
 */
async function getAssetDetails(assetId) {
  console.log(`Fetching details for asset: ${assetId}...`);
  
  if (!process.env.HELIUS_API_KEY) {
    throw new Error("HELIUS_API_KEY environment variable is not set");
  }
  
  try {
    const payload = {
      jsonrpc: '2.0',
      id: 'helius-asset-details',
      method: 'getAsset',
      params: {
        id: assetId
      }
    };
    
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`,
      payload
    );
    
    if (!response.data || !response.data.result) {
      throw new Error('Invalid response format from Helius API');
    }
    
    return response.data.result;
  } catch (error) {
    console.error("Error fetching asset details:", error.message);
    throw error;
  }
}

/**
 * Transfer a cNFT to a specific recipient
 * @param {Keypair} senderKeypair - The sender's keypair
 * @param {string} assetId - The NFT/asset ID to transfer
 * @param {string} recipientAddress - Optional recipient address (defaults to PROJECT_WALLET)
 * @returns {Promise<Object>} - The result of the transfer operation
 */
async function transferCnft(senderKeypair, assetId, recipientAddress = PROJECT_WALLET.toString()) {
  try {
    console.log(`Starting manual transfer for asset ${assetId}`);
    console.log(`From: ${senderKeypair.publicKey.toString()}`);
    console.log(`To: ${recipientAddress}`);
    
    // Get connection
    const connection = new Connection(
      process.env.QUICKNODE_RPC_URL || "https://api.mainnet-beta.solana.com",
      "confirmed"
    );
    
    // Get asset details to verify ownership
    const assetDetails = await getAssetDetails(assetId);
    
    if (assetDetails.ownership.owner !== senderKeypair.publicKey.toString()) {
      throw new Error(`Asset is not owned by ${senderKeypair.publicKey.toString()}`);
    }
    
    // Get proof data for the asset
    const proofData = await getProofData(assetId);
    
    // Convert recipient string to PublicKey
    const recipientPublicKey = new PublicKey(recipientAddress);
    
    // Get the merkle tree public key
    const merkleTree = new PublicKey(proofData.tree_id);
    
    // Derive the tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Leaf information
    const dataHash = proofData.leaf?.data_hash || '11111111111111111111111111111111';
    const creatorHash = proofData.leaf?.creator_hash || '11111111111111111111111111111111';
    
    // Accounts for the transfer instruction
    const accounts = {
      merkleTree,
      treeAuthority,
      leafOwner: senderKeypair.publicKey,
      leafDelegate: senderKeypair.publicKey,
      newLeafOwner: recipientPublicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    };
    
    // Args for the transfer instruction
    const args = {
      root: Buffer.from(proofData.root, 'base64'),
      dataHash: Buffer.from(dataHash, 'base64'),
      creatorHash: Buffer.from(creatorHash, 'base64'),
      index: proofData.node_index,
      proof: proofData.proof,
    };
    
    // Create transfer instruction manually
    const transferIx = createManualTransferInstruction(accounts, args);
    
    // Create transaction
    const transaction = new Transaction();
    transaction.add(transferIx);
    transaction.feePayer = senderKeypair.publicKey;
    
    // Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    // Sign and send the transaction
    console.log("Sending transaction...");
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [senderKeypair],
      {
        skipPreflight: false,
        commitment: 'confirmed',
        maxRetries: 3
      }
    );
    
    console.log(`Transaction successful with signature: ${signature}`);
    
    return {
      success: true,
      signature,
      message: 'cNFT transferred successfully'
    };
  } catch (error) {
    console.error("Error transferring cNFT:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// CLI usage
async function main() {
  try {
    // Parse arguments
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.error("Usage: node pure-manual-transfer.js <PRIVATE_KEY_BASE58> <ASSET_ID> [DESTINATION_ADDRESS]");
      process.exit(1);
    }
    
    const privateKeyBase58 = args[0];
    const assetId = args[1];
    const destinationAddress = args[2] || PROJECT_WALLET.toString();
    
    // Create sender keypair
    const secretKey = bs58.decode(privateKeyBase58);
    const senderKeypair = Keypair.fromSecretKey(secretKey);
    
    console.log("=== PURE MANUAL cNFT TRANSFER ===");
    console.log(`Asset ID: ${assetId}`);
    console.log(`Sender: ${senderKeypair.publicKey.toString()}`);
    console.log(`Recipient: ${destinationAddress}`);
    
    // Transfer the cNFT
    const result = await transferCnft(senderKeypair, assetId, destinationAddress);
    
    if (result.success) {
      console.log("\n✅ Transfer successful!");
      console.log(`Signature: ${result.signature}`);
    } else {
      console.error(`❌ Transfer failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  transferCnft,
  getProofData,
  getAssetDetails
};