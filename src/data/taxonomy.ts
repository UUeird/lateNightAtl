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
  cafe: 'Café',
  venue: 'Venue',
  grocery: 'Grocery',
  pharmacy: 'Pharmacy',
  other: 'Other',
} as const;

export type TypeKey = keyof typeof TYPES;

/** Types left out of the Type filter until someone ticks them: errands, not a night out. */
export const DEFAULT_OFF_TYPES: readonly TypeKey[] = ['grocery', 'pharmacy'];

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

/** Shorter tag labels for the list cards, where space is tight. */
export const TAG_SHORT: Record<TagKey, string> = { cover: 'Cover', 'cash-only': 'Cash only', '21-plus': '21+' };

/** Display label for a place's types, e.g. "Grocery & Pharmacy". */
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
  lebanese: 'mediterranean',
  syrian: 'mediterranean',
};
export const cuisineGroup = (c: string) => CUISINE_GROUPS[c] ?? c;

/** Fast food: under Food like a cuisine, but left out until someone ticks it. */
export const FAST_FOOD = 'fast food';
export const DEFAULT_OFF_CUISINES: readonly string[] = [FAST_FOOD];

/** Old type values in shared links, mapped to what replaced them. */
export const TYPE_ALIASES: Record<string, TypeKey> = { restaurant: 'food', diner: 'food' };
