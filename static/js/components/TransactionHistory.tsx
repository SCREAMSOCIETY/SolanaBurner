import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface Transaction {
  id: string;
  type: 'burn' | 'transfer' | 'close_account';
  status: 'pending' | 'success' | 'failed';
  signature?: string;
  timestamp: number;
  assets: {
    id: string;
    name: string;
    type: 'nft' | 'cnft' | 'token';
  }[];
  solRecovered?: number;
  error?: string;
}

const TransactionHistory: React.FC = () => {
  const { publicKey } = useWallet();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  // Load transaction history from localStorage
  useEffect(() => {
    if (publicKey) {
      const storageKey = `tx_history_${publicKey.toString()}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          setTransactions(JSON.parse(stored));
        } catch (error) {
          console.error('Failed to parse transaction history:', error);
        }
      }
    }
  }, [publicKey]);

  // Save transaction history to localStorage
  const saveTransactions = (txs: Transaction[]) => {
    if (publicKey) {
      const storageKey = `tx_history_${publicKey.toString()}`;
      localStorage.setItem(storageKey, JSON.stringify(txs));
      setTransactions(txs);
    }
  };

  // Add a new transaction
  const addTransaction = (tx: Omit<Transaction, 'id' | 'timestamp'>) => {
    const newTransaction: Transaction = {
      ...tx,
      id: Date.now().toString(),
      timestamp: Date.now()
    };
    const updated = [newTransaction, ...transactions].slice(0, 50); // Keep last 50 transactions
    saveTransactions(updated);
  };

  // Update transaction status
  const updateTransaction = (id: string, updates: Partial<Transaction>) => {
    const updated = transactions.map(tx => 
      tx.id === id ? { ...tx, ...updates } : tx
    );
    saveTransactions(updated);
  };

  // Clear all transactions
  const clearHistory = () => {
    saveTransactions([]);
  };

  // Export transaction history
  const exportHistory = () => {
    const dataStr = JSON.stringify(transactions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `solburn_history_${publicKey?.toString().slice(0, 8)}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Make functions available globally for other components to use
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.TransactionHistory = {
        addTransaction,
        updateTransaction
      };
    }
  }, [transactions]);

  if (!publicKey) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return '#22c55e';
      case 'failed': return '#ef4444';
      case 'pending': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'burn': return '🔥';
      case 'transfer': return '↗️';
      case 'close_account': return '🗑️';
      default: return '📄';
    }
  };

  return (
    <>
      <button
        onClick={() => setIsVisible(!isVisible)}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          backgroundColor: '#1f2937',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '56px',
          height: '56px',
          fontSize: '24px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000
        }}
        title="Transaction History"
      >
        📋
      </button>

      {isVisible && (
        <div
          style={{
            position: 'fixed',
            bottom: '90px',
            left: '20px',
            width: '400px',
            maxHeight: '500px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '12px',
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
          }}
        >
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #444',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>
              Transaction History
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {transactions.length > 0 && (
                <button
                  onClick={exportHistory}
                  style={{
                    backgroundColor: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Export
                </button>
              )}
              <button
                onClick={() => setIsVisible(false)}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>

          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
            padding: transactions.length === 0 ? '32px 16px' : '0'
          }}>
            {transactions.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                color: '#9ca3af',
                fontSize: '14px'
              }}>
                No transactions yet
              </div>
            ) : (
              transactions.map(tx => (
                <div
                  key={tx.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #333',
                    color: 'white'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{getTypeIcon(tx.type)}</span>
                      <span style={{ 
                        fontWeight: 'bold',
                        fontSize: '14px',
                        textTransform: 'capitalize'
                      }}>
                        {tx.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{
                      backgroundColor: getStatusColor(tx.status),
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}>
                      {tx.status}
                    </div>
                  </div>

                  <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                    {new Date(tx.timestamp).toLocaleString()}
                  </div>

                  <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                    {tx.assets.length} asset{tx.assets.length !== 1 ? 's' : ''}
                    {tx.solRecovered && (
                      <span style={{ color: '#22c55e', marginLeft: '8px' }}>
                        +{tx.solRecovered.toFixed(4)} SOL
                      </span>
                    )}
                  </div>

                  {tx.signature && (
                    <div style={{ fontSize: '11px' }}>
                      <a
                        href={`https://solscan.io/tx/${tx.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#3b82f6', textDecoration: 'none' }}
                      >
                        View on Solscan
                      </a>
                    </div>
                  )}

                  {tx.error && (
                    <div style={{ 
                      fontSize: '11px', 
                      color: '#ef4444',
                      marginTop: '4px',
                      wordBreak: 'break-word'
                    }}>
                      {tx.error}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {transactions.length > 0 && (
            <div style={{ 
              padding: '12px 16px',
              borderTop: '1px solid #444',
              textAlign: 'center'
            }}>
              <button
                onClick={clearHistory}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Clear History
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default TransactionHistory;