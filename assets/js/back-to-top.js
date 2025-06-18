// Back to top button functionality
(function() {
  'use strict';

  // Create back to top button
  function createBackToTopButton() {
    const button = document.createElement('button');
    button.className = 'back-to-top';
    button.setAttribute('aria-label', 'Back to top');
    button.setAttribute('title', 'Back to top');
    button.innerHTML = '↑';
    
    // Add click event
    button.addEventListener('click', function() {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
    
    return button;
  }

  // Show/hide button based on scroll position
  function toggleBackToTopButton() {
    const button = document.querySelector('.back-to-top');
    if (window.scrollY > 300) {
      button.classList.add('visible');
    } else {
      button.classList.remove('visible');
    }
  }

  // Add button to page when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      document.body.appendChild(createBackToTopButton());
      window.addEventListener('scroll', toggleBackToTopButton);
    });
  } else {
    document.body.appendChild(createBackToTopButton());
    window.addEventListener('scroll', toggleBackToTopButton);
  }
})(); 