// A short message at the foot of the screen that goes away on its own:
// "Copied" from the palette's copy actions, and the Konami code's line
// (fun.js). One at a time; a new one replaces whatever is showing. Also read
// out, through the page's live region, for anyone who cannot see it.
(function () {
  var timer = null;

  window.siteToast = function (text) {
    var old = document.querySelector('.site-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'site-toast';
    el.textContent = text;
    document.body.appendChild(el);
    if (window.announceToScreenReader) window.announceToScreenReader(text);
    clearTimeout(timer);
    timer = setTimeout(function () { el.remove(); }, 2800);
  };
})();
