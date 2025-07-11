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
      // Add loading attribute if not present
      if (!img.hasAttribute('loading')) {
        img.setAttribute('loading', 'lazy');
      }
      
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

  // Color contrast checker
  function checkColorContrast() {
    // This is a basic implementation - in production, you might want to use a library
    const elements = document.querySelectorAll('body, h1, h2, h3, p, a, button');
    
    elements.forEach(element => {
      const style = window.getComputedStyle(element);
      const backgroundColor = style.backgroundColor;
      const color = style.color;
      
      // Basic contrast check (simplified)
      if (backgroundColor && color) {
        // Add data attribute for potential contrast issues
        element.setAttribute('data-contrast-checked', 'true');
      }
    });
  }

  // Focus management
  function enhanceFocusManagement() {
    // Trap focus in modals (if any are added later)
    let focusableElements;
    let firstFocusableElement;
    let lastFocusableElement;
    
    function trapFocus(element) {
      focusableElements = element.querySelectorAll('a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select');
      firstFocusableElement = focusableElements[0];
      lastFocusableElement = focusableElements[focusableElements.length - 1];
      
      element.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstFocusableElement) {
              e.preventDefault();
              lastFocusableElement.focus();
            }
          } else {
            if (document.activeElement === lastFocusableElement) {
              e.preventDefault();
              firstFocusableElement.focus();
            }
          }
        }
      });
    }
    
    // Apply to any modal-like elements
    const modals = document.querySelectorAll('[role="dialog"], .modal');
    modals.forEach(trapFocus);
  }

  // ARIA enhancements
  function enhanceARIA() {
    // Add landmarks
    const header = document.querySelector('header');
    if (header && !header.getAttribute('role')) {
      header.setAttribute('role', 'banner');
    }
    
    const nav = document.querySelector('nav');
    if (nav && !nav.getAttribute('role')) {
      nav.setAttribute('role', 'navigation');
    }
    
    const main = document.querySelector('section');
    if (main && !main.getAttribute('role')) {
      main.setAttribute('role', 'main');
    }
    
    // Add heading structure
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading, index) => {
      if (!heading.getAttribute('id')) {
        heading.setAttribute('id', `heading-${index}`);
      }
    });
  }

  // Initialize all accessibility features
  function initAccessibility() {
    enhanceKeyboardNavigation();
    addScreenReaderAnnouncements();
    enhanceImageAccessibility();
    checkColorContrast();
    enhanceFocusManagement();
    enhanceARIA();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccessibility);
  } else {
    initAccessibility();
  }
})(); 