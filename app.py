import logging
from flask import Flask, jsonify
import os

# Configure basic logging with more detail (from original and edited)
logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG for more verbose output from edited code
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/ping')
def ping():
    logger.info("Ping endpoint called")
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    logger.info("Starting Flask server on port 3000")
    try:
        # Log the host and port we're trying to bind to (from edited code)
        logger.debug("Attempting to bind to host: 0.0.0.0, port: 3000")
        app.run(host='0.0.0.0', port=3000, debug=True, use_reloader=False)
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        logger.exception("Detailed traceback:")
        raise