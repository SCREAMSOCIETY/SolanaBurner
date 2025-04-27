/**
 * Create Merkle Tree for Compressed NFTs
 * 
 * This script creates a new Merkle tree for compressed NFTs on the Solana blockchain.
 * It will generate a new keypair that will serve as the tree authority, allowing our
 * application to burn cNFTs within this tree.
 * 
 * Usage:
 * node create-merkle-tree.js
 * 
 * The script outputs the tree address and tree authority keypair that should be used
 * as environment variables in the application.
 */

const { 
  Connection, 
  Keypair, 
  PublicKey, 
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const { 
  createCreateTreeInstruction,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID
} = require('@solana/spl-account-compression');
const { 
  PROGRAM_ID: BUBBLEGUM_PROGRAM_ID,
} = require('@metaplex-foundation/mpl-bubblegum');
const bs58 = require('bs58');
require('dotenv').config();

// For creating trees, we'll use devnet which has a working airdrop faucet
const RPC_URL = clusterApiUrl('devnet');
console.log(`Using RPC URL for tree creation: ${RPC_URL} (devnet)`);
console.log('Note: Trees are being created on devnet for testing purposes');

// Constants for tree creation
const MAX_DEPTH = 14; // Max tree depth (14 can store up to 16,384 cNFTs)
const MAX_BUFFER_SIZE = 64; // Buffer size for concurrent operations

// Define connection
const connection = new Connection(RPC_URL, 'confirmed');

/**
 * Create a new Merkle tree for compressed NFTs
 */
async function createMerkleTree() {
  try {
    console.log('Creating new Merkle tree for compressed NFTs...');
    
    // Generate a new keypair for the payer (tree creator)
    const payer = Keypair.generate();
    console.log(`Payer public key: ${payer.publicKey.toString()}`);
    
    // Get some SOL for the payer to cover transaction fees
    console.log('Requesting airdrop for transaction fees...');
    let signature = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature);
    
    // Check balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log(`Payer balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    
    if (balance === 0) {
      console.error('Failed to get SOL for the payer. This may be because you are on mainnet or because the devnet faucet is empty.');
      console.error('Please fund the payer account manually before continuing.');
      return;
    }
    
    // Generate a new keypair for the tree
    const treeKeypair = Keypair.generate();
    console.log(`Tree public key: ${treeKeypair.publicKey.toString()}`);
    
    // Derive the tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treeKeypair.publicKey.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    console.log(`Tree authority: ${treeAuthority.toString()}`);
    
    // Create the instruction to create a new tree
    const createTreeIx = createCreateTreeInstruction(
      {
        payer: payer.publicKey,
        treeCreator: payer.publicKey,
        treeAuthority,
        merkleTree: treeKeypair.publicKey,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        logWrapper: SPL_NOOP_PROGRAM_ID,
      },
      {
        maxDepth: MAX_DEPTH,
        maxBufferSize: MAX_BUFFER_SIZE,
        public: true,
      },
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Create and send the transaction
    const tx = new Transaction().add(createTreeIx);
    const txSignature = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer, treeKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`Tree created successfully! Transaction signature: ${txSignature}`);
    console.log(`Explorer URL: https://solscan.io/tx/${txSignature}?cluster=devnet`);
    
    // Output the tree information
    console.log('\n=== TREE INFORMATION ===');
    console.log(`Tree address: ${treeKeypair.publicKey.toString()}`);
    console.log(`Tree authority: ${treeAuthority.toString()}`);
    console.log(`Tree creator (payer): ${payer.publicKey.toString()}`);
    
    // Output the environment variables to set
    console.log('\n=== ENVIRONMENT VARIABLES ===');
    console.log(`TREE_ADDRESS=${treeKeypair.publicKey.toString()}`);
    console.log(`TREE_AUTHORITY_SECRET_KEY=${bs58.encode(payer.secretKey)}`);
    
    console.log('\nIMPORTANT: Keep the tree authority secret key secure and set it as an environment variable in your application.');
    console.log('This key allows your application to burn cNFTs in this tree.');
    
    return {
      treeAddress: treeKeypair.publicKey.toString(),
      treeAuthority: treeAuthority.toString(),
      treeAuthoritySecretKey: bs58.encode(payer.secretKey)
    };
  } catch (error) {
    console.error('Error creating Merkle tree:', error);
    throw error;
  }
}

// Run the function if this file is executed directly
if (require.main === module) {
  createMerkleTree()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { createMerkleTree };