/**
 * Metaplex CNFT Transfer
 * 
 * This module implements the official Metaplex approach for transferring compressed NFTs.
 * Based on the proper implementation using @metaplex-foundation/mpl-bubblegum
 */

import { Connection, PublicKey, Transaction, ComputeBudgetProgram, TransactionInstruction } from '@solana/web3.js';
import { createTransferInstruction } from '@metaplex-foundation/mpl-bubblegum';
import bs58 from 'bs58';

// Constants
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');

/**
 * Transfer a compressed NFT to another wallet using the official Metaplex approach
 * 
 * @param {Object} params - Transfer parameters
 * @param {Connection} params.connection - Solana connection
 * @param {Object} params.wallet - Wallet with signTransaction method
 * @param {string} params.assetId - Asset ID of the cNFT
 * @param {string} params.destinationAddress - Destination wallet address
 * @param {Object} params.proofData - Asset proof data from Helius API
 * @param {Object} params.assetData - Asset data (optional)
 * @returns {Promise<Object>} - Result of the transfer
 */
export async function transferCompressedNFT(params) {
  try {
    const { connection, wallet, destinationAddress, proofData } = params;
    
    console.log("Using official Metaplex Bubblegum transfer approach");
    
    // Create a new transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: wallet.publicKey,
      blockhash,
      lastValidBlockHeight,
    });
    
    // Add compute budget instruction for complex operations
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ 
        units: 400000 // Higher compute units for cNFT operations
      })
    );
    
    // Get merkle tree from proof data
    const merkleTree = new PublicKey(proofData.tree_id);
    console.log("Merkle tree:", merkleTree.toString());
    
    // Generate the tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Generate the log wrapper PDA
    const [logWrapper] = PublicKey.findProgramAddressSync(
      [Buffer.from("log_wrapper", "utf8")],
      SPL_NOOP_PROGRAM_ID
    );
    
    console.log("Creating transfer instruction");
    console.log("Tree authority:", treeAuthority.toString());
    console.log("Log wrapper:", logWrapper.toString());
    console.log("Leaf owner:", wallet.publicKey.toString());
    console.log("New leaf owner:", destinationAddress);
    
    // Using the Metaplex helper to create the transfer instruction
    // This handles all the account setup and data formatting correctly
    const transferIx = createTransferInstruction(
      {
        treeAuthority,
        leafOwner: wallet.publicKey,
        leafDelegate: wallet.publicKey,
        newLeafOwner: new PublicKey(destinationAddress),
        merkleTree,
        logWrapper,
      },
      {
        // Root is the current merkle root hash
        root: Buffer.from(bs58.decode(proofData.root)),
        // dataHash is the hash of the NFT's metadata
        dataHash: Buffer.from(bs58.decode(proofData.data_hash || "11111111111111111111111111111111")),
        // creatorHash is the hash of the NFT's creators
        creatorHash: Buffer.from(bs58.decode(proofData.creator_hash || "11111111111111111111111111111111")),
        // leaf index in the tree
        index: proofData.leaf_id,
        // Proof path from leaf to root (limit to 12 nodes to avoid tx size issues)
        proof: proofData.proof.slice(0, 12).map(node => {
          // Convert from base58 string to Buffer
          return Buffer.from(bs58.decode(node));
        }),
      }
    );
    
    // Add the transfer instruction to transaction
    transaction.add(transferIx);
    
    console.log("Transfer instruction created");
    console.log("Requesting wallet signature...");
    
    // Sign the transaction
    const signedTx = await wallet.signTransaction(transaction);
    
    console.log("Sending transaction...");
    
    // Send the transaction
    let signature;
    try {
      signature = await connection.sendRawTransaction(
        signedTx.serialize(),
        { 
          skipPreflight: false,
          maxRetries: 3,
          preflightCommitment: 'confirmed' 
        }
      );
      
      console.log("Transaction sent, confirming...");
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      console.log("Transaction confirmed successfully");
    } catch (sendError) {
      // Check if expired blockhash error
      if (sendError.message && (
        sendError.message.includes("expired") || 
        sendError.message.includes("block height exceeded")
      )) {
        console.log("Transaction expired, retrying with fresh blockhash...");
        
        // Get fresh blockhash
        const { blockhash: newBlockhash, lastValidBlockHeight: newHeight } = 
          await connection.getLatestBlockhash('finalized');
        
        // Update transaction with new blockhash
        transaction.recentBlockhash = newBlockhash;
        transaction.lastValidBlockHeight = newHeight;
        
        // Sign again
        const newSignedTx = await wallet.signTransaction(transaction);
        
        // Send with fresh blockhash
        signature = await connection.sendRawTransaction(
          newSignedTx.serialize(),
          { 
            skipPreflight: false,
            maxRetries: 3,
            preflightCommitment: 'confirmed' 
          }
        );
        
        console.log("Retry transaction sent, confirming...");
        await connection.confirmTransaction({
          signature,
          blockhash: newBlockhash,
          lastValidBlockHeight: newHeight
        }, 'confirmed');
        console.log("Retry transaction confirmed successfully");
      } else {
        console.error("Transaction error:", sendError);
        throw sendError;
      }
    }
    
    // Transaction was successful
    return {
      success: true,
      signature,
      message: "Successfully transferred cNFT",
      explorerUrl: `https://solscan.io/tx/${signature}`
    };
    
  } catch (error) {
    console.error("Error in Metaplex transfer implementation:", error);
    
    return {
      success: false,
      error: error.message || "Unknown error in Metaplex transfer",
      transactionLogs: error.logs || []
    };
  }
}

// Export as window object for direct use in other files
if (typeof window !== 'undefined') {
  window.metaplexCnftTransfer = {
    transferCompressedNFT
  };
}