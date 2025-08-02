// Dark mode toggle functionality with system theme detection
(function() {
  'use strict';

  // Function to get system theme preference
  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Function to get current theme (prioritize saved preference, fallback to system)
  function getCurrentTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme;
    }
    return getSystemTheme();
  }

  // Function to apply theme
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  // Initialize theme on page load
  const initialTheme = getCurrentTheme();
  applyTheme(initialTheme);

  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', function(e) {
    // Only apply system theme if user hasn't manually set a preference
    if (!localStorage.getItem('theme')) {
      const newTheme = e.matches ? 'dark' : 'light';
      applyTheme(newTheme);
      updateToggleIcon(newTheme);
    }
  });

  // Create toggle button
  function createToggleButton() {
    const toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle dark mode');
    toggle.setAttribute('title', 'Toggle dark mode');
    
    // Add sun/moon icon
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.innerHTML = initialTheme === 'dark' ? '☀️' : '🌙';
    toggle.appendChild(icon);
    
    // Add click event
    toggle.addEventListener('click', function() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      // Update theme
      applyTheme(newTheme);
      
      // Update icon
      updateToggleIcon(newTheme);
    });
    
    return toggle;
  }

  // Function to update toggle icon
  function updateToggleIcon(theme) {
    const icon = document.querySelector('.theme-toggle .icon');
    if (icon) {
      icon.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  // Add toggle button to page when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      document.body.appendChild(createToggleButton());
    });
  } else {
    document.body.appendChild(createToggleButton());
  }
})(); 