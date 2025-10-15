# Solburnt - Solana Asset Management Application

## Overview
Solburnt is a sophisticated web application designed for managing Solana blockchain assets. It offers advanced tools for debugging, transaction analysis, and interactive management of crypto assets, including both regular and compressed NFTs (cNFTs). The application enables users to burn, transfer, and estimate rent returns from token accounts, aiming to maximize SOL recovery from dormant or unwanted assets.

## Recent Changes
- **October 15, 2025**: Fixed production deployment configuration - server now listens on port 5000 (deployment forwards to external port 80), added `/health` endpoint for monitoring, enhanced startup logging, and 4-minute initialization timeout handler.
- **October 15, 2025**: Enhanced vacant account burning with batch processing (up to 25 accounts per transaction, increased from 3) and smart UI refresh. Replaced page reload with data refresh to automatically hide "Instant Recovery" button after successful burn.
- **October 12, 2025**: Fixed vacant account burn success notifications and activity logging. Added `BurnAnimations.showNotification()` popup and 2-second delay before page reload to ensure activity log entries are visible to users.
- **October 12, 2025**: Removed ALL bulk burn functionality from UI in favor of individual burn buttons for simpler, more reliable user experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript.
- **Build System**: Webpack for compilation.
- **Wallet Integration**: Solana wallet adapter for multiple wallet support.
- **State Management**: React hooks and context providers.
- **UI/UX**: Custom React components, animated designs for key actions (e.g., "RECOVER SOL NOW!"), and a streamlined interface focusing on core burning functionality. The design emphasizes clear selection indicators and a clean user experience.
- **Color Scheme**: Uses orange/red gradients and glow effects for prominent interactive elements.

### Backend
- **Primary Server**: Fastify-based Node.js server with comprehensive API endpoints.
- **Alternative Servers**: Express.js for simplified deployment.
- **Transfer Processing**: Modules for direct, delegated, and queued transfer methods.
- **Rate Limiting**: Token bucket algorithm.
- **Caching**: Memory-based asset and proof data caching with expiration.

### Data Storage
- **Primary**: Memory-based caching for asset data and metadata.
- **Fallback**: Local token metadata store.
- **Queue Management**: In-memory storage for transfer operations (production-ready version would use a database).

### Core Features and Technical Implementations
- **Asset Management**: Supports regular NFTs, Metaplex Bubblegum cNFTs (view-only mode for user safety), and SPL Tokens. Calculates rent returns from token accounts.
- **Transfer System**: Includes browser-based direct transfers, server-side processing for cNFTs, and a queue system for batch operations to prevent Merkle tree conflicts. Supports authority delegation for server-managed transfers.
- **cNFT Handling**: Integrates with Metaplex Bubblegum and Helius API for proof retrieval. Operates in simulation/view-only mode due to API compatibility, preventing direct burning attempts.
- **Rent Calculation**: Accurate rent estimation based on actual on-chain data, including metadata accounts. Automatically accounts for a 3% fee charged to the project wallet `EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK` for NFT and vacant account burns.
- **Enhanced NFT Burning**: Utilizes Metaplex `burnNft` instruction to close all associated accounts (token, metadata, edition) for enhanced rent recovery.
- **Vacant Account Burning**: Allows recovery of SOL from vacant accounts with no fees, ensuring guaranteed success. Processes up to 25 vacant accounts per transaction with smart UI refresh that auto-hides the recovery button after burn.
- **Deployment**: Configured for production deployment with port 5000 (forwarded to external port 80), health check endpoint at `/health`, comprehensive startup logging, and 4-minute initialization timeout. Replit configured for multi-language support (Rust, Python, Node.js) with Webpack for builds. Production considerations include security, monitoring, scalability (database integration), and compliance.

## External Dependencies

### APIs
- **Helius API**: Primary data source for NFTs, cNFTs, and asset proofs.
- **QuickNode RPC**: Solana blockchain interaction and transaction submission.
- **Solscan API**: Optional for additional metadata and blockchain data.

### Solana Programs
- **Metaplex Bubblegum**: For compressed NFT operations.
- **SPL Token Program**: For standard token operations.
- **SPL Account Compression**: For Merkle tree operations.

### Node.js Libraries
- **@solana/web3.js**: Core Solana blockchain interaction.
- **@metaplex-foundation/mpl-bubblegum**: For cNFT operations.
- **Fastify/Express**: Web server frameworks.
- **React**: Frontend framework with TypeScript support.