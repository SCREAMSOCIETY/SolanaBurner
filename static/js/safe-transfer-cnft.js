/**
 * This is a safe implementation of the CNFT transfer functionality
 * that prevents "Cannot read properties of undefined (reading 'toBuffer')" errors
 */

import { 
    Connection, 
    PublicKey, 
    Transaction, 
    ComputeBudgetProgram 
} from "@solana/web3.js";
import { 
    createTransferInstruction, 
    PROGRAM_ID as BUBBLEGUM_PROGRAM_ID 
} from "@metaplex-foundation/mpl-bubblegum";
import bs58 from "bs58";

/**
 * Safely converts a PublicKey to a Buffer
 * This utility function handles the error-prone toBuffer operation
 * and provides a reliable fallback mechanism
 * 
 * @param {PublicKey|string} publicKeyOrString - The PublicKey or string to convert
 * @returns {Buffer} - A buffer containing the public key bytes
 */
function safePublicKeyToBuffer(publicKeyOrString) {
    try {
        // If input is a string, convert to PublicKey first
        const publicKey = typeof publicKeyOrString === 'string' 
            ? new PublicKey(publicKeyOrString) 
            : publicKeyOrString;
            
        // Try the standard toBuffer method first
        return publicKey.toBuffer();
    } catch (error) {
        console.warn('Error in toBuffer(), using fallback method:', error.message);
        
        // Get the string representation
        const addressStr = typeof publicKeyOrString === 'string' 
            ? publicKeyOrString
            : publicKeyOrString.toString();
        
        // Decode base58 string to get the bytes
        try {
            return Buffer.from(bs58.decode(addressStr));
        } catch (fallbackError) {
            console.error('Fallback method also failed:', fallbackError);
            
            // Last resort: Return a buffer with zeros (32 bytes, standard Solana public key length)
            console.error('Using zeroed buffer as last resort - this will likely cause transaction failure');
            return Buffer.alloc(32);
        }
    }
}

/**
 * Get tree authority safely with robust error handling
 * 
 * @param {PublicKey} merkleTree - The merkle tree public key
 * @returns {PublicKey} - The derived tree authority
 */
function safeGetTreeAuthority(merkleTree) {
    try {
        // Use our safe buffer handling
        const [treeAuthority] = PublicKey.findProgramAddressSync(
            [safePublicKeyToBuffer(merkleTree)],
            BUBBLEGUM_PROGRAM_ID
        );
        
        console.log('Successfully derived tree authority:', treeAuthority.toString());
        return treeAuthority;
    } catch (error) {
        console.error('Error finding program address:', error);
        throw new Error('Failed to derive tree authority: ' + error.message);
    }
}

/**
 * Transfer a cNFT to a specific address with robust error handling
 * 
 * @param {Object} params - The transfer parameters
 * @param {Connection} params.connection - Solana connection
 * @param {Object} params.wallet - Wallet adapter
 * @param {string} params.assetId - The asset ID of the cNFT to transfer
 * @param {Object} params.assetData - The asset data for the cNFT
 * @param {Array} params.proof - The merkle proof for the cNFT
 * @param {string} params.destinationAddress - The address to transfer the cNFT to
 * @returns {Promise<Object>} - The result of the transfer operation
 */
