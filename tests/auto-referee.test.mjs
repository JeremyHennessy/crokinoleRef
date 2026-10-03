import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoShotAnalyzer, scoreSettledBoard } from '../src/auto-referee.js';

const calibration={center:{x:150,y:150},rings:[40,80,120],discRadius:7,width:300,height:300};
const d=(id,team,x,y,r=7)=>({id,team,x,y,r});
const frame=(discs,extras={})=>({discs,contacts:[],frameGap:false,...extras});

test('settled-board scoring totals visible pucks and tracked 20s',()=>{
  const score=scoreSettledBoard([d(1,0,170,150),d(2,1,205,150)],calibration,[1,0]);
  assert.deepEqual(score.visible,[15,10]);
  assert.deepEqual(score.totals,[35,10]);
  assert.deepEqual(score.twenties,[1,0]);
});

test('line-adjacent puck is scored conservatively and flagged for review',()=>{
  const score=scoreSettledBoard([d(1,0,183,150)],calibration,[0,0]);
  assert.equal(score.totals[0],10);
  assert.equal(score.review,true);
});

test('motion starts a shot and settlement ends it with an automatic score',()=>{
  const a=new AutoShotAnalyzer(calibration,{settleSeconds:.5});
  assert.equal(a.update(frame([d(1,0,220,150),d(2,1,180,150)]),0).event,null);
  a.update(frame([d(1,0,220,150),d(2,1,180,150)]),.04);
  const start=a.update(frame([d(1,0,205,150),d(2,1,180,150)]),.08).event;
  assert.equal(start.type,'shot-start');
  a.update(frame([d(1,0,195,150),d(2,1,180,150)]),.12);
  a.update(frame([d(1,0,195,150),d(2,1,180,150)]),.20);
  const end=a.update(frame([d(1,0,195,150),d(2,1,180,150)]),.75).event;
  assert.equal(end.type,'shot-end');
  assert.equal(end.applyScore,true);
  assert.deepEqual(end.score.totals,[10,15]);
});

test('single puck trajectory into the centre then disappearance is a high-confidence 20',()=>{
  const a=new AutoShotAnalyzer(calibration,{settleSeconds:.4});
  a.update(frame([d(1,0,220,150),d(2,1,190,150)]),0);
  a.update(frame([d(1,0,220,150),d(2,1,190,150)]),.04);
  assert.equal(a.update(frame([d(1,0,190,150),d(2,1,190,150)]),.08).event.type,'shot-start');
  a.update(frame([d(1,0,158,150),d(2,1,190,150)]),.12);
  a.update(frame([d(2,1,190,150)]),.16);
  a.update(frame([d(2,1,190,150)]),.25);
  const end=a.update(frame([d(2,1,190,150)]),.70).event;
  assert.equal(end.type,'shot-end');
  assert.deepEqual(end.twentiesAdded,[{id:1,team:0}]);
  assert.equal(end.score.totals[0],20);
  assert.equal(end.applyScore,true);
});

test('frame gap prevents a disappearing centre puck from being auto-awarded as a 20',()=>{
  const a=new AutoShotAnalyzer(calibration,{settleSeconds:.4});
  a.update(frame([d(1,0,220,150)]),0);
  a.update(frame([d(1,0,220,150)]),.04);
  a.update(frame([d(1,0,190,150)]),.08);
  a.update(frame([d(1,0,158,150)],{frameGap:true}),.12);
  a.update(frame([]),.16);
  a.update(frame([]),.25);
  const end=a.update(frame([]),.70).event;
  assert.equal(end.type,'shot-end');
  assert.equal(end.twentiesAdded.length,0);
  assert.equal(end.applyScore,false);
});

test('multiple centre disappearances are review candidates, not invented 20s',()=>{
  const a=new AutoShotAnalyzer(calibration,{settleSeconds:.4});
  a.update(frame([d(1,0,180,150),d(2,1,180,160)]),0);
  a.update(frame([d(1,0,180,150),d(2,1,180,160)]),.04);
  a.update(frame([d(1,0,158,150),d(2,1,158,160)]),.08);
  a.update(frame([]),.12);
  a.update(frame([]),.22);
  const end=a.update(frame([]),.68).event;
  assert.equal(end.twentyCandidates.length,2);
  assert.equal(end.twentiesAdded.length,0);
  assert.equal(end.applyScore,false);
});

test('shot analyzer never emits a legal or foul verdict',()=>{
  const a=new AutoShotAnalyzer(calibration,{settleSeconds:.3});
  a.update(frame([d(1,0,220,150)]),0);
  a.update(frame([d(1,0,220,150)]),.04);
  const start=a.update(frame([d(1,0,200,150)]),.08).event;
  assert.equal(start.verdict,undefined);
  a.update(frame([d(1,0,200,150)]),.15);
  const end=a.update(frame([d(1,0,200,150)]),.5).event;
  assert.equal(end.verdict,undefined);
});
