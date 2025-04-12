/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
/*!*********************************!*\
  !*** ./static/js/animations.js ***!
  \*********************************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   applyBurnAnimation: () => (/* binding */ applyBurnAnimation),
/* harmony export */   checkAchievements: () => (/* binding */ checkAchievements),
/* harmony export */   createConfetti: () => (/* binding */ createConfetti),
/* harmony export */   initUIEnhancements: () => (/* binding */ initUIEnhancements),
/* harmony export */   showAchievement: () => (/* binding */ showAchievement),
/* harmony export */   toggleDarkMode: () => (/* binding */ toggleDarkMode),
/* harmony export */   updateProgress: () => (/* binding */ updateProgress)
/* harmony export */ });
/**
 * Animations and UI enhancements for the Burn Token Application
 */

// Create confetti effect when successfully burning tokens/NFTs
function createConfetti() {
  const confettiContainer = document.createElement('div');
  confettiContainer.className = 'confetti-container';
  document.body.appendChild(confettiContainer);
  
  const colors = ['#FF5252', '#FFD740', '#00C853', '#448AFF', '#E040FB', '#FF6E40'];
  
  for (let i = 0; i < 150; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
    confetti.style.animationDelay = Math.random() * 2 + 's';
    confettiContainer.appendChild(confetti);
  }
  
  // Remove confetti after animation completes
  setTimeout(() => {
    confettiContainer.remove();
  }, 5000);
}

// Toggle dark mode theme
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDarkMode = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDarkMode);
}

// Apply burn animation to an element
function applyBurnAnimation(element) {
  if (!element) return;
  
  // Create burn overlay
  const burnOverlay = document.createElement('div');
  burnOverlay.className = 'burn-overlay';
  element.appendChild(burnOverlay);
  
  // Add burn effect class
  element.classList.add('burning');
  
  // Add ember particles
  for (let i = 0; i < 25; i++) {
    const ember = document.createElement('div');
    ember.className = 'ember';
    ember.style.left = Math.random() * 100 + '%';
    ember.style.animationDuration = (Math.random() * 2 + 1) + 's';
    ember.style.animationDelay = Math.random() + 's';
    burnOverlay.appendChild(ember);
  }
  
  // Remove the element after animation completes
  setTimeout(() => {
    element.classList.add('burned');
    
    // Fade out and remove
    setTimeout(() => {
      element.style.height = element.offsetHeight + 'px';
      element.style.opacity = '0';
      
      setTimeout(() => {
        try {
          element.parentNode.removeChild(element);
        } catch (e) {
          console.warn('Element already removed from DOM');
        }
      }, 500);
    }, 1000);
  }, 2000);
}

// Show achievement notification
function showAchievement(title, description) {
  const achievementEl = document.createElement('div');
  achievementEl.className = 'achievement';
  achievementEl.innerHTML = `
    <div class="achievement-icon">🏆</div>
    <div class="achievement-content">
      <h3>${title}</h3>
      <p>${description}</p>
    </div>
  `;
  
  document.body.appendChild(achievementEl);
  
  // Animate in
  setTimeout(() => {
    achievementEl.classList.add('show');
  }, 100);
  
  // Animate out after 5 seconds
  setTimeout(() => {
    achievementEl.classList.remove('show');
    achievementEl.classList.add('hide');
    
    // Remove from DOM after animation
    setTimeout(() => {
      achievementEl.remove();
    }, 1000);
  }, 5000);
  
  // Save achievement
  const achievements = loadAchievements();
  achievements.push({ title, description, date: new Date().toISOString() });
  saveAchievements(achievements);
}

// Update progress bar
function updateProgress(currentVal, maxVal, level) {
  const progressBar = document.querySelector('.level-progress-bar');
  const levelEl = document.querySelector('.current-level');
  
  if (!progressBar || !levelEl) return;
  
  const progress = Math.min((currentVal / maxVal) * 100, 100);
  progressBar.style.width = progress + '%';
  levelEl.textContent = level;
}

