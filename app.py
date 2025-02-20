import logging
from flask import Flask, render_template, request, jsonify
import httpx
import asyncio
import base64
from dotenv import load_dotenv
import socket
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
RPC_ENDPOINT = os.getenv('QUICKNODE_RPC_URL')


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
    """Fetch token metadata from DEXScreener and Jupiter API"""
    try:
        # Try DEXScreener first for the token image
        dexscreener_url = f"https://api.dexscreener.com/latest/dex/tokens/{mint_address}"
        async with httpx.AsyncClient() as client:
            response = await client.get(dexscreener_url, timeout=10.0)

            if response.status_code == 200:
                dex_data = response.json()
                if dex_data.get('pairs') and len(dex_data['pairs']) > 0:
                    pair = dex_data['pairs'][0]
                    base_token = pair.get('baseToken', {})
                    logger.info(f"Successfully fetched token data from DEXScreener for {mint_address}")

                    return {
                        'symbol': base_token.get('symbol', 'Unknown'),
                        'name': base_token.get('name', f'Token {mint_address[:4]}...{mint_address[-4:]}'),
                        'icon': base_token.get('logoURL', ''),
                        'decimals': 9,  # Default for most Solana tokens
                        'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                    }

        # Fallback to Jupiter if DEXScreener doesn't have the token
        jupiter_url = "https://token.jup.ag/all"
        async with httpx.AsyncClient() as client:
            response = await client.get(jupiter_url, timeout=10.0)

            if response.status_code == 200:
                tokens = response.json()
                token_info = next((token for token in tokens if token.get('address') == mint_address), None)

                if token_info:
                    logger.info(f"Successfully fetched token metadata from Jupiter for {mint_address}")
                    return {
                        'symbol': token_info.get('symbol', 'Unknown'),
                        'name': token_info.get('name', f'Token {mint_address[:4]}...{mint_address[-4:]}'),
                        'icon': token_info.get('logoURI', ''),
                        'decimals': token_info.get('decimals', 9),
                        'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                    }

    except Exception as e:
        logger.error(f"Error fetching token metadata: {str(e)}")
        logger.exception("Full stack trace")

    # Fallback metadata with default icon
    logger.info(f"Using fallback metadata for {mint_address}")
    return {
        'symbol': 'Unknown',
        'name': f'Token {mint_address[:4]}...{mint_address[-4:]}',
        'icon': '/static/default-token-icon.svg',
        'decimals': 9,
        'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
    }


async def get_cnft_metadata(address):
    """Fetch cNFT metadata from the chain"""
    try:
        # Get metadata PDA for the cNFT
        metadata_response = await make_rpc_call(
            "getAccountInfo",
            [
                address,
                {"encoding": "base64"}
            ]
        )

        if "result" in metadata_response and metadata_response["result"]["value"]:
            data = base64.b64decode(metadata_response["result"]["value"]["data"][0])

            # Parse metadata (simplified for now)
            try:
                return {
                    'name': f'cNFT {address[:4]}...{address[-4:]}',
                    'description': 'A compressed NFT on Solana',
                    'image': '/static/default-nft-image.svg',  # Default image for now
                    'explorer_url': f"https://explorer.solana.com/address/{address}"
                }
            except Exception as e:
                logger.error(f"Error parsing cNFT metadata: {str(e)}")

    except Exception as e:
        logger.error(f"Error fetching cNFT metadata: {str(e)}")
        logger.exception("Full stack trace")

    return {
        'name': f'cNFT {address[:4]}...{address[-4:]}',
        'description': 'A compressed NFT on Solana',
        'image': '/static/default-nft-image.svg',
        'explorer_url': f"https://explorer.solana.com/address/{address}"
    }


async def fetch_assets(wallet_address):
    """Fetch assets using direct RPC calls"""
    logger.info(f"Fetching assets for wallet: {wallet_address}")

    try:
        # Get token accounts
        token_accounts_response = await make_rpc_call(
            "getTokenAccountsByOwner",
            [
                wallet_address,
                {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
                {"encoding": "jsonParsed"}
            ]
        )

        tokens = []
        nfts = []
        cnfts = []
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
                        # If decimals is 0 and amount is 1, it's definitely an NFT
                        if decimals == 0 and amount == 1:
                            logger.info(f"Found NFT: {mint}")
                            metadata_tasks.append(get_token_metadata(mint))
                            nfts.append({
                                'mint': mint,
                                'type': 'nft',
                                'explorer_url': f"https://explorer.solana.com/address/{mint}"
                            })
                        # Otherwise it's a fungible token
                        else:
                            logger.info(f"Found token: {mint} with amount {amount} and decimals {decimals}")
                            metadata_tasks.append(get_token_metadata(mint))
                            tokens.append({
                                'mint': mint,
                                'raw_amount': amount,
                                'decimals': decimals,
                                'type': 'token',
                                'explorer_url': f"https://explorer.solana.com/address/{mint}"
                            })
                except Exception as e:
                    logger.error(f"Error processing token account: {str(e)}")
                    continue

        # Process metadata for tokens and NFTs
        if metadata_tasks:
            logger.info(f"Fetching metadata for {len(metadata_tasks)} assets")
            metadata_results = await asyncio.gather(*metadata_tasks, return_exceptions=True)

            token_index = 0
            nft_index = 0

            for result in metadata_results:
                if isinstance(result, Exception):
                    logger.error(f"Error fetching metadata: {str(result)}")
                    continue

                try:
                    if token_index < len(tokens):
                        token = tokens[token_index]
                        raw_amount = token.pop('raw_amount', 0)
                        decimals = token.pop('decimals', 9)
                        token.update(result)
                        token['amount'] = float(raw_amount) / (10 ** decimals)
                        token_index += 1
                    elif nft_index < len(nfts):
                        nfts[nft_index].update(result)
                        nft_index += 1
                except Exception as e:
                    logger.error(f"Error processing metadata result: {str(e)}")
                    continue

        # Fetch cNFTs
        try:
            cnft_accounts_response = await make_rpc_call(
                "getProgramAccounts",
                [
                    "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY",  # Bubblegum program
                    {
                        "encoding": "base64",
                        "filters": [
                            {
                                "memcmp": {
                                    "offset": 32,
                                    "bytes": wallet_address
                                }
                            }
                        ]
                    }
                ]
            )

            if "result" in cnft_accounts_response:
                cnft_tasks = []
                for account in cnft_accounts_response["result"]:
                    try:
                        address = account["pubkey"]
                        logger.info(f"Found cNFT: {address}")
                        cnft_tasks.append(get_cnft_metadata(address))
                        cnfts.append({
                            'address': address,
                            'type': 'cnft'
                        })
                    except Exception as e:
                        logger.error(f"Error processing cNFT account: {str(e)}")
                        continue

                if cnft_tasks:
                    logger.info(f"Fetching metadata for {len(cnft_tasks)} cNFTs")
                    cnft_results = await asyncio.gather(*cnft_tasks, return_exceptions=True)
                    for i, result in enumerate(cnft_results):
                        if not isinstance(result, Exception) and i < len(cnfts):
                            cnfts[i].update(result)

        except Exception as e:
            logger.error(f"Error fetching cNFTs: {str(e)}")

        logger.info(f"Found {len(tokens)} tokens, {len(nfts)} NFTs, and {len(cnfts)} cNFTs")
        return {
            'tokens': tokens,
            'nfts': nfts,
            'cnfts': cnfts
        }

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
        assets = asyncio.run(fetch_assets(wallet_address))
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


def get_port():
    """Get an available port for the Flask application"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(('0.0.0.0', 8080))
        sock.close()
        logger.info("Using port 8080")
        return 8080
    except OSError:
        logger.warning("Port 8080 is not available")

    # Try alternative ports
    for port in range(8081, 8090):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(('0.0.0.0', port))
            sock.close()
            logger.info(f"Using port {port}")
            return port
        except OSError:
            continue

    logger.error("No available ports found")
    return None


if __name__ == '__main__':
    port = get_port()
    if port is None:
        logger.error("Could not find an available port. Exiting.")
        exit(1)

    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)