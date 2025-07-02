# Solburnt - Solana Asset Management Application

## Overview

Solburnt is a sophisticated Solana blockchain asset management web application that provides advanced debugging, transaction analysis, and interactive crypto asset management tools. The application specializes in NFT and token management, including support for both regular NFTs and compressed NFTs (cNFTs), with features for burning, transferring, and estimating rent returns from token accounts.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build System**: Webpack with Babel for TypeScript/React compilation
- **Wallet Integration**: Solana wallet adapter supporting multiple wallets (Phantom, Solflare, etc.)
- **State Management**: React hooks with context providers for wallet connection
- **UI Components**: Custom React components for asset management interfaces

### Backend Architecture
- **Primary Server**: Fastify-based Node.js server with comprehensive API endpoints
- **Alternative Servers**: Express.js fallback servers for simplified deployment
- **Transfer Processing**: Specialized modules for different transfer methods (direct, delegated, queued)
- **Rate Limiting**: Token bucket algorithm for API request management
- **Caching**: Memory-based asset and proof data caching with expiration

### Data Storage Solutions
- **Primary**: Memory-based caching for asset data and metadata
- **Fallback**: Local token metadata store for common Solana tokens
- **Queue Management**: In-memory storage for transfer operations (production would use database)

## Key Components

### Asset Management
- **Regular NFTs**: Standard Solana NFTs with full burn/transfer capabilities
- **Compressed NFTs (cNFTs)**: Support for Metaplex Bubblegum compressed NFTs
- **SPL Tokens**: Token account management with rent estimation
- **Rent Calculation**: Automatic calculation of SOL returns from burning token accounts (~0.00204 SOL per account)

### Transfer System
- **Direct Transfer**: Browser-based transfers using wallet signatures
- **Server-side Transfer**: Backend processing to handle complex cNFT operations
- **Queue System**: Sequential processing for batch operations to avoid Merkle tree conflicts
- **Delegated Transfer**: Authority delegation for server-managed transfers

### cNFT Handling
- **Tree Authority System**: Support for custom Merkle trees with burning authority
- **Simulation Mode**: Fallback mode when tree authority is not available
- **Proof Management**: Helius API integration for Merkle proof retrieval
- **Multiple Transfer Methods**: Fallback mechanisms for different transfer scenarios

## Data Flow

1. **Wallet Connection**: User connects wallet via Solana wallet adapter
2. **Asset Loading**: Parallel fetching of regular NFTs, cNFTs, and tokens via Helius API
3. **Metadata Resolution**: Token metadata fetched with fallback to local store
4. **Transfer Processing**: 
   - Asset validation and proof retrieval
   - Transaction preparation (client or server-side)
   - Signature collection and transaction submission
   - Confirmation and result display

## External Dependencies

### Required APIs
- **Helius API**: Primary data source for NFTs, cNFTs, and asset proofs
- **QuickNode RPC**: Solana blockchain interaction and transaction submission
- **Solscan API**: Additional metadata and blockchain data (optional)

### Solana Program Dependencies
- **Metaplex Bubblegum**: Compressed NFT operations
- **SPL Token Program**: Standard token operations
- **SPL Account Compression**: Merkle tree operations

### Node.js Dependencies
- **@solana/web3.js**: Core Solana blockchain interaction
- **@metaplex-foundation/mpl-bubblegum**: cNFT operations
- **Fastify/Express**: Web server frameworks
- **React**: Frontend framework with TypeScript support

## Deployment Strategy

### Development Environment
- **Replit Configuration**: Multi-language support (Rust, Python, Node.js)
- **Build Process**: Webpack compilation with TypeScript/React support
- **Server Options**: Multiple server implementations for different environments
- **Environment Variables**: Centralized configuration management

### Production Considerations
- **Security**: Rate limiting, input validation, and API key protection needed
- **Monitoring**: Error tracking and performance monitoring required
- **Scalability**: Database integration for queue management and caching
- **Compliance**: Terms of service, privacy policy, and audit logging needed

### cNFT Tree Management
- **Custom Trees**: Scripts provided for creating custom Merkle trees
- **Authority Management**: Environment variable configuration for tree authority keys
- **Testing Tools**: CLI tools for minting and transferring test cNFTs

## Changelog

- January 2, 2025: Aligned rent estimates with actual recovery amounts:
  - Corrected estimates to show realistic base rent recovery (~0.002 SOL per NFT)
  - Removed misleading enhanced recovery calculations that couldn't be delivered
  - Fixed transaction processing to provide transparent, honest recovery amounts
  - Updated UI messaging to set proper user expectations
  - Note: NFT resizing functionality exists but requires individual assessment - not all NFTs are eligible
- June 22, 2025: Successfully rebranded application from SolBurn to Solburnt:
  - Updated site name and title throughout application
  - Integrated new Solburnt logos with pixelated fire icon design
  - Added logo to main header (150px) and wallet connection screen with slogan
  - Updated all documentation and metadata files
  - Applied pixel-perfect rendering for crisp logo display
- June 14, 2025: Initial setup
- June 14, 2025: Successfully resolved mobile Solflare vacant account burning compatibility issue and added user feedback improvements:
  - Fixed mobile touch event handling with explicit onTouchStart/onTouchEnd handlers
  - Simplified transaction structure to match working NFT/token burning pattern
  - Removed confirmation dialog that was disrupting mobile wallet flow
  - Added comprehensive success message with emojis and transaction details
  - Fixed button visibility to only show when vacant accounts exist
  - Improved rate limiting to resolve 503 errors during wallet switching
- June 16, 2025: Implemented accurate rent return estimates based on real on-chain data:
  - Updated rent calculation endpoint to fetch actual account balances instead of approximations
  - Added metadata account checking for NFTs to include all recoverable rent amounts
  - Implemented real-time balance fetching for tokens, NFTs, and vacant accounts
  - Added visual indicator showing estimates are based on actual on-chain balances
  - Enhanced success messages to display actual recovered amounts rather than estimates

## User Preferences

Preferred communication style: Simple, everyday language.