import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesType } from '../../src/lib/match.ts';

const BAR = { types: ['bar'], cuisine: [] };
const BAR_KITCHEN = { types: ['bar'], cuisine: ['american'] };
const PIZZA = { types: ['food'], cuisine: ['pizza'] };
const TACOS = { types: ['food'], cuisine: ['mexican'] };
const pick = (types: string[], cuisines: string[] = []) => [new Set(types), new Set(cuisines)] as const;

test('M01 nothing picked matches everything', () => {
  for (const p of [BAR, PIZZA]) assert.equal(matchesType(p, ...pick([])), true);
});

test('M02 Food with no cuisine is any food place', () => {
  assert.equal(matchesType(PIZZA, ...pick(['food'])), true);
  assert.equal(matchesType(BAR_KITCHEN, ...pick(['food'])), false);
});

test('M03 cuisines narrow food places only (a bar with a kitchen counts as a bar)', () => {
  assert.equal(matchesType(PIZZA, ...pick(['food'], ['pizza'])), true);
  assert.equal(matchesType(TACOS, ...pick(['food'], ['pizza'])), false);
  assert.equal(matchesType(BAR_KITCHEN, ...pick(['food'], ['american'])), false);
  assert.equal(matchesType(BAR_KITCHEN, ...pick(['bar', 'food'], ['american'])), true);
});

test('M05 fast food counts only when Fast Food is picked, whatever else it serves', () => {
  const COOK = { types: ['food'], cuisine: ['fast food', 'burgers'] };
  assert.equal(matchesType(COOK, ...pick(['food'], ['burgers', 'pizza'])), false); // the usual food
  assert.equal(matchesType(COOK, ...pick(['food'], ['burgers', 'fast food'])), true);
  assert.equal(matchesType(COOK, ...pick(['food'])), true); // all food
  assert.equal(matchesType(COOK, ...pick([])), true); // nothing filtered
});

test('M04 other types add to the food picks', () => {
  assert.equal(matchesType(BAR, ...pick(['bar', 'food'], ['pizza'])), true);
  assert.equal(matchesType(TACOS, ...pick(['bar', 'food'], ['pizza'])), false);
  assert.equal(matchesType(PIZZA, ...pick(['bar'])), false);
});
