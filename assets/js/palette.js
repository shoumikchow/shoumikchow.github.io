// The ⌘K palette. ⌘K (Ctrl+K off a Mac) or "/" opens it from anywhere; the
// button under the nav opens it by pointer, which on a phone is the only way.
//
// Two modes. Search matches pages, their sections, a handful of actions and
// the social links, all locally against /palette.json and nothing else. Ask
// hands the text to the chatbot through window.siteChat (chat.js), so it is
// the same conversation the dock holds, not a second one, and it spends from
// the same daily budget. That budget is why nothing is ever sent as you type:
// a question goes to the model only when Enter is pressed on it.
(function () {
  var dialog = document.querySelector('.palette');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  var field = dialog.querySelector('.palette-input');
  var list = dialog.querySelector('.palette-list');
  var chatView = dialog.querySelector('.palette-chat');
  var log = dialog.querySelector('.palette-log');
  var modePill = dialog.querySelector('.palette-mode');
  var closeBtn = dialog.querySelector('.palette-close');
  var handoff = dialog.querySelector('.palette-handoff');
  var trigger = document.querySelector('.palette-trigger');

  // navigator.platform is deprecated but still everywhere, and it is the only
  // signal that says "Mac" without also matching an iPad pretending to be one.
  var MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
  var SHORTCUT = MAC ? '⌘K' : 'Ctrl K';

  // The dock's own disclaimer, copied rather than restated: it says the
  // conversation is logged, and a second copy of that sentence would be the
  // one that goes stale.
  var dockNote = document.querySelector('.chat-note');
  if (dockNote && handoff) handoff.parentNode.appendChild(dockNote.cloneNode(true));

  if (trigger) {
    var kbd = trigger.querySelector('.palette-kbd');
    if (kbd) kbd.textContent = SHORTCUT;
    trigger.setAttribute('aria-keyshortcuts', MAC ? 'Meta+K' : 'Control+K');
    trigger.hidden = false;
    trigger.addEventListener('click', function () { openPalette(); });
  }

  // Where people learn that ⌘K also asks: inside the chat dock, the one place
  // everyone reading it has already decided to ask something. The sidebar
  // trigger only says "Search", so without this the shortcut's second job is
  // discoverable only by opening the palette.
  var tip = document.querySelector('.chat-tip');
  if (tip && window.siteChat) {
    var key = document.createElement('kbd');
    key.textContent = SHORTCUT;
    tip.appendChild(document.createTextNode('Tip: press '));
    tip.appendChild(key);
    tip.appendChild(document.createTextNode(' on any page to ask from the keyboard.'));
    tip.hidden = false;
  }

  // ─── Icons ──────────────────────────────────────────────────
  // Static strings, so innerHTML is safe for these and only these. Everything
  // that comes from the index or from the visitor is set as text.
  function svg(body) {
    return '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  var ICONS = {
    page: svg('<path d="M4 1.8h5.2L12.5 5v9.2h-8.5z"/><path d="M9 1.8V5h3.5"/>'),
    section: svg('<path d="M6.2 2.5L5 13.5M11 2.5L9.8 13.5M2.8 5.8h11M2.2 10.2h11"/>'),
    action: svg('<path d="M8.8 1.8L3.5 9h4.2l-.8 5.2L12.5 7H8.3z"/>'),
    link: svg('<path d="M6 3.5H3.5v9h9V10M9 2.5h4.5V7M13.5 2.5L7.5 8.5"/>'),
    ask: svg('<path d="M2.5 3.5h11v7.5H8l-3 2.5V11H2.5z"/>')
  };
  var KIND_LABEL = { page: 'Page', section: 'Section', action: 'Action', link: 'Link', ask: 'Ask' };

  // ─── Text ───────────────────────────────────────────────────
  // Folded for matching: case, accents, and apostrophes, so "lets" finds
  // "Let’s". Anything else that is not a letter or digit becomes a word break.
  function fold(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[’'`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // The index carries text through markdownify | strip_html, which leaves
  // entities behind ("Robotics &amp; Computer Vision"). A DOMParser document
  // is inert (no scripts, no image loads), so this only ever yields text.
  var parser = new DOMParser();
  function decode(s) {
    if (!s || s.indexOf('&') === -1) return s || '';
    return parser.parseFromString(s, 'text/html').documentElement.textContent;
  }

  // kramdown's header id rule, from Kramdown::Converter::Base#generate_id:
  // strip leading non-letters, drop anything outside [A-Za-z0-9 -], spaces
  // become hyphens. The index cannot do this itself (Liquid has no regex), and
  // getting it wrong silently lands the visitor at the top of the page.
  function kramdownId(text) {
    return text
      .replace(/^[^a-zA-Z]+/, '')
      .replace(/[^a-zA-Z0-9 -]/g, '')
      .replace(/ /g, '-')
      .toLowerCase();
  }

  // ─── Items ──────────────────────────────────────────────────
  // Every row is one of these. `run` does the thing; items with an `href`
  // get ⌘/Ctrl+Enter for a new tab.
  function item(kind, title, opts) {
    opts = opts || {};
    return {
      kind: kind,
      title: title,
      parent: opts.parent || '',
      keys: opts.keys || '',
      href: opts.href || null,
      run: opts.run || null,
      boost: opts.boost || 0,
      hint: opts.hint || null
    };
  }

  // Until the index arrives, the nav is a perfectly good list of pages. It is
  // already in the document, so the first open is never empty.
  function pagesFromNav() {
    var out = [item('page', 'Home', { href: '/', boost: 6 })];
    var links = document.querySelectorAll('.nav-list a');
    for (var i = 0; i < links.length; i++) {
      out.push(item('page', links[i].textContent.trim(), { href: links[i].getAttribute('href'), boost: 6 }));
    }
    return out;
  }

  var pages = pagesFromNav();
  var sections = [];
  var loading = null;

  function load() {
    if (loading) return loading;
    loading = fetch(dialog.getAttribute('data-index'))
      .then(function (res) {
        if (!res.ok) throw new Error('index');
        return res.json();
      })
      .then(function (entries) {
        var nextPages = [];
        var nextSections = [];
        entries.forEach(function (e) {
          var title = decode(e.title);
          var text = decode(e.text);
          if (e.type === 'page') {
            nextPages.push(item('page', title, { href: e.url, keys: text, boost: 6 }));
          } else if (e.type === 'section') {
            var anchor = e.anchor || kramdownId(title);
            nextSections.push(item('section', title, {
              parent: decode(e.page),
              href: e.url + (anchor ? '#' + anchor : ''),
              keys: text
            }));
          }
        });
        if (nextPages.length) pages = nextPages;
        sections = nextSections;
        if (dialog.open && mode === 'search') renderResults();
      })
      // A failed fetch is not worth a message: the nav-derived pages and every
      // action still work. Clearing the promise lets the next open try again.
      .catch(function () { loading = null; });
    return loading;
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  // Built per render rather than once, because two of them depend on state
  // that changes under the palette: the theme, and whether this page has a
  // Markdown twin.
  function actions() {
    var email = dialog.getAttribute('data-email');
    var out = [];

    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    out.push(item('action', 'Switch to ' + next + ' theme', {
      keys: 'theme dark light mode appearance night day toggle colour color',
      boost: 4,
      run: function () {
        // Closed first, so the theme's view transition snapshots the page and
        // not a palette that is about to vanish from the middle of it.
        closePalette();
        requestAnimationFrame(function () {
          var toggle = document.querySelector('.theme-toggle');
          if (toggle) toggle.click();
        });
      }
    }));

    out.push(item('action', 'Ask a question', {
      keys: 'chat ask bot ai question talk assistant',
      boost: 4,
      run: function () { setMode('ask'); }
    }));

    if (email) {
      out.push(item('action', 'Copy email address', {
        keys: 'email mail contact copy address ' + email,
        boost: 4,
        run: function (row) { copy(email, row); }
      }));
      out.push(item('action', 'Send an email', {
        keys: 'email mail contact write message ' + email,
        boost: 4,
        href: 'mailto:' + email
      }));
    }

    out.push(item('action', 'Copy link to this page', {
      keys: 'copy link url share address page',
      boost: 3,
      run: function (row) { copy(location.origin + location.pathname, row); }
    }));

    var md = document.querySelector('link[rel="alternate"][type="text/markdown"]');
    if (md) {
      out.push(item('action', 'View this page as Markdown', {
        keys: 'markdown md source raw text plain llm',
        boost: 3,
        href: md.getAttribute('href')
      }));
    }

    out.push(item('action', 'Save contact card', {
      keys: 'vcard vcf contact card save download address book',
      boost: 3,
      href: '/shoumik.vcf'
    }));

    return out;
  }

  // The header's social icons, read from the page so there is one list of
  // them. Email is left out; the actions above cover it better.
  function socials() {
    var out = [];
    var links = document.querySelectorAll('.downloads a[data-social]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.getAttribute('data-social') === 'email') continue;
      var name = (a.textContent || a.getAttribute('data-social')).trim();
      out.push(item('link', name, {
        keys: 'social profile follow ' + a.getAttribute('data-social'),
        href: a.getAttribute('href'),
        boost: 3
      }));
    }
    return out;
  }

  function askItem(text) {
    var state = window.siteChat.status();
    var hint =
      state === 'paused' ? 'Answering again tomorrow'
      : state === 'down' ? 'Unavailable'
      : 'Chatbot';
    return item('ask', text, {
      parent: 'Ask',
      hint: hint,
      run: function () { setMode('ask'); send(text); }
    });
  }

  // The dock's starter questions, read from its markup so they stay the same
  // three in both places.
  function starterItems() {
    var chips = document.querySelectorAll('.chat-starters button');
    var out = [];
    for (var i = 0; i < chips.length; i++) out.push(askItem(chips[i].textContent.trim()));
    return out;
  }

  // ─── Matching ───────────────────────────────────────────────
  // Every word typed has to land somewhere; a row's score is the sum of how
  // well each one landed. Title beats the parent page's name beats the body
  // text, and a prefix beats a word start beats anything else. Loose
  // subsequence matching ("bbvis") is only tried against titles, where a
  // false positive is visible and short-lived, never against the body.
  // Mid-word hits need three letters. At two, "re" finds "addREss" and puts
  // Copy email address above every section of Research.
  function wordScore(hay, word) {
    if (!hay) return 0;
    if (hay.indexOf(word) === 0) return 3;
    if ((' ' + hay).indexOf(' ' + word) !== -1) return 2;
    if (word.length > 2 && hay.indexOf(word) !== -1) return 1;
    return 0;
  }

  function subsequence(hay, word) {
    var j = 0;
    for (var i = 0; i < hay.length && j < word.length; i++) {
      if (hay[i] === word[j]) j++;
    }
    return j === word.length;
  }

  function score(it, words) {
    if (!it._title) {
      it._title = fold(it.title);
      it._parent = fold(it.parent);
      it._keys = fold(it.keys);
    }
    var total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var s = wordScore(it._title, w) * 30;
      if (!s) s = wordScore(it._parent, w) * 10;
      if (!s && w.length > 2) s = wordScore(it._keys, w) * 5;
      if (!s && w.length > 1 && it._title[0] === w[0] && subsequence(it._title, w)) s = 8;
      if (!s) return 0;
      total += s;
    }
    return total + it.boost;
  }

  // Worth putting the Ask row first rather than last.
  var QUESTION = /\?\s*$|^(who|what|where|when|why|how|which|is|are|does|do|did|has|have|can|could|would|tell)\b/i;

  // ─── Rendering ──────────────────────────────────────────────
  var mode = 'search';
  var rows = [];     // items in display order
  var active = 0;
  var busyFlash = null;

  function buildRow(it, index) {
    var li = document.createElement('li');
    li.className = 'palette-item';
    li.id = 'palette-opt-' + index;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.setAttribute('data-index', String(index));

    var icon = document.createElement('span');
    icon.className = 'palette-icon';
    icon.innerHTML = ICONS[it.kind];
    li.appendChild(icon);

    var label = document.createElement('span');
    label.className = 'palette-label';
    if (it.parent) {
      var parent = document.createElement('span');
      parent.className = 'palette-parent';
      parent.textContent = it.parent + (it.kind === 'ask' ? ': ' : ' › ');
      label.appendChild(parent);
    }
    label.appendChild(document.createTextNode(it.title));
    li.appendChild(label);

    var hint = document.createElement('span');
    hint.className = 'palette-hint';
    hint.textContent = it.hint || KIND_LABEL[it.kind];
    li.appendChild(hint);

    return li;
  }

  function heading(text) {
    var li = document.createElement('li');
    li.className = 'palette-group';
    li.setAttribute('role', 'presentation');
    li.textContent = text;
    return li;
  }

  function renderResults() {
    var raw = field.value.trim();
    var words = fold(raw).split(' ').filter(Boolean);
    var groups = [];

    if (!words.length) {
      // No query: a short, grouped menu rather than every section on the site.
      groups.push(['Pages', pages]);
      if (window.siteChat) groups.push(['Ask about me', starterItems()]);
      groups.push(['Actions', actions()]);
      groups.push(['Links', socials()]);
    } else {
      var pool = pages.concat(sections, actions(), socials());
      var ranked = [];
      pool.forEach(function (it, order) {
        var s = score(it, words);
        if (s) ranked.push({ it: it, s: s, order: order });
      });
      ranked.sort(function (a, b) { return b.s - a.s || a.order - b.order; });
      var found = ranked.slice(0, 12).map(function (r) { return r.it; });

      if (window.siteChat) {
        var ask = askItem(raw);
        if (QUESTION.test(raw) || !found.length) found.unshift(ask);
        else found.push(ask);
      }
      groups.push([null, found]);
    }

    list.textContent = '';
    rows = [];
    groups.forEach(function (g) {
      if (!g[1].length) return;
      if (g[0]) list.appendChild(heading(g[0]));
      g[1].forEach(function (it) {
        list.appendChild(buildRow(it, rows.length));
        rows.push(it);
      });
    });
    setActive(0);
  }

  function setActive(i) {
    if (!rows.length) {
      field.removeAttribute('aria-activedescendant');
      return;
    }
    active = (i + rows.length) % rows.length;
    var current = list.querySelector('.is-active');
    if (current) {
      current.classList.remove('is-active');
      current.setAttribute('aria-selected', 'false');
    }
    var el = document.getElementById('palette-opt-' + active);
    if (!el) return;
    el.classList.add('is-active');
    el.setAttribute('aria-selected', 'true');
    field.setAttribute('aria-activedescendant', el.id);
    // The first row can sit under a group heading; showing it matters more
    // than keeping the list scrolled to the pixel.
    if (active === 0) list.scrollTop = 0;
    else el.scrollIntoView({ block: 'nearest' });
  }

  function activate(i, newTab) {
    var it = rows[i];
    if (!it) return;
    var row = document.getElementById('palette-opt-' + i);
    if (it.run) {
      it.run(row);
      return;
    }
    if (!it.href) return;
    if (newTab) {
      window.open(it.href, '_blank', 'noopener');
      return;
    }
    // A section on this page is a scroll, not a load. Closing first returns
    // focus to where it was, and then the jump moves it on.
    var url = new URL(it.href, location.href);
    closePalette();
    if (url.origin === location.origin && url.pathname === location.pathname && url.hash) {
      location.hash = url.hash;
    } else {
      location.href = url.href;
    }
  }

  // Feedback goes in the row itself, where the eye already is, and to the
  // page's live region for anyone who cannot see it.
  function copy(text, row) {
    var hint = row && row.querySelector('.palette-hint');
    function done(message) {
      if (hint) hint.textContent = message;
      if (window.announceToScreenReader) window.announceToScreenReader(message);
      clearTimeout(busyFlash);
      busyFlash = setTimeout(closePalette, 700);
    }
    if (!navigator.clipboard) return done('Could not copy');
    navigator.clipboard.writeText(text).then(
      function () { done('Copied'); },
      function () { done('Could not copy'); }
    );
  }

  // ─── Ask mode ───────────────────────────────────────────────
  // The palette's own record of a question that failed. chat.js drops a failed
  // question from the transcript (so it is not billed twice), which would
  // leave the palette with nothing to show for it.
  var failed = null;

  function bubble(role, text, extra) {
    var row = document.createElement('div');
    row.className = 'chat-msg chat-msg--' + role;
    var p = document.createElement('p');
    p.className = 'chat-bubble' + (extra ? ' ' + extra : '');
    if (role === 'bot' && !extra) window.siteChat.render(p, text);
    else p.textContent = text;
    row.appendChild(p);
    log.appendChild(row);
  }

  function renderChat() {
    if (!window.siteChat) return;
    var messages = window.siteChat.messages();
    log.textContent = '';

    if (!messages.length && !failed && !window.siteChat.isBusy()) {
      var empty = document.createElement('p');
      empty.className = 'palette-empty';
      empty.textContent = 'Ask about his work, research, projects, or anything else on this site.';
      log.appendChild(empty);
    }

    messages.forEach(function (m) {
      bubble(m.role === 'user' ? 'user' : 'bot', m.content);
    });

    if (window.siteChat.isBusy()) {
      bubble('bot', 'Thinking', 'chat-bubble--pending');
    } else if (failed) {
      bubble('user', failed.question);
      bubble('bot', failed.error, 'chat-bubble--error');
    }

    chatView.scrollTop = chatView.scrollHeight;
  }

  function send(text) {
    text = text.trim();
    if (!text || !window.siteChat || window.siteChat.isBusy()) return;
    failed = null;
    field.value = '';
    window.siteChat.ask(text).then(function (outcome) {
      if (outcome && outcome.error) failed = { question: outcome.question, error: outcome.error };
      renderChat();
    });
    renderChat();
  }

  document.addEventListener('sitechat:change', function () {
    if (dialog.open && mode === 'ask') renderChat();
  });

  function setMode(next) {
    if (next === 'ask' && !window.siteChat) return;
    mode = next;
    var asking = mode === 'ask';

    modePill.hidden = !asking;
    list.hidden = asking;
    chatView.hidden = !asking;
    field.setAttribute('aria-expanded', String(!asking));
    field.setAttribute('aria-label', asking ? 'Ask a question' : 'Search pages, or ask a question');
    field.placeholder = asking ? 'Ask about Shoumik' : 'Search, or ask a question';

    var keys = dialog.querySelectorAll('.palette-keys');
    for (var i = 0; i < keys.length; i++) {
      keys[i].hidden = keys[i].getAttribute('data-mode') !== mode;
    }

    if (asking) {
      field.removeAttribute('aria-activedescendant');
      renderChat();
    } else {
      renderResults();
    }
    field.focus();
  }

  // ─── Open, close, keys ──────────────────────────────────────
  function openPalette() {
    if (dialog.open) {
      field.focus();
      return;
    }
    clearTimeout(busyFlash);
    field.value = '';
    failed = null;
    dialog.showModal();
    setMode('search');
    load();
  }

  function closePalette() {
    clearTimeout(busyFlash);
    if (dialog.open) dialog.close();
  }

  function typing(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  document.addEventListener('keydown', function (e) {
    // ⌘K on a Mac and Ctrl+K elsewhere, never both: Ctrl+K on a Mac is
    // kill-to-end-of-line in every text field, and taking it would break that.
    var mod = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (dialog.open) closePalette();
      else openPalette();
      return;
    }
    if (e.key === '/' && !dialog.open && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) {
      e.preventDefault();
      openPalette();
    }
  });

  dialog.addEventListener('keydown', function (e) {
    if (e.isComposing) return;

    if (e.key === 'Escape') {
      // Handled here, and stopped, so the chat dock's own Escape listener on
      // the document does not also close the dock sitting behind the palette.
      e.preventDefault();
      e.stopPropagation();
      closePalette();
      return;
    }

    if (e.target !== field) return;

    if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      if (!window.siteChat) return;
      e.preventDefault();
      setMode(mode === 'ask' ? 'search' : 'ask');
      return;
    }

    if (mode === 'ask') {
      if (e.key === 'Enter') {
        e.preventDefault();
        send(field.value);
      } else if (e.key === 'Backspace' && !field.value) {
        e.preventDefault();
        setMode('search');
      }
      return;
    }

    var down = e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n');
    var up = e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p');
    if (down || up) {
      e.preventDefault();
      setActive(active + (down ? 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(active, e.metaKey || e.ctrlKey);
    }
  });

  field.addEventListener('input', function () {
    if (mode === 'search') renderResults();
  });

  // mousemove, not mouseover: a row scrolling under a still pointer is not
  // the visitor choosing it, and would fight the arrow keys.
  list.addEventListener('mousemove', function (e) {
    var row = e.target.closest('.palette-item');
    if (row) {
      var i = Number(row.getAttribute('data-index'));
      if (i !== active) setActive(i);
    }
  });

  list.addEventListener('click', function (e) {
    var row = e.target.closest('.palette-item');
    if (row) activate(Number(row.getAttribute('data-index')), e.metaKey || e.ctrlKey);
  });

  // A click on the dialog element itself, rather than anything in it, is a
  // click on the backdrop: the contents fill the box edge to edge.
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) closePalette();
  });

  closeBtn.addEventListener('click', closePalette);

  if (handoff) {
    handoff.addEventListener('click', function () {
      closePalette();
      if (window.siteChat) window.siteChat.open();
    });
  }
})();
