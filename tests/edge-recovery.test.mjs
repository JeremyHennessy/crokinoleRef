import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoShotAnalyzer, scoreSettledBoard } from '../src/auto-referee.js';

const c = { center: { x: 150, y: 150 }, rings: [40, 80, 120], discRadius: 7, width: 300, height: 300 };
const disc = (id, team, x, y = 150) => ({ id, team, x, y, r: 7 });
const b = disc(2, 1, 170);
const frame = discs => ({ discs, contacts: [], frameGap: false, viewObstructed: false });
function start(lastX, options = {}) {
  const a = new AutoShotAnalyzer(c, { settleSeconds: .4, ...options });
  a.update(frame([disc(1, 0, lastX - 8), b]), 0);
  a.update(frame([disc(1, 0, lastX - 8), b]), .04);
  assert.equal(a.update(frame([disc(1, 0, lastX), b]), .08).event.type, 'shot-start');
  return a;
}
function loseAndSettle(a) {
  a.update(frame([b]), .12);
  a.update(frame([b]), .16);
  return a.update(frame([b]), .64);
}

test('a last-seen 5-point puck near the outer ring is not evidence of an exit', () => {
  assert.equal(scoreSettledBoard([disc(1, 0, 258)], c).visible[0], 5);
  const result = loseAndSettle(start(258));
  assert.equal(result.event, null);
  assert.equal(result.waitingForRecovery, true);
});

test('near-edge dropout recovers without losing the puck score', () => {
  const a = start(258);
  assert.equal(loseAndSettle(a).event, null);
  a.update(frame([disc(1, 0, 258), b]), .68);
  a.update(frame([disc(1, 0, 258), b]), .72);
  const event = a.update(frame([disc(1, 0, 258), b]), 1.16).event;
  assert.equal(event.type, 'shot-end');
  assert.equal(event.applyScore, true);
  assert.deepEqual(event.score.totals, [5, 15]);
});

test('unrecovered near-edge dropout times out for review, not a false zero', () => {
  const a = start(258, { maxShotSeconds: 2 });
  assert.equal(loseAndSettle(a).event, null);
  const event = a.update(frame([b]), 2.16).event;
  assert.equal(event.applyScore, false);
  assert.equal(event.timedOut, true);
  assert.equal(event.outOfPlay.length, 0);
  assert.ok(event.unexplainedLosses.some(d => d.id === 1));
});

test('outer-line uncertainty still requires recovery or review', () => {
  for (const x of [262, 263, 264, 265]) {
    assert.equal(scoreSettledBoard([disc(1, 0, x)], c).review, true);
    const result = loseAndSettle(start(x));
    assert.equal(result.event, null, `x=${x} must not infer an exit from a line call`);
  }
});

test('a visibly zero-point last position can leave without blocking normal scoring', () => {
  const score = scoreSettledBoard([disc(1, 0, 269)], c);
  assert.equal(score.visible[0], 0);
  assert.equal(score.review, false);
  const event = loseAndSettle(start(269)).event;
  assert.equal(event.type, 'shot-end');
  assert.equal(event.applyScore, true);
  assert.deepEqual(event.score.totals, [0, 15]);
  assert.deepEqual(event.outOfPlay.map(d => d.id), [1]);
  assert.deepEqual(event.twentiesAdded, []);
});
