import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';

export interface CNFTMetadata {
    mint: string;
    name: string;
    symbol: string;
    description: string;
    image: string;
    collection?: string;
    attributes: Array<{trait_type: string, value: string}>;
    explorer_url: string;
    proof?: any;
}

export class CNFTHandler {
    private connection: Connection;
    private wallet: any;
    private metaplex: Metaplex;

    constructor(connection: Connection, wallet: any) {
        this.connection = connection;
        this.wallet = wallet;
        this.metaplex = new Metaplex(connection);
    }

    async fetchCNFTs(walletAddress: string): Promise<CNFTMetadata[]> {
        try {
            console.log('Fetching cNFTs for wallet:', walletAddress);
            const owner = new PublicKey(walletAddress);

            // Get all NFTs for the wallet
            console.log('Fetching all NFTs...');
            const nfts = await this.metaplex.nfts().findAllByOwner({ owner });

            console.log(`Found ${nfts.length} total NFTs, filtering for compressed ones`);

            // Filter for compressed NFTs only
            const compressedNfts = nfts.filter(nft => nft.compression.compressed);
            console.log(`Found ${compressedNfts.length} compressed NFTs`);

            // Map the NFTs to our metadata format
            const cnfts = compressedNfts.map(nft => {
                try {
                    return {
                        mint: nft.address.toString(),
                        name: nft.json?.name || 'Unnamed cNFT',
                        symbol: nft.json?.symbol || '',
                        description: nft.json?.description || '',
                        image: nft.json?.image || '/static/default-nft-image.svg',
                        collection: nft.collection?.address.toString(),
                        attributes: nft.json?.attributes || [],
                        explorer_url: `https://solscan.io/token/${nft.address.toString()}`
                    };
                } catch (error) {
                    console.error('Error processing NFT metadata:', error);
                    return null;
                }
            });

            // Filter out any null entries from failed processing
            return cnfts.filter((cnft): cnft is CNFTMetadata => cnft !== null);

        } catch (error) {
            console.error('Error in fetchCNFTs:', error);
            throw new Error('Failed to fetch compressed NFTs: ' + (error as Error).message);
        }
    }

    async burnCNFT(assetId: string): Promise<any> {
        try {
            const mintPubkey = new PublicKey(assetId);
            const burnTx = await this.metaplex.nfts().delete({
                mintAddress: mintPubkey,
                collection: undefined // Will be determined from the NFT metadata
            });

            return burnTx;
        } catch (error) {
            console.error('Error creating burn instruction for cNFT:', error);
            throw error;
        }
    }
}