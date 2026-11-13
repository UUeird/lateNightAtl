// Allowed values for `area` and `type` in places.json.
// Adding a value here makes it valid in the data and shows it in the filters.

export const AREAS = [
  'Buckhead',
  'Buford Highway',
  'Cabbagetown',
  'Castleberry Hill',
  'Decatur',
  'Downtown',
  'East Atlanta Village',
  'Edgewood',
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
  restaurant: 'Restaurant',
  diner: 'Diner',
  bar: 'Bar',
  club: 'Club',
  cafe: 'Café',
  venue: 'Venue',
  grocery: 'Grocery',
  pharmacy: 'Pharmacy',
  other: 'Other',
} as const;

export type TypeKey = keyof typeof TYPES;
