/**
 * Helius API Integration for NFT and cNFT data fetching
 * This file provides helper functions to fetch NFT data using the Helius API
 */
const axios = require('axios');

// Configuration for Helius API
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

// Check if API key is available
if (!HELIUS_API_KEY) {
  console.warn('WARNING: HELIUS_API_KEY environment variable is not set. API calls will fail.');
}

// Use more consistent URLs that will work on both dev and production
const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com';
const HELIUS_REST_URL = 'https://api.helius.xyz/v0';

/**
 * Fetches all NFTs (both regular and compressed) for a wallet address using Helius API's v0 endpoint
 * @param {string} walletAddress - The Solana wallet address
 * @returns {Promise<Array>} - Array of NFT data objects
 */
async function fetchAllWalletNFTs(walletAddress) {
  try {
    console.log(`[Helius API] Fetching all NFTs (regular + compressed) for wallet: ${walletAddress}`);
    
    // Use the proxy API endpoint instead of direct Helius API access
    const url = `/api/helius/wallet/nfts/${walletAddress}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.success) {
      const { regularNfts, compressedNfts } = response.data.data;
      
      console.log(`[Helius API] Found ${regularNfts.length + compressedNfts.length} total NFTs (${regularNfts.length} regular, ${compressedNfts.length} compressed)`);
      
      return {
        allNfts: [...regularNfts, ...compressedNfts],
        regularNfts: regularNfts,
        compressedNfts: compressedNfts
      };
    } else {
      console.warn('[Helius API] Invalid response format:', response.data);
      return { allNfts: [], regularNfts: [], compressedNfts: [] };
    }
  } catch (error) {
    console.error('[Helius API] Error fetching wallet NFTs:', error.message);
    throw error;
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
async function fetchAssetProof(assetId) {
  try {
    console.log(`[Helius API] Fetching proof data for asset: ${assetId}`);
    
    // Direct API call to Helius RPC endpoint to avoid circular references
    const rpcResponse = await axios.post(
      HELIUS_RPC_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-asset-proof',
        method: 'getAssetProof',
        params: {
          id: assetId
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
      const rpcProofData = rpcResponse.data.result;
      
      // Transform the proof data to match the expected format in working-cnft-transfer.js
      // This ensures compatibility with the existing transfer mechanism
      const formattedProofData = {
        ...rpcProofData,
        compression: {
          tree: rpcProofData.tree_id,
          proof: rpcProofData.proof,
          leaf_id: rpcProofData.node_index || rpcProofData.leaf_index || 0
        }
      };
      
      console.log(`[Helius API] Successfully fetched proof for asset: ${assetId}`);
      return formattedProofData;
    } else {
      console.warn('[Helius API] No proof data found in RPC response');
      return null;
    }
  } catch (error) {
    console.error('[Helius API] Error fetching asset proof:', error.message);
    throw error;
  }
}

/**
 * Converts Helius NFT data from RPC API to our application's NFT format
 * @param {Object} heliusNFT - NFT data from Helius RPC API
 * @returns {Object} - Formatted NFT data for our application
 */
function formatHeliusNFTData(heliusNFT) {
  try {
    // Extract basic info
    const content = heliusNFT.content || {};
    const metadata = heliusNFT.metadata || {};
    const compression = heliusNFT.compression || {};
    
    // Determine if this NFT can recover rent
    // Standard NFTs can recover rent from token accounts when burned
    // Compressed NFTs don't have token accounts, but use less storage
    const isCompressed = compression.compressed || false;
    const canRecoverRent = !isCompressed;
    const estimatedRentLamports = canRecoverRent ? 2039280 : 0; // Approximate rent for a token account in lamports
    
    return {
      mint: heliusNFT.id,
      name: metadata.name || `NFT ${heliusNFT.id.slice(0, 8)}...`,
      symbol: metadata.symbol || '',
      image: content.links?.image || content.json?.image || content.files?.[0]?.uri || '/default-nft-image.svg',
      collection: metadata.collection?.name || '',
      description: content.metadata?.description || metadata.description || '',
      attributes: content.metadata?.attributes || [],
      compressed: isCompressed,
      tokenAddress: heliusNFT.token_info?.token_account || '',
      explorer_url: `https://solscan.io/token/${heliusNFT.id}`,
      metadataAddress: heliusNFT.token_info?.metadata_account || '',
      // Add rent information
      rentRecovery: {
        canRecoverRent,
        estimatedRentLamports,
        estimatedRentSol: estimatedRentLamports / 1000000000 // Convert lamports to SOL
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
  } catch (error) {
    console.error('[Helius API] Error formatting NFT data:', error.message);
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