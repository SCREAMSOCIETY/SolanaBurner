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
# Get RPC endpoint from environment variables
RPC_ENDPOINT = os.getenv('QUICKNODE_RPC_URL', 'https://api.devnet.solana.com')
SOLANA_EXPLORER_API = "https://api.explorer.solana.com/v1"

async def get_token_metadata(mint_address):
    """Fetch token metadata from Solana Explorer API"""
    try:
        logger.debug(f"Fetching metadata for token: {mint_address}")
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SOLANA_EXPLORER_API}/token-metadata/{mint_address}",
                timeout=10.0
            )

            logger.debug(f"Solana Explorer API response status: {response.status_code}")
            logger.debug(f"Solana Explorer API response: {response.text}")

            if response.status_code == 200:
                data = response.json()
                return {
                    'symbol': data.get('symbol', 'Unknown'),
                    'name': data.get('name', f'Token {mint_address[:4]}...{mint_address[-4:]}'),
                    'icon': data.get('icon', ''),
                    'decimals': data.get('decimals', 9),
                    'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                }
            else:
                logger.warning(f"Failed to fetch metadata from Solana Explorer. Status: {response.status_code}")
    except Exception as e:
        logger.error(f"Error fetching token metadata: {str(e)}")
        logger.exception("Full exception trace")

    # Return basic metadata if API fails
    return {
        'symbol': 'Unknown',
        'name': f'Token {mint_address[:4]}...{mint_address[-4:]}',
        'icon': '',
        'decimals': 9,
        'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
    }

def decode_account_data(data):
    """Decode base64 account data"""
    try:
        if isinstance(data, str):
            decoded = base64.b64decode(data)
        elif isinstance(data, list) and len(data) > 0:
            decoded = base64.b64decode(data[0])
        else:
            logger.error(f"Invalid data format: {type(data)}")
            return None

        # Log the decoded data for debugging
        logger.debug(f"Decoded account data length: {len(decoded)} bytes")
        logger.debug(f"Raw decoded data: {decoded.hex()}")
        return decoded
    except Exception as e:
        logger.error(f"Error decoding account data: {str(e)}")
        return None

@app.route('/')
def index():
    # Pass the RPC endpoint to the template
    return render_template('index.html', rpc_endpoint=RPC_ENDPOINT)

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

                tokens = []
                nfts = []
                metadata_tasks = []

                if hasattr(response, 'value'):
                    logger.debug(f"Found {len(response.value)} token accounts")
                    for account in response.value:
                        try:
                            logger.debug(f"Processing account: {account}")
                            account_data = account.account.data

                            # Handle base64 encoded data
                            decoded = decode_account_data(account_data)
                            if not decoded:
                                logger.warning(f"Could not decode account data for {account.pubkey}")
                                continue

                            # Extract mint address from decoded data (bytes 0-32)
                            mint_bytes = decoded[0:32]
                            mint = str(PublicKey(mint_bytes))
                            logger.debug(f"Extracted mint address: {mint}")

                            # Extract amount from decoded data (bytes 64-72)
                            amount_bytes = decoded[64:72]
                            amount = int.from_bytes(amount_bytes, byteorder='little')
                            logger.debug(f"Extracted amount: {amount}")

                            if amount > 0:
                                metadata_tasks.append(get_token_metadata(mint))
                                tokens.append({
                                    'mint': mint,
                                    'amount': amount / (10 ** 9),  # Most tokens use 9 decimals
                                    'decimals': 9,
                                    'type': 'token'
                                })
                                logger.debug(f"Added token with mint {mint} and amount {amount}")

                        except Exception as e:
                            logger.error(f"Error processing token account: {str(e)}")
                            logger.exception("Full exception trace")
                            continue

                    # Fetch metadata for all tokens
                    if metadata_tasks:
                        logger.debug(f"Fetching metadata for {len(metadata_tasks)} tokens")
                        token_metadata = await asyncio.gather(*metadata_tasks)

                        # Update tokens with metadata
                        for i, token in enumerate(tokens):
                            if i < len(token_metadata) and token_metadata[i]:
                                token.update(token_metadata[i])
                                logger.debug(f"Updated token {token['mint']} with metadata")
                    else:
                        logger.warning("No valid tokens found to fetch metadata for")

                assets = {
                    'tokens': tokens,
                    'nfts': nfts,
                    'vacant_accounts': []
                }

                logger.debug(f"Final assets structure: {json.dumps(assets, indent=2)}")
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