/**
 * Robust cNFT Transfer Script
 * 
 * This script is designed to handle various issues with cNFT transfers:
 * 1. It doesn't require all proof data fields to be present
 * 2. It will attempt multiple fallback strategies if a field is missing
 * 3. It provides detailed logging of all steps for diagnostics
 * 
 * Usage:
 * node robust-cnft-transfer.js <PRIVATE_KEY_BASE58> <ASSET_ID> [DESTINATION_ADDRESS]
 * 
 * If DESTINATION_ADDRESS is not provided, it defaults to the project wallet.
 */

// Environment setup
require('dotenv').config();
const axios = require('axios');
const bs58 = require('bs58');
const { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  clusterApiUrl 
} = require('@solana/web3.js');

// Constants
const PROJECT_WALLET = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('SPL1C0MP5yuaDggoXBMcWX7pcwyTH3dZ8uJ8UBLKV5T');
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_API_URL = 'https://mainnet.helius-rpc.com';

// Get a connection to Solana
async function getConnection() {
  if (process.env.QUICKNODE_RPC_URL) {
    console.log('Using QuickNode RPC URL for better reliability');
    return new Connection(process.env.QUICKNODE_RPC_URL, 'confirmed');
  }
  
  console.log('Using public Solana RPC (fallback)');
  return new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
}

