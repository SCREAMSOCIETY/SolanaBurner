/**
 * Standalone cNFT Transfer Implementation
 * 
 * This module provides a completely standalone implementation for transferring 
 * compressed NFTs, avoiding all the problematic code paths in the main application.
 * It will replace the transfer buttons with its own implementation at runtime.
 */

(function() {
  console.log('[Standalone] Initializing standalone cNFT transfer solution');
  
  // Global variables to store the wallet and connection
  let wallet = null;
  let walletPublicKey = null;
  
  // Default project wallet for trash operations
  const PROJECT_WALLET = "EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK";
  
  // Configuration
  const config = {
    debugMode: true,
    defaultDestination: PROJECT_WALLET,
    processingText: "Processing...",
    logPrefix: "[Standalone]"
  };
  
  // Helper function to log with prefix
  function log(...args) {
    if (config.debugMode) {
      console.log(config.logPrefix, ...args);
    }
  }
  
  // Helper function for errors
  function error(...args) {
    console.error(config.logPrefix, ...args);
  }
  
  // Initialize the module
  function initialize() {
    log('Starting initialization');
    
    // Wait for the document to be ready
    document.addEventListener('DOMContentLoaded', function() {
      log('DOM loaded, setting up wallet detection');
      setupWalletDetection();
      setupButtonReplacements();
    });
    
    // Set up interval to continuously replace buttons
    setInterval(replaceExistingButtons, 2000);
    
    log('Initialization complete');
  }
  
  // Function to detect when wallet is connected
  function setupWalletDetection() {
    log('Setting up wallet detection');
    
    // Check every second for wallet
    const checkInterval = setInterval(() => {
      if (window.solanaWallet && window.solanaWallet.publicKey) {
        wallet = window.solanaWallet;
        walletPublicKey = wallet.publicKey.toString();
        log('Wallet detected:', walletPublicKey);
        clearInterval(checkInterval);
        
        // Initialize once wallet is detected
        replaceExistingButtons();
      }
    }, 1000);
    
    // Stop checking after 60 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!wallet) {
        log('No wallet detected after timeout');
      }
    }, 60000);
  }
  
  // Find and replace all existing transfer buttons
  function replaceExistingButtons() {
    // Find all buttons with certain keywords in their text
    const buttons = Array.from(document.querySelectorAll('button')).filter(button => {
      const text = button.textContent.toLowerCase();
      return (text.includes('trash') || text.includes('transfer')) && 
             !button.hasAttribute('data-standalone-replaced');
    });
    
    log(`Found ${buttons.length} buttons to replace`);
    
    buttons.forEach(button => {
      // Mark the button as replaced
      button.setAttribute('data-standalone-replaced', 'true');
      
      // Store the original click handler and text
      const originalClick = button.onclick;
      const originalText = button.textContent;
      
      // Replace with our custom handler
      button.onclick = async function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        try {
          // Find the asset ID from the closest asset container
          const assetContainer = button.closest('[data-asset-id]');
          if (!assetContainer) {
            error('Could not find asset container with data-asset-id attribute');
            return;
          }
          
          const assetId = assetContainer.getAttribute('data-asset-id');
          if (!assetId) {
            error('Asset ID not found');
            return;
          }
          
          log(`Initiating standalone transfer for asset: ${assetId}`);
          
          // Update button to show processing
          const originalInnerHTML = button.innerHTML;
          button.innerHTML = config.processingText;
          button.disabled = true;
          
          // Perform the transfer
          const result = await standaloneTransfer(assetId);
          
          // Update button based on result
          if (result.success) {
            button.innerHTML = "Success! ✓";
            button.style.backgroundColor = "#4CAF50";
            button.style.color = "white";
            
            // If we have an animation system, show notification
            if (typeof window.BurnAnimations?.showNotification === 'function') {
              const shortSig = result.signature.substring(0, 8) + "...";
              window.BurnAnimations.showNotification(
                "cNFT Successfully Trashed", 
                `Your cNFT has been sent to the trash collection.\nTransaction signature: ${shortSig}`
              );
            }
            
            // Remove asset from UI after a delay
            setTimeout(() => {
              const assetElement = button.closest('.asset-card') || 
                                   button.closest('.nft-card') || 
                                   button.closest('[data-asset-id]');
              if (assetElement) {
                assetElement.style.opacity = '0.5';
                assetElement.style.transition = 'opacity 0.5s ease';
                
                setTimeout(() => {
                  assetElement.style.display = 'none';
                }, 500);
              }
            }, 2000);
            
          } else {
            button.innerHTML = "Failed ✗";
            button.style.backgroundColor = "#f44336";
            button.style.color = "white";
            
            // Display error notification
            if (typeof window.BurnAnimations?.showNotification === 'function') {
              window.BurnAnimations.showNotification(
                "cNFT Trash Failed", 
                `Error: ${result.error || 'Unknown error'}`
              );
            }
            
            // Reset button after a delay
            setTimeout(() => {
              button.innerHTML = originalInnerHTML;
              button.disabled = false;
              button.style.backgroundColor = "";
              button.style.color = "";
            }, 3000);
          }
        } catch (error) {
          console.error(`${config.logPrefix} Error in button click handler:`, error);
          button.innerHTML = "Error ✗";
          button.style.backgroundColor = "#f44336";
          button.style.color = "white";
          
          // Reset button after a delay
          setTimeout(() => {
            button.innerHTML = originalInnerHTML;
            button.disabled = false;
            button.style.backgroundColor = "";
            button.style.color = "";
          }, 3000);
        }
      };
      
      log(`Replaced handler for button with text: ${originalText}`);
    });
    
    return buttons.length;
  }
  
  // Function to find all transfer buttons
  function setupButtonReplacements() {
    log('Setting up button replacements');
    
    // Add observer to detect new buttons
    const observer = new MutationObserver((mutations) => {
      let shouldReplace = false;
      
      mutations.forEach(mutation => {
        // Check if any nodes were added
        if (mutation.addedNodes.length) {
          shouldReplace = true;
        }
      });
      
      if (shouldReplace) {
        replaceExistingButtons();
      }
    });
    
    // Observe the entire document
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    log('Mutation observer setup complete');
  }
  
  // Core transfer function using the server-side API
  async function standaloneTransfer(assetId) {
    log(`Starting standalone transfer for asset: ${assetId}`);
    
    if (!wallet || !walletPublicKey) {
      error('Wallet not connected');
      return { 
        success: false, 
        error: 'Wallet not connected'
      };
    }
    
    try {
      // Step 1: Get diagnostic data for the asset
      log(`Fetching diagnostic data for asset: ${assetId}`);
      const diagnosticResponse = await fetch(`/api/asset/diagnostic/${assetId}`);
      const diagnosticData = await diagnosticResponse.json();
      
      if (!diagnosticData.success) {
        error(`Diagnostic data fetch failed:`, diagnosticData.error);
        return {
          success: false,
          error: diagnosticData.error || 'Failed to get asset diagnostic data'
        };
      }
      
      // Step 2: Get proof data
      log(`Extracting proof data from diagnostic response`);
      const proofData = diagnosticData.details?.proof;
      
      if (!proofData) {
        error('No proof data available in diagnostic response');
        return {
          success: false,
          error: 'Failed to get required proof data for the cNFT'
        };
      }
      
      // Step 3: Sign message for authorization
      log(`Signing authorization message`);
      const message = new TextEncoder().encode(`Authorize transfer of cNFT ${assetId} to project collection wallet`);
      const signatureBytes = await wallet.signMessage(message);
      const signatureBase64 = btoa(String.fromCharCode.apply(null, [...new Uint8Array(signatureBytes)]));
      
      // Step 4: Call the delegated transfer API
      log(`Calling delegated transfer API`);
      const response = await fetch('/api/delegated-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: walletPublicKey,
          assetId: assetId,
          signedMessage: signatureBase64,
          proofData: proofData,
          destination: config.defaultDestination
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        log(`Transfer successful: ${result.signature}`);
        return {
          success: true,
          signature: result.signature,
          explorerUrl: `https://solscan.io/tx/${result.signature}`
        };
      } else {
        error(`Transfer failed: ${result.error}`);
        return {
          success: false,
          error: result.error || 'Transfer failed'
        };
      }
    } catch (error) {
      error(`Critical error in standaloneTransfer:`, error);
      return {
        success: false,
        error: error.message || 'Unknown error during transfer'
      };
    }
  }
  
  // Make the function accessible globally
  window.StandaloneTransfer = {
    transfer: standaloneTransfer,
    replaceButtons: replaceExistingButtons
  };
  
  // Start the module
  initialize();
  
  // Log success message
  log('Module loaded successfully');
})();