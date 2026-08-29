// Dark mode toggle with system theme detection and view transition
(function() {
  'use strict';

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getCurrentTheme() {
    return localStorage.getItem('theme') || getSystemTheme();
  }

  // Applying a theme deliberately does NOT persist it. An absent 'theme' key is
  // meaningful: it says "follow the system". Writing the system-derived theme on
  // load would pin the site to whatever the OS happened to be on the first visit,
  // and the listener below would never fire again. Only an explicit toggle stores
  // anything.
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    // Must track --bg in _sass/jekyll-theme-minimal.scss.
    if (meta) meta.content = theme === 'dark' ? '#0f0e0d' : '#faf4ed';
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

  function getLogoCircle() {
    var logo = document.querySelector('.site-logo');
    if (!logo) return { x: 0, y: 0, r: 0 };
    var rect = logo.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      r: rect.width / 2
    };
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';

    localStorage.setItem('theme', next);

    if (!document.startViewTransition ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyTheme(next);
      updateToggleIcon(next);
      return;
    }

    // The wipe starts at the avatar's own radius rather than at zero. The avatar
    // is an opaque photo that looks all but identical in either theme, so a
    // circle that begins in the middle of it is invisible until it clears the
    // rim — which reads as the wipe starting off to the side of the avatar
    // rather than at it. Beginning at the rim makes the whole animation visible.
    var logo = getLogoCircle();
    var maxDistance = Math.hypot(
      Math.max(logo.x, window.innerWidth - logo.x),
      Math.max(logo.y, window.innerHeight - logo.y)
    );

    // The wipe itself is the ::view-transition-* animation in
    // _sass/jekyll-theme-minimal.scss; all this does is hand it the geometry and
    // say which direction we are going.
    //
    // The geometry goes over as percentages, never pixels. On a HiDPI display
    // Chrome paints the wipe's clip-path with pixel lengths read as *device*
    // pixels, which puts the circle at 1/dpr of the intended centre and radius —
    // on a 2x screen it opens from half-way up and left of the avatar, at half
    // the size. Percentages resolve against the pseudo-element's own box, so
    // they land in the same place whichever unit that box is measured in, and
    // they stay correct on browsers that get it right.
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    // Per css-shapes, a <percentage> radius for circle() resolves against
    // sqrt(w^2 + h^2) / sqrt(2) of the reference box.
    var refR = Math.hypot(vw, vh) / Math.SQRT2;

    var root = document.documentElement;
    root.style.setProperty('--vt-x', (logo.x / vw * 100) + '%');
    root.style.setProperty('--vt-y', (logo.y / vh * 100) + '%');
    root.style.setProperty('--vt-r0', (logo.r / refR * 100) + '%');
    root.style.setProperty('--vt-r', (maxDistance / refR * 100) + '%');
    root.classList.toggle('dark-transition', next === 'dark');

    var transition = document.startViewTransition(function() {
      applyTheme(next);
      updateToggleIcon(next);
    });

    transition.finished.finally(function() {
      root.classList.remove('dark-transition');
    });
  }

  // The toggle's border is a circle run through the #squiggle turbulence filter
  // in _layouts/default.html. Re-seeding it here means the ring is drawn afresh
  // on every page view rather than being one fixed shape — same hand, never
  // quite the same circle. Changing the attribute invalidates the filter, so
  // the ring below picks it up on its first paint.
  //
  // If the filter is missing for any reason this does nothing and the button
  // keeps the plain circular border the stylesheet gives it.
  function reseedRing() {
    var noise = document.querySelector('#squiggle feTurbulence');
    if (noise) noise.setAttribute('seed', Math.floor(Math.random() * 10000));
  }

  function createToggleButton() {
    reseedRing();

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
