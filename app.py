from flask import Flask, render_template, request, jsonify
from solana.rpc.api import Client
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
solana_client = Client("https://api.mainnet-beta.solana.com")

# Mock token data for demonstration
# In a real implementation, this would come from Solana network
AVAILABLE_TOKENS = [
    {
        "symbol": "SOL",
        "name": "Solana",
        "mint": "So11111111111111111111111111111111111111112",
        "decimals": 9
    },
    {
        "symbol": "USDC",
        "name": "USD Coin",
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "decimals": 6
    },
    {
        "symbol": "RAY",
        "name": "Raydium",
        "mint": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
        "decimals": 6
    }
]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/tokens', methods=['GET'])
def get_tokens():
    return jsonify({
        'success': True,
        'tokens': AVAILABLE_TOKENS
    })

@app.route('/burn', methods=['POST'])
def burn_tokens():
    data = request.json
    amount = data.get('amount')
    token_mint = data.get('tokenMint')

    if not amount or not token_mint:
        return jsonify({
            'success': False,
            'message': 'Amount and token mint are required'
        }), 400

    try:
        amount = float(amount)
        if amount <= 0:
            return jsonify({
                'success': False,
                'message': 'Amount must be greater than 0'
            }), 400

        # Find token details
        token = next((t for t in AVAILABLE_TOKENS if t['mint'] == token_mint), None)
        if not token:
            return jsonify({
                'success': False,
                'message': 'Invalid token mint address'
            }), 400

        # Mock implementation for now
        # In real implementation, we would:
        # 1. Create burn transaction for specific token
        # 2. Sign transaction
        # 3. Send transaction
        return jsonify({
            'success': True,
            'message': f'Successfully burned {amount} {token["symbol"]} tokens'
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