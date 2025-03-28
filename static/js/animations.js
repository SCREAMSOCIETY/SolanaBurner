/**
 * Solana Token Burner Animations
 * This file contains all the interactive animations and UI enhancements
 * for the Solana Token Burner application.
 */

// Store achievements and progress in local storage
let burnAchievements = {
  tokens: 0,
  nfts: 0,
  value: 0,
  achievements: []
};

// Confetti animation
function createConfetti() {
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4'];
  const container = document.querySelector('.app-container') || document.body;
  
  for (let i = 0; i < 100; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.top = -20 + 'px';
    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
    confetti.style.width = Math.random() * 10 + 5 + 'px';
    confetti.style.height = Math.random() * 10 + 5 + 'px';
    confetti.style.animationDuration = Math.random() * 3 + 2 + 's';
    confetti.style.animationDelay = Math.random() * 2 + 's';
    
    container.appendChild(confetti);
    
    // Remove confetti after animation is complete
    setTimeout(() => {
      confetti.remove();
    }, 5000);
  }
}

// Dark mode toggle
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDarkMode = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDarkMode);
  
  // Update button text
  const darkModeBtn = document.getElementById('dark-mode-toggle');
  if (darkModeBtn) {
    darkModeBtn.textContent = isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
  }
  
  // Show achievement the first time user toggles
  if (!localStorage.getItem('darkModeAchievement')) {
    showAchievement('Night Burner', 'You\'ve discovered dark mode!');
    localStorage.setItem('darkModeAchievement', 'true');
  }
}

// Burn animation for tokens and NFTs
function applyBurnAnimation(element) {
  if (!element) return;
  
  // Create the flame overlay
  const flame = document.createElement('div');
  flame.className = 'burn-flame';
  element.appendChild(flame);
  
  // Add the burn animation class
  element.classList.add('burning');
  
  // Create embers that fly off
  for (let i = 0; i < 15; i++) {
    const ember = document.createElement('div');
    ember.className = 'ember';
    ember.style.left = 40 + (Math.random() * 20) + '%';
    ember.style.animationDuration = 0.5 + (Math.random() * 1) + 's';
    ember.style.animationDelay = (Math.random() * 0.5) + 's';
    element.appendChild(ember);
  }
  
  // Remove the card after animation completes
  setTimeout(() => {
    element.classList.add('burned');
    
    // Remove the element after fade-out animation
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, 500);
  }, 1500);
}

// Achievement notification system
function showAchievement(title, description) {
  const achievementPopup = document.createElement('div');
  achievementPopup.className = 'achievement-popup';
  
  // Create trophy icon
  const trophy = document.createElement('div');
  trophy.className = 'achievement-trophy';
  trophy.innerHTML = '🏆';
  
  // Create achievement content
  const content = document.createElement('div');
  content.className = 'achievement-content';
  
  const achievementTitle = document.createElement('h3');
  achievementTitle.className = 'achievement-title';
  achievementTitle.textContent = title;
  
  const achievementDesc = document.createElement('p');
  achievementDesc.className = 'achievement-description';
  achievementDesc.textContent = description;
  
  content.appendChild(achievementTitle);
  content.appendChild(achievementDesc);
  
  achievementPopup.appendChild(trophy);
  achievementPopup.appendChild(content);
  
  document.body.appendChild(achievementPopup);
  
  // Animate in
  setTimeout(() => {
    achievementPopup.classList.add('show');
  }, 100);
  
  // Animate out and remove
  setTimeout(() => {
    achievementPopup.classList.remove('show');
    setTimeout(() => {
      if (achievementPopup.parentNode) {
        achievementPopup.parentNode.removeChild(achievementPopup);
      }
    }, 500);
  }, 5000);
  
  // Add to achievements list for tracking
  if (!burnAchievements.achievements.includes(title)) {
    burnAchievements.achievements.push(title);
    saveAchievements();
  }
}

