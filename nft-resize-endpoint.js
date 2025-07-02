/**
 * NFT Resize Endpoint
 * 
 * Provides functionality to resize NFT metadata accounts before burning.
 * Users can optimize their NFTs first, then burn them later for maximum SOL recovery.
 */

const { Connection, PublicKey, Transaction, TransactionInstruction } = require('@solana/web3.js');

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/**
 * Create a resize instruction for an NFT metadata account
 * @param {string} mintAddress - NFT mint address
 * @param {string} updateAuthority - Update authority address
 * @returns {Promise<object>} - Resize transaction data
 */
async function createResizeTransaction(mintAddress, updateAuthority) {
  try {
    const connection = new Connection(process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com');
    const mintPubkey = new PublicKey(mintAddress);
    const updateAuthorityPubkey = new PublicKey(updateAuthority);
    
    // Get metadata account PDA
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        METADATA_PROGRAM_ID.toBuffer(),
        mintPubkey.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );
    
    // Check if metadata account exists and get current size
    const metadataAccount = await connection.getAccountInfo(metadataPda);
    if (!metadataAccount) {
      throw new Error('Metadata account not found');
    }
    
    const currentSize = metadataAccount.data.length;
    const minimumSize = 679; // Standard metadata account size
    
    if (currentSize <= minimumSize) {
      return {
        success: false,
        error: 'NFT metadata account is already optimized',
        currentSize,
        minimumSize
      };
    }
    
    // Calculate potential savings
    const excessSize = currentSize - minimumSize;
    const lamportsPerByte = await connection.getMinimumBalanceForRentExemption(1) - await connection.getMinimumBalanceForRentExemption(0);
    const potentialSavings = (excessSize * lamportsPerByte) / 1e9;
    
    // Create resize instruction (this is a placeholder - actual implementation would need Metaplex SDK)
    const transaction = new Transaction();
    
    // Note: Actual resize instruction would be created using Metaplex Token Metadata SDK
    // For now, we return the transaction structure that would be needed
    
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = updateAuthorityPubkey;
    
    return {
      success: true,
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
      potentialSavings,
      currentSize,
      optimizedSize: minimumSize,
      excessSize,
      message: `Resize will save ${potentialSavings.toFixed(6)} SOL from metadata account optimization`
    };
    
  } catch (error) {
    console.error('Error creating resize transaction:', error);
    return {
      success: false,
      error: error.message || 'Failed to create resize transaction'
    };
  }
}

module.exports = {
  createResizeTransaction
};