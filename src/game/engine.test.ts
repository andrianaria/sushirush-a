import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAction, advanceGame, BALANCE, createGame, getRecipe, getRecipeForOrder, RECIPES,
  MENU_PRICES, PRICE_SOURCE, replayGame, RULES_VERSION, SERVING_BAR, STATIONS, validateGameAction,
} from './engine.ts'
import type { Direction, GameAction, GameState } from './engine.ts'

/** Find a path that avoids collecting a station out of sequence. */
function pathTo(state: GameState, target: { x: number; y: number }): Direction[] {
  const seen = new Set<string>()
  const queue = [{ ...state.position, path: [] as Direction[] }]
  const moves: [Direction, number, number][] = [['up', 0, 1], ['down', 0, -1], ['left', -1, 0], ['right', 1, 0]]
  for (let index = 0; index < queue.length; index++) {
    const position = queue[index]!
    if (position.x === target.x && position.y === target.y) return position.path
    for (const [direction, dx, dy] of moves) {
      const x = position.x + dx
      const y = position.y + dy
      const key = `${x},${y}`
      if (x < 0 || y < 0 || x >= BALANCE.gridSize || y >= BALANCE.gridSize || seen.has(key)) continue
      const blocked = Object.values(STATIONS).some((station) => station.x === x && station.y === y)
      if (blocked && (x !== target.x || y !== target.y)) continue
      seen.add(key)
      queue.push({ x, y, path: [...position.path, direction] })
    }
  }
  throw new Error('No path to station')
}

function walkTo(start: GameState, target: { x: number; y: number }, actions: GameAction[] = [], pace = 150): GameState {
  let state = start
  for (const direction of pathTo(state, target)) {
    const action: GameAction = { type: 'move', direction, at: state.elapsedMs + pace }
    actions.push(action)
    state = applyAction(state, action)
  }
  return state
}

function collectOrder(start: GameState, actions: GameAction[] = []): GameState {
  let state = start
  const totalSteps = state.order.steps.length
  while (state.stepIndex < totalSteps) {
    const target = STATIONS[state.order.steps[state.stepIndex]!.station]
    state = walkTo(state, target, actions)
  }
  return state
}

function serveOrder(start: GameState, actions: GameAction[] = []): GameState {
  return walkTo(collectOrder(start, actions), SERVING_BAR, actions)
}

test('confirmed Laksa appears in the queue and earns exactly Rp55.000 through replay', () => {
  const seed = Array.from({ length: 1000 }, (_, i) => i + 1).find((value) => getRecipeForOrder(value, 3).id === 'laksa')
  assert.ok(seed)
  const actions: GameAction[] = []
  let state = serveOrder(createGame(seed), actions)
  assert.equal(state.order.id, 'laksa')
  state = serveOrder(state, actions)
  assert.equal(state.servedOrders.at(-1)!.revenue, 55_000)
  assert.equal(state.revenue, 88_000)
  assert.equal(state.mistakes, 0)
  assert.deepEqual(replayGame(seed, actions, state.elapsedMs), state)
})

test('recipe source preserves active HPP ingredients and exact cake compositions', () => {
  assert.equal(RECIPES.length, 10)
  for (const recipe of RECIPES.filter((recipe) => !recipe.jackpot)) {
    assert.ok(recipe.steps.length >= 3 && recipe.steps.length <= 5)
    const ingredients = recipe.steps.flatMap((step) => step.ingredients)
    assert.equal(new Set(ingredients).size, ingredients.length)
    assert.equal(ingredients.some((ingredient) => /spicy mayo|teriyaki|susu kedelai/i.test(ingredient)), false)
  }
  const sashibi = getRecipe('sashibi').steps.flatMap((step) => step.ingredients)
  assert.ok(sashibi.includes('tuna'))
  assert.equal(sashibi.some((ingredient) => /salmon/i.test(ingredient)), false)
  assert.ok(getRecipe('laksa').steps[0]!.ingredients.includes('mi ramen'))
  assert.deepEqual(getRecipe('sakura-cake').components, ['Cheesy Roll', 'California Roll', 'Tamago Maki'])
  assert.deepEqual(getRecipe('hikari-cake').components, ['Spicy Niku Roll', 'Spicy Butterfish Roll', 'Spicy Tuna Maki'])
  assert.deepEqual(getRecipe('kokoro-cake').components, ['Salmon Mentai Maki', 'Salmon Mozza', 'Spicy Tuna Roll', 'Tanuki Maki'])
})

