import logging
from flask import Flask, jsonify
import os

# Configure basic logging with more detail
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/ping')
def ping():
    logger.info("Ping endpoint called")
    return jsonify({"status": "ok"})

@app.route('/')
def index():
    logger.info("Root endpoint called")
    # Temporarily return JSON instead of template to test server accessibility
    return jsonify({"message": "Server is running", "status": "ok"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8082))  # Changed default port to 8082
    logger.info(f"Starting Flask server on port {port}")
    try:
        logger.debug(f"Attempting to bind to host: 0.0.0.0, port: {port}")
        app.run(
            host='0.0.0.0',
            port=port,
            debug=True,
            use_reloader=False
        )
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        logger.exception("Detailed traceback:")
        raise