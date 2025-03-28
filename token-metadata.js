// Simple token metadata store for common Solana tokens
// This is used as a fallback when external APIs are unavailable

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

/**
 * Get metadata for a specific token
 * @param {string} tokenAddress - The token mint address
 * @returns {Object|null} The token metadata or null if not found
 */
function getTokenMetadata(tokenAddress) {
  if (COMMON_TOKENS[tokenAddress]) {
    return {
      success: true,
      data: {
        symbol: COMMON_TOKENS[tokenAddress].symbol,
        name: COMMON_TOKENS[tokenAddress].name,
        icon: COMMON_TOKENS[tokenAddress].icon,
        decimals: COMMON_TOKENS[tokenAddress].decimals
      }
    };
  }
  
  // For unknown tokens, return a basic structure with the mint as the name
  // Match the structure expected by the frontend
  return {
    success: true,
    data: {
      symbol: tokenAddress.slice(0, 4),
      name: `Token ${tokenAddress.slice(0, 8)}...`,
      icon: null,
      decimals: 9  // Default to 9 decimals if unknown
    }
  };
}

module.exports = {
  getTokenMetadata
};