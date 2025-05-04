/**
 * Server-side cNFT Transfer Handler
 * 
 * This module provides the backend functionality for transferring cNFTs via the server.
 * It handles transaction creation on the server side, avoiding browser compatibility issues.
 */

// Load environment variables
require('dotenv').config();

// Import required libraries
const axios = require('axios');
const bs58 = require('bs58');
const { Connection, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { AccountMeta } = require('@solana/web3.js');

// Set up Solana connection using QuickNode RPC
const QUICKNODE_RPC_URL = process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(QUICKNODE_RPC_URL, 'confirmed');

// Set up constants
const PROJECT_WALLET = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');

// SPL bubblegum program ID
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');

// Fetch asset details from Helius API
async function fetchAssetDetails(assetId) {
  try {
    // Check if Helius API key is available
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }

    // Construct the RPC payload
    const payload = {
      jsonrpc: '2.0',
      id: 'helius-asset-details',
      method: 'getAsset',
      params: {
        id: assetId
      }
    };

    // Make the request to Helius API
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
      payload
    );

    // Check if we got a valid response
    if (!response.data || !response.data.result) {
      throw new Error('Invalid response format from Helius API');
    }

    return response.data.result;
  } catch (error) {
    console.error('Error fetching asset details:', error);
    throw error;
  }
}

// Fetch asset proof from Helius API
async function fetchAssetProof(assetId) {
  try {
    // Check if Helius API key is available
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY environment variable is not set');
    }

    // Construct the RPC payload
    const payload = {
      jsonrpc: '2.0',
      id: 'helius-asset-proof',
      method: 'getAssetProof',
      params: {
        id: assetId
      }
    };

    // Make the request to Helius API
    const response = await axios.post(
      `https://rpc.helius.xyz/?api-key=${heliusApiKey}`,
      payload
    );

    // Check if we got a valid response
    if (!response.data || !response.data.result) {
      throw new Error('Invalid response format from Helius API');
    }

    return response.data.result;
  } catch (error) {
    console.error('Error fetching asset proof:', error);
    throw error;
  }
}

// Manual creation of transfer instruction to avoid TransactionInstruction issues
function createTransferInstruction(accounts, args = null) {
  // Create data buffer: 8 bytes for anchor instruction discriminator
  // The bubblegum discriminator for transfer is [101, 185, 186, 2, 163, 45, 146, 64]
  const data = Buffer.from([101, 185, 186, 2, 163, 45, 146, 64]);
  
  // Convert all account addresses to PublicKey objects
  const accountMetas = accounts.map(account => ({
    pubkey: new PublicKey(account.pubkey),
    isWritable: account.isWritable,
    isSigner: account.isSigner
  }));
  
  // Return a plain object that has the structure needed
  return {
    programId: BUBBLEGUM_PROGRAM_ID,
    keys: accountMetas,
    data: data
  };
}

