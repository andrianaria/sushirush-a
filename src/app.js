import { advanceGame, applyAction, BALANCE, createGame, replayGame, SERVING_BAR, STATIONS } from './game/engine.js';
import { clearSession, readHistory, readSession, recordResult, saveSession } from './storage.js';

const $ = id => document.getElementById(id);
const money = value => `Rp${Math.floor(value).toLocaleString('id-ID')}`;
const photoFiles = { cheesy: 'cheesy-roll', 'salmon-mozza': 'salmon-mozza', balinese: 'balinese-sushi-roll', 'chicken-miso': 'chicken-miso-ramen', laksa: 'ramen-laksa', sashibi: 'tuna-sashimi', rendang: 'rendang-sushi-roll', 'sakura-cake': 'mini-sushi-cake-sakura', 'hikari-cake': 'mini-sushi-cake-hikari', 'kokoro-cake': 'mini-sushi-cake-kokoro' };
const photo = recipe => `./public/menu/${photoFiles[recipe.id]}.svg`;
const kind = recipe => ({ roll: 'SUSHI ROLL', ramen: 'RAMEN BOWL', sashimi: 'SASHIMI', cake: 'SPECIAL SUSHI CAKE' })[recipe.kind];
const icons = { rice: '🍚', filling: '🥒', finish: '✦', broth: '🍜', protein: '🐟', serving: '↧' };
const shortNames = { rice: 'RICE & NORI', filling: 'FILLING', finish: 'TOPPING', broth: 'BROTH', protein: 'PROTEIN', serving: 'SERVE' };

let game = createGame(60);
let mode = 'ready';
let actions = [];
let epoch = 0;
let saved = readSession();
let history = readHistory();
let lastSaveAt = -1000;
let lastEventId = 0;
let recipeSignature = '';
let offerSignature = '';
let controlSignature = '';
let overlaySignature = '';
let holdTimer;

for (let y = BALANCE.gridSize - 1; y >= 0; y--) {
  for (let x = 0; x < BALANCE.gridSize; x++) {
    const station = [...Object.values(STATIONS), SERVING_BAR].find(item => item.x === x && item.y === y);
    const cell = document.createElement('div');
    cell.className = `floor-cell ${(x + y) % 2 ? 'alternate' : ''}${station ? ' station' : ''}`;
    cell.dataset.x = x; cell.dataset.y = y;
    if (station) {
      cell.dataset.station = station.id;
      cell.classList.add(`station-${station.id}`);
      cell.innerHTML = `<span class="station-icon" aria-hidden="true">${icons[station.id]}</span><span class="station-name">${shortNames[station.id]}</span><span class="station-cue" aria-hidden="true">NEXT</span>`;
    }
    $('floor').append(cell);
  }
}

function announce(message, tone = '') {
  $('game-message').textContent = message;
  $('event-bar').dataset.tone = tone;
}

function persist() {
  if (!['running', 'paused'].includes(mode) || game.finished) return;
  const stored = saveSession(game.seed, actions, game.elapsedMs);
  saved = stored ? { seed: game.seed, actions: [...actions], elapsedMs: game.elapsedMs } : null;
  $('save-note').textContent = stored ? 'Your progress is saved on this device.' : 'Browser storage is unavailable. Keep this tab open.';
  lastSaveAt = game.elapsedMs;
}

function complete() {
  if (mode === 'results') return;
  mode = 'results';
  clearSession(); saved = null;
  history = recordResult(game);
  announce(`Shift complete! You served ${game.completedOrders} ${game.completedOrders === 1 ? 'dish' : 'dishes'} and earned ${money(game.revenue)}.`, 'serve');
  render();
  $('board-overlay').querySelector('h2')?.focus({ preventScroll: true });
}

function advance() {
  if (mode !== 'running') return;
  game = advanceGame(game, Math.max(game.elapsedMs, Math.floor(performance.now() - epoch)));
  if (game.finished) { complete(); return; }
  if (game.elapsedMs - lastSaveAt >= 1000) persist();
}

