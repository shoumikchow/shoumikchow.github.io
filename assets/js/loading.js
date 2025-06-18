// Loading overlay functionality
(function() {
  'use strict';

  function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 300);
    }
  }

  // Hide loading overlay when page is fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideLoadingOverlay);
  } else {
    hideLoadingOverlay();
  }

  // Also hide on window load to ensure all resources are loaded
  window.addEventListener('load', hideLoadingOverlay);
})(); 