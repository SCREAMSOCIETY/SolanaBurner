import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createBurnInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import axios from 'axios';

interface TokenData {
  mint: string;
  balance: number;
  decimals: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  account?: string;
  selected?: boolean;
}

const TokensTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [solscanApiKey, setSolscanApiKey] = useState<string>('');

  useEffect(() => {
    // Fetch the Solscan API key from our backend
    const fetchApiKey = async () => {
      try {
        const response = await axios.get('/api/config');
        setSolscanApiKey(response.data.solscanApiKey);
        console.log('Successfully fetched API key:', response.data.solscanApiKey ? 'Present' : 'Missing');
      } catch (err) {
        console.error('Error fetching API key:', err);
        setError('Failed to fetch API configuration');
      }
    };
    fetchApiKey();
  }, []);

  useEffect(() => {
    const fetchTokens = async () => {
      if (!publicKey || !solscanApiKey) {
        console.log('Missing required keys:', { 
          hasPublicKey: !!publicKey, 
          hasSolscanKey: !!solscanApiKey 
        });
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch token accounts using Solana RPC
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );

        console.log('Found token accounts:', tokenAccounts.value.length);

        // Transform the data
        const tokenData: TokenData[] = [];
        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed.info;
          if (Number(parsedInfo.tokenAmount.amount) > 0) {
            tokenData.push({
              mint: parsedInfo.mint,
              balance: Number(parsedInfo.tokenAmount.amount),
              decimals: parsedInfo.tokenAmount.decimals,
              account: account.pubkey.toBase58()
            });
          }
        }

        console.log('Filtered token data:', tokenData.length);

        // Set tokens immediately to show basic data
        setTokens(tokenData);

        // Helper function for rate-limited API calls
        const fetchWithRetry = async (mint: string, retryCount = 0): Promise<any> => {
          try {
            await new Promise(resolve => setTimeout(resolve, retryCount * 1000));

            console.log(`Fetching metadata for token ${mint} (attempt ${retryCount + 1})`);
            const response = await axios.get(
              `https://api.solscan.io/v2/token/meta?token=${mint}`,
              {
                headers: {
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${solscanApiKey}`
                },
                timeout: 10000
              }
            );

            if (!response.data?.success) {
              throw new Error('Invalid response format');
            }

            return response.data;
          } catch (error: any) {
            console.error(
              `Error fetching metadata for token ${mint}:`,
              error.response?.data || error.message
            );

            // Handle rate limiting
            if (error.response?.status === 429 && retryCount < 3) {
              console.warn(`Rate limit hit for ${mint}, retrying in ${(retryCount + 1) * 1000}ms`);
              return fetchWithRetry(mint, retryCount + 1);
            }

            throw error;
          }
        };

        // Fetch token metadata in batches to avoid rate limiting
        const batchSize = 3;
        const enrichedTokens = [];

        for (let i = 0; i < tokenData.length; i += batchSize) {
          const batch = tokenData.slice(i, i + batchSize);

          try {
            const batchResults = await Promise.all(
              batch.map(async (token) => {
                try {
                  const solscanData = await fetchWithRetry(token.mint);
                  const metadata = solscanData.data;

                  return {
                    ...token,
                    symbol: metadata.symbol || 'Unknown',
                    name: metadata.name || 'Unknown Token',
                    logoURI: metadata.icon || '/default-token-icon.svg'
                  };
                } catch (error) {
                  console.warn(`Failed to fetch metadata for token ${token.mint}, using fallback data`);
                  return {
                    ...token,
                    symbol: 'Unknown',
                    name: 'Unknown Token',
                    logoURI: '/default-token-icon.svg'
                  };
                }
              })
            );

            enrichedTokens.push(...batchResults);
            setTokens([...enrichedTokens]); // Update UI with each batch

            // Add delay between batches to prevent rate limiting
            if (i + batchSize < tokenData.length) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.error(`Error processing batch starting at index ${i}:`, error);
          }
        }

        console.log('Token enrichment completed:', enrichedTokens.length);
        setTokens(enrichedTokens);
      } catch (err: any) {
        console.error('Error fetching tokens:', err);
        setError('Failed to fetch tokens. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (publicKey) {
      fetchTokens();
    } else {
      setTokens([]);
      setLoading(false);
      setError(null);
    }
  }, [publicKey, connection, solscanApiKey]);

  const handleBurnToken = async (token: TokenData) => {
    if (!publicKey || !token.account) return;

    try {
      setBurning(true);
      const transaction = new Transaction();

      const burnInstruction = createBurnInstruction(
        new PublicKey(token.account),
        new PublicKey(token.mint),
        publicKey,
        token.balance
      );

      transaction.add(burnInstruction);

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      // Remove the burned token from the list
      setTokens(tokens.filter(t => t.mint !== token.mint));
    } catch (err) {
      console.error('Error burning token:', err);
      setError('Failed to burn token. Please try again.');
    } finally {
      setBurning(false);
    }
  };

  const handleBulkBurn = async () => {
    if (!publicKey || selectedTokens.size === 0) return;

    try {
      setBurning(true);
      const transaction = new Transaction();

      // Add burn instructions for all selected tokens
      for (const token of tokens) {
        if (selectedTokens.has(token.mint) && token.account) {
          const burnInstruction = createBurnInstruction(
            new PublicKey(token.account),
            new PublicKey(token.mint),
            publicKey,
            token.balance
          );
          transaction.add(burnInstruction);
        }
      }

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      // Remove all burned tokens from the list
      setTokens(tokens.filter(token => !selectedTokens.has(token.mint)));
      setSelectedTokens(new Set());
    } catch (err) {
      console.error('Error burning tokens:', err);
      setError('Failed to burn tokens. Please try again.');
    } finally {
      setBurning(false);
    }
  };

  const toggleTokenSelection = (mint: string) => {
    const newSelected = new Set(selectedTokens);
    if (newSelected.has(mint)) {
      newSelected.delete(mint);
    } else {
      newSelected.add(mint);
    }
    setSelectedTokens(newSelected);
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
      {selectedTokens.size > 0 && (
        <div className="bulk-actions">
          <button 
            className="burn-button bulk-burn"
            onClick={handleBulkBurn}
            disabled={burning}
          >
            {burning ? 'Burning...' : `Burn Selected (${selectedTokens.size})`}
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
                  checked={selectedTokens.has(token.mint)}
                  onChange={() => toggleTokenSelection(token.mint)}
                  className="token-select"
                />
                <div className="token-icon-wrapper">
                  <img 
                    src={token.logoURI || '/default-token-icon.svg'} 
                    alt={token.symbol || 'token'} 
                    className="token-icon"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/default-token-icon.svg';
                    }}
                  />
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
                  onClick={() => handleBurnToken(token)}
                  disabled={burning}
                >
                  {burning ? 'Burning...' : 'Burn'}
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
    </div>
  );
};

export default TokensTab;