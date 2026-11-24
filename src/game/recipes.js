import { MENU_PRICES } from './balance.js';
export const STATIONS = {
    rice: { id: 'rice', name: 'Rice & Nori', shortName: 'Rice', icon: '🍚', color: '#f4d7a5', x: 0, y: 3 },
    filling: { id: 'filling', name: 'Fillings', shortName: 'Filling', icon: '🥒', color: '#76a66e', x: 2, y: 4 },
    finish: { id: 'finish', name: 'Toppings', shortName: 'Topping', icon: '✨', color: '#f5b749', x: 4, y: 3 },
    broth: { id: 'broth', name: 'Noodles & Broth', shortName: 'Broth', icon: '🍜', color: '#cc6742', x: 0, y: 1 },
    protein: { id: 'protein', name: 'Protein', shortName: 'Protein', icon: '🐟', color: '#f49d7c', x: 4, y: 1 },
};
/** Delivery is a destination, never an ingredient or a recipe step. */
export const SERVING_BAR = {
    id: 'serving', name: 'Serving Bar', shortName: 'Serve', color: '#e55549', x: 2, y: 0,
};
const step = (station, label, ...ingredients) => ({ station, label, ingredients });
// Each recipe is an ordered set of stations. Ingredient quantities are cosmetic.
export const RECIPES = [
    {
        id: 'cheesy', name: 'Cheesy Salmon Roll 4pcs', kind: 'roll', price: MENU_PRICES['cheesy'], jackpot: false,
        steps: [
            step('rice', 'Sushi rice + nori', 'sushi rice', 'nori'),
            step('filling', 'Cream cheese + cucumber', 'cream cheese', 'cucumber'),
            step('protein', 'Fresh salmon', 'fresh salmon'),
            step('finish', 'Tobiko', 'tobiko'),
        ],
    },
    {
        id: 'salmon-mozza', name: 'Salmon Mozza 4pcs', kind: 'roll', price: MENU_PRICES['salmon-mozza'], jackpot: false,
        steps: [
            step('rice', 'Sushi rice + nori', 'sushi rice', 'nori'),
            step('filling', 'Tamago + rice flour + cheddar', 'tamagoyaki', 'rice flour', 'cheddar'),
            step('protein', 'Salmon + mozzarella', 'salmon', 'mozzarella'),
            step('finish', 'Unagi sauce', 'unagi sauce'),
        ],
    },
    {
        id: 'balinese', name: 'Balinese Sushi Roll 4pcs', kind: 'roll', price: MENU_PRICES.balinese, jackpot: false,
        steps: [
            step('rice', 'Sushi rice + nori', 'sushi rice', 'nori'),
            step('protein', 'Turmeric chicken', 'shredded turmeric chicken'),
            step('finish', 'Balinese salsa + scallions', 'Balinese salsa', 'scallions'),
        ],
    },
    {
        id: 'chicken-miso', name: 'Chicken Miso Ramen', kind: 'ramen', price: MENU_PRICES['chicken-miso'], jackpot: false,
        steps: [
            step('broth', 'Noodles + miso broth', 'ramen noodles', 'ramen stock', 'miso', 'water'),
            step('filling', 'Fish cake + egg + corn', 'fish cake', 'marinated egg', 'corn'),
            step('protein', 'Marinated chicken', 'marinated chicken'),
            step('finish', 'Wakame + nori + scallions', 'wakame', 'nori', 'scallions'),
        ],
    },
    {
        id: 'laksa', name: 'Laksa Ramen', kind: 'ramen', price: MENU_PRICES.laksa, jackpot: false,
        steps: [
            step('broth', 'Noodles + laksa broth', 'ramen noodles', 'laksa stock', 'coconut milk', 'laksa spices', 'water'),
            step('filling', 'Egg + potato + bean sprouts', 'marinated egg', 'potato', 'bean sprouts'),
            step('protein', 'Shrimp', 'shrimp'),
            step('finish', 'Nori + scallions', 'nori', 'scallions'),
        ],
    },
    {
        id: 'sashibi', name: 'Tuna Sashimi', kind: 'sashimi', price: MENU_PRICES.sashibi, jackpot: false,
        steps: [
            step('protein', 'Tuna', 'tuna'),
            step('filling', 'Citrus tuna sauce', 'citrus tuna sauce'),
            step('finish', 'Orange tobiko + scallions', 'orange tobiko', 'scallions'),
        ],
    },
    {
        id: 'rendang', name: 'Rendang Sushi Roll 4pcs', kind: 'roll', price: MENU_PRICES.rendang, jackpot: false,
        steps: [
            step('rice', 'Sushi rice + nori', 'sushi rice', 'nori'),
            step('protein', 'Rendang beef', 'rendang beef'),
            step('filling', 'Rice crackers', 'rice crackers'),
            step('finish', 'Sesame + scallions', 'sesame', 'scallions'),
        ],
    },
    {
        id: 'sakura-cake', name: 'Sakura Mini Sushi Cake', kind: 'cake', price: MENU_PRICES['sakura-cake'], jackpot: true,
        components: ['Cheesy Salmon Roll', 'California Roll', 'Tamago Maki'],
        steps: [
            step('rice', 'Prepare Cheesy Salmon Roll', 'Cheesy Salmon Roll'),
            step('protein', 'Layer Cheesy Salmon Roll', 'Cheesy Salmon Roll'),
            step('rice', 'Prepare California Roll', 'California Roll'),
            step('filling', 'Layer California Roll', 'California Roll'),
            step('rice', 'Prepare Tamago Maki', 'Tamago Maki'),
            step('finish', 'Layer Tamago Maki', 'Tamago Maki'),
        ],
    },
    {
        id: 'hikari-cake', name: 'Hikari Mini Sushi Cake', kind: 'cake', price: MENU_PRICES['hikari-cake'], jackpot: true,
        components: ['Spicy Niku Roll', 'Spicy Butterfish Roll', 'Spicy Tuna Maki'],
        steps: [
            step('rice', 'Prepare Spicy Niku Roll', 'Spicy Niku Roll'),
            step('protein', 'Layer Spicy Niku Roll', 'Spicy Niku Roll'),
            step('rice', 'Prepare Spicy Butterfish Roll', 'Spicy Butterfish Roll'),
            step('filling', 'Layer Spicy Butterfish Roll', 'Spicy Butterfish Roll'),
            step('rice', 'Prepare Spicy Tuna Maki', 'Spicy Tuna Maki'),
            step('finish', 'Layer Spicy Tuna Maki', 'Spicy Tuna Maki'),
        ],
    },
    {
        id: 'kokoro-cake', name: 'Kokoro Mini Sushi Cake', kind: 'cake', price: MENU_PRICES['kokoro-cake'], jackpot: true,
        components: ['Salmon Mentai Maki', 'Salmon Mozza', 'Spicy Tuna Roll', 'Tanuki Maki'],
        steps: [
            step('rice', 'Prepare Salmon Mentai Maki', 'Salmon Mentai Maki'),
            step('protein', 'Layer Salmon Mentai Maki', 'Salmon Mentai Maki'),
            step('rice', 'Prepare Salmon Mozza', 'Salmon Mozza'),
            step('filling', 'Layer Salmon Mozza', 'Salmon Mozza'),
            step('rice', 'Prepare Spicy Tuna Roll', 'Spicy Tuna Roll'),
            step('protein', 'Layer Spicy Tuna Roll', 'Spicy Tuna Roll'),
            step('rice', 'Prepare Tanuki Maki', 'Tanuki Maki'),
            step('finish', 'Layer Tanuki Maki', 'Tanuki Maki'),
        ],
    },
];
export function getRecipe(id) {
    const recipe = RECIPES.find((item) => item.id === id);
    if (!recipe)
        throw new Error(`Unknown recipe: ${id}`);
    return recipe;
}
export const RECIPE_NOTES = [
    'Recipes are simplified for a timed cooking game.',
    'Game values are fictional and have no cash value.',
];
