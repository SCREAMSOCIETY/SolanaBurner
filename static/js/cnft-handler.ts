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

            // Use findAllByOwner without type specification
            const nfts = await this.metaplex.nfts().findAllByOwner({
                owner,
            });

            console.log(`Found ${nfts.length} NFTs, filtering for compressed ones`);

            // Filter for compressed NFTs
            const compressedNfts = nfts.filter(nft => {
                return nft.compression && nft.compression.compressed === true;
            });

            console.log(`Found ${compressedNfts.length} compressed NFTs`);

            // Map the NFTs to our metadata format
            const cnfts = compressedNfts.map(nft => {
                try {
                    const metadata = {
                        mint: nft.address.toString(),
                        name: nft.json?.name || 'Unnamed',
                        symbol: nft.json?.symbol || '',
                        description: nft.json?.description || '',
                        image: nft.json?.image || '/default-nft-image.svg',
                        collection: nft.collection?.address.toString(),
                        attributes: nft.json?.attributes || [],
                        explorer_url: `https://solscan.io/token/${nft.address.toString()}`
                    };
                    return metadata;
                } catch (error) {
                    console.error('Error processing NFT metadata:', error);
                    return null;
                }
            });

            // Filter out any null entries from failed processing
            return cnfts.filter(cnft => cnft !== null) as CNFTMetadata[];

        } catch (error) {
            console.error('Error in fetchCNFTs:', error);
            throw new Error('Failed to fetch compressed NFTs: ' + (error as Error).message);
        }
    }

    async burnCNFT(assetId: string) {
        try {
            const mintPubkey = new PublicKey(assetId);
            const burnIx = await this.metaplex.nfts().delete({
                mintAddress: mintPubkey,
            });

            return burnIx;
        } catch (error) {
            console.error('Error creating burn instruction for cNFT:', error);
            throw error;
        }
    }
}