/**
 * Activity Logger for Solburnt App
 * Records user activities like burns, transfers, etc. for display in Recent Activity Feed
 */

class ActivityLogger {
  static STORAGE_KEY = 'solburnt-recent-activity';
  static MAX_ACTIVITIES = 50;

  /**
   * Log a new activity
   * @param {string} type - Activity type: 'nft-burn', 'token-burn', 'vacant-burn', 'resize'
   * @param {string} title - Activity title
   * @param {string} description - Activity description
   * @param {number} recovery - SOL recovery amount
   * @param {string} [signature] - Optional transaction signature
   */
  static logActivity(type, title, description, recovery, signature = null) {
    try {
      const activity = {
        type,
        title,
        description,
        recovery: parseFloat(recovery) || 0,
        time: this.formatTimeAgo(new Date()),
        timestamp: Date.now(),
        signature
      };

      const activities = this.getActivities();
      activities.unshift(activity); // Add to beginning

      // Keep only recent activities
      const trimmed = activities.slice(0, this.MAX_ACTIVITIES);

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmed));
      
      console.log(`[Activity Logger] Logged ${type}: ${title} (+${recovery} SOL)`);
    } catch (error) {
      console.error('[Activity Logger] Failed to log activity:', error);
    }
  }

  /**
   * Get all stored activities
   * @returns {Array} Array of activity objects
   */
  static getActivities() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Get activities from the last 24 hours
   * @returns {Array} Recent activities
   */
  static getRecentActivities() {
    const activities = this.getActivities();
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    return activities
      .filter(activity => activity.timestamp > oneDayAgo)
      .slice(0, 10);
  }

  /**
   * Get total SOL recovered today
   * @returns {number} Total SOL recovered
   */
  static getTotalRecoveredToday() {
    const activities = this.getRecentActivities();
    return activities.reduce((total, activity) => total + (activity.recovery || 0), 0);
  }

  /**
   * Clear all activities
   */
  static clearActivities() {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Format timestamp as time ago string
   * @param {Date} date - Date to format
   * @returns {string} Time ago string
   */
  static formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  /**
   * Quick logging methods for common activities
   */
  static logNFTBurn(nftName, recovery, signature) {
    this.logActivity('nft-burn', 'NFT Burned', nftName, recovery, signature);
  }

  static logTokenBurn(tokenName, recovery, signature) {
    this.logActivity('token-burn', 'Token Burned', tokenName, recovery, signature);
  }

  static logVacantBurn(count, recovery, signature) {
    this.logActivity('vacant-burn', `Vacant Accounts Cleared`, `${count} empty token accounts`, recovery, signature);
  }

  static logNFTResize(nftName, recovery, signature) {
    this.logActivity('resize', 'NFT Resized', nftName, recovery, signature);
  }

  static logBatchBurn(count, type, recovery, signature) {
    this.logActivity('batch-burn', `Batch ${type} Burn`, `${count} ${type}s processed`, recovery, signature);
  }
}

// Make available globally for use in other components
if (typeof window !== 'undefined') {
  window.ActivityLogger = ActivityLogger;
}