test('same seed has the same order stream with fifth-order jackpot and fixed starter', () => {
  const first = Array.from({ length: 20 }, (_, index) => getRecipeForOrder(77, index).id)
  const second = Array.from({ length: 20 }, (_, index) => getRecipeForOrder(77, index).id)
  assert.deepEqual(first, second)
  assert.equal(first[0], 'cheesy')
  assert.notDeepEqual(first, Array.from({ length: 20 }, (_, index) => getRecipeForOrder(78, index).id))
  for (let index = 0; index < 20; index++) assert.equal(getRecipe(first[index]!).jackpot, (index + 1) % 5 === 0)
  assert.equal(first.includes('laksa'), true)
})

test('three initial choices have verified prices and let players prioritize higher revenue', () => {
  const initial = createGame(12)
  assert.equal(initial.version, RULES_VERSION)
  assert.equal(initial.version, 3)
  assert.deepEqual(initial.offers.map((recipe) => [recipe.id, recipe.price]), [
    ['cheesy', 33_000], ['balinese', 25_000], ['sashibi', 55_000],
  ])
  assert.equal(PRICE_SOURCE.source, 'fictional-game-economy')
  assert.equal(getRecipe('laksa').price, 55_000)
  assert.equal(MENU_PRICES['chicken-miso'], 29_000)
  assert.equal(MENU_PRICES['salmon-mozza'], 33_000)
  assert.equal(MENU_PRICES.rendang, 29_000)
  const selected = applyAction(initial, { type: 'select', slot: 2, at: 0 })
  assert.equal(selected.order.id, 'sashibi')
  assert.equal(selected.selectedSlot, 2)
  const high = serveOrder(selected)
  const standard = serveOrder(initial)
  assert.equal(high.revenue, 55_000)
  assert.equal(standard.revenue, 33_000)
  assert.equal(high.score, high.revenue)
  assert.ok(high.revenue > standard.revenue)
  assert.equal(high.offers[0], initial.offers[0])
  assert.equal(high.offers[1], initial.offers[1])
  assert.notEqual(high.offers[2].id, initial.offers[2].id)
  assert.equal(new Set(high.offers.map((recipe) => recipe.id)).size, 3)
})

test('moving collects only the correct station, with bounded positions and cooldown', () => {
  const initial = createGame(12)
  let state = applyAction(initial, { type: 'move', direction: 'up', at: 0 })
  assert.deepEqual(initial.position, { x: 2, y: 2 })
  assert.deepEqual(state.position, { x: 2, y: 3 })
  state = applyAction(state, { type: 'move', direction: 'up', at: 50 })
  assert.deepEqual(state.position, { x: 2, y: 3 })
  state = applyAction(state, { type: 'move', direction: 'up', at: 110 })
  assert.equal(state.stepIndex, 0)
  assert.equal(state.mistakes, 1)
  assert.equal(state.satisfaction, 92)
  state = applyAction(state, { type: 'move', direction: 'up', at: 220 })
  assert.equal(state.position.y, 4)
  assert.equal(state.mistakes, 1, 'wall tap does not recollect wrong station')
  for (const direction of pathTo(state, STATIONS.rice)) state = applyAction(state, { type: 'move', direction, at: state.elapsedMs + 150 })
  assert.equal(state.stepIndex, 1)
})

test('revenue is the exact menu price, combo and speed add no artificial money, errors retain earnings', () => {
  let state = serveOrder(createGame(42))
  assert.equal(state.completedOrders, 1)
  assert.equal(state.combo, 1)
  assert.equal(state.score, 33_000)
  assert.equal(state.revenue, MENU_PRICES['cheesy'])
  assert.equal(state.servedOrders[0]!.revenue, 33_000)
  assert.equal(state.events.at(-1)!.revenue, 33_000)
  assert.equal(state.orderIndex, 1)
  const secondPrice = state.order.price!
  state = serveOrder(state)
  assert.equal(state.bestCombo, 2)
  assert.equal(state.revenue, 33_000 + secondPrice)
  const before = state.score
  const wrong = Object.values(STATIONS).find((station) => station.id !== state.order.steps[0]!.station)!
  state = walkTo(state, wrong)
  assert.equal(state.score, before)
  assert.equal(state.revenue, before)
  assert.equal(state.completedOrders, 2)
  assert.equal(state.combo, 0)
  assert.equal(state.bestCombo, 2)
  assert.equal(state.mistakes, 1)
  const afterTimeout = advanceGame(state, state.orderStartedAt + state.orderDeadlineMs)
  assert.equal(afterTimeout.revenue, before)
  assert.equal(afterTimeout.score, before)
})

