import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoRound} from '../src/demo-round.js';
import {DEMO_BOARD as B} from '../src/demo-physics.js';
// Regression fixture from the new physical sequence, not forced outcome inputs.
const expected=[[20,0],[20,15],[35,10],[35,25],[35,20],[30,35],[30,35],[20,50],[30,50],[30,55],[35,60],[25,70],[30,65],[30,70],[30,65],[25,70]];

test('16 alternating launches produce scores from the settled physical world',()=>{
 const r=new DemoRound();assert.deepEqual(r.at(0).discs,[]);
 for(let i=0;i<16;i++){const f=r.at(r.stages[i].endTime);assert.equal(f.completed,i+1);assert.deepEqual(f.scores,expected[i]);assert.equal(f.history[i].team,i%2);assert.equal(f.source,'physics-demo');}
 const f=r.at(r.duration);assert.equal(f.phase,'complete');assert.deepEqual(f.used,[8,8]);assert.deepEqual(f.twenties,[1,0]);assert.deepEqual(f.boardScores,[5,70]);assert.deepEqual(f.awarded,[0,45]);
 assert.equal(f.discs.length+f.twenties.reduce((a,b)=>a+b),16);assert.ok(r.duration<80);
});
test('every solved frame respects the same eight peg footprints that are rendered',()=>{
 const r=new DemoRound();let checks=0;
 for(const s of r.stages)for(const frame of s.frames){
   const discs=frame.filter(d=>d.status==='board');
   for(let i=0;i<discs.length;i++){
     const d=discs[i];for(const p of B.pegs){assert.ok(Math.hypot(d.x-p.x,d.y-p.y)>=d.r+p.r-1e-4,`shot${s.id} disc${d.id} passed through peg${p.id}`);checks++;}
     for(let j=i+1;j<discs.length;j++)assert.ok(Math.hypot(d.x-discs[j].x,d.y-discs[j].y)>=d.r+discs[j].r-1e-4,`shot${s.id} overlapping discs`);
   }
 }
 assert.ok(checks>100000);
 const events=r.stages.flatMap(s=>s.events);
 assert.ok(events.some(e=>e.type==='peg'));assert.ok(events.some(e=>e.type==='disc'));assert.ok(events.some(e=>e.type==='gutter'));
 for(const e of events.filter(e=>e.type==='peg'||e.type==='disc'))assert.ok(Math.abs(e.gap)<1e-5,'Rebound happened without contact');
});
test('replay, display cadence and playback speed do not change the physics',()=>{
 const r=new DemoRound();const r2=new DemoRound();
 for(const hz of [20,30,60,120])for(const speed of [.5,1,2]){
  for(let t=0;t<r.duration;t+=speed/hz){const f=r.at(t);assert.deepEqual(f,r2.at(t));assert.ok(f.discs.every(d=>Number.isFinite(d.x+d.y+d.r)));}
 }
 const f=r.at(10);f.discs[0].x=NaN;assert.ok(r.at(10).discs.every(d=>Number.isFinite(d.x)));
});
test('next round swaps team roles without changing physical outcomes, with shared match scoring',()=>{
 const r=new DemoRound({starter:1,round:2});
 for(let i=0;i<16;i++)assert.deepEqual(r.at(r.stages[i].endTime).scores,[...expected[i]].reverse());
 assert.deepEqual(r.at(r.duration).awarded,[45,0]);
 const m=new DemoRound({mode:'match'});assert.deepEqual(m.at(m.duration).awarded,[0,2]);
});
test('skip, final hold and invalid inputs remain bounded',()=>{
 const r=new DemoRound();let t=0;
 for(let i=1;i<=16;i++){t=r.nextShotTime(t);assert.equal(r.at(t).completed,i);}
 assert.equal(r.nextShotTime(t),r.duration);assert.deepEqual(r.at(t+999),r.at(t));assert.deepEqual(r.at(-1),r.at(0));
 assert.throws(()=>r.at(NaN));assert.throws(()=>new DemoRound({starter:2}));assert.throws(()=>new DemoRound({round:0}));
});