function dispatch(action) {
  if (mode === 'ready' && action.type === 'select') {
    game = applyAction(game, { ...action, at: 0 });
    render();
    announce(`First up: ${game.order.name}. Start cooking when you're ready.`);
    return;
  }
  if (mode !== 'running') return;
  advance();
  if (mode !== 'running') return;
  const input = { ...action, at: game.elapsedMs };
  actions.push(input);
  game = applyAction(game, input);
  if (game.finished) { complete(); return; }
  persist(); render();
}

function start(resume = false) {
  stopHold();
  const session = resume ? readSession() : null;
  const firstSlot = game.selectedSlot;
  const seed = session?.seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] || 1);
  actions = session ? [...session.actions] : [];
  game = session ? replayGame(seed, actions, session.elapsedMs) : createGame(seed);
  if (!session && firstSlot) {
    const selection = { type: 'select', slot: firstSlot, at: 0 };
    actions.push(selection); game = applyAction(game, selection);
  }
  mode = 'running';
  lastEventId = game.lastEventId;
  epoch = performance.now() - game.elapsedMs;
  lastSaveAt = -1000;
  persist(); render();
  announce(session ? 'Welcome back, chef. Your shift continues!' : `Let's cook! Head to ${STATIONS[game.order.steps[game.stepIndex].station].name}.`);
}

function togglePause() {
  stopHold();
  if (mode === 'running') {
    advance();
    if (mode !== 'running') return;
    mode = 'paused'; persist();
    announce('Shift paused. Your chef and all timers are taking a break.');
  } else if (mode === 'paused') {
    epoch = performance.now() - game.elapsedMs;
    mode = 'running';
    announce('Back in the kitchen. Keep those orders moving!');
  } else return;
  render();
}

