/**
 * Server-side cNFT Transfer Handler
 * 
 * This script provides a REST API endpoint for transferring cNFTs.
 * It handles all the complex transfer logic on the server side to avoid
 * browser compatibility issues with the Solana web3.js library.
 */

const { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, ComputeBudgetProgram } = require('@solana/web3.js');
const bs58 = require('bs58');

// Constants
const SPL_NOOP_PROGRAM_ID = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
const BUBBLEGUM_PROGRAM_ID = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");

// Project wallet (where cNFTs will be transferred)
const PROJECT_WALLET = new PublicKey("EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK");

// Connection to Solana network
const connection = new Connection(process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com');

/**
 * Creates a transfer instruction for Bubblegum cNFTs
 */
function createTransferInstruction(accounts, args) {
  console.log("[SERVER] Creating transfer instruction");
  
  // Prepare the data for the instruction
  const dataLayout = new Uint8Array(1 + 32 + 32 + 32 + 8 + (32 * args.proof.length));
  
  // Transfer instruction discriminator
  dataLayout[0] = 3;
  
  // Copy the root, dataHash, and creatorHash into the data buffer
  args.root.copy(dataLayout, 1);
  args.dataHash.copy(dataLayout, 1 + 32);
  args.creatorHash.copy(dataLayout, 1 + 32 + 32);
  
  // Write the index as a little-endian 64-bit integer
  const indexBuffer = Buffer.alloc(8);
  indexBuffer.writeBigUInt64LE(BigInt(args.index), 0);
  indexBuffer.copy(dataLayout, 1 + 32 + 32 + 32);
  
  // Add the proofs
  let proofOffset = 1 + 32 + 32 + 32 + 8;
  for (let i = 0; i < args.proof.length; i++) {
    args.proof[i].copy(dataLayout, proofOffset);
    proofOffset += 32;
  }
  
  // Define the accounts
  const keys = [
    { pubkey: accounts.treeAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.leafOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.leafDelegate, isSigner: false, isWritable: false },
    { pubkey: accounts.newLeafOwner, isSigner: false, isWritable: false },
    { pubkey: accounts.merkleTree, isSigner: false, isWritable: true },
    { pubkey: accounts.logWrapper, isSigner: false, isWritable: false },
    { pubkey: BUBBLEGUM_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  
  return new TransactionInstruction({
    keys,
    programId: BUBBLEGUM_PROGRAM_ID,
    data: Buffer.from(dataLayout),
  });
}

/**
 * Process a transfer request from the client
 * This function creates the transfer transaction and
 * returns it as a serialized transaction for the client to sign
 */
async function processTransferRequest(req, res) {
  try {
    console.log("[SERVER] Processing transfer request");
    
    // Extract parameters from request
    const { assetId, ownerPublicKey, proofData } = req.body;
    
    if (!assetId || !ownerPublicKey || !proofData) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: assetId, ownerPublicKey, or proofData"
      });
    }
    
    // Log the request
    console.log(`[SERVER] Transfer request for asset ${assetId} from ${ownerPublicKey}`);
    
    // Parse public keys
    const ownerKey = new PublicKey(ownerPublicKey);
    const merkleTree = new PublicKey(proofData.tree_id);
    
    // Get recent blockhash for transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    // Create a new transaction
    const transaction = new Transaction({
      feePayer: ownerKey,
      blockhash,
      lastValidBlockHeight,
    });
    
    // Add compute budget instruction to support complex operations
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000,
      })
    );
    
    // Derive the tree authority
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Derive the log wrapper
    const [logWrapper] = PublicKey.findProgramAddressSync(
      [Buffer.from("log_wrapper", "utf8")],
      SPL_NOOP_PROGRAM_ID
    );
    
    // Create proof buffers
    const proofBuffers = proofData.proof.slice(0, 12).map(node => Buffer.from(bs58.decode(node)));
    
    // Create the transfer instruction
    const transferIx = createTransferInstruction(
      {
        treeAuthority,
        leafOwner: ownerKey,
        leafDelegate: ownerKey,
        newLeafOwner: PROJECT_WALLET,
        merkleTree,
        logWrapper,
      },
      {
        root: Buffer.from(bs58.decode(proofData.root)),
        dataHash: Buffer.from(bs58.decode(proofData.data_hash || "11111111111111111111111111111111")),
        creatorHash: Buffer.from(bs58.decode(proofData.creator_hash || "11111111111111111111111111111111")),
        index: proofData.leaf_id,
        proof: proofBuffers,
      }
    );
    
    // Add transfer instruction to transaction
    transaction.add(transferIx);
    
    // Serialize the transaction for the client to sign
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');
    
    console.log(`[SERVER] Transaction prepared successfully for asset ${assetId}`);
    
    // Return the serialized transaction for signing
    return res.status(200).json({
      success: true,
      transaction: serializedTransaction,
      message: "Transaction created successfully, please sign and submit",
      assetId,
    });
  } catch (error) {
    console.error(`[SERVER] Error processing transfer request:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || "Unknown error processing transfer request"
    });
  }
}

/**
 * Submit a signed transaction to the Solana network
 */
async function submitSignedTransaction(req, res) {
  try {
    console.log("[SERVER] Processing transaction submission");
    
    // Extract parameters from request
    const { signedTransaction, assetId } = req.body;
    
    if (!signedTransaction) {
      return res.status(400).json({
        success: false,
        error: "Missing signed transaction"
      });
    }
    
    // Convert base64 transaction to buffer
    const transactionBuffer = Buffer.from(signedTransaction, 'base64');
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(transactionBuffer, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed'
    });
    
    console.log(`[SERVER] Transaction ${signature} sent for asset ${assetId}`);
    
    // Wait for confirmation
    console.log(`[SERVER] Waiting for confirmation...`);
    const confirmation = await connection.confirmTransaction({
      signature,
      lastValidBlockHeight: 50, // Use a reasonable value
      blockhash: '', // This will be auto-resolved
    });
    
    // Return success response
    return res.status(200).json({
      success: true,
      signature,
      message: "Transaction confirmed successfully",
      assetId,
      explorerUrl: `https://solscan.io/tx/${signature}`
    });
  } catch (error) {
    console.error(`[SERVER] Error submitting transaction:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || "Unknown error submitting transaction"
    });
  }
}

module.exports = {
  processTransferRequest,
  submitSignedTransaction
};