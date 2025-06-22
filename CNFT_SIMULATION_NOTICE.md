# Compressed NFT (cNFT) Burning - Simulation Mode Notice

## Important Information About cNFT Burning

When using the Solburnt application, you'll notice that compressed NFTs (cNFTs) are handled differently from regular tokens and NFTs. This document explains why and what to expect.

## Why Simulation Mode?

Compressed NFTs use a special technology called "state compression" that makes them more efficient and less expensive to create and transfer. However, this efficiency comes with a trade-off: **regular users cannot burn their own cNFTs without the involvement of the "tree authority"**.

The tree authority is the entity that created and manages the Merkle tree where the cNFT exists. Only this authority has permission to burn cNFTs in that tree.

## What Does Simulation Mode Mean?

When you select and "burn" a cNFT in SolBurn:

1. The application attempts to verify if you are delegating burning authority to our server
2. If delegation is successful, the server attempts to process the burn request
3. Since our server does not have tree authority for most cNFTs, it cannot perform a real on-chain burn
4. The application shows a "Simulated Burn" success message to demonstrate how the feature would work

## When Will Real Burning Work?

Real cNFT burning will work in these cases:

1. If you created your own Merkle tree using our setup tools and minted cNFTs to it
2. If you are the creator/tree authority of the cNFT collection
3. If the collection owner has explicitly granted burning permissions to our application

## Technical Details

The delegation pattern we're using follows the Metaplex Bubblegum standard for cNFT burning:

1. The user delegates burning authority to our server
2. Our server, if it has tree authority permissions, can then burn the cNFT
3. Without tree authority, the transaction cannot be completed on-chain

## Creating Your Own Burnable cNFTs

If you'd like to test real cNFT burning functionality, you can:

1. Use our `setup-cnft-tree.js` script to create your own Merkle tree
2. Mint test cNFTs to your wallet using `mint-cnft.js`
3. Set up the environment variables as instructed in the setup process
4. Restart the application to enable real burning for your cNFTs

## Burn Verification

Even in simulation mode, the application performs all the necessary checks and verification steps that would be required for a real burn transaction. This includes:

- Verifying ownership of the cNFT
- Checking signature verification
- Validating proof data
- Constructing the proper transaction format

The only difference is that the final transaction submission is simulated rather than executed on-chain.