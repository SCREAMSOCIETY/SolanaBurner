/**
 * Bubblegum Transfer Implementation
 * 
 * This module provides functionality for transferring compressed NFTs using the
 * Bubblegum protocol. It handles the creation of transfer instructions and 
 * transaction sending.
 */

import { createTransferInstruction } from '@metaplex-foundation/mpl-bubblegum';
import { Transaction, PublicKey } from '@solana/web3.js';

/**
 * Get tree authority PDA
 * @param {PublicKey} merkleTree - The merkle tree public key
 * @returns {PublicKey} - The derived tree authority
 */
function getTreeAuthorityPDA(merkleTree) {
    const [treeAuthority] = PublicKey.findProgramAddressSync(
        [merkleTree.toBuffer()],
        new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY")
    );
    return treeAuthority;
}

/**
 * Safely converts a PublicKey to a Buffer
 * @param {PublicKey|string} publicKeyOrString - The PublicKey or string to convert
 * @returns {Buffer} - A buffer containing the public key bytes
 */
function safePublicKeyToBuffer(publicKeyOrString) {
    try {
        if (typeof publicKeyOrString === 'string') {
            return new PublicKey(publicKeyOrString).toBuffer();
        } else if (publicKeyOrString instanceof PublicKey) {
            return publicKeyOrString.toBuffer();
        }
    } catch (e) {
        console.error("Error converting public key to buffer:", e);
    }
    
    // Return an empty buffer as fallback
    return Buffer.alloc(32);
}

/**
 * Transfer a compressed NFT to a specified destination
 * @param {object} params - The transfer parameters
 * @param {Connection} params.connection - Solana connection object
 * @param {WalletAdapter} params.wallet - Wallet adapter with signTransaction method
 * @param {string} params.assetId - Asset ID (mint address) of the cNFT
 * @param {string} params.destinationAddress - Destination wallet address
 * @param {object} params.proofData - The asset proof data
 * @param {object} params.assetData - Additional asset data (optional)
 * @returns {Promise<object>} - The result of the transfer operation
 */
async function transferCompressedNFT(params) {
    const { connection, wallet, assetId, destinationAddress, proofData, assetData } = params;
    
    try {
        console.log("Starting Bubblegum transfer with params:", {
            assetId,
            destinationAddress,
            walletPublicKey: wallet.publicKey.toString(),
            proofDataAvailable: !!proofData
        });
        
        if (!proofData) {
            return {
                success: false,
                error: "No proof data provided for cNFT transfer"
            };
        }
        
        // Validate required proof data
        if (!proofData.proof || !proofData.root || !proofData.tree) {
            console.error("Invalid proof data:", proofData);
            return {
                success: false,
                error: "Invalid proof data structure"
            };
        }
        
        // Get the latest blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        
        // Create a new transaction
        const transaction = new Transaction({
            feePayer: wallet.publicKey,
            blockhash,
            lastValidBlockHeight,
        });
        
        // Add compute budget instruction to ensure consistent transaction fees with batch transfers
        const ComputeBudgetProgram = require('@solana/web3.js').ComputeBudgetProgram;
        transaction.add(
            ComputeBudgetProgram.setComputeUnitLimit({ 
                units: 1000000 // Same as batch operations to keep fees consistent
            })
        );
        
        // Convert tree ID to PublicKey
        const merkleTree = new PublicKey(proofData.tree);
        const newLeafOwner = new PublicKey(destinationAddress);
        
        console.log("Creating transfer instruction with params:", {
            merkleTree: merkleTree.toString(),
            treeAuthority: getTreeAuthorityPDA(merkleTree).toString(),
            leafOwner: wallet.publicKey.toString(),
            newLeafOwner: newLeafOwner.toString(),
            proofLength: proofData.proof.length
        });
        
        // Create the transfer instruction
        try {
            const transferIx = createTransferInstruction(
                {
                    merkleTree,
                    treeAuthority: getTreeAuthorityPDA(merkleTree),
                    leafOwner: wallet.publicKey,
                    leafDelegate: wallet.publicKey,
                    newLeafOwner,
                    logWrapper: PublicKey.findProgramAddressSync(
                        [Buffer.from("log_wrapper", "utf8")],
                        new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV")
                    )[0],
                    compressionProgram: new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"),
                    anchorRemainingAccounts: [
                        {
                            pubkey: new PublicKey(proofData.root),
                            isSigner: false,
                            isWritable: false,
                        },
                        ...proofData.proof.map((node) => ({
                            pubkey: new PublicKey(node),
                            isSigner: false,
                            isWritable: false,
                        })),
                    ],
                },
                {
                    root: [...new PublicKey(proofData.root).toBytes()],
                    dataHash: [...Buffer.from(proofData.data_hash || "0000000000000000000000000000000000000000000000000000000000000000", "hex")],
                    creatorHash: [...Buffer.from(proofData.creator_hash || "0000000000000000000000000000000000000000000000000000000000000000", "hex")],
                    nonce: proofData.leaf_id || 0,
                    index: proofData.leaf_id || 0,
                }
            );
            
            console.log("Transfer instruction created successfully");
            transaction.add(transferIx);
        } catch (err) {
            console.error("Error creating transfer instruction:", err);
            return {
                success: false,
                error: `Error creating transfer instruction: ${err.message}`
            };
        }
        
        // Sign and send the transaction
        try {
            console.log("Signing transaction...");
            const signedTx = await wallet.signTransaction(transaction);
            
            console.log("Sending transaction...");
            const signature = await connection.sendRawTransaction(
                signedTx.serialize(),
                { skipPreflight: true }
            );
            
            console.log("Transaction sent, signature:", signature);
            
            // Confirm the transaction
            const confirmation = await connection.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight,
            });
            
            if (confirmation.value.err) {
                console.error("Transaction confirmed but has errors:", confirmation.value.err);
                return {
                    success: false,
                    error: `Transaction confirmed but has errors: ${JSON.stringify(confirmation.value.err)}`,
                    signature,
                    explorerUrl: `https://solscan.io/tx/${signature}`
                };
            }
            
            console.log("Transaction confirmed successfully");
            return {
                success: true,
                signature,
                message: "Successfully transferred cNFT",
                explorerUrl: `https://solscan.io/tx/${signature}`
            };
        } catch (err) {
            // Check if this is a user rejection
            if (err.message && (
                err.message.includes("User rejected") || 
                err.message.includes("cancelled") || 
                err.message.includes("declined")
            )) {
                console.log("User rejected transaction");
                return {
                    success: false,
                    error: "Transaction was cancelled by the user",
                    cancelled: true
                };
            }
            
            console.error("Error in transaction signing/sending:", err);
            return {
                success: false,
                error: `Transaction error: ${err.message}`,
                cancelled: false
            };
        }
    } catch (error) {
        console.error("Unexpected error in transferCompressedNFT:", error);
        return {
            success: false,
            error: error.message || "Unknown error in transferCompressedNFT",
            cancelled: false
        };
    }
}

// Make sure bubblegumTransfer is accessible globally for direct access
if (typeof window !== 'undefined') {
    window.bubblegumTransfer = { transferCompressedNFT };
}

// Export the transfer function for module imports
export default { transferCompressedNFT };