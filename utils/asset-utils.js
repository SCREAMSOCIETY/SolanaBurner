/**
 * Utility functions for asset handling
 */

/**
 * Extract the data hash from an asset object
 * @param {object} asset - The asset object from Helius API
 * @returns {string} - The data hash or a default hash if not found
 */
function getDataHashFromAsset(asset) {
  try {
    // Try different paths where data hash might be located
    if (asset.compression && asset.compression.data_hash) {
      return asset.compression.data_hash;
    }
    
    if (asset.content && asset.content.metadata_hash) {
      return asset.content.metadata_hash;
    }
    
    if (asset.content && asset.content.data_hash) {
      return asset.content.data_hash;
    }
    
    if (asset.data_hash) {
      return asset.data_hash;
    }
    
    if (asset.leaf && asset.leaf.data_hash) {
      return asset.leaf.data_hash;
    }
    
    // Return a default hash if none is found
    return "0000000000000000000000000000000000000000000000000000000000000000";
  } catch (error) {
    console.error("Error extracting data hash:", error);
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
}

/**
 * Extract the creator hash from an asset object
 * @param {object} asset - The asset object from Helius API
 * @returns {string} - The creator hash or a default hash if not found
 */
function getCreatorHashFromAsset(asset) {
  try {
    // Try different paths where creator hash might be located
    if (asset.compression && asset.compression.creator_hash) {
      return asset.compression.creator_hash;
    }
    
    if (asset.creator_hash) {
      return asset.creator_hash;
    }
    
    if (asset.content && asset.content.creator_hash) {
      return asset.content.creator_hash;
    }
    
    if (asset.leaf && asset.leaf.creator_hash) {
      return asset.leaf.creator_hash;
    }
    
    // Return a default hash if none is found
    return "0000000000000000000000000000000000000000000000000000000000000000";
  } catch (error) {
    console.error("Error extracting creator hash:", error);
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
}

module.exports = {
  getDataHashFromAsset,
  getCreatorHashFromAsset
};