import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { disposeAudio, playEffect, setAudioEnabled, setMusicPlaying, unlockAudio } from './audio.ts'
import type { SoundEffect } from './audio.ts'

class Parameter {
  value = 0
  events: { method: string; value?: number; at: number }[] = []
  setValueAtTime(value: number, at: number) { this.value = value; this.events.push({ method: 'set', value, at }) }
  linearRampToValueAtTime(value: number, at: number) { this.value = value; this.events.push({ method: 'linear', value, at }) }
  exponentialRampToValueAtTime(value: number, at: number) { this.value = value; this.events.push({ method: 'exponential', value, at }) }
  cancelScheduledValues(at: number) { this.events.push({ method: 'cancel', at }) }
}
class Node {
  outputs: Node[] = []
  disconnected = false
  connect(node: Node) { this.outputs.push(node); return node }
  disconnect() { this.disconnected = true; this.outputs = [] }
}
class Gain extends Node { gain = new Parameter() }
class Filter extends Node { type = ''; frequency = new Parameter(); Q = new Parameter() }
class Source extends Node {
  frequency = new Parameter()
  type = ''
  buffer: unknown
  starts: number[] = []
  stops: number[] = []
  onended: (() => void) | null = null
  start(at: number) { this.starts.push(at) }
  stop(at: number) { this.stops.push(at) }
}
const contexts: Context[] = []
let rejectResume = false
let deferResume = false
let throwConstructor = false
class Context {
  state = 'suspended'
  onstatechange: (() => void) | null = null
  currentTime = 0
  sampleRate = 1000
  destination = new Node()
  gains: Gain[] = []
  sources: Source[] = []
  nodes: Node[] = []
  resumeCalls = 0
  closeCalls = 0
  resolveResume: (() => void) | undefined
  rejectPendingResume: ((reason: Error) => void) | undefined
  constructor() { if (throwConstructor) throw new Error('No audio device'); contexts.push(this) }
  createGain() { const node = new Gain(); this.gains.push(node); this.nodes.push(node); return node }
  createBiquadFilter() { const node = new Filter(); this.nodes.push(node); return node }
  createOscillator() { const node = new Source(); this.sources.push(node); this.nodes.push(node); return node }
  createBufferSource() { return this.createOscillator() }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) } }
  resume() {
    this.resumeCalls++
    if (rejectResume) return Promise.reject(new Error('Gesture required'))
    if (deferResume) return new Promise<void>((resolve, reject) => {
      this.resolveResume = () => { this.state = 'running'; resolve() }
      this.rejectPendingResume = reject
    })
    this.state = 'running'
    return Promise.resolve()
  }
  close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve() }
  changeState(state: string) { this.state = state; this.onstatechange?.() }
  advance(at: number) {
    this.currentTime = at
    for (const source of this.sources) if (source.stops.length && Math.min(...source.stops) <= at) source.onended?.()
  }
}

const globals = globalThis as unknown as Record<string, unknown>
const originalContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
const originalLegacyContext = Object.getOwnPropertyDescriptor(globalThis, 'webkitAudioContext')
const originalInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
const timers = new Map<number, () => void>()
let timerId = 0
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

beforeEach(() => {
  contexts.length = 0
  rejectResume = false
  deferResume = false
  throwConstructor = false
  timerId = 0
  timers.clear()
  globals.AudioContext = Context
  globals.webkitAudioContext = undefined
  globals.setInterval = (callback: () => void) => { timers.set(++timerId, callback); return timerId }
  globals.clearInterval = (id: number) => { timers.delete(id) }
})
afterEach(async () => {
  disposeAudio()
  await settle()
  if (originalContext) Object.defineProperty(globalThis, 'AudioContext', originalContext)
  else delete globals.AudioContext
  if (originalLegacyContext) Object.defineProperty(globalThis, 'webkitAudioContext', originalLegacyContext)
  else delete globals.webkitAudioContext
  globalThis.setInterval = originalInterval
  globalThis.clearInterval = originalClearInterval
})