test('switching resets recipe steps but cannot extend the shared deadline or spend earned revenue', () => {
  let state = createGame(6)
  for (const direction of pathTo(state, STATIONS.rice)) state = applyAction(state, { type: 'move', direction, at: state.elapsedMs + 150 })
  assert.equal(state.stepIndex, 1)
  const deadline = state.orderDeadlineMs
  const started = state.orderStartedAt
  const switched = applyAction(state, { type: 'select', slot: 2, at: state.elapsedMs + 150 })
  assert.equal(switched.stepIndex, 0)
  assert.equal(switched.order.id, 'sashibi')
  assert.equal(switched.orderDeadlineMs, deadline)
  assert.equal(switched.orderStartedAt, started)
  assert.equal(switched.mistakes, 0)
  assert.equal(switched.revenue, 0)
  assert.equal(switched.position, state.position)
  let current = switched
  for (let at = 1000; at < 16_000; at += 1000) current = applyAction(current, { type: 'select', slot: at % 2000 === 0 ? 1 : 2, at })
  const timedOut = advanceGame(current, 16_000)
  assert.equal(timedOut.orderIndex, 1)
  assert.equal(timedOut.mistakes, 1)
  assert.equal(timedOut.orderStartedAt, 16_000)
})

test('same-slot selection keeps progress and cannot credit duplicate revenue', () => {
  let state = createGame(2)
  for (const direction of pathTo(state, STATIONS.rice)) state = applyAction(state, { type: 'move', direction, at: state.elapsedMs + 150 })
  const selected = applyAction(state, { type: 'select', slot: 0, at: state.elapsedMs + 1 })
  assert.equal(selected.stepIndex, 1)
  assert.equal(selected.revenue, 0)
})

test('the starter order needs thirteen ingredient moves plus five delivery moves at a relaxed tap rate', () => {
  let state = createGame(3)
  const route: Direction[] = [
    'left', 'left', 'up', // Nasi & Nori
    'up', 'right', 'right', // Isian
    'right', 'down', 'down', 'down', 'right', // Protein; avoid Finishing until ready
    'up', 'up', // Finishing
  ]
  for (const direction of route) state = applyAction(state, { type: 'move', direction, at: state.elapsedMs + 500 })
  assert.equal(state.stepIndex, 4)
  assert.equal(state.mistakes, 0)
  assert.equal(state.elapsedMs, 6_500)
  assert.equal(state.revenue, 0)
  state = walkTo(state, SERVING_BAR, [], 500)
  assert.equal(state.elapsedMs, 9_000)
  assert.equal(state.completedOrders, 1)
  assert.equal(state.combo, 1)
})

test('an empty serving bar is neutral, and a complete recipe earns nothing before delivery', () => {
  const empty = walkTo(createGame(9), SERVING_BAR)
  assert.deepEqual(empty.position, { x: 2, y: 0 })
  assert.equal(empty.revenue, 0)
  assert.equal(empty.completedOrders, 0)
  assert.equal(empty.mistakes, 0)
  assert.equal(empty.lastServeAt, -1)
  const ready = collectOrder(empty)
  assert.equal(ready.stepIndex, ready.order.steps.length)
  assert.equal(ready.revenue, 0)
  assert.equal(ready.completedOrders, 0)
  assert.equal(ready.servedOrders.length, 0)
  const oldAction = { type: 'serve', at: ready.elapsedMs + 150 } as unknown as GameAction
  assert.equal(validateGameAction(oldAction), false)
  assert.equal(applyAction(ready, oldAction), ready, 'a manual serve cannot bypass the walk to the bar')
})

