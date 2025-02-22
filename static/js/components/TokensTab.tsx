import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createBurnInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import axios from 'axios';

// Cache for token metadata
const metadataCache: { [key: string]: any } = {};

// Update the rent exempt constants 
const SPL_TOKEN_MINT_RENT_EXEMPT_LAMPORTS = 1461600; // ~0.00146 SOL
const TOKEN_ACCOUNT_RENT_EXEMPT_LAMPORTS = 2039280;  // ~0.00204 SOL
const METADATA_RENT_EXEMPT_LAMPORTS = 5616000;       // ~0.00562 SOL

interface TokenData {
  mint: string;
  balance: number;
  decimals: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  tokenAccount: string;
  hasMetadata?: boolean;  // Add this field to track if token has metadata
}

interface BurnModalData {
  isOpen: boolean;
  tokens: TokenData[];
  isBulk: boolean;
}

const TokensTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [burningToken, setBurningToken] = useState<string | null>(null);
  const [bulkBurnSelected, setBulkBurnSelected] = useState<Set<string>>(new Set());
  const [burnModal, setBurnModal] = useState<BurnModalData>({
    isOpen: false,
    tokens: [],
    isBulk: false
  });

  const fetchTokenMetadata = async (mint: string) => {
    // Check cache first
    if (metadataCache[mint]) {
      return metadataCache[mint];
    }

    // Helper function to format fallback metadata
    const getFallbackMetadata = () => ({
      symbol: `${mint.slice(0, 4)}...${mint.slice(-4)}`,
      name: `Token ${mint.slice(0, 4)}...${mint.slice(-4)}`,
      logoURI: '/default-token-icon.svg',
      hasMetadata: false
    });

    try {
      // Try Jupiter first
      const jupiterResponse = await axios.get(
        `https://token.jup.ag/token/${mint}`,
        { timeout: 5000 }
      );

      if (jupiterResponse.data?.symbol) {
        const metadata = {
          symbol: jupiterResponse.data.symbol,
          name: jupiterResponse.data.name,
          logoURI: jupiterResponse.data.logoURI,
          hasMetadata: true // Token has metadata if we found it
        };
        metadataCache[mint] = metadata;
        return metadata;
      }
    } catch (error) {
      console.log(`Jupiter API failed for token ${mint}, trying Solana token list...`);
    }

    try {
      // Try Solana token list
      const solanaResponse = await axios.get(
        'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json',
        { timeout: 5000 }
      );

      const token = solanaResponse.data.tokens.find((t: any) => t.address === mint);
      if (token) {
        const metadata = {
          symbol: token.symbol,
          name: token.name,
          logoURI: token.logoURI,
          hasMetadata: true
        };
        metadataCache[mint] = metadata;
        return metadata;
      }
    } catch (error) {
      console.log(`Solana token list failed for token ${mint}, trying Coingecko...`);
    }

    try {
      // Try Coingecko as last resort
      const coingeckoResponse = await axios.get(
        `https://api.coingecko.com/api/v3/coins/solana/contract/${mint}`,
        { timeout: 5000 }
      );

      if (coingeckoResponse.data) {
        const metadata = {
          symbol: coingeckoResponse.data.symbol?.toUpperCase(),
          name: coingeckoResponse.data.name,
          logoURI: coingeckoResponse.data.image?.small,
          hasMetadata: true
        };
        metadataCache[mint] = metadata;
        return metadata;
      }
    } catch (error) {
      console.log(`All metadata sources failed for token ${mint}`);
    }

    // If all sources fail, return fallback metadata
    const fallback = getFallbackMetadata();
    metadataCache[mint] = fallback;
    return fallback;
  };

  const fetchTokens = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      setError(null);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const tokenData = tokenAccounts.value.map((account) => {
        const parsedInfo = account.account.data.parsed.info;
        return {
          mint: parsedInfo.mint,
          balance: Number(parsedInfo.tokenAmount.amount),
          decimals: parsedInfo.tokenAmount.decimals,
          tokenAccount: account.pubkey.toString(),
        };
      });

      const nonZeroTokens = tokenData.filter(token => token.balance > 0);

      // Fetch metadata for all tokens in parallel with improved error handling
      const enrichedTokens = await Promise.all(
        nonZeroTokens.map(async (token) => {
          const metadata = await fetchTokenMetadata(token.mint);
          return {
            ...token,
            ...metadata
          };
        })
      );

      setTokens(enrichedTokens);
    } catch (err) {
      console.error('Error fetching tokens:', err);
      setError('Failed to fetch tokens. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (publicKey) {
      fetchTokens();
    } else {
      setTokens([]);
      setLoading(false);
      setError(null);
    }
  }, [publicKey, connection]);

  const burnToken = async (tokenMint: string, amount: number) => {
    if (!publicKey || !signTransaction) return;

    try {
      setBurningToken(tokenMint);
      const token = tokens.find(t => t.mint === tokenMint);
      if (!token) throw new Error("Token not found");

      const associatedTokenAddress = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        publicKey
      );

      const burnInstruction = createBurnInstruction(
        associatedTokenAddress,
        new PublicKey(tokenMint),
        publicKey,
        amount * Math.pow(10, token.decimals)
      );

      const transaction = new Transaction().add(burnInstruction);
      transaction.feePayer = publicKey;
      transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature);

      await fetchTokens();
      setBurnModal({ isOpen: false, tokens: [], isBulk: false });
    } catch (err) {
      console.error('Error burning token:', err);
      setError('Failed to burn token. Please try again.');
    } finally {
      setBurningToken(null);
    }
  };

  const handleBurnClick = (token: TokenData) => {
    setBurnModal({
      isOpen: true,
      tokens: [token],
      isBulk: false
    });
  };

  const handleBulkBurnClick = () => {
    const selectedTokens = tokens.filter(token => bulkBurnSelected.has(token.mint));
    setBurnModal({
      isOpen: true,
      tokens: selectedTokens,
      isBulk: true
    });
  };

  const burnSelectedTokens = async () => {
    const selectedTokens = Array.from(bulkBurnSelected);
    for (const tokenMint of selectedTokens) {
      const token = tokens.find(t => t.mint === tokenMint);
      if (token) {
        await burnToken(tokenMint, token.balance);
      }
    }
    setBulkBurnSelected(new Set());
  };

  // Enhanced rent return calculation with detailed breakdown
  const calculateRentReturn = (selectedTokens: TokenData[]): string => {
    const totalLamports = selectedTokens.reduce((acc, token) => {
      let rentAmount = TOKEN_ACCOUNT_RENT_EXEMPT_LAMPORTS; // Base token account rent

      if (token.hasMetadata) {
        rentAmount += METADATA_RENT_EXEMPT_LAMPORTS; // Add metadata rent if present
      }

      return acc + rentAmount;
    }, 0);

    return (totalLamports / LAMPORTS_PER_SOL).toFixed(8);
  };

  // Update the renderRentReturnInfo function to be more prominent and detailed
  const renderRentReturnInfo = () => {
    if (bulkBurnSelected.size === 0) return null;

    const selectedTokens = tokens.filter(token => bulkBurnSelected.has(token.mint));
    const rentReturn = calculateRentReturn(selectedTokens);

    // Calculate breakdown
    const tokensWithMetadata = selectedTokens.filter(t => t.hasMetadata).length;
    const tokensWithoutMetadata = selectedTokens.length - tokensWithMetadata;

    const baseRentTotal = (TOKEN_ACCOUNT_RENT_EXEMPT_LAMPORTS * selectedTokens.length / LAMPORTS_PER_SOL).toFixed(8);
    const metadataRentTotal = (METADATA_RENT_EXEMPT_LAMPORTS * tokensWithMetadata / LAMPORTS_PER_SOL).toFixed(8);

    return (
      <div className="rent-return-display">
        <h3>Estimated Rent Return</h3>
        <div className="rent-amount">{rentReturn} SOL</div>
        <div className="rent-breakdown">
          <h4>Breakdown:</h4>
          <ul>
            <li>
              Base Rent ({tokensWithoutMetadata + tokensWithMetadata} tokens):
              <span className="amount">{baseRentTotal} SOL</span>
              <small>({(TOKEN_ACCOUNT_RENT_EXEMPT_LAMPORTS / LAMPORTS_PER_SOL).toFixed(8)} SOL per token)</small>
            </li>
            {tokensWithMetadata > 0 && (
              <li>
                Metadata Rent ({tokensWithMetadata} tokens):
                <span className="amount">{metadataRentTotal} SOL</span>
                <small>({(METADATA_RENT_EXEMPT_LAMPORTS / LAMPORTS_PER_SOL).toFixed(8)} SOL per token with metadata)</small>
              </li>
            )}
          </ul>
        </div>
        <p className="rent-explanation">
          * Rent return varies based on token type. Tokens with metadata return more SOL when burned.
        </p>
      </div>
    );
  };

  if (!publicKey) {
    return (
      <div className="container">
        <h2>Tokens</h2>
        <p className="connect-message">Connect your wallet to view tokens</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>Tokens</h2>
      {bulkBurnSelected.size > 0 && (
        <div className="bulk-burn-controls">
          <div className="rent-counter-container">
            {renderRentReturnInfo()}
          </div>
          <button 
            className="burn-button"
            onClick={handleBulkBurnClick}
          >
            Burn {bulkBurnSelected.size} Selected Tokens
          </button>
          <button 
            className="cancel-button"
            onClick={() => setBulkBurnSelected(new Set())}
          >
            Cancel
          </button>
        </div>
      )}
      {loading && tokens.length === 0 ? (
        <div className="loading-message">Loading tokens...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : tokens.length === 0 ? (
        <div className="no-assets">
          <p>No tokens found in your wallet</p>
          <p className="no-assets-subtitle">Your connected wallet doesn't have any SPL tokens yet</p>
        </div>
      ) : (
        <div className="assets-grid">
          {tokens.map((token) => (
            <div key={token.mint} className="asset-card token-card">
              <div className="token-header">
                <input 
                  type="checkbox"
                  checked={bulkBurnSelected.has(token.mint)}
                  onChange={(e) => {
                    const newSelected = new Set(bulkBurnSelected);
                    if (e.target.checked) {
                      newSelected.add(token.mint);
                    } else {
                      newSelected.delete(token.mint);
                    }
                    setBulkBurnSelected(newSelected);
                  }}
                  className="token-checkbox"
                />
                <div className="token-icon-wrapper">
                  {token.logoURI ? (
                    <img 
                      src={token.logoURI} 
                      alt={token.symbol || 'token'} 
                      className="token-icon"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/default-token-icon.svg';
                      }}
                    />
                  ) : (
                    <img 
                      src="/default-token-icon.svg" 
                      alt="default token" 
                      className="token-icon"
                    />
                  )}
                </div>
                <div className="token-info">
                  <h4 className="token-name">{token.name || 'Unknown Token'}</h4>
                  <span className="token-symbol">{token.symbol || 'Unknown'}</span>
                </div>
              </div>
              <div className="token-details">
                <div className="token-balance">
                  <span className="balance-label">Balance:</span>
                  <span className="balance-amount">
                    {(token.balance / Math.pow(10, token.decimals)).toLocaleString()} {token.symbol}
                  </span>
                </div>
              </div>
              <div className="token-actions">
                <button 
                  className="burn-button"
                  onClick={() => handleBurnClick(token)}
                  disabled={burningToken === token.mint}
                >
                  {burningToken === token.mint ? 'Burning...' : 'Burn Token'}
                </button>
              </div>
              <div className="links-container">
                <a 
                  href={`https://solscan.io/token/${token.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="solscan-link"
                >
                  View on Solscan
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {burnModal.isOpen && (
        <div className="modal-overlay">
          <div className="confirmation-dialog">
            <div className="modal-header">
              <h3>{burnModal.isBulk ? 'Confirm Bulk Burn' : 'Confirm Burn'}</h3>
              <button 
                className="close-button"
                onClick={() => setBurnModal({ isOpen: false, tokens: [], isBulk: false })}
                disabled={!!burningToken}
              >
                ×
              </button>
            </div>

            {burnModal.isBulk ? (
              <>
                <p className="burn-warning">You are about to burn {burnModal.tokens.length} tokens:</p>
                <div className="tokens-list">
                  {burnModal.tokens.map(token => (
                    <div key={token.mint} className="confirmation-token">
                      <div className="token-info">
                        <span className="token-name">{token.name || 'Unknown Token'}</span>
                        <span className="token-symbol">({token.symbol})</span>
                      </div>
                      <span className="amount">
                        {(token.balance / Math.pow(10, token.decimals)).toLocaleString()} {token.symbol}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rent-return-info">
                  <p>Estimated rent return:</p>
                  <span className="rent-amount">{calculateRentReturn(burnModal.tokens)} SOL</span>
                  <p className="rent-detail">Varies based on token type and metadata</p>
                </div>
              </>
            ) : (
              <>
                <p className="burn-warning">You are about to burn:</p>
                <div className="burn-details">
                  <div className="token-info">
                    <span className="token-name">{burnModal.tokens[0]?.name || 'Unknown Token'}</span>
                    <span className="token-symbol">({burnModal.tokens[0]?.symbol})</span>
                  </div>
                  <div className="amount">
                    {(burnModal.tokens[0]?.balance / Math.pow(10, burnModal.tokens[0]?.decimals)).toLocaleString()} {burnModal.tokens[0]?.symbol}
                  </div>
                </div>
                <div className="rent-return-info">
                  <p>Estimated rent return:</p>
                  <span className="rent-amount">{calculateRentReturn([burnModal.tokens[0]])} SOL</span>
                  <p className="rent-detail">Varies based on token type and metadata</p>
                </div>
                <p className="burn-notice">This action cannot be undone.</p>
              </>
            )}

            <div className="confirmation-buttons">
              <button 
                className={`confirm-burn ${burningToken ? 'processing' : ''}`}
                onClick={() => burnModal.isBulk 
                  ? burnSelectedTokens() 
                  : burnToken(burnModal.tokens[0].mint, burnModal.tokens[0].balance)
                }
                disabled={!!burningToken}
              >
                {burningToken ? 'Processing...' : 'Confirm Burn'}
              </button>
              <button 
                className="cancel-burn"
                onClick={() => setBurnModal({ isOpen: false, tokens: [], isBulk: false })}
                disabled={!!burningToken}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokensTab;