import test from 'node:test';
import assert from 'node:assert/strict';
import {RoundTracker} from '../src/round-tracker.js';
const c={center:{x:150,y:150},rings:[40,80,120],discRadius:7};
test('verified count correction can resume after a camera restart resets media time',()=>{
  const r=new RoundTracker(2);
  r.correct([1,2],[]);
  r.update([],c,100);
  r.interrupt();
  r.update([],c,1);
  assert.match(r.status().hold,/timing changed/);
  r.correct([1,2],[]);
  const s=r.update([],c,1.04);
  assert.equal(s.hold,'');assert.deepEqual(s.used,[1,0]);
});
