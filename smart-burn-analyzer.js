/**
 * Smart Burn Analyzer
 * 
 * Provides AI-powered recommendations for which assets to burn for maximum SOL recovery.
 * Analyzes wallet contents and identifies optimal burning strategies.
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

/**
 * Analyze wallet assets and provide burn recommendations
 * @param {Connection} connection - Solana connection
 * @param {string} walletAddress - User's wallet address
 * @param {Array} nfts - Array of NFTs in wallet
 * @param {Array} tokens - Array of tokens in wallet
 * @param {Array} cnfts - Array of compressed NFTs
 * @returns {Promise<object>} - Burn recommendations
 */
async function analyzeWalletForBurns(connection, walletAddress, nfts = [], tokens = [], cnfts = []) {
    const recommendations = {
        highPriority: [],
        mediumPriority: [],
        lowPriority: [],
        doNotBurn: [],
        summary: {},
        potentialRecovery: 0
    };

    // Analyze NFTs
    for (const nft of nfts) {
        const analysis = await analyzeNFT(connection, nft);
        categorizeAsset(analysis, recommendations);
    }

    // Analyze Tokens
    for (const token of tokens) {
        const analysis = await analyzeToken(connection, token);
        categorizeAsset(analysis, recommendations);
    }

    // Analyze cNFTs (compressed NFTs don't return rent but can clean wallet)
    for (const cnft of cnfts) {
        const analysis = analyzeCNFT(cnft);
        categorizeAsset(analysis, recommendations);
    }

    // Calculate summary statistics
    recommendations.summary = calculateSummary(recommendations);
    recommendations.potentialRecovery = calculateTotalRecovery(recommendations);

    return recommendations;
}

/**
 * Analyze an individual NFT for burn recommendation
 */
async function analyzeNFT(connection, nft) {
    const baseRent = 0.002; // Base SOL recovery
    let score = 0;
    let reasons = [];
    let warnings = [];
    
    // Check collection value
    const isKnownCollection = checkKnownCollection(nft.collectionKey);
    if (isKnownCollection) {
        score -= 100;
        warnings.push('Part of known valuable collection');
    }

    // Check marketplace activity
    const hasMarketActivity = await checkMarketActivity(nft.mint);
    if (hasMarketActivity) {
        score -= 50;
        warnings.push('Has recent market activity');
    }

    // Check for verified creators
    if (nft.creators && nft.creators.some(c => c.verified)) {
        score -= 20;
        warnings.push('Has verified creators');
    }

    // Positive burn indicators
    if (!nft.name || nft.name.toLowerCase().includes('spam')) {
        score += 50;
        reasons.push('Likely spam NFT');
    }

    if (nft.name && (nft.name.includes('airdrop') || nft.name.includes('gift'))) {
        score += 30;
        reasons.push('Airdrop/gift NFT with no value');
    }

    // Check metadata quality
    if (!nft.image || nft.image.includes('placeholder')) {
        score += 40;
        reasons.push('Missing or placeholder image');
    }

    // Calculate potential extra recovery with resizing
    const resizePotential = estimateResizePotential(nft);
    const totalRecovery = baseRent + resizePotential;

    return {
        type: 'nft',
        mint: nft.mint,
        name: nft.name || 'Unknown NFT',
        score,
        reasons,
        warnings,
        rentRecovery: baseRent,
        resizePotential,
        totalRecovery,
        recommendation: getRecommendation(score, warnings.length > 0)
    };
}

/**
 * Analyze a token for burn recommendation
 */
async function analyzeToken(connection, token) {
    const baseRent = 0.00203928; // Token account rent
    let score = 0;
    let reasons = [];
    let warnings = [];

    // Check token value
    const tokenValue = token.usdValue || 0;
    const rentValueRatio = baseRent * 30 / (tokenValue || 0.001); // Assuming SOL at $30

    if (tokenValue < 0.01) {
        score += 80;
        reasons.push(`Dust token (value: $${tokenValue.toFixed(4)})`);
    } else if (rentValueRatio > 0.5) {
        score += 60;
        reasons.push(`Rent recovery exceeds 50% of token value`);
    } else if (tokenValue > 1) {
        score -= 100;
        warnings.push(`Token has significant value: $${tokenValue.toFixed(2)}`);
    }

    // Check for known tokens
    if (isKnownValuableToken(token.mint)) {
        score -= 100;
        warnings.push('Known valuable token');
    }

    // Check last activity
    const daysSinceActivity = token.lastActivity ? 
        (Date.now() - new Date(token.lastActivity).getTime()) / (1000 * 60 * 60 * 24) : 365;
    
    if (daysSinceActivity > 180) {
        score += 20;
        reasons.push('No activity for 6+ months');
    }

    return {
        type: 'token',
        mint: token.mint,
        name: token.name || token.symbol || 'Unknown Token',
        amount: token.amount,
        decimals: token.decimals,
        usdValue: tokenValue,
        score,
        reasons,
        warnings,
        rentRecovery: baseRent,
        totalRecovery: baseRent,
        recommendation: getRecommendation(score, warnings.length > 0)
    };
}

