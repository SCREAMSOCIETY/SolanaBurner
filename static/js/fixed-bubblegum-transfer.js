/**
 * Fixed Bubblegum Transfer Implementation
 * 
 * This module provides a fixed implementation for transferring cNFTs using the
 * Metaplex Bubblegum SDK. It fixes the "InstructionFallbackNotFound" error by using
 * the proper instruction format.
 */

import { Connection, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { createTransferInstruction } from '@metaplex-foundation/mpl-bubblegum';
import bs58 from 'bs58';

// Constants
const SPL_NOOP_PROGRAM_ID = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
const BUBBLEGUM_PROGRAM_ID = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");

/**
 * Transfer a cNFT to another wallet using the official Metaplex SDK
 */
export async function transferCNFT(options) {
  try {
    const { connection, wallet, assetId, destinationAddress, proofData, assetData } = options;
    
    console.log(`[FixedTransfer] Transferring cNFT ${assetId} to ${destinationAddress}`);
    
    // Create a transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: wallet.publicKey,
      blockhash,
      lastValidBlockHeight,
    });
    
    // Add compute budget instruction (cNFT operations need more compute)
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ 
        units: 400000 
      })
    );
    
    // Get the merkle tree from the proof data
    const merkleTree = new PublicKey(proofData.tree_id);
    console.log(`[FixedTransfer] Using merkle tree: ${merkleTree.toString()}`);
    
    // Derive the tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Derive the log wrapper PDA  
    const [logWrapper] = PublicKey.findProgramAddressSync(
      [Buffer.from("log_wrapper", "utf8")],
      SPL_NOOP_PROGRAM_ID
    );
    
    console.log(`[FixedTransfer] Tree authority: ${treeAuthority.toString()}`);
    console.log(`[FixedTransfer] Log wrapper: ${logWrapper.toString()}`);
    
    // Create the transfer instruction using the official Metaplex SDK
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
        root: Buffer.from(bs58.decode(proofData.root)),
        dataHash: Buffer.from(bs58.decode(proofData.data_hash || "11111111111111111111111111111111")),
        creatorHash: Buffer.from(bs58.decode(proofData.creator_hash || "11111111111111111111111111111111")),
        index: proofData.leaf_id,
        // Limit to 12 nodes to avoid transaction size issues
        proof: proofData.proof.slice(0, 12).map(node => Buffer.from(bs58.decode(node)))
      }
    );
    
    // Add the transfer instruction to the transaction
    transaction.add(transferIx);
    
    // Sign and send the transaction
    console.log(`[FixedTransfer] Requesting wallet signature`);
    const signedTx = await wallet.signTransaction(transaction);
    
    console.log(`[FixedTransfer] Sending transaction`);
    let signature;
    
    try {
      // Send the transaction
      signature = await connection.sendRawTransaction(
        signedTx.serialize(),
        { 
          skipPreflight: false,
          maxRetries: 3,
          preflightCommitment: 'confirmed' 
        }
      );
      
      // Wait for confirmation
      console.log(`[FixedTransfer] Transaction sent, waiting for confirmation`);
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      console.log(`[FixedTransfer] Transaction confirmed: ${signature}`);
    } catch (sendError) {
      // Handle expired blockhash errors
      if (sendError.message && (
        sendError.message.includes("expired") || 
        sendError.message.includes("block height exceeded")
      )) {
        console.log(`[FixedTransfer] Transaction expired, retrying with fresh blockhash`);
        
        // Get a fresh blockhash
        const { blockhash: newBlockhash, lastValidBlockHeight: newHeight } = 
          await connection.getLatestBlockhash('finalized');
        
        // Update the transaction
        transaction.recentBlockhash = newBlockhash;
        transaction.lastValidBlockHeight = newHeight;
        
        // Sign again
        const newSignedTx = await wallet.signTransaction(transaction);
        
        // Send again
        signature = await connection.sendRawTransaction(
          newSignedTx.serialize(),
          { 
            skipPreflight: false,
            maxRetries: 3,
            preflightCommitment: 'confirmed' 
          }
        );
        
        // Wait for confirmation
        console.log(`[FixedTransfer] Retry transaction sent, waiting for confirmation`);
        await connection.confirmTransaction({
          signature,
          blockhash: newBlockhash,
          lastValidBlockHeight: newHeight
        }, 'confirmed');
        
        console.log(`[FixedTransfer] Retry transaction confirmed: ${signature}`);
      } else {
        // Not an expired blockhash error, rethrow
        console.error(`[FixedTransfer] Transaction error: ${sendError.message}`);
        throw sendError;
      }
    }
    
    // Return success response
    return {
      success: true,
      signature,
      message: "Successfully transferred cNFT to project collection",
      assetData: assetData,
      explorerUrl: `https://solscan.io/tx/${signature}`
    };
  } catch (error) {
    // Log and return error
    console.error(`[FixedTransfer] Error: ${error.message}`, error);
    return {
      success: false,
      error: error.message || "Unknown error in fixed bubblegum transfer",
      logs: error.logs || []
    };
  }
}

// Make available to the window
if (typeof window !== 'undefined') {
  window.fixedBubblegumTransfer = {
    transferCNFT
  };
}