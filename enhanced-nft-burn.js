/**
 * Enhanced NFT Burn Handler
 * 
 * Burns NFTs completely including all associated accounts for maximum rent recovery:
 * - Token Account (~0.00203 SOL)
 * - Metadata Account (~0.00355 SOL)
 * - Master Edition Account (~0.00212 SOL)
 * Total: ~0.0077 SOL per NFT (matching Sol Incinerator)
 */

const { 
    Connection, 
    PublicKey, 
    Transaction,
    TransactionInstruction,
    SystemProgram
} = require('@solana/web3.js');
const { 
    TOKEN_PROGRAM_ID,
    createBurnCheckedInstruction,
    createCloseAccountInstruction,
    getAssociatedTokenAddress
} = require('@solana/spl-token');
const { 
    createBurnNftInstruction
} = require('@metaplex-foundation/mpl-token-metadata');

// Define the metadata program ID directly
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/**
 * Calculate all recoverable accounts for an NFT
 */
async function calculateNFTAccounts(connection, mint, owner) {
    const mintPubkey = new PublicKey(mint);
    const ownerPubkey = new PublicKey(owner);
    
    // Get token account
    const tokenAccount = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);
    
    // Get metadata PDA
    const [metadataPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('metadata'),
            METADATA_PROGRAM_ID.toBuffer(),
            mintPubkey.toBuffer(),
        ],
        METADATA_PROGRAM_ID
    );
    
    // Get master edition PDA
    const [masterEditionPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('metadata'),
            METADATA_PROGRAM_ID.toBuffer(),
            mintPubkey.toBuffer(),
            Buffer.from('edition'),
        ],
        METADATA_PROGRAM_ID
    );
    
    // Get token record PDA (for pNFTs)
    const [tokenRecordPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('metadata'),
            METADATA_PROGRAM_ID.toBuffer(),
            mintPubkey.toBuffer(),
            Buffer.from('token_record'),
            tokenAccount.toBuffer()
        ],
        METADATA_PROGRAM_ID
    );
    
    return {
        mint: mintPubkey,
        tokenAccount,
        metadataPda,
        masterEditionPda,
        tokenRecordPda
    };
}

/**
 * Calculate total rent recovery for all NFT accounts
 */
async function calculateTotalRentRecovery(connection, accounts) {
    let totalRent = 0;
    const rentBreakdown = {};
    
    // Check token account
    try {
        const tokenAccountInfo = await connection.getAccountInfo(accounts.tokenAccount);
        if (tokenAccountInfo) {
            rentBreakdown.tokenAccount = tokenAccountInfo.lamports / 1e9;
            totalRent += tokenAccountInfo.lamports;
        }
    } catch (e) {}
    
    // Check metadata account
    try {
        const metadataInfo = await connection.getAccountInfo(accounts.metadataPda);
        if (metadataInfo) {
            rentBreakdown.metadata = metadataInfo.lamports / 1e9;
            totalRent += metadataInfo.lamports;
        }
    } catch (e) {}
    
    // Check master edition account
    try {
        const editionInfo = await connection.getAccountInfo(accounts.masterEditionPda);
        if (editionInfo) {
            rentBreakdown.masterEdition = editionInfo.lamports / 1e9;
            totalRent += editionInfo.lamports;
        }
    } catch (e) {}
    
    // Check token record (for pNFTs)
    try {
        const tokenRecordInfo = await connection.getAccountInfo(accounts.tokenRecordPda);
        if (tokenRecordInfo) {
            rentBreakdown.tokenRecord = tokenRecordInfo.lamports / 1e9;
            totalRent += tokenRecordInfo.lamports;
        }
    } catch (e) {}
    
    return {
        totalRent: totalRent / 1e9,
        rentBreakdown,
        totalLamports: totalRent
    };
}

/**
 * Create enhanced burn instructions that recover all rent
 */
async function createEnhancedBurnInstructions(connection, mint, owner, collectionMint = null) {
    const accounts = await calculateNFTAccounts(connection, mint, owner);
    const ownerPubkey = new PublicKey(owner);
    
    const instructions = [];
    
    try {
        // 1. First burn the NFT using Metaplex instruction (this handles metadata + edition)
        const burnNftInstruction = createBurnNftInstruction({
            metadata: accounts.metadataPda,
            owner: ownerPubkey,
            mint: accounts.mint,
            tokenAccount: accounts.tokenAccount,
            masterEditionAccount: accounts.masterEditionPda,
            splTokenProgram: TOKEN_PROGRAM_ID,
            sysvarInstructions: new PublicKey('Sysvar1nstructions1111111111111111111111111')
        });
        
        instructions.push(burnNftInstruction);
        
        // 2. Close token account to recover rent (if not already closed by burn)
        const closeInstruction = createCloseAccountInstruction(
            accounts.tokenAccount,
            ownerPubkey,
            ownerPubkey
        );
        
        instructions.push(closeInstruction);
        
    } catch (error) {
        console.log('Using fallback burn method:', error.message);
        
        // Fallback: Traditional burn + close
        const burnInstruction = createBurnCheckedInstruction(
            accounts.tokenAccount,
            accounts.mint,
            ownerPubkey,
            1,
            0
        );
        
        const closeInstruction = createCloseAccountInstruction(
            accounts.tokenAccount,
            ownerPubkey,
            ownerPubkey
        );
        
        instructions.push(burnInstruction, closeInstruction);
    }
    
    return instructions;
}

/**
 * Helper to get metadata PDA
 */
async function getMetadataPda(mint) {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from('metadata'),
            METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
    );
}

/**
 * Burn multiple NFTs with enhanced rent recovery
 */
async function burnNFTsEnhanced(connection, wallet, nftMints) {
    const transaction = new Transaction();
    let totalEstimatedRecovery = 0;
    
    for (const mint of nftMints) {
        try {
            // Calculate accounts
            const accounts = await calculateNFTAccounts(connection, mint, wallet.publicKey.toString());
            
            // Calculate rent recovery
            const rentInfo = await calculateTotalRentRecovery(connection, accounts);
            totalEstimatedRecovery += rentInfo.totalRent;
            
            console.log(`NFT ${mint} rent recovery:`, rentInfo.rentBreakdown);
            
            // Create burn instructions
            const instructions = await createEnhancedBurnInstructions(
                connection, 
                mint, 
                wallet.publicKey.toString()
            );
            
            transaction.add(...instructions);
            
        } catch (error) {
            console.error(`Error preparing burn for ${mint}:`, error);
        }
    }
    
    return {
        transaction,
        totalEstimatedRecovery,
        nftCount: nftMints.length,
        averageRecoveryPerNFT: totalEstimatedRecovery / nftMints.length
    };
}

module.exports = {
    calculateNFTAccounts,
    calculateTotalRentRecovery,
    createEnhancedBurnInstructions,
    burnNFTsEnhanced
};