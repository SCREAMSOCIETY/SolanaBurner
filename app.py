from flask import Flask, render_template, request, jsonify
from solana.rpc.api import Client
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
solana_client = Client("https://api.mainnet-beta.solana.com")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/burn', methods=['POST'])
def burn_tokens():
    amount = request.json.get('amount')
    if not amount:
        return jsonify({
            'success': False,
            'message': 'Amount is required'
        }), 400

    try:
        amount = float(amount)
        if amount <= 0:
            return jsonify({
                'success': False,
                'message': 'Amount must be greater than 0'
            }), 400

        # Mock implementation for now
        # In real implementation, we would:
        # 1. Create transaction
        # 2. Sign transaction
        # 3. Send transaction
        return jsonify({
            'success': True,
            'message': f'Successfully burned {amount} tokens'
        })
    except ValueError:
        return jsonify({
            'success': False,
            'message': 'Invalid amount format'
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)