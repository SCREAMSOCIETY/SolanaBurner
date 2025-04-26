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
    
    // Improved method to burn a cNFT using proper burn instructions
    async simpleBurnCNFT(assetId, proof, assetData) {
        try {
            console.log(`Using improved burn method for cNFT with assetId: ${assetId}`);
            
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                throw new Error('Wallet not connected or missing signTransaction method');
            }
            
            // Store asset data
            this.asset = assetData;
            
            // Make sure we have the right imports
            const { Transaction, PublicKey } = require('@solana/web3.js');
            const { createBurnInstruction } = require('@metaplex-foundation/mpl-bubblegum');
            
            // Get the tree ID from compression data
            const treeId = this.asset?.compression?.tree || 
                          this.asset?.tree || 
                          null;
                          
            if (!treeId) {
                console.error("Missing tree ID in asset data:", this.asset);
                throw new Error("Missing tree ID in asset data");
            }
            
            console.log("Using tree ID:", treeId);
            
            // Get the leaf ID from compression data
            const leafId = this.asset?.compression?.leaf_id || 
                          this.asset?.compression?.leafId || 
                          null;
                          
            if (leafId === null) {
                console.error("Missing leaf ID in asset data:", this.asset);
                throw new Error("Missing leaf ID in asset data");
            }
            
            console.log("Using leaf ID:", leafId);
            
            // Create a new transaction
            const tx = new Transaction();
            
            // Create the burn instruction
            try {
                // Get the merkle tree public key
                const merkleTree = new PublicKey(treeId);
                
                // Get the owner's public key (our wallet)
                const owner = this.wallet.publicKey;
                
                // Create the burn instruction
                console.log("Creating burn instruction with:", {
                    leafIndex: leafId,
                    merkleTree: merkleTree.toString(),
                    owner: owner.toString(),
                    proofLength: proof.length
                });
                
                // Helper function to ensure proper PublicKey conversion
                const ensurePubkey = (keyString) => {
                    try {
                        if (keyString instanceof PublicKey) return keyString;
                        return new PublicKey(keyString.toString());
                    } catch (e) {
                        console.error("Invalid public key:", keyString, e);
                        throw new Error(`Invalid public key: ${keyString}`);
                    }
                };

                // First proof element should be the root
                const root = ensurePubkey(proof[0]);
                
                // Convert all proof elements to PublicKey
                const proofPublicKeys = proof.slice(1).map(node => ensurePubkey(node));
                
                // Make sure we have data hash and creator hash
                const dataHash = ensurePubkey(this.asset.compression.data_hash);
                const creatorHash = ensurePubkey(this.asset.compression.creator_hash);
                
                // Log detailed parameters for better debugging
                console.log("Burn instruction parameters:", {
                    merkleTree: merkleTree.toString(),
                    leafOwner: owner.toString(),
                    root: root.toString(),
                    dataHash: dataHash.toString(),
                    creatorHash: creatorHash.toString(),
                    nonce: leafId,
                    index: leafId,
                    proofLength: proofPublicKeys.length
                });
                
                // Simplified burn instruction - this should properly format the parameters
                const burnInstruction = createBurnInstruction(
                    {
                        merkleTree,
                        leafOwner: owner,
                        leafDelegate: owner, // Usually the same as owner
                        root: root,
                        dataHash: dataHash,
                        creatorHash: creatorHash,
                        nonce: BigInt(leafId), // Convert leaf ID to BigInt for compatibility
                        index: leafId,
                        proof: proofPublicKeys
                    },
                    new PublicKey(BUBBLEGUM_PROGRAM_ID)
                );
                
                // Add the burn instruction to the transaction
                tx.add(burnInstruction);
            } catch (instructionError) {
                console.error("Error creating burn instruction:", instructionError);
                throw new Error(`Failed to create burn instruction: ${instructionError.message}`);
            }
            
            // Set the fee payer
            tx.feePayer = this.wallet.publicKey;
            
            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            
            // Create a timeoutPromise that rejects after 2 minutes
            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error('Transaction signing timed out or was cancelled'));
                }, 120000); // 2 minute timeout
            });
            
            try {
                // Race between the signTransaction and the timeout
                console.log("Requesting wallet to sign transaction...");
                console.log("Transaction details:", {
                    instructions: tx.instructions.length,
                    signers: tx.signers?.length || 0,
                    feePayer: tx.feePayer?.toString(),
                    recentBlockhash: tx.recentBlockhash
                });
                
                // Make sure any status messages are visible to the user
                if (typeof window !== 'undefined') {
                    if (document.getElementById('burn-status')) {
                        document.getElementById('burn-status').textContent = 'Waiting for wallet approval...';
                        document.getElementById('burn-status').style.display = 'block';
                    }
                }
                
                // Sign the transaction - we don't use Promise.race here to avoid timing issues
                console.log("Calling signTransaction method directly...");
                let signedTx;
                try {
                    // Directly call the wallet's signTransaction method
                    signedTx = await this.wallet.signTransaction(tx);
                    console.log("Transaction signed successfully!");
                } catch (signErr) {
                    console.error("Error during signing:", signErr);
                    
                    // Check for user cancellation
                    if (signErr.message && (
                        signErr.message.toLowerCase().includes('user rejected') ||
                        signErr.message.toLowerCase().includes('cancelled') ||
                        signErr.message.toLowerCase().includes('canceled') ||
                        signErr.message.toLowerCase().includes('rejected')
                    )) {
                        return {
                            success: false,
                            cancelled: true,
                            error: 'Transaction was cancelled by the user'
                        };
                    }
                    
                    // Rethrow other errors
                    throw signErr;
                }
                
                // Clear the timeout since we got a response
                clearTimeout(timeoutId);
                
                // Send the transaction with options for better reliability
                console.log("Sending transaction to the blockchain...");
                const signature = await this.connection.sendRawTransaction(
                    signedTx.serialize(),
                    {
                        skipPreflight: false,
                        preflightCommitment: 'finalized',
                        maxRetries: 3
                    }
                );
                console.log("Transaction sent with signature:", signature);
                
                // Wait for confirmation with a specified commitment level
                console.log("Waiting for confirmation...");
                const confirmation = await this.connection.confirmTransaction(
                    signature, 
                    'confirmed'  // Use 'confirmed' instead of default to ensure faster finality
                );
                
                if (confirmation.value.err) {
                    console.error("Error confirming transaction:", confirmation.value.err);
                    throw new Error(`Transaction error: ${confirmation.value.err}`);
                }
                
                // Success!
                console.log('Successfully burned cNFT with signature:', signature);
                return {
                    success: true,
                    signature,
                    message: "Successfully burned cNFT. Note: cNFTs don't return rent as they are already efficiently stored on-chain."
                };
            } catch (signingError) {
                // Clear timeout
                clearTimeout(timeoutId);
                
                // Check if the error is related to user cancellation
                if (signingError.message && (
                    signingError.message.includes('timed out') || 
                    signingError.message.includes('cancelled') ||
                    signingError.message.includes('rejected') ||
                    signingError.message.includes('User rejected'))) {
                    console.log('Transaction was cancelled by the user or timed out');
                    return {
                        success: false,
                        error: 'Transaction was cancelled. Please try again if you want to burn this asset.',
                        cancelled: true
                    };
                }
                
                // For other signing errors, throw with more details
                console.error("Signing error details:", signingError);
                throw new Error(`Transaction signing error: ${signingError.message}`);
            }
        } catch (error) {
            console.error('Error in simpleBurnCNFT:', error);
            
            // Special handling for WalletConnection errors which often happen when users close dialogs
            const errorMessage = error.message || '';
            const isWalletConnectionError = (
                errorMessage.includes('wallet') || 
                errorMessage.includes('connection') ||
                errorMessage.includes('adapter')
            );
            
            const isCancelled = 
                errorMessage.includes('cancelled') || 
                errorMessage.includes('rejected') || 
                errorMessage.includes('timed out') ||
                errorMessage.includes('User rejected');
            
            return {
                success: false,
                error: isWalletConnectionError 
                    ? 'Wallet connection error. Please check your wallet and try again.' 
                    : `Error burning cNFT: ${error.message}`,
                cancelled: isCancelled
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
