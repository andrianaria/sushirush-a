import { MENU_PRICES } from './balance.ts'

export type StationId = 'rice' | 'filling' | 'finish' | 'broth' | 'protein'

export interface Station {
  id: StationId
  name: string
  shortName: string
  icon: string
  color: string
  x: number
  y: number
}

export const STATIONS: Record<StationId, Station> = {
  rice: { id: 'rice', name: 'Nasi & Nori', shortName: 'Nasi', icon: '🍚', color: '#f4d7a5', x: 0, y: 3 },
  filling: { id: 'filling', name: 'Isian', shortName: 'Isian', icon: '🥒', color: '#76a66e', x: 2, y: 4 },
  finish: { id: 'finish', name: 'Finishing', shortName: 'Finishing', icon: '✨', color: '#f5b749', x: 4, y: 3 },
  broth: { id: 'broth', name: 'Mi & Kuah', shortName: 'Kuah', icon: '🍜', color: '#cc6742', x: 0, y: 1 },
  protein: { id: 'protein', name: 'Protein', shortName: 'Protein', icon: '🐟', color: '#f49d7c', x: 4, y: 1 },
}

/** Delivery is a destination, never an ingredient or a recipe step. */
export const SERVING_BAR = {
  id: 'serving', name: 'Bar saji', shortName: 'Saji', color: '#e55549', x: 2, y: 0,
} as const

export interface RecipeStep {
  station: StationId
  label: string
  ingredients: string[]
}

export interface Recipe {
  id: string
  name: string
  kind: 'roll' | 'ramen' | 'sashimi' | 'cake'
  steps: RecipeStep[]
  price: number | null
  jackpot: boolean
  components?: string[]
}

const step = (station: StationId, label: string, ...ingredients: string[]): RecipeStep => ({ station, label, ingredients })

