// Dark mode toggle with system theme detection and view transition
(function() {
  'use strict';

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getCurrentTheme() {
    return localStorage.getItem('theme') || getSystemTheme();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0d0d0d' : '#fafafa';
  }

  var initialTheme = getCurrentTheme();
  applyTheme(initialTheme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
    if (!localStorage.getItem('theme')) {
      var newTheme = e.matches ? 'dark' : 'light';
      applyTheme(newTheme);
      updateToggleIcon(newTheme);
    }
  });

  function getIcon(theme) {
    if (theme === 'dark') {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    }
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  function updateToggleIcon(theme) {
    var icon = document.querySelector('.theme-toggle .icon');
    if (icon) icon.innerHTML = getIcon(theme);
  }

  function getLogoCenter() {
    var logo = document.querySelector('.site-logo');
    if (!logo) return { x: 0, y: 0 };
    var rect = logo.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';

    if (!document.startViewTransition) {
      applyTheme(next);
      updateToggleIcon(next);
      return;
    }

    var center = getLogoCenter();
    var maxDistance = Math.hypot(
      Math.max(center.x, window.innerWidth - center.x),
      Math.max(center.y, window.innerHeight - center.y)
    );

    var goingDark = next === 'dark';

    document.documentElement.style.setProperty('--vt-x', center.x + 'px');
    document.documentElement.style.setProperty('--vt-y', center.y + 'px');

    if (goingDark) {
      document.documentElement.classList.add('dark-transition');
    }

    var transition = document.startViewTransition(function() {
      applyTheme(next);
      updateToggleIcon(next);
    });

    transition.finished.then(function() {
      document.documentElement.classList.remove('dark-transition');
    });

    transition.ready.then(function() {
      if (goingDark) {
        // Light shrinks into the logo
        document.documentElement.animate(
          {
            clipPath: [
              'circle(' + maxDistance + 'px at ' + center.x + 'px ' + center.y + 'px)',
              'circle(0px at ' + center.x + 'px ' + center.y + 'px)'
            ]
          },
          {
            duration: 350,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-old(root)',
            fill: 'forwards'
          }
        );
      } else {
        // Light expands from the logo
        document.documentElement.animate(
          {
            clipPath: [
              'circle(0px at ' + center.x + 'px ' + center.y + 'px)',
              'circle(' + maxDistance + 'px at ' + center.x + 'px ' + center.y + 'px)'
            ]
          },
          {
            duration: 350,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
            fill: 'forwards'
          }
        );
      }
    });
  }

  function createToggleButton() {
    var toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle dark mode');

    var icon = document.createElement('span');
    icon.className = 'icon';
    icon.innerHTML = getIcon(initialTheme);
    toggle.appendChild(icon);

    toggle.addEventListener('click', toggleTheme);

    return toggle;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      document.body.appendChild(createToggleButton());
    });
  } else {
    document.body.appendChild(createToggleButton());
  }
})();
