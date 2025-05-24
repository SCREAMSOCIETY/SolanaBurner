/**
 * Helius API Integration for NFT and cNFT data fetching
 * This file provides helper functions to fetch NFT data using the Helius API
 * with built-in rate limiting to avoid 429 errors
 */
const axios = require('axios');
const { rateLimit, getBucketState } = require('./rate-limiter');

// Configuration for Helius API
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

// Check if API key is available
if (!HELIUS_API_KEY) {
  console.warn('WARNING: HELIUS_API_KEY environment variable is not set. API calls will fail.');
}

// Use more consistent URLs that will work on both dev and production
const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com';
const HELIUS_REST_URL = 'https://api.helius.xyz/v0';

// Helper function to create a rate-limited axios request
const rateLimitedAxios = {
  get: (url, config = {}) => {
    return rateLimit(() => axios.get(url, config));
  },
  post: (url, data, config = {}) => {
    return rateLimit(() => axios.post(url, data, config));
  }
};

/**
 * Fetches all NFTs (both regular and compressed) for a wallet address
 * @param {string} walletAddress - The Solana wallet address
 * @returns {Promise<Array>} - Array of NFT data objects
 */
async function fetchAllWalletNFTs(walletAddress) {
  try {
    console.log(`[Helius API] Fetching all NFTs (regular + compressed) for wallet: ${walletAddress}`);
    
    // Use the RPC endpoint directly instead of the v0 REST API
    const allNFTs = await fetchAllNFTsByOwner(walletAddress);
    
    // Filter assets by compression
    const regularNfts = allNFTs.filter(nft => !nft.compression?.compressed)
      .map(formatHeliusNFTData);
    const compressedNfts = allNFTs.filter(nft => nft.compression?.compressed)
      .map(formatHeliusNFTData);
      
    console.log(`[Helius API] Found ${regularNfts.length + compressedNfts.length} total NFTs (${regularNfts.length} regular, ${compressedNfts.length} compressed)`);
    
    return {
      allNfts: [...regularNfts, ...compressedNfts],
      regularNfts: regularNfts,
      compressedNfts: compressedNfts
    };
  } catch (error) {
    console.error('[Helius API] Error fetching wallet NFTs:', error.message);
    // Return empty arrays rather than throwing
    return { allNfts: [], regularNfts: [], compressedNfts: [] };
  }
}

/**
 * Fetches all NFTs for a given wallet address using Helius RPC API
 * @param {string} walletAddress - The Solana wallet address
 * @returns {Promise<Array>} - Array of NFT data objects
 */
async function fetchAllNFTsByOwner(walletAddress) {
  try {
    console.log(`[Helius API] Fetching all NFTs for wallet: ${walletAddress}`);
    
    // Direct API call to Helius RPC endpoint to avoid circular references
    const rpcResponse = await axios.post(
      HELIUS_RPC_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-wallet-assets',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1, 
          limit: 1000,
          displayOptions: {
            showCollectionMetadata: true
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': HELIUS_API_KEY
        }
      }
    );
    
    // Safety check to make sure we have a valid response
    if (rpcResponse?.data?.result?.items) {
      const assets = rpcResponse.data.result.items;
      console.log(`[Helius API] Found ${assets.length} NFTs/assets`);
      return assets;
    } else {
      console.warn('[Helius API] No items found in RPC response');
      return [];
    }
  } catch (error) {
    console.error('[Helius API] Error fetching NFTs:', error.message);
    throw error;
  }
}

/**
 * Fetches detailed information for a single asset/NFT
 * @param {string} assetId - The NFT/asset ID (mint address for normal NFTs)
 * @returns {Promise<Object>} - Detailed NFT data
 */
async function fetchAssetDetails(assetId) {
  try {
    console.log(`[Helius API] Fetching asset details for: ${assetId}`);
    
    // Direct API call to Helius RPC endpoint to avoid circular references
    const rpcResponse = await axios.post(
      HELIUS_RPC_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-asset-details',
        method: 'getAsset',
        params: {
          id: assetId,
          displayOptions: {
            showCollectionMetadata: true
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': HELIUS_API_KEY
        }
      }
    );
    
    // Safety check to make sure we have a valid response
    if (rpcResponse?.data?.result) {
      const asset = rpcResponse.data.result;
      console.log(`[Helius API] Successfully fetched details for asset: ${assetId}`);
      return asset;
    } else {
      console.warn('[Helius API] No asset details found in RPC response');
      return null;
    }
  } catch (error) {
    console.error('[Helius API] Error fetching asset details:', error.message);
    throw error;
  }
}

