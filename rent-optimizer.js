/**
 * Advanced Rent Optimizer
 * 
 * Provides advanced rent optimization strategies including:
 * - Real-time competitor comparison
 * - Metadata resizing calculations
 * - Auxiliary account detection
 * - Optimal burn ordering
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// Competitor rates for comparison
const COMPETITOR_RATES = {
    'Sol Incinerator': {
        nft: 0.0077,
        token: 0.00203928,
        url: 'https://sol-incinerator.com'
    },
    'Burn Portal': {
        nft: 0.0065,
        token: 0.00203928,
        url: 'https://burnportal.sol'
    }
};

/**
 * Compare Solburnt rates with competitors
 * @param {object} assets - User's assets
 * @returns {object} - Comparison data
 */
function compareWithCompetitors(assets) {
    const solburntRates = {
        nft: 0.002, // Current base rate (token account only)
        nftWithResize: 0.0025, // With metadata optimization
        nftEnhanced: 0.0077, // With full account burning (matches Sol Incinerator)
        token: 0.00203928
    };

    const comparison = {
        solburnt: {
            name: 'Solburnt',
            total: 0,
            breakdown: {}
        },
        competitors: {}
    };

    // Calculate Solburnt recovery with enhanced burning
    if (assets.nfts) {
        // Use enhanced rate once implemented
        const nftRecovery = assets.nfts.length * solburntRates.nftEnhanced;
        comparison.solburnt.breakdown.nfts = nftRecovery;
        comparison.solburnt.total += nftRecovery;
    }

    if (assets.tokens) {
        const tokenRecovery = assets.tokens.length * solburntRates.token;
        comparison.solburnt.breakdown.tokens = tokenRecovery;
        comparison.solburnt.total += tokenRecovery;
    }

    // Calculate competitor recovery
    Object.entries(COMPETITOR_RATES).forEach(([name, rates]) => {
        const competitorTotal = 
            (assets.nfts ? assets.nfts.length * rates.nft : 0) +
            (assets.tokens ? assets.tokens.length * rates.token : 0);

        comparison.competitors[name] = {
            name,
            total: competitorTotal,
            difference: comparison.solburnt.total - competitorTotal,
            percentageDiff: ((comparison.solburnt.total - competitorTotal) / competitorTotal * 100).toFixed(1)
        };
    });

    // Find best competitor
    comparison.bestCompetitor = Object.values(comparison.competitors)
        .reduce((best, current) => current.total > best.total ? current : best);

    comparison.solburntAdvantage = comparison.solburnt.total > comparison.bestCompetitor.total;

    return comparison;
}

/**
 * Calculate optimal burn order for maximum efficiency
 * @param {Array} assets - All assets to burn
 * @returns {Array} - Ordered assets for burning
 */
function calculateOptimalBurnOrder(assets) {
    // Sort by:
    // 1. Asset type (NFTs first for resizing, then tokens)
    // 2. Recovery amount (highest first)
    // 3. Batch compatibility (group similar operations)
    
    const nfts = assets.filter(a => a.type === 'nft');
    const tokens = assets.filter(a => a.type === 'token');
    const cnfts = assets.filter(a => a.type === 'cnft');

    // Sort each category by recovery amount
    nfts.sort((a, b) => (b.totalRecovery || 0) - (a.totalRecovery || 0));
    tokens.sort((a, b) => (b.rentRecovery || 0) - (a.rentRecovery || 0));

    // Return optimal order: NFTs (for resize), tokens, then cNFTs
    return [...nfts, ...tokens, ...cnfts];
}

/**
 * Detect auxiliary accounts that can be closed for extra SOL
 * @param {Connection} connection - Solana connection
 * @param {string} walletAddress - User's wallet
 * @param {Array} nfts - User's NFTs
 * @returns {Promise<object>} - Auxiliary accounts data
 */
async function detectAuxiliaryAccounts(connection, walletAddress, nfts) {
    const auxiliaryAccounts = [];
    let totalExtraRecovery = 0;

    for (const nft of nfts) {
        try {
            // Check for metadata account
            const metadataPDA = await findMetadataPda(nft.mint);
            const metadataAccount = await connection.getAccountInfo(metadataPDA);
            
            if (metadataAccount) {
                const rentRecovery = metadataAccount.lamports / 1e9;
                auxiliaryAccounts.push({
                    type: 'metadata',
                    address: metadataPDA.toString(),
                    nftMint: nft.mint,
                    rentRecovery,
                    description: 'NFT Metadata Account'
                });
                totalExtraRecovery += rentRecovery;
            }

            // Check for edition account
            const editionPDA = await findEditionPda(nft.mint);
            const editionAccount = await connection.getAccountInfo(editionPDA);
            
            if (editionAccount) {
                const rentRecovery = editionAccount.lamports / 1e9;
                auxiliaryAccounts.push({
                    type: 'edition',
                    address: editionPDA.toString(),
                    nftMint: nft.mint,
                    rentRecovery,
                    description: 'NFT Edition Account'
                });
                totalExtraRecovery += rentRecovery;
            }
        } catch (error) {
            console.log(`Error checking auxiliary accounts for ${nft.mint}:`, error.message);
        }
    }

    return {
        accounts: auxiliaryAccounts,
        totalExtraRecovery,
        count: auxiliaryAccounts.length
    };
}

