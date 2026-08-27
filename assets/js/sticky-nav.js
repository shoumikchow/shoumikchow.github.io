// Sticky nav for narrow viewports.
//
// On wide screens the header is a sticky sidebar, so the nav pills are always
// on screen. On a phone the header is a band at the top of the document and
// scrolls away with everything else, taking navigation with it. This puts it
// back: once the real nav clears the top of the viewport, a compact bar drops
// in carrying the same four links.
//
// The bar is a duplicate of markup that is already in the document, so it is
// hidden from assistive tech and kept out of the tab order — the canonical nav
// in the header remains the one that gets announced and focused. This is a
// pointer affordance, nothing more.
//
// Whether the bar is allowed to appear at all is CSS's decision, not this
// file's: the class goes on <html> at every width and the stylesheet only acts
// on it at phone widths. So rotating a phone or dragging a desktop window
// across the breakpoint needs no listener here and cannot leave the two out of
// step.
(function() {
  'use strict';

  function buildBar(nav) {
    const bar = document.createElement('div');
    bar.className = 'sticky-nav';
    bar.setAttribute('aria-hidden', 'true');

    const list = document.createElement('ul');
    const links = nav.querySelectorAll('.nav-list a');

    links.forEach(function(source, i) {
      const item = document.createElement('li');
      // Drives the entrance stagger. Set here rather than with :nth-child so
      // the count is not baked into the stylesheet.
      item.style.setProperty('--i', i);

      const link = document.createElement('a');
      link.href = source.getAttribute('href');
      link.textContent = source.textContent;
      link.tabIndex = -1;
      if (source.classList.contains('active')) {
        link.className = 'active';
      }

      item.appendChild(link);
      list.appendChild(item);
    });

    bar.appendChild(list);
    return bar;
  }

  function init() {
    const nav = document.querySelector('.main-nav');
    // 404 and any page without the header nav simply opts out.
    if (!nav || !('IntersectionObserver' in window)) return;

    document.body.appendChild(buildBar(nav));

    // The bar's own height, read from the stylesheet so the two cannot drift.
    const barHeight = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--sticky-nav-h'),
      10
    ) || 56;

    const observer = new IntersectionObserver(function(entries) {
      document.documentElement.classList.toggle('nav-stuck', !entries[0].isIntersecting);
    }, {
      // Shrinking the root's top edge by the bar's height hands over cleanly in
      // both directions: the bar arrives as the real nav slides under where the
      // bar will be, and leaves only once the real nav is clear of it again.
      // With a plain 0 margin the two would trade places across a 56px band in
      // which the nav is technically on screen but sitting behind the bar.
      rootMargin: '-' + barHeight + 'px 0px 0px 0px',
      threshold: 0
    });

    observer.observe(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