// Process a transfer request from the client
async function processTransferRequest(req, res) {
  try {
    console.log('Processing transfer request...');

    // Extract parameters from request
    const { walletAddress, assetId } = req.body;

    if (!walletAddress || !assetId) {
      return {
        success: false,
        error: 'Wallet address and asset ID are required'
      };
    }

    console.log(`Transferring asset ${assetId} from ${walletAddress} to ${PROJECT_WALLET.toString()}`);

    // Fetch asset details
    console.log('Fetching asset details...');
    const assetData = await fetchAssetDetails(assetId);
    
    // Verify ownership
    const currentOwner = assetData.ownership?.owner;
    if (currentOwner !== walletAddress) {
      return {
        success: false,
        error: `Only the owner can transfer this asset. Owner is ${currentOwner}, requested by ${walletAddress}`
      };
    }

    // Fetch asset proof
    console.log('Fetching asset proof...');
    const proofData = await fetchAssetProof(assetId);

    // Extract the tree pubkey from the proof data
    const treeAddress = new PublicKey(proofData.tree_id || proofData.tree);

    // Derive tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treeAddress.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );

    // Extract the root from proof data
    const root = proofData.root ? new Uint8Array(bs58.decode(proofData.root)) : null;
    
    // Extract data hash and creator hash from the leaf
    const dataHash = proofData.leaf?.data_hash 
      ? new Uint8Array(bs58.decode(proofData.leaf.data_hash))
      : new Uint8Array(32); // fill with zeros if not available
      
    const creatorHash = proofData.leaf?.creator_hash
      ? new Uint8Array(bs58.decode(proofData.leaf.creator_hash))
      : new Uint8Array(32); // fill with zeros if not available

    // Create array of proof nodes
    const proofNodes = (proofData.proof || []).map(p => new PublicKey(p));

    // Build account metas for the transfer instruction
    const accountMetas = [
      { pubkey: treeAuthority.toString(), isWritable: true, isSigner: false },
      { pubkey: proofData.leaf_owner || walletAddress, isWritable: false, isSigner: true },
      { pubkey: PROJECT_WALLET.toString(), isWritable: false, isSigner: false },
      { pubkey: treeAddress.toString(), isWritable: true, isSigner: false },
      // Add all proof nodes
      ...proofNodes.map(node => ({
        pubkey: node.toString(),
        isWritable: false,
        isSigner: false
      })),
      { pubkey: BUBBLEGUM_PROGRAM_ID.toString(), isWritable: false, isSigner: false },
    ];

    // Create transfer instruction
    const transferInstruction = createTransferInstruction(accountMetas);

    // Create a new transaction
    const transaction = new Transaction();
    
    // Add a system instruction to transfer a tiny amount of SOL to cover transaction fees
    // This is needed to make the transaction unique
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(walletAddress),
        toPubkey: PROJECT_WALLET,
        lamports: 1 // Minimal amount
      })
    );
    
    // Manually add the transfer instruction to the transaction
    transaction.add({
      programId: transferInstruction.programId,
      keys: transferInstruction.keys,
      data: transferInstruction.data
    });
    
    // Set recent blockhash
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    
    // Set fee payer
    transaction.feePayer = new PublicKey(walletAddress);

    // Serialize the transaction for the client to sign
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64');

    console.log('Transfer transaction created successfully');

    // Return the serialized transaction to be signed by the client
    return {
      success: true,
      data: {
        serializedTransaction,
        message: 'Transfer transaction created successfully, please sign it',
        destination: PROJECT_WALLET.toString(),
        assetId
      }
    };
  } catch (error) {
    console.error('Error processing transfer request:', error);
    return {
      success: false,
      error: `Error processing transfer request: ${error.message}`
    };
  }
}

// Submit a signed transaction to the Solana network
async function submitTransaction(req, res) {
  try {
    console.log('Submitting signed transaction...');

    // Extract the signed serialized transaction from request
    const { signedTransaction } = req.body;

    if (!signedTransaction) {
      return {
        success: false,
        error: 'Signed transaction is required'
      };
    }

    // Deserialize the transaction
    const transactionBuffer = Buffer.from(signedTransaction, 'base64');
    
    // Submit the transaction
    const signature = await connection.sendRawTransaction(transactionBuffer);
    
    console.log(`Transaction submitted with signature: ${signature}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature);
    
    if (confirmation.value.err) {
      console.error('Transaction error:', confirmation.value.err);
      return {
        success: false,
        error: `Transaction error: ${JSON.stringify(confirmation.value.err)}`
      };
    }

    console.log('Transaction confirmed successfully');

    // Return success response
    return {
      success: true,
      data: {
        signature,
        message: 'Transaction confirmed successfully',
        confirmationStatus: confirmation.value.confirmationStatus,
        explorer: `https://solscan.io/tx/${signature}`
      }
    };
  } catch (error) {
    console.error('Error submitting transaction:', error);
    return {
      success: false,
      error: `Error submitting transaction: ${error.message}`
    };
  }
}

module.exports = {
  processTransferRequest,
  submitTransaction
};