/**
 * Calculate maximum possible rent recovery with all optimizations
 * @param {object} assets - User's assets
 * @param {object} auxiliaryAccounts - Detected auxiliary accounts
 * @returns {object} - Maximum recovery calculation
 */
function calculateMaximumRecovery(assets, auxiliaryAccounts) {
    const recovery = {
        base: {
            nfts: 0,
            tokens: 0,
            total: 0
        },
        optimized: {
            nftResize: 0,
            auxiliaryAccounts: 0,
            total: 0
        },
        maximum: 0,
        improvementPercentage: 0
    };

    // Base recovery (current Solburnt rates)
    if (assets.nfts) {
        recovery.base.nfts = assets.nfts.length * 0.002;
    }
    if (assets.tokens) {
        recovery.base.tokens = assets.tokens.length * 0.00203928;
    }
    recovery.base.total = recovery.base.nfts + recovery.base.tokens;

    // Optimized recovery
    if (assets.nfts) {
        // Estimate resize potential (conservative)
        recovery.optimized.nftResize = assets.nfts.length * 0.0005;
    }
    if (auxiliaryAccounts) {
        recovery.optimized.auxiliaryAccounts = auxiliaryAccounts.totalExtraRecovery || 0;
    }
    recovery.optimized.total = recovery.optimized.nftResize + recovery.optimized.auxiliaryAccounts;

    // Maximum possible recovery
    recovery.maximum = recovery.base.total + recovery.optimized.total;
    recovery.improvementPercentage = recovery.base.total > 0 
        ? ((recovery.maximum - recovery.base.total) / recovery.base.total * 100).toFixed(1)
        : 0;

    return recovery;
}

/**
 * Generate optimization report
 * @param {object} comparison - Competitor comparison
 * @param {object} maxRecovery - Maximum recovery data
 * @param {object} burnOrder - Optimal burn order
 * @returns {object} - Complete optimization report
 */
function generateOptimizationReport(comparison, maxRecovery, burnOrder) {
    return {
        competitorAnalysis: comparison,
        recoveryPotential: maxRecovery,
        optimalStrategy: {
            burnOrder: burnOrder.slice(0, 10), // First 10 for preview
            totalAssets: burnOrder.length,
            estimatedTime: Math.ceil(burnOrder.length / 10) * 2, // 2 min per batch
            batches: Math.ceil(burnOrder.length / 10)
        },
        recommendations: generateRecommendations(comparison, maxRecovery)
    };
}

/**
 * Generate specific recommendations
 */
function generateRecommendations(comparison, maxRecovery) {
    const recommendations = [];

    if (!comparison.solburntAdvantage) {
        recommendations.push({
            priority: 'high',
            action: 'Enable metadata resizing',
            impact: `+${maxRecovery.optimized.nftResize.toFixed(4)} SOL`,
            description: 'Resize NFT metadata before burning for maximum recovery'
        });
    }

    if (maxRecovery.optimized.auxiliaryAccounts > 0) {
        recommendations.push({
            priority: 'medium',
            action: 'Close auxiliary accounts',
            impact: `+${maxRecovery.optimized.auxiliaryAccounts.toFixed(4)} SOL`,
            description: 'Additional accounts found that can be closed'
        });
    }

    if (maxRecovery.improvementPercentage > 10) {
        recommendations.push({
            priority: 'high',
            action: 'Use optimization features',
            impact: `+${maxRecovery.improvementPercentage}% more SOL`,
            description: 'Enable all optimization features for maximum recovery'
        });
    }

    return recommendations;
}

/**
 * Helper function to find metadata PDA
 */
async function findMetadataPda(mint) {
    const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const mintPubkey = new PublicKey(mint);
    
    const [metadataPDA] = await PublicKey.findProgramAddress(
        [
            Buffer.from('metadata'),
            METADATA_PROGRAM_ID.toBuffer(),
            mintPubkey.toBuffer(),
        ],
        METADATA_PROGRAM_ID
    );
    
    return metadataPDA;
}

/**
 * Helper function to find edition PDA
 */
async function findEditionPda(mint) {
    const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const mintPubkey = new PublicKey(mint);
    
    const [editionPDA] = await PublicKey.findProgramAddress(
        [
            Buffer.from('metadata'),
            METADATA_PROGRAM_ID.toBuffer(),
            mintPubkey.toBuffer(),
            Buffer.from('edition'),
        ],
        METADATA_PROGRAM_ID
    );
    
    return editionPDA;
}

module.exports = {
    compareWithCompetitors,
    calculateOptimalBurnOrder,
    detectAuxiliaryAccounts,
    calculateMaximumRecovery,
    generateOptimizationReport
};