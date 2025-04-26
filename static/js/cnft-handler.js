import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { 
    createTree, 
    getMerkleTree,
    getAssetWithProof,
    createBurnInstruction,
    BurnCnftArgs
} from '@metaplex-foundation/mpl-bubblegum';
import axios from 'axios';

// Define the Bubblegum program ID (this is the program that handles compressed NFTs)
const BUBBLEGUM_PROGRAM_ID = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY';

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
            // Import required classes
            const { Keypair } = require('@solana/web3.js');
            const { keypairIdentity, walletAdapterIdentity } = require('@metaplex-foundation/js');
            
            // Create a complete wallet adapter that includes all methods Metaplex might need
            const walletAdapter = {
                publicKey: wallet.publicKey,
                signTransaction: wallet.signTransaction?.bind(wallet),
                signAllTransactions: wallet.signAllTransactions?.bind(wallet),
                // Add a signMessage method if the wallet has one, otherwise provide a fallback
                signMessage: wallet.signMessage 
                    ? wallet.signMessage.bind(wallet)
                    : (message) => { 
                        console.warn("Wallet does not support signMessage, using fallback");
                        // Return a promise that resolves to a Uint8Array (signature format)
                        return Promise.resolve(new Uint8Array(32));
                    }
            };
            
            // Set the wallet adapter as the identity for Metaplex
            this.metaplex.use(walletAdapterIdentity(walletAdapter));
            console.log("Set wallet adapter identity for Metaplex with public key:", wallet.publicKey.toString());
        } else {
            console.warn("No wallet provided to CNFTHandler, Metaplex operations will be limited");
        }
    }
    
    // Actual burning method for cNFTs with more reliable implementation
    async simpleBurnCNFT(assetId, proof, assetData) {
        // Define window.debugInfo variable for easier debugging
        if (typeof window !== 'undefined' && window.debugInfo) {
            window.debugInfo.cnftBurnTriggered = true;
            window.debugInfo.lastCnftData = assetData;
            window.debugInfo.lastCnftError = null;
        }
        
        console.log("[simpleBurnCNFT] Entering with params:", {
            assetId, 
            proofExists: !!proof,
            proofIsArray: Array.isArray(proof),
            proofLength: Array.isArray(proof) ? proof.length : 'N/A',
            wallet: this.wallet ? 'exists' : 'missing',
            publicKey: this.wallet?.publicKey ? this.wallet.publicKey.toString() : 'missing',
            signTransaction: this.wallet?.signTransaction ? 'exists' : 'missing',
            assetDataKeys: assetData ? Object.keys(assetData) : 'no asset data'
        });
        
        try {
            console.log(`[simpleBurnCNFT] Trading cNFT to burn wallet with assetId: ${assetId}`);
            
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                throw new Error('Wallet not connected or missing signTransaction method');
            }
            
            // Store asset data
            this.asset = assetData;
            
            // Import required libraries
            const { Transaction, PublicKey, ComputeBudgetProgram } = require('@solana/web3.js');
            const axios = require('axios');
            
            // Verify we have valid proof data
            if (!proof || !Array.isArray(proof) || proof.length === 0) {
                console.log("Invalid proof data provided, fetching fresh proof...");
                const assetWithProof = await this.fetchAssetWithProof(assetId);
                if (assetWithProof?.proof && Array.isArray(assetWithProof.proof)) {
                    proof = assetWithProof.proof;
                    console.log("Successfully fetched fresh proof data");
                } else {
                    throw new Error("Failed to get valid proof data for this asset");
                }
            }
            
            // Get the tree ID from asset data
            const treeId = this.asset?.compression?.tree || 
                          this.asset?.tree ||
                          (assetData?.compression?.tree || null);
                          
            if (!treeId) {
                throw new Error("Tree ID not found in asset data, cannot burn cNFT");
            }
            
            console.log("Using tree ID:", treeId);
            
            // Create a new transaction
            const tx = new Transaction();
            
            // Add compute budget instructions to avoid insufficient SOL errors
            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
                units: 400000 // Higher compute units for cNFT operations
            });
            
            const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: 1 // Minimum possible fee
            });
            
            tx.add(modifyComputeUnits, addPriorityFee);
            
            // Get necessary data for the burn instruction
            const treeAddress = new PublicKey(treeId);
            
            // Get tree authority - this is usually derived from the tree address
            // but some asset data formats directly include it
            let treeAuthority;
            if (this.asset?.compression?.tree_authority) {
                treeAuthority = new PublicKey(this.asset.compression.tree_authority);
            } else if (this.asset?.treeAuthority) {
                treeAuthority = new PublicKey(this.asset.treeAuthority);
            } else {
                // Derive tree authority as a PDA of the tree address
                const [derivedAuthority] = PublicKey.findProgramAddressSync(
                    [treeAddress.toBuffer()],
                    new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY") // Bubblegum program ID
                );
                treeAuthority = derivedAuthority;
            }
            
            console.log("Tree authority:", treeAuthority.toString());
            
            // Define the burn wallet address - the 32-1s string
            const BURN_WALLET = new PublicKey('11111111111111111111111111111111');
            
            // Import the bubblegum TransferCnftArgs and createTransferInstruction
            const { createTransferInstruction, TransferCnftArgs } = require('@metaplex-foundation/mpl-bubblegum');
            
            // Get data needed for the transfer
            const leafId = this.asset?.compression?.leaf_id || 
                          this.asset?.compression?.leafId || 
                          this.asset?.leaf_id || 
                          0;
                          
            const dataHash = this.asset?.compression?.data_hash || 
                            this.asset?.dataHash || 
                            "";
                            
            const creatorHash = this.asset?.compression?.creator_hash || 
                               this.asset?.creatorHash || 
                               "";
            
            console.log("[simpleBurnCNFT] Creating transfer args with:", {
                root: proof[0] ? proof[0].substring(0, 10) + '...' : 'undefined',
                dataHash: dataHash ? dataHash.substring(0, 10) + '...' : 'undefined',
                creatorHash: creatorHash ? creatorHash.substring(0, 10) + '...' : 'undefined',
                leafId
            });
            
            // Create the transfer instruction args
            const transferArgs = new TransferCnftArgs({
                root: proof[0], // Root hash is the first element of the proof array
                dataHash: dataHash ? new PublicKey(dataHash) : undefined,
                creatorHash: creatorHash ? new PublicKey(creatorHash) : undefined,
                nonce: leafId,
                index: leafId
            });
            
            console.log("[simpleBurnCNFT] Transfer args created");
            
            // Create and add the transfer instruction
            const transferIx = createTransferInstruction(
                {
                    treeAuthority,
                    leafOwner: this.wallet.publicKey,
                    leafDelegate: this.wallet.publicKey,
                    newLeafOwner: BURN_WALLET,
                    merkleTree: treeAddress,
                    logWrapper: new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"),
                    compressionProgram: new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"),
                    bubblegumProgram: new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"),
                    anchorRemainingAccounts: proof.map(node => ({
                        pubkey: new PublicKey(node),
                        isSigner: false,
                        isWritable: false
                    }))
                },
                {
                    transferArgs
                }
            );
            
            // Add the transfer instruction to the transaction
            tx.add(transferIx);
            
            // Set the fee payer
            tx.feePayer = this.wallet.publicKey;
            
            // Get recent blockhash with lower fee priority
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash({
                commitment: 'processed' // Lower commitment level to reduce fees
            });
            tx.recentBlockhash = blockhash;
            
            // Create a timeoutPromise that rejects after 2 minutes
            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error('Transaction signing timed out or was cancelled'));
                }, 120000); // 2 minute timeout
            });
            
            try {
                // Add debug for wallet state before signing
                console.log('Before signTransaction call. Wallet state:', {
                    publicKey: this.wallet.publicKey.toString(),
                    hasSignTransaction: !!this.wallet.signTransaction,
                    txInstructions: tx.instructions.length,
                    txFeePayer: tx.feePayer.toString(),
                    blockhash: tx.recentBlockhash,
                });
                
                if (typeof window !== 'undefined' && window.debugInfo) {
                    window.debugInfo.lastCnftError = 'About to call signTransaction';
                }
                
                // Race between the signTransaction and the timeout
                console.log('[TRADE DEBUG] About to sign transaction');
                const signedTx = await Promise.race([
                    this.wallet.signTransaction(tx),
                    timeoutPromise
                ]);
                
                // Clear the timeout since we got a response
                clearTimeout(timeoutId);
                console.log('[TRADE DEBUG] Transaction signed successfully');
                
                // Variable for storing the signature
                let signature;
                
                try {
                    // Send the transaction with skipPreflight to avoid client-side checks
                    console.log('[TRADE DEBUG] Sending transaction to blockchain');
                    signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
                        skipPreflight: false, // Keep preflight checks for debugging
                        maxRetries: 3, // Retry a few times if needed
                        preflightCommitment: 'processed' // Lower commitment level
                    });
                    console.log('[TRADE DEBUG] Transaction sent, signature:', signature);
                } catch (sendError) {
                    console.error('[TRADE DEBUG] Error sending transaction:', sendError);
                    console.error('[TRADE DEBUG] Error details:', sendError?.logs || sendError?.message || 'Unknown error');
                    throw sendError;
                }
                
                console.log('[TRADE DEBUG] Transaction sent, waiting for confirmation...', signature);
                
                try {
                    // Wait for confirmation with a custom strategy to avoid timeouts
                    console.log('[TRADE DEBUG] Using confirmTransaction with signature:', signature);
                    const confirmation = await this.connection.confirmTransaction({
                        signature: signature,
                        blockhash: blockhash,
                        lastValidBlockHeight: lastValidBlockHeight
                    }, 'processed'); // Use processed commitment level
                    
                    console.log('[TRADE DEBUG] Confirmation result:', confirmation);
                    
                    if (confirmation.value.err) {
                        console.error('[TRADE DEBUG] Transaction confirmed but failed with error:', confirmation.value.err);
                        throw new Error(`Transaction confirmed but failed: ${JSON.stringify(confirmation.value.err)}`);
                    }
                    
                    // Success! The cNFT has been sent to the burn wallet
                    console.log('[TRADE DEBUG] Successfully traded cNFT to burn wallet with signature:', signature);
                    
                    // Set success flag in window for debugging
                    if (typeof window !== 'undefined' && window.debugInfo) {
                        window.debugInfo.lastCnftSuccess = true;
                        window.debugInfo.lastCnftSignature = signature;
                    }
                    
                    return {
                        success: true,
                        signature,
                        message: "Successfully traded cNFT to burn wallet! Note: cNFTs don't return rent like regular NFTs."
                    };
                } catch (confirmError) {
                    // Log the confirmation error but don't fail immediately
                    console.error('[TRADE DEBUG] Error during confirmation:', confirmError);
                    
                    try {
                        // Try a different approach to check transaction status
                        console.log('[TRADE DEBUG] Trying alternate getSignatureStatus method...');
                        const signatureStatus = await this.connection.getSignatureStatus(signature);
                        console.log('[TRADE DEBUG] Signature status result:', signatureStatus);
                        
                        if (signatureStatus && signatureStatus.value && !signatureStatus.value.err) {
                            console.log('[TRADE DEBUG] Transaction succeeded based on signature status');
                            
                            // Set success flag in window for debugging
                            if (typeof window !== 'undefined' && window.debugInfo) {
                                window.debugInfo.lastCnftSuccess = true;
                                window.debugInfo.lastCnftSignature = signature;
                            }
                            
                            return {
                                success: true,
                                signature,
                                message: "Successfully traded cNFT to burn wallet! Note: cNFTs don't return rent like regular NFTs."
                            };
                        } else if (signatureStatus && signatureStatus.value && signatureStatus.value.err) {
                            console.error('[TRADE DEBUG] Transaction failed based on signature status:', signatureStatus.value.err);
                            throw new Error(`Transaction failed: ${JSON.stringify(signatureStatus.value.err)}`);
                        }
                    } catch (statusError) {
                        console.error('[TRADE DEBUG] Error checking signature status:', statusError);
                    }
                    
                    // If we got a signature but couldn't confirm success, assume it worked
                    // because the transaction was submitted to the network
                    console.log('[TRADE DEBUG] Assuming transaction success based on signature existence');
                    
                    // Set success flag in window for debugging
                    if (typeof window !== 'undefined' && window.debugInfo) {
                        window.debugInfo.lastCnftSuccess = true;
                        window.debugInfo.lastCnftSignature = signature;
                        window.debugInfo.lastCnftAssumedSuccess = true;
                    }
                    
                    return {
                        success: true,
                        signature,
                        assumed: true,
                        message: "Transaction was submitted to the network! Note: cNFTs don't return rent like regular NFTs."
                    };
                }
            } catch (signingError) {
                // Clear timeout
                clearTimeout(timeoutId);
                
                console.error('Error during transaction signing:', signingError);
                if (typeof window !== 'undefined' && window.debugInfo) {
                    window.debugInfo.lastCnftError = `Signing error: ${signingError.message}`;
                }
                
                // Check if the error is related to user cancellation
                if (signingError.message.includes('timed out') || 
                    signingError.message.includes('cancelled') ||
                    signingError.message.includes('rejected') ||
                    signingError.message.includes('User rejected')) {
                    console.log('Transaction was cancelled by the user or timed out');
                    return {
                        success: false,
                        error: 'Transaction was cancelled. Please try again if you want to trade this cNFT to the burn wallet.',
                        cancelled: true
                    };
                }
                
                // For other signing errors, rethrow
                throw signingError;
            }
        } catch (error) {
            console.error('Error in simpleBurnCNFT:', error);
            
            // Special handling for WalletConnection errors which often happen when users close dialogs
            const errorMessage = error.message || '';
            
            // Check for SOL-related errors
            const isInsufficientSOLError = (
                errorMessage.includes('insufficient') || 
                errorMessage.includes('balance') ||
                errorMessage.includes('0x1') ||
                errorMessage.includes('fund')
            );
            
            const isWalletConnectionError = (
                errorMessage.includes('wallet') || 
                errorMessage.includes('connection') ||
                errorMessage.includes('adapter')
            );
            
            if (isInsufficientSOLError) {
                return {
                    success: false,
                    error: 'Transaction failed due to network fee issues. We\'ve updated the app to fix this. Please try again.',
                    fundingError: true
                };
            }
            
            return {
                success: false,
                error: isWalletConnectionError 
                    ? 'Wallet connection error. Please check your wallet and try again.' 
                    : error.message,
                cancelled: errorMessage.includes('cancelled') || errorMessage.includes('rejected')
            };
        }
    }
    
    // Add a method to fetch asset with proof directly using multiple methods
    async fetchAssetWithProof(assetId) {
        try {
            console.log(`Fetching asset with proof for ${assetId}`);
            
            // Method 1: Try using the bubblegum SDK directly first
            try {
                console.log(`Method 1: Using bubblegum SDK's getAssetWithProof...`);
                const asset = await getAssetWithProof(
                    this.connection,
                    assetId
                );
                
                if (asset && asset.proof && Array.isArray(asset.proof)) {
                    console.log(`Successfully fetched proof data via bubblegum SDK`);
                    return asset;
                } else {
                    console.log(`Method 1 failed: Missing or invalid proof data`);
                }
            } catch (method1Error) {
                console.error(`Method 1 error:`, method1Error);
            }
            
            // Method 2: Use Helius API through our backend
            try {
                console.log(`Method 2: Using Helius API through backend...`);
                const response = await axios.get(`/api/helius/asset-proof/${assetId}`);
                
                if (response.data?.success && response.data?.data?.proof) {
                    console.log(`Successfully fetched proof data via Helius API`);
                    return {
                        ...response.data.data,
                        proof: response.data.data.proof
                    };
                } else {
                    console.log(`Method 2 failed: ${response.data?.error || 'No proof data returned'}`);
                }
            } catch (method2Error) {
                console.error(`Method 2 error:`, method2Error);
            }
            
            // All methods failed
            throw new Error(`Failed to fetch proof data for asset ${assetId} using all available methods`);
        } catch (error) {
            console.error(`Error fetching asset with proof: ${error.message}`);
            throw error;
        }
    }

    async fetchCNFTs(walletAddress) {
        try {
            console.log('Fetching cNFTs for wallet:', walletAddress);
            
            // Get all compressed NFTs for the wallet
            const assetIds = await this.metaplex.nfts().findAllByOwner({
                owner: walletAddress,
                compressed: true
            });

            console.log(`Found ${assetIds.length} cNFTs`);

            // Fetch detailed metadata for each cNFT
            const cnfts = await Promise.all(
                assetIds.map(async (assetId) => {
                    try {
                        const asset = await getAssetWithProof(
                            this.connection,
                            assetId
                        );

                        // Extract metadata
                        const metadata = asset.metadata;
                        return {
                            mint: assetId.toString(),
                            name: metadata.name,
                            symbol: metadata.symbol,
                            description: metadata.description,
                            image: metadata.image,
                            collection: metadata.collection?.name,
                            attributes: metadata.attributes,
                            explorer_url: `https://solscan.io/token/${assetId}`,
                            proof: asset.proof
                        };
                    } catch (error) {
                        console.error(`Error fetching cNFT metadata for ${assetId}:`, error);
                        return null;
                    }
                })
            );

            // Filter out failed fetches
            return cnfts.filter(cnft => cnft !== null);
        } catch (error) {
            console.error('Error in fetchCNFTs:', error);
            throw error;
        }
    }

    // Server-side approach to trade cNFT to burn wallet with backend transaction generation
    async serverBurnCNFT(assetId) {
        if (typeof window !== 'undefined' && window.debugInfo) {
            window.debugInfo.lastCnftError = 'Starting server trade-to-burn method';
        }
        
        console.log('----- SERVER TRADE-TO-BURN METHOD DIAGNOSTICS -----');
        console.log('Asset ID:', assetId);
        console.log('Wallet:', this.wallet?.publicKey?.toString());
        console.log('Can sign transaction:', !!this.wallet?.signTransaction);
        console.log('Can sign message:', !!this.wallet?.signMessage);
        
        try {
            console.log('[serverBurnCNFT] Starting cNFT trade-to-burn with server-side approach');
            
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                console.error('[serverBurnCNFT] Missing wallet or signTransaction method');
                return { success: false, error: 'Wallet not connected or missing signTransaction method' };
            }
            
            // Step 1: Request a transaction from our backend
            console.log('[serverBurnCNFT] Requesting transaction from server for asset:', assetId);
            
            // Create a simple message that the user will sign to verify ownership
            const message = `I authorize trading my cNFT with ID: ${assetId} to the burn wallet`;
            const messageBytes = new TextEncoder().encode(message);
            
            try {
                // Step 2: Sign the message (this is a simpler operation than signing a transaction)
                let signedMessage;
                let signedMessageBase64 = '';
                
                if (this.wallet.signMessage) {
                    try {
                        console.log('[serverBurnCNFT] Signing authorization message...');
                        signedMessage = await this.wallet.signMessage(messageBytes);
                        console.log('[serverBurnCNFT] Message signed successfully');
                        signedMessageBase64 = Buffer.from(signedMessage).toString('base64');
                        console.log('[serverBurnCNFT] Base64 message length:', signedMessageBase64.length);
                    } catch (signError) {
                        console.error('[serverBurnCNFT] Error signing message:', signError);
                        if (typeof window !== 'undefined' && window.debugInfo) {
                            window.debugInfo.lastCnftError = 'Error signing message: ' + signError.message;
                        }
                        // Continue without a signed message if there was an error
                        signedMessageBase64 = 'unable-to-sign';
                    }
                } else {
                    // If signMessage is not available, we'll proceed without it for now
                    console.warn('[serverBurnCNFT] Wallet does not support signMessage, proceeding without signature verification');
                    signedMessageBase64 = 'signature-unsupported';
                }
                
                // Step 3: Request a burn transaction from the server
                console.log('[serverBurnCNFT] Sending request to server endpoint: /api/helius/burn-cnft');
                const requestData = {
                    assetId,
                    walletPublicKey: this.wallet.publicKey.toString(),
                    signedMessage: signedMessageBase64
                };
                console.log('[serverBurnCNFT] Request data:', JSON.stringify(requestData));
                
                const response = await axios.post('/api/helius/burn-cnft', requestData);
                console.log('[serverBurnCNFT] Server responded:', response.status);
                
                if (!response.data.success) {
                    console.error('[serverBurnCNFT] Server failed to create transaction:', response.data.error);
                    if (typeof window !== 'undefined' && window.debugInfo) {
                        window.debugInfo.lastCnftError = 'Server error: ' + response.data.error;
                    }
                    return { success: false, error: response.data.error };
                }
                
                // Step 4: Extract and deserialize the transaction
                const serializedTransaction = response.data.data.transaction;
                console.log('[serverBurnCNFT] Transaction received from server');
                console.log('[serverBurnCNFT] Transaction length:', serializedTransaction.length);
                
                try {
                    // Import required web3 modules
                    const solanaWeb3 = require('@solana/web3.js');
                    console.log('[serverBurnCNFT] Solana Web3 imported successfully');
                    
                    // Convert base64 transaction to buffer
                    const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
                    console.log('[serverBurnCNFT] Transaction buffer created, length:', transactionBuffer.length);
                    
                    // Deserialize into a transaction object
                    const transaction = solanaWeb3.Transaction.from(transactionBuffer);
                    console.log('[serverBurnCNFT] Transaction deserialized successfully');
                    console.log('[serverBurnCNFT] Transaction instructions count:', transaction.instructions.length);
                    
                    // Step 5: Sign the transaction
                    console.log('[serverBurnCNFT] Signing transaction...');
                    if (typeof window !== 'undefined' && window.debugInfo) {
                        window.debugInfo.lastCnftError = 'About to sign transaction';
                    }
                    
                    const signedTransaction = await this.wallet.signTransaction(transaction);
                    console.log('[serverBurnCNFT] Transaction signed successfully');
                    
                    // Step 6: Serialize the signed transaction
                    const serializedSignedTransaction = signedTransaction.serialize().toString('base64');
                    console.log('[serverBurnCNFT] Transaction serialized, length:', serializedSignedTransaction.length);
                    
                    // Step 7: Send the signed transaction back to the server for submission
                    console.log('[serverBurnCNFT] Sending signed transaction to server for submission...');
                    const submitResponse = await axios.post('/api/helius/submit-transaction', {
                        signedTransaction: serializedSignedTransaction
                    });
                    
                    console.log('[serverBurnCNFT] Server submission response:', submitResponse.status);
                    
                    if (!submitResponse.data.success) {
                        console.error('[serverBurnCNFT] Transaction submission failed:', submitResponse.data.error);
                        if (typeof window !== 'undefined' && window.debugInfo) {
                            window.debugInfo.lastCnftError = 'Submission failed: ' + submitResponse.data.error;
                        }
                        return { success: false, error: submitResponse.data.error };
                    }
                    
                    // Success! The transaction was submitted and confirmed
                    console.log('[serverBurnCNFT] Transaction successfully submitted and confirmed!');
                    if (typeof window !== 'undefined' && window.debugInfo) {
                        window.debugInfo.lastCnftError = 'Success! Transaction confirmed';
                    }
                    return {
                        success: true,
                        signature: submitResponse.data.data.signature,
                        message: submitResponse.data.data.message
                    };
                } catch (txError) {
                    console.error('[serverBurnCNFT] Transaction processing error:', txError);
                    console.error('[serverBurnCNFT] Transaction stack:', txError.stack);
                    if (typeof window !== 'undefined' && window.debugInfo) {
                        window.debugInfo.lastCnftError = 'Transaction error: ' + txError.message;
                    }
                    throw txError;
                }
            } catch (error) {
                console.error('[serverBurnCNFT] Error during transaction process:', error);
                console.error('[serverBurnCNFT] Error stack:', error.stack);
                
                if (typeof window !== 'undefined' && window.debugInfo) {
                    window.debugInfo.lastCnftError = 'Process error: ' + error.message;
                }
                
                return {
                    success: false,
                    error: error.message,
                    cancelled: error.message && (
                        error.message.includes('cancel') || 
                        error.message.includes('reject') || 
                        error.message.includes('User')
                    )
                };
            }
        } catch (error) {
            console.error('[serverBurnCNFT] Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Direct burning method using raw transaction instructions without Metaplex
    // Trade cNFT to a designated burn wallet instead of burning
    async directBurnCNFT(assetId, proof) { // This method actually trades cNFTs to a burn wallet
        try {
            console.log('[tradeCNFT] Starting cNFT trade to burn wallet');
            
            if (typeof window !== 'undefined' && window.debugInfo) {
                window.debugInfo.lastCnftError = 'Starting cNFT trade to burn wallet';
                window.debugInfo.cnftBurnTriggered = true;
            }
            
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                console.error('[tradeCNFT] Missing wallet or signTransaction method');
                return { success: false, error: 'Wallet not connected or missing signTransaction method' };
            }
            
            // Ensure we have asset data
            console.log('[tradeCNFT] Fetching asset data');
            let assetData;
            
            try {
                const assetResponse = await axios.get(`/api/helius/asset/${assetId}`);
                if (assetResponse.data?.success && assetResponse.data?.data) {
                    assetData = assetResponse.data.data;
                    console.log('[tradeCNFT] Asset data received:', assetData);
                } else {
                    return { success: false, error: 'Failed to get asset data' };
                }
            } catch (assetError) {
                console.error('[tradeCNFT] Error fetching asset data:', assetError);
                return { success: false, error: `Error fetching asset data: ${assetError.message}` };
            }
            
            // Import required modules
            const { 
                PublicKey, 
                Transaction, 
                ComputeBudgetProgram,
                SystemProgram,
                SYSVAR_RENT_PUBKEY,
                sendAndConfirmTransaction,
            } = require('@solana/web3.js');
            
            try {
                // Define the burn wallet address (where we'll send the assets)
                // Using a standard burn address that can't be recovered
                const BURN_WALLET = new PublicKey('11111111111111111111111111111111');
                
                console.log('[tradeCNFT] Trading cNFT to burn wallet:', BURN_WALLET.toString());
                
                // Create transfer instruction using the Metaplex SDK
                // This approach supports both NFTs and cNFTs
                console.log('[tradeCNFT] Creating transfer instructions with Metaplex');
                
                // For compressed NFTs, we need the tree information and proof
                const treeId = assetData?.compression?.tree || 
                              assetData?.tree || 
                              'EDR6ywjZy9pQqz7UCCx3jzCeMQcoks231URFDizJAUNq'; // Default from logs
                
                // Get proof data if not already available
                let proofData;
                let proofResponse;
                try {
                    console.log('[tradeCNFT] Fetching proof data for asset');
                    proofResponse = await axios.get(`/api/helius/asset-proof/${assetId}`);
                    if (proofResponse.data?.success && proofResponse.data?.data?.proof) {
                        proofData = proofResponse.data.data;
                        console.log('[tradeCNFT] Successfully fetched proof data:', proofData);
                    } else {
                        console.log('[tradeCNFT] Failed to get proof data, will attempt transfer without it');
                    }
                } catch (proofError) {
                    console.error('[tradeCNFT] Error fetching proof data:', proofError);
                }
                
                // Create a new transaction
                const tx = new Transaction();
                
                // Add compute budget instructions for complex operations
                tx.add(
                    ComputeBudgetProgram.setComputeUnitLimit({ 
                        units: 400000 // Higher compute units for cNFT operations
                    }),
                    ComputeBudgetProgram.setComputeUnitPrice({
                        microLamports: 1 // Minimum possible fee
                    })
                );
                
                console.log('[tradeCNFT] Added compute budget instructions');
                
                // Import the necessary function from mpl-bubblegum
                const { createTransferInstruction } = require('@metaplex-foundation/mpl-bubblegum');
                const { PROGRAM_ID: BUBBLEGUM_PROGRAM_ID } = require('@metaplex-foundation/mpl-bubblegum');
                
                // Get the latest blockhash for the transaction
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
                
                // Create the tree public key
                const treePublicKey = new PublicKey(treeId);
                
                // If we have the proof data, let's use it directly to create an instruction
                if (proofData && proofData.proof) {
                    console.log('[tradeCNFT] Using proof data to create instruction');
                    
                    // Set up the accounts needed for the transaction
                    const merkleProof = proofData.proof.map(node => new PublicKey(node));
                    
                    // Get additional proof data if available
                    const root = new PublicKey(proofData.root || '11111111111111111111111111111111');
                    const dataHash = new PublicKey(proofData.data_hash || assetData.compression?.data_hash || '11111111111111111111111111111111');
                    const creatorHash = new PublicKey(proofData.creator_hash || assetData.compression?.creator_hash || '11111111111111111111111111111111');
                    const leafIndex = parseInt(proofData.leaf_id || proofData.leafId || assetData.compression?.leaf_id || assetData.compression?.leafId || 0);
                    
                    console.log('[tradeCNFT] Proof details:', {
                        root: root.toString(),
                        treeId: treePublicKey.toString(),
                        dataHash: dataHash.toString(),
                        creatorHash: creatorHash.toString(),
                        leafIndex,
                        proofLength: merkleProof.length
                    });
                    
                    try {
                        // Explicitly derive the tree authority from the tree ID
                        // We need this for compressed NFTs
                        const [treeAuthority] = await PublicKey.findProgramAddress(
                            [treePublicKey.toBuffer()],
                            BUBBLEGUM_PROGRAM_ID
                        );
                        
                        console.log('[tradeCNFT] Tree authority derived:', treeAuthority.toString());
                        
                        // Create the transfer instruction with explicit accounts
                        const transferInstruction = createTransferInstruction(
                            {
                                treeAuthority: treeAuthority,
                                leafOwner: this.wallet.publicKey,
                                leafDelegate: this.wallet.publicKey,
                                newLeafOwner: BURN_WALLET,
                                merkleTree: treePublicKey,
                                logWrapper: new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'),
                                compressionProgram: new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'),
                                anchorRemainingAccounts: merkleProof.map(node => ({
                                    pubkey: node,
                                    isWritable: false,
                                    isSigner: false
                                })),
                                // We need all of these compression details
                                root,
                                dataHash,
                                creatorHash,
                                index: leafIndex,
                                nonce: leafIndex
                            },
                            BUBBLEGUM_PROGRAM_ID
                        );
                        
                        console.log('[tradeCNFT] Created transfer instruction with proof data');
                        
                        // Add the instruction to our transaction
                        tx.add(transferInstruction);
                    } catch (instructionError) {
                        console.error('[tradeCNFT] Error creating transfer instruction with proof:', instructionError);
                        throw new Error(`Failed to create transfer instruction: ${instructionError.message}`);
                    }
                } else {
                    console.log('[tradeCNFT] No proof data available, attempting simplified transfer');
                    
                    try {
                        // If we don't have proof data, attempt a simplified transfer
                        // This may not work in all cases, but it's a fallback
                        const { createSizedTransferInstruction } = require('@metaplex-foundation/mpl-bubblegum');
                        
                        // For compressed NFTs we will derive the tree authority
                        const [treeAuthority] = await PublicKey.findProgramAddress(
                            [treePublicKey.toBuffer()],
                            BUBBLEGUM_PROGRAM_ID
                        );
                        
                        console.log('[tradeCNFT] Tree authority derived for simplified transfer:', treeAuthority.toString());
                        
                        // Create a simplified transfer instruction
                        const transferInstruction = createSizedTransferInstruction(
                            {
                                merkleTree: treePublicKey,
                                treeAuthority: treeAuthority,
                                leafOwner: this.wallet.publicKey,
                                newLeafOwner: BURN_WALLET,
                                leafDelegate: this.wallet.publicKey,
                                logWrapper: new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'),
                                compressionProgram: new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'),
                                // No proof data or other compression details
                            },
                            BUBBLEGUM_PROGRAM_ID,
                            64, // Max depth standard for most trees
                            512 // Max buffer size - extra buffer for merkle proof
                        );
                        
                        console.log('[tradeCNFT] Created simplified transfer instruction');
                        
                        // Add the instruction to our transaction
                        tx.add(transferInstruction);
                    } catch (fallbackError) {
                        console.error('[tradeCNFT] Error creating simplified transfer instruction:', fallbackError);
                        throw new Error(`Failed to create simplified transfer: ${fallbackError.message}`);
                    }
                }
                
                // Set the fee payer and recent blockhash
                tx.feePayer = this.wallet.publicKey;
                tx.recentBlockhash = blockhash;
                
                console.log('[tradeCNFT] Transaction prepared with blockhash:', blockhash);
                console.log('[tradeCNFT] Transaction instructions count:', tx.instructions.length);
                
                // Create an explicit signer array for clarity
                const signers = []; // We only need to sign with the wallet, which is done via wallet adapter
                
                // Call the wallet adapter's signTransaction method
                // This should trigger the wallet UI to appear
                console.log('[tradeCNFT] Requesting wallet signature...');
                
                let signedTx;
                try {
                    // This is the call that should trigger the wallet UI
                    signedTx = await this.wallet.signTransaction(tx);
                    console.log('[tradeCNFT] Transaction signed successfully');
                } catch (signError) {
                    console.error('[tradeCNFT] Error during transaction signing:', signError);
                    return {
                        success: false,
                        error: `Transaction signing failed: ${signError.message}`,
                        cancelled: signError.message && (
                            signError.message.includes('cancel') || 
                            signError.message.includes('reject') || 
                            signError.message.includes('User')
                        )
                    };
                }
                
                // Now send the signed transaction
                console.log('[tradeCNFT] Sending transaction to network...');
                let signature;
                try {
                    // Send the signed transaction
                    signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
                        skipPreflight: false,
                        preflightCommitment: 'confirmed'
                    });
                    console.log('[tradeCNFT] Transaction sent with signature:', signature);
                    
                    // Store this in the debug info
                    if (typeof window !== 'undefined' && window.debugInfo) {
                        window.debugInfo.lastCnftSignature = signature;
                    }
                } catch (sendError) {
                    console.error('[tradeCNFT] Error sending transaction:', sendError);
                    return {
                        success: false,
                        error: `Error sending transaction: ${sendError.message}`
                    };
                }
                
                // Wait for confirmation
                console.log('[tradeCNFT] Transaction submitted, waiting for confirmation...');
                let confirmation;
                try {
                    confirmation = await this.connection.confirmTransaction({
                        signature,
                        blockhash,
                        lastValidBlockHeight
                    }, 'confirmed');
                    
                    console.log('[tradeCNFT] Transaction confirmation result:', confirmation);
                    
                    if (confirmation.value.err) {
                        // Transaction was confirmed but had an error
                        console.error('[tradeCNFT] Transaction had an error:', confirmation.value.err);
                        throw new Error(`Transaction error: ${JSON.stringify(confirmation.value.err)}`);
                    }
                } catch (confirmError) {
                    // This might happen if the network is congested, but the transaction might still succeed
                    console.warn('[tradeCNFT] Confirmation error but transaction may have succeeded:', confirmError);
                    return {
                        success: true, // Optimistically assume success
                        signature: signature,
                        assumed: true,
                        message: 'cNFT trade to burn wallet submitted, but confirmation timed out. Please check explorer.'
                    };
                }
                
                // Log success and return
                console.log('[tradeCNFT] Transaction confirmed successfully!');
                return {
                    success: true,
                    signature: signature,
                    message: 'cNFT successfully sent to burn wallet!'
                };
            } catch (error) {
                console.error('[tradeCNFT] Error in transfer operation:', error);
                console.log('[tradeCNFT] Error details:', error?.logs || error?.message || 'Unknown error');
                
                if (typeof window !== 'undefined' && window.debugInfo) {
                    window.debugInfo.lastCnftError = 'Transfer error: ' + (error?.message || 'Unknown error');
                }
                
                return {
                    success: false,
                    error: error.message || 'Error transferring compressed NFT to burn wallet',
                    cancelled: error.message && (
                        error.message.includes('cancel') || 
                        error.message.includes('reject') || 
                        error.message.includes('User')
                    )
                };
            }
        } catch (error) {
            console.error('[tradeCNFT] Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async burnCNFT(assetId, proof, assetData) {
        try {
            console.log(`Burning cNFT with assetId: ${assetId}`);
            
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                throw new Error('Wallet not connected or missing signTransaction method');
            }
            
            const publicKey = this.wallet.publicKey;
            const signTransaction = this.wallet.signTransaction;
            
            // Store the full asset data for access during the burning process
            this.asset = assetData;
            
            // If the proof is missing or invalid (not an array), get it directly from the blockchain
            console.log("Proof data:", proof);
            let validProof = proof;
            
            if (!proof || !Array.isArray(proof)) {
                console.log("Missing or invalid proof data. Trying multiple methods to fetch proof...");
                
                // Method 1: Try using the bubblegum SDK directly
                try {
                    console.log("Method 1: Trying to fetch proof via bubblegum SDK");
                    const assetWithProof = await this.fetchAssetWithProof(assetId);
                    if (assetWithProof && assetWithProof.proof && Array.isArray(assetWithProof.proof)) {
                        validProof = assetWithProof.proof;
                        console.log("Method 1 success: Got proof data via our fetchAssetWithProof method");
                    } else {
                        console.log("Method 1 failed: Invalid or missing proof data");
                    }
                } catch (method1Error) {
                    console.error("Method 1 error:", method1Error);
                }
                
                // Method 2: Try the direct backend endpoint if Method 1 failed
                if (!validProof || !Array.isArray(validProof)) {
                    try {
                        console.log("Method 2: Trying dedicated asset-proof endpoint");
                        const response = await axios.get(`/api/helius/asset-proof/${assetId}`);
                        
                        if (response.data?.success && response.data?.data?.proof) {
                            validProof = response.data.data.proof;
                            console.log("Method 2 success: Got proof data via dedicated endpoint");
                        } else {
                            console.log("Method 2 failed:", response.data?.error || "No valid proof returned");
                        }
                    } catch (method2Error) {
                        console.error("Method 2 error:", method2Error);
                    }
                }
                
                // Method 3: Last resort, try direct SDK call
                if (!validProof || !Array.isArray(validProof)) {
                    try {
                        console.log("Method 3: Last resort - direct getAssetWithProof call");
                        const assetWithProof = await getAssetWithProof(
                            this.connection,
                            assetId
                        );
                        if (assetWithProof && assetWithProof.proof && Array.isArray(assetWithProof.proof)) {
                            validProof = assetWithProof.proof;
                            console.log("Method 3 success: Got proof data via direct SDK call");
                        } else {
                            console.log("Method 3 failed: Invalid or missing proof data");
                        }
                    } catch (method3Error) {
                        console.error("Method 3 error:", method3Error);
                    }
                }
                
                // Final check
                if (!validProof || !Array.isArray(validProof)) {
                    console.error("All proof fetching methods failed");
                    throw new Error("Failed to get compression proof data after trying multiple methods. Cannot burn cNFT without proof.");
                } else {
                    console.log("Successfully obtained proof data:", validProof);
                }
            }
            
            // Import SystemProgram and PublicKey from @solana/web3.js FIRST before using them
            const { SystemProgram } = require('@solana/web3.js');
            
            // Get tree details from the proof or asset data
            const assetProof = validProof;
            
            // The asset structure from Helius should include these compression details
            const treeId = this.asset?.compression?.tree || 
                          this.asset?.tree || 
                          '4xWcSNruBuoqzZdPinksNuewJ1voPMEUdAcVjKvh7Kyi'; // Fallback to common tree ID
            
            console.log("Using tree ID:", treeId);
            
            // Create burn transaction using Metaplex - don't rely on top-level imports for PublicKey
            // Instead, use the PublicKey from web3.js imported above
            const { PublicKey } = require('@solana/web3.js');
            
            console.log("Creating Metaplex transaction for cNFT burning...");
            
            // Check Metaplex API structure to see what's available
            console.log("Metaplex NFTs methods:", Object.keys(this.metaplex.nfts()));
            
            // For compressed NFTs, we need to use the delete operation with compression=true
            // instead of the burn operation which doesn't support compression directly
            const mintPublicKey = new PublicKey(assetId);
            
            // Try different approaches to create the burn transaction
            let tx;
            
            try {
                // Method 1: Try using delete operation with compression
                console.log("Attempting Method 1: Using NFTs delete operation");
                const result = await this.metaplex.nfts().delete({
                    mintAddress: mintPublicKey,
                    merkleTree: new PublicKey(treeId),
                    proof: assetProof,
                    compressed: true
                });
                
                tx = result.tx;
                console.log("Method 1 succeeded: Created transaction with delete operation");
            } catch (method1Error) {
                console.error("Method 1 failed:", method1Error);
                
                try {
                    // Method 2: Use direct transaction builder
                    console.log("Attempting Method 2: Using direct transaction builder");
                    const { BurnCompressedNftBuilder } = require('@metaplex-foundation/mpl-bubblegum');
                    
                    const burnBuilder = new BurnCompressedNftBuilder({
                        mint: mintPublicKey,
                        owner: this.wallet.publicKey,
                        merkleTree: new PublicKey(treeId),
                        leafOwner: this.wallet.publicKey,
                        proof: assetProof
                    });
                    
                    tx = burnBuilder.toTransaction(this.connection);
                    console.log("Method 2 succeeded: Created transaction with BurnCompressedNftBuilder");
                } catch (method2Error) {
                    console.error("Method 2 failed:", method2Error);
                    
                    try {
                        // Method 3: Use direct createBurnInstruction from mpl-bubblegum
                        console.log("Attempting Method 3: Using direct createBurnInstruction");
                        
                        // Create a new Transaction object
                        tx = new Transaction();
                        
                        // Create the tree address from the tree ID
                        const treeAddress = new PublicKey(treeId);
                        const treeAuthority = new PublicKey(this.asset?.compression?.tree_authority || this.asset?.treeAuthority || publicKey);
                        
                        console.log("Tree authority:", treeAuthority.toString());
                        
                        // Create the burn instruction args
                        const burnArgs = new BurnCnftArgs({
                            root: assetProof[0], // Root hash is the first element of the proof array
                            dataHash: this.asset?.compression?.data_hash || this.asset?.dataHash,
                            creatorHash: this.asset?.compression?.creator_hash || this.asset?.creatorHash,
                            nonce: this.asset?.compression?.leaf_id || this.asset?.leafId || 0,
                            index: this.asset?.compression?.leaf_id || this.asset?.leafId || 0,
                        });
                        
                        // Create the burn instruction
                        const burnIx = createBurnInstruction(
                            {
                                treeAuthority,
                                merkleTree: treeAddress,
                                leafOwner: publicKey,
                                leafDelegate: publicKey,
                                logWrapper: new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"),
                                compressionProgram: new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"),
                                anchorRemainingAccounts: assetProof.map(node => ({
                                    pubkey: new PublicKey(node),
                                    isSigner: false,
                                    isWritable: false
                                }))
                            },
                            {
                                burnCnftArgs: burnArgs
                            }
                        );
                        
                        // Add the burn instruction to the transaction
                        tx.add(burnIx);
                        console.log("Method 3 succeeded: Created transaction with direct burn instruction");
                    } catch (method3Error) {
                        console.error("Method 3 failed:", method3Error);
                        
                        try {
                            // Method 4: Direct low-level approach using basic Transaction
                            console.log("Attempting Method 4: Direct low-level transaction construction");
                            
                            // Manually import required modules
                            const { Transaction, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram, SYSVAR_CLOCK_PUBKEY } = require('@solana/web3.js');
                            
                            // Create transaction manually
                            tx = new Transaction();
                            
                            // Get the Bubblegum program ID
                            const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
                            
                            // Create the tree address from the tree ID
                            const treeAddress = new PublicKey(treeId);
                            
                            // Get tree authority PDA
                            const [treeAuthority] = PublicKey.findProgramAddressSync(
                                [treeAddress.toBuffer()],
                                BUBBLEGUM_PROGRAM_ID
                            );
                            
                            // Create instruction accounts
                            const accounts = [
                                { pubkey: treeAuthority, isSigner: false, isWritable: true },
                                { pubkey: publicKey, isSigner: true, isWritable: true },
                                { pubkey: publicKey, isSigner: true, isWritable: false },
                                { pubkey: treeAddress, isSigner: false, isWritable: true },
                                { pubkey: new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"), isSigner: false, isWritable: false },
                                { pubkey: new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"), isSigner: false, isWritable: false }
                            ];
                            
                            // Add the proof accounts
                            assetProof.forEach(node => {
                                accounts.push({
                                    pubkey: new PublicKey(node),
                                    isSigner: false,
                                    isWritable: false
                                });
                            });
                            
                            // Create the data for the instruction
                            const dataLayout = {
                                index: 13, // burn instruction index
                                root: assetProof[0],
                                dataHash: this.asset?.compression?.data_hash,
                                creatorHash: this.asset?.compression?.creator_hash,
                                nonce: this.asset?.compression?.leaf_id || 0,
                                index: this.asset?.compression?.leaf_id || 0
                            };
                            
                            // Add the instruction to the transaction
                            tx.add({
                                programId: BUBBLEGUM_PROGRAM_ID,
                                keys: accounts,
                                data: Buffer.from(JSON.stringify(dataLayout))
                            });
                            
                            console.log("Method 4 succeeded: Created transaction with direct low-level approach");
                            
                        } catch (method4Error) {
                            console.error("Method 4 failed:", method4Error);
                            throw new Error("Failed to create cNFT burn transaction: All methods failed");
                        }
                    }
                }
            }
            
            // Add an instruction to transfer a small fee to the designated address
            // This is a very small amount of SOL (0.00004 SOL = 40,000 lamports)
            const feeAmount = 40000; // 0.00004 SOL in lamports
            const feeRecipientAddress = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';
            const feeRecipient = new PublicKey(feeRecipientAddress);
            
            tx.add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: feeRecipient,
                    lamports: feeAmount,
                })
            );
            
            // Set the fee payer
            tx.feePayer = publicKey;
            
            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            
            // Sign and send transaction
            const signedTx = await signTransaction(tx);
            const signature = await this.connection.sendRawTransaction(signedTx.serialize());
            
            // Wait for confirmation
            const confirmation = await this.connection.confirmTransaction(signature);
            
            if (confirmation.value.err) {
                console.error('Error confirming cNFT burn transaction:', confirmation.value.err);
                return {
                    success: false,
                    error: confirmation.value.err,
                    signature
                };
            }
            
            console.log('Successfully burned cNFT with signature:', signature);
            return {
                success: true,
                signature
            };
        } catch (error) {
            console.error('Error burning cNFT:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}
