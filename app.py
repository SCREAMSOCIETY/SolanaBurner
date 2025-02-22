import logging
from flask import Flask, render_template
from flask_cors import CORS
import os

# Configure basic logging with more detail
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)  # Enable CORS for all routes

@app.route('/ping')
def ping():
    logger.info("Ping endpoint called")
    return {"status": "ok"}

@app.route('/')
def index():
    logger.info("Root endpoint called - serving index.html template")
    try:
        return render_template('index.html')
    except Exception as e:
        logger.error(f"Error rendering template: {str(e)}")
        logger.exception("Detailed error trace:")
        return {"error": str(e)}, 500

if __name__ == '__main__':
    try:
        port = int(os.environ.get('PORT', 8082))
        logger.info(f"Starting Flask server on port {port}")
        logger.debug("Current environment:")
        logger.debug(f"REPLIT_DEV_DOMAIN: {os.environ.get('REPLIT_DEV_DOMAIN', 'not set')}")
        logger.debug(f"PORT: {os.environ.get('PORT', 'not set')}")

        app.run(
            host='0.0.0.0',
            port=port,
            debug=True,
            use_reloader=False,
            threaded=True
        )
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        logger.exception("Detailed traceback:")
        raise