import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoRound,DEMO_INTRO_SECONDS,DEMO_SHOT_SECONDS} from '../src/demo-round.js';
const expected=[[20,0],[20,15],[35,10],[30,25],[40,15],[35,25],[50,20],[45,40],[55,30],[45,40],[55,35],[50,45],[60,35],[65,40],[75,35],[70,55]];

test('full demonstration has 16 alternating shots and all independently enumerated scores',()=>{
  const round=new DemoRound();
  assert.deepEqual(round.at(0).discs,[]);
  for(let i=0;i<16;i++){
    const f=round.at(DEMO_INTRO_SECONDS+(i+1)*DEMO_SHOT_SECONDS);
    assert.equal(f.completed,i+1);assert.deepEqual(f.scores,expected[i]);
    assert.equal(f.history[i].team,i%2);assert.equal(f.used[0]+f.used[1],i+1);
    assert.equal(f.source,'scripted-demo');
  }
  const end=round.at(round.duration);
  assert.equal(end.phase,'complete');assert.deepEqual(end.used,[8,8]);assert.deepEqual(end.remaining,[0,0]);
  assert.deepEqual(end.boardScores,[50,15]);assert.deepEqual(end.twenties,[1,2]);assert.deepEqual(end.awarded,[15,0]);
  assert.equal(end.discs.filter(d=>d.out).length,4);assert.equal(end.discs.filter(d=>!d.out).length,9);
  assert.equal(end.discs.length+end.twenties.reduce((a,b)=>a+b),16);
});

test('second demo round alternates starter and keeps color labels and scoring consistent',()=>{
  const round=new DemoRound({starter:1,round:2});
  for(let i=0;i<16;i++){
    const f=round.at(DEMO_INTRO_SECONDS+(i+1)*DEMO_SHOT_SECONDS);
    assert.deepEqual(f.scores,[...expected[i]].reverse());assert.equal(f.history[i].team,(i+1)%2);
  }
  const end=round.at(round.duration);assert.deepEqual(end.awarded,[0,15]);
  assert.match(end.history[14].title,/Last red/);assert.match(end.history[15].title,/Last blue/);
});

test('demo uses the existing match-point calculation without modifying it',()=>{
  const round=new DemoRound({mode:'match'});assert.deepEqual(round.at(round.duration).awarded,[2,0]);
  assert.throws(()=>new DemoRound({mode:'invalid'}));
});

test('animated states and copies remain finite, deterministic and isolated',()=>{
  const round=new DemoRound();
  for(let time=0;time<round.duration;time+=0.11){
    const f=round.at(time);assert.deepEqual(f,round.at(time));
    assert.ok(f.discs.every(d=>Number.isFinite(d.x+d.y+d.r)));assert.ok(f.used.every(n=>n>=0&&n<=8));
    f.discs.forEach(d=>d.x=NaN);f.twenties[0]=999;f.scores[0]=999;
    assert.ok(round.at(time).discs.every(d=>Number.isFinite(d.x)));assert.notEqual(round.at(time).scores[0],999);
  }
});

test('forward step and final hold are bounded; invalid inputs do not advance a round',()=>{
  const round=new DemoRound();let t=0;
  for(let i=1;i<=16;i++){t=round.nextShotTime(t);assert.equal(round.at(t).completed,i);}
  assert.equal(round.nextShotTime(t),round.duration);assert.deepEqual(round.at(t+999),round.at(t));
  assert.deepEqual(round.at(-1),round.at(0));assert.throws(()=>round.at(NaN));assert.throws(()=>round.at(Infinity));
  assert.throws(()=>new DemoRound({starter:2}));assert.throws(()=>new DemoRound({round:0}));
});
