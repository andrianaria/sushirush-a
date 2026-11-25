import type { GameAction } from '../game/engine.ts';
import { CATALOG_REVISION, RULES_VERSION } from '../game/balance.ts';
export interface PracticeSave { version: typeof RULES_VERSION; catalogRevision: typeof CATALOG_REVISION; seed: number; actions: GameAction[]; elapsedMs: number; savedAt: string }
const KEY = `sushi-rush-practice-v${RULES_VERSION}-catalog-${CATALOG_REVISION}`;
// Earlier releases wrote an implicit OFF to sr60-sound. Start the new default-ON
// preference separately, then preserve every choice made with the current UI.
const SOUND_KEY = 'sr60-sound-v2';
export function readPractice(): PracticeSave | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || raw.version !== RULES_VERSION || raw.catalogRevision !== CATALOG_REVISION || !Number.isInteger(raw.seed) || !Array.isArray(raw.actions) || raw.actions.length > 1500 || !Number.isFinite(raw.elapsedMs) || raw.elapsedMs < 0 || raw.elapsedMs >= 60000) return null;
    return raw;
  } catch { return null; }
}
export function writePractice(value: PracticeSave) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Practice can still run when storage is unavailable. */ } }
export function clearPractice() { try { localStorage.removeItem(KEY); } catch { /* No persistent browser storage. */ } }
export function getSoundPreference() { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } }
export function setSoundPreference(on: boolean) { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* Optional preference. */ } }