/**
 * Analyze a compressed NFT
 */
function analyzeCNFT(cnft) {
    let score = 0;
    let reasons = [];
    let warnings = [];

    // cNFTs don't return rent, but clearing them can improve wallet UX
    if (cnft.name && (cnft.name.toLowerCase().includes('spam') || 
                      cnft.name.toLowerCase().includes('airdrop') ||
                      cnft.name.toLowerCase().includes('gift'))) {
        score += 70;
        reasons.push('Likely spam/airdrop cNFT');
    }

    if (!cnft.image || cnft.image.includes('placeholder')) {
        score += 50;
        reasons.push('Missing or placeholder image');
    }

    // Check for suspicious patterns
    if (cnft.creators && cnft.creators.length === 0) {
        score += 30;
        reasons.push('No creators listed');
    }

    return {
        type: 'cnft',
        mint: cnft.mint,
        name: cnft.name || 'Unknown cNFT',
        score,
        reasons,
        warnings,
        rentRecovery: 0, // cNFTs don't return rent
        totalRecovery: 0,
        recommendation: score > 50 ? 'burn' : 'keep'
    };
}

/**
 * Categorize asset based on analysis
 */
function categorizeAsset(analysis, recommendations) {
    if (analysis.warnings.length > 0 && analysis.score < 0) {
        recommendations.doNotBurn.push(analysis);
    } else if (analysis.score >= 60) {
        recommendations.highPriority.push(analysis);
    } else if (analysis.score >= 30) {
        recommendations.mediumPriority.push(analysis);
    } else {
        recommendations.lowPriority.push(analysis);
    }
}

/**
 * Get recommendation based on score
 */
function getRecommendation(score, hasWarnings) {
    if (hasWarnings && score < 0) return 'do-not-burn';
    if (score >= 60) return 'highly-recommended';
    if (score >= 30) return 'recommended';
    if (score >= 0) return 'optional';
    return 'not-recommended';
}

/**
 * Check if NFT is part of known valuable collection
 */
function checkKnownCollection(collectionKey) {
    const valuableCollections = [
        'DRiP', 'DeGods', 'SMB', 'Okay Bears', 'Solana Monkey Business',
        'Aurory', 'Degenerate Ape Academy', 'Cets on Creck'
    ];
    
    return collectionKey && valuableCollections.some(c => 
        collectionKey.toLowerCase().includes(c.toLowerCase())
    );
}

/**
 * Check if token is known to be valuable
 */
function isKnownValuableToken(mint) {
    const valuableTokens = [
        'So11111111111111111111111111111111111111112', // SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
        'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
        'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
    ];
    
    return valuableTokens.includes(mint);
}

/**
 * Estimate resize potential for NFT
 */
function estimateResizePotential(nft) {
    // Conservative estimate - actual resizing would need to check metadata account
    if (nft.edition === 'MasterEdition') {
        return 0.0005; // Could be up to 0.0023 SOL
    }
    return 0.0003; // Regular edition potential
}

/**
 * Check market activity (simplified - would need actual API)
 */
async function checkMarketActivity(mint) {
    // In production, this would check Magic Eden, Tensor, etc.
    // For now, return false to avoid false positives
    return false;
}

/**
 * Calculate summary statistics
 */
function calculateSummary(recommendations) {
    return {
        totalAssets: recommendations.highPriority.length + 
                    recommendations.mediumPriority.length + 
                    recommendations.lowPriority.length +
                    recommendations.doNotBurn.length,
        burnRecommended: recommendations.highPriority.length + recommendations.mediumPriority.length,
        highPriorityCount: recommendations.highPriority.length,
        warningCount: recommendations.doNotBurn.length,
        estimatedTime: Math.ceil((recommendations.highPriority.length + recommendations.mediumPriority.length) / 10) * 2
    };
}

/**
 * Calculate total potential recovery
 */
function calculateTotalRecovery(recommendations) {
    let total = 0;
    
    [...recommendations.highPriority, ...recommendations.mediumPriority].forEach(asset => {
        total += asset.totalRecovery || 0;
    });
    
    return total;
}

module.exports = {
    analyzeWalletForBurns,
    analyzeNFT,
    analyzeToken,
    analyzeCNFT
};