test('audio stays lazy and silent until enabled and unlocked by a gesture', () => {
  setMusicPlaying(true)
  playEffect('start')
  assert.equal(contexts.length, 0)
  setAudioEnabled(true)
  playEffect('move')
  assert.equal(contexts.length, 0)
  unlockAudio()
  const ctx = contexts[0]!
  assert.equal(ctx.resumeCalls, 1, 'resume is called synchronously')
  assert.equal(timers.size, 1)
  assert.ok(ctx.sources.length > 0)
})

test('effects obey the master gate and mute cancels running and future scheduled notes', () => {
  unlockAudio()
  const ctx = contexts[0]!
  playEffect('finish')
  assert.equal(ctx.sources.length, 0, 'default master is muted')
  setAudioEnabled(true)
  playEffect('finish')
  assert.equal(ctx.sources.length, 5)
  assert.ok(ctx.sources.some((source) => source.starts[0]! > ctx.currentTime + 0.3))
  setAudioEnabled(false)
  assert.equal(ctx.gains[0]!.gain.value, 0)
  for (const source of ctx.sources) {
    assert.equal(source.stops.at(-1), ctx.currentTime)
    assert.equal(source.disconnected, true)
    assert.equal(source.onended, null)
  }
  playEffect('serve')
  assert.equal(ctx.sources.length, 5)
  assert.equal(timers.size, 0)
})

test('one lookahead scheduler loops without duplicate starts or stale catch-up bursts', () => {
  setAudioEnabled(true)
  unlockAudio()
  setMusicPlaying(true)
  const ctx = contexts[0]!
  const initial = ctx.sources.length
  assert.ok(initial >= 4)
  setMusicPlaying(true)
  unlockAudio()
  assert.equal(timers.size, 1)
  assert.equal(ctx.sources.length, initial)
  ctx.advance(0.25)
  for (const callback of timers.values()) callback()
  assert.ok(ctx.sources.length > initial)
  const beforeStall = ctx.sources.length
  ctx.advance(10)
  for (const callback of timers.values()) callback()
  const recovered = ctx.sources.slice(beforeStall)
  assert.ok(recovered.length <= 5, 'missed beats are skipped, not replayed in a burst')
  assert.equal(recovered.every((source) => source.starts[0]! >= ctx.currentTime), true)
  for (let step = 0; step < 200; step++) {
    ctx.advance(10 + step * 0.1)
    for (const callback of timers.values()) callback()
  }
  assert.equal(timers.size, 1, 'the eight-bar melody wraps without replacing the scheduler')
})

test('stopping music cancels its queued voices but preserves a finish jingle', () => {
  setAudioEnabled(true)
  unlockAudio()
  setMusicPlaying(true)
  const ctx = contexts[0]!
  const music = [...ctx.sources]
  playEffect('finish')
  const finish = ctx.sources.slice(music.length)
  setMusicPlaying(false)
  assert.equal(timers.size, 0)
  assert.equal(music.every((source) => source.disconnected), true)
  assert.equal(finish.every((source) => !source.disconnected && source.stops.length === 1), true)
  const beforeResume = ctx.sources.length
  ctx.advance(2)
  setMusicPlaying(true)
  const restarted = ctx.sources.slice(beforeResume)
  assert.ok(restarted.length > 0)
  assert.equal(restarted.every((source) => source.starts[0]! >= 2), true)
  assert.equal(timers.size, 1)
})

test('an unlocked context autonomously returning to running restarts exactly one fresh music scheduler', () => {
  setAudioEnabled(true)
  unlockAudio()
  setMusicPlaying(true)
  const ctx = contexts[0]!
  const originalVoices = [...ctx.sources]
  assert.equal(timers.size, 1)
  ctx.changeState('suspended')
  for (const callback of [...timers.values()]) callback()
  assert.equal(timers.size, 0)
  assert.equal(originalVoices.every((source) => source.disconnected), true)
  const count = ctx.sources.length
  ctx.advance(5)
  ctx.changeState('running')
  assert.equal(timers.size, 1, 'native statechange must recover without a new gesture')
  const restarted = ctx.sources.slice(count)
  assert.ok(restarted.length > 0)
  assert.ok(restarted.length <= 5, 'interrupted beats must not be replayed in a catch-up burst')
  assert.equal(restarted.every((source) => source.starts[0]! >= ctx.currentTime), true)
  ctx.changeState('running')
  assert.equal(timers.size, 1)
  assert.equal(ctx.sources.length, count + restarted.length, 'duplicate state events do not duplicate the first beat')
  assert.equal(ctx.resumeCalls, 1, 'recovery does not invoke resume outside a user gesture')
})

