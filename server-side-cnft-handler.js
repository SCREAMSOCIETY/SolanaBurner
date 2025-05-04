/**
 * Server-Side cNFT Transfer Handler
 * 
 * This module completely handles cNFT transfers on the server side,
 * avoiding all client-side web3.js dependency issues.
 */

// Import required libraries
const { Connection, PublicKey, Transaction, sendAndConfirmTransaction, TransactionInstruction, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const nacl = require('tweetnacl');
require('dotenv').config();

// Constants
const PROJECT_WALLET = 'EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK';
const BUBBLEGUM_PROGRAM_ID = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY';
const SPL_NOOP_PROGRAM_ID = 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV';
const COMPRESSION_PROGRAM_ID = 'SPL_Noop1111111111111111111111111111111111111111';
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

// Get connection
const getConnection = () => {
  const rpcUrl = process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com';
  return new Connection(rpcUrl, 'confirmed');
};

// Fetch asset proof
const fetchAssetProof = async (assetId) => {
  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }
    
    const payload = {
      jsonrpc: '2.0',
      id: 'helius-proof-request',
      method: 'getAssetProof',
      params: {
        id: assetId
      }
    };
    
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
      payload
    );
    
    if (response.data && response.data.result) {
      return response.data.result;
    } else {
      throw new Error('Invalid response format from Helius RPC API');
    }
  } catch (error) {
    console.error('Error fetching asset proof:', error);
    
    // Try alternative method
    try {
      const heliusApiKey = process.env.HELIUS_API_KEY;
      const response = await axios.get(
        `https://api.helius.xyz/v0/assets/${assetId}/asset-proof?api-key=${heliusApiKey}`
      );
      
      if (response.data && response.data.proof) {
        return response.data;
      } else {
        throw new Error('Invalid response format from Helius REST API');
      }
    } catch (fallbackError) {
      console.error('Fallback error fetching asset proof:', fallbackError);
      throw new Error(`Failed to fetch asset proof: ${error.message}`);
    }
  }
};

// Fetch asset details
const fetchAssetDetails = async (assetId) => {
  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }
    
    const response = await axios.get(
      `https://api.helius.xyz/v0/assets/${assetId}?api-key=${heliusApiKey}`
    );
    
    if (response.data) {
      return response.data;
    } else {
      throw new Error('Invalid response format from Helius API');
    }
  } catch (error) {
    console.error('Error fetching asset details:', error);
    throw new Error(`Failed to fetch asset details: ${error.message}`);
  }
};

// Verify message signature
const verifySignature = (publicKey, message, signature) => {
  try {
    // Convert base58 public key to Uint8Array
    const publicKeyBytes = bs58.decode(publicKey);
    
    // Convert base64 signature to Uint8Array
    const signatureBytes = Buffer.from(signature, 'base64');
    
    // Convert message to Uint8Array
    const messageBytes = Buffer.from(message);
    
    // Verify the signature
    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
};

// Generate a transfer transaction
const generateTransferTransaction = async (ownerAddress, assetId, proofData) => {
  try {
    const connection = getConnection();
    
    // Create the necessary Public Keys
    const merkleTree = new PublicKey(proofData.tree_id || proofData.tree);
    const bubblegumProgram = new PublicKey(BUBBLEGUM_PROGRAM_ID);
    const splNoopProgram = new PublicKey(SPL_NOOP_PROGRAM_ID);
    const compressionProgram = new PublicKey(COMPRESSION_PROGRAM_ID);
    const systemProgram = new PublicKey(SYSTEM_PROGRAM_ID);
    const receiverPublicKey = new PublicKey(PROJECT_WALLET);
    const leafOwner = new PublicKey(ownerAddress);
    
    // Derive tree authority
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      bubblegumProgram
    );
    
    console.log(`Tree authority: ${treeAuthority.toString()}`);
    
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
    
    // Convert all base64 values to Buffer
    const rootBuffer = Buffer.from(proofData.root, 'base64');
    const dataHash = proofData.data_hash || (proofData.leaf && proofData.leaf.data_hash);
    const creatorHash = proofData.creator_hash || (proofData.leaf && proofData.leaf.creator_hash);
    
    const dataHashBuffer = Buffer.from(dataHash || '11111111111111111111111111111111', 'base64');
    const creatorHashBuffer = Buffer.from(creatorHash || '11111111111111111111111111111111', 'base64');
    const proofBuffers = (proofData.proof || []).map(p => Buffer.from(p, 'base64'));
    
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
    indexBuffer.writeBigUInt64LE(BigInt(proofData.node_index), 0);
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
    
    console.log('Instruction data created');
    
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
      feePayer: leafOwner,
      recentBlockhash: blockhash
    }).add(instruction);
    
    // Serialize the transaction for sending to the client
    const serializedTransaction = transaction.serialize({
      verifySignatures: false,
      requireAllSignatures: false
    }).toString('base64');
    
    return {
      serializedTransaction,
      blockhash
    };
  } catch (error) {
    console.error('Error generating transfer transaction:', error);
    throw new Error(`Failed to generate transfer transaction: ${error.message}`);
  }
};