/**
 * Fetches cNFTs (compressed NFTs) for a wallet
 * @param {string} walletAddress - The Solana wallet address
 * @returns {Promise<Array>} - Array of cNFT data objects
 */
async function fetchCompressedNFTsByOwner(walletAddress) {
  try {
    console.log(`[Helius API] Fetching compressed NFTs for wallet: ${walletAddress}`);
    
    // Direct API call to Helius RPC endpoint to avoid circular references
    const rpcResponse = await axios.post(
      HELIUS_RPC_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-compressed-nfts',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1, 
          limit: 1000,
          displayOptions: {
            showCollectionMetadata: true
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': HELIUS_API_KEY
        }
      }
    );
    
    // Safety check to make sure we have a valid response
    if (rpcResponse?.data?.result?.items) {
      // Filter to only compressed NFTs
      const allItems = rpcResponse.data.result.items || [];
      const compressedNfts = allItems.filter(nft => nft.compression?.compressed);
      
      console.log(`[Helius API] Found ${compressedNfts.length} compressed NFTs out of ${allItems.length} total items`);
      return compressedNfts;
    } else {
      console.warn('[Helius API] No compressed NFTs found in RPC response');
      return [];
    }
  } catch (error) {
    console.error('[Helius API] Error fetching compressed NFTs:', error.message);
    throw error;
  }
}

/**
 * Formats nft data from Helius v0 API to our application format
 * @param {Object} nft - NFT data from Helius v0 API
 * @returns {Object} - Formatted NFT data for our application
 */
function formatHeliusV0NFTData(nft) {
  try {
    const isCompressed = nft.compression?.compressed || false;
    // For compressed NFTs, the content contains the metadata
    const content = nft.content || {};
    const metadata = content.metadata || nft.offChainData || {};
    
    return {
      mint: nft.id || nft.mint,
      name: metadata.name || `NFT ${(nft.id || nft.mint || '').slice(0, 8)}...`,
      symbol: metadata.symbol || '',
      image: metadata.image || content.files?.[0]?.uri || '/default-nft-image.svg',
      collection: metadata.collection?.name || nft.grouping?.[0]?.group_value || '',
      description: metadata.description || '',
      attributes: metadata.attributes || [],
      compressed: isCompressed,
      tokenAddress: nft.tokenAccount || '',
      explorer_url: `https://solscan.io/token/${nft.id || nft.mint}`,
      metadataAddress: nft.metadataAccount || '',
      // For compressed NFTs, store the compression data needed for burning
      ...(isCompressed && {
        compression: nft.compression,
        tree: nft.compression?.tree,
        proof: nft.compression?.proof,
        leafId: nft.compression?.node_index || nft.compression?.leaf_id || nft.compression?.leafId || 0,
        data_hash: nft.compression?.data_hash,
        creator_hash: nft.compression?.creator_hash,
      })
    };
  } catch (error) {
    console.error('[Helius API] Error formatting NFT data:', error.message);
    // Return basic fallback data
    return {
      mint: nft.id || nft.mint || 'unknown',
      name: `NFT ${(nft.id || nft.mint || 'unknown').slice(0, 8)}...`,
      image: '/default-nft-image.svg'
    };
  }
}

/**
 * Fetches proof data for a compressed NFT (cNFT)
 * @param {string} assetId - The NFT/asset ID
 * @returns {Promise<Object>} - Asset proof data for the cNFT
 */
