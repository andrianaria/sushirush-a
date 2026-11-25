import test from 'node:test';
import assert from 'node:assert/strict';
import { createDragController, dampingAlpha } from './dragController.ts';
import { advanceGame, applyAction, BALANCE, createGame, replayGame } from '../game/engine.ts';
import type { GameAction } from '../game/engine.ts';

test('small touch jitter stays idle; a deliberate short drag starts on the next frame', () => {
  const drag = createDragController();
  drag.begin(1, 100, 100);
  drag.move(1, 103, 102);
  assert.equal(drag.tick(0), null);
  drag.move(1, 106, 100);
  assert.equal(drag.tick(16), 'right');
});

test('reversals and turns follow local finger travel far from the original anchor', () => {
  const drag = createDragController();
  drag.begin(1, 0, 0);
  drag.move(1, 100, 0);
  assert.equal(drag.tick(0), 'right');
  for (let x = 99; x >= 94; x--) drag.move(1, x, 0);
  assert.equal(drag.snapshot().direction, 'left');
  assert.equal(drag.tick(120), 'left');
  assert.ok(drag.snapshot().offset.x < 0);
  drag.move(1, 94, -6);
  assert.equal(drag.tick(240), 'up');
  assert.ok(drag.snapshot().offset.y < 0);
});

test('diagonal continuation and small opposing noise do not cause phantom turns', () => {
  const drag = createDragController();
  drag.begin(1, 0, 0); drag.move(1, 10, 0);
  for (let n = 1; n <= 40; n++) drag.move(1, 10 + n * 2, n);
  assert.equal(drag.snapshot().direction, 'right');
  drag.move(1, 88, 40); drag.move(1, 88, 40); // zero motion retains intent
  drag.move(1, 90, 40); // forward travel clears that brief reversal
  drag.move(1, 87, 40);
  assert.equal(drag.snapshot().direction, 'right');
  drag.move(1, 84, 40);
  assert.equal(drag.snapshot().direction, 'left');
});

test('cadence remembers the latest turn without an early hop or catch-up burst', () => {
  const drag = createDragController();
  drag.begin(1, 0, 0); drag.move(1, 10, 0);
  assert.equal(drag.tick(50), 'right');
  drag.move(1, 10, -7);
  assert.equal(drag.tick(145), null);
  assert.equal(drag.tick(170), 'up');
  assert.equal(drag.tick(1000), 'up');
  assert.equal(drag.tick(1000), null);
  assert.equal(drag.tick(1001), null);
  assert.equal(drag.tick(1120), 'up');
});

test('release, cancel and disable stop movement; a new gesture retains the cooldown', () => {
  const drag = createDragController();
  drag.begin(1, 0, 0); drag.move(1, 10, 0);
  assert.equal(drag.tick(0), 'right');
  assert.equal(drag.begin(2, 0, 0), false);
  drag.move(2, 0, -100);
  assert.equal(drag.snapshot().direction, 'right');
  assert.equal(drag.end(2), false);
  assert.equal(drag.end(1), true);
  assert.equal(drag.tick(1000), null);
  drag.begin(3, 0, 0); drag.move(3, 0, 10);
  assert.equal(drag.tick(60), null);
  assert.equal(drag.tick(120), 'down');
  drag.end(); // Shared cancellation path for pause, blur and lost capture.
  assert.equal(drag.tick(2000), null);
  assert.equal(drag.end(), false);
});

test('the floating visual stick stays close to the finger', () => {
  const drag = createDragController();
  drag.begin(1, 0, 0); drag.move(1, 500, 300);
  const { anchor, offset } = drag.snapshot();
  assert.ok(Math.hypot(offset.x, offset.y) <= 26.00001);
  assert.ok(anchor.x > 450 && anchor.y > 250);
});

test('chef damping settles consistently at different frame rates', () => {
  const settle = (fps: number) => {
    let position = 0;
    for (let frame = 0; frame < fps; frame++) position += (1 - position) * dampingAlpha(1 / fps, 24);
    return position;
  };
  assert.ok(Math.abs(settle(30) - settle(120)) < 1e-12);
  assert.equal(dampingAlpha(-1, 24), 0);
});

test('30/60/120 Hz dragging with turns and a frame stall produces accepted, replayable grid moves', () => {
  for (const fps of [30, 60, 120]) {
    const seed = 60;
    const drag = createDragController({ repeatMs: BALANCE.moveCooldownMs + 10 });
    const actions: GameAction[] = [];
    let state = createGame(seed);
    const corners = [{ x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 2 }];
    let corner = 0, fingerX = 0, fingerY = 0;
    drag.begin(1, fingerX, fingerY);
    for (let frame = 0; frame <= fps * 3; frame++) {
      const now = frame * 1000 / fps;
      if (now > 500 && now < 1000) continue; // No catch-up steps after this stall.
      if (state.position.x === corners[corner].x && state.position.y === corners[corner].y) corner = (corner + 1) % corners.length;
      const target = corners[corner];
      const intended = target.x > state.position.x ? 'right' : target.x < state.position.x ? 'left' : target.y > state.position.y ? 'up' : 'down';
      if (drag.snapshot().direction !== intended) {
        fingerX += intended === 'right' ? 12 : intended === 'left' ? -12 : 0;
        fingerY += intended === 'down' ? 12 : intended === 'up' ? -12 : 0;
        drag.move(1, fingerX, fingerY);
      }
      const direction = drag.tick(now);
      if (!direction) continue;
      const action: GameAction = { type: 'move', direction, at: Math.floor(now) };
      const next = applyAction(state, action);
      assert.equal(next.lastMoveAt, action.at, `${fps} Hz hop must be accepted by the real engine`);
      if (actions.length) assert.ok(action.at - actions[actions.length - 1].at >= BALANCE.moveCooldownMs);
      state = next;
      actions.push(action);
    }
    assert.ok(actions.length > 12);
    assert.equal(actions.filter(action => action.at === 1000).length, 1);
    assert.deepEqual(replayGame(seed, actions, 3000), advanceGame(state, 3000));
    drag.end();
    assert.equal(drag.tick(4000), null);
  }
});
