import logging
from flask import Flask, render_template, request, jsonify
import httpx
import asyncio
import base64
from dotenv import load_dotenv
import socket
import os
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
RPC_ENDPOINT = os.getenv('QUICKNODE_RPC_URL')

# Cache for token list data
token_list_cache = {}

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

async def fetch_token_list():
    """Fetch and cache the official Solana token list"""
    if not token_list_cache.get('tokens'):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get('https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json')
                if response.status_code == 200:
                    data = response.json()
                    # Index tokens by mint address for faster lookup
                    token_list_cache['tokens'] = {
                        token['address']: token for token in data['tokens']
                    }
                    logger.info(f"Cached {len(token_list_cache['tokens'])} tokens from token list")
        except Exception as e:
            logger.error(f"Error fetching token list: {str(e)}")
            token_list_cache['tokens'] = {}

async def get_jupiter_token_metadata(mint_address):
    """Fetch enhanced token metadata from Jupiter API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f'https://price.jup.ag/v4/price?ids={mint_address}')
            if response.status_code == 200:
                price_data = response.json()

                # Get token metadata
                token_response = await client.get('https://token.jup.ag/all')
                if token_response.status_code == 200:
                    tokens = token_response.json()
                    for token in tokens:
                        if token.get('address') == mint_address:
                            price_info = price_data.get('data', {}).get(mint_address, {})
                            return {
                                'symbol': token.get('symbol'),
                                'name': token.get('name'),
                                'icon': token.get('logoURI'),
                                'decimals': token.get('decimals'),
                                'verified': True,
                            }
    except Exception as e:
        logger.error(f"Error fetching Jupiter metadata: {str(e)}")
    return None

async def get_magiceden_metadata(mint_address):
    """Fetch NFT metadata from Magic Eden API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f'https://api-mainnet.magiceden.dev/v2/tokens/{mint_address}')
            if response.status_code == 200:
                data = response.json()
                return {
                    'name': data.get('name'),
                    'image': data.get('image'),
                    'collection': data.get('collection'),
                    'attributes': data.get('attributes', []),
                    'verified': True
                }
    except Exception as e:
        logger.error(f"Error fetching Magic Eden metadata: {str(e)}")
    return None

