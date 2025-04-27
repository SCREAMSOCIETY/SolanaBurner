/**
 * Mint Compressed NFT (cNFT) Script
 * 
 * This script mints a new compressed NFT to a specified wallet using our custom Merkle tree.
 * 
 * Usage:
 * node mint-cnft.js <RECIPIENT_WALLET_ADDRESS>
 * 
 * Requirements:
 * - TREE_AUTHORITY_SECRET_KEY and TREE_ADDRESS must be set as environment variables
 * - The recipient wallet address must be provided as an argument
 */

const { 
  Connection, 
  Keypair, 
  PublicKey, 
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const { 
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID
} = require('@solana/spl-account-compression');
const { 
  PROGRAM_ID: BUBBLEGUM_PROGRAM_ID,
  createMintToCollectionV1Instruction,
  TokenProgramVersion,
  TokenStandard
} = require('@metaplex-foundation/mpl-bubblegum');
const bs58 = require('bs58');
require('dotenv').config();

// For creating and minting cNFTs, we'll use devnet which has a working airdrop
const RPC_URL = clusterApiUrl('devnet');
console.log(`Using RPC URL for minting: ${RPC_URL} (devnet)`);
const TREE_ADDRESS = process.env.TREE_ADDRESS;
const TREE_AUTHORITY_SECRET_KEY = process.env.TREE_AUTHORITY_SECRET_KEY;

// Define connection
const connection = new Connection(RPC_URL, 'confirmed');

/**
 * Mint a new compressed NFT to the specified recipient
 */
async function mintCompressedNFT(recipientWalletAddress) {
  try {
    if (!TREE_ADDRESS) {
      throw new Error("TREE_ADDRESS environment variable is required");
    }
    
    if (!TREE_AUTHORITY_SECRET_KEY) {
      throw new Error("TREE_AUTHORITY_SECRET_KEY environment variable is required");
    }
    
    if (!recipientWalletAddress) {
      throw new Error("Recipient wallet address must be provided");
    }
    
    console.log('Minting new compressed NFT...');
    console.log(`Using tree: ${TREE_ADDRESS}`);
    console.log(`Recipient: ${recipientWalletAddress}`);
    
    // Load tree authority keypair
    let treeAuthorityKeypair;
    if (TREE_AUTHORITY_SECRET_KEY.startsWith('[')) {
      // Legacy JSON array format
      treeAuthorityKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(TREE_AUTHORITY_SECRET_KEY))
      );
    } else {
      // Base58 encoded format
      const secretKey = bs58.decode(TREE_AUTHORITY_SECRET_KEY);
      treeAuthorityKeypair = Keypair.fromSecretKey(secretKey);
    }
    
    console.log(`Tree authority public key: ${treeAuthorityKeypair.publicKey.toString()}`);
    
    // Convert tree address to PublicKey
    const treeAddress = new PublicKey(TREE_ADDRESS);
    
    // Derive tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treeAddress.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Derive collection mint and metadata addresses (for this example we'll use a dummy collection)
    const collectionMint = treeAuthorityKeypair.publicKey; // Using tree authority as collection for simplicity
    const collectionMetadata = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        collectionMint.toBuffer(),
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
    )[0];
    
    const collectionMasterEdition = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        collectionMint.toBuffer(),
        Buffer.from('edition'),
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
    )[0];
    
    // Load metadata from local file
    let nftMetadata;
    try {
      const metadataPath = './metadata.json';
      const rawMetadata = require(metadataPath);
      
      nftMetadata = {
        name: rawMetadata.name || "SolBurn Test cNFT",
        symbol: rawMetadata.symbol || "SBT",
        uri: "https://raw.githubusercontent.com/metaplex-foundation/docs/main/docs/programs/bubblegum/assets/metadata.json", // Using GitHub hosted metadata as fallback
        creators: [
          {
            address: treeAuthorityKeypair.publicKey.toString(),
            verified: true,
            share: 100,
          },
        ],
        sellerFeeBasisPoints: 500, // 5%
        primarySaleHappened: false,
        isMutable: true,
        editionNonce: 0,
        tokenStandard: TokenStandard.NonFungible,
        collection: {
          verified: false,
          key: collectionMint.toString(),
        },
        uses: null,
        tokenProgramVersion: TokenProgramVersion.Original,
      };
      
      console.log(`Loaded metadata from ${metadataPath}`);
    } catch (error) {
      console.warn(`Failed to load metadata from local file: ${error.message}`);
      console.warn('Using default metadata');
      
      // Default metadata if file loading fails
      nftMetadata = {
        name: "SolBurn Test cNFT",
        symbol: "SBT",
        uri: "https://raw.githubusercontent.com/metaplex-foundation/docs/main/docs/programs/bubblegum/assets/metadata.json",
        creators: [
          {
            address: treeAuthorityKeypair.publicKey.toString(),
            verified: true,
            share: 100,
          },
        ],
        sellerFeeBasisPoints: 500, // 5%
        primarySaleHappened: false,
        isMutable: true,
        editionNonce: 0,
        tokenStandard: TokenStandard.NonFungible,
        collection: {
          verified: false,
          key: collectionMint.toString(),
        },
        uses: null,
        tokenProgramVersion: TokenProgramVersion.Original,
      };
    }

    // Get the recipient public key
    const recipientPubkey = new PublicKey(recipientWalletAddress);
    
    // Create the mint instruction
    const mintIx = createMintToCollectionV1Instruction(
      {
        treeAuthority,
        leafOwner: recipientPubkey,
        leafDelegate: recipientPubkey,
        merkleTree: treeAddress,
        payer: treeAuthorityKeypair.publicKey,
        treeDelegate: treeAuthorityKeypair.publicKey,
        collectionAuthority: treeAuthorityKeypair.publicKey,
        collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
        collectionMint: collectionMint,
        collectionMetadata: collectionMetadata,
        editionAccount: collectionMasterEdition,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        bubblegumSigner: PublicKey.findProgramAddressSync(
          [Buffer.from("collection_cpi")],
          BUBBLEGUM_PROGRAM_ID
        )[0],
        tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
      },
      {
        metadataArgs: {
          collection: {
            key: collectionMint,
            verified: false,
          },
          creators: nftMetadata.creators.map(creator => ({
            address: new PublicKey(creator.address),
            verified: creator.verified,
            share: creator.share,
          })),
          isMutable: nftMetadata.isMutable,
          name: nftMetadata.name,
          primarySaleHappened: nftMetadata.primarySaleHappened,
          sellerFeeBasisPoints: nftMetadata.sellerFeeBasisPoints,
          symbol: nftMetadata.symbol,
          tokenProgramVersion: nftMetadata.tokenProgramVersion,
          tokenStandard: nftMetadata.tokenStandard,
          uri: nftMetadata.uri,
          uses: nftMetadata.uses,
          editionNonce: nftMetadata.editionNonce,
        },
      }
    );

    // Create transaction
    const tx = new Transaction().add(mintIx);
    tx.feePayer = treeAuthorityKeypair.publicKey;
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    
    // Sign and send the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [treeAuthorityKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('cNFT minted successfully!');
    console.log(`Transaction signature: ${signature}`);
    console.log(`Explorer URL: https://solscan.io/tx/${signature}?cluster=devnet`);
    
    return {
      success: true,
      signature,
      treeAddress: TREE_ADDRESS,
      recipient: recipientWalletAddress,
    };
  } catch (error) {
    console.error('Error minting cNFT:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run the function if this file is executed directly
if (require.main === module) {
  const recipientWalletAddress = process.argv[2];
  
  if (!recipientWalletAddress) {
    console.error('Error: Recipient wallet address must be provided as an argument');
    console.error('Usage: node mint-cnft.js <RECIPIENT_WALLET_ADDRESS>');
    process.exit(1);
  }
  
  mintCompressedNFT(recipientWalletAddress)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { mintCompressedNFT };