function render() {
  const remaining = Math.max(0, Math.ceil((BALANCE.durationMs - game.elapsedMs) / 1000));
  const readyToServe = game.stepIndex >= game.order.steps.length;
  const target = readyToServe ? SERVING_BAR : STATIONS[game.order.steps[game.stepIndex].station];
  const orderRemaining = Math.max(0, game.orderStartedAt + game.orderDeadlineMs - game.elapsedMs);
  $('revenue').textContent = money(game.revenue);
  $('served').textContent = String(game.completedOrders).padStart(2, '0');
  $('combo').innerHTML = `${game.combo}<span>×</span>`;
  $('timer').innerHTML = `${remaining}<span>s</span>`;
  $('timer').setAttribute('aria-label', `${remaining} seconds remaining`);
  $('clock-card').classList.toggle('urgent', remaining <= 10);
  $('personal-best').textContent = money(Math.max(0, ...history.map(run => run.revenue)));
  $('satisfaction').textContent = `${game.satisfaction}% happy`;
  $('satisfaction').classList.toggle('unhappy', game.satisfaction < 50);
  $('round-state').textContent = ({ ready: 'PREP TIME', running: readyToServe ? 'READY TO SERVE!' : 'SERVICE IS ON', paused: 'TAKING A BREATHER', results: 'SHIFT COMPLETE' })[mode];
  $('rush-label').textContent = mode === 'running' && remaining <= 15 ? 'THE FINAL RUSH!' : 'GOOD FOOD, FAST.';
  $('chef').style.transform = `translate(${game.position.x * 100}%, ${(4 - game.position.y) * 100}%)`;
  $('chef').setAttribute('aria-label', `Chef at column ${game.position.x + 1}, row ${5 - game.position.y}`);
  for (const cell of document.querySelectorAll('.station')) {
    cell.classList.toggle('next-station', cell.dataset.station === target.id && mode !== 'results');
    cell.classList.toggle('occupied', Number(cell.dataset.x) === game.position.x && Number(cell.dataset.y) === game.position.y);
  }

  const newOfferSignature = `${game.offers.map(recipe => recipe.id).join(',')}:${game.selectedSlot}:${mode}`;
  if (newOfferSignature !== offerSignature) {
    // Keep each button in place so selecting an order preserves keyboard focus.
    game.offers.forEach((recipe, slot) => {
      let button = $('offers').children[slot];
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.dataset.slot = slot;
        button.className = 'order-option'; $('offers').append(button);
      }
      const contentKey = `${recipe.id}:${slot}`;
      if (button.dataset.content !== contentKey) {
        button.innerHTML = `<span class="order-ticket">${String(slot + 1).padStart(2, '0')}</span><img src="${photo(recipe)}" alt=""><span class="order-copy"><span>${recipe.name}</span><strong>${money(recipe.price)}</strong></span><span class="order-selected" aria-hidden="true">✓</span>`;
        button.dataset.content = contentKey;
      }
      button.classList.toggle('selected', slot === game.selectedSlot);
      button.setAttribute('aria-pressed', String(slot === game.selectedSlot));
      button.setAttribute('aria-label', `Order ${slot + 1}: ${recipe.name}, ${money(recipe.price)}`);
      button.disabled = mode === 'paused' || mode === 'results';
    });
    offerSignature = newOfferSignature;
  }

  const newRecipeSignature = `${game.order.id}:${game.stepIndex}:${game.orderIndex}`;
  if (newRecipeSignature !== recipeSignature) {
    $('recipe-image').src = photo(game.order); $('recipe-image').alt = game.order.name;
    $('recipe-name').textContent = game.order.name;
    $('recipe-kind').textContent = kind(game.order);
    $('recipe-price').textContent = money(game.order.price);
    $('recipe-number').textContent = `ORDER ${String(game.orderIndex + 1).padStart(2, '0')}`;
    $('recipe-steps').innerHTML = game.order.steps.map((step, index) => `<li class="${index < game.stepIndex ? 'done' : index === game.stepIndex ? 'current' : ''}"><span class="step-number">${index < game.stepIndex ? '✓' : String(index + 1).padStart(2, '0')}</span><div><strong>${STATIONS[step.station].name}</strong><span>${step.label}</span></div>${index === game.stepIndex ? '<span class="step-arrow" aria-hidden="true">←</span>' : ''}</li>`).join('');
    $('serve-step').classList.toggle('current', readyToServe);
    $('serve-check').textContent = readyToServe ? '←' : '';
    recipeSignature = newRecipeSignature;
  }
  $('patience').max = game.orderDeadlineMs; $('patience').value = orderRemaining;
  $('patience').classList.toggle('urgent', orderRemaining < 4000);
  $('patience-label').textContent = `${Math.ceil(orderRemaining / 1000)}s`;

  if (game.lastEventId !== lastEventId && mode === 'running') {
    const event = game.events.at(-1);
    if (event) announce(event.type === 'step' ? (readyToServe ? 'All prepped! Walk to the serving bar to send it out.' : `${event.message}. Next: ${target.name}.`) : event.message, event.type);
    lastEventId = game.lastEventId;
  }

  const newControlSignature = `${mode}:${Boolean(saved)}`;
  if (controlSignature !== newControlSignature) {
    $('start-button').hidden = mode === 'running' || mode === 'paused';
    $('resume-button').hidden = mode !== 'ready' || !saved;
    $('running-controls').hidden = !['running', 'paused'].includes(mode);
    $('pause-button').innerHTML = mode === 'paused' ? 'Resume shift <span aria-hidden="true">→</span>' : 'Pause shift <span aria-hidden="true">Ⅱ</span>';
    $('start-button').innerHTML = `${mode === 'results' ? 'Cook again' : saved ? 'Start a new shift' : 'Start cooking'} <span aria-hidden="true">→</span>`;
    $('service-eyebrow').textContent = ({ ready: "LET'S MAKE SOMETHING GOOD", running: 'YOU HAVE GOT THIS, CHEF', paused: 'A WELL-EARNED BREATHER', results: 'THAT WAS A GOOD RUSH' })[mode];
    $('service-title').textContent = ({ ready: saved ? 'Your kitchen is waiting.' : 'Your shift starts here.', running: 'Keep the plates moving.', paused: 'Take your time.', results: 'Hungry for another round?' })[mode];
    $('service-copy').textContent = ({ ready: saved ? 'Continue where you left off, or put on a fresh apron and start a new shift.' : '60 seconds. Three tempting orders. One very busy chef. How much can you serve?', running: 'Follow the recipe, then head to the serving bar. Every completed dish adds to your earnings.', paused: 'Both timers are paused. Your progress is saved, ready for your next move.', results: 'A new shift brings a new order queue. Try a different dish and beat your personal best.' })[mode];
    for (const button of document.querySelectorAll('[data-direction]')) button.disabled = mode !== 'running';
    controlSignature = newControlSignature;
  }

  const newOverlaySignature = `${mode}:${mode === 'results' ? game.revenue : ''}`;
  if (overlaySignature !== newOverlaySignature) {
    const overlay = $('board-overlay');
    overlay.hidden = mode !== 'paused' && mode !== 'results';
    if (mode === 'paused') overlay.innerHTML = '<div class="overlay-card"><span class="overlay-mark" aria-hidden="true">Ⅱ</span><p class="eyebrow">A MOMENT TO BREATHE</p><h2 tabindex="-1">Kitchen on pause.</h2><p>Your orders can wait a little.</p><button class="button primary" data-action="resume">Back to cooking <span aria-hidden="true">→</span></button></div>';
    if (mode === 'results') overlay.innerHTML = `<div class="overlay-card"><span class="overlay-mark" aria-hidden="true">✳</span><p class="eyebrow">THAT'S A WRAP, CHEF!</p><h2 tabindex="-1">Nice service.</h2><strong class="result-earnings">${money(game.revenue)}</strong><p>${game.completedOrders} ${game.completedOrders === 1 ? 'dish' : 'dishes'} served <span aria-hidden="true">·</span> Best combo ${game.bestCombo}×</p><button class="button primary" data-action="again">One more rush <span aria-hidden="true">→</span></button></div>`;
    overlaySignature = newOverlaySignature;
  }
}

