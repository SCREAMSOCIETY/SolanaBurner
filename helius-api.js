/**
 * Helius API Integration for NFT and cNFT data fetching
 * This file provides helper functions to fetch NFT data using the Helius API
 */
const axios = require('axios');

// Configuration for Helius API
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_API_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

/**
 * Fetches all NFTs for a given wallet address using Helius API
 * @param {string} walletAddress - The Solana wallet address
 * @returns {Promise<Array>} - Array of NFT data objects
 */
async function fetchAllNFTsByOwner(walletAddress) {
  try {
    console.log(`[Helius API] Fetching all NFTs for wallet: ${walletAddress}`);
    
    const response = await axios.post(
      HELIUS_API_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-nft-fetch',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1, // Start with first page
          limit: 100 // Fetch up to 100 assets at once
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data && response.data.result && response.data.result.items) {
      console.log(`[Helius API] Found ${response.data.result.items.length} NFTs/assets`);
      return response.data.result.items;
    } else {
      console.warn('[Helius API] No items found in response:', response.data);
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
    
    const response = await axios.post(
      HELIUS_API_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-asset-details',
        method: 'getAsset',
        params: {
          id: assetId
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data && response.data.result) {
      return response.data.result;
    } else {
      console.warn('[Helius API] No asset details found:', response.data);
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
    
    // Using getAssetsByOwner with the compressed filter
    const response = await axios.post(
      HELIUS_API_URL,
      {
        jsonrpc: '2.0',
        id: 'helius-cnft-fetch',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 100,
          displayOptions: {
            showCompressedAssets: true, // Ensure we get compressed assets
            showNativeAssets: false     // We can filter out native (normal) NFTs
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data && response.data.result && response.data.result.items) {
      const compressedNFTs = response.data.result.items.filter(item => item.compression && item.compression.compressed);
      console.log(`[Helius API] Found ${compressedNFTs.length} compressed NFTs`);
      return compressedNFTs;
    } else {
      console.warn('[Helius API] No compressed NFTs found:', response.data);
      return [];
    }
  } catch (error) {
    console.error('[Helius API] Error fetching compressed NFTs:', error.message);
    throw error;
  }
}

/**
 * Converts Helius NFT data to our application's NFT format
 * @param {Object} heliusNFT - NFT data from Helius API
 * @returns {Object} - Formatted NFT data for our application
 */
function formatHeliusNFTData(heliusNFT) {
  try {
    // Extract basic info
    const content = heliusNFT.content || {};
    const metadata = heliusNFT.metadata || {};
    const compression = heliusNFT.compression || {};
    
    return {
      mint: heliusNFT.id,
      name: metadata.name || `NFT ${heliusNFT.id.slice(0, 8)}...`,
      symbol: metadata.symbol || '',
      image: content.links?.image || content.json?.image || content.files?.[0]?.uri || '/default-nft-image.svg',
      collection: metadata.collection?.name || '',
      description: content.metadata?.description || metadata.description || '',
      attributes: content.metadata?.attributes || [],
      compressed: compression.compressed || false,
      tokenAddress: heliusNFT.token_info?.token_account || '',
      explorer_url: `https://solscan.io/token/${heliusNFT.id}`,
      metadataAddress: heliusNFT.token_info?.metadata_account || ''
    };
  } catch (error) {
    console.error('[Helius API] Error formatting NFT data:', error.message);
    // Return basic fallback data
    return {
      mint: heliusNFT.id || 'unknown',
      name: `NFT ${(heliusNFT.id || 'unknown').slice(0, 8)}...`,
      image: '/default-nft-image.svg'
    };
  }
}

module.exports = {
  fetchAllNFTsByOwner,
  fetchAssetDetails,
  fetchCompressedNFTsByOwner,
  formatHeliusNFTData
};