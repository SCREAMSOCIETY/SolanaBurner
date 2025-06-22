# Compressed NFT (cNFT) Burning Guide

This guide explains how to set up and use real cNFT burning functionality in the Solburnt application.

## Overview

By default, the application runs in "simulation mode" for compressed NFTs, as regular users don't have permission to burn cNFTs they own without the tree authority's involvement. This guide helps you set up your own Merkle tree, mint cNFTs to it, and burn them using real on-chain transactions.

## Prerequisites

- A Solana wallet with some SOL for transaction fees
- Node.js and npm installed
- The SolBurn application code

## Setup Process

### Option 1: Automated Setup

We've created a setup script that guides you through the entire process:

```bash
node setup-cnft-tree.js
```

This script will:
1. Create a new Merkle tree for compressed NFTs
2. Set up environment variables for the tree authority
3. Allow you to mint a test cNFT to your wallet
4. Configure the application to use your tree authority for burning

### Option 2: Manual Setup

If you prefer to do the setup manually, follow these steps:

#### Step 1: Create a Merkle Tree

Run the create-merkle-tree.js script to generate a new Merkle tree:

```bash
node create-merkle-tree.js
```

This will output:
- The tree address
- The tree authority keypair
- Environment variables to set

#### Step 2: Set Environment Variables

Create or update your .env file with the values from the previous step:

```
TREE_ADDRESS=<your_tree_address>
TREE_AUTHORITY_SECRET_KEY=<your_tree_authority_secret_key>
```

#### Step 3: Mint a Test cNFT

Mint a test compressed NFT to your wallet:

```bash
node mint-cnft.js <your_wallet_address>
```

#### Step 4: Restart the Server

Restart the server to apply the new configuration:

```bash
node fastifyServer.js
```

## How It Works

When the application has a valid tree authority keypair and tree address:

1. The delegation step allows your wallet to delegate burning authority to the server
2. The server processes burn requests using the tree authority keypair
3. Real on-chain transactions are performed to burn the cNFTs

## Limitations

- You can only burn cNFTs that were minted to your own tree
- cNFTs from other collections will still be processed in simulation mode
- The tree authority keypair should be kept secure, as it has full control over the tree

## Troubleshooting

### Error: "Failed to airdrop SOL"

This may happen on mainnet where the faucet doesn't exist. Fund your tree authority wallet manually.

### Error: "Invalid tree authority"

Check that your TREE_AUTHORITY_SECRET_KEY is correctly set in the .env file.

### Error: "Asset doesn't belong to this tree"

You can only burn cNFTs that were minted to your own tree. Other cNFTs will still use simulation mode.

## Security Considerations

- The tree authority keypair gives full control over the tree, keep it secure
- In a production environment, use proper secret management practices
- Never share your tree authority secret key

## Further Reading

- [Solana Compressed NFTs Documentation](https://docs.solana.com/developing/guides/compressed-nfts)
- [Metaplex Bubblegum Documentation](https://developers.metaplex.com/bubblegum)