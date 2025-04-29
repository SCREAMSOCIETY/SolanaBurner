/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
/*!************************************!*\
  !*** ./static/js/hidden-assets.js ***!
  \************************************/
/**
 * Hidden Assets - Client-side storage for hiding assets in the UI
 * 
 * This module provides functionality to "hide" assets from the UI
 * without actually transferring or burning them on-chain.
 * It's used as a visual-only solution for cNFTs that can't be easily
 * transferred due to tree authority limitations.
 */

// Initialize hidden assets storage
const LOCAL_STORAGE_KEY = 'solburn_hidden_assets';

// Export as window object for easy access
window.HiddenAssets = {
    /**
     * Hide an asset from the UI
     * @param {string} assetId - The asset ID to hide
     * @param {string} assetName - The asset name (for display)
     * @param {string} assetType - The asset type (for filtering)
     */
    hideAsset: function(assetId, assetName, assetType) {
        try {
            // Get existing hidden assets
            const hiddenAssets = this.getHiddenAssets();
            
            // Add the new asset
            hiddenAssets[assetId] = {
                id: assetId,
                name: assetName || 'Unknown Asset',
                type: assetType || 'cNFT',
                dateHidden: new Date().toISOString()
            };
            
            // Save back to local storage
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(hiddenAssets));
            
            console.log(`Asset ${assetId} hidden successfully`);
            return true;
        } catch (error) {
            console.error('Error hiding asset:', error);
            return false;
        }
    },
    
    /**
     * Unhide a previously hidden asset
     * @param {string} assetId - The asset ID to unhide
     */
    unhideAsset: function(assetId) {
        try {
            // Get existing hidden assets
            const hiddenAssets = this.getHiddenAssets();
            
            // Remove the asset if it exists
            if (hiddenAssets[assetId]) {
                delete hiddenAssets[assetId];
                
                // Save back to local storage
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(hiddenAssets));
                console.log(`Asset ${assetId} unhidden successfully`);
                return true;
            } else {
                console.log(`Asset ${assetId} was not hidden`);
                return false;
            }
        } catch (error) {
            console.error('Error unhiding asset:', error);
            return false;
        }
    },
    
    /**
     * Check if an asset is hidden
     * @param {string} assetId - The asset ID to check
     * @returns {boolean} - Whether the asset is hidden
     */
    isAssetHidden: function(assetId) {
        try {
            const hiddenAssets = this.getHiddenAssets();
            return !!hiddenAssets[assetId];
        } catch (error) {
            console.error('Error checking if asset is hidden:', error);
            return false;
        }
    },
    
    /**
     * Get all hidden assets
     * @returns {Object} - Map of asset IDs to asset info
     */
    getHiddenAssets: function() {
        try {
            const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
            return storedData ? JSON.parse(storedData) : {};
        } catch (error) {
            console.error('Error getting hidden assets:', error);
            return {};
        }
    },
    
    /**
     * Get count of hidden assets
     * @returns {number} - Count of hidden assets
     */
    getHiddenAssetsCount: function() {
        try {
            const hiddenAssets = this.getHiddenAssets();
            return Object.keys(hiddenAssets).length;
        } catch (error) {
            console.error('Error getting hidden assets count:', error);
            return 0;
        }
    },
    
    /**
     * Clear all hidden assets
     */
    clearHiddenAssets: function() {
        try {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            console.log('All hidden assets cleared');
            return true;
        } catch (error) {
            console.error('Error clearing hidden assets:', error);
            return false;
        }
    }
};
window["hidden-assets"] = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=hidden-assets.js.map