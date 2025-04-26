import { Connection, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { 
    createTransferInstruction, 
    PROGRAM_ID as BUBBLEGUM_PROGRAM_ID
} from '@metaplex-foundation/mpl-bubblegum';
import axios from 'axios';

export class CNFTHandler {
    constructor(connection, wallet) {
        this.connection = connection;
        this.wallet = wallet;
        
        console.log("[CNFTHandler] Initializing with wallet:", wallet ? "provided" : "missing");
        
        // Debug wallet info
        if (wallet && typeof window !== 'undefined' && window.debugInfo) {
            window.debugInfo.walletInfo = {
                publicKey: wallet.publicKey?.toString() || 'missing',
                hasSignTransaction: typeof wallet.signTransaction === 'function',
                hasSignAllTransactions: typeof wallet.signAllTransactions === 'function',
                hasSignMessage: typeof wallet.signMessage === 'function'
            };
            console.log("[CNFTHandler] Saved wallet info to window.debugInfo");
        }
        
        // Create Metaplex instance with wallet identity
        this.metaplex = new Metaplex(connection);
        
        // Set up the identity properly for the Metaplex instance
        if (wallet && wallet.publicKey) {
            // Import required
            const { walletAdapterIdentity } = require('@metaplex-foundation/js');
            
            // Set the wallet adapter identity
            this.metaplex.use(walletAdapterIdentity(wallet));
            console.log("Set wallet adapter identity for Metaplex with public key:", wallet.publicKey.toString());
        } else {
            console.warn("No wallet provided to CNFTHandler, Metaplex operations will be limited");
        }
    }
    
    // Fetch an asset with its proof data
    async fetchAssetWithProof(assetId) {
        console.log("Fetching asset with proof for", assetId);
        
        try {
            // First try using the bubblegum SDK directly
            console.log("Method 1: Using bubblegum SDK's getAssetWithProof...");
            const { getAssetWithProof } = require('@metaplex-foundation/mpl-bubblegum');
            const asset = await getAssetWithProof(this.connection, assetId);
            return asset;
        } catch (error) {
            console.log("Method 1 error:", error);
            
            // Fallback to using the Helius API through our backend
            try {
                console.log("Method 2: Using Helius API through backend...");
                const response = await fetch(`/api/helius/asset-proof/${assetId}`);
                const proofData = await response.json();
                
                if (proofData.success && proofData.data) {
                    console.log("Successfully fetched proof data via Helius API");
                    
                    // Also get the asset data
                    const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
                    const assetData = await assetResponse.json();
                    
                    if (assetData.success && assetData.data) {
                        // Combine the two results
                        return {
                            ...assetData.data,
                            proof: proofData.data.proof,
                            root: proofData.data.root,
                            tree: proofData.data.tree_id || assetData.data.compression?.tree
                        };
                    } else {
                        throw new Error("Failed to fetch asset data");
                    }
                } else {
                    throw new Error("Failed to fetch proof data");
                }
            } catch (fallbackError) {
                console.error("All methods failed to fetch asset with proof:", fallbackError);
                throw fallbackError;
            }
        }
    }
    
    // Fetch cNFTs for a wallet
    async fetchCNFTs(walletAddress) {
        try {
            const response = await fetch(`/api/helius/wallet/nfts/${walletAddress}`);
            const result = await response.json();
            
            if (result.success && result.data) {
                return result.data.filter(nft => nft.compression?.compressed);
            } else {
                throw new Error("Failed to fetch cNFTs");
            }
        } catch (error) {
            console.error("Error fetching cNFTs:", error);
            throw error;
        }
    }
    
    // Simple burn method implementation (actually a transfer to burn wallet)
    async simpleBurnCNFT(assetId, proof, assetData) {
        // Debug info
        if (typeof window !== 'undefined' && window.debugInfo) {
            window.debugInfo.cnftBurnTriggered = true;
            window.debugInfo.lastCnftData = assetData;
            window.debugInfo.lastCnftError = null;
        }
        
        console.log(`[simpleBurnCNFT] Starting with asset: ${assetId}`);
        
        try {
            if (!this.wallet || !this.wallet.publicKey || !this.wallet.signTransaction) {
                throw new Error('Wallet not connected or missing signTransaction method');
            }
            
            // Fetch fresh proof data
            console.log("[simpleBurnCNFT] Fetching proof data...");
            const proofResponse = await fetch(`/api/helius/asset-proof/${assetId}`);
            const proofData = await proofResponse.json();
            
            if (!proofData.success || !proofData.data || !proofData.data.proof) {
                throw new Error("Failed to fetch valid proof data");
            }
            
            // Fetch fresh asset data
            console.log("[simpleBurnCNFT] Fetching asset data...");
            const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
            const assetResult = await assetResponse.json();
            
            if (!assetResult.success || !assetResult.data) {
                throw new Error("Failed to fetch asset data");
            }
            
            const asset = assetResult.data;
            
            // Create tree ID
            const treeId = asset.compression?.tree || 
                          asset.tree || 
                          'EDR6ywjZy9pQqz7UCCx3jzCeMQcoks231URFDizJAUNq';
                          
            console.log("[simpleBurnCNFT] Using tree ID:", treeId);
            
            // Create transaction
            const transaction = new Transaction();
            
            // Add compute budget
            transaction.add(
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: 400000
                })
            );
            
            // Define burn wallet
            const BURN_WALLET = new PublicKey('11111111111111111111111111111111');
            
            // Create tree public key
            const treePublicKey = new PublicKey(treeId);
            
            // Derive tree authority
            const [treeAuthority] = await PublicKey.findProgramAddress(
                [treePublicKey.toBuffer()],
                new PublicKey(BUBBLEGUM_PROGRAM_ID)
            );
            
            console.log("[simpleBurnCNFT] Derived tree authority:", treeAuthority.toString());
            
            // Prepare proof data
            const merkleProof = proofData.data.proof.map(node => new PublicKey(node));
            console.log("[simpleBurnCNFT] Using proof with", merkleProof.length, "elements");
            
            // Get compression data
            const root = new PublicKey(proofData.data.root);
            const dataHash = new PublicKey(asset.compression?.data_hash || proofData.data.data_hash);
            const creatorHash = new PublicKey(asset.compression?.creator_hash || proofData.data.creator_hash);
            const leafIndex = Number(asset.compression?.leaf_id || asset.compression?.leafId || proofData.data.leaf_id || 0);
            
            console.log("[simpleBurnCNFT] Using leaf index:", leafIndex);
            
            // Required system program accounts
            const logWrapper = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
            const compressionProgram = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');
            
            // Create transfer instruction
            const transferInstruction = createTransferInstruction(
                {
                    treeAuthority,
                    leafOwner: this.wallet.publicKey,
                    leafDelegate: this.wallet.publicKey,
                    newLeafOwner: BURN_WALLET,
                    merkleTree: treePublicKey,
                    logWrapper,
                    compressionProgram,
                    anchorRemainingAccounts: merkleProof.map(node => ({
                        pubkey: node,
                        isWritable: false,
                        isSigner: false
                    })),
                    root,
                    dataHash,
                    creatorHash,
                    index: leafIndex,
                    nonce: leafIndex
                },
                new PublicKey(BUBBLEGUM_PROGRAM_ID)
            );
            
            // Add instruction to transaction
            transaction.add(transferInstruction);
            
            // Set fee payer
            transaction.feePayer = this.wallet.publicKey;
            
            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;
            
            console.log("[simpleBurnCNFT] Transaction prepared, requesting wallet signature...");
            
            // Sign transaction - THIS SHOULD SHOW THE WALLET UI
            try {
                const signedTransaction = await this.wallet.signTransaction(transaction);
                
                console.log("[simpleBurnCNFT] Transaction signed successfully!");
                
                // Send transaction
                const signature = await this.connection.sendRawTransaction(
                    signedTransaction.serialize(),
                    { skipPreflight: false }
                );
                
                console.log("[simpleBurnCNFT] Transaction sent with signature:", signature);
                
                // Store signature for debugging
                if (typeof window !== 'undefined' && window.debugInfo) {
                    window.debugInfo.lastCnftSignature = signature;
                }
                
                // Wait for confirmation
                try {
                    const confirmationResult = await this.connection.confirmTransaction({
                        signature,
                        blockhash,
                        lastValidBlockHeight
                    }, 'confirmed');
                    
                    console.log("[simpleBurnCNFT] Transaction confirmed:", confirmationResult);
                    
                    return {
                        success: true,
                        signature,
                        message: "cNFT successfully sent to burn wallet!"
                    };
                } catch (confirmError) {
                    // Transaction might still succeed even if confirmation times out
                    console.warn("[simpleBurnCNFT] Confirmation error:", confirmError);
                    
                    return {
                        success: true,
                        signature,
                        assumed: true,
                        message: "Transaction submitted but confirmation timed out. It may have still succeeded."
                    };
                }
            } catch (signError) {
                console.error("[simpleBurnCNFT] Error signing transaction:", signError);
                
                // Check if user rejected
                if (signError.message && (
                    signError.message.includes('User rejected') || 
                    signError.message.includes('declined') ||
                    signError.message.includes('cancelled')
                )) {
                    return {
                        success: false,
                        error: 'Transaction was cancelled by user',
                        cancelled: true
                    };
                }
                
                throw signError;
            }
        } catch (error) {
            console.error("[simpleBurnCNFT] Error:", error);
            
            if (typeof window !== 'undefined' && window.debugInfo) {
                window.debugInfo.lastCnftError = error.message || 'Unknown error';
            }
            
            throw error;
        }
    }
    
    // Server-side burn method
    async serverBurnCNFT(assetId) {
        try {
            console.log(`Server-side burning of cNFT: ${assetId}`);
            
            const response = await fetch(`/api/burn-cnft/${assetId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log("Server-side burn succeeded:", result);
                return result;
            } else {
                throw new Error(result.error || "Server-side burn failed");
            }
        } catch (error) {
            console.error("Error in server-side burn:", error);
            throw error;
        }
    }
    
    // Direct burn method (trade to burn wallet)
    async directBurnCNFT(assetId, proof) {
        try {
            console.log(`Direct burning of cNFT: ${assetId}`);
            
            // Fetch asset data
            const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
            const assetData = await assetResponse.json();
            
            if (!assetData.success || !assetData.data) {
                throw new Error("Failed to fetch asset data");
            }
            
            // Use the simplified burn method
            return this.simpleBurnCNFT(assetId, proof, assetData.data);
        } catch (error) {
            console.error("Error in direct burn:", error);
            throw error;
        }
    }
    
    // Main burn method (trade to burn wallet)
    async burnCNFT(assetId, proof, assetData) {
        console.log(`Burning cNFT with assetId: ${assetId}`);
        
        try {
            // Always use the simple burn method
            return this.simpleBurnCNFT(assetId, proof, assetData);
        } catch (error) {
            console.error("Error in burnCNFT:", error);
            throw error;
        }
    }
}