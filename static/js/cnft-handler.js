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
        
        // Store attempts and errors for debugging
        const attempts = [];
        const errors = [];
        
        try {
            // Method 1: Using bubblegum SDK getAssetWithProof
            console.log("Method 1: Using bubblegum SDK getAssetWithProof...");
            try {
                const { getAssetWithProof } = require("@metaplex-foundation/mpl-bubblegum");
                const asset = await getAssetWithProof(this.connection, assetId);
                
                if (asset && asset.proof && Array.isArray(asset.proof)) {
                    console.log("Successfully fetched proof via bubblegum SDK");
                    return asset;
                } else {
                    throw new Error("Invalid proof data from bubblegum SDK");
                }
            } catch (sdkError) {
                console.log("Method 1 error:", sdkError);
                attempts.push("bubblegum SDK");
                errors.push(sdkError.message);
            }
            
            // Method 2: Using Helius API through backend
            console.log("Method 2: Using Helius API through backend...");
            try {
                const proofResponse = await fetch(`/api/helius/asset-proof/${assetId}`);
                const proofData = await proofResponse.json();
                
                if (proofData.success && proofData.data && proofData.data.proof && Array.isArray(proofData.data.proof)) {
                    console.log("Successfully fetched proof data via Helius API");
                    return proofData.data;
                } else {
                    throw new Error("Invalid proof data from Helius backend API");
                }
            } catch (apiError) {
                console.log("Method 2 error:", apiError);
                attempts.push("Helius backend API");
                errors.push(apiError.message);
            }
            
            // Method 3: Try direct Helius API if we have the key
            console.log("Method 3: Trying direct Helius API access...");
            if (typeof window !== "undefined" && window.ENV && window.ENV.HELIUS_API_KEY) {
                try {
                    const apiKey = window.ENV.HELIUS_API_KEY;
                    const directResponse = await fetch(`https://api.helius.xyz/v0/assets/${assetId}/asset-proof?api-key=${apiKey}`);
                    const directData = await directResponse.json();
                    
                    if (directData && directData.proof && Array.isArray(directData.proof)) {
                        console.log("Successfully fetched proof via direct Helius API");
                        return {
                            ...directData,
                            assetId: assetId
                        };
                    } else {
                        throw new Error("Invalid proof data from direct Helius API");
                    }
                } catch (directError) {
                    console.log("Method 3 error:", directError);
                    attempts.push("direct Helius API");
                    errors.push(directError.message);
                }
            } else {
                console.log("Method 3: Skipped - No Helius API key available");
                attempts.push("direct Helius API");
                errors.push("No API key available");
            }
            
            // Method 4: If all else fails, create a minimal asset object with an empty proof
            // This is a last resort and may not work, but better than crashing
            console.warn("All proof fetching methods failed, constructing placeholder asset data");
            console.warn("Attempts:", attempts.join(", "));
            console.warn("Errors:", errors.join(", "));
            
            // Show notification warning to user
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                    "Warning: Limited Proof Data", 
                    "Could not retrieve complete proof data. Transaction may fail."
                );
            }
            
            // Log error for debugging
            if (typeof window !== "undefined" && window.debugInfo) {
                window.debugInfo.proofFetchFailed = true;
                window.debugInfo.proofFetchErrors = errors;
            }
            
            // Return minimal data structure
            return {
                assetId: assetId,
                proof: [],  // Empty proof array
                compression: {
                    compressed: true,
                    tree: "EDR6ywjZy9pQqz7UCCx3jzCeMQcoks231URFDizJAUNq",
                    root: "11111111111111111111111111111111",
                    proofFailed: true
                }
            };
        } catch (error) {
            console.error("Fatal error in fetchAssetWithProof:", error);
            
            // Log error for debugging
            if (typeof window !== "undefined" && window.debugInfo) {
                window.debugInfo.fatalProofError = error.message;
            }
            
            throw error;
        }
    }
    
    // Main method to transfer a cNFT to burn wallet (we can't actually burn it without tree authority)
    async burnCNFT(assetId, proof, assetData) {
        console.log(`Trading cNFT to burn wallet: ${assetId}`);
        
        if (typeof window !== "undefined" && window.debugInfo) {
            window.debugInfo.cnftBurnTriggered = true;
            window.debugInfo.lastCnftData = assetData;
            window.debugInfo.burnMethod = "transfer";
            window.debugInfo.burnStartTime = Date.now();
        }
        
        // Show a notification that we're processing the trade-to-burn operation
        if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
                "Processing cNFT Trade to Burn", 
                "Please check your wallet extension and approve the transaction prompt."
            );
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
                // Force wallet UI to appear by explicitly using wallet adapter's signTransaction
                if (!this.wallet.signTransaction) {
                    throw new Error("Wallet doesn't support signTransaction");
                }
                
                // Set a debug flag to track if signTransaction is called
                if (typeof window !== "undefined" && window.debugInfo) {
                    window.debugInfo.signTransactionCalled = true;
                    window.debugInfo.lastTransaction = tx;
                }
                
                console.log("Calling wallet.signTransaction...");
                
                // Force a small delay to ensure UI is ready
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Explicitly disconnect and reconnect if needed
                if (this.wallet.connected === false && this.wallet.connect) {
                    console.log("Wallet is disconnected, attempting to reconnect...");
                    try {
                        await this.wallet.connect();
                    } catch (connectError) {
                        console.error("Error reconnecting wallet:", connectError);
                        // Continue anyway
                    }
                }
                
                // Log transaction details before signing
                console.log("Transaction to sign:", {
                    feePayer: tx.feePayer?.toString(),
                    recentBlockhash: tx.recentBlockhash,
                    instructions: tx.instructions.length
                });
                
                // Force browser to show a notification that will help trigger wallet attention
                if (typeof document !== "undefined" && document.hasFocus && !document.hasFocus()) {
                    console.log("Browser tab not focused, trying to get user attention");
                    if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                        window.BurnAnimations.showNotification(
                            "Wallet Approval Required", 
                            "Please check your wallet extension for transaction approval dialog"
                        );
                    }
                }
                
                console.log("Using wallet.sendTransaction instead of signTransaction to ensure wallet UI appears...");
                
                // Use sendTransaction method instead of signTransaction + send separately
                // This helps ensure the wallet UI appears as it's more commonly implemented
                console.log("Transaction to send:", {
                    instructions: tx.instructions.length,
                    feePayer: tx.feePayer?.toString()
                });
                
                if (!this.wallet.sendTransaction) {
                    throw new Error("Wallet doesn't support sendTransaction method");
                }
                
                // Access the original wallet provider directly from window
                // This bypasses any adapter layers that might be preventing the UI from showing
                const solanaProvider = 
                    (typeof window !== "undefined" && window.solana) || 
                    (typeof window !== "undefined" && window.phantom?.solana) ||
                    null;
                    
                console.log("Direct provider access:", solanaProvider ? "available" : "not available");
                
                let signature;
                
                // Try direct provider first if available
                if (solanaProvider && typeof solanaProvider.signAndSendTransaction === 'function') {
                    console.log("Using direct solana.signAndSendTransaction() method");
                    
                    // This calls directly into the wallet extension
                    const { signature: directSig } = await solanaProvider.signAndSendTransaction(tx);
                    signature = directSig;
                    console.log("Transaction signed and sent directly via wallet provider:", signature);
                }
                else if (solanaProvider && typeof solanaProvider.signTransaction === 'function') {
                    console.log("Using direct solana.signTransaction() method");
                    
                    // Sign with direct provider
                    const signedTx = await solanaProvider.signTransaction(tx);
                    
                    // Send the signed transaction
                    signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
                        skipPreflight: false,
                        preflightCommitment: "confirmed"
                    });
                    console.log("Transaction signed with direct wallet and sent via connection:", signature);
                }
                else {
                    // Fall back to wallet adapter if direct access isn't available
                    console.log("Falling back to wallet adapter sendTransaction");
                    signature = await this.wallet.sendTransaction(tx, this.connection, {
                        skipPreflight: false,
                        preflightCommitment: "confirmed"
                    });
                    console.log("Transaction sent via wallet adapter:", signature);
                }
                
                console.log("Transaction sent directly via wallet.sendTransaction:", signature);
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
    
    // Direct transfer to burn wallet implementation
    async directBurnCNFT(assetId, proof) {
        console.log("Using directBurnCNFT method (transfer to burn wallet)");
        
        try {
            // Fetch asset data if not provided
            const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
            const assetResult = await assetResponse.json();
            
            if (!assetResult.success || !assetResult.data) {
                throw new Error("Failed to fetch asset data");
            }
            
            // Show a user-friendly notification explaining this is a transfer
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                    "Trading cNFT to Burn Wallet", 
                    "Watch for your wallet transaction approval prompt"
                );
            }
            
            return this.burnCNFT(assetId, proof, assetResult.data);
        } catch (error) {
            console.error("Error in directBurnCNFT (transfer):", error);
            throw error;
        }
    }
    
    // Server-side cNFT transfer to burn wallet method
    async serverBurnCNFT(assetId) {
        console.log("Using serverBurnCNFT method (transfer to burn wallet)");
        
        try {
            // Show a notification for better user experience
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                    "Preparing cNFT Trade to Burn", 
                    "Fetching required data from the server..."
                );
            }
            
            console.log("Calling server endpoint for asset:", assetId);
            
            // Send to backend to get asset and proof data
            const response = await fetch(`/api/burn-cnft/${assetId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || "Server failed to fetch asset data");
            }
            
            console.log("Server returned asset and proof data:", result);
            
            // We now have both the asset data and proof data
            const { asset, proof } = result.data;
            
            if (!asset || !proof) {
                throw new Error("Server returned incomplete data");
            }
            
            // Now use the directBurnCNFT method with the provided proof
            console.log("Using proof data from server for transfer to burn wallet");
            return await this.directBurnCNFT(assetId, proof);
            
        } catch (error) {
            console.error("Error in serverBurnCNFT:", error);
            
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
            
            return {
                success: false,
                error: error.message || "Unknown error in serverBurnCNFT",
                cancelled: false
            };
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