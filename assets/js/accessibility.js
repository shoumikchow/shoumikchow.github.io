// Accessibility Enhancements
(function() {
  'use strict';

  // Enhanced keyboard navigation
  function enhanceKeyboardNavigation() {
    // Add focus indicators
    const focusableElements = document.querySelectorAll('a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])');

    focusableElements.forEach(element => {
      element.addEventListener('focus', function() {
        this.classList.add('focus-visible');
      });

      element.addEventListener('blur', function() {
        this.classList.remove('focus-visible');
      });
    });

    // Handle keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      // Alt + 1: Go to home
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        window.location.href = '/';
      }

      // Alt + 2: Go to experience
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        window.location.href = '/experience.html';
      }

      // Alt + 3: Go to research
      if (e.altKey && e.key === '3') {
        e.preventDefault();
        window.location.href = '/research.html';
      }

      // Alt + 4: Go to projects
      if (e.altKey && e.key === '4') {
        e.preventDefault();
        window.location.href = '/projects.html';
      }

      // Alt + 5: Go to about
      if (e.altKey && e.key === '5') {
        e.preventDefault();
        window.location.href = '/about.html';
      }

      // Alt + T: Toggle theme
      if (e.altKey && e.key === 't') {
        e.preventDefault();
        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle) {
          themeToggle.click();
        }
      }
    });
  }

  // Screen reader announcements
  function addScreenReaderAnnouncements() {
    // Create announcement container
    const announcementContainer = document.createElement('div');
    announcementContainer.setAttribute('aria-live', 'polite');
    announcementContainer.setAttribute('aria-atomic', 'true');
    announcementContainer.className = 'sr-only';
    document.body.appendChild(announcementContainer);

    // Function to announce to screen readers
    window.announceToScreenReader = function(message) {
      announcementContainer.textContent = message;
      setTimeout(() => {
        announcementContainer.textContent = '';
      }, 1000);
    };
  }

  // Enhanced image accessibility
  function enhanceImageAccessibility() {
    const images = document.querySelectorAll('img');

    images.forEach(img => {
      // Ensure all images have alt text
      if (!img.hasAttribute('alt')) {
        img.setAttribute('alt', 'Image');
      }

      // Add role for decorative images
      if (img.alt === '' || img.alt === 'Image') {
        img.setAttribute('role', 'presentation');
      }
    });
  }

  // Initialize all accessibility features
  function initAccessibility() {
    enhanceKeyboardNavigation();
    addScreenReaderAnnouncements();
    enhanceImageAccessibility();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccessibility);
  } else {
    initAccessibility();
  }
})();
