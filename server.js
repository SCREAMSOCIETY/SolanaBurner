const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const DEFAULT_PORT = 5000;

// Enable CORS
app.use(cors());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'static'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  console.log('Serving index.html for path:', req.path);
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
function startServer() {
  try {
    const server = app.listen(DEFAULT_PORT, '0.0.0.0', () => {
      const addr = server.address();
      console.log(`[${new Date().toISOString()}] Server started`);
      console.log(`Local: http://localhost:${addr.port}`);
      console.log(`Network: http://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
    });

    server.on('error', (error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

console.log('Starting server...');
startServer();