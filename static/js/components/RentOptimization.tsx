import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface CompetitorComparison {
  solburnt: {
    name: string;
    total: number;
    breakdown: {
      nfts?: number;
      tokens?: number;
    };
  };
  competitors: {
    [key: string]: {
      name: string;
      total: number;
      difference: number;
      percentageDiff: string;
    };
  };
  bestCompetitor: {
    name: string;
    total: number;
  };
  solburntAdvantage: boolean;
}

interface RecoveryPotential {
  base: {
    nfts: number;
    tokens: number;
    total: number;
  };
  optimized: {
    nftResize: number;
    auxiliaryAccounts: number;
    total: number;
  };
  maximum: number;
  improvementPercentage: string;
}

interface OptimizationReport {
  competitorAnalysis: CompetitorComparison;
  recoveryPotential: RecoveryPotential;
  optimalStrategy: {
    burnOrder: any[];
    totalAssets: number;
    estimatedTime: number;
    batches: number;
  };
  recommendations: Array<{
    priority: string;
    action: string;
    impact: string;
    description: string;
  }>;
}

export const RentOptimization: React.FC = () => {
  const { publicKey } = useWallet();
  const [optimization, setOptimization] = useState<OptimizationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (publicKey) {
      fetchOptimization();
    }
  }, [publicKey]);

  const fetchOptimization = async () => {
    if (!publicKey) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/rent-optimization/${publicKey.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setOptimization(data.optimization);
      } else {
        setError(data.error || 'Failed to fetch optimization data');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Error fetching optimization:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatSOL = (amount: number) => {
    return amount.toFixed(4);
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'resize-all':
        // Scroll to NFT section and highlight resize options
        const nftSection = document.querySelector('.nft-section');
        if (nftSection) {
          nftSection.scrollIntoView({ behavior: 'smooth' });
          // Flash highlight effect
          nftSection.classList.add('highlight-flash');
          setTimeout(() => nftSection.classList.remove('highlight-flash'), 2000);
        }
        break;
      case 'burn-vacant':
        // Scroll to vacant accounts section
        const vacantSection = document.querySelector('.vacant-accounts-section');
        if (vacantSection) {
          vacantSection.scrollIntoView({ behavior: 'smooth' });
          vacantSection.classList.add('highlight-flash');
          setTimeout(() => vacantSection.classList.remove('highlight-flash'), 2000);
        }
        break;
      case 'batch-tokens':
        // Scroll to tokens section and highlight batch options
        const tokenSection = document.querySelector('.token-section');
        if (tokenSection) {
          tokenSection.scrollIntoView({ behavior: 'smooth' });
          tokenSection.classList.add('highlight-flash');
          setTimeout(() => tokenSection.classList.remove('highlight-flash'), 2000);
        }
        break;
      case 'analyze-deep':
        // Trigger fresh analysis
        fetchOptimization();
        break;
    }
  };

  if (!publicKey) return null;

  return (
    <div className="rent-optimization">
      <div className="section-header" onClick={() => setExpanded(!expanded)}>
        <h3>📈 Advanced Rent Optimization</h3>
        <span className="toggle-icon">{expanded ? '−' : '+'}</span>
      </div>
      
      {expanded && (
        <div className="optimization-content">
          {loading && (
            <div className="loading-state">Analyzing optimization opportunities...</div>
          )}
          
          {error && (
            <div className="error-state">{error}</div>
          )}
          
          {optimization && !loading && (
            <>
              {/* Quick Action Buttons */}
              <div className="quick-actions-section">
                <h4>⚡ Quick Actions</h4>
                <div className="action-buttons-grid">
                  <button className="action-button primary" onClick={() => handleQuickAction('resize-all')}>
                    <div className="action-icon">📏</div>
                    <div className="action-text">
                      <div className="action-title">Resize All NFTs</div>
                      <div className="action-desc">Optimize metadata first</div>
                    </div>
                  </button>
                  
                  <button className="action-button secondary" onClick={() => handleQuickAction('burn-vacant')}>
                    <div className="action-icon">🗑️</div>
                    <div className="action-text">
                      <div className="action-title">Burn Vacant Accounts</div>
                      <div className="action-desc">Quick SOL recovery</div>
                    </div>
                  </button>
                  
                  <button className="action-button tertiary" onClick={() => handleQuickAction('batch-tokens')}>
                    <div className="action-icon">⚡</div>
                    <div className="action-text">
                      <div className="action-title">Batch Burn Tokens</div>
                      <div className="action-desc">Process multiple at once</div>
                    </div>
                  </button>
                  
                  <button className="action-button quaternary" onClick={() => handleQuickAction('analyze-deep')}>
                    <div className="action-icon">🔍</div>
                    <div className="action-text">
                      <div className="action-title">Deep Analysis</div>
                      <div className="action-desc">Find hidden opportunities</div>
                    </div>
                  </button>
                </div>
              </div>
              
              {/* Recovery Potential */}
              <div className="recovery-section">
                <h4>💰 Maximum Recovery Potential</h4>
                <div className="recovery-breakdown">
                  <div className="recovery-row">
                    <span>Base Recovery (Current)</span>
                    <span className="recovery-value">{formatSOL(optimization.recoveryPotential.base.total)} SOL</span>
                  </div>
                  
                  {optimization.recoveryPotential.optimized.nftResize > 0 && (
                    <div className="recovery-row optimization">
                      <span>+ NFT Metadata Resizing</span>
                      <span className="recovery-value">+{formatSOL(optimization.recoveryPotential.optimized.nftResize)} SOL</span>
                    </div>
                  )}
                  
                  {optimization.recoveryPotential.optimized.auxiliaryAccounts > 0 && (
                    <div className="recovery-row optimization">
                      <span>+ Auxiliary Accounts</span>
                      <span className="recovery-value">+{formatSOL(optimization.recoveryPotential.optimized.auxiliaryAccounts)} SOL</span>
                    </div>
                  )}
                  
                  <div className="recovery-row total">
                    <span>Maximum Possible Recovery</span>
                    <span className="recovery-value">{formatSOL(optimization.recoveryPotential.maximum)} SOL</span>
                  </div>
                  
                  {parseFloat(optimization.recoveryPotential.improvementPercentage) > 0 && (
                    <div className="improvement-badge">
                      +{optimization.recoveryPotential.improvementPercentage}% improvement possible!
                    </div>
                  )}
                </div>
              </div>
              
              {/* Recommendations */}
              {optimization.recommendations.length > 0 && (
                <div className="recommendations-section">
                  <h4>💡 Optimization Recommendations</h4>
                  {optimization.recommendations.map((rec, idx) => (
                    <div key={idx} className={`recommendation-card priority-${rec.priority}`}>
                      <div className="recommendation-header">
                        <span className="recommendation-action">{rec.action}</span>
                        <span className="recommendation-impact">{rec.impact}</span>
                      </div>
                      <div className="recommendation-description">{rec.description}</div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Optimal Strategy */}
              <div className="strategy-section">
                <h4>🎯 Optimal Burn Strategy</h4>
                <div className="strategy-stats">
                  <div className="strategy-stat">
                    <span className="stat-label">Total Assets</span>
                    <span className="stat-value">{optimization.optimalStrategy.totalAssets}</span>
                  </div>
                  <div className="strategy-stat">
                    <span className="stat-label">Batches</span>
                    <span className="stat-value">{optimization.optimalStrategy.batches}</span>
                  </div>
                  <div className="strategy-stat">
                    <span className="stat-label">Est. Time</span>
                    <span className="stat-value">{optimization.optimalStrategy.estimatedTime} min</span>
                  </div>
                </div>
              </div>
              
              <button 
                className="refresh-button"
                onClick={fetchOptimization}
                disabled={loading}
              >
                Refresh Analysis
              </button>
            </>
          )}
        </div>
      )}
      
      <style jsx={true}>{`
        .rent-optimization {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
        }
        
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          user-select: none;
        }
        
        .section-header h3 {
          margin: 0;
          font-size: 20px;
          color: #fff;
        }
        
        .toggle-icon {
          font-size: 24px;
          color: #999;
        }
        
        .optimization-content {
          margin-top: 20px;
        }
        
        .quick-actions-section,
        .recovery-section,
        .recommendations-section,
        .strategy-section {
          margin-bottom: 30px;
        }
        
        .action-buttons-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
        }
        
        .action-button {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 15px;
          color: #fff;
          text-align: left;
        }
        
        .action-button:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
          transform: translateY(-2px);
        }
        
        .action-button.primary {
          border-color: #4caf50;
          background: rgba(76, 175, 80, 0.1);
        }
        
        .action-button.primary:hover {
          background: rgba(76, 175, 80, 0.15);
          border-color: #4caf50;
        }
        
        .action-button.secondary {
          border-color: #ff6400;
          background: rgba(255, 100, 0, 0.1);
        }
        
        .action-button.secondary:hover {
          background: rgba(255, 100, 0, 0.15);
          border-color: #ff6400;
        }
        
        .action-button.tertiary {
          border-color: #2196f3;
          background: rgba(33, 150, 243, 0.1);
        }
        
        .action-button.tertiary:hover {
          background: rgba(33, 150, 243, 0.15);
          border-color: #2196f3;
        }
        
        .action-button.quaternary {
          border-color: #9c27b0;
          background: rgba(156, 39, 176, 0.1);
        }
        
        .action-button.quaternary:hover {
          background: rgba(156, 39, 176, 0.15);
          border-color: #9c27b0;
        }
        
        .action-icon {
          font-size: 32px;
          flex-shrink: 0;
        }
        
        .action-text {
          flex: 1;
        }
        
        .action-title {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        
        .action-desc {
          font-size: 13px;
          color: #999;
        }
        
        h4 {
          color: #fff;
          font-size: 16px;
          margin: 0 0 15px 0;
        }
        

        
        .recovery-breakdown {
          background: rgba(255, 255, 255, 0.05);
          padding: 20px;
          border-radius: 8px;
        }
        
        .recovery-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .recovery-row:last-child {
          border-bottom: none;
        }
        
        .recovery-row.optimization {
          color: #4caf50;
        }
        
        .recovery-row.total {
          font-weight: bold;
          font-size: 18px;
          margin-top: 10px;
          padding-top: 20px;
          border-top: 2px solid rgba(255, 255, 255, 0.2);
        }
        
        .recovery-value {
          font-weight: 500;
        }
        
        .improvement-badge {
          background: #4caf50;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          text-align: center;
          margin-top: 15px;
          font-weight: bold;
        }
        
        .recommendation-card {
          background: rgba(255, 255, 255, 0.08);
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 10px;
          border-left: 4px solid #2196f3;
        }
        
        .recommendation-card.priority-high {
          border-left-color: #ff6400;
        }
        
        .recommendation-card.priority-medium {
          border-left-color: #ff9800;
        }
        
        .recommendation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .recommendation-action {
          font-weight: bold;
          color: #fff;
        }
        
        .recommendation-impact {
          color: #4caf50;
          font-weight: bold;
        }
        
        .recommendation-description {
          font-size: 14px;
          color: #999;
        }
        
        .strategy-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
        }
        
        .strategy-stat {
          background: rgba(255, 255, 255, 0.08);
          padding: 15px;
          border-radius: 8px;
          text-align: center;
        }
        
        .stat-label {
          display: block;
          font-size: 12px;
          color: #999;
          margin-bottom: 5px;
        }
        
        .stat-value {
          display: block;
          font-size: 20px;
          font-weight: bold;
          color: #fff;
        }
        
        .refresh-button {
          background: #ff6400;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
          margin-top: 20px;
          width: 100%;
        }
        
        .refresh-button:hover:not(:disabled) {
          background: #ff7a1f;
        }
        
        .refresh-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .loading-state,
        .error-state {
          text-align: center;
          padding: 40px;
          color: #999;
        }
        
        .error-state {
          color: #f44336;
        }
        
        @media (max-width: 768px) {
          .comparison-grid {
            grid-template-columns: 1fr;
          }
          
          .strategy-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};