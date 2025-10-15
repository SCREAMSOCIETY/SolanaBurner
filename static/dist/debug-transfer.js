/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
/*!*************************************!*\
  !*** ./static/js/debug-transfer.js ***!
  \*************************************/
/**
 * Debug Helpers for cNFT Transfers
 * This provides debug functions that can be called from the console
 */

(function() {
  // Debug info storage
  window.debugTransfer = {
    errors: [],
    attempts: [],
    logs: [],
    buttons: [],
    proofData: null,
    assetData: null
  };
  
  // Log wrapper that also adds to our debug logs
  function debugLog(message, data) {
    const logEntry = { 
      time: new Date().toISOString(),
      message: message,
      data: data
    };
    console.log(`[Debug] ${message}`, data);
    window.debugTransfer.logs.push(logEntry);
    return logEntry;
  }
  
  // Error handler
  function debugError(stage, error) {
    const errorEntry = {
      time: new Date().toISOString(),
      stage: stage,
      message: error.message,
      stack: error.stack,
      error: error
    };
    console.error(`[Debug] Error in ${stage}:`, error);
    window.debugTransfer.errors.push(errorEntry);
    return errorEntry;
  }
  
  // Get wallet info
  function getWallet() {
    if (!window.solana || !window.solana.isConnected) {
      throw new Error("Wallet not connected");
    }
    
    return {
      publicKey: window.solana.publicKey,
      signTransaction: (tx) => window.solana.signTransaction(tx)
    };
  }
  
  // Function to test all our transfer implementations
  window.testTransferImplementations = async function(assetId) {
    debugLog("Starting transfer implementation tests", { assetId });
    
    if (!assetId) {
      // Find the first available cNFT from the UI
      const buttons = document.querySelectorAll('.trash-button[data-asset-id], .burn-button[data-asset-id]');
      if (buttons.length > 0) {
        assetId = buttons[0].getAttribute('data-asset-id');
        debugLog("Found assetId from UI", { assetId });
      } else {
        const error = new Error("No asset ID provided and none found in UI");
        debugError("setup", error);
        return { success: false, error: error.message };
      }
    }
    
    // Collect button information
    const buttons = document.querySelectorAll('.trash-button, .burn-button, [data-action="trash"], [data-action="burn-cnft"]');
    debugLog(`Found ${buttons.length} buttons to analyze`);
    
    Array.from(buttons).forEach((button, index) => {
      const buttonData = {
        index,
        classList: Array.from(button.classList),
        assetId: button.getAttribute('data-asset-id'),
        action: button.getAttribute('data-action'),
        hasClickHandler: !!button.onclick,
        html: button.outerHTML
      };
      window.debugTransfer.buttons.push(buttonData);
    });
    
    // Fetch asset and proof data
    try {
      debugLog("Fetching proof and asset data", { assetId });
      
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
      
      window.debugTransfer.proofData = proofData.data;
      window.debugTransfer.assetData = assetData.data;
      
      debugLog("Successfully fetched proof and asset data", { 
        proofSize: proofData.data.proof.length,
        assetName: assetData.data.name
      });
    } catch (error) {
      debugError("data-fetch", error);
      return { success: false, error: error.message };
    }
    
    // Now try the different implementations
    const implementations = [
      { name: "solo", fn: window.soloTransferCNFT },
      { name: "standalone", fn: window.standaloneTransferCNFT },
      { name: "direct", fn: window.directTransferCNFT },
      { name: "server-side", fn: window.serverSideTransferCNFT }
    ];
    
    // Test any available implementation
    const results = {};
    
    for (const impl of implementations) {
      if (typeof impl.fn === 'function') {
        debugLog(`Testing ${impl.name} implementation`);
        try {
          const attempt = {
            name: impl.name,
            time: new Date().toISOString(),
            status: 'started'
          };
          window.debugTransfer.attempts.push(attempt);
          
          // Run the implementation
          const result = await impl.fn(assetId);
          
          // Update attempt status
          attempt.status = result.success ? 'success' : 'failed';
          attempt.result = result;
          
          results[impl.name] = result;
          debugLog(`${impl.name} implementation result:`, result);
          
          if (result.success) {
            // We found a working implementation!
            return {
              success: true,
              message: `Successfully transferred using ${impl.name} implementation`,
              implementation: impl.name,
              signature: result.signature,
              explorerUrl: result.explorerUrl
            };
          }
        } catch (error) {
          debugError(`${impl.name}-implementation`, error);
          results[impl.name] = { success: false, error: error.message };
        }
      } else {
        debugLog(`${impl.name} implementation not available`);
      }
    }
    
    // If we get here, none of the implementations worked
    return {
      success: false,
      message: "All implementations failed",
      results
    };
  };
  
  // Expose a direct function to manually try a specific implementation
  window.tryTransferImplementation = async function(name, assetId) {
    debugLog(`Manually trying ${name} implementation`, { assetId });
    
    if (!assetId) {
      // Find the first available cNFT from the UI
      const buttons = document.querySelectorAll('.trash-button[data-asset-id], .burn-button[data-asset-id]');
      if (buttons.length > 0) {
        assetId = buttons[0].getAttribute('data-asset-id');
        debugLog("Found assetId from UI", { assetId });
      } else {
        const error = new Error("No asset ID provided and none found in UI");
        debugError("setup", error);
        return { success: false, error: error.message };
      }
    }
    
    // Map of implementation names to functions
    const implementations = {
      solo: window.soloTransferCNFT,
      standalone: window.standaloneTransferCNFT,
      direct: window.directTransferCNFT,
      serverSide: window.serverSideTransferCNFT
    };
    
    const fn = implementations[name];
    if (typeof fn !== 'function') {
      return { 
        success: false, 
        error: `Implementation '${name}' not found. Available: ${Object.keys(implementations).filter(k => typeof implementations[k] === 'function').join(', ')}`
      };
    }
    
    // Try the selected implementation
    try {
      const attempt = {
        name,
        time: new Date().toISOString(),
        status: 'started'
      };
      window.debugTransfer.attempts.push(attempt);
      
      // Run the implementation
      const result = await fn(assetId);
      
      // Update attempt status
      attempt.status = result.success ? 'success' : 'failed';
      attempt.result = result;
      
      debugLog(`${name} implementation result:`, result);
      return result;
    } catch (error) {
      debugError(`${name}-implementation`, error);
      return { success: false, error: error.message };
    }
  };
  
  // Function to get TransactionInstruction class if available
  window.getTransactionInstructionClass = function() {
    const locations = [
      { path: "window.solanaWeb3?.TransactionInstruction", obj: window.solanaWeb3?.TransactionInstruction },
      { path: "window.solana?.TransactionInstruction", obj: window.solana?.TransactionInstruction },
      { path: "window.TransactionInstruction", obj: window.TransactionInstruction },
      { path: "window.solana?.Web3?.TransactionInstruction", obj: window.solana?.Web3?.TransactionInstruction },
      { path: "window.SolanaWeb3JS?.TransactionInstruction", obj: window.SolanaWeb3JS?.TransactionInstruction }
    ];
    
    const found = locations.filter(loc => loc.obj !== undefined);
    return {
      found: found.length > 0,
      locations: found.map(f => f.path),
      constructors: found.map(f => f.obj)
    };
  };
  
  // Function to get information about global objects
  window.getGlobalObjectInfo = function() {
    const globalObjects = [
      "solana", "solanaWeb3", "Transaction", "TransactionInstruction", "PublicKey",
      "SolanaWeb3JS", "bubblegumTransfer", "soloTransferCNFT", "standaloneTransferCNFT",
      "directTransferCNFT", "serverSideTransferCNFT"
    ];
    
    const result = {};
    for (const objName of globalObjects) {
      const obj = window[objName];
      result[objName] = {
        exists: obj !== undefined,
        type: obj ? typeof obj : 'undefined',
        isFunction: typeof obj === 'function',
        properties: obj ? Object.keys(obj) : []
      };
    }
    
    return result;
  };
  
  // This allows manual patching of buttons at any time
  window.manuallyPatchButtons = function() {
    debugLog("Manually patching buttons");
    
    // Find all trash/burn buttons for cNFTs
    const buttons = document.querySelectorAll('.trash-button, .burn-button, [data-action="trash"], [data-action="burn-cnft"]');
    debugLog(`Found ${buttons.length} buttons to patch`);
    
    Array.from(buttons).forEach((button, index) => {
      // Save info about the button
      const buttonData = {
        index,
        classList: Array.from(button.classList),
        assetId: button.getAttribute('data-asset-id'),
        action: button.getAttribute('data-action'),
        hasClickHandler: !!button.onclick,
        html: button.outerHTML
      };
      window.debugTransfer.buttons.push(buttonData);
      
      // Save the original click handler
      const originalClick = button.onclick;
      
      // Replace with our debug handler
      button.onclick = async function(event) {
        const assetId = button.getAttribute('data-asset-id');
        if (assetId && button.classList.contains('cnft')) {
          // Stop the default behavior
          event.preventDefault();
          event.stopPropagation();
          
          debugLog(`[Manual] Intercepted click for cNFT ${assetId}`);
          
          // Show processing notification
          if (window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "Debug Transfer",
              "Testing implementations..."
            );
          }
          
          // Test all implementations
          const result = await window.testTransferImplementations(assetId);
          
          if (result.success) {
            debugLog(`Successfully transferred ${assetId} using ${result.implementation}`);
            
            // Show achievement notification
            if (window.BurnAnimations?.showAchievement) {
              window.BurnAnimations.showAchievement(
                "Debug Transfer Success",
                `Implementation: ${result.implementation}`
              );
            }
            
            // Add to hidden assets
            if (window.hiddenAssets) {
              window.hiddenAssets.addHiddenAsset(assetId);
            }
          } else {
            debugLog(`Failed to transfer ${assetId}`, result);
            
            // Show error notification
            if (window.BurnAnimations?.showNotification) {
              window.BurnAnimations.showNotification(
                "Debug Transfer Failed",
                `Error: ${result.message}`
              );
            }
          }
          
          return false;
        } else if (originalClick) {
          // Not a cNFT button, use original handler
          return originalClick.call(this, event);
        }
      };
    });
    
    debugLog(`Successfully patched ${buttons.length} buttons`);
    return buttons.length;
  };
  
  // Initialize immediately
  console.log("[Debug] Transfer debug tools initialized. Available commands:");
  console.log("- window.testTransferImplementations(assetId) - Test all implementations");
  console.log("- window.tryTransferImplementation(name, assetId) - Test a specific implementation");
  console.log("- window.manuallyPatchButtons() - Patch all buttons with debug handler");
  console.log("- window.getTransactionInstructionClass() - Check for TransactionInstruction");
  console.log("- window.getGlobalObjectInfo() - Get info about global objects");
  console.log("Debug data is stored in window.debugTransfer");
})();
window["debug-transfer"] = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=debug-transfer.js.map