test('native context recovery never revives muted or paused music', () => {
  setAudioEnabled(true)
  unlockAudio()
  setMusicPlaying(true)
  const ctx = contexts[0]!
  ctx.changeState('interrupted')
  assert.equal(timers.size, 0, 'interruption immediately cancels the scheduler')
  const count = ctx.sources.length
  setAudioEnabled(false)
  ctx.changeState('running')
  assert.equal(timers.size, 0)
  assert.equal(ctx.sources.length, count)
  setAudioEnabled(true)
  assert.equal(timers.size, 1, 'the prior unlock and play intent survive an interruption')
  ctx.changeState('suspended')
  setMusicPlaying(false)
  const pausedCount = ctx.sources.length
  ctx.changeState('running')
  assert.equal(timers.size, 0)
  assert.equal(ctx.sources.length, pausedCount)
  playEffect('select')
  assert.equal(ctx.sources.length, pausedCount + 1, 'pausing the music does not permanently disable effects')
})

test('state changes cannot unlock rejected audio or revive an obsolete disposed context', async () => {
  rejectResume = true
  setAudioEnabled(true)
  setMusicPlaying(true)
  unlockAudio()
  await settle()
  const old = contexts[0]!
  old.changeState('running')
  assert.equal(timers.size, 0, 'statechange does not grant a missing gesture unlock')
  assert.equal(old.sources.length, 0)
  const oldHandler = old.onstatechange!
  assert.equal(typeof oldHandler, 'function')
  disposeAudio()
  assert.equal(old.onstatechange, null)
  oldHandler()
  assert.equal(timers.size, 0)
  rejectResume = false
  setAudioEnabled(true)
  unlockAudio()
  setMusicPlaying(true)
  const current = contexts[1]!
  const count = current.sources.length
  old.changeState('running')
  oldHandler()
  assert.equal(timers.size, 1)
  assert.equal(current.sources.length, count)
  disposeAudio()
  assert.equal(current.onstatechange, null)
  current.changeState('running')
  assert.equal(timers.size, 0)
})

test('a muted pending resume cannot start music, and a later gesture can recover rejection', async () => {
  deferResume = true
  setAudioEnabled(true)
  setMusicPlaying(true)
  unlockAudio()
  unlockAudio()
  const ctx = contexts[0]!
  assert.equal(ctx.resumeCalls, 2, 'each suspended gesture can retry a pending native resume')
  playEffect('start')
  assert.equal(ctx.sources.length, 0, 'suspended audio does not queue effects')
  setAudioEnabled(false)
  ctx.resolveResume!()
  await settle()
  assert.equal(ctx.sources.length, 0)
  assert.equal(timers.size, 0)
  setAudioEnabled(true)
  assert.equal(timers.size, 1)
  setMusicPlaying(false)
  ctx.state = 'suspended'
  deferResume = false
  rejectResume = true
  unlockAudio()
  await settle()
  assert.equal(timers.size, 0)
  const count = ctx.sources.length
  playEffect('move')
  assert.equal(ctx.sources.length, count)
  rejectResume = false
  unlockAudio()
  await settle()
  playEffect('select')
  assert.equal(ctx.sources.length, count + 1)
})

test('a later gesture retries a suspended context even while an earlier resume remains pending', async () => {
  deferResume = true
  setAudioEnabled(true)
  setMusicPlaying(true)
  unlockAudio()
  const ctx = contexts[0]!
  const resolveOlder = ctx.resolveResume!
  assert.equal(timers.size, 0)
  deferResume = false
  unlockAudio()
  assert.equal(ctx.resumeCalls, 2, 'the later eligible gesture must reach native resume synchronously')
  assert.equal(timers.size, 1)
  const count = ctx.sources.length
  await settle()
  resolveOlder()
  await settle()
  unlockAudio()
  assert.equal(ctx.resumeCalls, 2, 'a running context does not need another native resume')
  assert.equal(timers.size, 1)
  assert.equal(ctx.sources.length, count, 'an older resolution cannot restart or duplicate the scheduler')
})

