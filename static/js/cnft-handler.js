import { Connection } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { 
    createTree, 
    getMerkleTree,
    getAssetWithProof,
    getLeafAssetId
} from '@metaplex-foundation/mpl-bubblegum';

export class CNFTHandler {
    constructor(connection, wallet) {
        this.connection = connection;
        this.wallet = wallet;
        this.metaplex = new Metaplex(connection);
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
                console.log("Missing or invalid proof data. Fetching from blockchain...");
                try {
                    // Fetch the asset with proof from the blockchain
                    const assetWithProof = await getAssetWithProof(
                        this.connection,
                        assetId
                    );
                    validProof = assetWithProof.proof;
                    console.log("Successfully fetched proof data from blockchain");
                } catch (proofError) {
                    console.error("Error fetching proof data:", proofError);
                    throw new Error("Failed to get compression proof data. Cannot burn cNFT without proof.");
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
