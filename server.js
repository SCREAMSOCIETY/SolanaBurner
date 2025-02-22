const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const DEFAULT_PORT = 3000;
const port = process.env.PORT || DEFAULT_PORT;

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

// Try to start server
const startServer = () => {
  try {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${port}`);
      console.log('Static files served from:', path.join(__dirname, 'static'));
      console.log('Dist files served from:', path.join(__dirname, 'static', 'dist'));
    }).on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Trying port ${port + 1}`);
        setTimeout(() => {
          server.close();
          startServer(port + 1);
        }, 1000);
      } else {
        console.error('Failed to start server:', error);
        process.exit(1);
      }
    });
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

startServer();