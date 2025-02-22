import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import axios from 'axios';

// Define the Token Program ID constant since import isn't working
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

interface TokenData {
  mint: string;
  balance: number;
  decimals: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
}

const TokensTab: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTokens = async () => {
      if (!publicKey) return;

      try {
        setLoading(true);
        setError(null);

        // Get all token accounts for the connected wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );

        // Transform the data
        const tokenData = tokenAccounts.value.map((account) => {
          const parsedInfo = account.account.data.parsed.info;
          return {
            mint: parsedInfo.mint,
            balance: Number(parsedInfo.tokenAmount.amount),
            decimals: parsedInfo.tokenAmount.decimals,
          };
        });

        // Filter out tokens with 0 balance
        const nonZeroTokens = tokenData.filter(token => token.balance > 0);

        // Fetch token metadata from Jupiter API
        const enrichedTokens = await Promise.all(
          nonZeroTokens.map(async (token) => {
            try {
              const response = await axios.get(
                `https://token.jup.ag/token/${token.mint}`
              );
              return {
                ...token,
                symbol: response.data?.symbol,
                name: response.data?.name,
                logoURI: response.data?.logoURI
              };
            } catch (error) {
              console.log(`Error fetching metadata for token ${token.mint}:`, error);
              return token;
            }
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

    if (publicKey) {
      fetchTokens();
    } else {
      setTokens([]);
      setLoading(false);
      setError(null);
    }
  }, [publicKey, connection]);

  if (!publicKey) {
    return (
      <div className="tokens-container">
        <h2>Tokens</h2>
        <p className="connect-message">Connect your wallet to view tokens</p>
      </div>
    );
  }

  return (
    <div className="tokens-container">
      <h2>Tokens</h2>
      {loading ? (
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