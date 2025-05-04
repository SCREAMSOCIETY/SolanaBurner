/**
 * CLI Tool for Transferring cNFTs
 * 
 * This is a simple command-line tool that leverages our working-cnft-transfer.js module
 * to transfer compressed NFTs from command line, bypassing browser limitations.
 * 
 * Usage:
 * node cli-transfer-cnft.js <PRIVATE_KEY_BASE58> <ASSET_ID> [DESTINATION_ADDRESS]
 * 
 * If DESTINATION_ADDRESS is not provided, the default project wallet is used.
 */

require('dotenv').config();
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');
const transferModule = require('./working-cnft-transfer');

// Project wallet to use as default destination
const PROJECT_WALLET = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    // Special test mode for debugging proof data format
    if (args[0] === '--test-format') {
      if (!args[1]) {
        console.error('Usage: node cli-transfer-cnft.js --test-format <ASSET_ID>');
        process.exit(1);
      }
      
      const assetId = args[1];
      console.log('===== TEST MODE: PROOF DATA FORMAT =====');
      console.log(`Testing proof data format for asset: ${assetId}`);
      
      // Get the proof data for the asset
      console.log('\nFetching proof data...');
      const proofData = await transferModule.getProof(assetId);
      
      // Log the complete proof data structure
      console.log('\nComplete proof data structure:');
      console.log(JSON.stringify(proofData, null, 2));
      
      // Check key properties
      console.log('\n=== Key Properties ===');
      console.log(`Asset ID: ${assetId}`);
      console.log(`Tree ID: ${proofData.tree_id || (proofData.compression && proofData.compression.tree) || 'Missing!'}`);
      console.log(`Proof array length: ${proofData.proof ? proofData.proof.length : 'Missing!'}`);
      console.log(`Compression object exists: ${proofData.compression ? 'Yes' : 'No'}`);
      
      if (proofData.compression) {
        console.log('Compression data:');
        console.log(` - Tree: ${proofData.compression.tree || 'Missing'}`);
        console.log(` - Leaf ID: ${proofData.compression.leaf_id || 'Missing'}`);
        console.log(` - Proof array exists: ${proofData.compression.proof ? 'Yes' : 'No'}`);
      }
      
      // Exit without transferring
      console.log('\n✅ Test completed. No transfer was performed.');
      return;
    }
    
    if (args.length < 2) {
      console.error('Usage: node cli-transfer-cnft.js <PRIVATE_KEY_BASE58> <ASSET_ID> [DESTINATION_ADDRESS]');
      console.error('       node cli-transfer-cnft.js --test-format <ASSET_ID>');
      process.exit(1);
    }
    
    // Extract arguments
    const privateKeyBase58 = args[0];
    const assetId = args[1];
    const destinationAddress = args[2] || PROJECT_WALLET;
    
    // Create the keypair from the provided private key
    const secretKey = bs58.decode(privateKeyBase58);
    const senderKeypair = Keypair.fromSecretKey(secretKey);
    
    console.log('===== cNFT TRANSFER TOOL =====');
    console.log(`Sender: ${senderKeypair.publicKey.toString()}`);
    console.log(`Asset ID: ${assetId}`);
    console.log(`Destination: ${destinationAddress}`);
    
    // Get the proof data for the asset
    console.log('\nFetching proof data...');
    const proofData = await transferModule.getProof(assetId);
    console.log('✅ Proof data fetched successfully');
    
    // Check key properties of the proof data
    console.log('\n=== Diagnostic Info ===');
    console.log(`Asset ID: ${assetId}`);
    console.log(`Tree ID: ${proofData.tree_id || (proofData.compression && proofData.compression.tree) || 'Missing!'}`);
    console.log(`Proof array length: ${proofData.proof ? proofData.proof.length : 'Missing!'}`);
    console.log(`Compression object exists: ${proofData.compression ? 'Yes' : 'No'}`);
    
    if (proofData.compression) {
      console.log('Compression data:');
      console.log(` - Tree: ${proofData.compression.tree || 'Missing'}`);
      console.log(` - Leaf ID: ${proofData.compression.leaf_id || 'Missing'}`);
      console.log(` - Proof array exists: ${proofData.compression.proof ? 'Yes' : 'No'}`);
    }
    
    // Transfer the cNFT
    console.log('\nTransferring cNFT...');
    console.log(`From: ${senderKeypair.publicKey.toString()}`);
    console.log(`To: ${destinationAddress}`);
    
    try {
      const result = await transferModule.transferCnft(
        senderKeypair,
        proofData,
        destinationAddress
      );
      
      if (result.success) {
        console.log(`\n✅ Successfully transferred cNFT to ${destinationAddress}`);
        console.log(`Transaction Signature: ${result.signature}`);
        console.log(`Explorer URL: https://solscan.io/tx/${result.signature}`);
      } else {
        console.error(`\n❌ Transfer failed: ${result.error}`);
        if (result.stack) {
          console.error('Error stack trace:');
          console.error(result.stack);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error('\n❌ Unhandled exception during transfer:');
      console.error(error.message);
      console.error(error.stack);
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