$('start-button').addEventListener('click', () => start());
$('resume-button').addEventListener('click', () => start(true));
$('pause-button').addEventListener('click', togglePause);
$('restart-button').addEventListener('click', () => start());
$('offers').addEventListener('click', event => {
  const button = event.target.closest('[data-slot]');
  if (button && !button.disabled) dispatch({ type: 'select', slot: Number(button.dataset.slot) });
});
$('board-overlay').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (button?.dataset.action === 'resume') togglePause();
  if (button?.dataset.action === 'again') start();
});

function stopHold() { clearInterval(holdTimer); holdTimer = undefined; }
for (const button of document.querySelectorAll('[data-direction]')) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    event.preventDefault(); stopHold();
    dispatch({ type: 'move', direction: button.dataset.direction });
    holdTimer = setInterval(() => dispatch({ type: 'move', direction: button.dataset.direction }), BALANCE.moveCooldownMs + 15);
  });
  button.addEventListener('click', event => {
    if (event.detail === 0) dispatch({ type: 'move', direction: button.dataset.direction });
  });
}
window.addEventListener('pointerup', stopHold);
window.addEventListener('pointercancel', stopHold);
const directions = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' };
window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.matches('input, textarea, select')) return;
  const key = event.key.toLowerCase();
  if (['running', 'paused'].includes(mode) && (key === 'p' || event.key === 'Escape')) { event.preventDefault(); if (!event.repeat) togglePause(); return; }
  if (mode !== 'running') return;
  const direction = directions[event.key] ?? directions[key];
  if (direction) { event.preventDefault(); dispatch({ type: 'move', direction }); }
  if (['1', '2', '3'].includes(key)) { event.preventDefault(); dispatch({ type: 'select', slot: Number(key) - 1 }); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'running') togglePause(); });
window.addEventListener('blur', () => { stopHold(); if (mode === 'running') togglePause(); });
window.addEventListener('pagehide', persist);
render();
setInterval(() => { if (mode === 'running') { advance(); render(); } }, 50);
