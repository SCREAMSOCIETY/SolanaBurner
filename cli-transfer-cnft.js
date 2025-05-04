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
    
    if (args.length < 2) {
      console.error('Usage: node cli-transfer-cnft.js <PRIVATE_KEY_BASE58> <ASSET_ID> [DESTINATION_ADDRESS]');
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
    
    // Transfer the cNFT
    console.log('\nTransferring cNFT...');
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