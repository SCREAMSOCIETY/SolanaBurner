const express = require('express');
const path = require('path');
const cors = require('cors');

// Basic Express setup
const app = express();
const port = 5000;

console.log('[SERVER] Starting server with configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: port,
  CWD: process.cwd()
});

// Basic middleware
app.use(express.json());
app.use(cors());

// Simple test endpoint
app.get('/ping', (req, res) => {
  console.log('[SERVER] Ping endpoint hit');
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Basic error handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server with explicit host binding
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[SERVER] Running at http://0.0.0.0:${port}`);
}).on('error', (error) => {
  console.error('[SERVER FATAL] Failed to start:', error);
  setTimeout(() => process.exit(1), 1000);
});

// Handle process signals
process.on('SIGTERM', () => {
  console.log('[SERVER] Received SIGTERM signal. Closing server...');
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('[SERVER FATAL] Uncaught Exception:', error);
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER FATAL] Unhandled Rejection:', reason);
  setTimeout(() => process.exit(1), 1000);
});