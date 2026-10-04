import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDiscs, Tracker } from '../src/core.js';
import { assessVisibility } from '../src/visibility.js';
import { AutoShotAnalyzer } from '../src/auto-referee.js';
const w=300,h=300,c={center:{x:150,y:150},rings:[40,80,120],discRadius:7,width:w,height:h};
const colors=[[20,20,20],[240,240,240]];
function image(ds){const px=new Uint8ClampedArray(w*h*4);for(let p=0;p<px.length;p+=4)px.set([188,149,108,255],p);for(const d of ds)for(let y=Math.floor(d.y-7);y<=d.y+7;y++)for(let x=Math.floor(d.x-7);x<=d.x+7;x++)if((x-d.x)**2+(y-d.y)**2<=49)px.set([...(d.color||colors[d.team]),255],(y*w+x)*4);return px;}
const bg=image([]),cluster=[{x:200,y:140,team:0},{x:214,y:140,team:0}];
test('two unresolved touching pucks are not a clear board even before first detection',()=>{
  const px=image(cluster),ds=detectDiscs(px,bg,w,h,c,colors),v=assessVisibility(px,bg,w,h,c,ds);
  assert.equal(v.viewObstructed,true);assert.ok(v.unresolvedRegions.length>0);
});
test('unrecognised puck colour remains foreground evidence, not an invisible disc',()=>{
  const px=image([{x:210,y:170,color:[120,20,200]}]);const ds=detectDiscs(px,bg,w,h,c,colors);
  assert.equal(ds.length,0);assert.equal(assessVisibility(px,bg,w,h,c,ds).viewObstructed,true);
});
test('touching-puck scene never auto-applies an incomplete 0–10 score',()=>{
  const tracker=new Tracker(),analyzer=new AutoShotAnalyzer(c,{settleSeconds:.3});let applied=[];
  for(let f=0;f<90;f++){
    const ds=[...cluster,{x:100-Math.min(10,Math.max(0,f-20)),y:155,team:1}],px=image(ds);
    const tr=tracker.update(detectDiscs(px,bg,w,h,c,colors),f/30),v=assessVisibility(px,bg,w,h,c,tr.discs),out=analyzer.update({...tr,...v},f/30);
    if(out.event?.applyScore)applied.push(out.event.score.totals);
  }
  assert.deepEqual(applied,[]);
});
test('separate known discs remain clear under the foreground check',()=>{
 const ds=[{x:200,y:140,team:0},{x:100,y:170,team:1}],px=image(ds),det=detectDiscs(px,bg,w,h,c,colors);
 assert.equal(det.length,2);assert.equal(assessVisibility(px,bg,w,h,c,det).viewObstructed,false);
});
