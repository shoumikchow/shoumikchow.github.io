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

    document.addEventListener('keydown', function(e) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Option+letter types a character into a field on a Mac (⌥T is "†"),
      // so a field keeps its keys. The palette's own field is the exception,
      // and handles them itself before they get here; see palette.js.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (window.siteShortcuts.run(e.code)) e.preventDefault();
    });
  }

  // ⌥1–⌥5 for the pages and ⌥T for the theme. One list, read by both the
  // handler above and the ⌘K palette, which shows each as a hotkey on its row.
  //
  // Matched on e.code (the physical key), never e.key. On a Mac, Option
  // changes the character a key types: ⌥1 arrives as e.key "¡" and ⌥T as
  // "†", so the e.key checks that used to be here never fired on a Mac at all.
  //
  // The pages are read from the header in order (the name, then the nav), so
  // the numbers follow site.pagelist rather than a second hand-kept list of
  // URLs, which is what this used to be and how it came to point at .html
  // paths the nav no longer uses.
  function buildShortcuts() {
    const home = document.querySelector('.site-name a');
    const links = [home].concat(Array.from(document.querySelectorAll('.nav-list a')));
    const pages = [];
    links.forEach(function(a) {
      if (!a || pages.length >= 9) return;
      const n = pages.length + 1;
      pages.push({
        code: 'Digit' + n,
        key: String(n),
        label: a === home ? 'Home' : a.textContent.trim(),
        href: a.getAttribute('href')
      });
    });

    const byCode = {};
    pages.forEach(function(p) {
      byCode[p.code] = function() { window.location.href = p.href; };
    });
    byCode.KeyT = function() {
      const toggle = document.querySelector('.theme-toggle');
      if (toggle) toggle.click();
    };

    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

    window.siteShortcuts = {
      pages: pages,
      // How a shortcut is written for this platform: "⌥3" or "Alt+3".
      label: function(key) { return (mac ? '⌥' : 'Alt+') + key.toUpperCase(); },
      has: function(code) { return !!byCode[code]; },
      // Runs the shortcut for a physical key; false if there is none.
      run: function(code) {
        if (!byCode[code]) return false;
        byCode[code]();
        return true;
      }
    };
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
    buildShortcuts();
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