// The source is the recipe tab in the supplied HPP brief. Portions and ingredient
// weights are deliberately absent from play; every active ingredient appears once.
export const RECIPES: Recipe[] = [
  {
    id: 'cheesy', name: 'Cheesy Roll 4pcs', kind: 'roll', price: MENU_PRICES['cheesy'], jackpot: false,
    steps: [
      step('rice', 'Nasi sushi + nori', 'nasi sushi', 'nori'),
      step('filling', 'Cream cheese + kyuri', 'cream cheese', 'kyuri'),
      step('protein', 'Salmon segar', 'salmon segar'),
      step('finish', 'Tobiko', 'tobiko'),
    ],
  },
  {
    id: 'salmon-mozza', name: 'Salmon Mozza 4pcs', kind: 'roll', price: MENU_PRICES['salmon-mozza'], jackpot: false,
    steps: [
      step('rice', 'Nasi sushi + nori', 'nasi sushi', 'nori'),
      step('filling', 'Tamago + tepung + cheddar', 'tamagoyaki', 'tepung beras', 'cheddar'),
      step('protein', 'Salmon + mozzarella', 'salmon', 'mozzarella'),
      step('finish', 'Saus unagi', 'saus unagi'),
    ],
  },
  {
    id: 'balinese', name: 'Balinese Sushi Roll 4pcs', kind: 'roll', price: MENU_PRICES.balinese, jackpot: false,
    steps: [
      step('rice', 'Nasi sushi + nori', 'nasi sushi', 'nori'),
      step('protein', 'Ayam bumbu kuning', 'ayam suwir bumbu kuning'),
      step('finish', 'Sambal matah + daun bawang', 'sambal matah', 'daun bawang'),
    ],
  },
  {
    id: 'chicken-miso', name: 'Chicken Miso Ramen (R)', kind: 'ramen', price: MENU_PRICES['chicken-miso'], jackpot: false,
    steps: [
      step('broth', 'Mi + kuah miso', 'mi ramen', 'kaldu ramen bubuk', 'miso', 'air'),
      step('filling', 'Naruto + ajitama + jagung', 'narutomaki', 'telur ajitama', 'jagung'),
      step('protein', 'Ayam ramen marinasi', 'ayam ramen marinasi'),
      step('finish', 'Wakame + nori + daun bawang', 'wakame', 'nori', 'daun bawang'),
    ],
  },
  {
    id: 'laksa', name: 'Ramen Laksa (R)', kind: 'ramen', price: MENU_PRICES.laksa, jackpot: false,
    steps: [
      step('broth', 'Mi + kuah laksa', 'mi ramen', 'base laksa', 'santan', 'bumbu mix laksa', 'air'),
      step('filling', 'Ajitama + kentang + toge', 'telur ajitama', 'kentang', 'toge'),
      step('protein', 'Udang', 'udang'),
      step('finish', 'Nori + daun bawang', 'nori', 'daun bawang'),
    ],
  },
  {
    id: 'sashibi', name: 'Sashibi Bitung', kind: 'sashimi', price: MENU_PRICES.sashibi, jackpot: false,
    steps: [
      step('protein', 'Tuna', 'tuna'),
      step('filling', 'Saus Sashibi Bitung', 'saus Sashibi Bitung'),
      step('finish', 'Tobiko oranye + daun bawang', 'tobiko oranye', 'daun bawang'),
    ],
  },
  {
    id: 'rendang', name: 'Rendang Sushi Roll 4pcs', kind: 'roll', price: MENU_PRICES.rendang, jackpot: false,
    steps: [
      step('rice', 'Nasi sushi + nori', 'nasi sushi', 'nori'),
      step('protein', 'Daging rendang', 'daging rendang'),
      step('filling', 'Kerupuk merah Padang', 'kerupuk merah Padang'),
      step('finish', 'Wijen + daun bawang', 'wijen', 'daun bawang'),
    ],
  },
  {
    id: 'sakura-cake', name: 'Sakura Mini Sushi Cake', kind: 'cake', price: MENU_PRICES['sakura-cake'], jackpot: true,
    components: ['Cheesy Roll', 'California Roll', 'Tamago Maki'],
    steps: [
      step('rice', 'Siapkan Cheesy Roll', 'Cheesy Roll'),
      step('protein', 'Susun Cheesy Roll', 'Cheesy Roll'),
      step('rice', 'Siapkan California Roll', 'California Roll'),
      step('filling', 'Susun California Roll', 'California Roll'),
      step('rice', 'Siapkan Tamago Maki', 'Tamago Maki'),
      step('finish', 'Susun Tamago Maki', 'Tamago Maki'),
    ],
  },
  {
    id: 'hikari-cake', name: 'Hikari Mini Sushi Cake', kind: 'cake', price: MENU_PRICES['hikari-cake'], jackpot: true,
    components: ['Spicy Niku Roll', 'Spicy Butterfish Roll', 'Spicy Tuna Maki'],
    steps: [
      step('rice', 'Siapkan Spicy Niku Roll', 'Spicy Niku Roll'),
      step('protein', 'Susun Spicy Niku Roll', 'Spicy Niku Roll'),
      step('rice', 'Siapkan Spicy Butterfish Roll', 'Spicy Butterfish Roll'),
      step('filling', 'Susun Spicy Butterfish Roll', 'Spicy Butterfish Roll'),
      step('rice', 'Siapkan Spicy Tuna Maki', 'Spicy Tuna Maki'),
      step('finish', 'Susun Spicy Tuna Maki', 'Spicy Tuna Maki'),
    ],
  },
  {
    id: 'kokoro-cake', name: 'Kokoro Mini Sushi Cake', kind: 'cake', price: MENU_PRICES['kokoro-cake'], jackpot: true,
    components: ['Salmon Mentai Maki', 'Salmon Mozza', 'Spicy Tuna Roll', 'Tanuki Maki'],
    steps: [
      step('rice', 'Siapkan Salmon Mentai Maki', 'Salmon Mentai Maki'),
      step('protein', 'Susun Salmon Mentai Maki', 'Salmon Mentai Maki'),
      step('rice', 'Siapkan Salmon Mozza', 'Salmon Mozza'),
      step('filling', 'Susun Salmon Mozza', 'Salmon Mozza'),
      step('rice', 'Siapkan Spicy Tuna Roll', 'Spicy Tuna Roll'),
      step('protein', 'Susun Spicy Tuna Roll', 'Spicy Tuna Roll'),
      step('rice', 'Siapkan Tanuki Maki', 'Tanuki Maki'),
      step('finish', 'Susun Tanuki Maki', 'Tanuki Maki'),
    ],
  },
]

export function getRecipe(id: string): Recipe {
  const recipe = RECIPES.find((item) => item.id === id)
  if (!recipe) throw new Error(`Unknown recipe: ${id}`)
  return recipe
}

export const RECIPE_NOTES = [
  'Urutan stasiun dan nilai hidangan dipakai sebagai aturan permainan lokal.',
] as const
