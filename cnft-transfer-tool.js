/**
 * cNFT Transfer CLI Tool
 * 
 * This tool is designed to transfer a compressed NFT from a sender wallet to the project wallet.
 * 
 * Usage:
 * node cnft-transfer-tool.js <SECRET_KEY_BASE58> <ASSET_ID>
 * 
 * SECRET_KEY_BASE58: Base58-encoded secret key of the sender wallet
 * ASSET_ID: Asset ID (mint address) of the cNFT to transfer
 * 
 * The script will automatically transfer the cNFT to the following project wallet:
 * EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK
 */

const { Connection, Keypair, PublicKey, TransactionInstruction, Transaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const fetch = require('node-fetch');
require('dotenv').config();

// Constants
const RPC_URL = process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';
const BUBBLEGUM_PROGRAM_ID = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY';
const SPL_NOOP_PROGRAM_ID = 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV';
const COMPRESSION_PROGRAM_ID = 'SPL_Noop1111111111111111111111111111111111111111';
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

// Create connection
const connection = new Connection(RPC_URL);

// Parse command-line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.log(`
cNFT Transfer CLI Tool

Usage:
  node cnft-transfer-tool.js <SECRET_KEY_BASE58> <ASSET_ID>

Example:
  node cnft-transfer-tool.js 4VDgUbkqGJsNreTXHrRXPkK3gmBQ6nBKMGq7G5nK1234 HWgd4xSyUHgg6Qkp2YaAQXMhgj3nwYP33USzHakREJxQ
    `);
    process.exit(1);
}

const secretKeyBase58 = args[0];
const assetId = args[1];

// Convert base58 secret key to UInt8Array
const decodedSecretKey = bs58.decode(secretKeyBase58);
const senderKeypair = Keypair.fromSecretKey(decodedSecretKey);

// Fetch asset proof function
async function fetchAssetProof(assetId) {
    console.log(`Fetching proof for asset: ${assetId}`);
    
    const url = `https://api.helius.xyz/v0/assets/${assetId}/proof?api-key=${HELIUS_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch proof: ${response.status}`);
    }
    
    return await response.json();
}

// Fetch asset details function
async function fetchAssetDetails(assetId) {
    console.log(`Fetching asset details: ${assetId}`);
    
    const url = `https://api.helius.xyz/v0/assets/${assetId}?api-key=${HELIUS_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch asset details: ${response.status}`);
    }
    
    return await response.json();
}

