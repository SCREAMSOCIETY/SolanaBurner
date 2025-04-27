// Immediate logging to verify script execution
console.log('[SERVER INIT] Script starting, environment:', {
  env: process.env,
  argv: process.argv,
  cwd: process.cwd(),
  version: process.version
});

try {
  console.log('[SERVER INIT] Loading express module...');
  const express = require('express');
  const cors = require('cors');
  console.log('[SERVER INIT] Express module loaded successfully');

  console.log('[SERVER INIT] Creating express app instance...');
  const app = express();
  console.log('[SERVER INIT] Express app instance created');

  // Enable CORS
  app.use(cors());

  // Simple test endpoint
  app.get('/ping', (req, res) => {
    console.log('[SERVER] Ping endpoint hit');
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Serve static files
  console.log('[SERVER INIT] Setting up static file serving...');
  app.use('/static', express.static('static'));
  
  // Serve Markdown files (for documentation)
  app.get('/docs/cnft-simulation', (req, res) => {
    res.sendFile('CNFT_SIMULATION_NOTICE.md', { root: './' });
  });
  
  app.get('/docs/tree-creation', (req, res) => {
    res.sendFile('TREE_CREATION_GUIDE.md', { root: './' });
  });

  // Serve index.html for all routes to support SPA
  app.get('*', (req, res) => {
    console.log('[SERVER] Serving index.html for path:', req.path);
    res.sendFile('templates/index.html', { root: __dirname });
  });

  const port = 5000;

  // Start server with explicit host binding and detailed error logging
  app.listen(port, '0.0.0.0', () => {
    console.log(`[SERVER] Running at http://0.0.0.0:${port}`);
  }).on('error', (error) => {
    console.error('[SERVER FATAL] Failed to start:', {
      code: error.code,
      message: error.message,
      stack: error.stack,
      time: new Date().toISOString()
    });
  });

} catch (error) {
  console.error('[SERVER FATAL] Initialization error:', error);
}

// Log any uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[SERVER FATAL] Uncaught Exception:', {
    error: error.toString(),
    code: error.code,
    message: error.message,
    stack: error.stack,
    time: new Date().toISOString()
  });
});

// Log any unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER FATAL] Unhandled Rejection:', {
    reason: reason.toString(),
    stack: reason.stack,
    time: new Date().toISOString()
  });
});