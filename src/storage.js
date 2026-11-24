import { BALANCE, RULES_VERSION, validateGameAction } from './game/engine.js';
import { CATALOG_REVISION } from './game/balance.js';

const SESSION_KEY = 'sushi-rush-60-session-v1';
const HISTORY_KEY = 'sushi-rush-60-history-v1';
let memoryHistory = [];

export function validSession(value) {
  if (!value || value.version !== RULES_VERSION || value.catalogRevision !== CATALOG_REVISION ||
      !Number.isInteger(value.seed) || value.seed < 1 || value.seed > 0xffffffff ||
      !Number.isInteger(value.elapsedMs) || value.elapsedMs < 0 || value.elapsedMs >= BALANCE.durationMs ||
      !Array.isArray(value.actions) || value.actions.length > 10000) return false;
  let previous = 0;
  return value.actions.every(action => {
    if (!validateGameAction(action) || !Number.isInteger(action.at) || action.at < previous || action.at > value.elapsedMs) return false;
    previous = action.at;
    return true;
  });
}

export function readSession(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const value = JSON.parse(target.getItem(SESSION_KEY));
    return validSession(value) ? value : null;
  } catch { return null; }
}

export function saveSession(seed, actions, elapsedMs, storage) {
  const value = { version: RULES_VERSION, catalogRevision: CATALOG_REVISION, seed, actions, elapsedMs };
  if (!validSession(value)) return false;
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target.setItem(SESSION_KEY, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function clearSession(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target.removeItem(SESSION_KEY);
  } catch { /* The game remains playable without persistent storage. */ }
}

function validResult(run) {
  return run && Number.isSafeInteger(run.revenue) && run.revenue >= 0 &&
    Number.isSafeInteger(run.completedOrders) && run.completedOrders >= 0 &&
    typeof run.at === 'string' && Number.isFinite(Date.parse(run.at));
}

function keepHistory(runs) {
  const seen = new Set();
  const unique = runs.filter(run => {
    if (!validResult(run)) return false;
    const key = `${run.at}:${run.revenue}:${run.completedOrders}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!unique.length) return [];
  const best = unique.reduce((a, b) => a.revenue >= b.revenue ? a : b);
  return [best, ...unique.filter(run => run !== best)].slice(0, 20);
}

export function readHistory(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const value = JSON.parse(target.getItem(HISTORY_KEY));
    if (Array.isArray(value)) memoryHistory = keepHistory([...memoryHistory, ...value]);
  } catch { /* Retain results from this tab if browser storage is blocked. */ }
  return memoryHistory.map(run => ({ ...run }));
}

export function recordResult(game, storage) {
  const result = { revenue: game.revenue, completedOrders: game.completedOrders, at: new Date().toISOString() };
  memoryHistory = keepHistory([result, ...readHistory(storage)]);
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target.setItem(HISTORY_KEY, JSON.stringify(memoryHistory));
  } catch { /* The personal best remains available for this tab. */ }
  return memoryHistory.map(run => ({ ...run }));
}
