/**
 * Resize Detection API
 * 
 * Provides endpoints to check if NFTs have been resized and calculate
 * the total recoverable amount including metadata optimization savings.
 */

const { Connection, PublicKey } = require('@solana/web3.js');

/**
 * Check multiple NFTs for resize status and calculate total recovery potential
 * @param {Array} mintAddresses - Array of NFT mint addresses
 * @returns {Promise<object>} - Comprehensive resize and recovery data
 */
async function checkMultipleNFTsResizeStatus(mintAddresses) {
    const connection = new Connection(process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com');
    const { checkResizeStatus, calculateResizePotential } = require('./nft-resize-handler');
    
    const results = [];
    let totalPotentialRecovery = 0;
    let totalResizedRecovery = 0;
    let resizedCount = 0;
    let resizableCount = 0;
    
    for (const mintAddress of mintAddresses) {
        try {
            // Check current resize status
            const resizeStatus = await checkResizeStatus(connection, mintAddress);
            
            // Check potential for resizing (if not already resized)
            const resizePotential = await calculateResizePotential(connection, mintAddress);
            
            // Calculate total recovery including token account rent
            const tokenAccounts = await connection.getTokenAccountsByMint(new PublicKey(mintAddress));
            let tokenAccountRent = 0;
            
            if (tokenAccounts.value.length > 0) {
                const accountInfo = tokenAccounts.value[0].account;
                const minimumBalance = await connection.getMinimumBalanceForRentExemption(accountInfo.data.length);
                tokenAccountRent = minimumBalance / 1e9;
            }
            
            let totalRecovery = tokenAccountRent;
            let status = 'base_rent_only';
            
            if (resizeStatus.isResized) {
                // NFT was already resized - include estimated metadata recovery
                totalRecovery += resizeStatus.additionalRecovery;
                totalResizedRecovery += resizeStatus.additionalRecovery;
                resizedCount++;
                status = 'resized_enhanced_recovery';
            } else if (resizePotential.eligible) {
                // NFT can be resized - show potential
                totalRecovery += resizePotential.excessSOL;
                resizableCount++;
                status = 'can_be_resized';
            }
            
            totalPotentialRecovery += totalRecovery;
            
            results.push({
                mint: mintAddress,
                tokenAccountRent: tokenAccountRent.toFixed(6),
                resizeStatus: resizeStatus,
                resizePotential: resizePotential,
                totalRecovery: totalRecovery.toFixed(6),
                status,
                recommendation: getRecommendation(resizeStatus, resizePotential)
            });
            
        } catch (error) {
            console.error(`Error checking NFT ${mintAddress}:`, error);
            results.push({
                mint: mintAddress,
                error: error.message,
                status: 'error'
            });
        }
    }
    
    return {
        success: true,
        totalNFTs: mintAddresses.length,
        resizedCount,
        resizableCount,
        summary: {
            totalPotentialRecovery: totalPotentialRecovery.toFixed(6),
            totalResizedRecovery: totalResizedRecovery.toFixed(6),
            averageRecovery: (totalPotentialRecovery / mintAddresses.length).toFixed(6)
        },
        nfts: results
    };
}

/**
 * Get recommendation based on NFT resize status
 */
function getRecommendation(resizeStatus, resizePotential) {
    if (resizeStatus.isResized) {
        return 'Ready to burn - will receive enhanced recovery including metadata optimization savings';
    } else if (resizePotential.eligible) {
        return `Resize first to save ${resizePotential.excessSOL.toFixed(6)} SOL, then burn for maximum recovery`;
    } else {
        return 'Burn when ready - base rent recovery available';
    }
}

module.exports = {
    checkMultipleNFTsResizeStatus
};