test('an older resume rejection cannot mute a successful newer gesture or become unhandled', async () => {
  deferResume = true
  setAudioEnabled(true)
  setMusicPlaying(true)
  unlockAudio()
  const ctx = contexts[0]!
  const rejectOlder = ctx.rejectPendingResume!
  deferResume = false
  unlockAudio()
  await settle()
  assert.equal(timers.size, 1)
  const count = ctx.sources.length
  rejectOlder(new Error('Obsolete native gesture rejection'))
  await settle()
  assert.equal(timers.size, 1)
  assert.equal(ctx.sources.length, count)
  playEffect('select')
  assert.equal(ctx.sources.length, count + 1, 'the newer unlock still permits effects')
})

test('an earlier successful resume recovers actual running audio while the newer attempt is pending', async () => {
  deferResume = true
  setAudioEnabled(true)
  setMusicPlaying(true)
  unlockAudio()
  const ctx = contexts[0]!
  const resolveOlder = ctx.resolveResume!
  unlockAudio()
  const rejectNewer = ctx.rejectPendingResume!
  assert.equal(ctx.resumeCalls, 2)
  resolveOlder()
  await settle()
  assert.equal(timers.size, 1, 'a successful native transition must not wait for an unrelated pending attempt')
  const count = ctx.sources.length
  rejectNewer(new Error('Redundant native resume rejected'))
  await settle()
  assert.equal(timers.size, 1, 'a redundant rejection cannot mute a context that is already running')
  assert.equal(ctx.sources.length, count)
  playEffect('select')
  assert.equal(ctx.sources.length, count + 1)
})

test('dispose disconnects sources, buses and timers and ignores an obsolete resume', async () => {
  deferResume = true
  setAudioEnabled(true)
  setMusicPlaying(true)
  unlockAudio()
  const old = contexts[0]!
  disposeAudio()
  disposeAudio()
  assert.equal(old.closeCalls, 1)
  assert.equal(old.nodes.every((node) => node.disconnected), true)
  assert.equal(timers.size, 0)
  deferResume = false
  setAudioEnabled(true)
  unlockAudio()
  setMusicPlaying(true)
  const current = contexts[1]!
  const count = current.sources.length
  old.resolveResume!()
  await settle()
  assert.equal(timers.size, 1)
  assert.equal(current.sources.length, count)
  disposeAudio()
  assert.equal(current.nodes.every((node) => node.disconnected), true)
  assert.equal(timers.size, 0)
})

test('all named effects are finite and release their audio nodes when they end', () => {
  setAudioEnabled(true)
  unlockAudio()
  const ctx = contexts[0]!
  const kinds: SoundEffect[] = ['move', 'ingredient', 'ready', 'serve', 'mistake', 'select', 'start', 'finish', 'countdown', 'timeout']
  for (const kind of kinds) {
    const before = ctx.sources.length
    playEffect(kind)
    const created = ctx.sources.slice(before)
    assert.ok(created.length > 0, kind)
    assert.equal(created.every((source) => source.stops[0]! > source.starts[0]! && source.stops[0]! - ctx.currentTime < 1), true)
  }
  ctx.advance(2)
  assert.equal(ctx.sources.every((source) => source.disconnected && source.onended === null), true)
})

test('unsupported audio devices and rejected browser resumes fail silently', async () => {
  globals.AudioContext = undefined
  assert.doesNotThrow(() => { setAudioEnabled(true); setMusicPlaying(true); unlockAudio(); playEffect('move') })
  assert.equal(contexts.length, 0)
  globals.AudioContext = Context
  throwConstructor = true
  assert.doesNotThrow(unlockAudio)
  assert.equal(contexts.length, 0)
  throwConstructor = false
  rejectResume = true
  unlockAudio()
  await settle()
  assert.equal(timers.size, 0)
  assert.equal(contexts[0]!.sources.length, 0)
})
