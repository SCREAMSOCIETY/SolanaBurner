/**
 * cNFT View-Only Mode
 * 
 * This script makes compressed NFTs (cNFTs) view-only by disabling transfer buttons
 * and adding clear indicators that these assets are for viewing purposes only.
 * This prevents transfer issues and user confusion.
 */

(function() {
  console.log('[cNFT View-Only] Initializing view-only mode for compressed NFTs');

  function makeComressedNFTsViewOnly() {
    // Find all cNFT transfer/burn buttons
    const cnftButtons = document.querySelectorAll(
      '.trash-button.cnft, .burn-button.cnft, [data-action="trash"][data-compressed="true"], [data-action="burn-cnft"], .cnft .trash-button, .cnft .burn-button'
    );
    
    console.log(`[cNFT View-Only] Found ${cnftButtons.length} cNFT buttons to disable`);
    
    cnftButtons.forEach(button => {
      // Disable the button
      button.disabled = true;
      button.style.opacity = '0.5';
      button.style.cursor = 'not-allowed';
      
      // Change button text/content to indicate view-only
      if (button.textContent.includes('🗑️') || button.textContent.includes('Burn')) {
        button.textContent = '👁️ View Only';
        button.title = 'Compressed NFTs are view-only in this application';
      }
      
      // Remove all click handlers
      button.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Show informative message
        if (window.BurnAnimations?.showNotification) {
          window.BurnAnimations.showNotification(
            "View Only",
            "Compressed NFTs are currently view-only. Transfer functionality is disabled to prevent issues.",
            "info"
          );
        } else {
          alert('Compressed NFTs are view-only in this application. Transfer functionality is disabled to prevent transaction issues.');
        }
        
        return false;
      };
      
      // Add visual indicator class
      button.classList.add('view-only', 'cnft-disabled');
    });
    
    // Find cNFT containers and add view-only indicators
    const cnftContainers = document.querySelectorAll('.cnft, [data-compressed="true"]');
    cnftContainers.forEach(container => {
      // Add a view-only badge if it doesn't exist
      if (!container.querySelector('.view-only-badge')) {
        const badge = document.createElement('div');
        badge.className = 'view-only-badge';
        badge.innerHTML = '👁️ View Only';
        badge.style.cssText = `
          position: absolute;
          top: 5px;
          right: 5px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          z-index: 10;
          pointer-events: none;
        `;
        
        // Make sure container is positioned relative
        if (getComputedStyle(container).position === 'static') {
          container.style.position = 'relative';
        }
        
        container.appendChild(badge);
      }
    });
  }

  // Function to add CSS for view-only styling
  function addViewOnlyStyles() {
    if (document.getElementById('cnft-view-only-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'cnft-view-only-styles';
    style.textContent = `
      .cnft-disabled {
        background-color: #666 !important;
        border-color: #666 !important;
      }
      
      .cnft-disabled:hover {
        background-color: #777 !important;
      }
      
      .view-only-badge {
        font-family: system-ui, -apple-system, sans-serif;
        font-weight: 500;
      }
      
      .cnft .nft-card {
        opacity: 0.9;
      }
      
      .cnft .nft-card::after {
        content: "Compressed NFT - View Only";
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(transparent, rgba(0,0,0,0.8));
        color: white;
        text-align: center;
        padding: 8px;
        font-size: 11px;
        font-weight: 500;
      }
    `;
    
    document.head.appendChild(style);
  }

  // Initialize view-only mode
  function initViewOnlyMode() {
    addViewOnlyStyles();
    makeComressedNFTsViewOnly();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initViewOnlyMode);
  } else {
    initViewOnlyMode();
  }

  // Run periodically to catch dynamically added cNFTs
  setInterval(makeComressedNFTsViewOnly, 3000);

  // Also run when new content is loaded
  const observer = new MutationObserver(function(mutations) {
    let shouldCheck = false;
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldCheck = true;
      }
    });
    
    if (shouldCheck) {
      setTimeout(makeComressedNFTsViewOnly, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[cNFT View-Only] Module initialized successfully');
})();