test('carrying an order allows crossing ingredient tiles and delivers once on entry to the bar', () => {
  let state = collectOrder(createGame(9))
  for (const direction of ['down', 'down'] as Direction[]) state = applyAction(state, { type: 'move', direction, at: state.elapsedMs + 150 })
  assert.deepEqual(state.position, { x: STATIONS.protein.x, y: STATIONS.protein.y })
  assert.equal(state.stepIndex, state.order.steps.length)
  assert.equal(state.mistakes, 0)
  assert.equal(state.revenue, 0)
  state = walkTo(state, SERVING_BAR)
  const deliveredAt = state.elapsedMs
  assert.equal(state.revenue, 33_000)
  assert.equal(state.completedOrders, 1)
  assert.equal(state.lastServeAt, deliveredAt)
  assert.equal(state.servedOrders.length, 1)
  assert.equal(state.events.at(-1)!.type, 'serve')
  assert.equal(state.stepIndex, 0)
  state = applyAction(state, { type: 'move', direction: 'down', at: state.elapsedMs + 150 })
  state = applyAction(state, { type: 'move', direction: 'up', at: state.elapsedMs + 150 })
  state = applyAction(state, { type: 'move', direction: 'down', at: state.elapsedMs + 150 })
  assert.equal(state.revenue, 33_000, 'wall taps and re-entering an empty bar never duplicate revenue')
  assert.equal(state.completedOrders, 1)
  assert.equal(state.servedOrders.length, 1)
  assert.equal(state.lastServeAt, deliveredAt)
})

test('auto delivery obeys the same movement cooldown as every other tile', () => {
  const ready = walkTo(collectOrder(createGame(2)), { x: SERVING_BAR.x, y: SERVING_BAR.y + 1 })
  const tooEarly = applyAction(ready, { type: 'move', direction: 'down', at: ready.lastMoveAt + BALANCE.moveCooldownMs - 1 })
  assert.equal(tooEarly.revenue, 0)
  assert.deepEqual(tooEarly.position, ready.position)
  const delivered = applyAction(tooEarly, { type: 'move', direction: 'down', at: ready.lastMoveAt + BALANCE.moveCooldownMs })
  assert.equal(delivered.revenue, 33_000)
  assert.equal(delivered.completedOrders, 1)
})

test('arriving at the deadline discards the carried order before the serving tile can pay out', () => {
  const ready = walkTo(collectOrder(createGame(10)), { x: SERVING_BAR.x, y: SERVING_BAR.y + 1 })
  const deadline = ready.orderStartedAt + ready.orderDeadlineMs
  const late = applyAction(ready, { type: 'move', direction: 'down', at: deadline })
  assert.deepEqual(late.position, { x: 2, y: 0 })
  assert.equal(late.revenue, 0)
  assert.equal(late.completedOrders, 0)
  assert.equal(late.orderIndex, 1)
  assert.equal(late.mistakes, 1)
  assert.equal(late.stepIndex, 0)
  assert.equal(late.events.some((event) => event.type === 'timeout'), true)
  assert.equal(late.events.some((event) => event.type === 'serve'), false)
  const onTime = applyAction(ready, { type: 'move', direction: 'down', at: deadline - 1 })
  assert.equal(onTime.revenue, 33_000)
})

test('switching while carrying discards that recipe, while reselecting it preserves readiness', () => {
  const ready = collectOrder(createGame(4))
  const reselected = applyAction(ready, { type: 'select', slot: 0, at: ready.elapsedMs + 150 })
  assert.equal(reselected.stepIndex, reselected.order.steps.length)
  assert.equal(walkTo(reselected, SERVING_BAR).revenue, 33_000)
  const switched = applyAction(ready, { type: 'select', slot: 2, at: ready.elapsedMs + 150 })
  assert.equal(switched.order.id, 'sashibi')
  assert.equal(switched.stepIndex, 0)
  assert.equal(switched.orderStartedAt, ready.orderStartedAt)
  assert.equal(switched.orderDeadlineMs, ready.orderDeadlineMs)
  const emptyDelivery = walkTo(switched, SERVING_BAR)
  assert.equal(emptyDelivery.revenue, 0)
  assert.equal(emptyDelivery.completedOrders, 0)
  assert.equal(emptyDelivery.mistakes, 0)
})

test('all exact jackpot variants are playable and contribute only their verified 65k price', () => {
  for (const cake of RECIPES.filter((recipe) => recipe.jackpot)) {
    const initial = createGame(100)
    const state = serveOrder({ ...initial, order: cake, offers: [cake, initial.offers[1], initial.offers[2]], orderDeadlineMs: 30_000, orderIndex: 4 })
    assert.equal(state.completedOrders, 1)
    assert.equal(state.mistakes, 0)
    assert.equal(state.score, 65_000)
    assert.equal(state.revenue, cake.price)
    assert.equal(state.servedOrders[0]!.recipeId, cake.id)
    assert.equal(state.servedOrders[0]!.jackpot, true)
  }
})

