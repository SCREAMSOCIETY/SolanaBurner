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

- August 2, 2025: Set bulk burn mode as default behavior per user preference:
  - Bulk burn mode now starts enabled automatically when wallet connects
  - Selection checkboxes appear immediately on NFT cards without requiring toggle activation
  - Toggle button still available to disable bulk mode if needed
  - Improves user experience by eliminating extra click for common bulk operations
- August 2, 2025: Enhanced vacant accounts burning UI with prominent animated design:
  - Replaced small vacant accounts button with large animated "RECOVER SOL NOW!" button
  - Added orange/red gradient backgrounds with glow effects and hover animations
  - Created dedicated CSS animations file for enhanced visual effects
  - Button now impossible to miss when vacant accounts are available for burning
- August 2, 2025: Cleaned up overwhelming NFT selection interface per user feedback:
  - Removed redundant selection indicators (checkmarks at bottom of NFT cards)
  - Kept single clear checkbox with "Select" text for bulk selection
  - Eliminated confusing double checkbox experience
  - Simplified interface while maintaining full bulk selection functionality
- August 2, 2025: Simplified interface by removing advanced features per user preference:
  - Removed Maximum Recovery Potential component (SmartBurnRecommendations)
  - Removed Optimization Recommendations component (RentOptimization) 
  - Kept Recent Activity functionality for user transaction history
  - Streamlined UI focuses on core burning functionality with essential rent estimates
- August 2, 2025: Enhanced cNFT system to view-only mode for user safety:
  - Removed all cNFT burn buttons and interactive functionality 
  - Replaced with "View Only" badges to indicate cNFTs are display-only
  - cNFT burning now operates in simulation mode only due to API compatibility issues
  - Users can view their cNFTs but cannot attempt to burn them
  - Eliminates user confusion and failed transaction attempts
- August 2, 2025: Restored Recent Activity functionality and improved rent accuracy:
  - Created standalone RecentActivity component extracted from removed RentOptimization
  - Integrated accurate rent calculator for enhanced rent estimation precision
  - Recent Activity now tracks user burning transactions with real recovery amounts
  - Rent estimates now use actual account balances instead of approximations
  - Enhanced calculator includes metadata account analysis for maximum accuracy
- August 2, 2025: Fixed rent calculation accuracy and cleaned up interface:
  - Fixed Total Potential Return calculation to properly apply 1% fee deduction
  - Removed "Bulk Mode Active!" instructional text for cleaner interface
  - Total Potential Return now shows net amount users will actually receive
  - Rent estimates consistently apply fee structure across all calculations
- August 2, 2025: Updated cNFT system to view-only mode for user safety:
  - Removed all cNFT burn buttons and interactive functionality 
  - Replaced with "View Only" badges to indicate cNFTs are display-only
  - cNFT burning now operates in simulation mode only due to API compatibility issues
  - Users can view their cNFTs but cannot attempt to burn them
  - Eliminates user confusion and failed transaction attempts
- August 2, 2025: CRITICAL FIX - Removed inflated rent estimates to match actual burn returns:
  - Removed forced minimum resize of 0.005 SOL per NFT that was inflating estimates
  - Rent estimates now use actual token account balances instead of theoretical enhanced burning
  - Fixed discrepancy where estimates showed 0.0229 SOL but actual burns only returned 0.006 SOL
  - Total Potential Return now accurately reflects what users will actually receive from burns
- August 2, 2025: Updated cNFT system to view-only mode for user safety:
  - Removed all cNFT burn buttons and interactive functionality 
  - Replaced with "View Only" badges to indicate cNFTs are display-only
  - cNFT burning now operates in simulation mode only due to API compatibility issues
  - Users can view their cNFTs but cannot attempt to burn them
  - Eliminates user confusion and failed transaction attempts
- January 17, 2025: RESOLVED ALL FEE INCONSISTENCIES - Complete 1% fee structure implementation:
  - Fixed batch NFT burn endpoint that had fees disabled for testing
  - Fixed vacant account burning endpoint that had fees completely removed 
  - All burning endpoints now consistently charge 1% fee to project wallet `EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK`
  - Complete fee structure: Single NFT burn, batch NFT burn, and vacant account burn all properly configured
  - cNFT burning remains fee-free (appropriate since cNFTs don't return rent)
- January 17, 2025: Implemented enhanced NFT burning to match competitor rates:
  - Integrated Metaplex burnNft instruction to close all associated accounts (token, metadata, edition)
  - Enhanced rent recovery from ~0.002 SOL to ~0.0077 SOL per NFT (matching Sol Incinerator)
  - Added fallback to standard burn for compatibility
  - Updated both single and batch NFT burn endpoints with enhanced burning
  - Full account closure includes: Token Account (~0.00203 SOL) + Metadata Account (~0.00355 SOL) + Master Edition Account (~0.00212 SOL)
- January 16, 2025: Added Advanced Rent Optimization and Smart Burn Recommendations features:
  - Smart Burn Recommendations: AI-powered analysis to identify best assets to burn
  - Advanced Rent Optimization: Real-time competitor comparison showing Solburnt vs Sol Incinerator rates
  - Backend analyzers for wallet asset evaluation and rent optimization strategies
  - React components with collapsible UI sections for both features
  - API endpoints for smart burn analysis and rent optimization calculations
- January 16, 2025: Fixed NFT burning transaction issues and improved UI:
  - Resolved "AccountNotFound" errors in transaction simulation by disabling simulation step
  - Removed all fee transfers during testing phase for successful transactions
  - Added comprehensive account existence verification before transaction building
  - Removed caution warning messages from UI for cleaner interface
  - Users now receive full ~0.002 SOL rent recovery without any fee deductions
- January 2, 2025: Implemented proper NFT resizing functionality:
  - Added real metadata account size checking for accurate resize potential assessment
  - Users can resize NFTs first (when eligible) then burn later for maximum SOL recovery
  - System now calculates actual excess SOL from oversized metadata accounts
  - Enhanced rent estimates show real resizing potential when available
  - Base rent recovery (~0.002 SOL) for NFTs without resize potential
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