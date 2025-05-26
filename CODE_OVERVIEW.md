# SolBurn - Solana Asset Management Application

## Overview
A sophisticated Solana blockchain asset management web application that provides advanced debugging, transaction analysis, and interactive crypto asset management tools with robust error handling and adaptive API integration.

## Key Features
- ✅ **NFT & Token Management**: View and manage both regular NFTs and compressed NFTs (cNFTs)
- ✅ **Rent Return Estimation**: Calculate potential SOL returns from burning token accounts (~0.00204 SOL per account)
- ✅ **Advanced Transfer System**: Multiple transfer methods with fallback mechanisms
- ✅ **Real-time Asset Loading**: Fast asset loading with caching and rate limiting
- ✅ **Wallet Integration**: Support for popular Solana wallets (Phantom, Solflare, etc.)

## Architecture

### Frontend (React + TypeScript)
```
static/js/
├── App.tsx                 # Main application component
├── WalletProvider.tsx      # Wallet connection management
└── components/
    ├── WalletAssets.tsx    # Main asset management interface
    ├── TokensTab.tsx       # SPL tokens display and management
    ├── NFTsTab.tsx         # NFT display and management
    ├── RentEstimate.tsx    # SOL rent return calculator
    ├── DirectTrashModal.tsx # Direct NFT transfer modal
    ├── QueueTransferModal.tsx # Queued transfer modal
    └── DelegatedTransferModal.tsx # Delegated transfer modal
```

### Backend (Fastify Server)
```
fastifyServer.js            # Main server with comprehensive API endpoints
├── /api/config            # Configuration endpoint
├── /api/rent-estimate/:wallet # Rent return calculation
├── /api/token-metadata/:mint # Token metadata fetching
├── /api/helius/assets/:wallet # Asset data via Helius API
├── /api/helius/asset-proof/:id # Asset proof for cNFTs
└── /api/transfer-cnft     # cNFT transfer endpoint
```

### Transfer System
```
cnft-transfer-server.js     # cNFT transfer processing
delegated-cnft-transfer.js  # Delegated transfer handling
direct-cnft-transfer.js     # Direct transfer implementation
working-cnft-transfer.js    # Main transfer logic
```

### Utility & Configuration
```
config.js                   # Environment configuration
helius-api.js              # Helius API integration
asset-cache.js             # Asset data caching system
rate-limiter.js            # API rate limiting
```

## Key Components Explained

### 1. Asset Categorization System
The application correctly categorizes assets into two types:

**Regular SPL Tokens** (TokensTab.tsx):
- Fungible tokens like USDC, BONK, etc.
- Identified by: `amount > 1` OR `decimals > 0`
- Can be burned to recover rent (~0.00204 SOL per account)

**NFTs & Compressed NFTs** (NFTsTab.tsx):
- Non-fungible tokens including compressed NFTs
- Identified by: `amount === 1` AND `decimals === 0`
- Displayed with proper names, images, and metadata

### 2. Rent Return Estimation
```javascript
// API Endpoint: GET /api/rent-estimate/:walletAddress
{
  "totalAccounts": 10,
  "nftAccounts": 10,
  "tokenAccounts": 0,
  "rentPerAccount": 0.00203928,
  "totalRentEstimate": 0.0203928,
  "breakdown": {
    "nftRent": 0.0203928,
    "tokenRent": 0
  }
}
```

### 3. Transfer System Architecture
The application uses a multi-layered transfer system with fallbacks:

1. **Helius API Transfer** (Primary)
2. **Direct Web3.js Transfer** (Fallback)
3. **Server-side Processing** (Backup)

### 4. Caching & Performance
- **Asset Data Caching**: 5-minute cache for asset metadata
- **Proof Data Caching**: 10-minute cache for cNFT proofs
- **Rate Limiting**: Prevents API overuse with token bucket system

## Configuration

