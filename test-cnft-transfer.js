/**
 * Test CNFT Transfer Tool
 * 
 * This is a diagnostic tool for testing compressed NFT (cNFT) transfers.
 * It provides detailed logging and step-by-step information about the transfer process.
 * 
 * Usage:
 * node test-cnft-transfer.js <PRIVATE_KEY_BASE58> <ASSET_ID> [DESTINATION_ADDRESS]
 * 
 * If DESTINATION_ADDRESS is not provided, the default project wallet is used.
 */

require('dotenv').config();
const bs58 = require('bs58');
const { Keypair, PublicKey, Connection, clusterApiUrl, Transaction } = require('@solana/web3.js');
const axios = require('axios');

// Project wallet to use as default destination
const PROJECT_WALLET = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";

// Bubblegum program ID for cNFTs
const BUBBLEGUM_PROGRAM_ID = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");

// SPL Account Compression program ID
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('SPL1C0MP5yuaDggoXBMcWX7pcwyTH3dZ8uJ8UBLKV5T');

// SPL No-op program ID (for logging)
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');

/**
 * Get a reliable Solana connection
 * @returns {Connection} Solana RPC connection
 */
async function getConnection() {
  console.log('=== CONNECTION SETUP ===');
  
  // First try to use QuickNode if available (better reliability)
  if (process.env.QUICKNODE_RPC_URL) {
    console.log('Using QuickNode RPC URL...');
    return new Connection(process.env.QUICKNODE_RPC_URL, 'confirmed');
  }
  
  // Fall back to Solana devnet
  console.log('Using Solana devnet RPC...');
  return new Connection(clusterApiUrl('devnet'), 'confirmed');
}

/**
 * Get proof data for a specific asset
 * @param {string} assetId - The NFT/asset ID
 * @returns {Promise<Object>} Asset proof data for the cNFT
 */
async function getProof(assetId) {
  console.log('=== FETCHING PROOF DATA ===');
  
  let heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY environment variable is not set');
  }
  
  console.log(`Using Helius API to fetch proof data for ${assetId}...`);
  
  try {
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
      {
        jsonrpc: '2.0',
        id: 'helius-proof',
        method: 'getAssetProof',
        params: {
          id: assetId
        }
      }
    );
    
    if (!response.data || !response.data.result) {
      throw new Error('Invalid response format from Helius API');
    }
    
    console.log('Successfully fetched proof data');
    return response.data.result;
  } catch (error) {
    console.error(`Error fetching proof data: ${error.message}`);
    throw error;
  }
}

/**
 * Get asset details
 * @param {string} assetId - The NFT/asset ID
 * @returns {Promise<Object>} Asset details
 */
async function getAssetDetails(assetId) {
  console.log('=== FETCHING ASSET DETAILS ===');
  
  let heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY environment variable is not set');
  }
  
  console.log(`Using Helius API to fetch asset details for ${assetId}...`);
  
  try {
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
      {
        jsonrpc: '2.0',
        id: 'helius-asset',
        method: 'getAsset',
        params: {
          id: assetId
        }
      }
    );
    
    if (!response.data || !response.data.result) {
      throw new Error('Invalid response format from Helius API');
    }
    
    console.log('Successfully fetched asset details');
    return response.data.result;
  } catch (error) {
    console.error(`Error fetching asset details: ${error.message}`);
    throw error;
  }
}

/**
 * Transfer a cNFT to a specific recipient
 * @param {Keypair} senderKeypair - The sender's keypair
 * @param {string} assetId - The NFT/asset ID
 * @param {string|PublicKey} receiverAddress - The destination address (defaults to PROJECT_WALLET)
 * @returns {Promise<Object>} - Result of the transfer
 */
