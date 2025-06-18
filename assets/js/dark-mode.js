// Dark mode toggle functionality
(function() {
  'use strict';

  // Check for saved theme preference or default to 'light'
  const currentTheme = localStorage.getItem('theme') || 'light';
  
  // Apply the theme on page load
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Create toggle button
  function createToggleButton() {
    const toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle dark mode');
    toggle.setAttribute('title', 'Toggle dark mode');
    
    // Add sun/moon icon
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.innerHTML = currentTheme === 'dark' ? '☀️' : '🌙';
    toggle.appendChild(icon);
    
    // Add click event
    toggle.addEventListener('click', function() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      // Update theme
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      
      // Update icon
      icon.innerHTML = newTheme === 'dark' ? '☀️' : '🌙';
    });
    
    return toggle;
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