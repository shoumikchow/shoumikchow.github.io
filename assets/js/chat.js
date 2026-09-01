// Ask-about-me dock. A trigger in the bottom-left corner that opens a card
// above itself; the card posts to the worker's /chat endpoint, which runs an
// open-weights model over this site's own Markdown.
//
// The transcript lives in this closure only. Nothing is stored, nothing is sent
// anywhere but the worker, and a reload starts over — which is also why there
// is no "clear" button to write.
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
          if (!res.ok) throw new Error(data.error || 'Something went wrong.');
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
        // Drop the question that failed. Leaving it in would send it again on
        // the next turn and bill a second time for an exchange that never
        // produced an answer.
        history.pop();
      })
      .then(function () {
        setBusy(false);
        log.scrollTop = log.scrollHeight;
        input.focus();
      });
  }

  function setOpen(next) {
    if (next === open) return;
    open = next;

    panel.hidden = !open;
    root.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));

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
