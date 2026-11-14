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

/** Display label for a place's types, e.g. "Grocery & Pharmacy". */
export const typeLabel = (types: readonly TypeKey[]) => types.map((t) => TYPES[t]).join(' & ');

/** Old type values in shared links, mapped to what replaced them. */
export const TYPE_ALIASES: Record<string, TypeKey> = { restaurant: 'food', diner: 'food' };
