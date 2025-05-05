/**
 * Queue-based Transfer Manager for cNFTs
 * 
 * This module implements a completely different approach to batch operations
 * by using a queue system that processes transfers sequentially over time.
 * This avoids Merkle tree proof validation issues by spacing out transactions
 * and using fresh proof data for each operation.
 */

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { BUBBLEGUM_PROGRAM_ID } = require('@metaplex-foundation/mpl-bubblegum');
const bs58 = require('bs58');
const axios = require('axios');
const heliusApi = require('./helius-api');
const serverTransfer = require('./server-transfer');
const config = require('./config');

// Set the project wallet as the default destination
const PROJECT_WALLET = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');

// RPC connection
const connection = new Connection(process.env.QUICKNODE_RPC_URL || 'https://api.mainnet-beta.solana.com');

// Queue configuration
const QUEUE_CONFIG = {
  processingDelay: 5000, // Delay 5 seconds between operations
  retryDelay: 10000,     // Wait 10 seconds before retrying failed operations
  maxRetries: 2,         // Maximum number of retry attempts per item
  batchConcurrency: 1,   // Process this many items at once (always 1 for sequential processing)
};

// In-memory storage for the transfer queue
// In a production environment, this would be stored in a database
const transferQueue = [];
const processingItems = new Set();
const completedItems = [];
const batchMap = new Map(); // Maps batch IDs to items
let isProcessing = false;   // Flag to track if queue processor is running

