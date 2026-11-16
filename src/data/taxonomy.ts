// Allowed values for `area` and `type` in places.json.
// Adding a value here makes it valid in the data and shows it in the filters.

export const AREAS = [
  'Avondale Estates',
  'Buckhead',
  'Buford Highway',
  'Cabbagetown',
  'Castleberry Hill',
  'Decatur',
  'Downtown',
  'Druid Hills',
  'East Atlanta Village',
  'Edgewood',
  'Glenwood Park',
  'Grant Park',
  'Inman Park',
  'Kirkwood',
  'Lindbergh',
  'Little Five Points',
  'Midtown',
  'North Druid Hills',
  'Old Fourth Ward',
  'Poncey-Highland',
  'Reynoldstown',
  'Virginia-Highland',
  'West End',
  'West Midtown',
] as const;

export const TYPES = {
  food: 'Food',
  bar: 'Bar',
  club: 'Club',
  strip: 'Strip club',
  cafe: 'Café',
  venue: 'Venue',
  pharmacy: 'Pharmacy',
  other: 'Other',
} as const;

export type TypeKey = keyof typeof TYPES;

/** Shown beside each type in the Type menu. */
export const TYPE_EMOJI: Record<TypeKey, string> = {
  food: '🍽️',
  bar: '🍸',
  club: '🪩',
  strip: '💃',
  cafe: '☕',
  venue: '🎤',
  pharmacy: '💊',
  other: '✨',
};

/** Types left out of the Type filter until someone ticks them: errands, not a night out. */
export const DEFAULT_OFF_TYPES: readonly TypeKey[] = ['pharmacy'];

/**
 * "Good to know" tags: things that decide whether a late-night plan works. Optional, and
 * a place without a tag means we don't know, not that it doesn't apply. Put the
 * specifics (how much, which nights) in the place's notes.
 */
export const TAGS = {
  cover: 'Cover charge',
  'cash-only': 'Cash only',
  '21-plus': '21+',
} as const;

export type TagKey = keyof typeof TAGS;

/** Each tag's emoji: on its own on list cards (the name shows on hover), beside the name on place pages. */
export const TAG_EMOJI: Record<TagKey, string> = { cover: '🎟️', 'cash-only': '💵', '21-plus': '🔞' };

/** Display label for a place's types, e.g. "Bar & Venue". */
export const typeLabel = (types: readonly TypeKey[]) => types.map((t) => TYPES[t]).join(' & ');

/**
 * Cuisines that share one entry in the Type menu's Food list. A place keeps its own
 * cuisine (on its card, in search, on its page); the filter goes by the group.
 * Also maps old cuisine values in shared links and saved choices.
 */
export const CUISINE_GROUPS: Record<string, string> = {
  cheesesteaks: 'sandwiches',
  vietnamese: 'southeast asian',
  american: 'euromerican',
  diner: 'euromerican',
  greek: 'mediterranean',
  dessert: 'sweets',
  lebanese: 'mediterranean',
  syrian: 'mediterranean',
};
export const cuisineGroup = (c: string) => CUISINE_GROUPS[c] ?? c;

/** Shown beside each cuisine (group) in the Type menu's Food list. */
export const CUISINE_EMOJI: Record<string, string> = {
  breakfast: '🧇',
  burgers: '🍔',
  chinese: '🥡',
  coffee: '☕',
  sweets: '🍦',
  euromerican: '🍳',
  'fast food': '🍟',
  mediterranean: '🥙',
  mexican: '🌮',
  noodles: '🍜',
  pizza: '🍕',
  sandwiches: '🥪',
  'southeast asian': '🍜',
  tacos: '🌮',
  wings: '🍗',
};
/** A cuisine's emoji; a plain fork and knife for any not listed above yet. */
export const cuisineEmoji = (c: string) => CUISINE_EMOJI[cuisineGroup(c)] ?? '🍴';

/** Fast food: under Food like a cuisine, but left out until someone ticks it. */
export const FAST_FOOD = 'fast food';
export const DEFAULT_OFF_CUISINES: readonly string[] = [FAST_FOOD];

/** Old type values in shared links, mapped to what replaced them. */
export const TYPE_ALIASES: Record<string, TypeKey> = { restaurant: 'food', diner: 'food', grocery: 'pharmacy' };