async function fetchAssetProof(assetId, highPriority = false) {
  try {
    console.log(`[Helius API] Fetching proof data for asset: ${assetId} (Priority: ${highPriority ? 'High' : 'Normal'})`);
    console.log(`[Helius API] Rate limiter state:`, getBucketState());
    
    // Create a rate-limited request function
    const requestFn = () => axios.post(
      HELIUS_RPC_URL,
      {
        jsonrpc: '2.0',
        id: `helius-asset-proof-${Date.now()}`, // Unique ID to avoid any caching
        method: 'getAssetProof',
        params: {
          id: assetId
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': HELIUS_API_KEY,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Execute the request through our rate limiter
    const rpcResponse = await rateLimit(requestFn, highPriority);
    
    // Safety check to make sure we have a valid response
    if (rpcResponse?.data?.result) {
      const rpcProofData = rpcResponse.data.result;
      
      // Validate the proof data has the necessary fields
      if (!rpcProofData.proof || !Array.isArray(rpcProofData.proof) || rpcProofData.proof.length === 0) {
        console.error(`[Helius API] Missing proof array in response for asset: ${assetId}`);
        console.error(`[Helius API] Proof data:`, rpcProofData);
        throw new Error('Missing proof array in Helius API response');
      }
      
      // Check for tree_id - needed for transfer
      if (!rpcProofData.tree_id) {
        console.error(`[Helius API] Missing tree_id in proof data for asset: ${assetId}`);
        
        // Try to find it elsewhere
        if (rpcProofData.compression && rpcProofData.compression.tree) {
          console.log(`[Helius API] Found tree in compression field, using this value`);
          rpcProofData.tree_id = rpcProofData.compression.tree;
        } else {
          console.error(`[Helius API] Could not find tree_id value in any field`);
          throw new Error('Missing tree_id in proof data');
        }
      }
      
      // Check for root - needed for transfer
      if (!rpcProofData.root) {
        console.error(`[Helius API] Missing root in proof data for asset: ${assetId}`);
        
        // Try to find it elsewhere
        if (rpcProofData.merkle_tree && rpcProofData.merkle_tree.root) {
          console.log(`[Helius API] Found root in merkle_tree field, using this value`);
          rpcProofData.root = rpcProofData.merkle_tree.root;
        } else {
          console.error(`[Helius API] Could not find root value in any field`);
          throw new Error('Missing root in proof data');
        }
      }
      
      // Make sure we have a leaf_id or node_index
      let leafId = null;
      if (rpcProofData.leaf_id !== undefined) {
        leafId = rpcProofData.leaf_id;
        console.log(`[Helius API] Found leaf_id: ${leafId}`);
      } else if (rpcProofData.node_index !== undefined) {
        leafId = rpcProofData.node_index;
        console.log(`[Helius API] Found node_index, using as leaf_id: ${leafId}`);
      } else if (rpcProofData.leaf_index !== undefined) {
        leafId = rpcProofData.leaf_index;
        console.log(`[Helius API] Found leaf_index, using as leaf_id: ${leafId}`);
      } else if (rpcProofData.compression && rpcProofData.compression.leaf_id !== undefined) {
        leafId = rpcProofData.compression.leaf_id;
        console.log(`[Helius API] Found compression.leaf_id, using as leaf_id: ${leafId}`);
      } else if (rpcProofData.compression && rpcProofData.compression.node_index !== undefined) {
        leafId = rpcProofData.compression.node_index;
        console.log(`[Helius API] Found compression.node_index, using as leaf_id: ${leafId}`);
      }
      
      if (leafId === null) {
        console.warn(`[Helius API] Could not find leaf_id or node_index in proof data`);
        // For older trees, we'll assume 0 if not specified
        leafId = 0;
        console.log(`[Helius API] Setting default leaf_id to 0 for older tree format`);
      }
      
      // Transform the proof data to match the expected format in working-cnft-transfer.js
      // This ensures compatibility with the existing transfer mechanism
      const formattedProofData = {
        ...rpcProofData,
        leaf_id: leafId,
        node_index: leafId,
        compression: {
          tree: rpcProofData.tree_id,
          proof: rpcProofData.proof,
          leaf_id: leafId,
          node_index: leafId
        }
      };
      
      console.log(`[Helius API] Successfully fetched proof for asset: ${assetId}`);
      return formattedProofData;
    } else {
      console.error('[Helius API] No proof data found in RPC response');
      console.error('[Helius API] Response:', rpcResponse?.data);
      throw new Error('Invalid response from Helius API when fetching proof');
    }
  } catch (error) {
    console.error('[Helius API] Error fetching asset proof:', error.message);
    if (error.response) {
      console.error(`[Helius API] Response status: ${error.response.status}`);
      console.error(`[Helius API] Response data:`, error.response.data);
      
      // Special handling for rate limiting (429 errors)
      if (error.response.status === 429) {
        console.log(`[Helius API] Rate limit hit, will retry with exponential backoff`);
        
        // If this is a rate limit error, try again with a different endpoint after a delay
        try {
          console.log(`[Helius API] Attempting alternative API endpoint for asset proof: ${assetId}`);
          
          // Wait a bit before trying alternative endpoint
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Try the DAS v1 API to get compression data
          const altRequestFn = () => axios.get(`https://api.helius.xyz/v1/compression-assets?api-key=${HELIUS_API_KEY}&assetId=${assetId}`, {
            timeout: 30000,
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          
          const altResponse = await rateLimit(altRequestFn, true); // High priority
          
          if (altResponse.data && altResponse.data.compression) {
            console.log(`[Helius API] Successfully retrieved minimal asset data from alternative endpoint`);
            
            // Construct a basic proof data structure from compression info
            return {
              asset_id: assetId,
              tree_id: altResponse.data.compression.tree,
              leaf_id: altResponse.data.compression.leaf_id || 0,
              node_index: altResponse.data.compression.leaf_id || 0,
              proof: [], // Empty proof as last resort
              root: altResponse.data.compression.tree_root || "11111111111111111111111111111111"
            };
          }
        } catch (altError) {
          console.error(`[Helius API] Alternative endpoint also failed:`, altError.message);
        }
      }
    }
    
    // If we get here, all our attempts have failed
    // Return a minimal object that the calling code can handle
    console.warn(`[Helius API] All attempts to get proof data failed, returning empty structure`);
    return {
      asset_id: assetId,
      error: true,
      errorMessage: error.message,
      proof: []
    };
  }
}

/**
 * Converts Helius NFT data from RPC API to our application's NFT format
 * @param {Object} heliusNFT - NFT data from Helius RPC API
 * @returns {Object} - Formatted NFT data for our application
 */
function formatHeliusNFTData(heliusNFT) {
  try {
    // Extract basic info - handle multiple possible data structures from Helius
    const content = heliusNFT.content || {};
    const metadata = content.metadata || heliusNFT.metadata || {};
    const compression = heliusNFT.compression || {};
    
    // Get name from multiple possible locations
    let nftName = metadata.name || content.json_uri?.name || heliusNFT.name;
    if (!nftName && heliusNFT.id) {
      nftName = `NFT ${heliusNFT.id.slice(0, 8)}...`;
    }
    
    // Get image from multiple possible locations
    let nftImage = metadata.image || 
                   content.json_uri?.image || 
                   content.links?.image || 
                   content.files?.[0]?.uri ||
                   content.files?.[0]?.cdn_uri ||
                   '/default-nft-image.svg';
    
    // Determine if this NFT can recover rent
    const isCompressed = compression.compressed || false;
    const canRecoverRent = !isCompressed;
    const estimatedRentLamports = canRecoverRent ? 2039280 : 0;
    
    const formattedNFT = {
      mint: heliusNFT.id,
      name: nftName,
      symbol: metadata.symbol || '',
      image: nftImage,
      collection: metadata.collection?.name || heliusNFT.grouping?.[0]?.group_value || '',
      description: metadata.description || '',
      attributes: metadata.attributes || [],
      compressed: isCompressed,
      tokenAddress: heliusNFT.token_info?.token_account || '',
      explorer_url: `https://solscan.io/token/${heliusNFT.id}`,
      metadataAddress: heliusNFT.token_info?.metadata_account || '',
      // Add rent information
      rentRecovery: {
        canRecoverRent,
        estimatedRentLamports,
        estimatedRentSol: estimatedRentLamports / 1000000000
      },
      // Include compression details for cNFTs
      ...(isCompressed && {
        compression,
        tree: compression.tree,
        proof: compression.proof,
        leafId: compression.node_index || compression.leaf_id || 0,
        data_hash: compression.data_hash,
        creator_hash: compression.creator_hash
      })
    };
    
    console.log(`[Helius API] Formatted NFT: ${formattedNFT.name} (${formattedNFT.mint.slice(0, 8)}...)`);
    return formattedNFT;
    
  } catch (error) {
    console.error('[Helius API] Error formatting NFT data:', error.message);
    console.error('[Helius API] Raw NFT data:', JSON.stringify(heliusNFT, null, 2));
    // Return basic fallback data
    return {
      mint: heliusNFT.id || 'unknown',
      name: `NFT ${(heliusNFT.id || 'unknown').slice(0, 8)}...`,
      image: '/default-nft-image.svg',
      compressed: false,
      rentRecovery: {
        canRecoverRent: false,
        estimatedRentLamports: 0,
        estimatedRentSol: 0
      }
    };
  }
}

module.exports = {
  fetchAllWalletNFTs,
  fetchAllNFTsByOwner,
  fetchAssetDetails,
  fetchCompressedNFTsByOwner,
  fetchAssetProof,
  formatHeliusNFTData,
  formatHeliusV0NFTData
};