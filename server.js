const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 10;

// Enable CORS for all routes
app.use(cors());

// Better error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Serve static files from the static directory
app.use(express.static(path.join(__dirname, 'static')));

// Serve webpack bundle from dist directory
app.use('/dist', express.static(path.join(__dirname, 'static', 'dist')));

// Health check endpoint for monitoring
app.get('/ping', (req, res) => {
  console.log('Health check endpoint called');
  res.json({ status: 'ok' });
});

// Serve index.html for all routes to support client-side routing
app.get('*', (req, res) => {
  console.log(`Serving index.html for path: ${req.path}`);
  res.sendFile(path.join(__dirname, 'index.html'), err => {
    if (err) {
      console.error('Error sending index.html:', err);
      res.status(500).send('Error loading application');
    }
  });
});

// Try to start server with improved port handling and logging
const startServer = async (port = DEFAULT_PORT, attempt = 1) => {
  if (attempt > MAX_PORT_ATTEMPTS) {
    console.error(`Failed to find an available port after ${MAX_PORT_ATTEMPTS} attempts`);
    process.exit(1);
  }

  console.log(`[Server] Attempting to start server on port ${port} (attempt ${attempt}/${MAX_PORT_ATTEMPTS})`);

  try {
    const server = app.listen(port, '0.0.0.0');

    server.on('error', (error) => {
      console.log(`[Server] Error on port ${port}:`, error.code);
      if (error.code === 'EADDRINUSE') {
        console.log(`[Server] Port ${port} is in use, trying port ${port + 1}`);
        server.close();
        startServer(port + 1, attempt + 1);
      } else {
        console.error('[Server] Fatal error:', error);
        process.exit(1);
      }
    });

    server.on('listening', () => {
      const addr = server.address();
      console.log(`[Server] Successfully started on port ${addr.port}`);
      console.log('[Server] Access URLs:');
      console.log(`[Server] Local: http://localhost:${addr.port}`);
      console.log(`[Server] Network: http://0.0.0.0:${addr.port}`);
      console.log('[Server] Static files path:', path.join(__dirname, 'static'));
      console.log('[Server] Dist files path:', path.join(__dirname, 'static', 'dist'));
    });

  } catch (err) {
    console.error('[Server] Unexpected error during startup:', err);
    process.exit(1);
  }
};

// Start the server
console.log('[Server] Starting application server...');
startServer().catch(err => {
  console.error('[Server] Fatal error during server startup:', err);
  process.exit(1);
});