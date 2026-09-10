// Ask-about-me dock. A trigger in the bottom-left corner that opens a card
// above itself; the card posts to the worker's /chat endpoint, which runs an
// open-weights model over this site's own Markdown.
//
// The transcript is kept in sessionStorage so it survives moving between pages.
// That became necessary when the dock moved into the layout: on the homepage
// alone there was nowhere to navigate to mid-conversation, and now every link
// on the page is somewhere to navigate to. Nothing is sent anywhere but the
// worker, and the store dies with the tab.
(function () {
  // Unlike now.js, which always talks to the deployed worker, this points at a
  // local `wrangler dev` when the page is served from localhost. Two reasons:
  // the feeds are read-only and free, whereas every /chat call spends from a
  // fixed daily budget that local tinkering should not eat; and it means the
  // widget can be worked on before the endpoint is deployed at all.
  var LOCAL = ['localhost', '127.0.0.1'].indexOf(location.hostname) !== -1;
  var ENDPOINT = LOCAL
    ? 'http://localhost:8787/chat'
    : 'https://shoumikchow-now.shoumikchow.workers.dev/chat';
  var MAX_CHARS = 500;

  var root = document.querySelector('.chat');
  if (!root) return;

  var STATUS_ENDPOINT = ENDPOINT + '/status';

  var trigger = root.querySelector('.chat-trigger');
  var panel = root.querySelector('.chat-panel');
  var log = root.querySelector('.chat-log');
  var form = root.querySelector('.chat-form');
  var input = root.querySelector('.chat-input');
  var starters = root.querySelector('.chat-starters');
  var closeBtn = root.querySelector('.chat-close');
  if (!trigger || !panel || !log || !form || !input) return;

  // The dock is position: fixed, and a transform on any ancestor would make
  // that ancestor the containing block instead of the viewport — which would
  // silently drop the card somewhere in the middle of the page. Living on
  // <body> makes it immune to whatever the page above it does, and is where an
  // overlay belongs anyway.
  document.body.appendChild(root);

  var history = [];
  var busy = false;
  var open = false;

  // sessionStorage rather than localStorage, deliberately. This is continuity
  // within one visit, not a record of it: the store dies with the tab, so a
  // conversation is never sitting there waiting for someone who comes back next
  // week having forgotten they had one, and a shared computer does not hand the
  // next person a transcript. Being per-tab also means two tabs hold two
  // separate conversations, which is the behaviour you would otherwise have to
  // write by hand.
  var STORE_KEY = 'chat';

  // Every call into storage is wrapped. sessionStorage *throws* rather than
  // returning null when a browser has storage switched off, so an unguarded
  // getItem here would take the whole dock down for the people most likely to
  // have it off. Failing to persist is a much smaller loss than failing to run.
  //
  // The value is parsed rather than trusted, too. It is same-origin data this
  // file wrote, but an older deploy's shape (or anything else that ends up
  // under this key) should mean "start fresh" and not an exception part-way
  // through replaying the log.
  function readStored() {
    var raw;
    try {
      raw = sessionStorage.getItem(STORE_KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;

    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.messages)) return null;

    var messages = [];
    for (var i = 0; i < data.messages.length; i++) {
      var m = data.messages[i];
      if (!m || typeof m !== 'object') return null;
      if (m.role !== 'user' && m.role !== 'assistant') return null;
      if (typeof m.content !== 'string' || !m.content) return null;
      messages.push({ role: m.role, content: m.content });
    }

    return { messages: messages, open: data.open === true };
  }

  function save() {
    try {
      // A visitor who never opened the dock leaves nothing behind, rather than
      // an empty object under a key with their name on it.
      if (!history.length && !open) {
        sessionStorage.removeItem(STORE_KEY);
        return;
      }
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ messages: history, open: open }));
    } catch (e) {
      // Storage off, or quota reached. Neither is worth surfacing: the
      // conversation on this page still works, it just stops following the
      // visitor to the next one.
    }
  }

  // The trigger's status light. Three states, and the default in the HTML is
  // the grey "not checked yet" one — the endpoint is asked on load rather than
  // assumed to be up, because a light that is green regardless is a decoration
  // with a claim attached to it.
  var dot = root.querySelector('.chat-trigger-dot');
  var statusText = root.querySelector('.chat-trigger-status');

  function setStatus(state) {
    if (dot) {
      dot.classList.toggle('is-live', state === 'live');
      dot.classList.toggle('is-paused', state === 'paused');
    }

    // Sighted hover and the accessible name, kept in step. Both are silent when
    // the answer is "live": the button already says what it does, and repeating
    // it is how a status light turns into noise.
    var label =
      state === 'paused' ? 'Answering again tomorrow'
      : state === 'down' ? 'Currently unavailable'
      : '';

    if (statusText) statusText.textContent = label ? '(' + label.toLowerCase() + ')' : '';
    if (label) trigger.setAttribute('title', label);
    else trigger.removeAttribute('title');
  }

  // Fired on load, for every visitor, whether or not they ever open the dock —
  // which is the point of a light. The cost is one cached GET against a handler
  // that only reads a counter; it never touches the model.
  fetch(STATUS_ENDPOINT)
    .then(function (res) {
      if (!res.ok) throw new Error('status');
      return res.json();
    })
    .then(function (data) { setStatus(data.available ? 'live' : 'paused'); })
    // Covers the worker being down, DNS failing, and an ad blocker eating the
    // request. All three mean the same thing to a visitor: asking will not work.
    .catch(function () { setStatus('down'); });

  // The one URL the bot is allowed to hand out (the worker's system prompt
  // gives it for resume questions). Kept as an exact string on both sides.
  var RESUME_URL = 'https://shoumikchow.com/resume';

  // Model output is untrusted — the corpus behind it is fetched over the
  // network — so this never uses innerHTML and never runs a general URL regex.
  // A generic linkifier would let anything that reached the corpus mint a
  // clickable link. Only the exact constant above becomes an anchor, and its
  // href is that constant rather than the matched text, so even the link the
  // model "wrote" is one this file chose.
  function render(el, text) {
    var i = text.indexOf(RESUME_URL);
    while (i !== -1) {
      if (i > 0) el.appendChild(document.createTextNode(text.slice(0, i)));
      var a = document.createElement('a');
      a.href = RESUME_URL;
      a.textContent = RESUME_URL;
      el.appendChild(a);
      text = text.slice(i + RESUME_URL.length);
      i = text.indexOf(RESUME_URL);
    }
    if (text) el.appendChild(document.createTextNode(text));
  }

  function addMessage(role, text) {
    var row = document.createElement('div');
    row.className = 'chat-msg chat-msg--' + role;

    var bubble = document.createElement('p');
    bubble.className = 'chat-bubble';
    render(bubble, text);

    row.appendChild(bubble);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  function setBusy(state) {
    busy = state;
    input.disabled = state;
    form.querySelector('button').disabled = state;
  }

  function ask(question) {
    if (busy) return;
    question = question.trim().slice(0, MAX_CHARS);
    if (!question) return;

    // The starters are an empty-state affordance, not a persistent toolbar.
    // Once there is a transcript they are noise competing with it.
    if (starters) starters.hidden = true;

    addMessage('user', question);
    history.push({ role: 'user', content: question });
    input.value = '';
    setBusy(true);

    // The log is a live region, so the placeholder is announced when it appears
    // and again when its text is replaced by the answer.
    var pending = addMessage('bot', 'Thinking');
    pending.classList.add('chat-bubble--pending');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          // The worker puts a visitor-readable sentence in `error` for the two
          // cases worth explaining (rate limited, daily budget spent). Prefer
          // it over a generic failure string.
          if (!res.ok) {
            var failure = new Error(data.error || 'Something went wrong.');
            // Carried through to the catch so the status light can react to
            // what this request just learned. Only the budget case sets it;
            // a rate limit clears on its own and must not park the light.
            failure.reason = data.reason;
            throw failure;
          }
          return data.reply;
        });
      })
      .then(function (answer) {
        pending.classList.remove('chat-bubble--pending');
        // Clear the placeholder first: render() appends, it does not replace.
        pending.textContent = '';
        render(pending, answer);
        history.push({ role: 'assistant', content: answer });
      })
      .catch(function (err) {
        pending.classList.remove('chat-bubble--pending');
        pending.classList.add('chat-bubble--error');
        pending.textContent = err.message || 'Something went wrong.';
        // The trigger is hidden while the panel is open, so this is not seen
        // until the visitor closes it — which is exactly when a light saying
        // "spent for today" is worth having.
        if (err.reason === 'budget') setStatus('paused');
        // Drop the question that failed. Leaving it in would send it again on
        // the next turn and bill a second time for an exchange that never
        // produced an answer.
        history.pop();
      })
      .then(function () {
        setBusy(false);
        log.scrollTop = log.scrollHeight;
        input.focus();
        // Saved here rather than in each branch above, because this runs once
        // the exchange has settled either way and a settled exchange is the
        // only thing worth restoring. A question still in flight when the
        // visitor navigates is deliberately lost: the answer never arrived, and
        // restoring the question on its own would show them a transcript that
        // looks like it is still thinking about it.
        save();
      });
  }

  function setOpen(next, restoring) {
    if (next === open) return;
    open = next;

    panel.hidden = !open;
    root.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));

    // Open on the newest message. This matters for a restored transcript, which
    // is written into the log while the panel is still hidden: scrollTop cannot
    // be set on a display: none element, so without this the visitor opens the
    // card onto the top of a conversation they have already read.
    if (open) log.scrollTop = log.scrollHeight;

    // Focus moves only when the visitor is the one who opened or closed the
    // panel. `restoring` is the page reopening it on their behalf after a
    // navigation, and pulling focus into the input then would scroll them down
    // to the dock and take away the top of the document they just asked for.
    if (!restoring) {
      if (open) {
        // Next frame: a hidden input cannot take focus, and the transition wants
        // a frame to start from the closed state rather than snapping open.
        requestAnimationFrame(function () { input.focus(); });
      } else {
        // Returning focus to the trigger is the part that is easy to skip and
        // most obvious when missing: without it, closing drops a keyboard user
        // back at the top of the document.
        trigger.focus();
      }
    }

    save();
  }

  // Replays a stored conversation into an otherwise fresh widget. It goes
  // through the same addMessage() the live path uses, so restored answers are
  // built the same way answers that just arrived are: text nodes, with an
  // anchor only for the one URL render() knows about.
  function restore() {
    var stored = readStored();
    if (!stored) return;

    for (var i = 0; i < stored.messages.length; i++) {
      var m = stored.messages[i];
      history.push({ role: m.role, content: m.content });
      addMessage(m.role === 'user' ? 'user' : 'bot', m.content);
    }

    // Same rule as the live path: the starters are an empty-state affordance,
    // and a restored transcript is not an empty state.
    if (history.length && starters) starters.hidden = true;

    // The panel's own state is part of the conversation. Landing on the next
    // page with the card shut, having left it open, is the same break in
    // continuity as landing with an empty one.
    if (stored.open) setOpen(true, true);
  }

  restore();

  trigger.addEventListener('click', function () { setOpen(!open); });
  if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && open) setOpen(false);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
  });

  if (starters) {
    starters.addEventListener('click', function (e) {
      var chip = e.target.closest('button');
      if (chip) ask(chip.textContent);
    });
  }
})();
