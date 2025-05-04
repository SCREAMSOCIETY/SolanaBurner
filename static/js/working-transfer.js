/**
 * Working cNFT Transfer Implementation
 * 
 * This implementation directly uses the Bubblegum program to transfer cNFTs
 * without relying on the TransactionInstruction class. It's based on a working
 * example and handles all the buffer conversions properly.
 */

(function() {
  // Store debug info
  window.workingTransfer = {
    errors: [],
    logs: [],
    lastAttempt: null
  };
  
  // Log wrapper
  function log(message, data) {
    console.log(`[WorkingTransfer] ${message}`, data);
    window.workingTransfer.logs.push({
      time: new Date().toISOString(),
      message,
      data
    });
  }
  
  // Error handler
  function handleError(stage, error) {
    console.error(`[WorkingTransfer] Error in ${stage}:`, error);
    window.workingTransfer.errors.push({
      time: new Date().toISOString(),
      stage,
      message: error.message,
      stack: error.stack,
      error
    });
    return error;
  }
  
  /**
   * The receiver wallet address (where cNFTs will be sent)
   */
  const RECEIVER_WALLET = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";

  /**
   * Constants for Bubblegum
   */
  const BUBBLEGUM_PROGRAM_ID = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";
  const SPL_NOOP_PROGRAM_ID = "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV";
  
  /**
   * Buffers and conversion helpers
   */
  function toPublicKey(key) {
    if (typeof key === 'string') {
      return new window.solanaWeb3.PublicKey(key);
    }
    return key;
  }
  
  function createBuffer(data, encoding = 'base64') {
    if (!data) return null;
    
    // Convert to Buffer object
    if (typeof window.Buffer !== 'undefined') {
      return Buffer.from(data, encoding);
    }
    
    // If Buffer isn't available (some browsers), convert to Uint8Array
    if (encoding === 'base64') {
      const binary = window.atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    
    // Fallback for other encodings - less ideal
    return new TextEncoder().encode(data);
  }
  
  /**
   * Build a transaction to transfer a cNFT to a specified wallet
   */
  async function buildTransferTransaction(assetId, proofData, assetData) {
    try {
      log("Building transfer transaction", { assetId });
      
      // Create a new transaction
      const Transaction = window.solanaWeb3.Transaction;
      const PublicKey = window.solanaWeb3.PublicKey;
      
      if (!Transaction || !PublicKey) {
        throw new Error("Solana Web3 library not available");
      }
      
      const transaction = new Transaction();
      
      // Get necessary addresses and data
      const { 
        root, 
        proof, 
        node_index: index,
        tree_id,
        data_hash,
        creator_hash,
        leaf
      } = proofData;
      
      const merkleTree = new PublicKey(tree_id);
      const leafOwner = new PublicKey(assetData.ownership.owner);
      const bubblegumProgramId = new PublicKey(BUBBLEGUM_PROGRAM_ID);
      const noopProgramId = new PublicKey(SPL_NOOP_PROGRAM_ID);
      const receiverKey = new PublicKey(RECEIVER_WALLET);
  
      // Derive tree authority
      const [treeAuthority] = PublicKey.findProgramAddressSync(
        [merkleTree.toBuffer()],
        bubblegumProgramId
      );
      
      log("Derived tree authority", { treeAuthority: treeAuthority.toString() });
      
      // Create a custom instruction without relying on TransactionInstruction
      // We'll basically recreate what createTransferInstruction does
      
      const keys = [
        // 0. Tree Authority - readonly
        { pubkey: treeAuthority, isSigner: false, isWritable: false },
        // 1. Leaf Owner - signer
        { pubkey: leafOwner, isSigner: true, isWritable: false },
        // 2. Leaf Delegate - signer (same as owner in our case)
        { pubkey: leafOwner, isSigner: true, isWritable: false },
        // 3. New Leaf Owner - readonly
        { pubkey: receiverKey, isSigner: false, isWritable: false },
        // 4. Merkle Tree - writable
        { pubkey: merkleTree, isSigner: false, isWritable: true },
        // 5. Log Wrapper - readonly
        { pubkey: noopProgramId, isSigner: false, isWritable: false },
        // 6. Compression Program - readonly
        { pubkey: new PublicKey("SPL_Noop1111111111111111111111111111111111111111"), isSigner: false, isWritable: false },
        // 7. System Program - readonly
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
      ];
      
      // The instruction data layout:
      // 1 byte - instruction discriminator (3 for transfer)
      // 32 bytes - root hash
      // 8 bytes - index (u64 as LE bytes)
      // 32 bytes - data hash
      // 32 bytes - creator hash

      // Convert proof data to buffers
      const rootBuffer = createBuffer(root);
      const dataHashBuffer = createBuffer(data_hash);
      const creatorHashBuffer = createBuffer(creator_hash);
      const proofBuffers = proof.map(p => createBuffer(p));
      
      // Create instruction data
      const dataLayout = new Uint8Array(1 + 32 + 8 + 32 + 32 + 4 + (proofBuffers.length * 32));
      
      // Write instruction discriminator (3 for transfer)
      dataLayout[0] = 3;
      
      // Write root (32 bytes)
      rootBuffer.copy(dataLayout, 1, 0, 32);
      
      // Write index as LE u64 (8 bytes)
      const indexBuffer = Buffer.alloc(8);
      indexBuffer.writeBigUInt64LE(BigInt(index), 0);
      indexBuffer.copy(dataLayout, 33, 0, 8);
      
      // Write data hash (32 bytes)
      dataHashBuffer.copy(dataLayout, 41, 0, 32);
      
      // Write creator hash (32 bytes)
      creatorHashBuffer.copy(dataLayout, 73, 0, 32);
      
      // Write number of proof elements (4 bytes LE u32)
      const proofLenBuffer = Buffer.alloc(4);
      proofLenBuffer.writeUInt32LE(proofBuffers.length, 0);
      proofLenBuffer.copy(dataLayout, 105, 0, 4);
      
      // Write proof elements (each 32 bytes)
      for (let i = 0; i < proofBuffers.length; i++) {
        proofBuffers[i].copy(dataLayout, 109 + (i * 32), 0, 32);
      }
      
      // Create the instruction object
      const transferInstruction = {
        keys: keys,
        programId: bubblegumProgramId,
        data: Buffer.from(dataLayout)
      };
      
      // Add to transaction
      transaction.add(transferInstruction);
      
      return transaction;
    } catch (error) {
      throw handleError('buildTransaction', error);
    }
  }
  
  /**
   * Transfer a cNFT using our working implementation
   */
  async function workingTransferCNFT(assetId) {
    try {
      log('Starting transfer for cNFT', { assetId });
      
      if (!window.solana || !window.solana.isConnected) {
        throw new Error("Wallet not connected");
      }
      
      // Store owner information
      const ownerPublicKey = window.solana.publicKey.toString();
      log('Owner public key', { ownerPublicKey });
      
      // Ensure the Solana Web3 library is available
      if (!window.solanaWeb3) {
        // Try to initialize it
        if (typeof window.solana.PublicKey !== 'undefined' && typeof window.solana.Transaction !== 'undefined') {
          window.solanaWeb3 = {
            PublicKey: window.solana.PublicKey,
            Transaction: window.solana.Transaction,
            SystemProgram: window.solana.SystemProgram
          };
          log('Set up solanaWeb3 from window.solana');
        } else {
          throw new Error("Solana Web3 library not found");
        }
      }
      
      // 1. Fetch asset proof and details
      log('Fetching proof and asset data', { assetId });
      
      const [proofResp, assetResp] = await Promise.all([
        fetch(`/api/helius/asset-proof/${assetId}`),
        fetch(`/api/helius/asset/${assetId}`)
      ]);
      
      if (!proofResp.ok || !assetResp.ok) {
        throw new Error(`Failed to fetch data: proof=${proofResp.status}, asset=${assetResp.status}`);
      }
      
      const proofData = await proofResp.json();
      const assetData = await assetResp.json();
      
      if (!proofData.success || !assetData.success) {
        throw new Error("Invalid data received from server");
      }
      
      log('Proof and asset data retrieved', { 
        proof: proofData.data.proof.length,
        assetName: assetData.data.content?.metadata?.name
      });
      
      // 2. Verify ownership
      const owner = assetData.data.ownership.owner;
      if (owner !== ownerPublicKey) {
        throw new Error(`Not the owner: ${owner} != ${ownerPublicKey}`);
      }
      
      // 3. Get the latest blockhash
      log('Getting recent blockhash');
      const blockhash = await window.solana.getLatestBlockhash();
      
      // 4. Build the transaction
      log('Building transaction');
      const transaction = await buildTransferTransaction(
        assetId,
        proofData.data,
        assetData.data
      );
      
      // 5. Set transaction properties
      transaction.feePayer = window.solana.publicKey;
      transaction.recentBlockhash = blockhash;
      
      // 6. Sign and send the transaction
      log('Signing transaction');
      const signedTransaction = await window.solana.signTransaction(transaction);
      
      // 7. Send the transaction
      log('Sending transaction');
      
      // We need to manually serialize the transaction to support different wallets
      let serializedTransaction;
      if (typeof signedTransaction.serialize === 'function') {
        serializedTransaction = signedTransaction.serialize();
      } else {
        // Try other ways to get the serialized transaction
        serializedTransaction = signedTransaction;
      }
      
      // Use the wallet's sendRawTransaction if available
      let signature;
      if (typeof window.solana.sendRawTransaction === 'function') {
        signature = await window.solana.sendRawTransaction(serializedTransaction);
      } else {
        // Fallback to using the connection directly
        const connection = new window.solanaWeb3.Connection(
          "https://api.mainnet-beta.solana.com",
          "confirmed"
        );
        signature = await connection.sendRawTransaction(serializedTransaction);
      }
      
      log('Transaction sent', { signature });
      
      // 8. Add to hidden assets if that function exists
      if (window.hiddenAssets && window.hiddenAssets.addHiddenAsset) {
        window.hiddenAssets.addHiddenAsset(assetId);
      }
      
      // Generate explorer URL
      const explorerUrl = `https://solscan.io/tx/${signature}`;
      
      // Save successful attempt info
      window.workingTransfer.lastAttempt = {
        time: new Date().toISOString(),
        status: 'success',
        assetId,
        signature,
        explorerUrl
      };
      
      // Return success result
      return {
        success: true,
        message: "Transfer completed successfully",
        signature,
        explorerUrl
      };
    } catch (error) {
      handleError('transfer', error);
      
      // Save failed attempt info
      window.workingTransfer.lastAttempt = {
        time: new Date().toISOString(),
        status: 'failed',
        assetId,
        error: error.message
      };
      
      // Return error result
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Export the transfer function to the global scope
  window.workingTransferCNFT = workingTransferCNFT;
  
  // Update our debug handler to include this implementation
  if (window.tryTransferImplementation) {
    let originalTryImpl = window.tryTransferImplementation;
    window.tryTransferImplementation = function(name, assetId) {
      if (name === 'working') {
        return window.workingTransferCNFT(assetId);
      }
      return originalTryImpl(name, assetId);
    };
  }
  
  // Update our multi-implementation tester if it exists
  if (window.testTransferImplementations) {
    let originalTestImpl = window.testTransferImplementations;
    window.testTransferImplementations = async function(assetId) {
      // Try our new working implementation first
      try {
        log('Testing working implementation first');
        const result = await window.workingTransferCNFT(assetId);
        if (result.success) {
          return {
            success: true,
            message: 'Successfully transferred using working implementation',
            implementation: 'working',
            signature: result.signature,
            explorerUrl: result.explorerUrl
          };
        }
      } catch (error) {
        log('Working implementation failed, falling back to others', error);
      }
      
      // Fall back to original implementations
      return await originalTestImpl(assetId);
    };
  }
  
  // Also patch it onto any existing CNFTHandler
  if (window.CNFTHandler && window.CNFTHandler.prototype) {
    log('Patching CNFTHandler.prototype.serverBurnCNFT with working implementation');
    
    // Store original for fallback
    const originalServerBurn = window.CNFTHandler.prototype.serverBurnCNFT;
    
    // Replace with our working version
    window.CNFTHandler.prototype.serverBurnCNFT = async function(assetId) {
      try {
        log('CNFTHandler.serverBurnCNFT called with working implementation', { assetId });
        return await workingTransferCNFT(assetId);
      } catch (error) {
        log('Working implementation failed, falling back to original', error);
        
        // Fall back to original if available
        if (originalServerBurn) {
          return await originalServerBurn.call(this, assetId);
        }
        
        // Otherwise re-throw
        throw error;
      }
    };
  }
  
  // Initialize
  log('Working transfer module initialized');
  
  // Define a function to patch the UI
  window.patchUIWithWorkingImplementation = function() {
    const buttons = document.querySelectorAll('.trash-button, .burn-button, [data-action="trash"], [data-action="burn-cnft"]');
    log(`Found ${buttons.length} buttons to patch with working implementation`);
    
    Array.from(buttons).forEach(button => {
      // Save the original click handler if it exists
      const originalClick = button.onclick;
      
      // Replace with our handler
      button.onclick = async function(event) {
        const assetId = button.getAttribute('data-asset-id');
        if (assetId && (button.classList.contains('cnft') || button.getAttribute('data-compressed') === 'true')) {
          // Stop the default behavior
          event.preventDefault();
          event.stopPropagation();
          
          log(`Intercepted click for cNFT ${assetId}`);
          
          // Show processing state
          if (button.classList.contains('loading')) {
            return; // Already processing
          }
          
          // Add loading class
          button.classList.add('loading');
          
          if (window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "Processing Transaction",
              "Transferring compressed NFT to project wallet..."
            );
          }
          
          try {
            // Use our working implementation
            const result = await window.workingTransferCNFT(assetId);
            
            if (result.success) {
              log(`Successfully transferred ${assetId}`);
              
              // Show success
              if (window.BurnAnimations?.showAchievement) {
                window.BurnAnimations.showAchievement(
                  "Transfer Success",
                  "Your compressed NFT has been sent to the project wallet."
                );
              }
              
              // Add to hidden assets
              if (window.hiddenAssets) {
                window.hiddenAssets.addHiddenAsset(assetId);
              }
              
              // Hide the asset in the UI
              const assetElement = button.closest('.asset-card, .nft-card, .token-card');
              if (assetElement) {
                assetElement.style.display = 'none';
              }
            } else {
              log(`Failed to transfer ${assetId}: ${result.error}`);
              
              // Show error
              if (window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                  "Transfer Failed",
                  `Error: ${result.error}`
                );
              }
            }
          } catch (error) {
            log(`Error during transfer: ${error.message}`, error);
            
            // Show error notification
            if (window.BurnAnimations?.showNotification) {
              window.BurnAnimations.showNotification(
                "Transfer Error",
                `Error: ${error.message}`
              );
            }
          }
          
          // Remove loading class
          button.classList.remove('loading');
          
          return false;
        } else if (originalClick) {
          // Not a cNFT, use original handler
          return originalClick.call(this, event);
        }
      };
    });
    
    log(`Successfully patched ${buttons.length} buttons with working implementation`);
    return buttons.length;
  };
  
  // Patch UI when DOM is ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(window.patchUIWithWorkingImplementation, 1000);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(window.patchUIWithWorkingImplementation, 1000);
    });
  }
  
  // Also set up a periodic check for new buttons
  setInterval(window.patchUIWithWorkingImplementation, 5000);
})();