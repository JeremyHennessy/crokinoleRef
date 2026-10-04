import test from 'node:test';
import assert from 'node:assert/strict';
import { Tracker, detectDiscEvidence, scaleCalibration } from '../src/core.js';
import { findColourPucks, TeamColourLearner } from '../src/team-colours.js';
const c={center:{x:150,y:150},rings:[40,80,120],discRadius:10,width:300,height:300};
function frame(ds=[]){const p=new Uint8ClampedArray(300*300*4);for(let i=0;i<p.length;i+=4)p.set([188,149,108,255],i);for(const d of ds)for(let y=d.y-d.r;y<=d.y+d.r;y++)for(let x=d.x-d.r;x<=d.x+d.r;x++)if((x-d.x)**2+(y-d.y)**2<=d.r*d.r)p.set([...d.color,255],(y*300+x)*4);return p;}
const colors=[[20,20,20],[240,240,240]];
test('stationary colour-teaching pucks supply a measured radius, not a board ratio',()=>{
 const bg=frame(),px=frame([{x:210,y:150,r:9,color:colors[0]},{x:90,y:150,r:9,color:colors[1]}]);const learner=new TeamColourLearner();let result;
 for(let i=0;i<7;i++)result=learner.update(findColourPucks(px,bg,300,300,c),i*.1);
 assert.ok(result.measurement);assert.ok(Math.abs(result.measurement.radius-9)<.25);assert.ok(result.measurement.samples>=10);
 assert.equal(scaleCalibration({...c,radiusUncertainty:1.2},.5).radiusUncertainty,.6);
});
test('touching-disc hypotheses never silently join scored detections',()=>{
 const px=frame([{x:205,y:150,r:10,color:colors[0]},{x:225,y:150,r:10,color:colors[0]}]);const e=detectDiscEvidence(px,frame(),300,300,c,colors);
 assert.equal(e.discs.length,0);assert.equal(e.unresolved.length,1);assert.equal(e.clusterCandidates.length,2);assert.ok(e.clusterCandidates.every(d=>d.review));
});
for(const fps of [20,30,60])test(`measured velocity follows the same fast trajectory at ${fps} fps`,()=>{
 const t=new Tracker();let id;
 for(let i=0;i<8;i++){const out=t.update([{x:10+1200*i/fps,y:40,r:14,team:0}],i/fps);id??=out.discs[0].id;assert.equal(out.discs[0].id,id);assert.equal(out.contacts.length,0);}
});
test('brief missing track is explicit and cannot add a scored disc or contact',()=>{
 const t=new Tracker(),a=t.update([{x:50,y:60,r:7,team:0}],0);t.update([{x:52,y:60,r:7,team:0}],.033);
 const lost=t.update([],.066);assert.equal(lost.discs.length,0);assert.equal(lost.unresolvedTracks.length,1);
 const back=t.update([{x:56,y:60,r:7,team:0}],.099);assert.equal(back.discs[0].id,a.discs[0].id);assert.equal(back.discs[0].trackingState,'reacquired');assert.equal(back.contacts.length,0);
 const gap=t.update([{x:56,y:60,r:7,team:0}],1);assert.notEqual(gap.discs[0].id,a.discs[0].id);
});
