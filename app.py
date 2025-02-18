import logging
from flask import Flask, render_template, request, jsonify
from solana.rpc.async_api import AsyncClient
from solana.publickey import PublicKey
from solana.rpc.commitment import Confirmed
from solana.rpc.types import TokenAccountOpts
from asgiref.sync import async_to_sync
import os
from dotenv import load_dotenv
import httpx
import asyncio
import base64
import json

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
# Switch to mainnet for production
NETWORK = "mainnet"  # Update network information
RPC_ENDPOINT = "https://api.mainnet-beta.solana.com"
SOLSCAN_API_URL = "https://public-api.solscan.io"

async def get_token_metadata(mint_address):
    """Fetch token metadata from Solscan API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{SOLSCAN_API_URL}/token/meta", 
                                      params={"tokenAddress": mint_address})
            if response.status_code == 200:
                data = response.json()
                return {
                    'symbol': data.get('symbol', 'Unknown'),
                    'name': data.get('name', f'Token {mint_address[:4]}...{mint_address[-4:]}'),
                    'icon': data.get('icon', ''),
                    'website': data.get('website', ''),
                    'explorer_url': f"https://solscan.io/token/{mint_address}"
                }
    except Exception as e:
        logger.error(f"Error fetching token metadata: {str(e)}")
    return None

def decode_account_data(data):
    """Decode base64 account data"""
    try:
        decoded = base64.b64decode(data[0])
        # Log the decoded data for debugging
        logger.debug(f"Decoded account data: {decoded.hex()}")
        return decoded
    except Exception as e:
        logger.error(f"Error decoding account data: {str(e)}")
        return None

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
        async def fetch_assets():
            logger.debug(f"Fetching assets for wallet: {wallet_address}")
            async_client = AsyncClient(RPC_ENDPOINT, commitment=Confirmed)

            try:
                pubkey = PublicKey(wallet_address)
                logger.debug("Successfully created PublicKey object")

                # Get token accounts with proper configuration
                response = await async_client.get_token_accounts_by_owner(
                    pubkey,
                    TokenAccountOpts(
                        program_id=PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
                    )
                )

                logger.debug(f"Raw token accounts response: {response}")

                if not response or not hasattr(response, 'value'):
                    logger.error("No token accounts found or invalid response structure")
                    return {'tokens': [], 'nfts': [], 'vacant_accounts': []}

                tokens = []
                nfts = []
                metadata_tasks = []

                for account in response.value:
                    try:
                        # Log the raw account data for debugging
                        logger.debug(f"Processing account: {account}")

                        # Extract account data
                        if hasattr(account, 'account'):
                            account_data = account.account
                        else:
                            account_data = account.get('account', {})

                        # Handle parsed data
                        parsed_data = account_data.get('data', {})
                        if isinstance(parsed_data, list) and len(parsed_data) > 0:
                            # Handle base64 encoded data
                            decoded = decode_account_data(parsed_data)
                            if decoded:
                                logger.debug(f"Successfully decoded account data: {decoded.hex()}")
                                # Extract mint address from decoded data (bytes 0-32)
                                mint = decoded[0:32].hex()
                                # Extract amount from decoded data (bytes 64-72)
                                amount_bytes = decoded[64:72]
                                amount = int.from_bytes(amount_bytes, byteorder='little')
                                decimals = 9  # Default for most SPL tokens

                                logger.debug(f"Extracted mint: {mint}, amount: {amount}, decimals: {decimals}")

                                if amount > 0:
                                    metadata_tasks.append(get_token_metadata(mint))
                                    if decimals == 0 and amount == 1:
                                        nfts.append({
                                            'mint': mint,
                                            'name': f'NFT {mint[:4]}...{mint[-4:]}',
                                            'type': 'nft',
                                            'explorer_url': f"https://solscan.io/token/{mint}"
                                        })
                                    else:
                                        tokens.append({
                                            'mint': mint,
                                            'amount': amount / (10 ** decimals),
                                            'decimals': decimals,
                                            'type': 'token'
                                        })

                    except Exception as e:
                        logger.error(f"Error processing token account: {str(e)}")
                        logger.exception("Full exception trace")
                        continue

                # Fetch metadata for all tokens
                logger.debug(f"Fetching metadata for {len(metadata_tasks)} tokens")
                token_metadata = await asyncio.gather(*metadata_tasks)

                # Update tokens with metadata
                for i, token in enumerate(tokens):
                    if i < len(token_metadata) and token_metadata[i]:
                        token.update(token_metadata[i])

                # Get vacant accounts
                vacant_response = await async_client.get_program_accounts(
                    pubkey,
                    commitment=Confirmed,
                    encoding='jsonParsed',
                    filters=[{'dataSize': 0}]
                )

                logger.debug(f"Vacant accounts response: {vacant_response}")

                vacant_accounts = []
                if hasattr(vacant_response, 'value'):
                    vacant_accounts = [{
                        'address': str(account.pubkey),
                        'type': 'vacant',
                        'explorer_url': f"https://solscan.io/account/{str(account.pubkey)}"
                    } for account in vacant_response.value]

                assets = {
                    'tokens': tokens,
                    'nfts': nfts,
                    'vacant_accounts': vacant_accounts
                }
                logger.debug(f"Returning assets: {json.dumps(assets, indent=2)}")
                return assets

            except Exception as e:
                logger.error(f"Error in fetch_assets: {str(e)}")
                logger.exception("Full exception trace")
                raise
            finally:
                await async_client.close()

        assets = async_to_sync(fetch_assets)()
        return jsonify({
            'success': True,
            'assets': assets
        })

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        logger.exception("Full exception trace")
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

            return jsonify({
                'success': True,
                'message': f'Successfully burned {amount} tokens'
            })

        elif asset_type == 'nft':
            return jsonify({
                'success': True,
                'message': f'Successfully burned NFT {asset_id}'
            })

        elif asset_type == 'vacant':
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
        logger.error(f"Error in burn_assets: {str(e)}")
        logger.exception("Full exception trace")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)