export async function safeTransferCNFT(params) {
    const { connection, wallet, assetId, assetData, proof, destinationAddress } = params;
    
    console.log("Starting safe cNFT transfer:", {
        assetId,
        destinationAddress,
        hasWallet: !!wallet,
        hasProof: !!proof && Array.isArray(proof),
        hasAssetData: !!assetData
    });
    
    try {
        // Check required parameters
        if (!wallet || !wallet.publicKey) {
            throw new Error("Wallet not connected or missing public key");
        }
        
        if (!assetId) {
            throw new Error("Missing asset ID");
        }
        
        if (!assetData) {
            throw new Error("Missing asset data");
        }
        
        // Make sure we have valid proof data
        if (!proof || !Array.isArray(proof) || proof.length === 0) {
            throw new Error("Missing or invalid proof data required for cNFT transfer");
        }
        
        // Get tree address from assetData with fallbacks
        const treeAddress = assetData.compression?.tree || 
                          assetData.tree_id || 
                          assetData.merkle_tree;
                          
        if (!treeAddress) {
            console.error('Missing tree address in asset data:', assetData);
            throw new Error('Missing tree address in asset data. Cannot complete transfer.');
        }
        
        console.log('Using tree address:', treeAddress);
        const merkleTree = new PublicKey(treeAddress);
        
        // Get tree authority safely
        const treeAuthority = safeGetTreeAuthority(merkleTree);
        
        // Target address (default to project wallet if none provided)
        const targetAddress = destinationAddress || "EJNt9MPzVay5p9iDtSQMs6PGTUFYpX3rNA55y4wqi5P8";
        
        // Log key information for debugging
        console.log("Tree authority:", treeAuthority.toString());
        console.log("Merkle tree:", merkleTree.toString());
        console.log("Leaf owner (wallet):", wallet.publicKey.toString());
        console.log("Target address:", targetAddress);
        
        // Extract required compression data fields from the asset
        const leafOwner = wallet.publicKey;
        const newLeafOwner = new PublicKey(targetAddress);
                    
        // Create the transfer instruction
        const transferIx = createTransferInstruction(
            {
                treeAuthority,
                leafOwner: leafOwner,
                leafDelegate: leafOwner, // Owner is also delegate
                newLeafOwner,
                merkleTree,
                logWrapper: PublicKey.findProgramAddressSync(
                    [Buffer.from('log', 'utf8')],
                    new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV')
                )[0],
                compressionProgram: new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'),
                anchorRemainingAccounts: proof && Array.isArray(proof) ? proof.map((node) => ({
                    pubkey: new PublicKey(node),
                    isSigner: false,
                    isWritable: false
                })) : []
            },
            {
                root: [...new PublicKey(
                    assetData.compression?.root || 
                    assetData.root || 
                    "11111111111111111111111111111111"
                ).toBytes()],
                dataHash: [...new PublicKey(
                    assetData.compression?.data_hash || 
                    (assetData.leaf && assetData.leaf.data_hash) || 
                    "11111111111111111111111111111111"
                ).toBytes()],
                creatorHash: [...new PublicKey(
                    assetData.compression?.creator_hash || 
                    (assetData.leaf && assetData.leaf.creator_hash) || 
                    "11111111111111111111111111111111"
                ).toBytes()],
                nonce: assetData.compression?.leaf_id || 
                       assetData.node_index || 
                       assetData.leaf_id || 
                       0,
                index: assetData.compression?.leaf_id || 
                       assetData.node_index || 
                       assetData.leaf_id || 
                       0,
            }
        );
        
        // Add compute budget instruction to increase compute units for compression
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
            units: 1000000 
        });
        
        // Add priority fee to help the transaction get processed faster
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
            microLamports: 10000
        });
        
        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        
        // Create and populate the transaction
        const tx = new Transaction();
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = blockhash;
        
        // Add all instructions
        tx.add(modifyComputeUnits);
        tx.add(addPriorityFee);
        tx.add(transferIx);
        
        try {
            console.log("Signing transfer transaction...");
            
            // Sign the transaction
            if (!wallet.signTransaction) {
                throw new Error("Wallet doesn't support signTransaction");
            }
            
            const signed = await wallet.signTransaction(tx);
            console.log("Transaction signed successfully");
            
            // Send the signed transaction
            console.log("Sending signed transaction...");
            const signature = await connection.sendRawTransaction(
                signed.serialize()
            );
            
            console.log("Transaction sent. Signature:", signature);
            
            // Wait for confirmation
            try {
                const confirmation = await connection.confirmTransaction({
                    signature,
                    blockhash,
                    lastValidBlockHeight
                }, "confirmed");
                
                console.log("cNFT transfer transaction confirmed:", confirmation);
                
                return {
                    success: true,
                    signature,
                    message: "Compressed NFT successfully transferred!",
                    explorerUrl: `https://solscan.io/tx/${signature}`
                };
            } catch (confirmError) {
                // Confirmation might time out but transaction could still succeed
                console.warn("Confirmation error but transaction may have succeeded:", confirmError);
                
                return {
                    success: true,
                    signature,
                    assumed: true,
                    message: "Transaction submitted but confirmation timed out. The transfer is likely to succeed.",
                    explorerUrl: `https://solscan.io/tx/${signature}`
                };
            }
        } catch (error) {
            console.error("Error signing or sending transaction:", error);
            
            // Check if user cancelled
            if (error.message && (
                error.message.includes("User rejected") || 
                error.message.includes("cancelled") || 
                error.message.includes("declined")
            )) {
                return {
                    success: false,
                    error: "Transaction was cancelled by the user",
                    cancelled: true
                };
            }
            
            throw new Error(`Transfer transaction failed: ${error.message}`);
        }
    } catch (error) {
        console.error("Error in safeTransferCNFT:", error);
        
        return {
            success: false,
            error: error.message || "Unknown error in cNFT transfer",
            cancelled: false
        };
    }
}