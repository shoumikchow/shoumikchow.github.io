// Things that are only for fun: pretend object detection over the page, drawn
// the way bbox-visualizer draws, and the Konami code. The palette lists both
// under "Just for fun" (palette.js) through window.siteFun; the Konami code
// also works typed straight at the page.
//
// Nothing here detects anything. "Detection" is a list of selectors and the
// labels a vision model might give them, measured with getBoundingClientRect.
// The caption says so, and shows the bbox-visualizer calls that would draw
// these same boxes on a screenshot.
(function () {
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

  function announce(message) {
    if (window.announceToScreenReader) window.announceToScreenReader(message);
  }

  // ─── Object detection ───────────────────────────────────────
  // First match wins for any one element, so the specific entries come first.
  // Labels are COCO-flavoured snake_case, as the library's own examples are.
  // Left out: the social icons, packed so close their labels pile into an
  // unreadable strip, and back-to-top, which sits under the caption.
  var TARGETS = [
    ['.site-logo', 'person'],
    ['#now-music .now-poster', 'album_cover'],
    ['.now-poster-book', 'book'],
    ['#now-movie .now-poster', 'movie_poster'],
    ['.now-poster-game', 'video_game'],
    ['.now-poster-board', 'chessboard'],
    ['#content h1', 'headline'],
    ['#content h2', 'section_title'],
    ['.nav-list a', 'button'],
    ['.palette-trigger', 'magnifying_glass'],
    ['.theme-toggle', null], // sun or moon, whichever it is showing
    ['.chat-trigger', 'speech_bubble']
  ];
  var MAX_BOXES = 24;

  // Stable per label and position, so running it twice gives the same
  // answers, as a real model on the same frame would. 0.81 to 0.99.
  function confidence(label, i) {
    var h = 7;
    for (var c = 0; c < label.length; c++) h = (h * 31 + label.charCodeAt(c)) | 0;
    h = (h + i * 977) >>> 0;
    return (0.81 + (h % 19) / 100).toFixed(2);
  }

  function themeLabel() {
    // The toggle shows the theme you would switch to: a moon in light mode.
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon';
  }

  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) return false;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0;
  }

  function findObjects() {
    var seen = new Set();
    var found = [];
    TARGETS.forEach(function (t) {
      document.querySelectorAll(t[0]).forEach(function (el) {
        if (seen.has(el) || found.length >= MAX_BOXES || !visible(el)) return;
        seen.add(el);
        found.push({ el: el, label: t[1] || themeLabel() });
      });
    });
    found.sort(function (a, b) {
      return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top;
    });
    found.forEach(function (f, i) { f.score = confidence(f.label, i); });
    return found;
  }

  var layer = null;
  var caption = null;
  var tracked = [];
  var frame = 0;

  // Boxes are fixed to the viewport and re-measured on scroll and resize,
  // rather than placed in page coordinates: half of what gets detected
  // (the theme toggle, the chat button) is itself fixed and would drift.
  function place() {
    frame = 0;
    tracked.forEach(function (t) {
      var r = t.el.getBoundingClientRect();
      // Something hidden since, by a resize or a phone turning: its box goes
      // too, rather than leaving a label stranded at the top-left corner.
      t.box.hidden = r.width < 1 && r.height < 1;
      var s = t.box.style;
      s.left = r.left - 3 + 'px';
      s.top = r.top - 3 + 'px';
      s.width = r.width + 6 + 'px';
      s.height = r.height + 6 + 'px';
      // The library puts a label that would leave the image inside the box.
      t.box.classList.toggle('bbv-box--inside', r.top < 24);
    });
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(place);
  }

  function voc(el) {
    var r = el.getBoundingClientRect();
    return '[' + [r.left, r.top, r.right, r.bottom].map(function (n) {
      return Math.max(0, Math.round(n));
    }).join(', ') + ']';
  }

  // The calls that would draw these boxes, with the page's real coordinates.
  // Two rows of data and the count of the rest: it is a caption, not a dump.
  function codeFor(found) {
    var shown = found.slice(0, 2);
    var more = found.length - shown.length;
    var tail = more > 0 ? ', ...' : '';
    return [
      'import bbox_visualizer as bbv',
      '',
      'bboxes = [' + shown.map(function (f) { return voc(f.el); }).join(', ') + tail + ']',
      'labels = [' + shown.map(function (f) { return '"' + f.label + '"'; }).join(', ') + tail + ']',
      '',
      'img = bbv.draw_multiple_boxes(img, bboxes, bbox_color=(0, 255, 0))',
      'img = bbv.add_multiple_labels(img, labels, bboxes, text_bg_color=(0, 255, 0))'
    ];
  }

  function clearDetection() {
    if (!layer) return;
    layer.remove();
    caption.remove();
    layer = caption = null;
    tracked = [];
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onPointer, true);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      clearDetection();
    }
  }

  // A click anywhere but the caption clears the boxes, and still does
  // whatever it was going to do. A click, not a pointerdown: on a phone every
  // scroll starts with a pointerdown, and the boxes are meant to scroll along.
  function onPointer(e) {
    if (caption && caption.contains(e.target)) return;
    clearDetection();
  }

  function detect() {
    clearDetection();
    var found = findObjects();

    layer = document.createElement('div');
    layer.className = 'bbv-layer';
    layer.setAttribute('aria-hidden', 'true');

    tracked = found.map(function (f) {
      var box = document.createElement('div');
      box.className = 'bbv-box';
      var tag = document.createElement('span');
      tag.className = 'bbv-label';
      tag.textContent = f.label + ' ' + f.score;
      box.appendChild(tag);
      layer.appendChild(box);
      return { el: f.el, box: box };
    });
    document.body.appendChild(layer);
    place();

    caption = document.createElement('div');
    caption.className = 'bbv-caption';
    caption.setAttribute('role', 'status');

    var head = document.createElement('p');
    head.className = 'bbv-caption-head';
    var strong = document.createElement('strong');
    strong.textContent = found.length + ' objects detected';
    head.appendChild(strong);
    head.appendChild(document.createTextNode(
      ' (not really: no model ran, these are just page elements). ' +
      'Styled after bbox-visualizer, my Python library for drawing boxes like these.'));
    caption.appendChild(head);

    var code = document.createElement('pre');
    code.className = 'bbv-code';
    // A block per line, so a line too long for the card wraps with a hanging
    // indent (see .bbv-code) and reads as one line continued, not two.
    // A keyword argument (bbox_color=(0, 255, 0)) is kept whole, so a wrap
    // never leaves "bbox_color=" at the end of one line and its value on
    // the next.
    codeFor(found).forEach(function (line) {
      var row = document.createElement('span');
      var parts = (line || ' ').split(/(\w+=\([^)]*\))/);
      parts.forEach(function (part, i) {
        if (i % 2) {
          var arg = document.createElement('span');
          arg.className = 'bbv-arg';
          arg.textContent = part;
          row.appendChild(arg);
        } else if (part) {
          row.appendChild(document.createTextNode(part));
        }
      });
      code.appendChild(row);
    });
    caption.appendChild(code);

    var foot = document.createElement('p');
    foot.className = 'bbv-caption-foot';
    var link = document.createElement('a');
    link.href = 'https://github.com/shoumikchow/bbox-visualizer';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'bbox-visualizer on GitHub';
    foot.appendChild(link);
    var pip = document.createElement('code');
    pip.textContent = 'pip install bbox-visualizer';
    foot.appendChild(pip);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'bbv-close';
    close.textContent = 'Clear';
    close.addEventListener('click', clearDetection);
    foot.appendChild(close);
    caption.appendChild(foot);

    document.body.appendChild(caption);

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onPointer, true);
    announce(found.length + ' objects detected. Press Escape to clear.');
  }

  // ─── Konami code ────────────────────────────────────────────
  var SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var progress = 0;

  function typing(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === SEQUENCE[progress]) {
      progress++;
      if (progress === SEQUENCE.length) {
        progress = 0;
        konami();
      }
    } else {
      progress = key === SEQUENCE[0] ? 1 : 0;
    }
  });

  // Confetti in the Now section's channel colours, read from the stylesheet
  // so each theme gets its own.
  function confetti() {
    var root = getComputedStyle(document.documentElement);
    var colours = ['music', 'book', 'movie', 'gaming', 'chess'].map(function (c) {
      return root.getPropertyValue('--now-' + c).trim();
    }).filter(Boolean);

    var canvas = document.createElement('canvas');
    canvas.className = 'fun-confetti';
    canvas.setAttribute('aria-hidden', 'true');
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var bits = [];
    for (var i = 0; i < 160; i++) {
      bits.push({
        x: w / 2 + (Math.random() - 0.5) * 120,
        y: h + 10,
        vx: (Math.random() - 0.5) * 11,
        vy: -(Math.random() * 11 + 11),
        spin: Math.random() * Math.PI,
        vspin: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 6 + 5,
        colour: colours[i % colours.length]
      });
    }

    var start = performance.now();
    (function tick(now) {
      var t = now - start;
      ctx.clearRect(0, 0, w, h);
      bits.forEach(function (b) {
        b.vy += 0.32;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.spin += b.vspin;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.spin);
        ctx.globalAlpha = Math.max(0, 1 - t / 3200);
        ctx.fillStyle = b.colour;
        ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        ctx.restore();
      });
      if (t < 3200) requestAnimationFrame(tick);
      else canvas.remove();
    })(start);
  }

  function konami() {
    if (window.siteToast) window.siteToast('↑↑↓↓←→←→BA · 30 extra lives granted');
    if (!REDUCED.matches) confetti();
  }

  window.siteFun = { detect: detect, konami: konami, clearDetection: clearDetection };
})();