// Save achievements to localStorage
function saveAchievements(achievements) {
  try {
    localStorage.setItem('burnAchievements', JSON.stringify(achievements));
  } catch (e) {
    console.error('Failed to save achievements:', e);
  }
}

// Load achievements from localStorage
function loadAchievements() {
  try {
    const saved = localStorage.getItem('burnAchievements');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Failed to load achievements:', e);
    return [];
  }
}

// Check for achievements based on user actions
function checkAchievements(type, value) {
  const achievements = loadAchievements();
  
  // Track stats
  let stats = JSON.parse(localStorage.getItem('burnStats') || '{}');
  stats[type] = (stats[type] || 0) + value;
  localStorage.setItem('burnStats', JSON.stringify(stats));
  
  // Define achievement thresholds
  const tokenAchievements = [
    { count: 1, title: 'Token Burner', description: 'Burned your first token' },
    { count: 5, title: 'Token Incinerator', description: 'Burned 5 tokens' },
    { count: 10, title: 'Token Destroyer', description: 'Burned 10 tokens' }
  ];
  
  const nftAchievements = [
    { count: 1, title: 'NFT Burner', description: 'Burned your first NFT' },
    { count: 3, title: 'NFT Incinerator', description: 'Burned 3 NFTs' },
    { count: 5, title: 'NFT Destroyer', description: 'Burned 5 NFTs' }
  ];
  
  const cnftAchievements = [
    { count: 1, title: 'cNFT Pioneer', description: 'Burned your first compressed NFT' },
    { count: 3, title: 'cNFT Master', description: 'Burned 3 compressed NFTs' }
  ];
  
  // Check for achievements based on type
  let relevantAchievements;
  if (type === 'tokens') {
    relevantAchievements = tokenAchievements;
  } else if (type === 'nfts') {
    relevantAchievements = nftAchievements;
  } else if (type === 'cnfts') {
    relevantAchievements = cnftAchievements;
  } else {
    return;
  }
  
  // Check if we've hit any achievement thresholds
  for (const achievement of relevantAchievements) {
    if (stats[type] >= achievement.count) {
      // Check if we already have this achievement
      const hasAchievement = achievements.some(a => 
        a.title === achievement.title && a.description === achievement.description
      );
      
      if (!hasAchievement) {
        showAchievement(achievement.title, achievement.description);
      }
    }
  }
  
  // Update progress bar if it exists
  const totalBurned = (stats.tokens || 0) + (stats.nfts || 0) + (stats.cnfts || 0);
  const level = Math.floor(totalBurned / 5) + 1;
  const nextLevel = level * 5;
  updateProgress(totalBurned % 5, 5, level);
}

// Initialize UI enhancements
function initUIEnhancements() {
  // Check for dark mode preference
  const darkModePreference = localStorage.getItem('darkMode');
  if (darkModePreference === 'true') {
    document.body.classList.add('dark-mode');
  }
  
  // Add theme toggle button if it doesn't exist
  if (!document.querySelector('.theme-toggle')) {
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.innerHTML = '🌓';
    themeToggle.title = 'Toggle Dark Mode';
    themeToggle.addEventListener('click', toggleDarkMode);
    document.body.appendChild(themeToggle);
  }
  
  // Add progress bar if it doesn't exist
  if (!document.querySelector('.level-indicator')) {
    const levelEl = document.createElement('div');
    levelEl.className = 'level-indicator';
    levelEl.innerHTML = `
      <div class="level-label">Level <span class="current-level">1</span></div>
      <div class="level-progress">
        <div class="level-progress-bar"></div>
      </div>
    `;
    document.body.appendChild(levelEl);
    
    // Initialize level progress
    const stats = JSON.parse(localStorage.getItem('burnStats') || '{}');
    const totalBurned = (stats.tokens || 0) + (stats.nfts || 0) + (stats.cnfts || 0);
    const level = Math.floor(totalBurned / 5) + 1;
    updateProgress(totalBurned % 5, 5, level);
  }
  
  // Add animation styles
  addAnimationStyles();
}