test('absolute time expires orders, finalizes at sixty seconds, and never grants extra time', () => {
  let state = createGame(5)
  const deadline = state.orderDeadlineMs
  state = advanceGame(state, deadline - 1)
  assert.equal(state.mistakes, 0)
  state = advanceGame(state, deadline)
  assert.equal(state.mistakes, 1)
  assert.equal(state.orderIndex, 1)
  assert.equal(state.orderStartedAt, deadline)
  assert.ok(state.orderDeadlineMs < deadline)
  state = advanceGame(state, 999_999)
  assert.equal(state.elapsedMs, 60_000)
  assert.equal(state.finished, true)
  assert.ok(state.mistakes >= 3)
  assert.ok(state.satisfaction >= 0)
  const score = state.score
  state = applyAction(state, { type: 'move', direction: 'down', at: 60_001 })
  assert.equal(state.score, score)
})

test('recorded inputs replay exactly and JSON session resume preserves authoritative timing', () => {
  const actions: GameAction[] = []
  let live = createGame(331)
  for (let index = 0; index < 6; index++) {
    if (index === 0 || index === 3) {
      const selection: GameAction = { type: 'select', slot: 2, at: live.elapsedMs }
      actions.push(selection)
      live = applyAction(live, selection)
    }
    live = serveOrder(live, actions)
  }
  assert.equal(live.completedOrders, 6)
  assert.equal(live.mistakes, 0)
  assert.equal(actions.every((action) => action.type === 'move' || action.type === 'select'), true)
  const resumed: GameState = JSON.parse(JSON.stringify(live))
  assert.deepEqual(advanceGame(live, 60_000), advanceGame(resumed, 60_000))
  assert.deepEqual(replayGame(331, actions), advanceGame(live, 60_000))
  assert.equal(live.revenue, live.servedOrders.reduce((sum, order) => sum + order.revenue, 0))
  assert.equal(live.score, live.revenue)
  const last = live.elapsedMs
  assert.equal(applyAction(live, { type: 'move', direction: 'left', at: last - 1 }), live)
})

test('invalid actions cannot move or corrupt score and feedback history remains bounded', () => {
  const state = createGame(0)
  assert.equal(state.seed, 1)
  assert.equal(validateGameAction({ type: 'move', direction: 'warp', at: 0 }), false)
  assert.equal(validateGameAction({ type: 'move', direction: ['left'], at: 0 }), false)
  assert.equal(validateGameAction({ type: 'select', slot: -1, at: 0 }), false)
  assert.equal(validateGameAction({ type: 'select', slot: 3, at: 0 }), false)
  assert.equal(validateGameAction({ type: 'select', slot: 1.5, at: 0 }), false)
  assert.equal(validateGameAction({ type: 'select', slot: '1', at: 0 }), false)
  assert.equal(validateGameAction({ type: 'serve', at: 0 }), false)
  assert.equal(validateGameAction({ type: 'serve', at: Number.NaN }), false)
  assert.equal(validateGameAction(null), false)
  assert.equal(applyAction(state, { type: 'move', direction: 'warp', at: 0 } as unknown as GameAction), state)
  assert.equal(applyAction(state, { type: 'serve', at: 0 } as unknown as GameAction), state)
  assert.equal(advanceGame(state, Number.POSITIVE_INFINITY), state)
  assert.equal(advanceGame(state, -200).elapsedMs, 0)
  let current = state
  current = applyAction(current, { type: 'move', direction: 'up', at: 0 })
  current = applyAction(current, { type: 'move', direction: 'up', at: 500 })
  for (let index = 0; index < 19; index++) {
    current = applyAction(current, { type: 'move', direction: 'down', at: current.elapsedMs + 200 })
    current = applyAction(current, { type: 'move', direction: 'up', at: current.elapsedMs + 200 })
  }
  assert.equal(current.score, 0)
  assert.equal(current.satisfaction, 0)
  assert.equal(current.events.length, BALANCE.maxEvents)
  assert.equal(current.events.at(-1)!.id, current.lastEventId)
})
