/** Increment whenever replay or money rules change; old sessions must not resume. */
export const RULES_VERSION = 3 as const
/** Pre-launch catalogue revision; do not replay older practice inputs against a changed menu pool. */
export const CATALOG_REVISION = 2 as const

/** Base menu prices, before tax/service. A missing verified price is never guessed. */
export const MENU_PRICES = {
  'cheesy': 33_000,
  'salmon-mozza': 33_000,
  balinese: 25_000,
  'chicken-miso': 29_000,
  laksa: 55_000,
  sashibi: 55_000,
  rendang: 29_000,
  'sakura-cake': 65_000,
  'hikari-cake': 65_000,
  'kokoro-cake': 65_000,
} as const

export const PRICE_SOURCE = { source: 'fictional-game-economy', currency: 'IDR', note: 'Fixed game values for local play.' } as const

/** Shared by browser play and trusted server replay. No artificial money bonuses. */
export const BALANCE = {
  durationMs: 60_000,
  gridSize: 5,
  moveCooldownMs: 110,
  initialOrderMs: 16_000,
  minimumOrderMs: 8_500,
  orderAccelerationMs: 650,
  rushAccelerationMs: 350,
  rushIntervalMs: 15_000,
  jackpotExtraMs: 10_000,
  jackpotEvery: 5,
  maximumSatisfaction: 100,
  startingSatisfaction: 100,
  mistakeSatisfaction: 8,
  timeoutSatisfaction: 16,
  servedSatisfaction: 5,
  maxEvents: 5,
} as const
