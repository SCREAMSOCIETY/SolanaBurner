/**
 * This is a minimal implementation of cNFT transfer that doesn't rely on any libraries.
 * It uses just the bare minimum Web3 classes and manual buffer creation.
 */

(function() {
  // Store logs
  window.minimalTransfer = {
    logs: [],
    errors: []
  };
  
  // Logging function
  function log(message, data) {
    console.log(`[Minimal] ${message}`, data);
    window.minimalTransfer.logs.push({
      time: new Date().toISOString(),
      message,
      data
    });
  }
  
  // Error handling
  function handleError(stage, error) {
    console.error(`[Minimal] Error in ${stage}: ${error.message}`, error);
    window.minimalTransfer.errors.push({
      time: new Date().toISOString(),
      stage,
      message: error.message,
      error
    });
    return error;
  }
  
  // Constants
  const RECEIVER_WALLET = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
  const BUBBLEGUM_PROGRAM_ID = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";
  const SPL_NOOP_PROGRAM_ID = "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV";
  const COMPRESSION_PROGRAM_ID = "SPL_Noop1111111111111111111111111111111111111111";
  const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
  
  // Buffer utilities for browser
  function base64ToUint8Array(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  
  /**
   * Fetch asset proof data from our server
   */
  async function fetchAssetProof(assetId) {
    try {
      const response = await fetch(`/api/helius/asset-proof/${assetId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(`API error: ${data.error || 'Failed to fetch proof'}`);
      }
      return data.data;
    } catch (error) {
      throw handleError('fetchAssetProof', error);
    }
  }
  
  /**
   * Fetch asset details from our server
   */
  async function fetchAssetDetails(assetId) {
    try {
      const response = await fetch(`/api/helius/asset/${assetId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(`API error: ${data.error || 'Failed to fetch asset details'}`);
      }
      return data.data;
    } catch (error) {
      throw handleError('fetchAssetDetails', error);
    }
  }
  
  /**
   * The main transfer function that uses a completely minimal approach
   */
  async function minimalTransferCNFT(assetId) {
    try {
      log('Starting minimal transfer implementation', { assetId });
      
      // Check if wallet is connected
      if (!window.solana || !window.solana.isConnected) {
        throw new Error('Wallet not connected');
      }
      
      const ownerPublicKey = window.solana.publicKey.toString();
      log('Owner public key', { ownerPublicKey });
      
      // Fetch the asset details and proof
      log('Fetching asset details and proof', { assetId });
      const [assetDetails, proofData] = await Promise.all([
        fetchAssetDetails(assetId),
        fetchAssetProof(assetId)
      ]);
      
      // Verify ownership
      log('Verifying ownership', { owner: assetDetails.ownership.owner, expectedOwner: ownerPublicKey });
      if (assetDetails.ownership.owner !== ownerPublicKey) {
        throw new Error(`You don't own this asset. Owner is ${assetDetails.ownership.owner}`);
      }
      
      // Extract needed data from the proof
      const {
        root,
        proof,
        node_index,
        tree_id,
        data_hash,
        creator_hash
      } = proofData;
      
      log('Building transaction with data', { 
        treeId: tree_id,
        proofLength: proof.length,
        nodeIndex: node_index 
      });
      
      // Get tree authority
      const merkleTree = new window.solanaWeb3.PublicKey(tree_id);
      const bubblegumProgram = new window.solanaWeb3.PublicKey(BUBBLEGUM_PROGRAM_ID);
      const splNoopProgram = new window.solanaWeb3.PublicKey(SPL_NOOP_PROGRAM_ID);
      const compressionProgram = new window.solanaWeb3.PublicKey(COMPRESSION_PROGRAM_ID);
      const systemProgram = new window.solanaWeb3.PublicKey(SYSTEM_PROGRAM_ID);
      const receiverPublicKey = new window.solanaWeb3.PublicKey(RECEIVER_WALLET);
      const leafOwner = new window.solanaWeb3.PublicKey(ownerPublicKey);
      
      // Derive tree authority
      const [treeAuthority] = window.solanaWeb3.PublicKey.findProgramAddressSync(
        [merkleTree.toBuffer()],
        bubblegumProgram
      );
      
      log('Derived tree authority', { treeAuthority: treeAuthority.toString() });
      
      // Get recent blockhash
      log('Getting recent blockhash');
      const connection = new window.solanaWeb3.Connection(
        'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      const { blockhash } = await connection.getLatestBlockhash();
      
      // Create accounts for the instruction
      const accounts = [
        // 0. Tree authority - readonly
        { pubkey: treeAuthority, isSigner: false, isWritable: false },
        // 1. Leaf owner - signer
        { pubkey: leafOwner, isSigner: true, isWritable: false },
        // 2. Leaf delegate - signer (same as owner)
        { pubkey: leafOwner, isSigner: true, isWritable: false },
        // 3. New leaf owner - readonly
        { pubkey: receiverPublicKey, isSigner: false, isWritable: false },
        // 4. Merkle tree - writable
        { pubkey: merkleTree, isSigner: false, isWritable: true },
        // 5. Log wrapper - readonly
        { pubkey: splNoopProgram, isSigner: false, isWritable: false },
        // 6. Compression program - readonly
        { pubkey: compressionProgram, isSigner: false, isWritable: false },
        // 7. System program - readonly
        { pubkey: systemProgram, isSigner: false, isWritable: false }
      ];
      
      // Create instruction data buffer
      // Format: 
      // 1 byte - instruction discriminator (3 for transfer)
      // 32 bytes - root hash
      // 8 bytes - index (u64 as LE bytes)
      // 32 bytes - data hash
      // 32 bytes - creator hash
      // 4 bytes - number of proof elements (u32)
      // N x 32 bytes - proof elements
      
      // Convert all base64 values to Uint8Array
      const rootBuffer = base64ToUint8Array(root);
      const dataHashBuffer = base64ToUint8Array(data_hash);
      const creatorHashBuffer = base64ToUint8Array(creator_hash);
      const proofBuffers = proof.map(p => base64ToUint8Array(p));
      
      // Create the full data buffer
      const dataSize = 1 + 32 + 8 + 32 + 32 + 4 + (proofBuffers.length * 32);
      const data = new Uint8Array(dataSize);
      
      // Write discriminator
      data[0] = 3; // Transfer instruction
      
      // Write root (32 bytes)
      data.set(rootBuffer, 1);
      
      // Write index as little-endian u64 (8 bytes)
      const indexBytes = new Uint8Array(8);
      const dataView = new DataView(indexBytes.buffer);
      dataView.setBigUint64(0, BigInt(node_index), true); // true for little-endian
      data.set(indexBytes, 33);
      
      // Write data hash (32 bytes)
      data.set(dataHashBuffer, 41);
      
      // Write creator hash (32 bytes)
      data.set(creatorHashBuffer, 73);
      
      // Write proof count (4 bytes) - little-endian u32
      const proofCountBytes = new Uint8Array(4);
      const proofDataView = new DataView(proofCountBytes.buffer);
      proofDataView.setUint32(0, proofBuffers.length, true); // true for little-endian
      data.set(proofCountBytes, 105);
      
      // Write proof elements
      for (let i = 0; i < proofBuffers.length; i++) {
        data.set(proofBuffers[i], 109 + (i * 32));
      }
      
      log('Created instruction data', { size: data.length, firstBytes: Array.from(data.slice(0, 16)) });
      
      // Create the instruction
      const instruction = {
        programId: bubblegumProgram,
        keys: accounts,
        data: Buffer.from(data)
      };
      
      // Create the transaction
      const transaction = new window.solanaWeb3.Transaction({
        feePayer: window.solana.publicKey,
        recentBlockhash: blockhash
      }).add(instruction);
      
      // Sign and send the transaction
      log('Signing transaction');
      const signedTransaction = await window.solana.signTransaction(transaction);
      
      // Send the transaction
      log('Sending transaction');
      
      // Different wallets have different APIs
      let signature;
      if (typeof window.solana.sendRawTransaction === 'function') {
        // Some wallets have a direct sendRawTransaction method
        signature = await window.solana.sendRawTransaction(
          signedTransaction.serialize ? signedTransaction.serialize() : signedTransaction
        );
      } else {
        // Otherwise use connection
        signature = await connection.sendRawTransaction(
          signedTransaction.serialize ? signedTransaction.serialize() : signedTransaction
        );
      }
      
      log('Transaction sent successfully', { signature });
      
      // Add to hidden assets if that function exists
      if (window.hiddenAssets?.addHiddenAsset) {
        window.hiddenAssets.addHiddenAsset(assetId);
      }
      
      // Return result
      return {
        success: true,
        message: 'Transfer completed successfully',
        signature,
        explorerUrl: `https://solscan.io/tx/${signature}`
      };
    } catch (error) {
      handleError('minimalTransfer', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Export the function
  window.minimalTransferCNFT = minimalTransferCNFT;
  
  // Add a function to patch UI buttons
  window.patchUIWithMinimalImplementation = function() {
    const buttons = document.querySelectorAll('.trash-button, .burn-button, [data-action="trash"], [data-action="burn-cnft"]');
    log(`Found ${buttons.length} buttons to patch with minimal implementation`);
    
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
            // Use our minimal implementation
            const result = await window.minimalTransferCNFT(assetId);
            
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
    
    log(`Successfully patched ${buttons.length} buttons with minimal implementation`);
    return buttons.length;
  };
  
  // Initialize
  log('Minimal transfer module initialized');
  
  // Update debug UI if it exists
  if (window.testTransferImplementations) {
    const originalTestImpl = window.testTransferImplementations;
    window.testTransferImplementations = async function(assetId) {
      // Try our new minimal implementation first
      try {
        log('Testing minimal implementation');
        const result = await window.minimalTransferCNFT(assetId);
        if (result.success) {
          return {
            success: true,
            message: 'Successfully transferred using minimal implementation',
            implementation: 'minimal',
            signature: result.signature,
            explorerUrl: result.explorerUrl
          };
        }
      } catch (error) {
        log('Minimal implementation failed, falling back to others', error);
      }
      
      // Fall back to original implementations
      return await originalTestImpl(assetId);
    };
  }
  
  // Patch buttons on page load
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(window.patchUIWithMinimalImplementation, 1000);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(window.patchUIWithMinimalImplementation, 1000);
    });
  }
  
  // Periodically check for new buttons
  setInterval(window.patchUIWithMinimalImplementation, 5000);
})();