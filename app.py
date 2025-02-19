import logging
from flask import Flask, render_template, request, jsonify
import httpx
import asyncio
import base64
import json
import os
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
RPC_ENDPOINT = os.getenv('QUICKNODE_RPC_URL', 'https://api.devnet.solana.com')
SOLANA_EXPLORER_API = "https://api.explorer.solana.com/v1"

async def make_rpc_call(method, params):
    """Make a direct RPC call to Solana"""
    logger.info(f"Making RPC call to endpoint: {RPC_ENDPOINT}")
    logger.info(f"Method: {method}")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                RPC_ENDPOINT,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": method,
                    "params": params
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"RPC call failed: {str(e)}")
            raise

async def get_token_metadata(mint_address):
    """Fetch token metadata from Solana Explorer API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SOLANA_EXPLORER_API}/token-metadata/{mint_address}",
                timeout=10.0
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    'symbol': data.get('symbol', 'Unknown'),
                    'name': data.get('name', f'Token {mint_address[:4]}...{mint_address[-4:]}'),
                    'icon': data.get('icon', ''),
                    'decimals': data.get('decimals', 9),
                    'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                }
    except Exception as e:
        logger.error(f"Error fetching token metadata: {str(e)}")

    return {
        'symbol': 'Unknown',
        'name': f'Token {mint_address[:4]}...{mint_address[-4:]}',
        'icon': '',
        'decimals': 9,
        'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
    }

async def fetch_assets(wallet_address):
    """Fetch assets using direct RPC calls"""
    logger.info(f"Fetching assets for wallet: {wallet_address}")

    try:
        # Get all token accounts
        token_accounts_response = await make_rpc_call(
            "getTokenAccountsByOwner",
            [
                wallet_address,
                {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
                {"encoding": "jsonParsed"}
            ]
        )

        logger.info(f"Token accounts response: {json.dumps(token_accounts_response, indent=2)}")

        tokens = []
        metadata_tasks = []

        if "result" in token_accounts_response:
            accounts = token_accounts_response["result"]["value"]
            logger.info(f"Found {len(accounts)} token accounts")

            for account in accounts:
                try:
                    parsed_data = account["account"]["data"]["parsed"]["info"]
                    mint = parsed_data["mint"]
                    amount = int(parsed_data["tokenAmount"]["amount"])
                    decimals = parsed_data["tokenAmount"]["decimals"]

                    if amount > 0:
                        metadata_tasks.append(get_token_metadata(mint))
                        tokens.append({
                            'mint': mint,
                            'raw_amount': amount,
                            'decimals': decimals,
                            'type': 'token'
                        })
                        logger.info(f"Added token: {mint} with amount: {amount}")
                except Exception as e:
                    logger.error(f"Error processing token account: {str(e)}")
                    continue

            if metadata_tasks:
                logger.info(f"Fetching metadata for {len(metadata_tasks)} tokens")
                token_metadata = await asyncio.gather(*metadata_tasks)

                for i, token in enumerate(tokens):
                    if i < len(token_metadata) and token_metadata[i]:
                        metadata = token_metadata[i]
                        raw_amount = token.pop('raw_amount', 0)
                        decimals = token.pop('decimals', 9)

                        token.update(metadata)
                        token['amount'] = raw_amount / (10 ** decimals)
                        logger.info(f"Processed token {token['mint']}: {token['amount']} {token['symbol']}")

        logger.info(f"Final tokens list: {json.dumps(tokens, indent=2)}")
        return {'tokens': tokens, 'nfts': []}

    except Exception as e:
        logger.error(f"Error in fetch_assets: {str(e)}")
        logger.exception("Full stack trace")
        raise

@app.route('/')
def index():
    return render_template('index.html', rpc_endpoint=RPC_ENDPOINT)

@app.route('/assets', methods=['GET'])
def get_assets():
    wallet_address = request.args.get('wallet')
    if not wallet_address:
        return jsonify({'success': False, 'message': 'Wallet address is required'}), 400

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        assets = loop.run_until_complete(fetch_assets(wallet_address))
        loop.close()

        return jsonify({
            'success': True,
            'assets': assets
        })
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        logger.exception("Full stack trace")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/burn', methods=['POST'])
def burn_assets():
    try:
        data = request.json
        logger.info(f"Received burn request with data: {data}")

        asset_type = data.get('assetType')
        asset_id = data.get('assetId')
        amount = data.get('amount')
        decimals = data.get('decimals', 9)

        if not all([asset_type, asset_id]):
            logger.error("Missing required fields in burn request")
            return jsonify({
                'success': False,
                'message': 'Asset type and ID are required'
            }), 400

        try:
            if asset_type == 'token':
                if not amount or float(amount) <= 0:
                    logger.error(f"Invalid amount in burn request: {amount}")
                    return jsonify({
                        'success': False,
                        'message': 'Amount must be greater than 0'
                    }), 400

                # Log the burn request
                logger.info(f"Processing burn request for token {asset_id}")
                logger.info(f"Amount: {amount}, Decimals: {decimals}")

                # Here we would typically interact with Solana to burn the tokens
                # For now, we're just simulating success
                response_data = {
                    'success': True,
                    'message': f'Successfully initiated burn of {amount} tokens',
                    'details': {
                        'mint': asset_id,
                        'amount': amount,
                        'decimals': decimals
                    }
                }
                logger.info(f"Burn request successful: {response_data}")
                return jsonify(response_data)

            else:
                logger.error(f"Invalid asset type in burn request: {asset_type}")
                return jsonify({
                    'success': False,
                    'message': 'Invalid asset type'
                }), 400

        except ValueError as e:
            logger.error(f"Invalid amount format: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Invalid amount format'
            }), 400

    except Exception as e:
        logger.error(f"Error in burn_assets: {str(e)}")
        logger.exception("Full stack trace")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8082))  
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)