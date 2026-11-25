const base = import.meta.env.BASE_URL;
const files: Record<string, string> = {
  'cheesy': 'cheesy-roll',
  'salmon-mozza': 'salmon-mozza',
  balinese: 'balinese-sushi-roll',
  'chicken-miso': 'chicken-miso-ramen',
  laksa: 'ramen-laksa',
  sashibi: 'tuna-sashimi',
  rendang: 'rendang-sushi-roll',
  'sakura-cake': 'mini-sushi-cake-sakura',
  'hikari-cake': 'mini-sushi-cake-hikari',
  'kokoro-cake': 'mini-sushi-cake-kokoro',
};
/** Local neutral food illustrations. */
export const menuImage = (id: string) => files[id] ? `${base}menu/${files[id]}.svg` : undefined;
export const rupiah = (value: number) => `Rp${Math.floor(value).toLocaleString('id-ID')}`;
