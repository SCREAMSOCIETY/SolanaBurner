/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
/*!*************************************!*\
  !*** ./static/js/basic-transfer.js ***!
  \*************************************/
/**
 * Basic Transfer - A simplified cNFT transfer method for SolBurn
 * 
 * This module provides a very basic token transfer without using any bubblegum SDK methods
 * It's intended as a last resort when other methods fail.
 */

// Constants and configuration
const PROJECT_WALLET = "EJNt9MPzVay5p9iDtSQMs6PGTUFYpX3rNA55y4wqi5P8";

// Simple SOL transfer function
async function basicTransfer(connection, wallet, destinationAddress, amount) {
  try {
    // Ensure wallet is connected
    if (!wallet || !wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    // Set up transfer parameters
    const target = destinationAddress || PROJECT_WALLET;
    const amountToSend = amount || 1000; // 0.000001 SOL by default
    
    console.log(`Creating basic transfer to ${target} for ${amountToSend} lamports`);
    
    // Import needed web3 modules directly
    const web3 = window.solanaWeb3;
    const { SystemProgram, Transaction, PublicKey } = web3;
    
    // Create transfer instruction
    const transferIx = SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: new PublicKey(target),
      lamports: amountToSend
    });
    
    // Create transaction
    const tx = new Transaction();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.add(transferIx);
    
    // Sign and send transaction
    const signedTx = await wallet.signTransaction(tx);
    const signature = await connection.sendRawTransaction(signedTx.serialize());
    
    return {
      success: true,
      signature,
      message: "Basic transfer completed successfully",
      explorerUrl: `https://solscan.io/tx/${signature}`
    };
  } catch (error) {
    console.error("Error in basicTransfer:", error);
    
    return {
      success: false,
      error: error.message || "Unknown error in basic transfer"
    };
  }
}

// Export functions
window.BasicTransfer = {
  transfer: basicTransfer
};
window["basic-transfer"] = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=basic-transfer.js.map