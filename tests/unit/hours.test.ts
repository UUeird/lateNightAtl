import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closesLabel, defaultNight, defaultOpenUntil, formatDay, formatTime, is24h, latestClose, openSpanAt, opensLaterTonight, tonight, type Hours } from '../../src/lib/hours.ts';

const H24: Hours = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, [['00:00', '24:00']]]));
const LOUNGE: Hours = { thu: [['22:00', '03:00']], fri: [['22:00', '04:00']], sat: [['22:00', '04:00']] };
const CAFE: Hours = { mon: [['07:00', '00:00']], sat: [['08:00', '00:00']] };
const SPLIT: Hours = { fri: [['11:00', '15:00'], ['17:00', '02:00']] };
const FRI = 5, SAT = 6, SUN = 0, MON = 1;
const at = (h: Hours, night: number, hh: number, mm = 0) => {
  const s = openSpanAt(h, night, hh * 60 + mm);
  return s ? closesLabel(s[1], s[0]) : 'closed';
};

test('H01 spans that cross midnight count toward the night they started', () => {
  assert.equal(at(LOUNGE, FRI, 26), 'Open till 4 AM'); // Friday night 2 AM
  assert.equal(at(LOUNGE, FRI, 27, 59), 'Open till 4 AM');
  assert.equal(at(LOUNGE, FRI, 28), 'closed'); // closes at 4
  assert.equal(at(LOUNGE, 4, 27, 30), 'closed'); // Thursday closes at 3
});

test('H02 opening time is respected', () => {
  assert.equal(at(LOUNGE, FRI, 21, 59), 'closed');
  assert.equal(at(LOUNGE, FRI, 22), 'Open till 4 AM');
});

test('H03 closing at midnight is open until, not at, midnight', () => {
  assert.equal(at(CAFE, SAT, 23, 59), 'Open till midnight');
  assert.equal(at(CAFE, SAT, 24), 'closed');
  assert.equal(at(CAFE, SUN, 22), 'closed');
});

test('H04 24-hour places chain across days', () => {
  assert.equal(at(H24, FRI, 27), 'Open 24 hours');
  assert.equal(at(H24, MON, 3), 'Open 24 hours');
  assert.ok(is24h(H24));
  assert.ok(!is24h(LOUNGE));
});

test('H05 "right now" in the early morning sees the previous night', () => {
  // Saturday 1 AM, queried as Saturday minute 60: Friday's span covers it.
  assert.equal(at(LOUNGE, SAT, 1), 'Open till 4 AM');
});

test('H06 split hours', () => {
  assert.equal(at(SPLIT, FRI, 16), 'closed');
  assert.equal(at(SPLIT, FRI, 25), 'Open till 2 AM');
  assert.equal(formatDay(SPLIT, FRI), '11 AM – 3 PM, 5 PM – 2 AM');
});

test('H07 latestClose', () => {
  assert.equal(latestClose(LOUNGE, FRI), 28 * 60);
  assert.equal(latestClose(LOUNGE, MON), null);
});

test('H08 formatTime', () => {
  assert.equal(formatTime(0), 'midnight');
  assert.equal(formatTime(720), 'noon');
  assert.equal(formatTime(26 * 60 + 30), '2:30 AM');
  assert.equal(formatTime(21 * 60), '9 PM');
});

test('H09 tonight() rolls over at 5 AM Atlanta time', () => {
  assert.equal(tonight(new Date('2026-11-14T06:30:00Z')), FRI); // Sat 1:30 AM EST
  assert.equal(tonight(new Date('2026-11-14T10:30:00Z')), SAT); // Sat 5:30 AM EST
  assert.equal(tonight(new Date('2026-07-04T08:30:00Z')), FRI); // Sat 4:30 AM EDT
});

test('H10 "Open until" starts half an hour out, rounded up to the half hour, within 9 PM – 4 AM', () => {
  const atl = (iso: string) => defaultOpenUntil(new Date(iso)); // EST is UTC-5 in November
  assert.equal(atl('2026-11-14T04:40:00Z'), 24 * 60 + 30); // 11:40 PM → 12:30 AM
  assert.equal(atl('2026-11-14T02:30:00Z'), 22 * 60); // 9:30 PM → 10 PM
  assert.equal(atl('2026-11-14T03:00:00Z'), 22 * 60 + 30); // 10 PM → 10:30 PM
  assert.equal(atl('2026-11-14T02:05:00Z'), 22 * 60); // 9:05 PM → 10 PM
  assert.equal(atl('2026-11-14T06:15:00Z'), 26 * 60); // 1:15 AM → 2 AM (same night)
  assert.equal(atl('2026-11-14T01:30:00Z'), 21 * 60); // 8:30 PM → 9 PM
  assert.equal(atl('2026-11-14T17:00:00Z'), 21 * 60); // noon → 9 PM
  assert.equal(atl('2026-11-14T09:00:00Z'), 28 * 60); // 4 AM → 4 AM, the last choice
  assert.equal(atl('2026-11-14T11:00:00Z'), 21 * 60); // 6 AM, a new day → 9 PM
});

test('H11 opensLaterTonight finds the next opening before the night ends', () => {
  assert.equal(opensLaterTonight(LOUNGE, FRI, 21 * 60), 22 * 60); // 9 PM: opens at 10
  assert.equal(opensLaterTonight(LOUNGE, FRI, 22 * 60), null); // already open
  assert.equal(opensLaterTonight(SPLIT, FRI, 16 * 60), 17 * 60); // between lunch and dinner
  assert.equal(opensLaterTonight(CAFE, SUN, 22 * 60), null); // closed Sunday, Monday's 7 AM is tomorrow
  assert.equal(opensLaterTonight({ sat: [['01:00', '04:00']] }, FRI, 23 * 60), 25 * 60); // after midnight still counts
});

test('H12 the explorer starts on "Right now" from 9 PM until the 5 AM rollover', () => {
  const atl = (iso: string) => defaultNight(new Date(iso)); // EST is UTC-5 in November
  assert.equal(atl('2026-11-14T01:59:00Z'), 'tonight'); // 8:59 PM
  assert.equal(atl('2026-11-14T02:00:00Z'), 'now'); // 9 PM
  assert.equal(atl('2026-11-14T07:00:00Z'), 'now'); // 2 AM
  assert.equal(atl('2026-11-14T09:59:00Z'), 'now'); // 4:59 AM
  assert.equal(atl('2026-11-14T10:00:00Z'), 'tonight'); // 5 AM, a new day
  assert.equal(atl('2026-11-14T17:00:00Z'), 'tonight'); // noon
});
