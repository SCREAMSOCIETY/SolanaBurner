/**
 * Rate Limiter for API Requests
 * 
 * This module implements a token bucket rate limiter to prevent 429 rate limit errors
 * when making API requests. It helps distribute requests over time.
 */

// Constants for rate limiting
const TOKENS_PER_SECOND = 2; // How many tokens regenerate per second
const BURST_CAPACITY = 10;   // Maximum number of tokens the bucket can hold
const MIN_TOKEN_THRESHOLD = 0.25; // Don't allow requests below this threshold (as a fraction of one token)

// Token bucket state
let tokenBucket = {
  tokens: BURST_CAPACITY,     // Start with a full bucket
  lastRefill: Date.now(),     // Last time we refilled the bucket
  pendingRequests: [],        // Queue of functions waiting to execute
  processingQueue: false      // Flag to prevent multiple queue processors
};

/**
 * Refill the token bucket based on elapsed time
 * @private
 */
function refillBucket() {
  const now = Date.now();
  const elapsedSeconds = (now - tokenBucket.lastRefill) / 1000;
  
  // Add tokens based on elapsed time, but don't exceed capacity
  const newTokens = elapsedSeconds * TOKENS_PER_SECOND;
  tokenBucket.tokens = Math.min(BURST_CAPACITY, tokenBucket.tokens + newTokens);
  tokenBucket.lastRefill = now;
  
  return tokenBucket.tokens;
}

/**
 * Process the queue of pending requests
 * @private
 */
async function processQueue() {
  // Prevent multiple queue processors running simultaneously
  if (tokenBucket.processingQueue) return;
  
  tokenBucket.processingQueue = true;
  
  try {
    while (tokenBucket.pendingRequests.length > 0) {
      refillBucket();
      
      // Check if we have enough tokens for the next request
      if (tokenBucket.tokens >= 1) {
        // Get the next request and execute it
        const nextRequest = tokenBucket.pendingRequests.shift();
        
        // Consume a token
        tokenBucket.tokens -= 1;
        
        try {
          // Execute the request and resolve its promise
          const result = await nextRequest.fn();
          nextRequest.resolve(result);
        } catch (error) {
          // If the request fails, reject its promise
          nextRequest.reject(error);
        }
      } else {
        // Not enough tokens, wait for more
        const timeToWait = (1 - tokenBucket.tokens) / TOKENS_PER_SECOND * 1000;
        await new Promise(resolve => setTimeout(resolve, timeToWait));
      }
    }
  } finally {
    // Reset the processing flag when done
    tokenBucket.processingQueue = false;
  }
}

/**
 * Queue a request to be executed when tokens are available
 * @param {Function} requestFn - The function to execute (must return a Promise)
 * @returns {Promise} - A promise that resolves when the request is executed
 */
function queueRequest(requestFn) {
  return new Promise((resolve, reject) => {
    // Add the request to the queue
    tokenBucket.pendingRequests.push({
      fn: requestFn,
      resolve,
      reject
    });
    
    // Start processing the queue if it's not already being processed
    processQueue();
  });
}

/**
 * Make a rate-limited API request
 * @param {Function} requestFn - The function to execute (must return a Promise)
 * @param {boolean} [highPriority=false] - If true, add to front of queue
 * @returns {Promise} - A promise that resolves when the request is executed
 */
function rateLimit(requestFn, highPriority = false) {
  refillBucket();
  
  // If we have enough tokens, execute immediately
  if (tokenBucket.tokens >= 1) {
    tokenBucket.tokens -= 1;
    return requestFn();
  }
  
  console.log(`[Rate Limiter] Token bucket has ${tokenBucket.tokens.toFixed(2)} tokens. Queueing request.`);
  
  // Otherwise, queue the request
  if (highPriority) {
    // Add to front of queue for high priority requests
    return new Promise((resolve, reject) => {
      tokenBucket.pendingRequests.unshift({
        fn: requestFn,
        resolve,
        reject
      });
      
      processQueue();
    });
  } else {
    // Standard queueing
    return queueRequest(requestFn);
  }
}

/**
 * Get the current token bucket state (for debugging)
 * @returns {Object} - The current token bucket state
 */
function getBucketState() {
  refillBucket();
  return {
    availableTokens: tokenBucket.tokens,
    queuedRequests: tokenBucket.pendingRequests.length,
    isProcessing: tokenBucket.processingQueue
  };
}

// Export the rate limiter functions
module.exports = {
  rateLimit,
  getBucketState
};