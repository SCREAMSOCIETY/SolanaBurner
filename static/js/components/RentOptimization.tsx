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
              {/* Competitor Comparison */}
              <div className="comparison-section">
                <h4>⚔️ Competitor Comparison</h4>
                <div className="comparison-grid">
                  <div className="competitor-card solburnt">
                    <div className="competitor-name">Solburnt (You)</div>
                    <div className="competitor-total">{formatSOL(optimization.competitorAnalysis.solburnt.total)} SOL</div>
                    {optimization.competitorAnalysis.solburntAdvantage && (
                      <div className="advantage-badge">Best Rate!</div>
                    )}
                  </div>
                  
                  {Object.entries(optimization.competitorAnalysis.competitors).map(([name, data]) => (
                    <div key={name} className="competitor-card">
                      <div className="competitor-name">{name}</div>
                      <div className="competitor-total">{formatSOL(data.total)} SOL</div>
                      <div className={`difference ${data.difference > 0 ? 'positive' : 'negative'}`}>
                        {data.difference > 0 ? '+' : ''}{formatSOL(data.difference)} SOL
                        <span className="percentage">({data.percentageDiff}%)</span>
                      </div>
                    </div>
                  ))}
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
        
        .comparison-section,
        .recovery-section,
        .recommendations-section,
        .strategy-section {
          margin-bottom: 30px;
        }
        
        h4 {
          color: #fff;
          font-size: 16px;
          margin: 0 0 15px 0;
        }
        
        .comparison-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
        }
        
        .competitor-card {
          background: rgba(255, 255, 255, 0.08);
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          position: relative;
        }
        
        .competitor-card.solburnt {
          border: 2px solid #ff6400;
        }
        
        .competitor-name {
          font-size: 14px;
          color: #999;
          margin-bottom: 10px;
        }
        
        .competitor-total {
          font-size: 24px;
          font-weight: bold;
          color: #fff;
          margin-bottom: 10px;
        }
        
        .advantage-badge {
          position: absolute;
          top: -10px;
          right: 10px;
          background: #4caf50;
          color: white;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
        }
        
        .difference {
          font-size: 14px;
        }
        
        .difference.positive {
          color: #4caf50;
        }
        
        .difference.negative {
          color: #f44336;
        }
        
        .percentage {
          opacity: 0.7;
          margin-left: 5px;
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