// Transfer asset function
async function transferAsset(assetId) {
    try {
        console.log(`Starting transfer for asset: ${assetId}`);
        console.log(`Sender wallet: ${senderKeypair.publicKey.toString()}`);
        console.log(`Project wallet: ${PROJECT_WALLET}`);
        
        // Fetch asset details and proof
        const [assetDetails, proofData] = await Promise.all([
            fetchAssetDetails(assetId),
            fetchAssetProof(assetId)
        ]);
        
        // Verify ownership
        if (assetDetails.ownership.owner !== senderKeypair.publicKey.toString()) {
            throw new Error(`You don't own this asset. Owner is ${assetDetails.ownership.owner}`);
        }
        
        console.log('Asset ownership verified ✓');
        
        // Extract needed data from the proof
        const {
            root,
            proof,
            node_index,
            tree_id,
            data_hash,
            creator_hash
        } = proofData;
        
        console.log(`Building transaction with data from tree: ${tree_id}`);
        
        // Create the necessary Public Keys
        const merkleTree = new PublicKey(tree_id);
        const bubblegumProgram = new PublicKey(BUBBLEGUM_PROGRAM_ID);
        const splNoopProgram = new PublicKey(SPL_NOOP_PROGRAM_ID);
        const compressionProgram = new PublicKey(COMPRESSION_PROGRAM_ID);
        const systemProgram = new PublicKey(SYSTEM_PROGRAM_ID);
        const receiverPublicKey = new PublicKey(PROJECT_WALLET);
        const leafOwner = senderKeypair.publicKey;
        
        // Derive tree authority
        const [treeAuthority] = PublicKey.findProgramAddressSync(
            [merkleTree.toBuffer()],
            bubblegumProgram
        );
        
        console.log(`Derived tree authority: ${treeAuthority.toString()}`);
        
        // Create accounts for the instruction
        const accounts = [
            { pubkey: treeAuthority, isSigner: false, isWritable: false },
            { pubkey: leafOwner, isSigner: true, isWritable: false },
            { pubkey: leafOwner, isSigner: true, isWritable: false },
            { pubkey: receiverPublicKey, isSigner: false, isWritable: false },
            { pubkey: merkleTree, isSigner: false, isWritable: true },
            { pubkey: splNoopProgram, isSigner: false, isWritable: false },
            { pubkey: compressionProgram, isSigner: false, isWritable: false },
            { pubkey: systemProgram, isSigner: false, isWritable: false }
        ];
        
        // Convert all base64 values to Uint8Array
        function base64ToUint8Array(base64) {
            const buffer = Buffer.from(base64, 'base64');
            return Uint8Array.from(buffer);
        }
        
        const rootBuffer = base64ToUint8Array(root);
        const dataHashBuffer = base64ToUint8Array(data_hash);
        const creatorHashBuffer = base64ToUint8Array(creator_hash);
        const proofBuffers = proof.map(p => base64ToUint8Array(p));
        
        console.log(`Creating instruction data with ${proofBuffers.length} proof elements`);
        
        // Create the full data buffer
        const dataSize = 1 + 32 + 8 + 32 + 32 + 4 + (proofBuffers.length * 32);
        const data = Buffer.alloc(dataSize);
        
        // Write discriminator
        data[0] = 3; // Transfer instruction
        
        // Write root (32 bytes)
        rootBuffer.copy(data, 1, 0, 32);
        
        // Write index as little-endian u64 (8 bytes)
        const indexBuffer = Buffer.alloc(8);
        indexBuffer.writeBigUInt64LE(BigInt(node_index), 0);
        indexBuffer.copy(data, 33, 0, 8);
        
        // Write data hash (32 bytes)
        dataHashBuffer.copy(data, 41, 0, 32);
        
        // Write creator hash (32 bytes)
        creatorHashBuffer.copy(data, 73, 0, 32);
        
        // Write proof count (4 bytes) - little-endian u32
        const proofCountBuffer = Buffer.alloc(4);
        proofCountBuffer.writeUInt32LE(proofBuffers.length, 0);
        proofCountBuffer.copy(data, 105, 0, 4);
        
        // Write proof elements
        for (let i = 0; i < proofBuffers.length; i++) {
            proofBuffers[i].copy(data, 109 + (i * 32), 0, 32);
        }
        
        console.log('Instruction data created ✓');
        
        // Create the instruction
        const instruction = new TransactionInstruction({
            keys: accounts,
            programId: bubblegumProgram,
            data: data
        });
        
        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        console.log(`Got recent blockhash: ${blockhash.substring(0, 8)}...`);
        
        // Create the transaction
        const transaction = new Transaction({
            feePayer: senderKeypair.publicKey,
            recentBlockhash: blockhash
        }).add(instruction);
        
        // Sign and send the transaction
        console.log('Signing and sending transaction...');
        const signature = await connection.sendTransaction(transaction, [senderKeypair]);
        
        console.log(`\n✅ Transaction sent with signature: ${signature}`);
        console.log(`Explorer URL: https://solscan.io/tx/${signature}`);
        
        // Wait for confirmation
        console.log('\nWaiting for confirmation...');
        const confirmation = await connection.confirmTransaction(signature);
        
        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log('✅ Transaction confirmed!');
        console.log(`\nSuccessfully transferred ${assetId} to ${PROJECT_WALLET}`);
        
        return signature;
    } catch (error) {
        console.error(`\n❌ Error transferring asset: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
        throw error;
    }
}

// Main function
async function main() {
    try {
        console.log('\n=== cNFT Transfer Tool ===\n');
        const signature = await transferAsset(assetId);
        console.log(`\nProcess completed successfully.`);
    } catch (error) {
        console.error(`\nFailed to transfer cNFT: ${error.message}`);
        process.exit(1);
    }
}

// Run the script
main();