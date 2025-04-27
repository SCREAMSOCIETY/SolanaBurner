# Creating Your Own Merkle Tree for cNFTs

This guide explains how to create your own Merkle tree for compressed NFTs (cNFTs) using the Solana blockchain. By creating your own tree, you'll be able to mint and burn cNFTs with full authority.

## What is a Merkle Tree?

A Merkle tree is a data structure that allows for efficient and secure verification of content in a large body of data. In Solana's compression system, Merkle trees are used to store compressed NFT data on-chain in a space-efficient manner.

## Prerequisites

To create a Merkle tree and mint cNFTs, you'll need:

1. A Solana wallet with SOL for transaction fees
2. Node.js and npm installed
3. A Solana RPC endpoint (devnet is recommended for testing)

## Step 1: Install Dependencies

```bash
npm install @solana/web3.js @solana/spl-account-compression @metaplex-foundation/mpl-bubblegum bs58 dotenv
```

## Step 2: Create a Merkle Tree

A Merkle tree is created by sending a transaction that initializes the tree structure on-chain. Here's the basic flow:

1. Generate a tree keypair (this will be the tree's address)
2. Derive the tree authority (a PDA derived from the tree address)
3. Create and send a transaction that initializes the tree

```javascript
const { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl
} = require('@solana/web3.js');

// Create a new Merkle tree
async function createTree() {
  // Connect to devnet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  // Generate new keypairs
  const payer = Keypair.generate(); // Will be the tree authority
  const treeKeypair = Keypair.generate(); // The tree address
  
  // Request SOL for the payer (on devnet only)
  await connection.requestAirdrop(payer.publicKey, 1000000000);
  
  // Create the tree with a transaction
  // This is simplified - in reality you need to:
  // 1. Create the proper instructions for tree creation
  // 2. Include the program IDs for compression
  // 3. Set the max depth and buffer size parameters
  
  console.log(`Tree address: ${treeKeypair.publicKey.toString()}`);
  console.log(`Tree authority: ${payer.publicKey.toString()}`);
}
```

## Step 3: Mint a Compressed NFT

After creating a tree, you can mint cNFTs to it:

```javascript
// Mint a cNFT to your tree
async function mintCNFT(treeAddress, treeAuthority, recipientAddress) {
  // Connect to devnet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  // Load the tree authority keypair
  // You must have this keypair to mint to your tree
  
  // Create the mint instruction
  // This is simplified - in reality you need to:
  // 1. Create the proper instruction for minting
  // 2. Include metadata for the NFT
  // 3. Sign with the tree authority
  
  console.log(`Minted cNFT to recipient: ${recipientAddress}`);
}
```

## Step 4: Burn a Compressed NFT

As the tree authority, you can burn cNFTs from your tree:

```javascript
// Burn a cNFT from your tree
async function burnCNFT(treeAddress, treeAuthority, assetId) {
  // Connect to devnet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  // Load the tree authority keypair
  // You must have this keypair to burn from your tree
  
  // Create the burn instruction
  // This is simplified - in reality you need to:
  // 1. Create the proper instruction for burning
  // 2. Include the asset proof data
  // 3. Sign with the tree authority
  
  console.log(`Burned cNFT with asset ID: ${assetId}`);
}
```

## Important Notes

1. **Tree Authority**: The tree authority has full control over the tree. Keep your tree authority keypair secure.

2. **Devnet vs Mainnet**: Start on devnet for testing. Creating trees and minting cNFTs on mainnet requires SOL for transaction fees.

3. **Storage Requirements**: Merkle trees with greater depth can store more cNFTs but require more storage and are more expensive to create.

4. **Maximum cNFTs**: The number of cNFTs a tree can contain is 2^maxDepth. For example, a tree with maxDepth=14 can store up to 16,384 cNFTs.

## Using Our Helper Scripts

We've provided helper scripts to simplify this process:

1. `setup-cnft-tree.js` - Interactive script to create a tree and configure environment variables
2. `mint-cnft.js` - Script to mint a test cNFT to your wallet
3. `simplified-cnft-burn-server.js` - A server that can process burn requests for cNFTs in your tree

To use these scripts:

```bash
# Create a tree
node setup-cnft-tree.js

# Mint a test cNFT (after creating a tree)
node mint-cnft.js YOUR_WALLET_ADDRESS

# The server will automatically use your tree authority when burning cNFTs
```

After setting up your tree and minting cNFTs, you can use the SolBurn application to burn them with real on-chain transactions rather than simulations.