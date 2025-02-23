const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Parse JSON bodies
app.use(express.json());

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Enhanced request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // Log request body if present
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body));
  }

  // Log query parameters if present
  if (req.query && Object.keys(req.query).length > 0) {
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

// Serve static files with explicit paths
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use('/dist', express.static(path.join(__dirname, 'static', 'dist')));
app.use('/styles.css', express.static(path.join(__dirname, 'styles.css')));
app.use('/default-token-icon.svg', express.static(path.join(__dirname, 'static', 'default-token-icon.svg')));

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

// Serve index.html for all other routes to support client-side routing
app.get('*', (req, res) => {
  console.log(`[${new Date().toISOString()}] Serving index.html for path: ${req.path}`);
  const indexPath = path.join(__dirname, 'templates', 'index.html');

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error sending index.html:', err);
      res.status(500).send('Error loading application');
    }
  });
});

// Start server with explicit host binding and error handling
const server = app.listen(port, '0.0.0.0', () => {
  console.log('=================================');
  console.log(`Server running at http://0.0.0.0:${port}`);
  console.log('Static files served from:', path.join(__dirname, 'static'));
  console.log('Dist files served from:', path.join(__dirname, 'static', 'dist'));
  console.log('Templates directory:', path.join(__dirname, 'templates'));
  console.log('Environment:', process.env.NODE_ENV);
  console.log('=================================');
}).on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Handle process termination gracefully
process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal. Closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});