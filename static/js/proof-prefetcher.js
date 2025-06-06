/**
 * Proof Prefetcher
 * 
 * This module pre-fetches proof data for cNFTs to make transfers more reliable
 * It caches the proof data in window.cachedProofData for later use
 */

(function() {
  // Check if running in browser
  if (typeof window === 'undefined') {
    console.log('This script is meant to run in a browser environment');
    return;
  }
  
  // Make sure cache structures are initialized
  window.cachedProofData = window.cachedProofData || {};
  
  /**
   * Prefetch asset proof data for a single asset
   * @param {string} assetId - The asset ID to prefetch proof for
   * @returns {Promise<boolean>} - True if successful, false otherwise
   */
  async function prefetchProofForAsset(assetId) {
    try {
      // If we already have this asset's proof data cached and it's not too old, skip
      if (window.cachedProofData[assetId]) {
        const timeNow = Date.now();
        const cacheTime = window.cachedProofData[assetId]._cacheTime || 0;
        
        // Cache is valid for 30 minutes
        if ((timeNow - cacheTime) < 30 * 60 * 1000) {
          console.log(`[ProofPrefetcher] Using cached proof data for ${assetId}`);
          return true;
        }
      }
      
      console.log(`[ProofPrefetcher] Prefetching proof data for ${assetId}`);
      
      const response = await fetch(`/api/helius/asset-proof/${assetId}`);
      const data = await response.json();
      
      if (!data.success || !data.data) {
        console.warn(`[ProofPrefetcher] Failed to prefetch proof for ${assetId}:`, data.error || 'Unknown error');
        return false;
      }
      
      // Store the proof data with a timestamp
      data.data._cacheTime = Date.now();
      window.cachedProofData[assetId] = data.data;
      
      console.log(`[ProofPrefetcher] Successfully cached proof data for ${assetId}`);
      return true;
    } catch (error) {
      console.error(`[ProofPrefetcher] Error prefetching proof for ${assetId}:`, error);
      return false;
    }
  }
  
  /**
   * Prefetch asset proof data for multiple assets
   * @param {string[]} assetIds - Array of asset IDs to prefetch proofs for
   * @returns {Promise<{successes: number, failures: number}>} - Count of successful and failed prefetches
   */
  async function prefetchProofsForAssets(assetIds) {
    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      console.warn('[ProofPrefetcher] No asset IDs provided for prefetching');
      return { successes: 0, failures: 0 };
    }
    
    console.log(`[ProofPrefetcher] Prefetching proofs for ${assetIds.length} assets`);
    
    const results = {
      successes: 0,
      failures: 0
    };
    
    // Process in smaller batches to avoid API rate limits
    const batchSize = 2;
    for (let i = 0; i < assetIds.length; i += batchSize) {
      const batch = assetIds.slice(i, i + batchSize);
      
      // Process this batch in parallel
      const batchResults = await Promise.all(
        batch.map(assetId => prefetchProofForAsset(assetId))
      );
      
      // Count successes and failures
      batchResults.forEach(success => {
        if (success) {
          results.successes++;
        } else {
          results.failures++;
        }
      });
      
      // Longer delay between batches to avoid rate limiting
      if (i + batchSize < assetIds.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`[ProofPrefetcher] Prefetch completed: ${results.successes} successes, ${results.failures} failures`);
    return results;
  }
  
  /**
   * Watch for cNFTs loaded in the DOM and prefetch their proof data
   */
  function watchForCNFTsAndPrefetch() {
    // Function to process what's currently visible
    const processCurrent = () => {
      const assetElements = document.querySelectorAll('[data-asset-id]');
      
      if (assetElements.length === 0) {
        return;
      }
      
      const assetIds = [];
      assetElements.forEach(el => {
        const assetId = el.getAttribute('data-asset-id');
        if (assetId && !assetIds.includes(assetId)) {
          assetIds.push(assetId);
        }
      });
      
      if (assetIds.length > 0) {
        prefetchProofsForAssets(assetIds)
          .then(results => {
            console.log(`[ProofPrefetcher] Prefetched proofs for ${results.successes} of ${assetIds.length} assets`);
          })
          .catch(error => {
            console.error('[ProofPrefetcher] Error during prefetch:', error);
          });
      }
    };
    
    // Process immediately and set up a mutation observer to watch for changes
    processCurrent();
    
    // Set up a mutation observer to watch for new cNFTs being added to the DOM
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      
      // Check if any relevant elements were added
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          shouldProcess = true;
          break;
        }
      }
      
      if (shouldProcess) {
        processCurrent();
      }
    });
    
    // Start observing the document with configured parameters
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Also periodically check, in case mutation observer misses something
    // Reduced frequency to avoid API rate limiting
    setInterval(processCurrent, 60000); // Every minute instead of every 5 seconds
    
    console.log('[ProofPrefetcher] Started watching for cNFTs to prefetch proof data');
  }
  
  // Expose the API
  window.ProofPrefetcher = {
    prefetchProofForAsset,
    prefetchProofsForAssets,
    watchForCNFTsAndPrefetch
  };
  
  // Temporarily disable auto-start to improve performance
  // Users can manually trigger prefetching when needed
  console.log('[ProofPrefetcher] Proof prefetching disabled for better performance. Use window.ProofPrefetcher.watchForCNFTsAndPrefetch() to enable.');
})();