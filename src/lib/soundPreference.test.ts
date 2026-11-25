import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { clearPractice, getSoundPreference, setSoundPreference, writePractice } from './storage.ts'
import { CATALOG_REVISION, RULES_VERSION } from '../game/balance.ts'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
  removeItem(key: string) { this.values.delete(key) }
  key(index: number) { return [...this.values.keys()][index] ?? null }
}
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
beforeEach(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() }))
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

test('sound defaults ON for a first visit', () => {
  assert.equal(getSoundPreference(), true)
})

test('an old implicit OFF cannot mute the new default', () => {
  localStorage.setItem('sr60-sound', 'off')
  assert.equal(getSoundPreference(), true)
})

test('a new explicit mute persists across reads and ignores the legacy preference', () => {
  setSoundPreference(false)
  assert.equal(getSoundPreference(), false)
  localStorage.setItem('sr60-sound', 'on')
  assert.equal(getSoundPreference(), false)
  assert.equal(localStorage.getItem('sr60-sound-v2'), 'off')
})

test('unmuting replaces the saved mute choice', () => {
  setSoundPreference(false)
  setSoundPreference(true)
  assert.equal(getSoundPreference(), true)
  assert.equal(localStorage.getItem('sr60-sound-v2'), 'on')
})

test('saving and clearing rounds does not reset an explicit mute', () => {
  setSoundPreference(false)
  writePractice({ version: RULES_VERSION, catalogRevision: CATALOG_REVISION, seed: 123, actions: [], elapsedMs: 0, savedAt: '2026-11-03T00:00:00.000Z' })
  assert.equal(getSoundPreference(), false)
  clearPractice()
  assert.equal(getSoundPreference(), false)
})

test('blocked browser storage keeps the default ON without breaking controls', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage unavailable') } })
  assert.equal(getSoundPreference(), true)
  assert.doesNotThrow(() => setSoundPreference(false))
})
