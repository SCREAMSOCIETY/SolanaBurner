/**
 * Rate Limiter with Token Bucket Algorithm
 * 
 * This module provides a token bucket-based rate limiter for API requests.
 * It helps manage request flow to external APIs to avoid rate limiting errors (429).
 * 
 * Features:
 * - Token bucket algorithm for smooth request distribution
 * - Request queueing when tokens are depleted
 * - Priority queue support for urgent requests
 * - Configurable burst and rate parameters
 */

// Token bucket configuration
const MAX_TOKENS = 3;      // Maximum tokens (for burst capacity) - reduced from 5
const REFILL_RATE = 0.5;   // Tokens added per second - reduced from 2
const MIN_REFILL_MS = 500; // Minimum time between refills in milliseconds - increased from 150

// Internal state
let tokens = MAX_TOKENS;    // Current token count
let lastRefill = Date.now(); // Last time tokens were refilled
let requestQueue = [];      // Queue of pending requests
let isProcessing = false;   // Flag to prevent multiple queue processors

/**
 * Refill the token bucket based on elapsed time
 * @private
 */
function refillBucket() {
  const now = Date.now();
  const elapsedMs = now - lastRefill;
  
  // Only refill if enough time has passed
  if (elapsedMs < MIN_REFILL_MS) {
    return;
  }
  
  // Calculate new tokens to add based on elapsed time and rate
  const elapsedSeconds = elapsedMs / 1000;
  const newTokens = elapsedSeconds * REFILL_RATE;
  
  // Update token count, capped at maximum
  tokens = Math.min(tokens + newTokens, MAX_TOKENS);
  lastRefill = now;
  
  console.log(`[Rate Limiter] Refilled tokens: ${tokens.toFixed(2)}`);
}

/**
 * Process the queue of pending requests
 * @private
 */
async function processQueue() {
  // Prevent multiple concurrent queue processors
  if (isProcessing) {
    return;
  }
  
  isProcessing = true;
  
  try {
    // Process queue while we have tokens and requests
    while (requestQueue.length > 0 && tokens >= 1) {
      refillBucket(); // Try to refill tokens before processing
      
      // Only proceed if we have at least one token
      if (tokens < 1) {
        console.log(`[Rate Limiter] Not enough tokens (${tokens.toFixed(2)}), waiting...`);
        break;
      }
      
      // Remove one request from the queue
      const { requestFn, resolve, reject } = requestQueue.shift();
      
      // Consume one token
      tokens -= 1;
      console.log(`[Rate Limiter] Consuming token, ${tokens.toFixed(2)} remaining, queue length: ${requestQueue.length}`);
      
      try {
        // Execute the request
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        // If the request fails, pass the error back
        reject(error);
      }
      
      // Small delay between requests to avoid spikes
      await new Promise(r => setTimeout(r, 100));
    }
    
    // If there are still requests in the queue, schedule next processing
    if (requestQueue.length > 0) {
      // Calculate wait time based on token refill rate
      // The time needed to get at least one token
      const msToNextToken = (1 / REFILL_RATE) * 1000;
      const waitTime = Math.max(msToNextToken, MIN_REFILL_MS);
      
      console.log(`[Rate Limiter] Scheduling next queue processing in ${waitTime}ms, queue size: ${requestQueue.length}`);
      setTimeout(processQueue, waitTime);
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Queue a request to be executed when tokens are available
 * @param {Function} requestFn - The function to execute (must return a Promise)
 * @returns {Promise} - A promise that resolves when the request is executed
 */
function queueRequest(requestFn) {
  return new Promise((resolve, reject) => {
    // Wrap request in an object with callback functions
    const requestItem = { requestFn, resolve, reject };
    requestQueue.push(requestItem);
    
    // Attempt to process the queue
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
  refillBucket(); // Try to refill tokens first
  
  // If we have tokens available and no queue, execute immediately
  if (tokens >= 1 && requestQueue.length === 0) {
    tokens -= 1;
    console.log(`[Rate Limiter] Direct execution, ${tokens.toFixed(2)} tokens remaining`);
    return requestFn();
  }
  
  // Otherwise, queue the request
  console.log(`[Rate Limiter] Queueing request (priority: ${highPriority ? 'high' : 'normal'}), tokens: ${tokens.toFixed(2)}, queue length: ${requestQueue.length}`);
  
  return new Promise((resolve, reject) => {
    const requestItem = { requestFn, resolve, reject };
    
    // Add to front or back of queue based on priority
    if (highPriority) {
      requestQueue.unshift(requestItem);
    } else {
      requestQueue.push(requestItem);
    }
    
    // Attempt to process the queue
    processQueue();
  });
}

/**
 * Get the current token bucket state (for debugging)
 * @returns {Object} - The current token bucket state
 */
function getBucketState() {
  return {
    tokens: tokens.toFixed(2),
    queueLength: requestQueue.length,
    lastRefill: new Date(lastRefill).toISOString(),
    maxTokens: MAX_TOKENS,
    refillRate: `${REFILL_RATE}/sec`
  };
}

module.exports = {
  rateLimit,
  getBucketState
};