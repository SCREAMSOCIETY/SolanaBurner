#!/usr/bin/env node

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

const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const { transferCnft, getProof } = require('./working-cnft-transfer');

// Default project wallet
const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';

// Main function for CLI usage
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.error('\x1b[31mError: Insufficient arguments\x1b[0m');
      console.log('\nUsage:');
      console.log('  node cli-transfer-cnft.js <PRIVATE_KEY_BASE58> <ASSET_ID> [DESTINATION_ADDRESS]');
      console.log('\nArguments:');
      console.log('  PRIVATE_KEY_BASE58   Your wallet\'s private key in Base58 format');
      console.log('  ASSET_ID             The asset ID (mint) of the cNFT to transfer');
      console.log('  DESTINATION_ADDRESS  Optional: The receiving wallet address (defaults to project wallet)');
      process.exit(1);
    }

    const privateKeyBase58 = args[0];
    const assetId = args[1];
    const destinationAddress = args[2] || PROJECT_WALLET;

    console.log('\x1b[36m===============================\x1b[0m');
    console.log('\x1b[36m===== SolBurn cNFT Trasher ====\x1b[0m');
    console.log('\x1b[36m===============================\x1b[0m\n');

    // Create keypair from private key
    let senderKeypair;
    try {
      const secretKey = bs58.decode(privateKeyBase58);
      senderKeypair = Keypair.fromSecretKey(secretKey);
    } catch (error) {
      console.error('\x1b[31mError: Invalid private key. Please provide a valid Base58 encoded private key.\x1b[0m');
      process.exit(1);
    }

    console.log(`\x1b[33mSender wallet:\x1b[0m ${senderKeypair.publicKey.toString()}`);
    console.log(`\x1b[33mAsset ID:\x1b[0m ${assetId}`);
    console.log(`\x1b[33mDestination:\x1b[0m ${destinationAddress}`);
    console.log('\n\x1b[36mStarting transfer process...\x1b[0m\n');

    // Get proof data for the asset
    console.log('\x1b[36mFetching asset proof data...\x1b[0m');
    const proofData = await getProof(assetId);
    console.log('\x1b[32m✓ Proof data retrieved successfully\x1b[0m\n');

    // Transfer the cNFT
    console.log('\x1b[36mPreparing to transfer cNFT...\x1b[0m');
    const result = await transferCnft(senderKeypair, proofData, destinationAddress);
    
    if (result.success) {
      console.log('\n\x1b[32m✅ cNFT transferred successfully!\x1b[0m');
      console.log(`\x1b[33mTransaction signature:\x1b[0m ${result.signature}`);
      console.log(`\x1b[33mSolana Explorer:\x1b[0m https://explorer.solana.com/tx/${result.signature}`);
    } else {
      throw new Error(result.error || 'Unknown error occurred');
    }
    
    console.log('\n\x1b[36m===============================\x1b[0m');
    console.log('\x1b[36m======== Task Complete =========\x1b[0m');
    console.log('\x1b[36m===============================\x1b[0m');

  } catch (error) {
    console.error(`\n\x1b[31mError: ${error.message}\x1b[0m`);
    process.exit(1);
  }
}

// Run the main function
main();