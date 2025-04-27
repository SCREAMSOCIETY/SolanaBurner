import { Connection, PublicKey, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import { 
    createTransferInstruction, 
    createBurnInstruction,
    PROGRAM_ID as BUBBLEGUM_PROGRAM_ID
} from "@metaplex-foundation/mpl-bubblegum";
import axios from "axios";
import BN from "bn.js";

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
                BUBBLEGUM_PROGRAM_ID
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
                BUBBLEGUM_PROGRAM_ID
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
    
    // Simple burn implementation that tries the direct burn first
    async simpleBurnCNFT(assetId, proof, assetData) {
        console.log("Attempting simpleBurnCNFT method (trying direct burn first)");
        
        try {
            // First, try to use the direct burn method with the proof and asset data
            const result = await this.directBurnCNFT(assetId, proof);
            
            // If direct burn succeeds, return the result
            if (result.success) {
                console.log("Direct burn successful via simpleBurnCNFT");
                return result;
            }
            
            // If we get here, direct burn failed, so fall back to transfer method
            console.log("Direct burn failed, falling back to transfer method");
            return this.burnCNFT(assetId, proof, assetData);
        } catch (error) {
            console.error("Error in simpleBurnCNFT:", error);
            
            // Fall back to transfer method if direct burn fails
            console.log("Direct burn threw an error, falling back to transfer method");
            return this.burnCNFT(assetId, proof, assetData);
        }
    }
    
    // Direct burn implementation using mpl-bubblegum createBurnInstruction
    async directBurnCNFT(assetId, proof) {
        console.log("Using directBurnCNFT method with actual burn instruction");
        
        try {
            if (!this.wallet || !this.wallet.publicKey) {
                throw new Error("Wallet not connected");
            }
            
            // Fetch asset data if not provided
            const assetResponse = await fetch(`/api/helius/asset/${assetId}`);
            const assetResult = await assetResponse.json();
            
            if (!assetResult.success || !assetResult.data) {
                throw new Error("Failed to fetch asset data");
            }
            
            const assetData = assetResult.data;
            
            // Ensure we have valid proof data
            if (!proof || !Array.isArray(proof) || proof.length === 0) {
                // Try to extract proof from asset data
                if (assetData.compression?.proof && Array.isArray(assetData.compression.proof)) {
                    proof = assetData.compression.proof;
                    console.log("Using proof from asset data");
                } else {
                    // Attempt to fetch proof directly
                    try {
                        const proofResponse = await fetch(`/api/helius/asset-proof/${assetId}`);
                        const proofData = await proofResponse.json();
                        
                        if (proofData.success && proofData.data && Array.isArray(proofData.data.proof)) {
                            proof = proofData.data.proof;
                            console.log("Using proof from dedicated endpoint");
                        } else {
                            throw new Error("Could not retrieve valid proof data");
                        }
                    } catch (proofError) {
                        console.error("Error fetching proof:", proofError);
                        throw new Error("Failed to get proof data: " + proofError.message);
                    }
                }
            }
            
            // Validate the asset data contains the required compression fields
            if (!assetData.compression || !assetData.compression.tree) {
                throw new Error("Asset data missing required compression information");
            }
            
            // Show notification to user about the burning process
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                    "Processing cNFT Burn", 
                    "Creating burn transaction - watch for wallet approval prompt"
                );
            }
            
            // Debug: Store data for troubleshooting
            if (typeof window !== "undefined" && window.debugInfo) {
                window.debugInfo.assetData = assetData;
                window.debugInfo.proofData = proof;
                window.debugInfo.burnMethod = "direct_burn";
            }
            
            // Gather required information for burn instruction
            const merkleTree = new PublicKey(assetData.compression.tree);
            
            // Calculate the tree authority using the program-derived address
            const [treeAuthority] = PublicKey.findProgramAddressSync(
                [merkleTree.toBuffer()],
                BUBBLEGUM_PROGRAM_ID
            );
            
            // Log key information for debugging
            console.log("Tree authority:", treeAuthority.toString());
            console.log("Merkle tree:", merkleTree.toString());
            console.log("Leaf owner (wallet):", this.wallet.publicKey.toString());
            
            // Extract required compression data fields
            const dataHash = new PublicKey(
                assetData.compression.data_hash || 
                assetData.compression.dataHash || 
                "11111111111111111111111111111111"
            );
            
            const creatorHash = new PublicKey(
                assetData.compression.creator_hash || 
                assetData.compression.creatorHash || 
                "11111111111111111111111111111111"
            );
            
            // Get the root hash from the proof (first element)
            const rootHash = new PublicKey(proof[0]);
            
            // Get the leaf index/nonce for the asset
            const leafIndex = assetData.compression.leaf_id || 
                             assetData.compression.leafId || 
                             0;
            
            // Convert the proof into an array of PublicKeys
            const proofPublicKeys = proof.map(node => new PublicKey(node));
            
            // Create the burn instruction
            console.log("Creating burn instruction with parameters:", {
                treeAuthority: treeAuthority.toString(),
                leafOwner: this.wallet.publicKey.toString(),
                merkleTree: merkleTree.toString(),
                root: rootHash.toString(),
                dataHash: dataHash.toString(),
                creatorHash: creatorHash.toString(),
                nonce: leafIndex,
                index: leafIndex,
                proofLength: proofPublicKeys.length
            });
            
            // Create the burn instruction using mpl-bubblegum
            const burnIx = createBurnInstruction({
                treeAuthority,
                leafOwner: this.wallet.publicKey,
                merkleTree,
                leafDelegate: this.wallet.publicKey, // Same as leaf owner in our case
                root: rootHash,
                dataHash,
                creatorHash,
                nonce: new BN(leafIndex),
                index: leafIndex,
                proof: proofPublicKeys,
            });
            
            // Create a new transaction
            const tx = new Transaction();
            
            // Add compute budget instructions for complex operations (cNFT operations require more compute)
            tx.add(
                ComputeBudgetProgram.setComputeUnitLimit({ 
                    units: 400000 // Higher compute units for cNFT operations
                })
            );
            
            // Add the burn instruction to the transaction
            tx.add(burnIx);
            
            // Set the fee payer and recent blockhash
            tx.feePayer = this.wallet.publicKey;
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = blockhash;
            
            // Sign and send the transaction
            console.log("Requesting wallet to sign transaction with burn instruction");
            
            try {
                // Try using the wallet adapter's sendTransaction method
                let signature;
                
                if (this.wallet.sendTransaction) {
                    signature = await this.wallet.sendTransaction(tx, this.connection, {
                        skipPreflight: false,
                        preflightCommitment: "confirmed"
                    });
                } else if (this.wallet.signTransaction) {
                    // Fall back to sign and send separately
                    const signedTx = await this.wallet.signTransaction(tx);
                    signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
                        skipPreflight: false,
                        preflightCommitment: "confirmed"
                    });
                } else {
                    throw new Error("Wallet doesn't support required transaction signing methods");
                }
                
                console.log("cNFT burn transaction sent with signature:", signature);
                
                // Store the signature for troubleshooting
                if (typeof window !== "undefined" && window.debugInfo) {
                    window.debugInfo.lastCnftSignature = signature;
                    window.debugInfo.lastCnftSuccess = true;
                }
                
                // Wait for confirmation
                try {
                    const confirmation = await this.connection.confirmTransaction({
                        signature,
                        blockhash,
                        lastValidBlockHeight
                    }, "confirmed");
                    
                    console.log("cNFT burn transaction confirmed:", confirmation);
                    
                    return {
                        success: true,
                        signature,
                        message: "Compressed NFT successfully burned!"
                    };
                } catch (confirmError) {
                    // Confirmation might time out but transaction could still succeed
                    console.warn("Confirmation error but transaction may have succeeded:", confirmError);
                    
                    if (typeof window !== "undefined" && window.debugInfo) {
                        window.debugInfo.lastCnftAssumedSuccess = true;
                    }
                    
                    return {
                        success: true,
                        signature,
                        assumed: true,
                        message: "Transaction submitted but confirmation timed out. Check explorer for status."
                    };
                }
            } catch (signError) {
                console.error("Error signing burn transaction:", signError);
                
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
                
                throw new Error(`Burn transaction signing failed: ${signError.message}`);
            }
        } catch (error) {
            console.error("Error in directBurnCNFT:", error);
            
            // Log error for debugging
            if (typeof window !== "undefined" && window.debugInfo) {
                window.debugInfo.lastCnftError = error;
            }
            
            return {
                success: false,
                error: error.message || "Unknown error in direct burn"
            };
        }
    }
    
    // Server-side cNFT burn request method
    async serverBurnCNFT(assetId) {
        console.log(`Initiating server-side burn request for cNFT: ${assetId}`);
        
        try {
            // Check if the wallet is properly set up
            if (!this.wallet || !this.wallet.publicKey) {
                throw new Error("Wallet not properly initialized");
            }
            
            const walletPublicKey = this.wallet.publicKey.toString();
            
            // Show a notification for better user experience
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                    "Sending cNFT Burn Request", 
                    "Preparing to send burn request to server..."
                );
            }
            
            // Create a message that will prove ownership
            const message = `I authorize the burning of my cNFT with ID ${assetId}`;
            
            // Initialize signature variable
            let signedMessage;
            
            // Get a real signature from the wallet
            try {
                // Convert message to Uint8Array
                const messageBytes = new TextEncoder().encode(message);
                
                // Request signature from wallet
                if (this.wallet.signMessage) {
                    // Use native signMessage if available
                    const signature = await this.wallet.signMessage(messageBytes);
                    
                    // Convert signature to base64 string
                    signedMessage = Buffer.from(signature).toString('base64');
                } else {
                    // Fallback if signMessage is not available - use simulated signature
                    console.warn("Wallet does not support signMessage, using simulated signature");
                    signedMessage = "simulated-signature";
                }
            } catch (signError) {
                console.error("Error signing message:", signError);
                
                // Fallback to simulated signature on error
                console.warn("Using simulated signature due to error");
                signedMessage = "simulated-signature";
            }
            
            // Send the burn request to the server
            const response = await fetch('/api/cnft/burn-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    assetId,
                    ownerAddress: walletPublicKey, // Changed to match our updated server endpoint
                    signedMessage
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || "Server burn request failed");
            }
            
            console.log("Server burn request result:", result);
            
            // Store debug info
            if (typeof window !== "undefined" && window.debugInfo) {
                window.debugInfo.lastCnftSuccess = true;
                window.debugInfo.burnMethod = "server";
                window.debugInfo.lastServerResponse = result;
                
                // Store signature if available
                if (result.signature) {
                    window.debugInfo.lastCnftSignature = result.signature;
                    window.debugInfo.lastTransactionUrl = result.explorerUrl || 
                        `https://solscan.io/tx/${result.signature}`;
                }
            }
            
            // Show appropriate notification based on server response
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                if (result.isSimulated) {
                    const assetName = result.assetDetails?.name || "cNFT";
                    const collectionInfo = result.assetDetails?.collection ? 
                        ` from ${result.assetDetails.collection}` : "";
                    
                    window.BurnAnimations.showNotification(
                        "Simulation Mode", 
                        `${assetName}${collectionInfo} burn request processed successfully.\n\nNote: This is a simulation. In real applications, only the collection's tree authority can burn cNFTs, not regular users.`
                    );
                } else if (result.signature) {
                    const shortSig = result.signature.substring(0, 8) + "...";
                    window.BurnAnimations.showNotification(
                        "cNFT Burn Transaction Sent", 
                        `Transaction sent with signature: ${shortSig}. The cNFT is being burned on-chain.`
                    );
                } else {
                    window.BurnAnimations.showNotification(
                        "cNFT Burn Request Received", 
                        "Your request has been queued for processing. The server will burn the cNFT on your behalf."
                    );
                }
            }
            
            // Construct response object
            const responseObject = {
                success: true,
                message: result.message || "Server burn request submitted",
                data: result,
                serverProcessed: true  // Flag to indicate this was handled by the server
            };
            
            // If there's a signature, add it to the response
            if (result.signature) {
                responseObject.signature = result.signature;
                responseObject.explorerUrl = result.explorerUrl;
                responseObject.isSimulated = result.isSimulated || false;
            }
            
            return responseObject;
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
            
            // Show error notification
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                    "cNFT Burn Request Failed", 
                    `Error: ${error.message}`
                );
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
    
    // NEW METHOD: Delegate burning authority to the server
    async delegateCNFT(assetId, assetData) {
        console.log(`Delegating cNFT burning authority: ${assetId}`);
        
        if (typeof window !== "undefined" && window.debugInfo) {
            window.debugInfo.cnftDelegateTriggered = true;
            window.debugInfo.lastCnftData = assetData;
            window.debugInfo.delegateMethod = "server";
            window.debugInfo.delegateStartTime = Date.now();
        }
        
        // Show a notification that we're processing the delegation
        if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
                "Processing cNFT Delegation", 
                "Preparing to delegate burning authority to server"
            );
        }
        
        try {
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                throw new Error("Wallet not connected or missing signTransaction method");
            }
            
            // Use our server's endpoint to get delegation data
            const delegationResponse = await fetch('/api/cnft/delegate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ownerAddress: this.wallet.publicKey.toString(),
                    assetId,
                    // Our server public key
                    delegatePublicKey: 'HomZPVRkJsD8yRJyGVYBfCsLJ6YBGnqZRpMDBDVzKjh6'
                })
            });
            
            const delegationData = await delegationResponse.json();
            
            if (!delegationData.success) {
                throw new Error(`Server error: ${delegationData.error || 'Unknown error'}`);
            }
            
            console.log("Delegation data received:", delegationData);
            
            // Show delegation status
            if (delegationData.isSimulated) {
                if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                    window.BurnAnimations.showNotification(
                        "Delegation Simulation", 
                        "This is a simulation. In production, you would delegate authority to the server for burning."
                    );
                }
                
                return {
                    success: true,
                    isSimulated: true,
                    message: delegationData.message || "Delegation simulated - tree authority required for real operation"
                };
            }
            
            // In a real implementation (with tree authority):
            // 1. Get the proof data from delegationData
            const proofData = delegationData.data.requiredProof;
            
            // 2. Convert the proof to proper format
            const merkleProof = proofData.proof.map(node => new PublicKey(node));
            
            // 3. Create transaction to delegate authority
            const tx = new Transaction();
            
            // Add compute budget instructions for complex operations
            tx.add(
                ComputeBudgetProgram.setComputeUnitLimit({ 
                    units: 400000 // Higher compute units for cNFT operations
                })
            );
            
            // Create the tree public key
            const treePublicKey = new PublicKey(delegationData.data.treeId);
            
            // Get the tree authority - derived from the tree ID
            const treeAuthority = new PublicKey(delegationData.data.treeAuthority);
            
            console.log("Tree authority:", treeAuthority.toString());
            
            // Get compression data from proof
            const root = new PublicKey(proofData.root);
            const dataHash = new PublicKey(assetData?.compression?.data_hash || "11111111111111111111111111111111");
            const creatorHash = new PublicKey(assetData?.compression?.creator_hash || "11111111111111111111111111111111");
            const leafIndex = Number(assetData?.compression?.leaf_id || assetData?.compression?.leafId || 0);
            
            // The server's public key to delegate to
            const serverDelegateKey = new PublicKey(delegationData.data.delegate);
            
            // Required system program accounts
            const logWrapper = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
            const compressionProgram = new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
            
            // Create delegate instruction with all accounts and data
            // In a real implementation, we would import the delegate function from @metaplex-foundation/mpl-bubblegum
            // For simulation, we'll just log the important parts:
            console.log({
                delegateInstruction: {
                    treeAuthority: treeAuthority.toString(),
                    leafOwner: this.wallet.publicKey.toString(),
                    previousDelegate: this.wallet.publicKey.toString(),
                    newDelegate: serverDelegateKey.toString(),
                    merkleTree: treePublicKey.toString(),
                    proofLength: merkleProof.length
                }
            });
            
            // Set the fee payer and recent blockhash
            tx.feePayer = this.wallet.publicKey;
            const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = blockhash;
            
            console.log("Delegation transaction prepared with blockhash:", blockhash);
            
            // In a real implementation with the delegate instruction:
            // tx.add(delegateInstruction);
            // const signedTx = await this.wallet.signTransaction(tx);
            // const signature = await this.connection.sendRawTransaction(signedTx.serialize());
            
            // Return simulated success
            return {
                success: true,
                isSimulated: true,
                message: "Delegation simulated - ready for asset burn",
                data: {
                    assetId,
                    delegatedTo: serverDelegateKey.toString()
                }
            };
            
        } catch (error) {
            console.error("Error in delegateCNFT:", error);
            
            if (typeof window !== "undefined" && window.debugInfo) {
                window.debugInfo.lastCnftError = error.message;
            }
            
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                    "Delegation Error", 
                    `Failed to delegate: ${error.message}`
                );
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Transfer a cNFT to a project-managed wallet instead of burning it
     * @param {string} assetId - The asset ID of the cNFT to transfer
     * @param {string} destinationAddress - The wallet address to transfer the cNFT to (defaults to project wallet)
     * @returns {Promise<object>} - The result of the transfer operation
     */
    async transferCNFT(assetId, destinationAddress = null) {
        console.log(`Initiating transfer of cNFT: ${assetId} to project wallet`);
        
        try {
            if (!this.wallet.publicKey || !this.wallet.signMessage) {
                throw new Error('Wallet not connected or missing signMessage method');
            }
            
            const walletPublicKey = this.wallet.publicKey.toString();
            
            // Show a notification for better user experience
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                    "Sending cNFT Transfer Request", 
                    "Preparing to send transfer request to server..."
                );
            }
            
            // Create a message that will prove ownership
            const message = `I authorize the transfer of my cNFT with ID ${assetId}`;
            
            // Initialize signature variable
            let signedMessage;
            
            // Get a real signature from the wallet
            try {
                // Convert message to Uint8Array
                const messageBytes = new TextEncoder().encode(message);
                
                // Request signature from wallet
                if (this.wallet.signMessage) {
                    // Use native signMessage if available
                    const signature = await this.wallet.signMessage(messageBytes);
                    
                    // Convert signature to base64 string
                    signedMessage = Buffer.from(signature).toString('base64');
                } else {
                    // Fallback if signMessage is not available - use simulated signature
                    console.warn("Wallet does not support signMessage, using simulated signature");
                    signedMessage = "simulated-signature";
                }
            } catch (signError) {
                console.error("Error signing message:", signError);
                
                // Fallback to simulated signature on error
                console.warn("Using simulated signature due to error");
                signedMessage = "simulated-signature";
            }
            
            // Send the transfer request to the server
            const response = await fetch('/api/cnft/transfer-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    assetId,
                    ownerAddress: walletPublicKey,
                    destinationAddress: destinationAddress,
                    signedMessage
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || "Server transfer request failed");
            }
            
            console.log("Server transfer request result:", result);
            
            // Store debug info
            if (typeof window !== "undefined" && window.debugInfo) {
                window.debugInfo.lastCnftSuccess = true;
                window.debugInfo.transferMethod = "server";
                window.debugInfo.lastServerResponse = result;
                
                // Store signature if available
                if (result.signature) {
                    window.debugInfo.lastCnftSignature = result.signature;
                    window.debugInfo.lastTransactionUrl = result.explorerUrl || 
                        `https://solscan.io/tx/${result.signature}`;
                }
            }
            
            // Show appropriate notification based on server response
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                if (result.isSimulated) {
                    const assetName = result.assetDetails?.name || "cNFT";
                    const collectionInfo = result.assetDetails?.collection ? 
                        ` from ${result.assetDetails.collection}` : "";
                    
                    window.BurnAnimations.showNotification(
                        "Simulation Mode", 
                        `${assetName}${collectionInfo} transfer request processed successfully.\n\nNote: This is a simulation. In real applications, the transfer would be processed by the server.`
                    );
                } else if (result.signature) {
                    const shortSig = result.signature.substring(0, 8) + "...";
                    window.BurnAnimations.showNotification(
                        "cNFT Transfer Transaction Sent", 
                        `Transaction sent with signature: ${shortSig}. The cNFT is being transferred on-chain.`
                    );
                } else {
                    window.BurnAnimations.showNotification(
                        "cNFT Transfer Request Received", 
                        "Your request has been queued for processing. The server will transfer the cNFT on your behalf to the project wallet."
                    );
                }
            }
            
            // Construct response object
            const responseObject = {
                success: true,
                message: result.message || "Server transfer request submitted",
                data: result,
                serverProcessed: true,  // Flag to indicate this was handled by the server
                signature: result.signature,
                explorerUrl: result.explorerUrl,
                isSimulated: result.isSimulated || false
            };
            
            return responseObject;
        } catch (error) {
            console.error("Error in transferCNFT:", error);
            
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
            
            // Show error notification
            if (typeof window !== "undefined" && window.BurnAnimations?.showNotification) {
                window.BurnAnimations.showNotification(
                    "cNFT Transfer Request Failed", 
                    `Error: ${error.message}`
                );
            }
            
            return {
                success: false,
                error: error.message || "Unknown error in transferCNFT",
                cancelled: false
            };
        }
    }
}

module.exports = { CNFTHandler };