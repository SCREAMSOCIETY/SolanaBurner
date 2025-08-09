import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface RecentActivityProps {}

const RecentActivity: React.FC<RecentActivityProps> = () => {
  const { publicKey } = useWallet();
  const [expanded, setExpanded] = useState(true);

  const getRecentActivity = () => {
    // Get activity from localStorage
    const storedActivity = localStorage.getItem('solburnt-recent-activity');
    if (!storedActivity) {
      return [];
    }
    
    try {
      const activity = JSON.parse(storedActivity);
      // Filter to last 24 hours and sort by most recent
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      return activity
        .filter((item: any) => item.timestamp > oneDayAgo)
        .sort((a: any, b: any) => b.timestamp - a.timestamp)
        .slice(0, 10); // Show last 10 activities
    } catch {
      return [];
    }
  };

  const getTotalRecoveredToday = () => {
    const activities = getRecentActivity();
    return activities.reduce((total: number, activity: any) => total + activity.recovery, 0);
  };

  if (!publicKey) return null;

  return (
    <div className="recent-activity">
      <div className="section-header" onClick={() => setExpanded(!expanded)}>
        <h3>📈 Recent Activity</h3>
        <span className="toggle-icon">{expanded ? '−' : '+'}</span>
      </div>
      
      {expanded && (
        <div className="recent-activity-content">
          <div className="activity-feed">
            {getRecentActivity().length > 0 ? (
              getRecentActivity().map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-icon">
                    {activity.type === 'nft-burn' && '🔥'}
                    {activity.type === 'token-burn' && '💰'}
                    {activity.type === 'vacant-burn' && '🗑️'}
                    {activity.type === 'resize' && '📏'}
                  </div>
                  <div className="activity-details">
                    <div className="activity-title">{activity.title}</div>
                    <div className="activity-desc">{activity.description}</div>
                  </div>
                  <div className="activity-recovery">
                    +{activity.recovery.toFixed(4)} SOL
                  </div>
                  <div className="activity-time">{activity.time}</div>
                </div>
              ))
            ) : (
              <div className="no-activity">
                <div className="no-activity-icon">💤</div>
                <div className="no-activity-text">
                  <div>No recent activity</div>
                  <div className="no-activity-desc">Your successful burns will appear here</div>
                </div>
              </div>
            )}
          </div>
          
          <div className="activity-summary">
            <div className="summary-stat">
              <span className="stat-label">Total Recovered Today</span>
              <span className="stat-value">{getTotalRecoveredToday().toFixed(4)} SOL</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Transactions</span>
              <span className="stat-value">{getRecentActivity().length}</span>
            </div>
          </div>
        </div>
      )}
      
      <style jsx>{`
        .recent-activity {
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
          color: #fff;
          font-size: 18px;
        }
        
        .toggle-icon {
          color: #9945FF;
          font-size: 20px;
          font-weight: bold;
        }
        
        .recent-activity-content {
          margin-top: 20px;
        }
        
        .activity-feed {
          max-height: 300px;
          overflow-y: auto;
          margin-bottom: 20px;
        }
        
        .activity-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          margin-bottom: 8px;
          border-left: 3px solid #9945FF;
        }
        
        .activity-icon {
          font-size: 20px;
          width: 24px;
          text-align: center;
        }
        
        .activity-details {
          flex: 1;
        }
        
        .activity-title {
          font-weight: 600;
          color: #fff;
          margin-bottom: 4px;
        }
        
        .activity-desc {
          color: #aaa;
          font-size: 14px;
        }
        
        .activity-recovery {
          color: #22c55e;
          font-weight: 600;
          font-size: 14px;
        }
        
        .activity-time {
          color: #888;
          font-size: 12px;
          min-width: 50px;
          text-align: right;
        }
        
        .no-activity {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
          text-align: center;
        }
        
        .no-activity-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }
        
        .no-activity-text {
          color: #aaa;
        }
        
        .no-activity-desc {
          font-size: 14px;
          margin-top: 8px;
          opacity: 0.7;
        }
        
        .activity-summary {
          display: flex;
          gap: 20px;
          padding: 16px;
          background: rgba(153, 69, 255, 0.1);
          border-radius: 8px;
        }
        
        .summary-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .stat-label {
          color: #aaa;
          font-size: 14px;
        }
        
        .stat-value {
          color: #fff;
          font-weight: 600;
          font-size: 16px;
        }
      `}</style>
    </div>
  );
};

export default RecentActivity;