// Progress tracking
function updateProgress(currentVal, maxVal, level) {
  const progressBar = document.querySelector('.progress-bar-inner');
  const levelIndicator = document.querySelector('.burner-level');
  const progressPercent = document.querySelector('.progress-percent');
  
  if (!progressBar || !levelIndicator || !progressPercent) return;
  
  const percent = (currentVal / maxVal) * 100;
  progressBar.style.width = `${percent}%`;
  levelIndicator.textContent = `Level ${level}`;
  progressPercent.textContent = `${Math.round(percent)}%`;
}

// Save achievements to local storage
function saveAchievements() {
  localStorage.setItem('burnAchievements', JSON.stringify(burnAchievements));
}

// Load achievements from local storage
function loadAchievements() {
  const saved = localStorage.getItem('burnAchievements');
  if (saved) {
    burnAchievements = JSON.parse(saved);
  }
  
  // Update UI with loaded values
  const tokensBurned = document.querySelector('.stats-value.tokens');
  const nftsBurned = document.querySelector('.stats-value.nfts');
  const valueBurned = document.querySelector('.stats-value.value');
  
  if (tokensBurned) tokensBurned.textContent = burnAchievements.tokens;
  if (nftsBurned) nftsBurned.textContent = burnAchievements.nfts;
  if (valueBurned) valueBurned.textContent = burnAchievements.value.toFixed(2);
  
  // Calculate level and progress
  const level = Math.floor(burnAchievements.tokens / 10) + 1;
  const nextLevel = level * 10;
  const progress = burnAchievements.tokens % 10;
  
  updateProgress(progress, 10, level);
}

// Check for achievements based on burn activity
function checkAchievements(type, value) {
  if (type === 'token') {
    burnAchievements.tokens += value;
    
    // Token burning achievements
    if (burnAchievements.tokens >= 1 && !burnAchievements.achievements.includes('First Burn')) {
      showAchievement('First Burn', 'You burned your first token!');
    }
    
    if (burnAchievements.tokens >= 10 && !burnAchievements.achievements.includes('Getting Warmer')) {
      showAchievement('Getting Warmer', 'You\'ve burned 10 tokens!');
    }
    
    if (burnAchievements.tokens >= 25 && !burnAchievements.achievements.includes('Burn Baby Burn')) {
      showAchievement('Burn Baby Burn', 'You\'ve burned 25 tokens!');
    }
    
    if (burnAchievements.tokens >= 50 && !burnAchievements.achievements.includes('Crypto Incinerator')) {
      showAchievement('Crypto Incinerator', 'You\'ve burned 50 tokens! The blockchain thanks you.');
    }
    
    if (burnAchievements.tokens >= 100 && !burnAchievements.achievements.includes('Token Terminator')) {
      showAchievement('Token Terminator', 'You\'ve burned 100 tokens! You\'re a legend!');
    }
  } 
  else if (type === 'nft') {
    burnAchievements.nfts += value;
    
    // NFT burning achievements
    if (burnAchievements.nfts >= 1 && !burnAchievements.achievements.includes('NFT Burner')) {
      showAchievement('NFT Burner', 'You burned your first NFT!');
    }
    
    if (burnAchievements.nfts >= 5 && !burnAchievements.achievements.includes('NFT Cleanser')) {
      showAchievement('NFT Cleanser', 'You\'ve burned 5 NFTs!');
    }
    
    if (burnAchievements.nfts >= 10 && !burnAchievements.achievements.includes('Digital Art Destroyer')) {
      showAchievement('Digital Art Destroyer', 'You\'ve burned 10 NFTs! You\'re an anti-collector!');
    }
  }
  else if (type === 'value') {
    burnAchievements.value += value;
    
    // Value-based achievements
    if (burnAchievements.value >= 1 && !burnAchievements.achievements.includes('Small Sacrifice')) {
      showAchievement('Small Sacrifice', 'You\'ve burned tokens worth approximately 1 SOL!');
    }
    
    if (burnAchievements.value >= 10 && !burnAchievements.achievements.includes('Generous Burner')) {
      showAchievement('Generous Burner', 'You\'ve burned tokens worth approximately 10 SOL!');
    }
    
    if (burnAchievements.value >= 100 && !burnAchievements.achievements.includes('Whale Burner')) {
      showAchievement('Whale Burner', 'You\'ve burned tokens worth approximately 100 SOL! You\'re cleaning up the ecosystem!');
    }
  }
  
  // Update progress tracker
  const level = Math.floor(burnAchievements.tokens / 10) + 1;
  const progress = burnAchievements.tokens % 10;
  updateProgress(progress, 10, level);
  
  // Update stats display
  const tokensBurned = document.querySelector('.stats-value.tokens');
  const nftsBurned = document.querySelector('.stats-value.nfts');
  const valueBurned = document.querySelector('.stats-value.value');
  
  if (tokensBurned) tokensBurned.textContent = burnAchievements.tokens;
  if (nftsBurned) nftsBurned.textContent = burnAchievements.nfts;
  if (valueBurned) valueBurned.textContent = burnAchievements.value.toFixed(2);
  
  // Save to localStorage
  saveAchievements();
}

