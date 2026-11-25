import { getRecipe, RECIPES, SERVING_BAR, STATIONS } from './recipes.js';
import { BALANCE, RULES_VERSION } from './balance.js';
export { BALANCE, MENU_PRICES, PRICE_SOURCE, RULES_VERSION } from './balance.js';
export { getRecipe, RECIPES, RECIPE_NOTES, SERVING_BAR, STATIONS } from './recipes.js';
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function normalizeSeed(seed) {
    return Number.isFinite(seed) ? (Math.floor(seed) >>> 0) || 1 : 1;
}
function seededRandom(seed) {
    let value = normalizeSeed(seed);
    return () => {
        value += 0x6d2b79f5;
        let result = Math.imul(value ^ (value >>> 15), value | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
}
/** Seeds must be shared across a competition day to give every player the same queue. */
export function getRecipeForOrder(seed, orderIndex) {
    const index = Number.isFinite(orderIndex) ? Math.max(0, Math.floor(orderIndex)) : 0;
    const initial = ['cheesy', 'balinese', 'sashibi'];
    if (index < initial.length)
        return getRecipe(initial[index]);
    const random = seededRandom(normalizeSeed(seed) ^ Math.imul(index + 1, 2654435761));
    if ((index + 1) % BALANCE.jackpotEvery === 0) {
        const cakes = RECIPES.filter((recipe) => recipe.jackpot);
        return cakes[Math.floor(random() * cakes.length)];
    }
    const normal = RECIPES.filter((recipe) => !recipe.jackpot && recipe.price !== null);
    return normal[Math.floor(random() * normal.length)];
}
/** Keep choices distinct without changing the deterministic jackpot schedule. */
function replacementRecipe(state) {
    const candidate = getRecipeForOrder(state.seed, state.generatedOrders);
    const others = state.offers.filter((_, slot) => slot !== state.selectedSlot).map((recipe) => recipe.id);
    if (!others.includes(candidate.id) && candidate.id !== state.order.id)
        return candidate;
    const alternatives = RECIPES.filter((recipe) => recipe.price !== null && recipe.jackpot === candidate.jackpot && !others.includes(recipe.id));
    const different = alternatives.filter((recipe) => recipe.id !== state.order.id);
    const available = different.length ? different : alternatives;
    const random = seededRandom(state.seed ^ Math.imul(state.generatedOrders + 1, 2246822519));
    return available[Math.floor(random() * available.length)];
}
function deadlineFor(order, orderIndex, at) {
    const normal = Math.max(BALANCE.minimumOrderMs, BALANCE.initialOrderMs - orderIndex * BALANCE.orderAccelerationMs
        - Math.floor(at / BALANCE.rushIntervalMs) * BALANCE.rushAccelerationMs);
    return normal + (order.jackpot ? BALANCE.jackpotExtraMs : 0);
}
export function createGame(seed) {
    const normalized = normalizeSeed(seed);
    const offers = [0, 1, 2].map((index) => getRecipeForOrder(normalized, index));
    const order = offers[0];
    return {
        version: RULES_VERSION, seed: normalized, elapsedMs: 0, score: 0, revenue: 0, completedOrders: 0,
        bestCombo: 0, combo: 0, satisfaction: BALANCE.startingSatisfaction,
        position: { x: 2, y: 2 }, order, offers, selectedSlot: 0, stepIndex: 0, orderIndex: 0, generatedOrders: 3,
        orderStartedAt: 0, orderDeadlineMs: deadlineFor(order, 0, 0), mistakes: 0,
        events: [], lastEventId: 0, lastMoveAt: -BALANCE.moveCooldownMs,
        lastServeAt: -1, servedOrders: [], finished: false,
    };
}
export const createInitialState = createGame;
function emit(state, event) {
    const lastEventId = state.lastEventId + 1;
    return {
        ...state, lastEventId,
        events: [...state.events, { ...event, at: state.elapsedMs, id: lastEventId }].slice(-BALANCE.maxEvents),
    };
}
function nextOrder(state) {
    const orderIndex = state.orderIndex + 1;
    const order = replacementRecipe(state);
    const offers = [...state.offers];
    offers[state.selectedSlot] = order;
    return {
        ...state, order, offers, orderIndex, generatedOrders: state.generatedOrders + 1, stepIndex: 0, orderStartedAt: state.elapsedMs,
        orderDeadlineMs: deadlineFor(order, orderIndex, state.elapsedMs),
    };
}
function mistake(state, message, station) {
    return emit({
        ...state, combo: 0,
        satisfaction: Math.max(0, state.satisfaction - BALANCE.mistakeSatisfaction),
        mistakes: state.mistakes + 1,
    }, { type: 'mistake', message, ...(station ? { station } : {}) });
}
/** Only a successful movement into the serving bar may call this function. */
function deliverReadyOrder(state) {
    if (state.stepIndex < state.order.steps.length)
        return state;
    const amount = state.order.price;
    if (amount === null)
        return mistake(state, 'Harga menu belum terverifikasi. Pesanan ini belum tersedia.');
    const combo = state.combo + 1;
    const revenue = state.revenue + amount;
    return nextOrder(emit({
        ...state, score: revenue, revenue, lastServeAt: state.elapsedMs,
        completedOrders: state.completedOrders + 1,
        combo, bestCombo: Math.max(combo, state.bestCombo),
        satisfaction: Math.min(BALANCE.maximumSatisfaction, state.satisfaction + BALANCE.servedSatisfaction),
        servedOrders: [...state.servedOrders, {
                recipeId: state.order.id, at: state.elapsedMs, score: amount, revenue: amount, combo, jackpot: state.order.jackpot,
            }],
    }, { type: 'serve', message: state.order.jackpot ? 'Sushi cake tersaji. Omzet bertambah!' : 'Pesanan tersaji. Omzet bertambah!', points: amount, revenue: amount }));
}
/** Advance to an absolute round timestamp. This also expires unattended orders. */
export function advanceGame(state, elapsedMs) {
    if (state.finished || !Number.isFinite(elapsedMs))
        return state;
    const target = clamp(Math.floor(elapsedMs), state.elapsedMs, BALANCE.durationMs);
    let current = state;
    let expiry = current.orderStartedAt + current.orderDeadlineMs;
    while (expiry <= target && expiry < BALANCE.durationMs) {
        current = { ...current, elapsedMs: expiry };
        current = emit({
            ...current, combo: 0,
            satisfaction: Math.max(0, current.satisfaction - BALANCE.timeoutSatisfaction),
            mistakes: current.mistakes + 1,
        }, { type: 'timeout', message: 'Pesanan terlambat. Ayo mulai pesanan berikutnya!' });
        current = nextOrder(current);
        expiry = current.orderStartedAt + current.orderDeadlineMs;
    }
    current = { ...current, elapsedMs: target };
    if (target === BALANCE.durationMs) {
        current = emit({ ...current, finished: true }, { type: 'finish', message: 'Waktu habis. Terima kasih, kru!' });
    }
    return current;
}
export function validateGameAction(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    if (typeof candidate.at !== 'number' || !Number.isFinite(candidate.at))
        return false;
    if (candidate.type === 'select')
        return Number.isInteger(candidate.slot) && [0, 1, 2].includes(candidate.slot);
    return candidate.type === 'move' && typeof candidate.direction === 'string'
        && ['up', 'down', 'left', 'right'].includes(candidate.direction);
}
/** Immutable and JSON-safe; use the same function to validate an official replay. */
export function applyAction(state, action) {
    if (state.finished || !validateGameAction(action) || action.at < state.elapsedMs)
        return state;
    let current = advanceGame(state, action.at);
    if (current.finished)
        return current;
    if (action.type === 'select') {
        if (action.slot === current.selectedSlot)
            return current;
        const order = current.offers[action.slot];
        const hadProgress = current.stepIndex > 0;
        return emit({ ...current, selectedSlot: action.slot, order, stepIndex: 0 }, {
            type: 'select',
            message: hadProgress ? 'Ganti pesanan. Langkah dimulai ulang; timer tetap berjalan.' : `Prioritaskan ${order.name}.`,
        });
    }
    if (current.elapsedMs - current.lastMoveAt < BALANCE.moveCooldownMs)
        return current;
    const delta = {
        up: { x: 0, y: 1 }, down: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    };
    const change = delta[action.direction];
    const position = {
        x: clamp(current.position.x + change.x, 0, BALANCE.gridSize - 1),
        y: clamp(current.position.y + change.y, 0, BALANCE.gridSize - 1),
    };
    // A wall tap has no gameplay effect and cannot repeatedly pick up a station.
    if (position.x === current.position.x && position.y === current.position.y)
        return current;
    current = { ...current, position, lastMoveAt: current.elapsedMs };
    if (position.x === SERVING_BAR.x && position.y === SERVING_BAR.y)
        return deliverReadyOrder(current);
    const station = Object.values(STATIONS).find((item) => item.x === position.x && item.y === position.y);
    if (!station || current.stepIndex >= current.order.steps.length)
        return current;
    const expected = current.order.steps[current.stepIndex];
    if (expected.station !== station.id) {
        return mistake(current, `Belum di sini. Menuju ${STATIONS[expected.station].name}.`, station.id);
    }
    return emit({ ...current, stepIndex: current.stepIndex + 1 }, {
        type: 'step', message: expected.label, station: station.id,
    });
}
export function replayGame(seed, actions, durationMs = BALANCE.durationMs) {
    let state = createGame(seed);
    for (const action of actions)
        state = applyAction(state, action);
    return advanceGame(state, durationMs);
}