async function transferCnft(senderKeypair, assetId, receiverAddress = PROJECT_WALLET) {
  try {
    console.log('\n=== TRANSFER PROCESS STARTED ===');
    console.log(`Sender: ${senderKeypair.publicKey.toString()}`);
    console.log(`Asset ID: ${assetId}`);
    console.log(`Destination: ${receiverAddress.toString()}`);
    
    // 1. Get connection
    console.log('\nStep 1: Establishing connection to Solana network...');
    const connection = await getConnection();
    
    // 2. Get proof data
    console.log('\nStep 2: Fetching asset proof data...');
    const proofData = await getProof(assetId);
    
    // 3. Get asset details
    console.log('\nStep 3: Fetching asset details...');
    const assetDetails = await getAssetDetails(assetId);
    
    // Verify ownership
    console.log('\nStep 4: Verifying ownership...');
    if (assetDetails.ownership.owner !== senderKeypair.publicKey.toString()) {
      console.error(`\n❌ Ownership verification failed!`);
      console.error(`Asset is owned by ${assetDetails.ownership.owner}`);
      console.error(`Sender public key is ${senderKeypair.publicKey.toString()}`);
      throw new Error('Ownership verification failed');
    }
    console.log('✅ Ownership verified');
    
    // Convert string address to PublicKey if needed
    const receiverPublicKey = typeof receiverAddress === 'string'
      ? new PublicKey(receiverAddress)
      : receiverAddress;
    
    console.log('\nStep 5: Preparing transaction data...');
    
    // Parse the tree and root from proof data
    const treeId = proofData.tree_id || (proofData.compression && proofData.compression.tree);
    console.log(`Tree ID: ${treeId}`);
    
    if (!treeId) {
      throw new Error('Tree ID not found in proof data');
    }
    
    const merkleTree = new PublicKey(treeId);
    
    // Derive the tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    console.log(`Tree Authority: ${treeAuthority.toString()}`);
    
    // Define accounts for the instruction
    console.log('\nStep 6: Creating transaction instruction...');
    const keys = [
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
    
    // Extract data from proof
    // Check different possible locations for the root
    let rootValue = proofData.root;
    if (!rootValue && proofData.merkle_tree) {
      rootValue = proofData.merkle_tree.root;
    }
    
    if (!rootValue) {
      console.error('Root value not found in proof data');
      throw new Error('Root value not found in proof data');
    }
    
    console.log(`Root value: ${rootValue}`);
    const root = Buffer.from(rootValue, 'base64');
    
    // Get data_hash and creator_hash
    let dataHashValue = null;
    if (proofData.data_hash) {
      dataHashValue = proofData.data_hash;
    } else if (proofData.compression && proofData.compression.data_hash) {
      dataHashValue = proofData.compression.data_hash;
    } else if (proofData.leaf && proofData.leaf.data_hash) {
      dataHashValue = proofData.leaf.data_hash;
    }
    
    if (!dataHashValue) {
      console.error('Data hash not found in proof data');
      throw new Error('Data hash not found in proof data');
    }
    
    console.log(`Data hash value: ${dataHashValue}`);
    const dataHash = Buffer.from(dataHashValue, 'base64');
    
    let creatorHashValue = null;
    if (proofData.creator_hash) {
      creatorHashValue = proofData.creator_hash;
    } else if (proofData.compression && proofData.compression.creator_hash) {
      creatorHashValue = proofData.compression.creator_hash;
    } else if (proofData.leaf && proofData.leaf.creator_hash) {
      creatorHashValue = proofData.leaf.creator_hash;
    }
    
    if (!creatorHashValue) {
      console.error('Creator hash not found in proof data');
      throw new Error('Creator hash not found in proof data');
    }
    
    console.log(`Creator hash value: ${creatorHashValue}`);
    const creatorHash = Buffer.from(creatorHashValue, 'base64');
    
    // Look for node index in various locations
    let nonce = null;
    let index = null;

    // Check all possible locations for the leaf ID (different APIs use different fields)
    if (proofData.leaf_id !== undefined) {
      nonce = proofData.leaf_id;
      console.log(`Using proofData.leaf_id: ${nonce}`);
    } else if (proofData.node_index !== undefined) {
      nonce = proofData.node_index;
      console.log(`Using proofData.node_index: ${nonce}`);
    } else if (proofData.compression && proofData.compression.leaf_id !== undefined) {
      nonce = proofData.compression.leaf_id;
      console.log(`Using proofData.compression.leaf_id: ${nonce}`);
    } else if (proofData.leaf_index !== undefined) {
      nonce = proofData.leaf_index;
      console.log(`Using proofData.leaf_index: ${nonce}`);
    } else if (proofData.compression && proofData.compression.node_index !== undefined) {
      nonce = proofData.compression.node_index;
      console.log(`Using proofData.compression.node_index: ${nonce}`);
    } else {
      // If all else fails, try to parse the leaf ID from the asset ID
      console.error('No leaf ID found in proof data');
      throw new Error('Missing leaf_id or node_index in proof data. This is required for cNFT transfers.');
    }
    
    // Use the same value for index
    index = nonce;
    
    console.log(`Nonce/Index: ${nonce}`);
    
    // Process the proof array
    console.log('\nStep 7: Processing proof array...');
    let leafProof = [];
    if (Array.isArray(proofData.proof)) {
      try {
        // Go through each proof and ensure it's properly formatted
        leafProof = proofData.proof.map((proofNode, index) => {
          if (!proofNode) {
            throw new Error(`Proof node at index ${index} is null or undefined`);
          }
          
          console.log(`Processing proof node ${index}: ${typeof proofNode}`);
          
          // Handle different formats (base64 string or byte array)
          if (typeof proofNode === 'string') {
            try {
              return Buffer.from(proofNode, 'base64');
            } catch (decodeErr) {
              console.error(`Failed to decode proof node ${index} as base64:`, decodeErr);
              throw new Error(`Invalid proof format at index ${index}: ${decodeErr.message}`);
            }
          } else if (Array.isArray(proofNode)) {
            // If it's already an array of numbers, convert to Buffer
            return Buffer.from(proofNode);
          } else {
            throw new Error(`Unsupported proof node format at index ${index}: ${typeof proofNode}`);
          }
        });
      } catch (proofErr) {
        console.error('Error processing proof data:', proofErr);
        console.error('Raw proof data:', proofData.proof);
        throw new Error(`Failed to process proof data: ${proofErr.message}`);
      }
    } else {
      console.error('Proof data is not an array:', proofData.proof);
      throw new Error('Proof data is missing or not in array format');
    }
    
    console.log(`Processed ${leafProof.length} proof elements`);
    
    // Create instruction data
    console.log('\nStep 8: Creating transaction...');
    // Transfer instruction discriminator for Bubblegum program is 5
    const TRANSFER_DISCRIMINATOR = Buffer.from([5, 0, 0, 0, 0, 0, 0, 0, 0]);
    
    // Create nonce and index buffers
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(nonce));
    
    const indexBuffer = Buffer.alloc(8);
    indexBuffer.writeBigUInt64LE(BigInt(index));
    
    // Concatenate all parts of the instruction data
    const instructionData = Buffer.concat([
      TRANSFER_DISCRIMINATOR,
      root,
      dataHash,
      creatorHash,
      nonceBuffer,
      indexBuffer,
      ...leafProof
    ]);
    
    const { TransactionInstruction } = require('@solana/web3.js');
    
    // Create transaction instruction
    const transferInstruction = new TransactionInstruction({
      keys,
      programId: BUBBLEGUM_PROGRAM_ID,
      data: instructionData
    });
    
    // Create transaction and add the instruction
    const transaction = new Transaction();
    transaction.add(transferInstruction);
    transaction.feePayer = senderKeypair.publicKey;
    
    // Get recent blockhash
    console.log('\nStep 9: Getting latest blockhash...');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    // Sign and send transaction
    console.log('\nStep 10: Sending transaction...');
    const signature = await connection.sendTransaction(transaction, [senderKeypair], {
      skipPreflight: false,
      maxRetries: 3
    });
    
    console.log(`Transaction sent with signature: ${signature}`);
    console.log(`Explorer URL: https://solscan.io/tx/${signature}`);
    
    // Confirm transaction
    console.log('\nStep 11: Confirming transaction...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    });
    
    if (confirmation.value.err) {
      console.error(`\n❌ Transaction error: ${JSON.stringify(confirmation.value.err)}`);
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
    console.error('\n❌ Error transferring cNFT:', error);
    
    // Add more diagnostic information
    console.error('\n=== DIAGNOSTIC INFORMATION ===');
    
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    
    // Check for specific error types
    if (error.message.includes('blockhash')) {
      console.error('\nThis might be due to a blockhash issue. Network could be congested.');
    } else if (error.message.includes('signature verification failed')) {
      console.error('\nThis is likely due to an invalid signature. Check your keypair or permissions.');
    } else if (error.message.includes('insufficient funds')) {
      console.error('\nThe wallet does not have enough SOL to cover transaction fees.');
    } else if (error.message.includes('Buffer')) {
      console.error('\nData formatting error in the proofData structure.');
    }
    
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.error('Usage: node test-cnft-transfer.js <PRIVATE_KEY_BASE58> <ASSET_ID> [DESTINATION_ADDRESS]');
      process.exit(1);
    }
    
    // Extract arguments
    const privateKeyBase58 = args[0];
    const assetId = args[1];
    const destinationAddress = args[2] || PROJECT_WALLET;
    
    // Create the keypair from the provided private key
    const secretKey = bs58.decode(privateKeyBase58);
    const senderKeypair = Keypair.fromSecretKey(secretKey);
    
    console.log('===== TEST CNFT TRANSFER TOOL =====');
    console.log('This tool provides diagnostic information for cNFT transfers');
    console.log(`Sender: ${senderKeypair.publicKey.toString()}`);
    console.log(`Asset ID: ${assetId}`);
    console.log(`Destination: ${destinationAddress}`);
    
    // Perform the transfer
    const result = await transferCnft(senderKeypair, assetId, destinationAddress);
    
    if (result.success) {
      console.log(`\n✅ Successfully transferred cNFT to ${destinationAddress}`);
      console.log(`Transaction Signature: ${result.signature}`);
      console.log(`Explorer URL: https://solscan.io/tx/${result.signature}`);
    } else {
      console.error(`\n❌ Transfer failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Execute the main function
main();