// Submit a signed transaction
const submitSignedTransaction = async (serializedTransaction) => {
  try {
    const connection = getConnection();
    
    // Deserialize the transaction
    const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(transactionBuffer, {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    console.log(`Transaction sent with signature: ${signature}`);
    
    // Wait for confirmation
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    });
    
    if (confirmation.value.err) {
      throw new Error(`Transaction confirmed but failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    return {
      signature,
      status: 'confirmed'
    };
  } catch (error) {
    console.error('Error submitting transaction:', error);
    throw new Error(`Failed to submit transaction: ${error.message}`);
  }
};

// Process a transfer request
const processTransferRequest = async (req, res) => {
  try {
    const { assetId, walletAddress, signedMessage, messageToSign } = req.body;
    
    if (!assetId || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Asset ID and wallet address are required'
      });
    }
    
    console.log(`Processing transfer request for asset ${assetId} from ${walletAddress}`);
    
    // Verify asset ownership
    const assetDetails = await fetchAssetDetails(assetId);
    if (assetDetails.ownership.owner !== walletAddress) {
      return res.status(403).json({
        success: false,
        error: `You don't own this asset. Owner is ${assetDetails.ownership.owner}`
      });
    }
    
    // Verify signature if provided
    if (signedMessage && messageToSign) {
      const isValid = verifySignature(walletAddress, messageToSign, signedMessage);
      if (!isValid) {
        return res.status(403).json({
          success: false,
          error: 'Invalid signature'
        });
      }
    }
    
    // Fetch asset proof
    const proofData = await fetchAssetProof(assetId);
    
    // Generate transfer transaction
    const { serializedTransaction, blockhash } = await generateTransferTransaction(
      walletAddress,
      assetId,
      proofData
    );
    
    // Return the serialized transaction for signing
    return res.json({
      success: true,
      data: {
        serializedTransaction,
        blockhash,
        message: 'Transaction generated successfully. Please sign and submit.'
      }
    });
  } catch (error) {
    console.error('Error processing transfer request:', error);
    return res.status(500).json({
      success: false,
      error: `Error processing transfer request: ${error.message}`
    });
  }
};

// Process a direct transfer if we have the private key (useful for CLI)
const processDirectTransfer = async (assetId, privateKeyBase58) => {
  try {
    console.log(`Processing direct transfer for asset ${assetId}`);
    
    // Create keypair from private key
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    const walletAddress = keypair.publicKey.toString();
    
    console.log(`Wallet address: ${walletAddress}`);
    
    // Verify asset ownership
    const assetDetails = await fetchAssetDetails(assetId);
    if (assetDetails.ownership.owner !== walletAddress) {
      throw new Error(`You don't own this asset. Owner is ${assetDetails.ownership.owner}`);
    }
    
    // Fetch asset proof
    const proofData = await fetchAssetProof(assetId);
    
    const connection = getConnection();
    
    // Create the necessary Public Keys
    const merkleTree = new PublicKey(proofData.tree_id || proofData.tree);
    const bubblegumProgram = new PublicKey(BUBBLEGUM_PROGRAM_ID);
    const splNoopProgram = new PublicKey(SPL_NOOP_PROGRAM_ID);
    const compressionProgram = new PublicKey(COMPRESSION_PROGRAM_ID);
    const systemProgram = new PublicKey(SYSTEM_PROGRAM_ID);
    const receiverPublicKey = new PublicKey(PROJECT_WALLET);
    
    // Derive tree authority
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      bubblegumProgram
    );
    
    console.log(`Tree authority: ${treeAuthority.toString()}`);
    
    // Create accounts for the instruction
    const accounts = [
      { pubkey: treeAuthority, isSigner: false, isWritable: false },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: receiverPublicKey, isSigner: false, isWritable: false },
      { pubkey: merkleTree, isSigner: false, isWritable: true },
      { pubkey: splNoopProgram, isSigner: false, isWritable: false },
      { pubkey: compressionProgram, isSigner: false, isWritable: false },
      { pubkey: systemProgram, isSigner: false, isWritable: false }
    ];
    
    // Convert all base64 values to Buffer
    const rootBuffer = Buffer.from(proofData.root, 'base64');
    const dataHash = proofData.data_hash || (proofData.leaf && proofData.leaf.data_hash);
    const creatorHash = proofData.creator_hash || (proofData.leaf && proofData.leaf.creator_hash);
    
    const dataHashBuffer = Buffer.from(dataHash || '11111111111111111111111111111111', 'base64');
    const creatorHashBuffer = Buffer.from(creatorHash || '11111111111111111111111111111111', 'base64');
    const proofBuffers = (proofData.proof || []).map(p => Buffer.from(p, 'base64'));
    
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
    indexBuffer.writeBigUInt64LE(BigInt(proofData.node_index), 0);
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
    
    console.log('Instruction data created');
    
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
      feePayer: keypair.publicKey,
      recentBlockhash: blockhash
    }).add(instruction);
    
    // Sign and send the transaction
    console.log('Signing and sending transaction...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair]
    );
    
    console.log(`Transaction sent with signature: ${signature}`);
    console.log(`Explorer URL: https://solscan.io/tx/${signature}`);
    
    return {
      success: true,
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`
    };
  } catch (error) {
    console.error('Error processing direct transfer:', error);
    throw new Error(`Failed to process direct transfer: ${error.message}`);
  }
};

// Submit a transaction handler
const submitTransaction = async (req, res) => {
  try {
    const { signedTransaction } = req.body;
    
    if (!signedTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Signed transaction is required'
      });
    }
    
    console.log('Submitting signed transaction');
    
    const { signature, status } = await submitSignedTransaction(signedTransaction);
    
    return res.json({
      success: true,
      data: {
        signature,
        status,
        explorerUrl: `https://solscan.io/tx/${signature}`
      }
    });
  } catch (error) {
    console.error('Error submitting transaction:', error);
    return res.status(500).json({
      success: false,
      error: `Error submitting transaction: ${error.message}`
    });
  }
};

module.exports = {
  processTransferRequest,
  submitTransaction,
  processDirectTransfer,
  fetchAssetProof,
  fetchAssetDetails
};