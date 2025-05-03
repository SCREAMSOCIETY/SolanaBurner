/**
 * Server-side cNFT Transfer Handler
 * 
 * This script provides a REST API endpoint for transferring cNFTs.
 * It handles all the complex transfer logic on the server side to avoid
 * browser compatibility issues with the Solana web3.js library.
 */

const fastify = require('fastify');
const { Connection, PublicKey, Transaction, VersionedTransaction, TransactionInstruction } = require('@solana/web3.js');
const { PROGRAM_ID: BUBBLEGUM_PROGRAM_ID } = require('@metaplex-foundation/mpl-bubblegum');
const bs58 = require('bs58');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Set up Solana connection
const QUICKNODE_RPC_URL = process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(QUICKNODE_RPC_URL, 'confirmed');

// Set project wallet - This is the destination for "trashed" cNFTs
const PROJECT_WALLET = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');

/**
 * Creates a transfer instruction for Bubblegum cNFTs
 */
function createTransferInstruction(accounts, args) {
  // Get the tree authority PDA
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [accounts.merkleTree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  
  // Create the accounts object needed for the instruction
  const keys = [
    { pubkey: treeAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.leafOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.leafDelegate, isSigner: true, isWritable: false },
    { pubkey: accounts.newLeafOwner, isSigner: false, isWritable: false },
    { pubkey: accounts.merkleTree, isSigner: false, isWritable: true },
    { pubkey: BUBBLEGUM_PROGRAM_ID, isSigner: false, isWritable: false }
  ];
  
  // Create the data buffer for the instruction
  // 3 = transfer instruction discriminator
  const dataLayout = Buffer.from([
    3,
    ...accounts.root,
    ...Buffer.from(accounts.dataHash, 'base64'),
    ...Buffer.from(accounts.creatorHash, 'base64'),
    ...Buffer.from([accounts.nonce.toString().length]),
    ...Buffer.from(accounts.nonce.toString(), 'utf8'),
    ...Buffer.from([accounts.index.toString().length]),
    ...Buffer.from(accounts.index.toString(), 'utf8'),
  ]);
  
  // Return the TransactionInstruction
  return new TransactionInstruction({
    keys,
    programId: BUBBLEGUM_PROGRAM_ID,
    data: dataLayout
  });
}

/**
 * Process a transfer request from the client
 * This function creates the transfer transaction and
 * returns it as a serialized transaction for the client to sign
 */
async function processTransferRequest(req, res) {
  try {
    const { ownerPublicKey, assetId, proofData } = req.body;
    
    // Validate inputs
    if (!ownerPublicKey || !assetId || !proofData) {
      return res.status(400).send({
        success: false,
        error: 'Missing required parameters'
      });
    }
    
    console.log(`Processing transfer request for asset ${assetId} from ${ownerPublicKey}`);
    
    // Fetch additional asset data if needed
    const assetResponse = await fetch(
      `https://api.helius.xyz/v0/tokens/metadata?api-key=${process.env.HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintAccounts: [assetId] })
      }
    );
    
    if (!assetResponse.ok) {
      return res.status(500).send({
        success: false,
        error: 'Failed to fetch asset data from Helius'
      });
    }
    
    const assetData = await assetResponse.json();
    if (!assetData || !assetData[0]) {
      return res.status(500).send({
        success: false,
        error: 'Invalid asset data received from Helius'
      });
    }
    
    const compression = assetData[0].compression;
    if (!compression) {
      return res.status(400).send({
        success: false,
        error: 'Asset is not a compressed NFT'
      });
    }
    
    // Create parameters for the transfer instruction
    const params = {
      merkleTree: new PublicKey(compression.tree),
      leafOwner: new PublicKey(ownerPublicKey),
      leafDelegate: new PublicKey(ownerPublicKey),
      newLeafOwner: PROJECT_WALLET,
      root: Buffer.from(proofData.root.substring(0, 32), 'hex'),
      dataHash: compression.data_hash,
      creatorHash: compression.creator_hash,
      nonce: compression.seq,
      index: compression.leaf_id
    };
    
    // Create the transfer instruction
    const transferIx = createTransferInstruction(params, {});
    
    // Create a new transaction
    const transaction = new Transaction();
    
    // Add the transfer instruction
    transaction.add(transferIx);
    
    // Recent blockhash for the transaction
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = new PublicKey(ownerPublicKey);
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    
    // Return the serialized transaction to the client
    return res.send({
      success: true,
      transaction: serializedTransaction.toString('base64'),
      assetId,
      ownerPublicKey
    });
  } catch (error) {
    console.error('Error processing transfer request:', error);
    return res.status(500).send({
      success: false,
      error: error.message || 'Server error processing transfer'
    });
  }
}

/**
 * Submit a signed transaction to the Solana network
 */
async function submitSignedTransaction(req, res) {
  try {
    const { signedTransaction, assetId } = req.body;
    
    // Validate inputs
    if (!signedTransaction) {
      return res.status(400).send({
        success: false,
        error: 'Missing signed transaction'
      });
    }
    
    console.log(`Submitting transaction for asset ${assetId}`);
    
    // Deserialize the transaction
    const transaction = Transaction.from(
      Buffer.from(signedTransaction, 'base64')
    );
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(
      transaction.serialize()
    );
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature);
    
    console.log(`Transaction confirmed with signature: ${signature}`);
    
    // Return the transaction signature
    return res.send({
      success: true,
      signature,
      assetId
    });
  } catch (error) {
    console.error('Error submitting transaction:', error);
    return res.status(500).send({
      success: false,
      error: error.message || 'Server error submitting transaction'
    });
  }
}

// Add these endpoints to the Fastify server
module.exports = function(fastify, options, done) {
  // Endpoint to prepare a transfer transaction
  fastify.post('/api/server-transfer/prepare', processTransferRequest);
  
  // Endpoint to submit a signed transaction
  fastify.post('/api/server-transfer/submit', submitSignedTransaction);
  
  done();
};