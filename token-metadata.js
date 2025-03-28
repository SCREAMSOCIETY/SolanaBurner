// Enhanced token metadata store for Solana tokens with URI metadata support
// This is used as a fallback when external APIs are unavailable
const axios = require('axios');
const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// Cache for metadata to avoid duplicate fetches
const metadataCache = {};

const COMMON_TOKENS = {
  // Solana
  "So11111111111111111111111111111111111111112": {
    name: "Solana",
    symbol: "SOL",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    decimals: 9
  },
  // USDC
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
    name: "USD Coin",
    symbol: "USDC",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    decimals: 6
  },
  // USDT
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {
    name: "USDT",
    symbol: "USDT",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
    decimals: 6
  },
  // Bonk
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": {
    name: "Bonk",
    symbol: "BONK",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png",
    decimals: 5
  },
  // BSOL
  "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": {
    name: "BlazeStake Staked SOL",
    symbol: "bSOL",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
    decimals: 9
  },
  // RAY
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {
    name: "Raydium",
    symbol: "RAY",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
    decimals: 6
  },
  // ORCA
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": {
    name: "Orca",
    symbol: "ORCA",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
    decimals: 6
  },
  // MSOL
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": {
    name: "Marinade staked SOL",
    symbol: "mSOL",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
    decimals: 9
  },
  // GMT
  "7i5KKsX2weiTkry7jA4ZwSuXGhs5eJBEjY8vVxR4pfRx": {
    name: "STEPN",
    symbol: "GMT",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7i5KKsX2weiTkry7jA4ZwSuXGhs5eJBEjY8vVxR4pfRx/logo.png",
    decimals: 9
  },
  // SAMO
  "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU": {
    name: "Samoyedcoin",
    symbol: "SAMO",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/logo.png",
    decimals: 9
  },
  // JitoSOL
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": {
    name: "Jito Staked SOL",
    symbol: "JitoSOL",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn/logo.png",
    decimals: 9
  }
};

// Create a Solana connection using RPC URL from env vars
let connection = null;
try {
  const rpcUrl = process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com';
  connection = new Connection(rpcUrl, 'confirmed');
  console.log(`Connected to Solana RPC at ${rpcUrl}`);
} catch (error) {
  console.error('Failed to initialize Solana connection:', error);
}

// Function to find metadata PDA for a token mint
function findMetadataPda(mintAddress) {
  try {
    const mint = new PublicKey(mintAddress);
    // Metadata program ID
    const metadataProgramId = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    // Find the metadata account
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        metadataProgramId.toBuffer(),
        mint.toBuffer(),
      ],
      metadataProgramId
    );
    return metadataPda;
  } catch (error) {
    console.error('Error finding metadata PDA:', error);
    return null;
  }
}

// Function to extract URI from metadata account data
async function extractUriFromMetadata(metadataAccount) {
  if (!metadataAccount || !metadataAccount.data) {
    return null;
  }

  try {
    // Simple regex to extract a URL - this is a simplified approach
    const metadataString = Buffer.from(metadataAccount.data).toString();
    const uriMatch = metadataString.match(/https?:\/\/\S+/g);
    
    if (uriMatch && uriMatch.length > 0) {
      // Clean the URI from null terminators or other junk
      return uriMatch[0].split('\0')[0];
    }
  } catch (error) {
    console.error('Error extracting URI from metadata:', error);
  }
  return null;
}

// Function to fetch external metadata from URI
async function fetchExternalMetadata(uri) {
  try {
    const response = await axios.get(uri, { timeout: 5000 });
    return response.data;
  } catch (error) {
    console.error('Error fetching external metadata:', error);
    return null;
  }
}

/**
 * Get metadata for a specific token with support for on-chain metadata
 * @param {string} tokenAddress - The token mint address
 * @returns {Object} The token metadata 
 */
async function getTokenMetadataWithUri(tokenAddress) {
  // Check cache first
  if (metadataCache[tokenAddress]) {
    return metadataCache[tokenAddress];
  }
  
  // Check if it's a known token
  if (COMMON_TOKENS[tokenAddress]) {
    const result = {
      success: true,
      data: {
        symbol: COMMON_TOKENS[tokenAddress].symbol,
        name: COMMON_TOKENS[tokenAddress].name,
        icon: COMMON_TOKENS[tokenAddress].icon,
        decimals: COMMON_TOKENS[tokenAddress].decimals,
        uri: null
      }
    };
    metadataCache[tokenAddress] = result;
    return result;
  }
  
  // Initialize with default data
  let metadata = {
    symbol: tokenAddress.slice(0, 4),
    name: `Token ${tokenAddress.slice(0, 8)}...`,
    icon: null,
    decimals: 9,
    uri: null
  };
  
  // Try to fetch on-chain metadata if we have a connection
  if (connection) {
    try {
      const metadataPda = findMetadataPda(tokenAddress);
      if (metadataPda) {
        const metadataAccount = await connection.getAccountInfo(metadataPda);
        if (metadataAccount) {
          const uri = await extractUriFromMetadata(metadataAccount);
          if (uri) {
            metadata.uri = uri;
            console.log(`Found metadata URI for token ${tokenAddress}: ${uri}`);
            
            // Fetch external metadata
            const externalData = await fetchExternalMetadata(uri);
            if (externalData) {
              if (externalData.name) metadata.name = externalData.name;
              if (externalData.symbol) metadata.symbol = externalData.symbol;
              if (externalData.image) metadata.icon = externalData.image;
              if (externalData.decimals) metadata.decimals = externalData.decimals;
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching on-chain metadata for ${tokenAddress}:`, error);
    }
  }
  
  // Save to cache and return
  const result = {
    success: true,
    data: metadata
  };
  metadataCache[tokenAddress] = result;
  return result;
}

/**
 * Synchronous version of getTokenMetadata
 * @param {string} tokenAddress - The token mint address
 * @returns {Object} The token metadata (cached or default)
 */
function getTokenMetadata(tokenAddress) {
  // If we already have it in the cache, return that
  if (metadataCache[tokenAddress]) {
    return metadataCache[tokenAddress];
  }
  
  // Check if it's a known token
  if (COMMON_TOKENS[tokenAddress]) {
    const result = {
      success: true,
      data: {
        symbol: COMMON_TOKENS[tokenAddress].symbol,
        name: COMMON_TOKENS[tokenAddress].name,
        icon: COMMON_TOKENS[tokenAddress].icon,
        decimals: COMMON_TOKENS[tokenAddress].decimals,
        uri: null
      }
    };
    metadataCache[tokenAddress] = result;
    return result;
  }
  
  // For unknown tokens, return a basic structure with the mint as the name
  // and kick off an async process to get full metadata
  const result = {
    success: true,
    data: {
      symbol: tokenAddress.slice(0, 4),
      name: `Token ${tokenAddress.slice(0, 8)}...`,
      icon: null,
      decimals: 9,
      uri: null
    }
  };
  
  // Start an async process to get better metadata
  if (connection) {
    getTokenMetadataWithUri(tokenAddress).then(updatedData => {
      // Update the cache with better data when it's available
      metadataCache[tokenAddress] = updatedData;
    }).catch(error => {
      console.error(`Async metadata lookup failed for ${tokenAddress}:`, error);
    });
  }
  
  return result;
}

module.exports = {
  getTokenMetadata,
  getTokenMetadataWithUri
};