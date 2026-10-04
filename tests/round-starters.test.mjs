import test from 'node:test';
import assert from 'node:assert/strict';
import {RoundTracker} from '../src/round-tracker.js';
test('explicit starter survives equal-count correction and reconnect hold',()=>{
 const r=new RoundTracker(8,1);assert.equal(r.status().nextTeam,1);
 r.correct([7,7],[]);assert.equal(r.status().nextTeam,1);
 const s=r.snapshot();const restored=new RoundTracker(8);restored.restore(s);
 assert.equal(restored.starter,1);assert.equal(restored.nextTeam,1);assert.ok(restored.hold);
});
test('a new round can reset counts with the opposite known starter',()=>{
 const r=new RoundTracker(12,0);r.correct([0,0],[]);
 r.reset(12,1-r.starter);assert.deepEqual(r.used,[0,0]);assert.equal(r.nextTeam,1);assert.equal(r.ready,false);
});
