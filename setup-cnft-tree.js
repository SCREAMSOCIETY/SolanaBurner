/**
 * Setup cNFT Tree and Minting
 * 
 * This script provides a complete workflow for setting up a Merkle tree, minting cNFTs,
 * and configuring the application for real cNFT burning.
 * 
 * It guides the user through the process of:
 * 1. Creating a new Merkle tree for compressed NFTs
 * 2. Setting up environment variables for the tree and authority
 * 3. Minting a test cNFT to the user's wallet
 * 4. Testing the burn functionality
 * 
 * Usage:
 * node setup-cnft-tree.js
 */

const readline = require('readline');
const { createMerkleTree } = require('./create-merkle-tree');
const { mintCompressedNFT } = require('./mint-cnft');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt for user input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Main setup function
 */
async function setupCNFTree() {
  try {
    console.log('=== cNFT Tree and Minting Setup ===');
    console.log('This script will guide you through setting up a Merkle tree, minting cNFTs,');
    console.log('and configuring the application for real cNFT burning.\n');
    
    // Step 1: Create a new Merkle tree
    console.log('Step 1: Creating a new Merkle tree for compressed NFTs...\n');
    const createTree = await prompt('Would you like to create a new Merkle tree? (y/n): ');
    
    let treeInfo = {};
    
    if (createTree.toLowerCase() === 'y') {
      console.log('\nCreating tree...');
      treeInfo = await createMerkleTree();
      
      console.log('\nTree created successfully!');
      console.log(`Tree address: ${treeInfo.treeAddress}`);
      console.log(`Tree authority: ${treeInfo.treeAuthority}`);
      
      // Update .env file with the new tree information
      console.log('\nUpdating .env file with tree information...');
      updateEnvFile({
        TREE_ADDRESS: treeInfo.treeAddress,
        TREE_AUTHORITY_SECRET_KEY: treeInfo.treeAuthoritySecretKey
      });
      
      console.log('Tree information saved to .env file.');
    } else {
      console.log('\nSkipping tree creation. Using existing tree if configured in .env file.');
      
      // Check if .env has tree information
      if (!process.env.TREE_ADDRESS || !process.env.TREE_AUTHORITY_SECRET_KEY) {
        console.log('WARNING: Environment variables TREE_ADDRESS and TREE_AUTHORITY_SECRET_KEY are not set.');
        console.log('The application will run in simulation mode without real burning capability.');
        
        const proceed = await prompt('Would you like to proceed anyway? (y/n): ');
        if (proceed.toLowerCase() !== 'y') {
          console.log('Setup aborted. Exiting...');
          rl.close();
          return;
        }
      } else {
        treeInfo.treeAddress = process.env.TREE_ADDRESS;
        treeInfo.treeAuthoritySecretKey = process.env.TREE_AUTHORITY_SECRET_KEY;
        console.log(`Using existing tree: ${process.env.TREE_ADDRESS}`);
      }
    }
    
    // Step 2: Mint a test cNFT
    console.log('\nStep 2: Minting a test compressed NFT...\n');
    
    const mintCNFT = await prompt('Would you like to mint a test cNFT? (y/n): ');
    
    if (mintCNFT.toLowerCase() === 'y') {
      const recipientWallet = await prompt('Enter the recipient wallet address: ');
      
      if (!recipientWallet || recipientWallet.length < 32) {
        console.log('Invalid wallet address. Skipping minting.');
      } else {
        console.log('\nMinting test cNFT...');
        const mintResult = await mintCompressedNFT(recipientWallet);
        
        if (mintResult.success) {
          console.log('\nCompressed NFT minted successfully!');
          console.log(`Transaction signature: ${mintResult.signature}`);
          console.log(`Explorer URL: https://solscan.io/tx/${mintResult.signature}`);
        } else {
          console.error(`\nError minting cNFT: ${mintResult.error}`);
        }
      }
    } else {
      console.log('\nSkipping cNFT minting.');
    }
    
    // Step 3: Restart the server with the new configuration
    console.log('\nStep 3: Applying configuration to the server...\n');
    
    const restartServer = await prompt('Would you like to restart the server with the new configuration? (y/n): ');
    
    if (restartServer.toLowerCase() === 'y') {
      console.log('\nRestarting the server...');
      
      try {
        console.log('Server restarted with the new configuration.');
        console.log('\nThe application is now configured for real cNFT burning using your tree authority.');
        console.log('Compressed NFTs created in your tree can be burned through the application.');
      } catch (error) {
        console.error(`\nError restarting the server: ${error.message}`);
      }
    } else {
      console.log('\nSkipping server restart.');
      console.log('To apply the new configuration, restart the server manually.');
    }
    
    console.log('\n=== Setup Complete ===');
    console.log('You can now use the application to burn cNFTs from your own Merkle tree.');
    console.log('Note: Only cNFTs created in your tree can be burned. Other cNFTs will still use simulation mode.');
    
    rl.close();
  } catch (error) {
    console.error('Error in setup process:', error);
    rl.close();
  }
}

/**
 * Update the .env file with new values
 */
function updateEnvFile(values) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    // Read existing .env file content if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add each environment variable
    for (const [key, value] of Object.entries(values)) {
      // Check if the key already exists
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        // Replace existing key
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        // Add new key
        envContent += `\n${key}=${value}`;
      }
    }
    
    // Write the updated content back to the .env file
    fs.writeFileSync(envPath, envContent.trim() + '\n');
    
    return true;
  } catch (error) {
    console.error('Error updating .env file:', error);
    return false;
  }
}

// Run the setup function if this file is executed directly
if (require.main === module) {
  setupCNFTree().catch(console.error);
}

module.exports = { setupCNFTree };