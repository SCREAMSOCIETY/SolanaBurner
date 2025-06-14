# SolBurn - Solana Asset Management Application

## Overview

SolBurn is a sophisticated Solana blockchain asset management web application that provides advanced debugging, transaction analysis, and interactive crypto asset management tools. The application specializes in NFT and token management, including support for both regular NFTs and compressed NFTs (cNFTs), with features for burning, transferring, and estimating rent returns from token accounts.

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

- June 14, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.