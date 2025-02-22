const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const DEFAULT_PORT = 3002;

// Enable CORS with specific configuration
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.url}`);
  next();
});

// Serve webpack bundle from dist directory first (since it's the compiled version)
app.use('/dist', express.static(path.join(__dirname, 'static', 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Then serve static files
app.use('/static', express.static(path.join(__dirname, 'static'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Health check endpoint
app.get('/ping', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
const startServer = () => {
  const server = app.listen(DEFAULT_PORT, '0.0.0.0', () => {
    const addr = server.address();
    console.log(`[Server] Server started on port ${addr.port}`);
    console.log(`[Server] Local: http://localhost:${addr.port}`);
    console.log(`[Server] Network: http://0.0.0.0:${addr.port}`);
  });

  server.on('error', (error) => {
    console.error('[Server] Server error:', error);
    process.exit(1);
  });
};

// Start the application
console.log('[Server] Starting server...');
startServer();