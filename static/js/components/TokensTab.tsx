import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createBurnInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import axios from 'axios';

// Define the window interface with our BurnAnimations object
declare global {
  interface Window {
    BurnAnimations?: {
      createConfetti: () => void;
      toggleDarkMode: () => void;
      applyBurnAnimation: (element: HTMLElement) => void;
      showAchievement: (title: string, description: string) => void;
      updateProgress: (currentVal: number, maxVal: number, level: number) => void;
      checkAchievements: (type: string, value: number) => void;
      initUIEnhancements: () => void;
    };
  }
}

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
  console.log('[TokensTab] Initializing TokensTab component');

  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [solscanApiKey, setSolscanApiKey] = useState<string>('');

  useEffect(() => {
    console.log('[TokensTab] Fetching API key');
    const fetchApiKey = async () => {
      try {
        const response = await axios.get('/api/config');
        setSolscanApiKey(response.data.solscanApiKey);
        console.log('[TokensTab] API key status:', response.data.solscanApiKey ? 'Present' : 'Missing');
      } catch (err) {
        console.error('[TokensTab] Error fetching API key:', err);
        setError('Failed to fetch API configuration');
      }
    };
    fetchApiKey();
  }, []);

  useEffect(() => {
    console.log('[TokensTab] Token fetch effect triggered', {
      hasPublicKey: !!publicKey,
      hasSolscanKey: !!solscanApiKey
    });

    const fetchTokens = async () => {
      if (!publicKey || !solscanApiKey) {
        console.log('[TokensTab] Missing required keys:', {
          hasPublicKey: !!publicKey,
          hasSolscanKey: !!solscanApiKey
        });
        return;
      }

      try {
        console.log('[TokensTab] Starting token fetch');
        setLoading(true);
        setError(null);

        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );

        console.log('[TokensTab] Found token accounts:', tokenAccounts.value.length);

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

        console.log('[TokensTab] Filtered token data:', tokenData.length);
        setTokens(tokenData);

        // Helper function for rate-limited API calls
        const fetchWithRetry = async (mint: string, retryCount = 0): Promise<any> => {
          try {
            await new Promise(resolve => setTimeout(resolve, retryCount * 1000));

            console.log(`[TokensTab] Fetching metadata for token ${mint} (attempt ${retryCount + 1})`);
            console.log(`[TokensTab] Using Solscan API key: ${solscanApiKey ? 'Present (length: ' + solscanApiKey.length + ')' : 'Missing'}`);
            
            const url = `https://api.solscan.io/v2/token/meta?token=${mint}`;
            console.log(`[TokensTab] Request URL: ${url}`);
            
            const requestHeaders = {
              'Accept': 'application/json',
              'Authorization': `Bearer ${solscanApiKey}`
            };
            console.log(`[TokensTab] Request headers:`, requestHeaders);
            
            const response = await axios.get(url, {
              headers: requestHeaders,
              timeout: 10000
            });

            console.log(`[TokensTab] Solscan response status:`, response.status);
            console.log(`[TokensTab] Solscan response data:`, response.data);

            if (!response.data?.success) {
              console.error(`[TokensTab] Invalid response format from Solscan:`, response.data);
              throw new Error('Invalid response format');
            }

            return response.data;
          } catch (error: any) {
            console.error(
              `[TokensTab] Error fetching metadata for token ${mint}:`,
              error.response?.status,
              error.response?.statusText
            );
            
            console.error(`[TokensTab] Error details:`, error.response?.data || error.message);

            if (error.response?.status === 429 && retryCount < 3) {
              console.warn(`[TokensTab] Rate limit hit for ${mint}, retrying in ${(retryCount + 1) * 1000}ms`);
              return fetchWithRetry(mint, retryCount + 1);
            }
            
            // If we have an auth error, log it clearly
            if (error.response?.status === 401) {
              console.error(`[TokensTab] Authentication error with Solscan API. Please check your API key.`);
            }

            throw error;
          }
        };

        const batchSize = 3;
        const enrichedTokens = [];

        for (let i = 0; i < tokenData.length; i += batchSize) {
          const batch = tokenData.slice(i, i + batchSize);
          console.log(`[TokensTab] Processing batch ${i / batchSize + 1}`);

          try {
            const batchResults = await Promise.all(
              batch.map(async (token) => {
                try {
                  const solscanData = await fetchWithRetry(token.mint);
                  const metadata = solscanData.data;
                  console.log(`[TokensTab] Successfully enriched token ${token.mint}`);

                  return {
                    ...token,
                    symbol: metadata.symbol || 'Unknown',
                    name: metadata.name || 'Unknown Token',
                    logoURI: metadata.icon || '/default-token-icon.svg'
                  };
                } catch (error) {
                  console.warn(`[TokensTab] Failed to fetch metadata for token ${token.mint}, using fallback data`);
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
            setTokens([...enrichedTokens]);

            if (i + batchSize < tokenData.length) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.error(`[TokensTab] Error processing batch starting at index ${i}:`, error);
          }
        }

        console.log('[TokensTab] Token enrichment completed:', enrichedTokens.length);
        setTokens(enrichedTokens);
      } catch (err: any) {
        console.error('[TokensTab] Error fetching tokens:', err);
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
      
      // Find the token card element for animation
      const tokenElement = document.querySelector(`.token-card[data-mint="${token.mint}"]`) as HTMLElement;
      
      const transaction = new Transaction();

      const burnInstruction = createBurnInstruction(
        new PublicKey(token.account),
        new PublicKey(token.mint),
        publicKey,
        token.balance
      );

      transaction.add(burnInstruction);

      const signature = await sendTransaction(transaction, connection);
      
      // Apply burn animation if element exists
      if (tokenElement && window.BurnAnimations) {
        window.BurnAnimations.applyBurnAnimation(tokenElement);
      }
      
      await connection.confirmTransaction(signature, 'confirmed');

      // Show confetti and trigger achievements if window.BurnAnimations is available
      if (window.BurnAnimations) {
        window.BurnAnimations.createConfetti();
        
        // Track achievement progress
        window.BurnAnimations.checkAchievements('token', 1);
        
        // Also track value burned (approximate in SOL)
        const estimatedValue = (token.balance / Math.pow(10, token.decimals)) * 0.01; // Simplified estimate
        window.BurnAnimations.checkAchievements('value', estimatedValue);
      }

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

      // Get all token elements for animation
      const tokenElements: HTMLElement[] = [];
      const selectedTokenData = tokens.filter(token => selectedTokens.has(token.mint));
      let totalValue = 0;
      
      document.querySelectorAll('.token-card').forEach(element => {
        const mintAttribute = (element as HTMLElement).dataset.mint;
        if (mintAttribute && selectedTokens.has(mintAttribute)) {
          tokenElements.push(element as HTMLElement);
          
          // Calculate estimated value
          const token = tokens.find(t => t.mint === mintAttribute);
          if (token) {
            totalValue += (token.balance / Math.pow(10, token.decimals)) * 0.01; // Simplified estimate
          }
        }
      });

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
      
      // Apply burn animations in sequence
      if (window.BurnAnimations && tokenElements.length > 0) {
        // Animate each token with a slight delay between them
        tokenElements.forEach((element, index) => {
          setTimeout(() => {
            window.BurnAnimations?.applyBurnAnimation(element);
          }, index * 200);
        });
      }
      
      await connection.confirmTransaction(signature, 'confirmed');

      // Show mega confetti for bulk burn!
      if (window.BurnAnimations) {
        // Create double confetti for bulk burn
        window.BurnAnimations.createConfetti();
        setTimeout(() => {
          window.BurnAnimations?.createConfetti();
        }, 300);
        
        // Track achievement progress for all tokens
        window.BurnAnimations.checkAchievements('token', selectedTokenData.length);
        
        // Track value burned
        window.BurnAnimations.checkAchievements('value', totalValue);
        
        // Show special achievement for bulk burning
        if (selectedTokenData.length >= 3) {
          window.BurnAnimations.showAchievement(
            "Mass Burner!", 
            `You've burned ${selectedTokenData.length} tokens at once. Efficient!`
          );
        }
      }

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
            <div key={token.mint} className="asset-card token-card" data-mint={token.mint}>
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