async def get_token_metadata(mint_address):
    """Fetch token metadata focusing on name and image"""
    try:
        # Get basic token info
        account_info = await make_rpc_call(
            "getAccountInfo",
            [mint_address, {"encoding": "jsonParsed"}]
        )

        if "result" in account_info and account_info["result"]["value"]:
            token_data = account_info["result"]["value"]["data"]["parsed"]["info"]
            decimals = token_data.get("decimals", 0)
            supply = token_data.get("supply", "0")

            # If supply is 1 and decimals is 0, it's likely an NFT
            if decimals == 0 and str(supply) == "1":
                # Try Magic Eden first for NFT metadata
                me_metadata = await get_magiceden_metadata(mint_address)
                if me_metadata:
                    logger.info(f"Found Magic Eden metadata for NFT: {mint_address}")
                    return {
                        'name': me_metadata.get('name', f'NFT {mint_address[:4]}...{mint_address[-4:]}'),
                        'image': me_metadata.get('image'),
                        'collection': me_metadata.get('collection'),
                        'decimals': 0,
                        'is_nft': True,
                        'mint': mint_address,
                        'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                    }

                # Fallback to metaplex metadata
                metadata_response = await make_rpc_call(
                    "getProgramAccounts",
                    [
                        "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
                        {
                            "encoding": "base64",
                            "filters": [
                                {
                                    "memcmp": {
                                        "offset": 33,
                                        "bytes": mint_address
                                    }
                                }
                            ]
                        }
                    ]
                )

                if "result" in metadata_response and metadata_response["result"]:
                    metadata = metadata_response["result"][0]
                    try:
                        metadata_decoded = base64.b64decode(metadata["account"]["data"][0])
                        metadata_json = json.loads(metadata_decoded)

                        image_url = metadata_json.get('uri', '')
                        if image_url.startswith('ipfs://'):
                            image_url = f'https://ipfs.io/ipfs/{image_url[7:]}'

                        return {
                            'name': metadata_json.get('name', f'NFT {mint_address[:4]}...{mint_address[-4:]}'),
                            'image': image_url,
                            'collection': metadata_json.get('collection', {}).get('name', 'Unknown'),
                            'decimals': 0,
                            'is_nft': True,
                            'mint': mint_address,
                            'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                        }
                    except Exception as e:
                        logger.error(f"Error processing NFT metadata: {str(e)}")

            # For regular tokens
            # Try Jupiter first for reliable token info
            jupiter_metadata = await get_jupiter_token_metadata(mint_address)
            if jupiter_metadata:
                return {
                    'name': jupiter_metadata.get('name', f'Token {mint_address[:4]}...{mint_address[-4:]}'),
                    'symbol': jupiter_metadata.get('symbol', 'Unknown'),
                    'icon': jupiter_metadata.get('icon'),
                    'decimals': jupiter_metadata.get('decimals', decimals),
                    'supply': supply,
                    'mint': mint_address,
                    'is_token': True,
                    'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                }

            # Check token list cache
            await fetch_token_list()
            if mint_address in token_list_cache['tokens']:
                token_info = token_list_cache['tokens'][mint_address]
                return {
                    'name': token_info.get('name', f'Token {mint_address[:4]}...{mint_address[-4:]}'),
                    'symbol': token_info.get('symbol', 'Unknown'),
                    'icon': token_info.get('logoURI'),
                    'decimals': token_info.get('decimals', decimals),
                    'supply': supply,
                    'mint': mint_address,
                    'is_token': True,
                    'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
                }

            # Fallback with default icon
            return {
                'name': f'Token {mint_address[:4]}...{mint_address[-4:]}',
                'symbol': 'Unknown',
                'icon': '/static/default-token-icon.svg',
                'decimals': decimals,
                'supply': supply,
                'mint': mint_address,
                'is_token': True,
                'explorer_url': f"https://explorer.solana.com/address/{mint_address}"
            }

    except Exception as e:
        logger.error(f"Error fetching token metadata: {str(e)}")
        return None

async def is_nft(mint_address):
    """Check if a token is an NFT by looking for Metaplex metadata"""
    try:
        metadata_response = await make_rpc_call(
            "getAccountInfo",
            [
                f"metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",  # Metaplex metadata program
                {"encoding": "base64"}
            ]
        )
        return "result" in metadata_response and metadata_response["result"] is not None
    except Exception as e:
        logger.error(f"Error checking NFT status: {str(e)}")
        return False


async def get_cnft_metadata(address):
    """Fetch cNFT metadata from the chain"""
    try:
        logger.info(f"Fetching cNFT metadata for address: {address}")
        # Get metadata PDA for the cNFT
        metadata_response = await make_rpc_call(
            "getProgramAccounts",
            [
                "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY",  # Bubblegum program
                {
                    "encoding": "base64",
                    "filters": [
                        {
                            "memcmp": {
                                "offset": 8,  # Skip discriminator
                                "bytes": address
                            }
                        }
                    ]
                }
            ]
        )

        if "result" in metadata_response and metadata_response["result"]:
            logger.info(f"Found metadata for cNFT: {address}")
            data = base64.b64decode(metadata_response["result"][0]["account"]["data"][0])

            # Parse metadata
            try:
                # Extract URI from data, skipping version and other fields
                metadata_uri = data[8:].decode('utf-8').strip('\x00')
                logger.info(f"Metadata URI for cNFT {address}: {metadata_uri}")

                # Handle IPFS URLs
                if metadata_uri.startswith('ipfs://'):
                    metadata_uri = f'https://ipfs.io/ipfs/{metadata_uri[7:]}'

                async with httpx.AsyncClient() as client:
                    metadata_resp = await client.get(metadata_uri, timeout=10.0)
                    if metadata_resp.status_code == 200:
                        metadata = metadata_resp.json()

                        # Handle IPFS image URLs
                        image_url = metadata.get('image', '')
                        if image_url.startswith('ipfs://'):
                            image_url = f'https://ipfs.io/ipfs/{image_url[7:]}'

                        return {
                            'name': metadata.get('name', f'cNFT {address[:4]}...{address[-4:]}'),
                            'description': metadata.get('description', 'A compressed NFT on Solana'),
                            'image': image_url or '/static/default-nft-image.svg',
                            'collection': metadata.get('collection', {}).get('name', ''),
                            'mint': address,
                            'explorer_url': f"https://solscan.io/token/{address}"
                        }
            except Exception as e:
                logger.error(f"Error parsing cNFT metadata for {address}: {str(e)}")
                logger.exception("Full stack trace")

    except Exception as e:
        logger.error(f"Error fetching cNFT metadata for {address}: {str(e)}")
        logger.exception("Full stack trace")

    # Return default metadata if all else fails
    return {
        'name': f'cNFT {address[:4]}...{address[-4:]}',
        'description': 'A compressed NFT on Solana',
        'image': '/static/default-nft-image.svg',
        'mint': address,
        'explorer_url': f"https://solscan.io/token/{address}"
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
                        # First check if this is an NFT by looking for Metaplex metadata
                        is_nft_token = await is_nft(mint)

                        # If it has Metaplex metadata and meets NFT criteria (decimals=0, amount=1)
                        if is_nft_token and decimals == 0 and amount == 1:
                            logger.info(f"Found NFT: {mint}")
                            nft_metadata = await get_token_metadata(mint)
                            if nft_metadata:
                                nfts.append(nft_metadata)
                        else:
                            # This is a regular token
                            logger.info(f"Found token: {mint}")
                            token_metadata = await get_token_metadata(mint)
                            if token_metadata:
                                token_metadata['amount'] = float(amount) / (10 ** decimals)
                                tokens.append(token_metadata)

                except Exception as e:
                    logger.error(f"Error processing token account: {str(e)}")
                    continue

        # Try to get cNFTs
        try:
            logger.info("Fetching cNFTs...")
            cnft_accounts_response = await make_rpc_call(
                "getProgramAccounts",
                [
                    "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY",  # Bubblegum program
                    {
                        "encoding": "base64",
                        "filters": [
                            {
                                "memcmp": {
                                    "offset": 8,  # Skip discriminator
                                    "bytes": wallet_address
                                }
                            }
                        ]
                    }
                ]
            )

            if "result" in cnft_accounts_response and cnft_accounts_response["result"]:
                logger.info(f"Found {len(cnft_accounts_response['result'])} cNFTs")
                for account in cnft_accounts_response["result"]:
                    try:
                        address = account["pubkey"]
                        logger.info(f"Processing cNFT: {address}")
                        cnft_metadata = await get_cnft_metadata(address)
                        if cnft_metadata:
                            cnfts.append(cnft_metadata)
                    except Exception as e:
                        logger.error(f"Error processing cNFT account: {str(e)}")
                        continue

        except Exception as e:
            logger.error(f"Error fetching cNFTs: {str(e)}")
            logger.exception("Full stack trace")

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