### Environment Variables
```bash
# Required API Keys
HELIUS_API_KEY=your_helius_api_key
QUICKNODE_RPC_URL=your_quicknode_url
SOLSCAN_API_KEY=your_solscan_key

# Optional Configuration
PROJECT_WALLET=EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK
PORT=5001
```

### Webpack Configuration
```javascript
// webpack.config.js - Browser compatibility setup
resolve: {
  fallback: {
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify"),
    "buffer": require.resolve("buffer"),
    // ... other polyfills
  }
}
```

## API Integration

### Helius API Integration
```javascript
// Primary data source for NFT and cNFT information
const heliusEndpoint = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Methods used:
- getAssetsByOwner    # Get all assets for wallet
- getAsset           # Get specific asset details  
- getAssetProof      # Get merkle proof for cNFTs
```

### Solana Web3.js Integration
```javascript
// Direct blockchain interaction for token accounts
- getTokenAccountsByOwner  # Fetch SPL token accounts
- getAccountInfo          # Get account details
- sendAndConfirmTransaction # Submit transactions
```

## File Structure by Function

### Asset Display & Management
- `WalletAssets.tsx` - Main interface with tabs
- `TokensTab.tsx` - SPL token management with burn functionality
- `NFTsTab.tsx` - NFT display with transfer options
- `RentEstimate.tsx` - Shows potential SOL returns

### Transfer & Transaction Handling
- `cnft-transfer-server.js` - Server-side cNFT transfers
- `delegated-cnft-transfer.js` - Delegated authority transfers
- `direct-cnft-transfer.js` - Direct transfer implementation
- `working-cnft-transfer.js` - Main transfer logic

### API & Data Management
- `fastifyServer.js` - Main API server
- `helius-api.js` - Helius API wrapper
- `asset-cache.js` - Caching system
- `rate-limiter.js` - Rate limiting

### Configuration & Utilities
- `config.js` - Environment configuration
- `webpack.config.js` - Build configuration
- `package.json` - Dependencies and scripts

## Key Improvements Made

### 1. Fixed NFT Categorization
- Enhanced filtering logic in `TokensTab.tsx`
- Proper separation of SPL tokens vs NFTs
- Debug logging for troubleshooting

### 2. Added Rent Return Estimation
- New API endpoint `/api/rent-estimate/:wallet`
- `RentEstimate.tsx` component for display
- Calculates potential SOL returns from account closure

### 3. Improved Error Handling
- Comprehensive try-catch blocks
- Fallback mechanisms for API failures
- User-friendly error messages

### 4. Enhanced Performance
- Asset data caching (5-10 minute TTL)
- Rate limiting to prevent API abuse
- Efficient proof prefetching

## Usage Examples

### Connecting Wallet
```javascript
// User clicks "Connect Wallet" button
// WalletProvider handles connection
// Automatically loads assets on connection
```

### Viewing Assets
```javascript
// Tokens Tab: Shows fungible tokens (USDC, BONK, etc.)
// NFTs Tab: Shows NFTs and compressed NFTs
// Rent Estimate: Shows potential SOL returns
```

### Transferring cNFTs
```javascript
// User clicks transfer button
// Modal opens with transfer options
// Server processes transfer with proof verification
// Transaction submitted to blockchain
```

## Security Considerations

1. **Private Key Management**: Never store private keys client-side
2. **API Key Protection**: Server-side API key usage only
3. **Transaction Verification**: All transactions verified before submission
4. **Rate Limiting**: Prevents API abuse and DoS attacks

## Troubleshooting

### Common Issues
1. **NFTs in Tokens Tab**: Check filtering logic in `TokensTab.tsx`
2. **Transfer Failures**: Verify proof data and wallet connection
3. **API Errors**: Check rate limiting and API key validity
4. **Wallet Connection**: Ensure wallet extension is installed

### Debug Tools
- Browser console logs with detailed categorization
- Server logs for API calls and errors
- Network tab for API request/response inspection

This application provides a comprehensive solution for Solana asset management with robust error handling, efficient caching, and a user-friendly interface.