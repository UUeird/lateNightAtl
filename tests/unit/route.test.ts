import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline6, formatDuration } from '../../src/lib/route.ts';

test('R01 decodes a Valhalla (6-digit) polyline into [lng, lat] points', () => {
  // Little Five Points toward Ponce City Market, from a real Valhalla response (first points).
  const [first, second] = decodePolyline6('ghyk_Alpg{_DyGAgF@');
  assert.deepEqual(first, [-84.349207, 33.7645]); // the start, snapped to the nearest road
  assert.ok(Math.abs(second[1] - first[1]) < 0.001 && Math.abs(second[0] - first[0]) < 0.001);
});

test('R02 formats travel times', () => {
  assert.equal(formatDuration(20), '1 min'); // never "0 min"
  assert.equal(formatDuration(101.9), '2 min');
  assert.equal(formatDuration(59 * 60), '59 min');
  assert.equal(formatDuration(60 * 60), '1 hr');
  assert.equal(formatDuration(65 * 60), '1 hr 5 min');
});

test('R03 partialLine grows a path along its length', async () => {
  const { partialLine } = await import('../../src/lib/route.ts');
  // An L: 1 unit east, then 1 unit north (at the equator, so no latitude squash).
  const L: [number, number][] = [[0, 0], [1, 0], [1, 1]];
  assert.deepEqual(partialLine(L, 0), [[0, 0]]);
  assert.deepEqual(partialLine(L, 0.25), [[0, 0], [0.5, 0]]); // halfway along the first leg
  assert.deepEqual(partialLine(L, 0.75), [[0, 0], [1, 0], [1, 0.5]]); // halfway up the second
  assert.deepEqual(partialLine(L, 1), L);
});
