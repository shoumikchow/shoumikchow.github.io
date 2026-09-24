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
  var SHORTCUT = MAC ? '⌘K' : 'Ctrl+K';

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
  var KIND_LABEL = { page: 'Page', section: 'Section', action: 'Action', link: 'Link', ask: 'Ask', now: 'Now' };

  // Hotkeys are keyboard furniture; on a touch screen the row keeps its plain
  // label instead.
  var TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

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
      hint: opts.hint || null,
      // Hotkeys shown on the row in place of the hint, Raycast-style.
      kbd: opts.kbd || null,
      // Artwork (a Right now row's cover or album art), or failing that one of
      // the Now section's channel icons, in place of the kind's icon.
      image: opts.image || null,
      nowIcon: opts.nowIcon || null,
      // Opens in a new tab, as the Now cards' own links do.
      external: !!opts.external
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

  // ─── Right now ──────────────────────────────────────────────
  // The homepage's Now cards as palette rows, on every page: what is playing,
  // being read, watched, played, and the chess rating. Same worker, same
  // endpoints as now.js, and the same five-minute cache headers, so on the
  // homepage these are answered from the browser's cache rather than fetched
  // twice. Fetched on the first open only, never on page load.
  var WORKER = 'https://shoumikchow-now.shoumikchow.workers.dev';
  var nowItems = [];
  var nowLoading = null;

  function getJSON(path) {
    return fetch(WORKER + path).then(function (res) {
      if (!res.ok) throw new Error(path);
      return res.json();
    });
  }

  // now.js's wording, kept to its short forms because it sits in a hint.
  function ago(value) {
    if (!value) return null;
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    var date = parts ? new Date(+parts[1], +parts[2] - 1, +parts[3]) : new Date(value);
    if (isNaN(date)) return null;
    var now = new Date();
    var days = Math.round(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate()) -
       new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + 'd ago';
    if (days < 30) return Math.floor(days / 7) + 'w ago';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function joinParts(parts) {
    return parts.filter(Boolean).join(' · ');
  }

  // Each channel resolves to a list of rows, empty when there is nothing to
  // show or the feed failed. A dead feed just leaves its row out: the Now
  // card on the homepage is where a failure is worth explaining.
  function loadNow() {
    if (nowLoading) return nowLoading;

    var isbns = dialog.getAttribute('data-isbns');
    var channels = [
      getJSON('/spotify').then(function (d) {
        return [item('now', joinParts([d.title, d.artist]), {
          parent: 'Listening', nowIcon: 'music', image: d.albumArt, href: d.link, external: true,
          hint: ago(d.playedAt), keys: joinParts(['now listening music song track spotify', d.album])
        })];
      }),
      isbns ? getJSON('/books?isbns=' + encodeURIComponent(isbns)).then(function (books) {
        return books.map(function (b) {
          return item('now', joinParts([b.title, b.author]), {
            parent: 'Reading', nowIcon: 'book', image: b.cover, href: b.link, external: true,
            keys: 'now reading book'
          });
        });
      }) : Promise.resolve([]),
      getJSON('/letterboxd').then(function (d) {
        return [item('now', d.title + (d.year ? ' (' + d.year + ')' : ''), {
          parent: 'Watching', nowIcon: 'movie', image: d.poster, href: d.link, external: true,
          hint: ago(d.watchedDate),
          keys: joinParts(['now watching movie film letterboxd', d.director].concat(d.genres || []))
        })];
      }),
      getJSON('/steam').then(function (games) {
        var g = games[0];
        if (!g) return [];
        return [item('now', joinParts([g.name, g.playtimeForever && g.playtimeForever + ' played']), {
          parent: 'Playing', nowIcon: 'gaming', image: g.cover, external: true,
          href: 'https://store.steampowered.com/app/' + encodeURIComponent(g.appid),
          keys: 'now playing game gaming steam video'
        })];
      }),
      getJSON('/lichess').then(function (d) {
        // A live game wins, as it does on the Now card.
        if (d.playing) {
          return [item('now', 'In a game right now', {
            parent: 'Chessing', nowIcon: 'chess', href: d.playing, external: true,
            keys: 'now chess lichess live game watch'
          })];
        }
        if (!d.top) return [];
        return [item('now', d.top.rating + ' ' + d.top.format + ' on Lichess', {
          parent: 'Chessing', nowIcon: 'chess', href: d.challenge, external: true,
          hint: ago(d.lastPlayed),
          keys: 'now chess lichess rating elo challenge play'
        })];
      })
    ].map(function (p) { return p.catch(function () { return []; }); });

    nowLoading = Promise.all(channels).then(function (lists) {
      nowItems = [].concat.apply([], lists);
      if (dialog.open && mode === 'search') renderResults(true);
    });
    return nowLoading;
  }

  // ─── Shortcuts ──────────────────────────────────────────────
  // ⌥1–⌥5 and ⌥T live in accessibility.js, which owns the list; this only
  // shows them. A page row is matched to its shortcut by path, since the nav
  // writes "/experience" where the index may write something else.
  function pathOf(href) {
    try {
      return new URL(href, location.href).pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    } catch (e) {
      return href;
    }
  }

  function pageShortcut(href) {
    var s = window.siteShortcuts;
    if (!s) return null;
    var path = pathOf(href);
    for (var i = 0; i < s.pages.length; i++) {
      if (pathOf(s.pages[i].href) === path) return s.label(s.pages[i].key);
    }
    return null;
  }

  function themeShortcut() {
    return window.siteShortcuts ? window.siteShortcuts.label('t') : null;
  }

  function runTheme() {
    // Closed first, so the theme's view transition snapshots the page and not
    // a palette that is about to vanish from the middle of it.
    closePalette();
    requestAnimationFrame(function () {
      var toggle = document.querySelector('.theme-toggle');
      if (toggle) toggle.click();
    });
  }

  function go(href) {
    closePalette();
    location.href = href;
  }

  // What "?" shows: every shortcut on the site, each one also a row that does
  // the thing, so the sheet is a menu as well as a reference.
  function shortcutItems() {
    var out = [item('action', 'Search or ask', {
      kbd: [SHORTCUT, '/'],
      run: function () { field.value = ''; renderResults(); }
    })];
    if (window.siteChat) {
      out.push(item('action', 'Switch to asking the chatbot', {
        kbd: ['tab'],
        run: function () { field.value = ''; setMode('ask'); }
      }));
    }
    var s = window.siteShortcuts;
    if (s) {
      s.pages.forEach(function (p) {
        out.push(item('page', 'Go to ' + p.label, {
          kbd: [s.label(p.key)],
          run: function () { go(p.href); }
        }));
      });
      out.push(item('action', 'Switch theme', { kbd: [themeShortcut()], run: runTheme }));
    }
    return out;
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
      kbd: themeShortcut() ? [themeShortcut()] : null,
      run: runTheme
    }));

    if (!TOUCH) {
      out.push(item('action', 'Keyboard shortcuts', {
        keys: 'keyboard shortcuts hotkeys keys help',
        boost: 3,
        kbd: ['?'],
        run: function () { field.value = '?'; renderResults(); }
      }));
    }

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
    icon.className = 'palette-icon' + (it.nowIcon ? ' palette-icon--' + it.nowIcon : '');
    var template = it.nowIcon && dialog.querySelector('template[data-now-icon="' + it.nowIcon + '"]');
    if (it.image) {
      var img = document.createElement('img');
      img.src = it.image;
      img.alt = '';
      img.loading = 'lazy';
      // A dead image link falls back to the channel icon, not a broken glyph.
      img.addEventListener('error', function () {
        icon.textContent = '';
        if (template) icon.appendChild(template.content.cloneNode(true));
      });
      icon.appendChild(img);
    } else if (template) {
      icon.appendChild(template.content.cloneNode(true));
    } else {
      icon.innerHTML = ICONS[it.kind];
    }
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
    var kbd = it.kbd || (it.kind === 'page' && it.href ? [pageShortcut(it.href)] : null);
    kbd = kbd && kbd.filter(Boolean);
    if (kbd && kbd.length && !TOUCH) {
      hint.classList.add('palette-hint--keys');
      kbd.forEach(function (k) {
        var key = document.createElement('kbd');
        key.textContent = k;
        hint.appendChild(key);
      });
    } else {
      hint.textContent = it.hint || KIND_LABEL[it.kind];
    }
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

  // `keep` is for redraws the visitor did not cause (the Right now rows
  // arriving): the selection stays on the row it was on rather than jumping
  // back to the top under their cursor.
  function renderResults(keep) {
    var raw = field.value.trim();
    var words = fold(raw).split(' ').filter(Boolean);
    var groups = [];
    var was = keep && rows[active] ? rows[active].kind + '|' + rows[active].title : null;

    if (raw === '?') {
      groups.push(['Keyboard shortcuts', shortcutItems()]);
    } else if (!words.length) {
      // No query: a short, grouped menu rather than every section on the site.
      groups.push(['Pages', pages]);
      groups.push(['Right now', nowItems]);
      if (window.siteChat) groups.push(['Ask about me', starterItems()]);
      groups.push(['Actions', actions()]);
      groups.push(['Links', socials()]);
    } else {
      var pool = pages.concat(sections, nowItems, actions(), socials());
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

    var start = 0;
    if (was) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].kind + '|' + rows[i].title === was) { start = i; break; }
      }
    }
    setActive(start);
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
    if (newTab || it.external) {
      if (it.external) closePalette();
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
    loadNow();
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
    if (dialog.open || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    if (e.key === '/') {
      e.preventDefault();
      openPalette();
    } else if (e.key === '?') {
      e.preventDefault();
      openPalette();
      field.value = '?';
      renderResults();
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

    // ⌥1–⌥5 and ⌥T work with the palette open too, as the rows advertise.
    // Handled here rather than left to accessibility.js, which ignores keys
    // typed into a field, and so the palette can close before a page loads or
    // the theme's transition snapshots the screen.
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey &&
        window.siteShortcuts && window.siteShortcuts.has(e.code)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'KeyT') {
        runTheme();
      } else {
        closePalette();
        window.siteShortcuts.run(e.code);
      }
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