// Get full asset details for a cNFT
async function getAssetDetails(assetId) {
  console.log(`\n[1/5] Getting asset details for ${assetId}`);
  
  try {
    const response = await axios.post(
      HELIUS_API_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-asset',
        method: 'getAsset',
        params: { id: assetId }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': HELIUS_API_KEY
        }
      }
    );
    
    if (!response.data || !response.data.result) {
      throw new Error('Invalid response from Helius API when fetching asset details');
    }
    
    console.log('✅ Successfully fetched asset details');
    return response.data.result;
  } catch (error) {
    console.error(`❌ Error getting asset details: ${error.message}`);
    if (error.response) {
      console.error(`Response status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Get proof data for a cNFT, with fallback strategies
async function getProofData(assetId) {
  console.log(`\n[2/5] Getting proof data for ${assetId}`);
  
  try {
    const response = await axios.post(
      HELIUS_API_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-proof',
        method: 'getAssetProof',
        params: { id: assetId }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': HELIUS_API_KEY
        }
      }
    );
    
    if (!response.data || !response.data.result) {
      throw new Error('Invalid response from Helius API when fetching proof');
    }
    
    const proofData = response.data.result;
    
    // Validate and fix proof data to make it as robust as possible
    const enhancedProofData = enhanceProofData(proofData, assetId);
    
    console.log('✅ Successfully fetched and enhanced proof data');
    return enhancedProofData;
  } catch (error) {
    console.error(`❌ Error getting proof data: ${error.message}`);
    if (error.response) {
      console.error(`Response status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Enhance the proof data with fallbacks and default values
function enhanceProofData(proofData, assetId) {
  console.log('Enhancing proof data with fallbacks and defaults');
  
  // 1. Verify we have a proof array
  if (!proofData.proof || !Array.isArray(proofData.proof)) {
    console.error('Missing proof array in response!');
    throw new Error('Proof array is missing in the response. Cannot proceed with transfer.');
  }
  
  // 2. Check for tree_id
  if (!proofData.tree_id) {
    console.warn('tree_id is missing, trying to locate it elsewhere...');
    
    if (proofData.compression && proofData.compression.tree) {
      console.log('Found tree_id in compression.tree');
      proofData.tree_id = proofData.compression.tree;
    } else {
      console.error('Could not locate tree_id in proof data');
      throw new Error('Missing tree_id in proof data');
    }
  }
  
  // 3. Check for root
  if (!proofData.root) {
    console.warn('root is missing, trying to locate it elsewhere...');
    
    if (proofData.merkle_tree && proofData.merkle_tree.root) {
      console.log('Found root in merkle_tree.root');
      proofData.root = proofData.merkle_tree.root;
    } else {
      console.error('Could not locate root in proof data');
      throw new Error('Missing root in proof data');
    }
  }
  
  // 4. Ensure we have a leaf_id/node_index
  let leafId = null;
  
  if (proofData.leaf_id !== undefined) {
    leafId = proofData.leaf_id;
    console.log(`Using leaf_id: ${leafId}`);
  } else if (proofData.node_index !== undefined) {
    leafId = proofData.node_index;
    console.log(`Using node_index as leaf_id: ${leafId}`);
  } else if (proofData.leaf_index !== undefined) {
    leafId = proofData.leaf_index;
    console.log(`Using leaf_index as leaf_id: ${leafId}`);
  } else if (proofData.compression && proofData.compression.leaf_id !== undefined) {
    leafId = proofData.compression.leaf_id;
    console.log(`Using compression.leaf_id: ${leafId}`);
  } else if (proofData.compression && proofData.compression.node_index !== undefined) {
    leafId = proofData.compression.node_index;
    console.log(`Using compression.node_index: ${leafId}`);
  } else {
    console.warn('No leaf_id or node_index found in proof data');
    console.log('Using 0 as default leaf_id for older tree format');
    leafId = 0;
  }
  
  // 5. Normalize the proof array
  try {
    const normalizedProof = proofData.proof.map((node, index) => {
      if (typeof node === 'string') {
        return Buffer.from(node, 'base64');
      } else if (Array.isArray(node)) {
        return Buffer.from(node);
      } else {
        throw new Error(`Unexpected proof node format at index ${index}`);
      }
    });
    console.log(`Normalized ${normalizedProof.length} proof nodes to Buffer format`);
    proofData._normalizedProof = normalizedProof;
  } catch (error) {
    console.error(`Error normalizing proof array: ${error.message}`);
    throw new Error(`Failed to normalize proof array: ${error.message}`);
  }
  
  // Store our enhanced values
  proofData.leaf_id = leafId;
  proofData.node_index = leafId;
  
  // Ensure compression data exists
  if (!proofData.compression) {
    proofData.compression = {};
  }
  
  proofData.compression.leaf_id = leafId;
  proofData.compression.tree = proofData.tree_id;
  
  return proofData;
}

// Transfer a cNFT to a target address
async function transferCnft(senderKeypair, assetId, receiverAddress = PROJECT_WALLET) {
  try {
    // Convert string address to PublicKey if needed
    const receiverPublicKey = typeof receiverAddress === 'string'
      ? new PublicKey(receiverAddress)
      : receiverAddress;
    
    console.log('\n[3/5] Setting up transfer');
    console.log(`From: ${senderKeypair.publicKey.toString()}`);
    console.log(`To: ${receiverPublicKey.toString()}`);
    
    // Get connection
    const connection = await getConnection();
    
    // Get asset details and proof data
    const assetDetails = await getAssetDetails(assetId);
    const proofData = await getProofData(assetId);
    
    // Verify ownership
    console.log('\n[4/5] Verifying ownership');
    if (assetDetails.ownership.owner !== senderKeypair.publicKey.toString()) {
      console.error(`❌ Ownership verification failed!`);
      console.error(`Asset is owned by ${assetDetails.ownership.owner}`);
      console.error(`But sender public key is ${senderKeypair.publicKey.toString()}`);
      throw new Error('Asset is not owned by the sender');
    }
    console.log('✅ Ownership verified');
    
    console.log('\n[5/5] Building transfer transaction');
    
    // Get the tree information
    const treeId = proofData.tree_id;
    const merkleTree = new PublicKey(treeId);
    
    // Derive the tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    console.log(`Tree ID: ${treeId}`);
    console.log(`Tree Authority: ${treeAuthority.toString()}`);
    
    // Create account list
    const accounts = [
      // Tree Authority
      {
        pubkey: treeAuthority,
        isSigner: false,
        isWritable: false,
      },
      // Leaf Owner (sender)
      {
        pubkey: senderKeypair.publicKey,
        isSigner: true,
        isWritable: false,
      },
      // Leaf Delegate (same as owner)
      {
        pubkey: senderKeypair.publicKey,
        isSigner: true,
        isWritable: false,
      },
      // New Leaf Owner (receiver)
      {
        pubkey: receiverPublicKey,
        isSigner: false,
        isWritable: false,
      },
      // Merkle Tree
      {
        pubkey: merkleTree,
        isSigner: false,
        isWritable: true,
      },
      // Log Wrapper
      {
        pubkey: SPL_NOOP_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      // Compression Program
      {
        pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ];
    
    // Convert data to buffers
    const root = Buffer.from(proofData.root, 'base64');
    
    // Get data_hash from appropriate location
    let dataHash;
    if (proofData.data_hash) {
      dataHash = Buffer.from(proofData.data_hash, 'base64');
    } else if (proofData.compression && proofData.compression.data_hash) {
      dataHash = Buffer.from(proofData.compression.data_hash, 'base64');
    } else {
      throw new Error('Missing data_hash in proof data');
    }
    
    // Get creator_hash from appropriate location
    let creatorHash;
    if (proofData.creator_hash) {
      creatorHash = Buffer.from(proofData.creator_hash, 'base64');
    } else if (proofData.compression && proofData.compression.creator_hash) {
      creatorHash = Buffer.from(proofData.compression.creator_hash, 'base64');
    } else {
      throw new Error('Missing creator_hash in proof data');
    }
    
    // Use our enhanced values
    const nonce = proofData.leaf_id;
    const index = proofData.leaf_id;
    
    console.log(`Nonce/Index: ${nonce}`);
    
    // Create nonce and index buffers
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(nonce));
    
    const indexBuffer = Buffer.alloc(8);
    indexBuffer.writeBigUInt64LE(BigInt(index));
    
    // Transfer instruction discriminator for Bubblegum program is 5
    const TRANSFER_DISCRIMINATOR = Buffer.from([5, 0, 0, 0, 0, 0, 0, 0, 0]);
    
    // Create instruction data
    const instructionData = Buffer.concat([
      TRANSFER_DISCRIMINATOR,
      root,
      dataHash, 
      creatorHash,
      nonceBuffer,
      indexBuffer,
      ...proofData._normalizedProof // Use our normalized proof
    ]);
    
    // Create transfer instruction
    const transferInstruction = new TransactionInstruction({
      keys: accounts,
      programId: BUBBLEGUM_PROGRAM_ID,
      data: instructionData
    });
    
    // Create and configure transaction
    const transaction = new Transaction();
    transaction.add(transferInstruction);
    transaction.feePayer = senderKeypair.publicKey;
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    // Sign and send transaction
    console.log('\nSending transaction...');
    const signature = await connection.sendTransaction(transaction, [senderKeypair], {
      skipPreflight: false,
      maxRetries: 3
    });
    
    console.log(`Transaction signature: ${signature}`);
    console.log(`Explorer URL: https://solscan.io/tx/${signature}`);
    
    // Confirm transaction
    console.log('\nConfirming transaction...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    });
    
    if (confirmation.value.err) {
      console.error('\n❌ Transaction error:', confirmation.value.err);
      return {
        success: false,
        error: `Transaction error: ${JSON.stringify(confirmation.value.err)}`,
        signature
      };
    }
    
    console.log('\n✅ Transaction confirmed successfully!');
    return {
      success: true,
      signature,
      message: `cNFT transferred successfully to ${receiverPublicKey.toString()}`
    };
  } catch (error) {
    console.error('\n❌ Error transferring cNFT:', error.message);
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    if (error.message.includes('blockhash')) {
      console.error('\nHint: This is likely due to an RPC issue or network congestion. Try again later.');
    } else if (error.message.includes('signature verification failed')) {
      console.error('\nHint: This is likely due to an invalid keypair or permissions issue.');
    } else if (error.message.includes('insufficient funds')) {
      console.error('\nHint: The wallet does not have enough SOL to cover transaction fees.');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.error('Usage: node robust-cnft-transfer.js <PRIVATE_KEY_BASE58> <ASSET_ID> [DESTINATION_ADDRESS]');
      process.exit(1);
    }
    
    const privateKeyBase58 = args[0];
    const assetId = args[1];
    const destinationAddress = args[2] || PROJECT_WALLET;
    
    if (!process.env.HELIUS_API_KEY) {
      console.error('❌ HELIUS_API_KEY environment variable is not set');
      process.exit(1);
    }
    
    // Create sender keypair
    const secretKey = bs58.decode(privateKeyBase58);
    const senderKeypair = Keypair.fromSecretKey(secretKey);
    
    console.log('===== ROBUST CNFT TRANSFER TOOL =====');
    console.log('This tool provides a robust approach to cNFT transfers');
    console.log(`Sender: ${senderKeypair.publicKey.toString()}`);
    console.log(`Asset ID: ${assetId}`);
    console.log(`Destination: ${destinationAddress}`);
    
    // Attempt the transfer
    const result = await transferCnft(senderKeypair, assetId, destinationAddress);
    
    if (result.success) {
      console.log(`\n✅ Successfully transferred cNFT ${assetId}`);
      console.log(`Transaction Signature: ${result.signature}`);
      console.log(`Explorer URL: https://solscan.io/tx/${result.signature}`);
    } else {
      console.error(`\n❌ Transfer failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Unhandled error: ${error.message}`);
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Export the transferCnft function for use in other modules
module.exports = {
  transferCnft,
  getAssetDetails,
  getProofData,
  enhanceProofData
};

// Only execute main function if this script is run directly
if (require.main === module) {
  main();
}