// Fastify server implementation
const path = require('path');
const fastify = require('fastify')({
  logger: {
    level: 'info'
  }
});
const fastifyStatic = require('@fastify/static');

// Log startup info
console.log('[FASTIFY SERVER] Starting with environment:', {
  env: process.env.NODE_ENV,
  cwd: process.cwd()
});

// Register static files from static directory
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'static'),
  prefix: '/static/',
});

// Serve index.html for root route
fastify.get('/', async (request, reply) => {
  fastify.log.info('Serving index.html for root path');
  return reply.sendFile('index.html', path.join(__dirname, 'templates'));
});

// Simple test endpoint
fastify.get('/ping', async (request, reply) => {
  fastify.log.info('Ping endpoint hit');
  return { status: 'ok', time: new Date().toISOString() };
});

// API Config endpoint
fastify.get('/api/config', async (request, reply) => {
  fastify.log.info('API config endpoint hit');
  return { 
    solscanApiKey: process.env.SOLSCAN_API_KEY || '',
    quicknodeRpcUrl: process.env.QUICKNODE_RPC_URL || '',
    environment: process.env.NODE_ENV || 'development'
  };
});

// Catch-all route for SPA - always serve index.html
fastify.setNotFoundHandler(async (request, reply) => {
  fastify.log.info(`Not found handler for: ${request.url}, serving index.html`);
  return reply.sendFile('index.html', path.join(__dirname, 'templates'));
});

// Log uncaught errors
process.on('uncaughtException', (err) => {
  fastify.log.error({
    msg: 'Uncaught Exception',
    error: err.toString(),
    stack: err.stack,
    time: new Date().toISOString()
  });
});

process.on('unhandledRejection', (reason, promise) => {
  fastify.log.error({
    msg: 'Unhandled Rejection',
    reason: reason.toString(),
    stack: reason.stack,
    time: new Date().toISOString()
  });
});

// Start the server - use port 5000 for Replit
const port = process.env.PORT || 5000;
const start = async () => {
  try {
    await fastify.listen({ port: port, host: '0.0.0.0' });
    fastify.log.info(`Server running at http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(`Error starting server: ${err}`);
    if (err.code === 'EADDRINUSE') {
      const newPort = port + 1;
      fastify.log.info(`Port ${port} is in use, trying port ${newPort}...`);
      try {
        await fastify.listen({ port: newPort, host: '0.0.0.0' });
        fastify.log.info(`Server running at http://0.0.0.0:${newPort}`);
      } catch (err2) {
        fastify.log.error(`Error on retry: ${err2}`);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
};

start();