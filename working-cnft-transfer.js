/**
 * Working cNFT Transfer Implementation
 * 
 * This script provides a reliable implementation of cNFT transfers
 * based on a working code example that properly imports all required
 * dependencies directly from @solana/web3.js and @metaplex-foundation/mpl-bubblegum.
 * 
 * Usage:
 * node working-cnft-transfer.js YOUR_PRIVATE_KEY_BASE58 ASSET_ID
 */

// Import core Solana dependencies
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

// Import Metaplex Bubblegum dependencies for cNFT operations
const {
  createTransferInstruction,
  SPL_NOOP_PROGRAM_ID,
} = require("@metaplex-foundation/mpl-bubblegum");

const axios = require("axios");
const bs58 = require("bs58");

// Default configuration
const PROJECT_WALLET = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
const BUBBLEGUM_PROGRAM_ID = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";

// Get connection using QuickNode or Helius
async function getConnection() {
  // Try QuickNode first
  if (process.env.QUICKNODE_RPC_URL) {
    return new Connection(process.env.QUICKNODE_RPC_URL, "confirmed");
  }
  
  // Fall back to Solana mainnet
  return new Connection("https://api.mainnet-beta.solana.com", "confirmed");
}

// Get cNFTs for a specific wallet using Helius API
async function getCnfts(publicKeyStr) {
  console.log(`🔎 Fetching cNFTs for ${publicKeyStr}...`);
  
  if (!process.env.HELIUS_API_KEY) {
    throw new Error("HELIUS_API_KEY environment variable is not set");
  }
  
  try {
    // Use Helius v0 API for compressed NFTs
    const url = `https://api.helius.xyz/v0/addresses/${publicKeyStr}/assets?compressed=true&api-key=${process.env.HELIUS_API_KEY}`;
    const response = await axios.get(url);
    
    if (!response.data || !response.data.items) {
      throw new Error("Invalid response format from Helius API");
    }
    
    return response.data.items || [];
  } catch (error) {
    console.error("Error fetching cNFTs:", error.message);
    throw error;
  }
}

// Get proof data for a specific asset using Helius API
async function getProof(assetId) {
  console.log(`🔏 Fetching proof for ${assetId}...`);
  
  if (!process.env.HELIUS_API_KEY) {
    throw new Error("HELIUS_API_KEY environment variable is not set");
  }
  
  try {
    // Use Helius API for proof data
    const url = `https://api.helius.xyz/v0/assets/${assetId}/asset-proof?api-key=${process.env.HELIUS_API_KEY}`;
    const response = await axios.get(url);
    
    if (!response.data || !response.data.proof) {
      throw new Error("Invalid proof data format from Helius API");
    }
    
    return response.data;
  } catch (error) {
    console.error("Error fetching proof:", error.message);
    throw error;
  }
}

// Transfer a cNFT using the proof data
async function transferCnft(senderKeypair, proofData, receiverAddress = PROJECT_WALLET) {
  console.log(`🚀 Preparing to transfer cNFT to ${receiverAddress}...`);
  
  // Extract required data from the proof
  const {
    root,
    proof,
    node_index: index,
    tree_id,
    leaf_owner,
    leaf,
  } = proofData;
  
  // Extract leaf data
  const data_hash = leaf?.data_hash || "11111111111111111111111111111111";
  const creator_hash = leaf?.creator_hash || "11111111111111111111111111111111";
  
  // Create PublicKeys
  const merkleTree = new PublicKey(tree_id);
  const bubblegumProgramId = new PublicKey(BUBBLEGUM_PROGRAM_ID);
  const receiver = new PublicKey(receiverAddress);
  const leafOwnerPubkey = new PublicKey(leaf_owner);
  
  // Get tree authority
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    bubblegumProgramId
  );
  
  console.log(`⚙️ Creating transfer instruction...`);
  
  // Create transfer instruction
  const ix = createTransferInstruction(
    {
      merkleTree,
      treeAuthority,
      leafOwner: leafOwnerPubkey,
      leafDelegate: leafOwnerPubkey,
      newLeafOwner: receiver,
      // Important log wrapper for transaction success
      logWrapper: new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"),
      // Required SPL noop program
      noop: SPL_NOOP_PROGRAM_ID,
    },
    {
      root: Buffer.from(root, "base64"),
      dataHash: Buffer.from(data_hash, "base64"),
      creatorHash: Buffer.from(creator_hash, "base64"),
      index,
      proof: proof.map((p) => Buffer.from(p, "base64")),
    }
  );
  
  // Create connection
  const connection = await getConnection();
  
  // Create transaction
  const tx = new Transaction().add(ix);
  tx.feePayer = senderKeypair.publicKey;
  
  // Get latest blockhash
  console.log(`🔄 Getting latest blockhash...`);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  
  // Sign transaction
  console.log(`🔑 Signing transaction...`);
  tx.sign(senderKeypair);
  
  // Send and confirm transaction
  console.log(`📡 Sending transaction to network...`);
  try {
    const signature = await sendAndConfirmTransaction(
      connection, 
      tx, 
      [senderKeypair],
      {
        skipPreflight: true,
        maxRetries: 3,
        commitment: "confirmed"
      }
    );
    
    console.log(`✅ cNFT sent successfully!`);
    console.log(`📝 Transaction signature: ${signature}`);
    
    return {
      success: true,
      signature,
      message: "cNFT transferred successfully"
    };
  } catch (error) {
    console.error(`❌ Transaction failed: ${error.message}`);
    throw error;
  }
}

// Main function for CLI usage
async function main() {
  try {
    // Ensure required arguments
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.error("Usage: node working-cnft-transfer.js PRIVATE_KEY_BASE58 ASSET_ID");
      process.exit(1);
    }
    
    // Parse arguments
    const privateKeyBase58 = args[0];
    const assetId = args[1];
    
    // Optional custom receiver address (default: PROJECT_WALLET)
    const receiverAddress = args[2] || PROJECT_WALLET;
    
    // Create keypair from private key
    const senderKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
    console.log(`💳 Sender wallet: ${senderKeypair.publicKey.toString()}`);
    console.log(`📦 cNFT asset ID: ${assetId}`);
    console.log(`📫 Receiver address: ${receiverAddress}`);
    
    // Get proof data for the asset
    const proofData = await getProof(assetId);
    console.log(`✓ Got proof data, preparing transaction...`);
    
    // Transfer the cNFT
    const result = await transferCnft(senderKeypair, proofData, receiverAddress);
    console.log(result);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  main();
}

// Export for use in other modules
module.exports = {
  transferCnft,
  getProof,
  getCnfts
};