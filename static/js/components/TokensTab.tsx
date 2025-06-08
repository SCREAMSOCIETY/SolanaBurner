import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createBurnInstruction, 
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddress 
} from '@solana/spl-token';
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
  metadataUri?: string;
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
          const amount = Number(parsedInfo.tokenAmount.amount);
          const decimals = parsedInfo.tokenAmount.decimals;
          
          // Filter out NFTs - exclude anything with amount=1 and decimals=0 as these are NFTs
          const isLikelyNFT = amount === 1 && decimals === 0;
          console.log(`[TokensTab] Token ${parsedInfo.mint.slice(0, 8)}: amount=${amount}, decimals=${decimals}, isLikelyNFT=${isLikelyNFT}`);
          
          // Only include tokens that are NOT NFTs (skip amount=1 decimals=0 combinations)
          if (amount > 0 && !isLikelyNFT) {
            tokenData.push({
              mint: parsedInfo.mint,
              balance: amount,
              decimals: decimals,
              account: account.pubkey.toBase58()
            });
          } else if (isLikelyNFT) {
            console.log(`[TokensTab] Skipping NFT: ${parsedInfo.mint.slice(0, 8)}`);
          }
        }

        console.log('[TokensTab] Filtered token data:', tokenData.length);
        console.log('[TokensTab] Found', tokenData.length, 'actual tokens after filtering out NFTs');
        setTokens(tokenData);

        // Helper function for rate-limited API calls
        const fetchWithRetry = async (mint: string, retryCount = 0): Promise<any> => {
          try {
            await new Promise(resolve => setTimeout(resolve, retryCount * 1000));

            console.log(`[TokensTab] Fetching metadata for token ${mint} (attempt ${retryCount + 1})`);
            console.log(`[TokensTab] Using Solscan API key: ${solscanApiKey ? 'Present (length: ' + solscanApiKey.length + ')' : 'Missing'}`);
            
            // Use our proxy endpoint instead of direct Solscan API call to avoid CORS issues
            const url = `/api/token-metadata/${mint}`;
            console.log(`[TokensTab] Using proxy endpoint: ${url}`);
            
            const response = await axios.get(url, {
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
                  const metadataResponse = await fetchWithRetry(token.mint);
                  console.log(`[TokensTab] Metadata response for token ${token.mint}:`, metadataResponse);
                  
                  // The structure now comes directly from our token metadata service
                  const metadata = metadataResponse.data || {};
                  console.log(`[TokensTab] Successfully enriched token ${token.mint} with metadata:`, metadata);

                  return {
                    ...token,
                    symbol: metadata.symbol || token.mint.slice(0, 4),
                    name: metadata.name || `Token ${token.mint.slice(0, 8)}...`,
                    logoURI: metadata.icon || '/default-token-icon.svg',
                    // Ensure we have decimals for display
                    decimals: token.decimals || metadata.decimals || 9,
                    // Store the metadata URI for potential future use
                    metadataUri: metadata.uri || null
                  };
                } catch (error) {
                  console.warn(`[TokensTab] Failed to fetch metadata for token ${token.mint}, using fallback data`);
                  return {
                    ...token,
                    symbol: 'Unknown',
                    name: 'Unknown Token',
                    logoURI: '/default-token-icon.svg',
                    metadataUri: null
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

      // Add compute budget instructions to avoid compute limit issues
      const { ComputeBudgetProgram } = await import('@solana/web3.js');
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 200000 // Sufficient compute units for token operations
        })
      );
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1 // Minimal priority fee
        })
      );

      // Check if token balance is 0 - use close account instead of burn
      if (token.balance === 0) {
        console.log(`Token ${token.mint} has zero balance, using close account instruction`);
        
        const closeInstruction = createCloseAccountInstruction(
          new PublicKey(token.account),
          publicKey, // Destination for rent recovery
          publicKey  // Owner
        );
        
        transaction.add(closeInstruction);
      } else {
        console.log(`Token ${token.mint} has balance ${token.balance}, using burn + close instructions`);
        
        // Get the actual mint info to ensure we have the correct decimals
        let actualDecimals = token.decimals;
        console.log(`Token ${token.mint} stored decimals: ${token.decimals}`);
        
        try {
          const mintInfo = await connection.getParsedAccountInfo(new PublicKey(token.mint));
          if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
            actualDecimals = mintInfo.value.data.parsed.info.decimals;
            console.log(`Token ${token.mint} actual decimals from mint: ${actualDecimals}, was stored as: ${token.decimals}`);
          } else {
            console.warn(`No mint data found for ${token.mint}, using stored decimals`);
          }
        } catch (error) {
          console.error(`Failed to fetch mint info for ${token.mint}:`, error);
          console.warn(`Using stored decimals: ${token.decimals}`);
        }
        
        // Force correct decimals for known problematic token
        if (token.mint === 'DwLwu4FaSn39zkoCtozTMcmJLvMFNxgrbHoFxm9fzYFt') {
          actualDecimals = 0;
          console.log(`Forcing decimals to 0 for DwLw token`);
        }
        
        // First burn the token balance
        const burnInstruction = createBurnCheckedInstruction(
          new PublicKey(token.account), // Token account
          new PublicKey(token.mint),    // Mint
          publicKey,                    // Owner
          token.balance,                // Amount
          actualDecimals                // Correct decimals from mint
        );
        
        transaction.add(burnInstruction);
        
        // Then close the account to recover rent
        const closeInstruction = createCloseAccountInstruction(
          new PublicKey(token.account),
          publicKey, // Destination for rent recovery
          publicKey  // Owner
        );
        
        transaction.add(closeInstruction);
      }

      const signature = await sendTransaction(transaction, connection);
      console.log(`Token burn transaction sent with signature:`, signature);
      
      // Apply burn animation if element exists
      if (tokenElement && window.BurnAnimations) {
        window.BurnAnimations.applyBurnAnimation(tokenElement);
      }
      
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      console.log(`Token burn confirmation result:`, confirmation);
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

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
    } catch (err: any) {
      console.error('Error burning token:', err);
      
      // Provide specific error messages
      if (err?.message?.includes('InstructionError')) {
        setError('Token burning failed - the token may have already been processed or the account state has changed.');
      } else if (err?.message?.includes('insufficient')) {
        setError('Insufficient SOL balance to pay for transaction fees.');
      } else {
        setError('Failed to burn token. Please try again.');
      }
    } finally {
      setBurning(false);
    }
  };

  const handleBulkBurn = async () => {
    if (!publicKey || selectedTokens.size === 0) return;

    try {
      setBurning(true);
      const transaction = new Transaction();

      // Add compute budget instructions for bulk operations
      const { ComputeBudgetProgram } = await import('@solana/web3.js');
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 400000 // Higher compute limit for bulk operations
        })
      );
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1 // Minimal priority fee
        })
      );

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

      // Add burn/close instructions for all selected tokens
      for (const token of tokens) {
        if (selectedTokens.has(token.mint) && token.account) {
          console.log(`Processing token ${token.mint} with balance ${token.balance}`);
          
          // Check if token balance is 0 - use close account instead of burn
          if (token.balance === 0) {
            console.log(`Token ${token.mint} has zero balance, using close account instruction`);
            
            const closeInstruction = createCloseAccountInstruction(
              new PublicKey(token.account),
              publicKey, // Destination for rent recovery
              publicKey  // Owner
            );
            
            transaction.add(closeInstruction);
          } else {
            console.log(`Token ${token.mint} has balance ${token.balance}, using burn + close instructions`);
            
            // Get the actual mint info to ensure we have the correct decimals
            let actualDecimals = token.decimals;
            console.log(`Token ${token.mint} stored decimals: ${token.decimals}`);
            
            try {
              const mintInfo = await connection.getParsedAccountInfo(new PublicKey(token.mint));
              if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
                actualDecimals = mintInfo.value.data.parsed.info.decimals;
                console.log(`Token ${token.mint} actual decimals from mint: ${actualDecimals}, was stored as: ${token.decimals}`);
              } else {
                console.warn(`No mint data found for ${token.mint}, using stored decimals`);
              }
            } catch (error) {
              console.error(`Failed to fetch mint info for ${token.mint}:`, error);
              console.warn(`Using stored decimals: ${token.decimals}`);
            }
            
            // Force correct decimals for known problematic token
            if (token.mint === 'DwLwu4FaSn39zkoCtozTMcmJLvMFNxgrbHoFxm9fzYFt') {
              actualDecimals = 0;
              console.log(`Forcing decimals to 0 for DwLw token`);
            }
            
            // First burn the token balance
            const burnInstruction = createBurnCheckedInstruction(
              new PublicKey(token.account), // Token account
              new PublicKey(token.mint),    // Mint
              publicKey,                    // Owner
              token.balance,                // Amount
              actualDecimals                // Correct decimals from mint
            );
            
            transaction.add(burnInstruction);
            
            // Then close the account to recover rent
            const closeInstruction = createCloseAccountInstruction(
              new PublicKey(token.account),
              publicKey, // Destination for rent recovery
              publicKey  // Owner
            );
            
            transaction.add(closeInstruction);
          }
        }
      }

      const signature = await sendTransaction(transaction, connection);
      console.log(`Bulk token burn transaction sent with signature:`, signature);
      
      // Apply burn animations in sequence
      if (window.BurnAnimations && tokenElements.length > 0) {
        // Animate each token with a slight delay between them
        tokenElements.forEach((element, index) => {
          setTimeout(() => {
            window.BurnAnimations?.applyBurnAnimation(element);
          }, index * 200);
        });
      }
      
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      console.log(`Bulk burn confirmation result:`, confirmation);
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

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
    } catch (err: any) {
      console.error('Error confirming bulk burn transaction:', err);
      
      // Provide specific error messages
      if (err?.message?.includes('InstructionError')) {
        setError('Bulk token burning failed - one or more tokens may have already been processed or their account states have changed.');
      } else if (err?.message?.includes('insufficient')) {
        setError('Insufficient SOL balance to pay for transaction fees.');
      } else {
        setError('Failed to burn tokens. Please try again.');
      }
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