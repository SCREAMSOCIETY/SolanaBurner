# Overview

SolBurn is a Solana blockchain application that enables users to burn (permanently destroy) or transfer tokens and NFTs from their wallets. The application supports regular SPL tokens, standard NFTs, and compressed NFTs (cNFTs). Built with a React frontend and Node.js/Express backend, it integrates with Solana wallets and uses the Helius API for blockchain data retrieval.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Technology Stack**: React 19 with TypeScript, bundled using Webpack with Babel transpilation.

**Component Structure**: The main application (`App.tsx`) manages wallet connections and asset display. Components are organized into functional modules for wallet integration (`WalletProvider.tsx`), asset handling (various transfer handlers), and UI elements (modals, animations).

**Wallet Integration**: Uses Solana Wallet Adapter libraries to support multiple wallet providers (Phantom, Solflare, etc.). Wallet state is managed through React context providers.

**Asset Management**: Implements separate handlers for different asset types:
- Regular SPL tokens
- Standard NFTs  
- Compressed NFTs (cNFTs) with special Merkle tree proof handling

**Build System**: Webpack configured with multiple entry points for modular code splitting. Uses polyfills for Node.js modules (crypto, buffer, stream) to enable browser compatibility.

## Backend Architecture

**Server Framework**: Uses both Express and Fastify for HTTP routing. Primary server runs on Fastify with Express as fallback.

**Asset Data Pipeline**: 
- Helius API integration for fetching NFT/token metadata
- Rate limiting with token bucket algorithm to avoid API throttling
- In-memory caching for asset data and Merkle proofs
- Fallback token metadata store for common tokens

**Transaction Processing**:
- Server-side transaction preparation for cNFT transfers
- Signature verification for delegated operations
- Queue-based sequential processing for batch operations to avoid Merkle proof conflicts

**cNFT Handling**: Implements simulation mode by default since regular users cannot burn cNFTs without tree authority. Provides infrastructure for real burning when tree authority credentials are available.

## Data Storage Solutions

**In-Memory Storage**: Uses JavaScript Maps for caching:
- Asset metadata (5-minute expiration)
- Merkle proofs (20-second expiration)  
- Wallet data (1-minute expiration)

**Session Storage**: Transfer queue and batch operations stored in memory with Set/Map structures.

**Database**: Drizzle ORM configured with Neon Postgres (serverless) for persistent data storage. Schema defined in `shared/schema` (not shown in files but imported).

## Authentication & Authorization

**Wallet-Based Auth**: No traditional user accounts. Authentication happens through Solana wallet signatures.

**Message Signing**: Users sign specific messages to authorize operations:
- Burn requests require signed authorization
- cNFT transfers use delegated signing pattern
- Signature verification using nacl (TweetNaCl) library

**Tree Authority**: For cNFT operations, checks environment variables for tree authority credentials. Operates in simulation mode without proper authority.

## External Dependencies

**Blockchain Services**:
- **Solana Web3.js**: Core blockchain interaction library
- **QuickNode RPC**: Primary RPC endpoint (configurable via env)
- **Helius API**: NFT/cNFT metadata and proof retrieval
- **Solscan API**: Additional blockchain data (optional)

**Metaplex Foundation**:
- `@metaplex-foundation/mpl-bubblegum`: Compressed NFT program interfaces
- `@metaplex-foundation/js`: General Metaplex utilities
- SPL Account Compression: Merkle tree operations for cNFTs

**Development Tools**:
- Drizzle ORM with Neon Database driver for Postgres
- Bonfida SPL Name Service for .sol domain resolution
- Project Serum Anchor for program interaction

**Key Program IDs**:
- Bubblegum Program: `BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY`
- SPL Account Compression: `cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK`
- SPL Noop (logging): `noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV`

**Configuration Management**: Centralized in `config.js` with environment variable validation. Supports both development and production modes with appropriate fallbacks.

**Asset Transfer Destination**: All transfers default to project wallet `EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK`

## Deployment Configuration

**Platform**: Render.com (switched from Vercel due to 250 MB serverless function size limit)

**Why Render?**: Solana dependencies (~500+ MB) exceed Vercel's limits. Render supports full Node.js servers without size restrictions.

**Deployment Files**:
- `render.yaml`: Render service configuration with health checks, auto-deploy, and environment variables
- `RENDER_DEPLOYMENT.md`: Complete step-by-step deployment guide

**Environment Variables Required**:
- `HELIUS_API_KEY`: Helius API key for NFT/cNFT data
- `QUICKNODE_RPC_URL`: QuickNode RPC endpoint
- `SOLSCAN_API_KEY`: Solscan API key (optional)
- `NODE_ENV`: Set to "production" (auto-configured in render.yaml)
- `PORT`: Dynamically assigned by Render (typically 10000)

**Deployment Flow**:
1. Push to GitHub main branch
2. Render auto-detects changes
3. Runs: `npm install && npm run build`
4. Starts: `npm start` (fastifyServer.js on PORT)
5. Health check: `/health` endpoint confirms server running
6. Live at: `https://solburnt.onrender.com`

**Port Configuration**:
- Development (Replit): Port 5001
- Production (Render): Dynamic PORT from environment (usually 10000)
- Server binds to `0.0.0.0` to accept all connections

**Recent Deployment Updates (October 2025)**:
- Moved all build dependencies to `dependencies` (Render needs them during build)
- Configured health check endpoint at `/health`
- Removed hardcoded PORT from render.yaml (Render provides dynamically)
- Increased vacant account capacity from 3 to 25 per transaction
- Smart data refresh replaces full page reload after burns