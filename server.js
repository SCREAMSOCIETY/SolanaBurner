const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
// Use Replit's provided port or fallback to 5000
const port = process.env.PORT || 5000;

// Enhanced request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // Log request body if present
  if (Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body));
  }

  // Log query parameters if present
  if (Object.keys(req.query).length > 0) {
    console.log('Query params:', req.query);
  }

  // Add response logging
  const oldSend = res.send;
  res.send = function(data) {
    console.log(`[${new Date().toISOString()}] Response status: ${res.statusCode}`);
    return oldSend.apply(res, arguments);
  };

  // Log response time
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} completed in ${duration}ms`);
  });

  next();
});

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

// Serve static files from the static directory
app.use(express.static(path.join(__dirname, 'static')));

// Serve webpack bundle from dist directory
app.use('/dist', express.static(path.join(__dirname, 'static', 'dist')));

// API endpoint to get environment variables safely
app.get('/api/config', (req, res) => {
  console.log('[API] Config endpoint called');
  const apiKey = process.env.SOLSCAN_API_KEY || '';
  console.log('[API] Returning config with API key present:', !!apiKey);
  res.json({
    solscanApiKey: apiKey
  });
});

// Health check endpoint for monitoring
app.get('/ping', (req, res) => {
  console.log('[Health] Health check endpoint called');
  res.json({ status: 'ok' });
});

// Serve index.html for all routes to support client-side routing
app.get('*', (req, res) => {
  console.log(`[${new Date().toISOString()}] Serving index.html for path: ${req.path}`);
  const indexPath = path.join(__dirname, 'templates', 'index.html');

  // Check if index.html exists
  const fs = require('fs');
  if (!fs.existsSync(indexPath)) {
    console.error('ERROR: index.html not found at path:', indexPath);
    return res.status(404).send('Index file not found');
  }

  res.sendFile(indexPath);
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error('[ERROR] Server error details:');
  console.error('- Timestamp:', new Date().toISOString());
  console.error('- URL:', req.url);
  console.error('- Method:', req.method);
  console.error('- Error name:', err.name);
  console.error('- Error message:', err.message);
  console.error('- Stack trace:', err.stack);

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server with proper error handling
try {
  console.log('Starting server with configuration:');
  console.log('- Port:', port);
  console.log('- Environment:', process.env.NODE_ENV);
  console.log('- Static directory:', path.join(__dirname, 'static'));
  console.log('- Templates directory:', path.join(__dirname, 'templates'));

  const server = app.listen(port, () => {
    console.log('=================================');
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log('Static files served from:', path.join(__dirname, 'static'));
    console.log('Dist files served from:', path.join(__dirname, 'static', 'dist'));
    console.log('Templates directory:', path.join(__dirname, 'templates'));
    console.log('Environment:', process.env.NODE_ENV);
    console.log('=================================');
  });

  // Handle process termination gracefully
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM signal. Closing server...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}