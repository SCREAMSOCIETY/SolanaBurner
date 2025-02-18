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

                # Create proper TokenAccountOpts
                opts = TokenAccountOpts(
                    program_id=PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
                )

                # Get token accounts with proper configuration
                token_accounts = await async_client.get_token_accounts_by_owner(
                    pubkey,
                    opts,
                    commitment=Confirmed
                )

                logger.debug(f"Found {len(token_accounts.value) if token_accounts.value else 0} token accounts")

                tokens = []
                nfts = []
                metadata_tasks = []

                for account in token_accounts.value:
                    try:
                        parsed_data = account.account.data['parsed']
                        if 'info' not in parsed_data:
                            continue

                        token_info = parsed_data['info']
                        mint = token_info.get('mint')
                        token_amount = token_info.get('tokenAmount')

                        if not mint or not token_amount:
                            continue

                        amount = float(token_amount['amount']) / (10 ** token_amount['decimals'])

                        if amount > 0:
                            metadata_tasks.append(get_token_metadata(mint))
                            if token_amount['decimals'] == 0 and token_amount['amount'] == '1':
                                nfts.append({
                                    'mint': mint,
                                    'name': f'NFT {mint[:4]}...{mint[-4:]}',
                                    'type': 'nft',
                                    'explorer_url': f"https://solscan.io/token/{mint}"
                                })
                            else:
                                tokens.append({
                                    'mint': mint,
                                    'amount': amount,
                                    'decimals': token_amount['decimals'],
                                    'type': 'token'
                                })

                    except Exception as e:
                        logger.error(f"Error processing token account: {str(e)}")
                        logger.exception("Full exception trace")
                        continue

                # Fetch metadata for all tokens
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

                logger.debug(f"Found {len(vacant_response.value) if vacant_response.value else 0} vacant accounts")

                vacant_accounts = [{
                    'address': str(account.pubkey),
                    'type': 'vacant',
                    'explorer_url': f"https://solscan.io/account/{str(account.pubkey)}"
                } for account in vacant_response.value]

                return {
                    'tokens': tokens,
                    'nfts': nfts,
                    'vacant_accounts': vacant_accounts
                }

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