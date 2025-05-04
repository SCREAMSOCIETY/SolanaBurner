/**
 * This script transfers a cNFT from the sender's wallet to a specified receiver wallet
 * It uses the direct approach from the working example you shared.
 */

const { 
  Connection, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction, 
  Keypair 
} = require('@solana/web3.js');
const { 
  createTransferInstruction, 
  SPL_NOOP_PROGRAM_ID 
} = require('@metaplex-foundation/mpl-bubblegum');
const fetch = require('node-fetch');
require('dotenv').config();

// Constants
const RPC_URL = process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const connection = new Connection(RPC_URL);

// Project wallet (receiver)
const RECEIVER = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');

// Check command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('\nUsage: node transfer-cnft.js <PRIVATE_KEY_BASE58> <ASSET_ID>');
  console.log('Example: node transfer-cnft.js 4xQedPXN1Uq4yeX7hJbR9MQvMJyRR33KQoRidyj7vsPKjAWyTTyJ6qmLs52UyH94eWG8N1ZiBPoi9XgBcHeKmPZj HWgd4xSyUHgg6Qkp2YaAQXMhgj3nwYP33USzHakREJxQ\n');
  process.exit(1);
}

// Load sender's private key from command line argument
const privateKeyBase58 = args[0];
const assetId = args[1];

// Convert base58 private key to Uint8Array
const bs58 = require('bs58');
const senderPrivateKey = bs58.decode(privateKeyBase58);
const SENDER = Keypair.fromSecretKey(senderPrivateKey);

console.log(`Sender wallet: ${SENDER.publicKey.toString()}`);
console.log(`Receiver wallet: ${RECEIVER.toString()}`);
console.log(`Asset ID: ${assetId}`);

// Fetch all cNFTs owned by the sender
async function fetchCnfts(owner) {
  console.log(`Fetching cNFTs for wallet: ${owner.toString()}`);
  
  const url = `https://api.helius.xyz/v0/addresses/${owner.toString()}/assets?compressed=true&api-key=${HELIUS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  
  return data.items || [];
}

// Fetch Merkle proof for a cNFT
async function fetchProof(assetId) {
  console.log(`Fetching proof for asset: ${assetId}`);
  
  const url = `https://api.helius.xyz/v0/assets/${assetId}/proof?api-key=${HELIUS_API_KEY}`;
  const res = await fetch(url);
  return await res.json();
}

// Fetch asset details
async function fetchAsset(assetId) {
  console.log(`Fetching details for asset: ${assetId}`);
  
  const url = `https://api.helius.xyz/v0/assets/${assetId}?api-key=${HELIUS_API_KEY}`;
  const res = await fetch(url);
  return await res.json();
}

// Send a cNFT
async function sendCnft(assetId) {
  console.log('\nStarting cNFT transfer process...');
  
  // Get the asset details to verify ownership
  const assetData = await fetchAsset(assetId);
  
  // Verify ownership
  if (assetData.ownership.owner !== SENDER.publicKey.toString()) {
    console.error(`\nERROR: You don't own this cNFT. Owner is ${assetData.ownership.owner}`);
    return false;
  }
  
  console.log(`Verifying ownership... ✓ Confirmed (${assetData.ownership.owner})`);
  
  // Get the proof data
  const proofData = await fetchProof(assetId);
  
  const {
    root,
    proof,
    node_index: index,
    tree_id,
    leaf_owner,
    data_hash,
    creator_hash,
  } = proofData;

  console.log(`Merkle tree ID: ${tree_id}`);
  console.log(`Proof contains ${proof.length} elements`);
  
  const merkleTree = new PublicKey(tree_id);
  const leafOwner = new PublicKey(leaf_owner);
  const bubblegumProgramId = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');

  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    bubblegumProgramId
  );
  
  console.log(`Tree authority: ${treeAuthority.toString()}`);

  try {
    console.log('Building transfer instruction...');
    
    const ix = createTransferInstruction(
      {
        merkleTree,
        treeAuthority,
        leafOwner,
        leafDelegate: leafOwner,
        newLeafOwner: RECEIVER,
        logWrapper: new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'),
        compressionProgram: new PublicKey('SPL_Noop1111111111111111111111111111111111111111'),
        anchorRemainingAccounts: [],
      },
      {
        root: Buffer.from(root, 'base64'),
        dataHash: Buffer.from(data_hash, 'base64'),
        creatorHash: Buffer.from(creator_hash, 'base64'),
        nonce: index,
        index,
        proof: proof.map((p) => Buffer.from(p, 'base64')),
      },
      bubblegumProgramId
    );

    const tx = new Transaction().add(ix);
    tx.feePayer = SENDER.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    
    console.log('Sending transaction...');
    const sig = await sendAndConfirmTransaction(connection, tx, [SENDER], {
      skipPreflight: false,
      commitment: 'confirmed'
    });
    
    console.log(`\n✅ cNFT transfer successful!`);
    console.log(`Transaction signature: ${sig}`);
    console.log(`Explorer URL: https://solscan.io/tx/${sig}`);
    
    return true;
  } catch (error) {
    console.error(`\n❌ Error sending cNFT: ${error.message}`);
    console.error(error);
    return false;
  }
}

// List all owned cNFTs
async function listOwnedCnfts() {
  const cnfts = await fetchCnfts(SENDER.publicKey);
  
  if (!cnfts.length) {
    console.log('\n❌ No compressed NFTs found for this wallet.');
    return [];
  }
  
  console.log(`\nFound ${cnfts.length} compressed NFTs:`);
  cnfts.forEach((asset, index) => {
    console.log(`${index + 1}. ${asset.content.metadata.name} (${asset.id})`);
  });
  
  return cnfts;
}

// Main function
async function main() {
  try {
    console.log('\n==== cNFT Transfer Tool ====\n');
    
    // If no specific asset ID is provided, list all owned cNFTs
    if (assetId === 'list') {
      await listOwnedCnfts();
    } else {
      // Transfer the specified cNFT
      await sendCnft(assetId);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

// Run the script
main().then(() => {
  console.log('\nDone.');
  process.exit(0);
}).catch(error => {
  console.error(`\nUnhandled error: ${error.message}`);
  process.exit(1);
});