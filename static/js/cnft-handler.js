import { Connection, PublicKey, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import { 
    createTransferInstruction, 
    PROGRAM_ID
} from "@metaplex-foundation/mpl-bubblegum";
import axios from "axios";

// Define burn wallet address - standard all zeros address
const BURN_WALLET_ADDRESS = "11111111111111111111111111111111";

export class CNFTHandler {
    constructor(connection, wallet) {
        this.connection = connection;
        this.wallet = wallet;
        
        console.log("[CNFTHandler] Initializing with wallet:", wallet ? "provided" : "missing");
        
        // Debug wallet info
        if (wallet && typeof window !== "undefined" && window.debugInfo) {
            window.debugInfo.walletInfo = {
                publicKey: wallet.publicKey?.toString() || "missing",
                hasSignTransaction: typeof wallet.signTransaction === "function"
            };
            console.log("[CNFTHandler] Saved wallet info to window.debugInfo");
        }
        
        // Create Metaplex instance
        this.metaplex = new Metaplex(connection);
        
        // Set the wallet adapter identity if wallet is provided
        if (wallet && wallet.publicKey) {
            const { walletAdapterIdentity } = require("@metaplex-foundation/js");
            this.metaplex.use(walletAdapterIdentity(wallet));
            console.log("Set wallet adapter identity for Metaplex with public key:", wallet.publicKey.toString());
        } else {
            console.warn("No wallet provided to CNFTHandler, Metaplex operations will be limited");
        }
    }
    
    // Fetch asset with proof directly from Helius API
    async fetchAssetWithProof(assetId) {
        console.log("Fetching asset with proof for", assetId);
        
        try {
            // Method 1: Using bubblegum SDK getAssetWithProof
            console.log("Method 1: Using bubblegum SDK getAssetWithProof...");
            const { getAssetWithProof } = require("@metaplex-foundation/mpl-bubblegum");
            const asset = await getAssetWithProof(this.connection, assetId);
            return asset;
        } catch (error) {
            console.log("Method 1 error:", error);
            
            // Method 2: Using Helius API through backend
            try {
                console.log("Method 2: Using Helius API through backend...");
                const proofResponse = await fetch(`/api/helius/asset-proof/${assetId}`);
                const proofData = await proofResponse.json();
                
                if (proofData.success && proofData.data) {
                    console.log("Successfully fetched proof data via Helius API");
                    return proofData.data;
                } else {
                    throw new Error("Failed to fetch proof data");
                }
            } catch (fallbackError) {
                console.error("Method 2 error:", fallbackError);
                throw fallbackError;
            }
        }
    }
    
    // Main method to burn a cNFT (actually trade to burn wallet)
    async burnCNFT(assetId, proof, assetData) {
        console.log(`Burning cNFT with assetId: ${assetId}`);
        
        if (typeof window !== "undefined" && window.debugInfo) {
            window.debugInfo.cnftBurnTriggered = true;
            window.debugInfo.lastCnftData = assetData;
        }
        
        try {
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                throw new Error("Wallet not connected or missing signTransaction method");
            }
            
            // Store the full asset data for access during the burning process
            this.asset = assetData;
            
            // If the proof is missing or invalid (not an array), get it directly
            console.log("Proof data:", proof);
            let validProof = proof;
            
            if (!proof || !Array.isArray(proof)) {
                console.log("Missing or invalid proof data. Trying to fetch proof...");
                
                // Try using the fetchAssetWithProof method
                try {
                    const assetWithProof = await this.fetchAssetWithProof(assetId);
                    if (assetWithProof && assetWithProof.proof && Array.isArray(assetWithProof.proof)) {
                        validProof = assetWithProof.proof;
                        console.log("Success: Got proof data via fetchAssetWithProof method");
                    } else {
                        console.log("Failed: Invalid or missing proof data");
                    }
                } catch (proofError) {
                    console.error("Error fetching proof:", proofError);
                }
                
                // If still no valid proof, try direct API call
                if (!validProof || !Array.isArray(validProof)) {
                    try {
                        console.log("Trying dedicated asset-proof endpoint");
                        const response = await fetch(`/api/helius/asset-proof/${assetId}`);
                        const responseData = await response.json();
                        
                        if (responseData?.success && responseData?.data?.proof) {
                            validProof = responseData.data.proof;
                            console.log("Success: Got proof data via dedicated endpoint");
                        } else {
                            console.log("Failed: No valid proof returned from API");
                            throw new Error("Failed to get proof data after multiple attempts");
                        }
                    } catch (apiError) {
                        console.error("API error:", apiError);
                        throw apiError;
                    }
                }
            }
            
            // Get tree details from the asset data
            const treeId = this.asset?.compression?.tree || 
                          this.asset?.tree || 
                          "EDR6ywjZy9pQqz7UCCx3jzCeMQcoks231URFDizJAUNq"; // Common tree ID
            
            console.log("Using tree ID:", treeId);
            
            // Create a new transaction
            const tx = new Transaction();
            
            // Add compute budget instructions for complex operations
            tx.add(
                ComputeBudgetProgram.setComputeUnitLimit({ 
                    units: 400000 // Higher compute units for cNFT operations
                })
            );
            
            // Define the burn wallet address
            const BURN_WALLET = new PublicKey(BURN_WALLET_ADDRESS);
            
            // Create the tree public key
            const treePublicKey = new PublicKey(treeId);
            
            // Get the tree authority - derived from the tree ID
            const [treeAuthority] = await PublicKey.findProgramAddress(
                [treePublicKey.toBuffer()],
                PROGRAM_ID
            );
            
            console.log("Tree authority derived:", treeAuthority.toString());
            
            // Get data needed for the transfer instruction
            const merkleProof = validProof.map(node => new PublicKey(node));
            
            // Get additional compression data
            const root = new PublicKey(this.asset?.compression?.root || validProof[0] || "11111111111111111111111111111111");
            const dataHash = new PublicKey(this.asset?.compression?.data_hash || "11111111111111111111111111111111");
            const creatorHash = new PublicKey(this.asset?.compression?.creator_hash || "11111111111111111111111111111111");
            const leafIndex = Number(this.asset?.compression?.leaf_id || this.asset?.compression?.leafId || 0);
            
            // Required system program accounts
            const logWrapper = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
            const compressionProgram = new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
            
            // Create transfer instruction with all accounts and data
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
                PROGRAM_ID
            );
            
            // Add the instruction to the transaction
            tx.add(transferInstruction);
            
            // Set the fee payer and recent blockhash
            tx.feePayer = this.wallet.publicKey;
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = blockhash;
            
            console.log("Transaction prepared with blockhash:", blockhash);
            console.log("Transaction instructions count:", tx.instructions.length);
            
            // Sign and send the transaction - THIS SHOULD TRIGGER WALLET UI
            console.log("Requesting wallet signature...");
            try {
                const signedTx = await this.wallet.signTransaction(tx);
                console.log("Transaction signed successfully");
                
                const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
                    skipPreflight: false,
                    preflightCommitment: "confirmed"
                });
                console.log("Transaction sent with signature:", signature);
                
                // Store signature for debugging
                if (typeof window !== "undefined" && window.debugInfo) {
                    window.debugInfo.lastCnftSignature = signature;
                }
                
                // Wait for confirmation
                try {
                    const confirmation = await this.connection.confirmTransaction({
                        signature,
                        blockhash,
                        lastValidBlockHeight
                    }, "confirmed");
                    
                    console.log("Transaction confirmed:", confirmation);
                    
                    return {
                        success: true,
                        signature: signature,
                        message: "cNFT successfully sent to burn wallet!"
                    };
                } catch (confirmError) {
                    // Confirmation might time out but transaction could still succeed
                    console.warn("Confirmation error but transaction may have succeeded:", confirmError);
                    
                    return {
                        success: true,
                        signature: signature,
                        assumed: true,
                        message: "Transaction submitted but confirmation timed out. Check explorer for status."
                    };
                }
            } catch (signError) {
                console.error("Error signing transaction:", signError);
                
                // Check if user cancelled
                if (signError.message && (
                    signError.message.includes("User rejected") || 
                    signError.message.includes("cancelled") || 
                    signError.message.includes("declined")
                )) {
                    return {
                        success: false,
                        error: "Transaction was cancelled by the user",
                        cancelled: true
                    };
                }
                
                throw new Error(`Transaction signing failed: ${signError.message}`);
            }
        } catch (error) {
            console.error("Error in burnCNFT:", error);
            
            if (typeof window !== "undefined" && window.debugInfo) {
                window.debugInfo.lastCnftError = error.message || "Unknown error";
            }
            
            throw error;
        }
    }
    
    // Alternative methods that all call the main burnCNFT method
    
    // Simple burn implementation
    async simpleBurnCNFT(assetId, proof, assetData) {
        return this.burnCNFT(assetId, proof, assetData);
    }
    
    // Direct burn implementation
    async directBurnCNFT(assetId, proof) {
        console.log("Using directBurnCNFT method");
        
        try {
            // Fetch asset data if not provided
            const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
            const assetResult = await assetResponse.json();
            
            if (!assetResult.success || !assetResult.data) {
                throw new Error("Failed to fetch asset data");
            }
            
            return this.burnCNFT(assetId, proof, assetResult.data);
        } catch (error) {
            console.error("Error in directBurnCNFT:", error);
            throw error;
        }
    }
    
    // Server-side burn method
    async serverBurnCNFT(assetId) {
        console.log("Using serverBurnCNFT method");
        
        try {
            // Send to backend
            const response = await fetch(`/api/burn-cnft/${assetId}`, {
                method: "POST"
            });
            
            const result = await response.json();
            
            if (result.success) {
                return result;
            } else {
                throw new Error(result.error || "Server burn failed");
            }
        } catch (error) {
            console.error("Error in serverBurnCNFT:", error);
            throw error;
        }
    }
    
    // Fetch cNFTs for wallet
    async fetchCNFTs(walletAddress) {
        try {
            console.log("Fetching cNFTs for wallet:", walletAddress);
            const response = await fetch(`/api/helius/wallet/nfts/${walletAddress}`);
            const result = await response.json();
            
            if (result.success && result.data) {
                // Filter for compressed NFTs only
                return result.data.filter(nft => nft.compression?.compressed);
            } else {
                throw new Error("Failed to fetch cNFTs");
            }
        } catch (error) {
            console.error("Error fetching cNFTs:", error);
            throw error;
        }
    }
}