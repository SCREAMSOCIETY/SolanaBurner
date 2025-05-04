/**
 * Direct cNFT Transfer CLI
 * 
 * A simple command-line tool to transfer cNFTs using our server-side handler.
 * This script avoids all the browser compatibility issues by running directly on Node.js.
 * 
 * Usage:
 * node direct-cnft-transfer.js <PRIVATE_KEY_BASE58> <ASSET_ID>
 */

const { processDirectTransfer } = require('./server-side-cnft-handler');

// Parse command-line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log(`
Direct cNFT Transfer CLI

Usage:
  node direct-cnft-transfer.js <PRIVATE_KEY_BASE58> <ASSET_ID>

Example:
  node direct-cnft-transfer.js 4VDgUbkqGJsNreTXHrRXPkK3gmBQ6nBKMGq7G5nK1234 HWgd4xSyUHgg6Qkp2YaAQXMhgj3nwYP33USzHakREJxQ
  `);
  process.exit(1);
}

const privateKeyBase58 = args[0];
const assetId = args[1];

// Main function
async function main() {
  try {
    console.log('\n=== Direct cNFT Transfer CLI ===\n');
    
    // Mask private key for security
    const maskedKey = privateKeyBase58.substring(0, 4) + '...' + privateKeyBase58.substring(privateKeyBase58.length - 4);
    console.log(`Using private key: ${maskedKey}`);
    console.log(`Asset ID: ${assetId}`);
    
    // Process the transfer
    console.log('\nProcessing transfer...');
    const result = await processDirectTransfer(assetId, privateKeyBase58);
    
    console.log('\n✅ Transfer completed successfully!');
    console.log(`Signature: ${result.signature}`);
    console.log(`Explorer URL: ${result.explorerUrl}`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
main();