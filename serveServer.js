// Minimal static server using 'serve' package
const { exec } = require('child_process');
const port = 8080;

console.log('[SERVER INIT] Starting serve on port', port);

// Start 'serve' as a child process
const serveProcess = exec(`npx serve -s . -p ${port}`, {
  env: { ...process.env, PORT: port.toString() }
});

// Log output
serveProcess.stdout.on('data', (data) => {
  console.log(`[SERVE] ${data.toString().trim()}`);
});

serveProcess.stderr.on('data', (data) => {
  console.error(`[SERVE ERROR] ${data.toString().trim()}`);
});

// Handle process exit
serveProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`[SERVE] Process exited with code ${code}`);
  }
});

// Log process-level errors
process.on('uncaughtException', (err) => {
  console.error('[SERVER ERROR] Uncaught Exception:', {
    error: err.toString(),
    stack: err.stack,
    time: new Date().toISOString()
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER ERROR] Unhandled Rejection:', {
    reason: reason.toString(),
    stack: reason.stack,
    time: new Date().toISOString()
  });
});

console.log(`[SERVER] Started serve on http://0.0.0.0:${port}`);