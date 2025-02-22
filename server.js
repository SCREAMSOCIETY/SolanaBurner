const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
// Use port 3000 as specified in the port mapping
const port = process.env.PORT || 3000;

// Enable CORS and static file serving
app.use(cors());
app.use(express.static(path.join(__dirname, 'static')));
app.use('/dist', express.static(path.join(__dirname, 'static', 'dist')));

// Health check endpoint
app.get('/ping', (req, res) => {
  console.log('Health check endpoint called');
  res.json({ status: 'ok' });
});

// Serve the main HTML file for all routes to support client-side routing
app.get('*', (req, res) => {
  console.log(`Serving index.html for path: ${req.path}`);
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
  console.log('Static files served from:', path.join(__dirname, 'static'));
  console.log('Dist files served from:', path.join(__dirname, 'static', 'dist'));
});

// Handle server errors
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  switch (error.code) {
    case 'EACCES':
      console.error(`Port ${port} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`Port ${port} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});