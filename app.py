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
    """Fetch comprehensive token metadata from multiple sources"""
    try:
        # First check if this is an NFT by looking at the token account details
        account_info = await make_rpc_call(
            "getAccountInfo",
            [mint_address, {"encoding": "jsonParsed"}]
        )

        if "result" in account_info and account_info["result"]["value"]:
            token_data = account_info["result"]["value"]["data"]["parsed"]["info"]
            decimals = token_data.get("decimals", 9)

            # If decimals is 0, this might be an NFT, try to get NFT metadata
            if decimals == 0:
                nft_metadata = await make_rpc_call(
                    "getMetadata",
                    [mint_address]
                )

                if "result" in nft_metadata and nft_metadata["result"]:
                    metadata = nft_metadata["result"]
                    try:
                        name = metadata.get('name', f'NFT {mint_address[:4]}...{mint_address[-4:]}')
                        image_url = metadata.get('image', '')

                        # If the image URL is an IPFS URL, convert it to HTTP
                        if image_url.startswith('ipfs://'):
                            image_url = f'https://ipfs.io/ipfs/{image_url[7:]}'

                        return {
                            'symbol': metadata.get('symbol', 'Unknown'),
                            'name': name,
                            'image': image_url,
                            'decimals': 0,
                            'is_nft': True,
                            'mint': mint_address,
                            'collection': metadata.get('collection', {}).get('name', 'Unknown'),
                            'attributes': metadata.get('attributes', []),
                            'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                        }
                    except Exception as e:
                        logger.error(f"Error processing NFT metadata: {str(e)}")
                        return None

        # If not an NFT or NFT metadata fetch failed, try DEXScreener for token data
        dexscreener_url = f"https://api.dexscreener.com/latest/dex/tokens/{mint_address}"
        async with httpx.AsyncClient() as client:
            response = await client.get(dexscreener_url, timeout=10.0)

            if response.status_code == 200:
                dex_data = response.json()
                if dex_data.get('pairs') and len(dex_data['pairs']) > 0:
                    pair = dex_data['pairs'][0]
                    base_token = pair.get('baseToken', {})
                    logger.info(f"Successfully fetched token data from DEXScreener for {mint_address}")

                    # Get additional metadata from the RPC
                    account_info = await make_rpc_call(
                        "getAccountInfo",
                        [
                            mint_address,
                            {"encoding": "jsonParsed"}
                        ]
                    )

                    supply = "Unknown"
                    decimals = 9
                    if "result" in account_info and account_info["result"]["value"]:
                        token_data = account_info["result"]["value"]["data"]["parsed"]["info"]
                        supply = token_data.get("supply", "Unknown")
                        decimals = token_data.get("decimals", 9)

                    return {
                        'symbol': base_token.get('symbol', 'Unknown'),
                        'name': base_token.get('name', f'Token {mint_address[:4]}...{mint_address[-4:]}'),
                        'icon': base_token.get('logoURL', ''),
                        'decimals': decimals,
                        'supply': supply,
                        'price_usd': pair.get('priceUsd', 'Unknown'),
                        'volume_24h': pair.get('volume24h', 'Unknown'),
                        'liquidity_usd': pair.get('liquidity', {}).get('usd', 'Unknown'),
                        'verified': base_token.get('verified', False),
                        'mint': mint_address,
                        'is_token': True,
                        'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                    }

        # Fallback metadata with default icon
        logger.info(f"Using fallback metadata for {mint_address}")
        return {
            'symbol': 'Unknown',
            'name': f'Token {mint_address[:4]}...{mint_address[-4:]}',
            'icon': '/static/default-token-icon.svg',
            'decimals': 9,
            'mint': mint_address,
            'is_token': True,
            'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
        }

    except Exception as e:
        logger.error(f"Error fetching token metadata: {str(e)}")
        logger.exception("Full stack trace")
        return None


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

                    # Only process accounts with non-zero balance
                    if amount > 0:
                        # Check if it's likely an NFT (decimals = 0 and amount = 1)
                        metadata_tasks.append((mint, amount, decimals, get_token_metadata(mint)))

                except Exception as e:
                    logger.error(f"Error processing token account: {str(e)}")
                    continue

        # Process metadata for tokens and NFTs
        if metadata_tasks:
            logger.info(f"Fetching metadata for {len(metadata_tasks)} assets")
            metadata_results = await asyncio.gather(*(task[3] for task in metadata_tasks), return_exceptions=True)

            for i, result in enumerate(metadata_results):
                if isinstance(result, Exception):
                    logger.error(f"Error fetching metadata: {str(result)}")
                    continue

                if result is None:
                    continue

                try:
                    mint, amount, decimals = metadata_tasks[i][:3]

                    # Ensure NFT classification is correct (decimals = 0 and amount = 1)
                    if decimals == 0 and amount == 1 and result.get('is_nft'):
                        nfts.append(result)
                    elif result.get('is_token'):
                        result['amount'] = float(amount) / (10 ** decimals)
                        tokens.append(result)
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