// Initialize UI enhancements
function initUIEnhancements() {
  console.log('Initializing UI enhancements');
  
  // Create UI elements for stats tracking
  const container = document.querySelector('.app-container');
  if (!container) return;
  
  // Check if stats panel already exists
  if (document.querySelector('.stats-panel')) return;
  
  // Create stats panel
  const statsPanel = document.createElement('div');
  statsPanel.className = 'stats-panel';
  
  // Create dark mode toggle
  const darkModeToggle = document.createElement('button');
  darkModeToggle.id = 'dark-mode-toggle';
  darkModeToggle.className = 'dark-mode-toggle';
  darkModeToggle.textContent = '🌙 Dark Mode';
  darkModeToggle.addEventListener('click', toggleDarkMode);
  
  // Add stats content
  statsPanel.innerHTML = `
    <h3 class="stats-title">Your Burn Stats</h3>
    <div class="stats-grid">
      <div class="stats-item">
        <span class="stats-label">Tokens Burned</span>
        <span class="stats-value tokens">0</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">NFTs Burned</span>
        <span class="stats-value nfts">0</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">Est. Value (SOL)</span>
        <span class="stats-value value">0.00</span>
      </div>
    </div>
    <div class="progress-container">
      <div class="progress-header">
        <span class="burner-level">Level 1</span>
        <span class="progress-percent">0%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-inner"></div>
      </div>
    </div>
    <div class="achievements-preview">
      <h4>Recent Achievements</h4>
      <div class="achievements-list">
        <p class="no-achievements">Complete actions to earn achievements!</p>
      </div>
    </div>
  `;
  
  // Insert UI elements
  document.body.appendChild(darkModeToggle);
  container.appendChild(statsPanel);
  
  // Load saved dark mode preference
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
    darkModeToggle.textContent = '☀️ Light Mode';
  }
  
  // Load saved achievements
  loadAchievements();
  
  // Update achievements list
  const achievementsList = document.querySelector('.achievements-list');
  const noAchievements = document.querySelector('.no-achievements');
  
  if (achievementsList && burnAchievements.achievements.length > 0) {
    if (noAchievements) noAchievements.remove();
    
    // Show the last 3 achievements
    const recentAchievements = burnAchievements.achievements.slice(-3);
    recentAchievements.forEach(achievement => {
      const achievementItem = document.createElement('div');
      achievementItem.className = 'achievement-item';
      achievementItem.innerHTML = `<span class="achievement-icon">🏆</span> ${achievement}`;
      achievementsList.appendChild(achievementItem);
    });
  }
}

