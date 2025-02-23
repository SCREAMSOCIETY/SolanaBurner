import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { 
    ConcurrentMerkleTree,
    SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    SPL_NOOP_PROGRAM_ID,
} from '@metaplex-foundation/mpl-bubblegum';

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

            // Use Metaplex's findAllByOwner with compressed flag
            console.log('Querying Metaplex for compressed NFTs...');
            const nfts = await this.metaplex.nfts().findAllByOwner({
                owner: owner,
                commitment: 'confirmed',
                type: 'compressedNft'
            });

            console.log(`Found ${nfts.length} compressed NFTs`);

            // Map the NFTs to our metadata format
            const cnfts = nfts.map(nft => {
                try {
                    return {
                        mint: nft.address.toString(),
                        name: nft.name || 'Unnamed',
                        symbol: nft.symbol || '',
                        description: nft.description || '',
                        image: nft.uri || '/default-nft-image.svg',
                        collection: nft.collection?.address.toString(),
                        attributes: nft.attributes || [],
                        explorer_url: `https://solscan.io/token/${nft.address.toString()}`
                    };
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
            const burnIx = await this.metaplex.nfts().builders().delete({
                mintAddress: mintPubkey,
                compressed: true
            });

            return burnIx;
        } catch (error) {
            console.error('Error creating burn instruction for cNFT:', error);
            throw error;
        }
    }
}