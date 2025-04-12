import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { 
    createTree, 
    getMerkleTree,
    getAssetWithProof,
    getLeafAssetId
} from '@metaplex-foundation/mpl-bubblegum';
import axios from 'axios';

export class CNFTHandler {
    constructor(connection, wallet) {
        this.connection = connection;
        this.wallet = wallet;
        this.metaplex = new Metaplex(connection);
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

    async burnCNFT(assetId, proof) {
        try {
            console.log(`Burning cNFT with assetId: ${assetId}`);
            
            if (!this.wallet.publicKey || !this.wallet.signTransaction) {
                throw new Error('Wallet not connected or missing signTransaction method');
            }
            
            const publicKey = this.wallet.publicKey;
            const signTransaction = this.wallet.signTransaction;
            
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
            
            const leafId = await getLeafAssetId(assetId);
            const tree = await getMerkleTree(this.connection, leafId.treeId);
            
            // Create burn transaction using Metaplex
            const { tx } = await this.metaplex.nfts().builders().burn({
                mintAddress: assetId,
                collection: tree.collection,
                proof: validProof,
                compressed: true
            });
            
            // Import the SystemProgram from @solana/web3.js
            const { SystemProgram, PublicKey } = require('@solana/web3.js');
            
            // Add an instruction to transfer a small fee to the designated address
            // This is a very small amount of SOL (0.00004 SOL = 40,000 lamports)
            const feeAmount = 40000; // 0.00004 SOL in lamports
            const feeRecipient = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');
            
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
