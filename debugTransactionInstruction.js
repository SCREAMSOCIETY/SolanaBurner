/**
 * Debug script to investigate the TransactionInstruction error
 * 
 * This script checks if TransactionInstruction is correctly imported and available
 * from the @solana/web3.js library.
 */

// Import all major classes from @solana/web3.js
const solanaWeb3 = require('@solana/web3.js');

console.log("=== DEBUG: @solana/web3.js imports ===");

// List all available exports from the web3.js module
console.log("Available exports from @solana/web3.js:");
const exportNames = Object.keys(solanaWeb3);
console.log(exportNames.join(', '));

// Specifically check for TransactionInstruction
console.log("\nIs TransactionInstruction available?", 
  typeof solanaWeb3.TransactionInstruction !== 'undefined' ? "YES" : "NO");

// Check what type of object it is
if (typeof solanaWeb3.TransactionInstruction !== 'undefined') {
  console.log("TransactionInstruction type:", typeof solanaWeb3.TransactionInstruction);
  console.log("Is constructor?", solanaWeb3.TransactionInstruction.toString().startsWith('class') || 
    solanaWeb3.TransactionInstruction.toString().startsWith('function'));
}

// Check other core Transaction-related classes
console.log("\nOther transaction-related classes:");
console.log("Transaction available?", typeof solanaWeb3.Transaction !== 'undefined' ? "YES" : "NO");
console.log("PublicKey available?", typeof solanaWeb3.PublicKey !== 'undefined' ? "YES" : "NO");
console.log("Keypair available?", typeof solanaWeb3.Keypair !== 'undefined' ? "YES" : "NO");

// Try to create instances
console.log("\n=== Trying to create instances ===");

try {
  console.log("Creating a PublicKey...");
  const pubkey = new solanaWeb3.PublicKey("11111111111111111111111111111111");
  console.log("PublicKey created successfully:", pubkey.toString());
} catch (error) {
  console.error("Error creating PublicKey:", error.message);
}

try {
  console.log("\nCreating a Transaction...");
  const tx = new solanaWeb3.Transaction();
  console.log("Transaction created successfully");
} catch (error) {
  console.error("Error creating Transaction:", error.message);
}

try {
  console.log("\nCreating a TransactionInstruction...");
  const ix = new solanaWeb3.TransactionInstruction({
    keys: [],
    programId: new solanaWeb3.PublicKey("11111111111111111111111111111111"),
    data: Buffer.from([])
  });
  console.log("TransactionInstruction created successfully");
} catch (error) {
  console.error("Error creating TransactionInstruction:", error.message);
}

// Import Bubblegum specific classes and functions
console.log("\n=== DEBUG: @metaplex-foundation/mpl-bubblegum imports ===");
try {
  const mplBubblegum = require('@metaplex-foundation/mpl-bubblegum');
  
  console.log("Available exports from @metaplex-foundation/mpl-bubblegum:");
  const bubblegumExports = Object.keys(mplBubblegum);
  console.log(bubblegumExports.join(', '));
  
  console.log("\nIs createTransferInstruction available?", 
    typeof mplBubblegum.createTransferInstruction !== 'undefined' ? "YES" : "NO");
  
  if (typeof mplBubblegum.createTransferInstruction !== 'undefined') {
    console.log("createTransferInstruction type:", typeof mplBubblegum.createTransferInstruction);
  }
} catch (error) {
  console.error("Error importing @metaplex-foundation/mpl-bubblegum:", error.message);
}

// Test for the most minimal working case
console.log("\n=== TESTING MINIMAL WORKING CASE ===");

try {
  // Define our own TransactionInstruction in case it's not available
  console.log("Creating a manual buffer-based instruction...");
  
  const { Transaction, PublicKey } = solanaWeb3;
  
  // Create the target public key
  const programId = new PublicKey("11111111111111111111111111111111");
  
  // Create a raw transaction
  const transaction = new Transaction();
  
  // Create a manual instruction with serialized data
  const manualInstruction = {
    programId,
    keys: [],
    data: Buffer.from([])
  };
  
  // Add the instruction directly to the transaction without using TransactionInstruction
  transaction.add(manualInstruction);
  
  console.log("Successfully created a transaction with manual instruction!");
} catch (error) {
  console.error("Error creating minimal transaction:", error.message);
}

console.log("\n=== DEBUG COMPLETE ===");