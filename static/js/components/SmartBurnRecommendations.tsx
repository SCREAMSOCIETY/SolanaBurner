import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface BurnRecommendation {
  type: 'nft' | 'token' | 'cnft';
  mint: string;
  name: string;
  score: number;
  reasons: string[];
  warnings: string[];
  rentRecovery: number;
  totalRecovery: number;
  recommendation: string;
  usdValue?: number;
}

interface RecommendationData {
  highPriority: BurnRecommendation[];
  mediumPriority: BurnRecommendation[];
  lowPriority: BurnRecommendation[];
  doNotBurn: BurnRecommendation[];
  summary: {
    totalAssets: number;
    burnRecommended: number;
    highPriorityCount: number;
    warningCount: number;
    estimatedTime: number;
  };
  potentialRecovery: number;
}

export const SmartBurnRecommendations: React.FC = () => {
  const { publicKey } = useWallet();
  const [recommendations, setRecommendations] = useState<RecommendationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showMoreHigh, setShowMoreHigh] = useState(false);
  const [showMoreMedium, setShowMoreMedium] = useState(false);
  const [showMoreDoNotBurn, setShowMoreDoNotBurn] = useState(false);

  useEffect(() => {
    if (publicKey) {
      fetchRecommendations();
    }
  }, [publicKey]);

  const fetchRecommendations = async () => {
    if (!publicKey) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/smart-burn-recommendations/${publicKey.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setRecommendations(data.recommendations);
      } else {
        setError(data.error || 'Failed to fetch recommendations');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Error fetching recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderAsset = (asset: BurnRecommendation, showWarning: boolean = false) => {
    const getScoreColor = (score: number) => {
      if (score >= 60) return '#4caf50';
      if (score >= 30) return '#ff9800';
      if (score >= 0) return '#2196f3';
      return '#f44336';
    };

    return (
      <div key={asset.mint} className="burn-recommendation-item" style={{
        borderLeft: `4px solid ${getScoreColor(asset.score)}`,
        backgroundColor: showWarning ? 'rgba(244, 67, 54, 0.1)' : 'transparent'
      }}>
        <div className="recommendation-header">
          <span className="asset-name">{asset.name}</span>
          <span className="asset-type">{asset.type.toUpperCase()}</span>
          {asset.totalRecovery > 0 && (
            <span className="recovery-amount">+{asset.totalRecovery.toFixed(4)} SOL</span>
          )}
        </div>
        
        {asset.reasons.length > 0 && (
          <div className="recommendation-reasons">
            {asset.reasons.map((reason, idx) => (
              <span key={idx} className="reason positive">✓ {reason}</span>
            ))}
          </div>
        )}
        
        {asset.warnings.length > 0 && (
          <div className="recommendation-warnings">
            {asset.warnings.map((warning, idx) => (
              <span key={idx} className="reason negative">⚠ {warning}</span>
            ))}
          </div>
        )}
        
        {asset.usdValue !== undefined && asset.usdValue > 0 && (
          <div className="token-value">
            Token value: ${asset.usdValue.toFixed(4)}
          </div>
        )}
      </div>
    );
  };

  if (!publicKey) return null;

  return (
    <div className="smart-burn-recommendations">
      <div className="section-header" onClick={() => setExpanded(!expanded)}>
        <h3>🎯 Smart Burn Recommendations</h3>
        <span className="toggle-icon">{expanded ? '−' : '+'}</span>
      </div>
      
      {expanded && (
        <div className="recommendations-content">
          {loading && (
            <div className="loading-state">Analyzing your wallet...</div>
          )}
          
          {error && (
            <div className="error-state">{error}</div>
          )}
          
          {recommendations && !loading && (
            <>
              <div className="summary-box">
                <div className="summary-stat">
                  <span className="stat-label">Total Assets</span>
                  <span className="stat-value">{recommendations.summary.totalAssets}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Burn Recommended</span>
                  <span className="stat-value">{recommendations.summary.burnRecommended}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Potential Recovery</span>
                  <span className="stat-value">{recommendations.potentialRecovery.toFixed(4)} SOL</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-label">Est. Time</span>
                  <span className="stat-value">{recommendations.summary.estimatedTime} min</span>
                </div>
              </div>
              
              {recommendations.highPriority.length > 0 && (
                <div className="priority-section">
                  <h4>🔥 High Priority ({recommendations.highPriority.length})</h4>
                  <div className="priority-description">These assets are strongly recommended for burning</div>
                  {recommendations.highPriority
                    .slice(0, showMoreHigh ? recommendations.highPriority.length : 3)
                    .map(asset => renderAsset(asset))}
                  {recommendations.highPriority.length > 3 && (
                    <button 
                      className="show-more-button" 
                      onClick={() => setShowMoreHigh(!showMoreHigh)}
                    >
                      {showMoreHigh ? `Show Less` : `Show ${recommendations.highPriority.length - 3} More`}
                    </button>
                  )}
                </div>
              )}
              
              {recommendations.mediumPriority.length > 0 && (
                <div className="priority-section">
                  <h4>📊 Medium Priority ({recommendations.mediumPriority.length})</h4>
                  <div className="priority-description">Consider burning these for additional recovery</div>
                  {recommendations.mediumPriority
                    .slice(0, showMoreMedium ? recommendations.mediumPriority.length : 2)
                    .map(asset => renderAsset(asset))}
                  {recommendations.mediumPriority.length > 2 && (
                    <button 
                      className="show-more-button" 
                      onClick={() => setShowMoreMedium(!showMoreMedium)}
                    >
                      {showMoreMedium ? `Show Less` : `Show ${recommendations.mediumPriority.length - 2} More`}
                    </button>
                  )}
                </div>
              )}
              
              {recommendations.doNotBurn.length > 0 && (
                <div className="priority-section warning-section">
                  <h4>⛔ Do Not Burn ({recommendations.doNotBurn.length})</h4>
                  <div className="priority-description">These assets have value and should be kept</div>
                  {recommendations.doNotBurn
                    .slice(0, showMoreDoNotBurn ? recommendations.doNotBurn.length : 2)
                    .map(asset => renderAsset(asset, true))}
                  {recommendations.doNotBurn.length > 2 && (
                    <button 
                      className="show-more-button warning-button" 
                      onClick={() => setShowMoreDoNotBurn(!showMoreDoNotBurn)}
                    >
                      {showMoreDoNotBurn ? `Show Less` : `Show ${recommendations.doNotBurn.length - 2} More`}
                    </button>
                  )}
                </div>
              )}
              
              <button 
                className="refresh-button"
                onClick={fetchRecommendations}
                disabled={loading}
              >
                Refresh Analysis
              </button>
            </>
          )}
        </div>
      )}
      
      <style jsx={true}>{`
        .smart-burn-recommendations {
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
        
        .recommendations-content {
          margin-top: 20px;
        }
        
        .summary-box {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 30px;
        }
        
        .summary-stat {
          background: rgba(255, 255, 255, 0.1);
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
        
        .priority-section {
          margin-bottom: 25px;
        }
        
        .priority-section h4 {
          margin: 0 0 10px 0;
          color: #fff;
          font-size: 16px;
        }
        
        .priority-description {
          font-size: 12px;
          color: #999;
          margin-bottom: 10px;
        }
        
        .burn-recommendation-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 10px;
          transition: all 0.2s;
        }
        
        .burn-recommendation-item:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        
        .recommendation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .asset-name {
          font-weight: 500;
          color: #fff;
          flex: 1;
        }
        
        .asset-type {
          font-size: 11px;
          background: rgba(255, 255, 255, 0.1);
          padding: 2px 8px;
          border-radius: 4px;
          color: #999;
          margin: 0 10px;
        }
        
        .recovery-amount {
          color: #4caf50;
          font-weight: bold;
        }
        
        .recommendation-reasons,
        .recommendation-warnings {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 8px;
        }
        
        .reason {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 4px;
        }
        
        .reason.positive {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
        }
        
        .reason.negative {
          background: rgba(244, 67, 54, 0.2);
          color: #f44336;
        }
        
        .token-value {
          font-size: 12px;
          color: #999;
          margin-top: 5px;
        }
        
        .warning-section {
          background: rgba(244, 67, 54, 0.05);
          padding: 15px;
          border-radius: 8px;
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
        
        .show-more-button {
          background: rgba(255, 255, 255, 0.1);
          color: #ccc;
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          margin-top: 10px;
          transition: all 0.2s;
          width: 100%;
        }
        
        .show-more-button:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }
        
        .show-more-button.warning-button {
          background: rgba(244, 67, 54, 0.1);
          color: #f44336;
          border-color: rgba(244, 67, 54, 0.3);
        }
        
        .show-more-button.warning-button:hover {
          background: rgba(244, 67, 54, 0.2);
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
          .summary-box {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
};