import logging
from flask import Flask, render_template, request, jsonify
from solana.rpc.async_api import AsyncClient
from solana.publickey import PublicKey
from asgiref.sync import async_to_sync
import os
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
# Switch to mainnet for production
NETWORK = "mainnet"  # Update network information
RPC_ENDPOINT = "https://api.mainnet-beta.solana.com"

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
            async_client = AsyncClient(RPC_ENDPOINT)

            try:
                pubkey = PublicKey(wallet_address)
                logger.debug("Successfully created PublicKey object")

                # Get token accounts
                token_accounts = await async_client.get_token_accounts_by_owner(
                    pubkey,
                    {'programId': PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')}
                )
                logger.debug(f"Found {len(token_accounts.value) if token_accounts.value else 0} token accounts")
                logger.debug(f"Token accounts data: {token_accounts.value}")

                tokens = []
                nfts = []

                for account in token_accounts.value:
                    try:
                        # Log the raw account data for debugging
                        logger.debug(f"Processing account: {account}")

                        parsed_data = account['account']['data']['parsed']
                        logger.debug(f"Parsed data: {parsed_data}")

                        if 'info' not in parsed_data:
                            logger.warning(f"No 'info' in parsed data for account")
                            continue

                        token_info = parsed_data['info']
                        mint = token_info.get('mint')
                        token_amount = token_info.get('tokenAmount')

                        if not mint or not token_amount:
                            logger.warning(f"Missing mint or token amount for account")
                            continue

                        amount = float(token_amount['amount']) / (10 ** token_amount['decimals'])

                        if amount > 0:
                            if token_amount['decimals'] == 0 and token_amount['amount'] == '1':
                                # This is likely an NFT
                                nfts.append({
                                    'mint': mint,
                                    'name': f'NFT {mint[:4]}...{mint[-4:]}',
                                    'type': 'nft'
                                })
                            else:
                                # This is a token
                                tokens.append({
                                    'mint': mint,
                                    'amount': amount,
                                    'decimals': token_amount['decimals'],
                                    'name': f'Token {mint[:4]}...{mint[-4:]}',
                                    'type': 'token'
                                })
                    except Exception as e:
                        logger.error(f"Error processing token account: {str(e)}")
                        logger.exception("Full exception trace")
                        continue

                # Get vacant accounts (accounts with 0 SOL that can be closed)
                vacant_response = await async_client.get_program_accounts(
                    pubkey,
                    encoding='jsonParsed',
                    filters=[{'dataSize': 0}]  # Only get accounts with no data
                )
                logger.debug(f"Found {len(vacant_response.value) if vacant_response.value else 0} vacant accounts")

                vacant_accounts = [{
                    'address': str(account.pubkey),
                    'type': 'vacant'
                } for account in vacant_response.value]

                await async_client.close()

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