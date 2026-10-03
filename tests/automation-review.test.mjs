import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { scaleCalibration, detectDiscs, Tracker } from '../src/core.js';
import { scoreSettledBoard, AutoShotAnalyzer } from '../src/auto-referee.js';
import { assessVisibility } from '../src/visibility.js';
const c={center:{x:480,y:360},rings:[94,185,260],discRadius:14,width:960,height:720};
const final=[{id:1,team:0,x:480,y:428,r:14},{id:2,team:1,x:480,y:290,r:14},{id:3,team:0,x:620,y:290,r:14},{id:4,team:1,x:340,y:410,r:14}];
const scaled=(ds,k)=>ds.map(d=>({...d,x:d.x*k,y:d.y*k,r:d.r*k}));
for(const k of [1/3,2/3,1])test(`scoring uses shared analysis calibration at scale ${k}`,()=>{
  const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const fn=source.match(/function analysisCalibration\(\) \{[\s\S]*?\n\}/)[0];
  const result=vm.runInNewContext(fn+';analysisCalibration()', {state:{calibration:c,projection:null},small:{width:c.width*k},board:{width:c.width},scaleCalibration});
  assert.deepEqual(scoreSettledBoard(scaled(final,k),result).totals,[25,25]);
  assert.match(source,/scoreSettledBoard\(event.postDiscs \|\| \[\], analysisCalibration\(\)/);
});
test('rectified calibration is not scaled a second time',()=>{
  const rectified=scaleCalibration(c,2/3),source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const fn=source.match(/function analysisCalibration\(\) \{[\s\S]*?\n\}/)[0];
  const result=vm.runInNewContext(fn+';analysisCalibration()', {state:{calibration:rectified,projection:{}},small:{width:640},board:{width:1920},scaleCalibration});
  assert.deepEqual(scoreSettledBoard(scaled(final,2/3),result).totals,[25,25]);
});
test('confirmed 20 ledger and corrections survive a later board recomputation',()=>{
  assert.deepEqual(scoreSettledBoard(final,c,[1,0],[5,0]).totals,[50,25]);
});
test('invalid disc coordinates are held for review, not silently counted',()=>{
  assert.equal(scoreSettledBoard([{...final[0],x:NaN}],c).review,true);
  assert.throws(()=>scoreSettledBoard([],c,[NaN,0]));
});
const cal=scaleCalibration(c,2/3),colors=[[46,113,143],[168,64,54]],w=640,h=480;
function image(discs=[],block=false){
  const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([220,195,145,255],i);
  for(const d of discs)for(let y=Math.floor(d.y-d.r);y<=d.y+d.r;y++)for(let x=Math.floor(d.x-d.r);x<=d.x+d.r;x++){
    if(x>=0&&x<w&&y>=0&&y<h&&(x-d.x)**2+(y-d.y)**2<=d.r*d.r)data.set([...colors[d.team],255],(y*w+x)*4);
  }
  if(block)for(let y=170;y<270;y++)for(let x=250;x<360;x++)data.set([110,100,75,255],(y*w+x)*4);
  return data;
}
const bg=image();
test('foreground visibility gate allows separated pucks and blocks a large obstruction',()=>{
  const ds=scaled(final,2/3);
  assert.equal(assessVisibility(image(ds),bg,w,h,cal,ds).viewObstructed,false);
  assert.equal(assessVisibility(image(ds,true),bg,w,h,cal,ds).viewObstructed,true);
});
test('whole pixel-detector/tracker/analyser sequence reaches the independent 25–25 score',()=>{
  const a=new AutoShotAnalyzer(cal),t=new Tracker();let end;
  for(let f=0;f<135;f++){
    const time=f/30,m=Math.max(0,Math.min(time-1,.6)),hit=Math.max(0,Math.min(time-1.6,.55));
    const ds=scaled([{...final[0],y:572-m*240},{...final[1],y:400-hit*200},final[2],final[3]],2/3);
    const px=image(ds),det=detectDiscs(px,bg,w,h,cal,colors),tr=t.update(det,time),vis=assessVisibility(px,bg,w,h,cal,det);
    const out=a.update({...tr,...vis},time);if(out.event?.type==='shot-end')end=out.event;
  }
  assert.ok(end,'shot must end');assert.equal(end.applyScore,true);assert.deepEqual(end.score.totals,[25,25]);
});
function resultWithProblem(problem){
  const a=new AutoShotAnalyzer(c,{settleSeconds:.25,maxShotSeconds:2});
  const ds=[{...final[0],x:680,y:360}];
  a.update({discs:ds},0);a.update({discs:ds},.04);
  const moved=[{...ds[0],x:630}];a.update({discs:moved},.08);
  a.update({discs:moved,...problem},.12);a.update({discs:moved},.20);
  return a.update({discs:moved},.50).event;
}
test('frame gap is a hard score gate even with all pucks present',()=>{
  const end=resultWithProblem({frameGap:true});assert.ok(end);assert.equal(end.applyScore,false);
});
test('obstruction anywhere during a shot is a hard score gate',()=>{
  const end=resultWithProblem({viewObstructed:true});assert.ok(end);assert.equal(end.applyScore,false);
});
test('close scoring line is not automatically applied',()=>{
  const a=new AutoShotAnalyzer(c,{settleSeconds:.2});const ds=[{id:1,team:0,x:640,y:360,r:14}];
  a.update({discs:ds},0);a.update({discs:ds},.04);
  const moved=[{...ds[0],x:651}];a.update({discs:moved},.08);a.update({discs:moved},.12);
  const e=a.update({discs:moved},.4).event;assert.equal(e.score.review,true);assert.equal(e.applyScore,false);
});
test('new round waits for an empty scene rather than scoring collection movements',()=>{
  const a=new AutoShotAnalyzer(c);a.requireEmpty=true;
  for(let f=0;f<5;f++)assert.equal(a.update({discs:final},f/30).event,null);
  for(let f=5;f<8;f++)a.update({discs:[]},f/30);
  assert.equal(a.requireEmpty,false);assert.equal(a.armed,true);
});
test('a newly introduced moving puck triggers without a long stationary setup',()=>{
  const a=new AutoShotAnalyzer(c);a.update({discs:[]},0);a.update({discs:[]},.04);
  a.update({discs:[{id:1,team:0,x:680,y:360,r:14}]},.08);
  assert.equal(a.update({discs:[{id:1,team:0,x:660,y:360,r:14}]},.12).event.type,'shot-start');
});

test('a new shooting puck on an occupied board triggers and enters the pre-shot count',()=>{
  const a=new AutoShotAnalyzer(c);const old={id:1,team:0,x:550,y:360,r:14};
  a.update({discs:[old]},0);a.update({discs:[old]},.04);
  a.update({discs:[old,{id:2,team:1,x:680,y:390,r:14}]},.08);
  const e=a.update({discs:[old,{id:2,team:1,x:655,y:390,r:14}]},.12).event;
  assert.equal(e.type,'shot-start');assert.equal(e.preDiscs.length,2);
});
