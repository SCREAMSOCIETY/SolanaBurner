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
  tokenAccount: string;
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
      setTokens(nonZeroTokens);

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
        <div className="confirmation-dialog">
          <h3>Confirm Burn</h3>
          {burnModal.isBulk ? (
            <>
              <p>You are about to burn {burnModal.tokens.length} tokens:</p>
              {burnModal.tokens.map(token => (
                <div key={token.mint} className="confirmation-token">
                  <span>{token.name || 'Unknown Token'}</span>
                  <span className="amount">
                    {(token.balance / Math.pow(10, token.decimals)).toLocaleString()} {token.symbol}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <>
              <p>You are about to burn:</p>
              <div className="amount">
                {(burnModal.tokens[0].balance / Math.pow(10, burnModal.tokens[0].decimals)).toLocaleString()} {burnModal.tokens[0].symbol}
              </div>
              <p>This action cannot be undone.</p>
            </>
          )}
          <div className="confirmation-buttons">
            <button 
              className="confirm-burn"
              onClick={() => burnModal.isBulk ? burnSelectedTokens() : burnToken(burnModal.tokens[0].mint, burnModal.tokens[0].balance)}
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
      )}
    </div>
  );
};

export default TokensTab;