// Add animation styles if they don't exist
function addAnimationStyles() {
  if (!document.getElementById('burn-animation-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'burn-animation-styles';
    styleEl.textContent = `
      /* Confetti Animation */
      .confetti-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 9999;
      }
      
      .confetti {
        position: absolute;
        top: -10px;
        width: 10px;
        height: 10px;
        border-radius: 3px;
        animation: fall linear forwards;
      }
      
      @keyframes fall {
        0% {
          transform: translateY(0) rotate(0deg);
          opacity: 1;
        }
        70% {
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
      }
      
      .burn-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(to bottom, rgba(255, 165, 0, 0.3), rgba(255, 0, 0, 0.5));
        z-index: 2;
        animation: burn 2s forwards;
      }
      
      @keyframes burn {
        0% {
          opacity: 0;
        }
        30% {
          opacity: 0.8;
        }
        100% {
          opacity: 1;
          background: rgba(0, 0, 0, 0.9);
        }
      }
      
      .ember {
        position: absolute;
        bottom: 0;
        width: 3px;
        height: 3px;
        background-color: #ff6a00;
        border-radius: 50%;
        filter: blur(1px);
        animation: rise linear forwards;
      }
      
      @keyframes rise {
        0% {
          transform: translateY(0) scale(1);
          opacity: 1;
          background-color: #ff6a00;
        }
        75% {
          opacity: 0.7;
          background-color: #ff0000;
        }
        100% {
          transform: translateY(-100px) scale(0);
          opacity: 0;
        }
      }
      
      .burned {
        transition: all 0.5s ease;
      }
      
      /* Theme Toggle */
      .theme-toggle {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background-color: #333;
        color: #fff;
        border: none;
        font-size: 20px;
        cursor: pointer;
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
      }
      
      .theme-toggle:hover {
        transform: scale(1.1);
      }
      
      body.dark-mode {
        background-color: #121212;
        color: #f0f0f0;
      }
      
      body.dark-mode .token-card,
      body.dark-mode .nft-card {
        background-color: #1e1e1e;
        border-color: #333;
      }
      
      body.dark-mode .burn-button {
        background-color: #c62828;
      }
      
      body.dark-mode .asset-section h3 {
        color: #e0e0e0;
      }
      
      /* Achievement Notification */
      .achievement {
        position: fixed;
        bottom: 30px;
        right: -350px;
        width: 300px;
        background-color: #333;
        color: white;
        border-radius: 8px;
        padding: 15px;
        display: flex;
        align-items: center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        transition: transform 0.5s ease;
        z-index: 9999;
      }
      
      .achievement.show {
        transform: translateX(-370px);
      }
      
      .achievement.hide {
        transform: translateX(100px);
        opacity: 0;
      }
      
      .achievement-icon {
        font-size: 24px;
        margin-right: 15px;
      }
      
      .achievement-content h3 {
        margin: 0 0 5px 0;
        font-size: 16px;
      }
      
      .achievement-content p {
        margin: 0;
        font-size: 14px;
        opacity: 0.8;
      }
      
      /* Level Indicator */
      .level-indicator {
        position: fixed;
        top: 20px;
        left: 20px;
        background-color: rgba(0,0,0,0.7);
        padding: 10px 15px;
        border-radius: 20px;
        color: white;
        z-index: 100;
      }
      
      .level-label {
        font-weight: bold;
        margin-bottom: 5px;
        text-align: center;
      }
      
      .level-progress {
        width: 100px;
        height: 6px;
        background-color: rgba(255,255,255,0.2);
        border-radius: 3px;
        overflow: hidden;
      }
      
      .level-progress-bar {
        height: 100%;
        background: linear-gradient(to right, #00c6ff, #0072ff);
        width: 0%;
        transition: width 0.3s ease;
      }
    `;
    document.head.appendChild(styleEl);
  }
}

// Initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUIEnhancements);
  } else {
    initUIEnhancements();
  }
}

// Export functions for global use
if (typeof window !== 'undefined') {
  window.BurnAnimations = {
    createConfetti,
    toggleDarkMode,
    applyBurnAnimation,
    showAchievement,
    updateProgress,
    checkAchievements,
    initUIEnhancements
  };
}

// Export functions for module use

window.animations = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=animations.js.map