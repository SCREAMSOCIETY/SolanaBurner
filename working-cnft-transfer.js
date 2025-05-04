/**
 * Working cNFT Transfer Module
 * 
 * This is a simplified, reliable implementation for transferring compressed NFTs.
 * It bypasses web compatibility issues by running directly in Node.js.
 */

// Load environment variables
require('dotenv').config();

// Import core dependencies
const { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction 
} = require('@solana/web3.js');
const axios = require('axios');
const bs58 = require('bs58');

// Constants
const PROJECT_WALLET = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');

/**
 * Get a reliable Solana connection
 * @returns {Connection} Solana RPC connection
 */
async function getConnection() {
  // Try to use QuickNode if available
  if (process.env.QUICKNODE_RPC_URL) {
    return new Connection(process.env.QUICKNODE_RPC_URL, 'confirmed');
  }
  
  // Fallback to public RPC
  return new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
}

/**
 * Get all cNFTs for a wallet
 * @param {string} publicKeyStr - Wallet public key as string
 * @returns {Promise<Array>} Array of cNFTs
 */
async function getCnfts(publicKeyStr) {
  try {
    if (!process.env.HELIUS_API_KEY) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }
    
    // Use Helius API to get all assets
    const payload = {
      jsonrpc: '2.0',
      id: 'helius-assets',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: publicKeyStr,
        displayOptions: {
          showUnverifiedCollections: true,
          showCollectionMetadata: true
        }
      }
    };
    
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`,
      payload
    );
    
    if (!response.data || !response.data.result || !response.data.result.items) {
      throw new Error('Invalid response format from Helius API');
    }
    
    // Filter for compressed NFTs only
    const assets = response.data.result.items.filter(asset => 
      asset.compression && asset.compression.compressed
    );
    
    return assets;
  } catch (error) {
    console.error('Error fetching cNFTs:', error.message);
    throw error;
  }
}

/**
 * Get proof data for a specific asset
 * @param {string} assetId - The NFT/asset ID
 * @returns {Promise<Object>} Asset proof data for the cNFT
 */
async function getProof(assetId) {
  try {
    // Make sure we have required API keys
    if (!process.env.HELIUS_API_KEY) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }
    
    console.log(`[CLI] Fetching proof data for asset: ${assetId}`);
    
    // Try multiple methods to get proof data
    let proofData = null;
    let errors = [];
    
    // Method 1: Try Helius RPC API
    try {
      const payload = {
        jsonrpc: '2.0',
        id: 'helius-proof-request',
        method: 'getAssetProof',
        params: {
          id: assetId
        }
      };
      
      console.log('[CLI] Trying Helius RPC API...');
      const response = await axios.post(
        `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY}`,
        payload
      );
      
      if (response.data && response.data.result) {
        proofData = response.data.result;
        
        // Add compression object if it doesn't exist
        if (!proofData.compression) {
          console.log('[CLI] Adding missing compression object to proof data');
          proofData.compression = {
            tree: proofData.tree_id,
            proof: proofData.proof,
            leaf_id: proofData.node_index || proofData.leaf_index
          };
          
          if (proofData.data_hash) {
            proofData.compression.data_hash = proofData.data_hash;
          }
          
          if (proofData.creator_hash) {
            proofData.compression.creator_hash = proofData.creator_hash;
          }
        }
        
        console.log('[CLI] Proof data fetched via Helius RPC API');
      }
    } catch (error) {
      errors.push(`Helius RPC API error: ${error.message}`);
      console.error('[CLI] Helius RPC API error:', error.message);
    }
    
    // Method 2: Try Helius REST API if RPC failed
    if (!proofData) {
      try {
        console.log('[CLI] Trying Helius REST API...');
        const response = await axios.get(
          `https://api.helius.xyz/v0/assets/${assetId}/asset-proof?api-key=${process.env.HELIUS_API_KEY}`
        );
        
        if (response.data && response.data.proof) {
          proofData = response.data;
          
          // Add compression object if it doesn't exist
          if (!proofData.compression) {
            console.log('[CLI] Adding missing compression object to proof data');
            proofData.compression = {
              tree: proofData.tree || proofData.tree_id,
              proof: proofData.proof,
              leaf_id: proofData.node_index || proofData.leaf_index || 0
            };
          }
          
          console.log('[CLI] Proof data fetched via Helius REST API');
        }
      } catch (error) {
        errors.push(`Helius REST API error: ${error.message}`);
        console.error('[CLI] Helius REST API error:', error.message);
      }
    }
    
    // Method 3: Try QuickNode if available
    if (!proofData && process.env.QUICKNODE_RPC_URL) {
      try {
        const payload = {
          jsonrpc: '2.0',
          id: 'quicknode-proof-request',
          method: 'getAssetProof',
          params: {
            id: assetId
          }
        };
        
        const response = await axios.post(process.env.QUICKNODE_RPC_URL, payload);
        
        if (response.data && response.data.result) {
          proofData = response.data.result;
          console.log('Proof data fetched via QuickNode API');
        }
      } catch (error) {
        errors.push(`QuickNode API error: ${error.message}`);
      }
    }
    
    // Check if we got proof data
    if (!proofData) {
      throw new Error(`Failed to fetch proof data: ${errors.join(', ')}`);
    }
    
    return proofData;
  } catch (error) {
    console.error('Error fetching proof data:', error.message);
    throw error;
  }
}

