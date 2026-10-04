import test from 'node:test';
import assert from 'node:assert/strict';
import { TeamColourLearner, findColourPucks } from '../src/team-colours.js';
import { RoundTracker } from '../src/round-tracker.js';
import { detectDiscs, Tracker } from '../src/core.js';
import { AutoShotAnalyzer } from '../src/auto-referee.js';
import { assessVisibility } from '../src/visibility.js';
const c={center:{x:150,y:150},rings:[40,80,120],discRadius:7,width:300,height:300};
const puck=(id,team,x,y=150)=>({id,team,x,y,r:7});
const paint=(data,x,y,r,col)=>{for(let yy=Math.max(0,Math.floor(y-r));yy<Math.min(300,y+r+1);yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<Math.min(300,x+r+1);xx++)if((xx-x)**2+(yy-y)**2<=r*r)data.set([...col,255],(yy*300+xx)*4);};
function scene(colours){const background=new Uint8ClampedArray(300*300*4);for(let i=0;i<background.length;i+=4)background.set([210,175,130,255],i);paint(background,150,150,6,[20,20,20]);const pixels=new Uint8ClampedArray(background);colours.forEach((col,i)=>paint(pixels,100+i*100,150,7,col));return {pixels,background};}
function learn(candidates,known){const l=new TeamColourLearner(known);let result;for(let i=0;i<8;i++)result=l.update(candidates,i*.1);return result;}
for(const cols of [[[25,25,25],[245,245,245]],[[168,64,54],[46,113,143]],[[25,180,45],[170,40,160]]])test(`automatic colour learning with ${cols.flat().join('/')}`,()=>{
  const {pixels,background}=scene(cols),p=findColourPucks(pixels,background,300,300,c);
  assert.equal(p.length,2);const result=learn(p);assert.equal(result.colors.length,2);
  assert.ok(cols.every(col=>result.colors.some(g=>g.every((v,i)=>v===col[i]))));
  assert.equal(detectDiscs(pixels,background,300,300,c,result.colors).length,2);
});
test('empty board and permanent centre markings do not become team colours',()=>{const f=scene([]);assert.deepEqual(findColourPucks(f.pixels,f.background,300,300,c),[]);});
test('same-colour pucks do not invent a second team',()=>{const f=scene([[22,22,22],[22,22,22]]);assert.equal(learn(findColourPucks(f.pixels,f.background,300,300,c)).colors,null);});
test('similar shades are held instead of assigned opposing teams',()=>{const f=scene([[20,20,20],[45,45,45]]);assert.equal(learn(findColourPucks(f.pixels,f.background,300,300,c)).colors,null);});
test('colour assignment needs temporal evidence rather than one frame',()=>{const f=scene([[25,25,25],[245,245,245]]),p=findColourPucks(f.pixels,f.background,300,300,c);assert.equal(new TeamColourLearner().update(p,0).colors,null);});
test('moving candidates do not lock a palette',()=>{const f=scene([[25,25,25],[245,245,245]]),p=findColourPucks(f.pixels,f.background,300,300,c),l=new TeamColourLearner();for(let i=0;i<10;i++)assert.equal(l.update(p.map(q=>({...q,x:q.x+i*8})),i*.1).colors,null);});
test('manual team assignment is retained while the other colour is learned',()=>{const f=scene([[25,25,25],[245,245,245]]),p=findColourPucks(f.pixels,f.background,300,300,c);assert.deepEqual(learn(p,[[245,245,245],null]).colors,[[245,245,245],[25,25,25]]);});
test('unexplained hand-sized foreground blocks the colour-learning gate',()=>{const f=scene([[25,25,25],[245,245,245]]);paint(f.pixels,150,210,23,[190,110,80]);const p=findColourPucks(f.pixels,f.background,300,300,c);assert.equal(p.length,2);assert.equal(assessVisibility(f.pixels,f.background,300,300,c,p).viewObstructed,true);});
test('palette stays locked when the board subsequently changes',()=>{const l=new TeamColourLearner([[20,20,20],[240,240,240]]);assert.deepEqual(l.update([],1).colors,[[20,20,20],[240,240,240]]);});
function harness(limit=2){const r=new RoundTracker(limit);let time=0;const send=(ds,event=null,extras={})=>r.update(ds,c,time+=.1,{event,...extras});for(let i=0;i<5;i++)send([]);return {r,send};}
function shot(h,team,id,baseline=[],options={}){
  const sign=team===0?1:-1,entry=puck(id,team,150,150+sign*109),near=puck(id,team,150,150+sign*105);
  const end=puck(id,team,150+sign*(50+(id%3)*9),140+(id%4)*8);
  h.send([...baseline,entry]);h.send([...baseline,entry]);
  h.send([...baseline,near],{type:'shot-start',shotNumber:id,preDiscs:[...baseline,entry]});
  h.send([...baseline,puck(id,team,150,150+sign*90)],null,options);
  h.send([...baseline,end]);
  h.send([...baseline,end],{type:'shot-end',shotNumber:id,startedAt:id,postDiscs:[...baseline,end]});
  return [...baseline,end];
}
for(const limit of [8,12])test(`automatic round completion waits for exactly ${limit} shots from each team`,()=>{
  const h=harness(limit);for(let i=0;i<limit*2;i++){
    // The board clears between shots (as with hole/out-of-play removals), but the round does not.
    shot(h,i%2,i+1);h.r.baseline=[];h.send([]);
    assert.equal(h.r.status().complete,i===limit*2-1);
  }
  assert.deepEqual(h.r.status().remaining,[0,0]);
});
test('quiet or empty board alone never ends a round',()=>{const h=harness();for(let i=0;i<100;i++)h.send([]);assert.equal(h.r.status().complete,false);assert.deepEqual(h.r.used,[0,0]);});
test('setup pucks are not counted until a clear-board start',()=>{const r=new RoundTracker(2);for(let i=0;i<20;i++)r.update([puck(1,0,190),puck(2,1,110)],c,i*.1);assert.equal(r.ready,false);assert.deepEqual(r.used,[0,0]);});
test('a new shooting puck on an occupied board counts once',()=>{const h=harness();const board=shot(h,0,1);shot(h,1,2,board);assert.deepEqual(h.r.used,[1,1]);});
test('moving an existing board puck is not automatically a new shot',()=>{const h=harness();const board=shot(h,0,1);h.send(board,{type:'shot-start',shotNumber:2});h.send([puck(1,0,185)]);h.send([puck(1,0,185)],{type:'shot-end',shotNumber:2,startedAt:2,postDiscs:[puck(1,0,185)]});assert.deepEqual(h.r.used,[1,0]);assert.ok(h.r.hold);});
test('wrong team sequence requires count review',()=>{const h=harness();shot(h,0,1);h.r.baseline=[];shot(h,0,2);assert.deepEqual(h.r.used,[1,0]);assert.match(h.r.hold,/sequence/);});
test('a release hidden before inward travel does not consume a shot automatically',()=>{const h=harness();shot(h,0,1,[],{viewObstructed:true});assert.deepEqual(h.r.used,[0,0]);assert.ok(h.r.hold);});
test('merely picking up a launch puck does not consume a shot',()=>{const h=harness();const entry=puck(1,0,259);h.send([entry]);h.send([entry],{type:'shot-start',shotNumber:1});h.send([],{type:'shot-end',shotNumber:1,startedAt:1,postDiscs:[]});assert.equal(h.r.status().complete,false);assert.deepEqual(h.r.used,[0,0]);assert.ok(h.r.hold);});
test('count correction is explicit, validated and does not change scoring',()=>{const h=harness();assert.throws(()=>h.r.correct([0,2],[]),/Alternating/);assert.throws(()=>h.r.correct([-1,1],[]));h.r.correct([1,1],[]);assert.deepEqual(h.r.used,[1,1]);assert.equal(h.r.status().complete,false);});
test('reload preserves usage but prevents blind automatic completion',()=>{const h=harness();shot(h,0,1);const restored=new RoundTracker();restored.restore(h.r.snapshot());assert.deepEqual(restored.used,[1,0]);assert.ok(restored.hold);assert.equal(restored.status().complete,false);});
test('new round resets usage and requires the old board to clear',()=>{const h=harness(1);shot(h,0,1);h.r.baseline=[];shot(h,1,2);assert.ok(h.r.status().complete);h.r.reset();assert.equal(h.r.ready,false);assert.deepEqual(h.r.used,[0,0]);});
test('whole detector/analyser sequence records a genuine edge launch',()=>{
  const h=harness(1),track=new Tracker(),analyzer=new AutoShotAnalyzer(c),f=scene([]);let time=0,events=[];
  // Independent pixel fixture, not the RoundTracker helper's fabricated events.
  const counter=new RoundTracker(1),colors=[[25,25,25],[245,245,245]];
  for(let i=0;i<100;i++){
    const pixels=new Uint8ClampedArray(f.background);const y=i<15?null:i<25?259:i<40?259-(i-25)*5:184;
    if(y!==null)paint(pixels,150,y,7,colors[0]);
    const ds=detectDiscs(pixels,f.background,300,300,c,colors),tr=track.update(ds,time),vis=assessVisibility(pixels,f.background,300,300,c,tr.discs),auto=analyzer.update({...tr,...vis},time);
    counter.update(tr.discs,c,time,{event:auto.event,frameGap:tr.frameGap,viewObstructed:vis.viewObstructed});
    if(auto.event)events.push(auto.event.type);time+=1/30;
  }
  assert.deepEqual(events,['shot-start','shot-end']);assert.deepEqual(counter.used,[1,0]);assert.equal(counter.hold,'');
});
