import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, advanceGame, createGame, replayGame, RULES_VERSION } from '../src/game/engine.js';
import { CATALOG_REVISION } from '../src/game/balance.js';

let moduleId = 0;
const freshStorage = () => import(`../src/storage.js?storage-test=${moduleId++}`);
function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

const valid = {
  version: RULES_VERSION,
  catalogRevision: CATALOG_REVISION,
  seed: 60,
  actions: [{ type: 'move', direction: 'left', at: 150 }],
  elapsedMs: 500,
};

test('malformed and tampered saved rounds cannot be resumed', async () => {
  const { readSession, validSession } = await freshStorage();
  const storage = memoryStorage();
  assert.equal(validSession(valid), true);
  for (const value of [
    null, {}, { ...valid, version: -1 }, { ...valid, catalogRevision: -1 },
    { ...valid, seed: 0 }, { ...valid, seed: 0x100000000 },
    { ...valid, elapsedMs: -1 }, { ...valid, elapsedMs: 60000 },
    { ...valid, elapsedMs: 100.5 }, { ...valid, actions: Array(10001).fill(valid.actions[0]) },
    { ...valid, actions: [{ type: 'serve', at: 1 }] },
    { ...valid, actions: [{ type: 'select', slot: 3, at: 1 }] },
    { ...valid, actions: [{ type: 'move', direction: 'warp', at: 1 }] },
    { ...valid, actions: [{ type: 'move', direction: 'left', at: 501 }] },
    { ...valid, actions: [{ type: 'move', direction: 'left', at: -1 }] },
    { ...valid, actions: [{ type: 'select', slot: 1, at: 100 }, { type: 'select', slot: 2, at: 99 }] },
  ]) {
    assert.equal(validSession(value), false, JSON.stringify(value)?.slice(0, 150));
    storage.setItem('sushi-rush-60-session-v1', JSON.stringify(value));
    assert.equal(readSession(storage), null);
  }
  storage.setItem('sushi-rush-60-session-v1', '{broken JSON');
  assert.equal(readSession(storage), null);
});

test('saved input history restores the same clock, position, selected order, and progress', async () => {
  const { saveSession, readSession, clearSession } = await freshStorage();
  const storage = memoryStorage();
  const actions = [
    { type: 'select', slot: 1, at: 0 },
    { type: 'move', direction: 'left', at: 150 },
    { type: 'move', direction: 'left', at: 300 },
    { type: 'move', direction: 'up', at: 450 },
  ];
  let live = createGame(77);
  for (const action of actions) live = applyAction(live, action);
  live = advanceGame(live, 1000);
  assert.equal(live.stepIndex, 1);
  assert.equal(saveSession(77, actions, 1000, storage), true);
  const saved = readSession(storage);
  assert.deepEqual(replayGame(saved.seed, saved.actions, saved.elapsedMs), live);
  clearSession(storage);
  assert.equal(readSession(storage), null);
});

test('a blocked localStorage getter does not prevent play or local results', async () => {
  const storage = await freshStorage();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('Storage access denied'); },
  });
  try {
    assert.equal(storage.readSession(), null);
    assert.equal(storage.saveSession(valid.seed, valid.actions, valid.elapsedMs), false);
    assert.doesNotThrow(() => storage.clearSession());
    assert.deepEqual(storage.readHistory(), []);
    storage.recordResult({ revenue: 55000, completedOrders: 1 });
    storage.recordResult({ revenue: 0, completedOrders: 0 });
    assert.equal(Math.max(...storage.readHistory().map(run => run.revenue)), 55000);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('the personal best survives more than twenty later results and page reload', async () => {
  const storage = memoryStorage();
  let api = await freshStorage();
  api.recordResult({ revenue: 250000, completedOrders: 5 }, storage);
  for (let index = 0; index < 25; index++) api.recordResult({ revenue: index, completedOrders: 0 }, storage);
  let history = api.readHistory(storage);
  assert.equal(history.length, 20);
  assert.equal(history[0].revenue, 250000);
  api = await freshStorage();
  history = api.readHistory(storage);
  assert.equal(history.length, 20);
  assert.equal(history[0].revenue, 250000);
  assert.ok(history.some(run => run.revenue === 24));
});

test('quota failure preserves new personal best even when persisted history is stale', async () => {
  const api = await freshStorage();
  const storage = memoryStorage();
  api.recordResult({ revenue: 33000, completedOrders: 1 }, storage);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.equal(api.saveSession(valid.seed, valid.actions, valid.elapsedMs, storage), false);
  api.recordResult({ revenue: 55000, completedOrders: 1 }, storage);
  api.recordResult({ revenue: 0, completedOrders: 0 }, storage);
  assert.equal(api.readHistory(storage)[0].revenue, 55000);
  assert.equal(api.readHistory(storage).length, 3);
});

test('malformed history entries are ignored without discarding valid results', async () => {
  const api = await freshStorage();
  const storage = memoryStorage();
  storage.setItem('sushi-rush-60-history-v1', JSON.stringify([
    null, { revenue: -1, completedOrders: 1, at: '2026-11-24T00:00:00Z' },
    { revenue: 55000, completedOrders: 1, at: '2026-11-24T00:00:00Z' },
    { revenue: 1, completedOrders: 1, at: 'invalid' },
  ]));
  assert.equal(api.readHistory(storage).length, 1);
  assert.equal(api.readHistory(storage)[0].revenue, 55000);
});
