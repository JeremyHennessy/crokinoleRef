import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoRound,DEMO_CALIBRATION as C} from '../src/demo-round.js';

test('a stopped outer-line puck is removed before the next launch or collision',()=>{
  const round=new DemoRound();
  for(let i=0;i<round.stages.length;i++){
    const stage=round.stages[i];
    const stale=stage.after.filter(d=>d.status==='board'&&Math.hypot(d.x-C.center.x,d.y-C.center.y)+d.r>=C.rings[2]-1e-8);
    assert.deepEqual(stale.map(d=>d.id),[],`shot ${i+1} leaves zero-point discs in play`);
  }
});


test('removed pucks cannot be struck again or count toward subsequent board scores',()=>{
 const round=new DemoRound(),removed=new Set();
 for(const stage of round.stages){
  for(const e of stage.events.filter(e=>e.type==='disc'))for(const id of [e.id,e.other])assert.equal(removed.has(id),false,`removed disc ${id} struck again in shot ${stage.id}`);
  for(const d of stage.rules.removals)removed.add(d.id);
  const expected=[0,0];
  for(const d of stage.dispositions){
    if(d.status==='hole')expected[d.team]+=20;
    if(d.status==='board'){
      const far=Math.hypot(d.x-480,d.y-360)+d.r;
      expected[d.team]+=far<94?15:far<185?10:far<260?5:0;
    }
  }
  assert.deepEqual(stage.score.totals,expected);
 }
 assert.ok(removed.has(5),'original A5 regression remains exercised');
});