// Generate a unique batch ID
function generateBatchId() {
  return `batch_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Get tree authority PDA for a merkle tree
 * @param {PublicKey} merkleTree - The merkle tree public key
 * @returns {PublicKey} - The tree authority public key
 */
function getTreeAuthorityPDA(merkleTree) {
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  return treeAuthority;
}

/**
 * Add a batch of assets to the transfer queue
 * @param {string} ownerAddress - The owner's wallet address
 * @param {Array<string>} assetIds - Array of asset IDs to queue for transfer
 * @param {string} destinationAddress - Optional destination address (defaults to project wallet)
 * @returns {object} - Queue status and batch ID for tracking
 */
function queueTransferBatch(ownerAddress, assetIds, destinationAddress = null) {
  // Generate a batch ID
  const batchId = generateBatchId();
  
  // Default to project wallet if no destination provided
  const destination = destinationAddress ? new PublicKey(destinationAddress) : PROJECT_WALLET;
  
  // Create queue items for each asset
  const items = assetIds.map(assetId => ({
    id: `${batchId}_${assetId}`,
    batchId,
    assetId,
    ownerAddress,
    destinationAddress: destination.toString(),
    status: 'pending',
    retries: 0,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
  }));
  
  // Add items to the queue
  transferQueue.push(...items);
  
  // Add batch reference
  batchMap.set(batchId, {
    id: batchId,
    ownerAddress,
    destinationAddress: destination.toString(),
    assetIds,
    status: 'pending',
    startedAt: Date.now(),
    completedAt: null,
    stats: {
      total: items.length,
      pending: items.length,
      processing: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
    }
  });
  
  // Start processing the queue if not already running
  if (!isProcessing) {
    isProcessing = true;
    processQueue();
  }
  
  return {
    success: true,
    batchId,
    queueStatus: {
      totalItems: transferQueue.length,
      batchItems: items.length,
    },
  };
}

/**
 * Process the transfer queue
 * This function processes one item at a time with delays between operations
 */
async function processQueue() {
  console.log(`[Queue] Starting queue processor with ${transferQueue.length} items`);
  
  // Continue processing while there are items in the queue
  while (transferQueue.length > 0 || processingItems.size > 0) {
    // Process up to batchConcurrency items at a time
    while (processingItems.size < QUEUE_CONFIG.batchConcurrency && transferQueue.length > 0) {
      const item = transferQueue.shift();
      processingItems.add(item.id);
      
      // Update batch stats
      const batch = batchMap.get(item.batchId);
      if (batch) {
        batch.stats.pending--;
        batch.stats.processing++;
      }
      
      // Process the item asynchronously
      processQueueItem(item).then(result => {
        processingItems.delete(item.id);
        completedItems.push(result);
        
        // Update batch stats
        const batch = batchMap.get(item.batchId);
        if (batch) {
          batch.stats.processing--;
          batch.stats.processed++;
          
          if (result.status === 'succeeded') {
            batch.stats.succeeded++;
          } else if (result.status === 'failed') {
            batch.stats.failed++;
          }
          
          // Check if batch is complete
          if (batch.stats.processed === batch.stats.total) {
            batch.status = 'completed';
            batch.completedAt = Date.now();
          }
        }
      });
      
      // Delay before processing the next item
      await new Promise(resolve => setTimeout(resolve, QUEUE_CONFIG.processingDelay));
    }
    
    // If we've hit the concurrency limit, wait before checking again
    if (processingItems.size >= QUEUE_CONFIG.batchConcurrency) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('[Queue] Queue processor finished');
  isProcessing = false;
}

/**
 * Process a single queue item
 * @param {object} item - The queue item to process
 * @returns {Promise<object>} - Result of the operation
 */
async function processQueueItem(item) {
  console.log(`[Queue] Processing item ${item.id} for asset ${item.assetId}`);
  
  // Update item status
  item.status = 'processing';
  item.startedAt = Date.now();
  
  try {
    // Fetch asset details and proof data
    const assetDetails = await heliusApi.fetchAssetDetails(item.assetId);
    const proofData = await heliusApi.fetchAssetProof(item.assetId);
    
    if (!assetDetails || !proofData || !proofData.proof) {
      throw new Error('Failed to get required asset data or proof data');
    }
    
    // Verify the asset's owner matches the expected owner
    const currentOwner = assetDetails.ownership?.owner || assetDetails.owner?.toString();
    if (currentOwner !== item.ownerAddress) {
      throw new Error(`Asset owner mismatch. Expected: ${item.ownerAddress}, Actual: ${currentOwner}`);
    }
    
    // Use signature-based verification message to authenticate
    const message = `Transferring cNFT ${item.assetId} to project wallet`;
    
    // Call the server transfer function which should handle all the complexity of the transfer
    const result = await serverTransfer.performServerTransfer(
      item.ownerAddress,
      item.assetId,
      null, // No signed message in server mode
      proofData,
      assetDetails,
      item.destinationAddress
    );
    
    if (!result.success) {
      throw new Error(result.error || 'Transfer failed');
    }
    
    // Update item with success
    item.status = 'succeeded';
    item.completedAt = Date.now();
    console.log(`[Queue] Successfully processed item ${item.id} for asset ${item.assetId}`);
    
    return {
      ...item,
      result
    };
  } catch (error) {
    console.error(`[Queue] Error processing item ${item.id}:`, error);
    
    // Check if we should retry
    if (item.retries < QUEUE_CONFIG.maxRetries) {
      // Increment retry count
      item.retries++;
      item.status = 'pending';
      item.error = error.message;
      
      // Add back to the queue with a delay
      setTimeout(() => {
        transferQueue.push(item);
        
        // Update batch stats
        const batch = batchMap.get(item.batchId);
        if (batch) {
          batch.stats.pending++;
        }
        
        console.log(`[Queue] Retrying item ${item.id} (attempt ${item.retries})`);
      }, QUEUE_CONFIG.retryDelay);
      
      return {
        ...item,
        status: 'retrying'
      };
    } else {
      // Mark as failed after exhausting retries
      item.status = 'failed';
      item.error = error.message;
      item.completedAt = Date.now();
      
      return {
        ...item,
        error: error.message
      };
    }
  }
}

/**
 * Get the status of a transfer batch
 * @param {string} batchId - The batch ID to check
 * @returns {object} - Status information for the batch
 */
function getBatchStatus(batchId) {
  const batch = batchMap.get(batchId);
  
  if (!batch) {
    return {
      success: false,
      error: 'Batch not found'
    };
  }
  
  // Get the items for this batch
  const batchItems = completedItems.filter(item => item.batchId === batchId);
  
  return {
    success: true,
    batchId,
    status: batch.status,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    stats: batch.stats,
    items: batchItems.map(item => ({
      assetId: item.assetId,
      status: item.status,
      error: item.error
    }))
  };
}

/**
 * Get the status of the entire transfer queue
 * @returns {object} - Overall queue statistics
 */
function getQueueStatus() {
  return {
    success: true,
    totalBatches: batchMap.size,
    queueLength: transferQueue.length,
    processing: processingItems.size,
    completed: completedItems.length,
    batches: Array.from(batchMap.values()).map(batch => ({
      batchId: batch.id,
      status: batch.status,
      stats: batch.stats
    }))
  };
}

module.exports = {
  queueTransferBatch,
  getBatchStatus,
  getQueueStatus
};