import { FAST_FOOD } from '../data/taxonomy.ts'; // .ts: also run directly by the unit tests

/**
 * The Type filter. Food is a type with cuisines under it: ticked types match places of
 * that type, and picked cuisines narrow which food places (by cuisine group) count. A
 * fast food place counts as food only when Fast Food itself is picked, even if it also
 * serves a cuisine that is (burgers, say). Nothing ticked matches everything; Food with
 * no cuisines named means every food place.
 */
export function matchesType(p: { types: string[]; cuisine: string[] }, type: Set<string>, cuisine: Set<string>) {
  if (!type.size && !cuisine.size) return true;
  if (p.types.some((t) => t !== 'food' && type.has(t))) return true;
  if (!type.has('food') || !p.types.includes('food')) return false;
  if (!cuisine.size) return true;
  if (p.cuisine.includes(FAST_FOOD) && !cuisine.has(FAST_FOOD)) return false;
  return p.cuisine.some((c) => cuisine.has(c));
}
