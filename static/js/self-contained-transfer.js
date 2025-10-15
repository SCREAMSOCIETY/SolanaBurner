/**
 * Self-contained cNFT transfer implementation
 * This implementation includes its own TransactionInstruction definition
 * to avoid dependency issues with the web3.js library
 */

// Create our own minimal version of TransactionInstruction
class SelfContainedTransactionInstruction {
  constructor(options) {
    this.keys = options.keys;
    this.programId = options.programId;
    this.data = options.data;
  }
}

// Import required dependencies
import { Connection, PublicKey, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import bs58 from 'bs58';

// Constants
const SPL_NOOP_PROGRAM_ID = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
const BUBBLEGUM_PROGRAM_ID = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");

/**
 * Creates a transfer instruction for cNFT using a self-contained implementation
 */
function createSelfContainedTransferInstruction(accounts, args) {
  console.log("[SelfContained] Creating transfer instruction");
  
  // Prepare the instruction data
  const dataLayout = new Uint8Array(1 + 32 + 32 + 32 + 8 + (32 * args.proof.length));
  
  // Instruction discriminator for "transfer"
  dataLayout[0] = 3; // Transfer instruction discriminator
  
  // Add root
  args.root.copy(dataLayout, 1);
  
  // Add data hash and creator hash
  args.dataHash.copy(dataLayout, 1 + 32);
  args.creatorHash.copy(dataLayout, 1 + 32 + 32);
  
  // Add index (leaf_id)
  const indexBuffer = Buffer.alloc(8);
  indexBuffer.writeBigUInt64LE(BigInt(args.index), 0);
  indexBuffer.copy(dataLayout, 1 + 32 + 32 + 32);
  
  // Add proofs
  let proofOffset = 1 + 32 + 32 + 32 + 8;
  for (let i = 0; i < args.proof.length; i++) {
    args.proof[i].copy(dataLayout, proofOffset);
    proofOffset += 32;
  }
  
  // Define the accounts
  const instructionKeys = [
    { pubkey: accounts.treeAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.leafOwner, isSigner: true, isWritable: false },
    { pubkey: accounts.leafDelegate, isSigner: false, isWritable: false },
    { pubkey: accounts.newLeafOwner, isSigner: false, isWritable: false },
    { pubkey: accounts.merkleTree, isSigner: false, isWritable: true },
    { pubkey: accounts.logWrapper, isSigner: false, isWritable: false },
    { pubkey: BUBBLEGUM_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  
  console.log("[SelfContained] Instruction created with", instructionKeys.length, "accounts");
  
  return new SelfContainedTransactionInstruction({
    keys: instructionKeys,
    programId: BUBBLEGUM_PROGRAM_ID,
    data: Buffer.from(dataLayout),
  });
}

/**
 * Transfer a cNFT using a self-contained transfer implementation
 */
export async function selfContainedTransferCNFT(options) {
  try {
    const { connection, wallet, assetId, destinationAddress, proofData, assetData } = options;
    
    console.log(`[SelfContained] Starting transfer of ${assetId} to ${destinationAddress}`);
    
    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    // Create transaction
    const transaction = new Transaction({
      feePayer: wallet.publicKey,
      blockhash,
      lastValidBlockHeight,
    });
    
    // Add compute budget instruction
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ 
        units: 400000 
      })
    );
    
    // Get merkle tree
    const merkleTree = new PublicKey(proofData.tree_id);
    console.log(`[SelfContained] Using merkle tree: ${merkleTree.toString()}`);
    
    // Derive tree authority
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    // Derive log wrapper
    const [logWrapper] = PublicKey.findProgramAddressSync(
      [Buffer.from("log_wrapper", "utf8")],
      SPL_NOOP_PROGRAM_ID
    );
    
    // Create the transfer instruction
    const transferIx = createSelfContainedTransferInstruction(
      {
        treeAuthority,
        leafOwner: wallet.publicKey,
        leafDelegate: wallet.publicKey,
        newLeafOwner: new PublicKey(destinationAddress),
        merkleTree,
        logWrapper,
      },
      {
        root: Buffer.from(bs58.decode(proofData.root)),
        dataHash: Buffer.from(bs58.decode(proofData.data_hash || "11111111111111111111111111111111")),
        creatorHash: Buffer.from(bs58.decode(proofData.creator_hash || "11111111111111111111111111111111")),
        index: proofData.leaf_id,
        proof: proofData.proof.slice(0, 12).map(node => Buffer.from(bs58.decode(node)))
      }
    );
    
    // Add to transaction
    transaction.add(transferIx);
    
    // Sign transaction
    console.log(`[SelfContained] Requesting wallet signature`);
    const signedTx = await wallet.signTransaction(transaction);
    
    console.log(`[SelfContained] Sending transaction`);
    const signature = await connection.sendRawTransaction(
      signedTx.serialize(),
      { 
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: 'confirmed' 
      }
    );
    
    // Wait for confirmation
    console.log(`[SelfContained] Transaction sent, waiting for confirmation`);
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');
    
    console.log(`[SelfContained] Transaction confirmed: ${signature}`);
    
    // Return success
    return {
      success: true,
      signature,
      message: "Successfully transferred cNFT to project collection",
      assetData: assetData,
      explorerUrl: `https://solscan.io/tx/${signature}`
    };
  } catch (error) {
    // Log and return error
    console.error(`[SelfContained] Error: ${error.message}`, error);
    return {
      success: false,
      error: error.message || "Unknown error in self-contained transfer",
      logs: error.logs || []
    };
  }
}

// Make available to the window
if (typeof window !== 'undefined') {
  window.selfContainedTransfer = {
    transferCNFT: selfContainedTransferCNFT
  };
}