/**
 * Transfer a cNFT to a specific recipient
 * @param {Keypair} senderKeypair - The sender's keypair
 * @param {Object} proofData - The asset proof data
 * @param {string|PublicKey} receiverAddress - The destination address (defaults to PROJECT_WALLET)
 * @returns {Promise<Object>} - Result of the transfer
 */
async function transferCnft(senderKeypair, proofData, receiverAddress = PROJECT_WALLET) {
  try {
    // Get connection
    const connection = await getConnection();
    
    // DEBUG: Log the complete proofData structure
    console.log('=== DEBUG: PROOF DATA STRUCTURE ===');
    console.log(JSON.stringify(proofData, null, 2));
    
    // Convert string address to PublicKey if needed
    const receiverPublicKey = typeof receiverAddress === 'string'
      ? new PublicKey(receiverAddress)
      : receiverAddress;
    
    console.log(`\nTransferring cNFT from ${senderKeypair.publicKey.toString()} to ${receiverPublicKey.toString()}`);
    
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
    
    // Create manual instruction
    // This is where the original approach failed in browser, but works in Node.js
    
    // 1. Define accounts for the instruction
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
    
    // 2. Extract data from proof
    // Check different possible locations for these values in the proof data
    let rootValue = proofData.root;
    if (!rootValue && proofData.merkle_tree) {
      rootValue = proofData.merkle_tree.root;
    }
    
    if (!rootValue) {
      console.warn('Root value not found in proof data, using placeholder');
      rootValue = '11111111111111111111111111111111';
    }
    
    console.log(`Root value: ${rootValue}`);
    const root = Buffer.from(rootValue, 'base64');
    
    // First try to get data_hash and creator_hash from the best locations
    let dataHashValue = null;
    if (proofData.data_hash) {
      dataHashValue = proofData.data_hash;
    } else if (proofData.compression && proofData.compression.data_hash) {
      dataHashValue = proofData.compression.data_hash;
    } else if (proofData.leaf && proofData.leaf.data_hash) {
      dataHashValue = proofData.leaf.data_hash;
    }
    
    if (!dataHashValue) {
      console.warn('Data hash not found in proof data, using placeholder');
      dataHashValue = '11111111111111111111111111111111';
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
      console.warn('Creator hash not found in proof data, using placeholder');
      creatorHashValue = '11111111111111111111111111111111';
    }
    
    console.log(`Creator hash value: ${creatorHashValue}`);
    const creatorHash = Buffer.from(creatorHashValue, 'base64');
    
    // Look for node index in various locations
    const nonce = proofData.leaf_id || proofData.node_index || 
                 (proofData.compression && proofData.compression.leaf_id) || 
                 proofData.leaf_index || 0;
    const index = nonce; // Same value for both
    
    console.log(`Nonce/Index: ${nonce}`);
    
    // Convert string proofs to Buffer array
    const leafProof = proofData.proof.map(proofNode => 
      Buffer.from(proofNode, 'base64')
    );
    
    // 3. Create instruction data
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
    
    // 4. Create transaction instruction
    const transferInstruction = new TransactionInstruction({
      keys,
      programId: BUBBLEGUM_PROGRAM_ID,
      data: instructionData
    });
    
    // 5. Create transaction and add the instruction
    const transaction = new Transaction();
    transaction.add(transferInstruction);
    transaction.feePayer = senderKeypair.publicKey;
    
    // 6. Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    // 7. Sign and send transaction
    console.log('Sending transaction...');
    const signature = await connection.sendTransaction(transaction, [senderKeypair], {
      skipPreflight: false,
      maxRetries: 3
    });
    
    // 8. Confirm transaction
    console.log('Confirming transaction...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight: await connection.getBlockHeight()
    });
    
    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction error: ${JSON.stringify(confirmation.value.err)}`
      };
    }
    
    return {
      success: true,
      signature,
      message: `cNFT transferred successfully to ${receiverPublicKey.toString()}`
    };
  } catch (error) {
    console.error('Error transferring cNFT:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function main() {
  try {
    // This is for testing the module directly
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.log('Usage: node working-cnft-transfer.js <PRIVATE_KEY_BASE58> <ASSET_ID>');
      process.exit(1);
    }

    const privateKeyBase58 = args[0];
    const assetId = args[1];
    
    const { Keypair } = require('@solana/web3.js');
    
    // Create the keypair
    const secretKey = bs58.decode(privateKeyBase58);
    const senderKeypair = Keypair.fromSecretKey(secretKey);
    
    console.log(`Sender: ${senderKeypair.publicKey.toString()}`);
    console.log(`Asset ID: ${assetId}`);
    
    // Get proof data
    console.log('Fetching proof data...');
    const proofData = await getProof(assetId);
    console.log('Proof data fetched successfully');
    
    // Transfer the cNFT
    console.log('Transferring cNFT...');
    const result = await transferCnft(senderKeypair, proofData);
    
    console.log('Transfer result:', result);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export functions for use in other modules
module.exports = {
  getConnection,
  getCnfts,
  getProof,
  transferCnft
};