// Add CSS for animations if it doesn't exist
function addAnimationStyles() {
  if (document.getElementById('burn-animations-css')) return;
  
  const style = document.createElement('style');
  style.id = 'burn-animations-css';
  style.textContent = `
    /* Confetti Animation */
    .confetti {
      position: fixed;
      z-index: 1000;
      animation: confetti-fall linear forwards;
      pointer-events: none;
    }
    
    @keyframes confetti-fall {
      0% {
        transform: translateY(0) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translateY(100vh) rotate(720deg);
        opacity: 0;
      }
    }
    
    /* Burn Animation */
    .burning {
      position: relative;
      overflow: hidden;
      animation: burn-shake 0.5s ease-in-out infinite;
    }
    
    .burn-flame {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 60%;
      background: linear-gradient(to top, #ff4500, #ffa500, transparent);
      animation: flame-rise 1.5s ease-in-out forwards;
      z-index: 10;
      opacity: 0.7;
      pointer-events: none;
    }
    
    .ember {
      position: absolute;
      width: 5px;
      height: 5px;
      background-color: #ff4500;
      border-radius: 50%;
      bottom: 0;
      z-index: 11;
      animation: ember-rise ease-out forwards;
      pointer-events: none;
    }
    
    @keyframes flame-rise {
      0% {
        height: 0;
        opacity: 0.7;
      }
      50% {
        height: 80%;
        opacity: 0.9;
      }
      100% {
        height: 100%;
        opacity: 0;
      }
    }
    
    @keyframes ember-rise {
      0% {
        transform: translateY(0) translateX(0);
        opacity: 1;
      }
      100% {
        transform: translateY(-100px) translateX(calc(50px - 100px * var(--random, 0.5)));
        opacity: 0;
      }
    }
    
    @keyframes burn-shake {
      0% {
        transform: translateX(0);
      }
      25% {
        transform: translateX(-3px);
      }
      50% {
        transform: translateX(3px);
      }
      75% {
        transform: translateX(-3px);
      }
      100% {
        transform: translateX(0);
      }
    }
    
    .burned {
      opacity: 0;
      transform: scale(0.9);
      transition: opacity 0.5s ease-out, transform 0.5s ease-out;
    }
    
    /* Achievement Popup */
    .achievement-popup {
      position: fixed;
      bottom: -100px;
      right: 20px;
      background-color: #2c2f36;
      color: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 15px;
      z-index: 1000;
      transition: bottom 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      max-width: 350px;
    }
    
    .achievement-popup.show {
      bottom: 20px;
    }
    
    .achievement-trophy {
      font-size: 2.5rem;
      animation: trophy-pulse 1s infinite alternate;
    }
    
    .achievement-title {
      margin: 0 0 5px 0;
      color: #ffd700;
    }
    
    .achievement-description {
      margin: 0;
      font-size: 0.9rem;
      opacity: 0.9;
    }
    
    @keyframes trophy-pulse {
      0% {
        transform: scale(1);
      }
      100% {
        transform: scale(1.1);
      }
    }
    
    /* Stats Panel */
    .stats-panel {
      background-color: rgba(255, 255, 255, 0.9);
      border-radius: 10px;
      padding: 15px;
      margin: 15px 0;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
    }
    
    .dark-mode .stats-panel {
      background-color: rgba(40, 44, 52, 0.9);
      color: white;
    }
    
    .stats-title {
      margin-top: 0;
      margin-bottom: 15px;
      text-align: center;
      font-size: 1.2rem;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .stats-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px;
      border-radius: 8px;
      background-color: rgba(0, 0, 0, 0.05);
    }
    
    .dark-mode .stats-item {
      background-color: rgba(255, 255, 255, 0.05);
    }
    
    .stats-label {
      font-size: 0.8rem;
      opacity: 0.7;
    }
    
    .stats-value {
      font-size: 1.5rem;
      font-weight: bold;
    }
    
    .progress-container {
      margin-bottom: 15px;
    }
    
    .progress-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    
    .burner-level {
      font-weight: bold;
    }
    
    .progress-bar {
      height: 10px;
      background-color: rgba(0, 0, 0, 0.1);
      border-radius: 5px;
      overflow: hidden;
    }
    
    .dark-mode .progress-bar {
      background-color: rgba(255, 255, 255, 0.1);
    }
    
    .progress-bar-inner {
      height: 100%;
      background: linear-gradient(to right, #ff4500, #ffa500);
      width: 0%;
      transition: width 0.5s ease-out;
    }
    
    .achievements-preview {
      border-top: 1px solid rgba(0, 0, 0, 0.1);
      padding-top: 10px;
    }
    
    .dark-mode .achievements-preview {
      border-top-color: rgba(255, 255, 255, 0.1);
    }
    
    .achievements-preview h4 {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 1rem;
    }
    
    .achievements-list {
      max-height: 100px;
      overflow-y: auto;
    }
    
    .achievement-item {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 5px;
      padding: 5px;
      border-radius: 4px;
      background-color: rgba(0, 0, 0, 0.05);
    }
    
    .dark-mode .achievement-item {
      background-color: rgba(255, 255, 255, 0.05);
    }
    
    .achievement-icon {
      font-size: 1rem;
    }
    
    .no-achievements {
      opacity: 0.7;
      font-style: italic;
      font-size: 0.9rem;
    }
    
    /* Dark Mode Toggle */
    .dark-mode-toggle {
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: #2c2f36;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 15px;
      cursor: pointer;
      z-index: 100;
      transition: background-color 0.3s;
    }
    
    .dark-mode-toggle:hover {
      background-color: #424242;
    }
    
    .dark-mode .dark-mode-toggle {
      background-color: #f0f0f0;
      color: #2c2f36;
    }
    
    /* Dark Mode */
    .dark-mode {
      background-color: #1a1d23;
      color: white;
    }
    
    .dark-mode .app-container {
      background-color: #282c34;
    }
    
    .dark-mode .asset-card {
      background-color: #3a3f4b;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    }
    
    .dark-mode .burn-button {
      background-color: #ff4500;
    }
    
    .dark-mode .wallet-adapter-button {
      background-color: #4e44ce;
    }
    
    .dark-mode .loading-message,
    .dark-mode .error-message,
    .dark-mode .connect-message {
      color: white;
    }
    
    /* Loading Spinner */
    .loading-spinner {
      width: 30px;
      height: 30px;
      border: 3px solid rgba(0, 0, 0, 0.1);
      border-top-color: #ff4500;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 15px auto;
    }
    
    .dark-mode .loading-spinner {
      border-color: rgba(255, 255, 255, 0.1);
      border-top-color: #ff4500;
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    
    /* Media Queries for Responsiveness */
    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: 1fr 1fr;
      }
      
      .achievement-popup {
        max-width: 300px;
        right: 10px;
      }
      
      .dark-mode-toggle {
        top: 10px;
        right: 10px;
        padding: 5px 10px;
      }
    }
    
    @media (max-width: 480px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
      
      .achievement-popup {
        left: 10px;
        right: 10px;
        max-width: none;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded, initializing animations');
  addAnimationStyles();
  
  // Wait for app container to be created
  const checkForAppContainer = setInterval(() => {
    if (document.querySelector('.app-container')) {
      clearInterval(checkForAppContainer);
      initUIEnhancements();
    }
  }, 100);
});

// Global access for components to use animations
window.BurnAnimations = {
  createConfetti,
  toggleDarkMode,
  applyBurnAnimation,
  showAchievement,
  updateProgress,
  checkAchievements,
  initUIEnhancements
};

// Export for direct import in other files
export {
  createConfetti,
  toggleDarkMode,
  applyBurnAnimation,
  showAchievement,
  updateProgress,
  checkAchievements,
  initUIEnhancements
};