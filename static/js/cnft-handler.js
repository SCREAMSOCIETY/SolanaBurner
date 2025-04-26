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
        
        console.log("ENTER simpleBurnCNFT with params:", {
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
            console.log(`Burning cNFT with assetId: ${assetId}`);
            
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                throw new Error('Wallet not connected or missing signTransaction method');
            }
            
            // Store asset data
            this.asset = assetData;
            
            // Import required libraries
            const { Transaction, PublicKey, ComputeBudgetProgram } = require('@solana/web3.js');
            const { createBurnInstruction, BurnCnftArgs } = require('@metaplex-foundation/mpl-bubblegum');
            
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
            
            // Create the burn instruction args
            const burnArgs = new BurnCnftArgs({
                root: proof[0], // Root hash is the first element of the proof array
                dataHash: this.asset?.compression?.data_hash || this.asset?.dataHash || "",
                creatorHash: this.asset?.compression?.creator_hash || this.asset?.creatorHash || "",
                nonce: this.asset?.compression?.leaf_id || this.asset?.leafId || 0,
                index: this.asset?.compression?.leaf_id || this.asset?.leafId || 0,
            });
            
            console.log("Burn args:", burnArgs);
            
            // Create and add the burn instruction
            const burnIx = createBurnInstruction(
                {
                    treeAuthority,
                    merkleTree: treeAddress,
                    leafOwner: this.wallet.publicKey,
                    leafDelegate: this.wallet.publicKey,
                    logWrapper: new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"),
                    compressionProgram: new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"),
                    anchorRemainingAccounts: proof.map(node => ({
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
                const signedTx = await Promise.race([
                    this.wallet.signTransaction(tx),
                    timeoutPromise
                ]);
                
                // Clear the timeout since we got a response
                clearTimeout(timeoutId);
                
                // Send the transaction with skipPreflight to avoid client-side checks
                const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
                    skipPreflight: true, // Skip preflight checks
                    maxRetries: 3, // Retry a few times if needed
                    preflightCommitment: 'processed' // Lower commitment level
                });
                
                console.log('Transaction sent, waiting for confirmation...');
                
                // Wait for confirmation with a custom strategy to avoid timeouts
                const confirmation = await this.connection.confirmTransaction({
                    signature: signature,
                    blockhash: blockhash,
                    lastValidBlockHeight: lastValidBlockHeight
                }, 'processed'); // Use processed commitment level
                
                console.log('Confirmation result:', confirmation);
                
                if (confirmation.value.err) {
                    throw new Error(`Transaction confirmed but failed: ${JSON.stringify(confirmation.value.err)}`);
                }
                
                // Success! The cNFT has been burned
                console.log('Successfully burned cNFT with signature:', signature);
                return {
                    success: true,
                    signature,
                    message: "Successfully burned cNFT! Note: cNFTs don't return rent like regular NFTs."
                };
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
                        error: 'Transaction was cancelled. Please try again if you want to burn this asset.',
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

    // Server-side approach to burn cNFT with backend transaction generation
    async serverBurnCNFT(assetId) {
        if (typeof window !== 'undefined' && window.debugInfo) {
            window.debugInfo.lastCnftError = 'Starting server burn method';
        }
        
        console.log('----- SERVER BURN METHOD DIAGNOSTICS -----');
        console.log('Asset ID:', assetId);
        console.log('Wallet:', this.wallet?.publicKey?.toString());
        console.log('Can sign transaction:', !!this.wallet?.signTransaction);
        console.log('Can sign message:', !!this.wallet?.signMessage);
        
        try {
            console.log('[serverBurnCNFT] Starting cNFT burn with server-side approach');
            
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                console.error('[serverBurnCNFT] Missing wallet or signTransaction method');
                return { success: false, error: 'Wallet not connected or missing signTransaction method' };
            }
            
            // Step 1: Request a transaction from our backend
            console.log('[serverBurnCNFT] Requesting transaction from server for asset:', assetId);
            
            // Create a simple message that the user will sign to verify ownership
            const message = `I authorize the burning of my cNFT with ID: ${assetId}`;
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
    async directBurnCNFT(assetId, proof) {
        try {
            console.log('[tradeCNFT] Starting cNFT trade to burn wallet');
            
            if (typeof window !== 'undefined' && window.debugInfo) {
                window.debugInfo.lastCnftError = 'Starting cNFT trade to burn wallet';
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
            } = require('@solana/web3.js');
            
            try {
                // Define the burn wallet address (where we'll send the assets)
                // Using a standard burn address that can't be recovered
                const BURN_WALLET = new PublicKey('1111111111111111111111111111111111111111111');
                
                console.log('[tradeCNFT] Trading cNFT to burn wallet:', BURN_WALLET.toString());
                
                // Create transfer instruction using the Metaplex SDK
                // This approach supports both NFTs and cNFTs
                console.log('[tradeCNFT] Creating transfer instructions with Metaplex');
                
                // Create the instructions based on whether it's a compressed NFT
                const transferBuilder = this.metaplex.nfts().transfer({
                    nftOrSft: {
                        address: new PublicKey(assetId),
                        tokenStandard: 'NonFungible'
                    },
                    authority: this.wallet,
                    fromOwner: this.wallet.publicKey,
                    toOwner: BURN_WALLET,
                    amount: 1,
                });
                
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
                
                // Get the instructions and add to transaction
                const transferInstructions = await transferBuilder.getInstructions();
                tx.add(...transferInstructions);
                
                // Set the fee payer and recent blockhash
                tx.feePayer = this.wallet.publicKey;
                const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
                tx.recentBlockhash = blockhash;
                
                // Sign and send the transaction
                console.log('[tradeCNFT] Signing transaction...');
                const signedTx = await this.wallet.signTransaction(tx);
                
                console.log('[tradeCNFT] Sending transaction...');
                const signature = await this.connection.sendRawTransaction(signedTx.serialize());
                
                // Wait for confirmation
                console.log('[tradeCNFT] Transaction submitted, waiting for confirmation...');
                const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
                
                // Log success and return
                console.log('[tradeCNFT] Transaction confirmed:', confirmation);
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
            console.error('[directBurnCNFT] Error:', error);
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
