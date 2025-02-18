from flask import Flask, render_template, request, jsonify
from solana.rpc.api import Client
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
# Switch to mainnet for production
solana_client = Client("https://api.mainnet-beta.solana.com")
NETWORK = "mainnet"  # Update network information

# Asset types for demonstration
ASSET_TYPES = {
    "tokens": [
        {
            "symbol": "SOL",
            "name": "Solana",
            "mint": "So11111111111111111111111111111111111111112",
            "decimals": 9,
            "type": "token"
        },
        {
            "symbol": "USDC",
            "name": "USD Coin",
            "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "decimals": 6,
            "type": "token"
        }
    ],
    "nfts": [],  # Will be populated from user's wallet
    "vacant_accounts": []  # Will be populated from user's wallet
}

@app.route('/')
def index():
    return render_template('index.html', network=NETWORK)

@app.route('/assets', methods=['GET'])
def get_assets():
    wallet_address = request.args.get('wallet')
    if not wallet_address:
        return jsonify({
            'success': False,
            'message': 'Wallet address is required'
        }), 400

    try:
        # In a real implementation, we would:
        # 1. Fetch NFTs owned by the wallet
        # 2. Check for vacant accounts
        # 3. Get token balances
        return jsonify({
            'success': True,
            'assets': ASSET_TYPES
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/burn', methods=['POST'])
def burn_assets():
    data = request.json
    asset_type = data.get('assetType')
    asset_id = data.get('assetId')
    amount = data.get('amount')

    if not all([asset_type, asset_id]):
        return jsonify({
            'success': False,
            'message': 'Asset type and ID are required'
        }), 400

    try:
        if asset_type == 'token':
            if not amount or float(amount) <= 0:
                return jsonify({
                    'success': False,
                    'message': 'Amount must be greater than 0'
                }), 400

            # Mock implementation for tokens
            token = next((t for t in ASSET_TYPES['tokens'] if t['mint'] == asset_id), None)
            if not token:
                return jsonify({
                    'success': False,
                    'message': 'Invalid token mint address'
                }), 400

            return jsonify({
                'success': True,
                'message': f'Successfully burned {amount} {token["symbol"]} tokens'
            })

        elif asset_type == 'nft':
            # Mock implementation for NFTs
            return jsonify({
                'success': True,
                'message': f'Successfully burned NFT {asset_id}'
            })

        elif asset_type == 'vacant':
            # Mock implementation for vacant accounts
            return jsonify({
                'success': True,
                'message': f'Successfully claimed rent from account {asset_id}'
            })

        else:
            return jsonify({
                'success': False,
                'message': 'Invalid asset type'
            }), 400

    except ValueError as e:
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