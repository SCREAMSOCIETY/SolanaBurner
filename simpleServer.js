// Immediate logging to verify script execution
console.log('[SERVER INIT] Starting minimal server with environment:', {
  env: process.env.NODE_ENV,
  cwd: process.cwd()
});

const express = require('express');
const path = require('path');
const app = express();

// Log process-level errors
process.on('uncaughtException', (err) => {
  console.error('[SERVER ERROR] Uncaught Exception:', {
    error: err.toString(),
    stack: err.stack,
    time: new Date().toISOString()
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER ERROR] Unhandled Rejection:', {
    reason: reason.toString(),
    stack: reason.stack,
    time: new Date().toISOString()
  });
});

// Simple test endpoint
app.get('/ping', (req, res) => {
  console.log('[SERVER] Ping endpoint hit');
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Basic static file serving
app.use('/static', express.static('static'));

// Serve index.html for all routes
app.get('*', (req, res) => {
  console.log('[SERVER] Serving index.html for path:', req.path);
  res.sendFile('templates/index.html', { root: __dirname });
});

// Try a different port
const port = process.env.PORT || 8080;

// Start server with detailed logging
app.listen(port, '0.0.0.0', () => {
  console.log(`[SERVER] Running at http://0.0.0.0:${port}`);
  console.log('[SERVER] Current directory structure:', path.resolve(__dirname));
}).on('error', (error) => {
  console.error('[SERVER FATAL] Failed to start:', {
    code: error.code,
    message: error.message,
    stack: error.stack,
    time: new Date().toISOString()
  });
  
  // If port is already in use, try a different port
  if (error.code === 'EADDRINUSE') {
    const newPort = port + 1;
    console.log(`[SERVER] Port ${port} is in use, trying port ${newPort}...`);
    app.listen(newPort, '0.0.0.0', () => {
      console.log(`[SERVER] Running at http://0.0.0.0:${newPort}`);
    });
  }
});
