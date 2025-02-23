const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files from the static directory
app.use(express.static(path.join(__dirname, 'static')));

// Serve webpack bundle from dist directory
app.use('/dist', express.static(path.join(__dirname, 'static', 'dist')));

// API endpoint to get environment variables safely
app.get('/api/config', (req, res) => {
  console.log('Config endpoint called, providing API key safely');
  res.json({
    solscanApiKey: process.env.SOLSCAN_API_KEY || ''
  });
});

// Health check endpoint for monitoring
app.get('/ping', (req, res) => {
  console.log('Health check endpoint called');
  res.json({ status: 'ok' });
});

// Serve index.html for all routes to support client-side routing
app.get('*', (req, res) => {
  console.log(`Serving index.html for path: ${req.path}`);
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Better error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server with proper error handling
const server = app.listen(port, '0.0.0.0', () => {
  console.log('=================================');
  console.log(`Server running at http://0.0.0.0:${port}`);
  console.log('Static files served from:', path.join(__dirname, 'static'));
  console.log('Dist files served from:', path.join(__dirname, 'static', 'dist'));
  console.log('=================================');
}).on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});