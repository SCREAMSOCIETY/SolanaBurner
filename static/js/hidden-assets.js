/**
 * Hidden Assets - Client-side storage for hiding assets in the UI
 * 
 * This module provides functionality to "hide" assets from the UI
 * without actually transferring or burning them on-chain.
 * It's also used to hide successfully transferred cNFTs that might
 * still appear in API results due to caching.
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
     * Add an asset to the hidden assets list (alias for hideAsset)
     * @param {string} assetId - The asset ID to add
     */
    addToHiddenAssets: function(assetId) {
        return this.hideAsset(assetId, "Transferred Asset", "cNFT");
    },
    
    /**
     * Add multiple assets to the hidden assets list at once
     * @param {string[]} assetIds - Array of asset IDs to add to hidden assets
     */
    addMultipleToHiddenAssets: function(assetIds) {
        if (!Array.isArray(assetIds) || assetIds.length === 0) {
            return false;
        }
        
        try {
            // Get existing hidden assets
            const hiddenAssets = this.getHiddenAssets();
            const now = new Date().toISOString();
            
            // Add each asset to the list
            assetIds.forEach(assetId => {
                hiddenAssets[assetId] = {
                    id: assetId,
                    name: "Transferred Asset",
                    type: "cNFT",
                    dateHidden: now
                };
            });
            
            // Save back to local storage
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(hiddenAssets));
            
            console.log(`Added ${assetIds.length} assets to hidden assets list`);
            return true;
        } catch (error) {
            console.error('Error adding multiple assets to hidden list:', error);
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