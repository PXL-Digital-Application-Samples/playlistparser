// Genre families (derived from Last.fm tags in the API) and their colours.
// One fixed colour per family across every visual, so "rock" is always blue.
//
// The order is the colour-blind safety mechanism: neighbouring families (in
// legends and in stacked charts) were validated to stay distinguishable with
// red-green colour blindness and with full colour vision, in both themes. Keep
// stacks and legends in this order. The colours themselves are CSS variables
// (--fam-*, defined per theme in App.vue), so use them via `style`, not as
// SVG presentation attributes.
export const FAMILY_ORDER = [
  'rock', 'hip hop', 'folk & country', 'jazz & soul', 'classical', 'world', 'electronic', 'pop', 'other',
];

const slug = (f) => f.replace(/ & /g, '-').replace(/\s+/g, '-');

export const familyColor = (f) => `var(--fam-${slug(FAMILY_ORDER.includes(f) ? f : 'other')})`;

export const byFamilyOrder = (a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b);
