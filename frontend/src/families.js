// Genre families (derived from Last.fm tags in the API) and their colours.
// One fixed colour per family across every visual, so "rock" is always blue.
export const FAMILY_COLORS = {
  rock: '#2a78d6',
  electronic: '#6250d6',
  'hip hop': '#eb6834',
  'jazz & soul': '#c98500',
  'folk & country': '#1baf7a',
  classical: '#d55181',
  pop: '#e34948',
  world: '#008300',
  other: '#9aa0a6',
};

export const familyColor = (f) => FAMILY_COLORS[f ?? 'other'] ?? FAMILY_COLORS.other;
export const FAMILY_ORDER = Object.keys(FAMILY_COLORS);
