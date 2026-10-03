import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCalibration, makePerspectiveCalibration, homographyFromFourPoints, projectPoint, scaleCalibration, warpPerspectiveRGBA, suggestedScore, roundResult, captureConstraints, averageColor, detectDiscs, Tracker } from '../src/core.js';
const points = [{x:150,y:150},{x:190,y:150},{x:230,y:150},{x:270,y:150},{x:200,y:200},{x:207,y:200}];
const cal = () => makeCalibration(points, 300, 300);
test('six-click calibration derives radii and disc size', () => { const c = cal(); assert.deepEqual(c.rings,[40,80,120]);assert.equal(c.discRadius,7); });
test('missing calibration points rejected', () => assert.throws(()=>makeCalibration(points.slice(0,5),300,300)));
test('nonfinite calibration rejected', () => assert.throws(()=>makeCalibration([{x:NaN,y:0},...points.slice(1)],300,300)));
test('reversed rings rejected', () => assert.throws(()=>makeCalibration([points[0],points[2],points[1],...points.slice(3)],300,300)));
test('clipped board rejected', () => assert.throws(()=>makeCalibration(points,200,200)));
test('zero disc radius rejected', () => assert.throws(()=>makeCalibration([...points.slice(0,5),points[4]],300,300)));
test('scaling preserves normalized geometry', () => { const c=scaleCalibration(cal(),.5);assert.deepEqual(c.rings,[20,40,60]);assert.equal(c.discRadius,3.5); });
const perspectiveSource = [{x:158,y:42},{x:292,y:137},{x:172,y:283},{x:33,y:174}];
const perspectiveDestination = [{x:160,y:32},{x:288,y:160},{x:160,y:288},{x:32,y:160}];
const perspectiveToSource = homographyFromFourPoints(perspectiveDestination, perspectiveSource);
const fromCorrected = (x,y) => projectPoint(perspectiveToSource,{x,y});
const perspectivePoints = [
  ...perspectiveSource,
  fromCorrected(160,160),
  fromCorrected(200,160),
  fromCorrected(240,160),
  fromCorrected(205,205),
  fromCorrected(212,205)
];
test('four-point homography maps all calibration correspondences', () => {
  const h=homographyFromFourPoints(perspectiveSource,perspectiveDestination);
  perspectiveSource.forEach((p,i)=>{const q=projectPoint(h,p);assert.ok(Math.abs(q.x-perspectiveDestination[i].x)<1e-6);assert.ok(Math.abs(q.y-perspectiveDestination[i].y)<1e-6);});
});
test('angled nine-click calibration rectifies rings and disc size', () => {
  const c=makePerspectiveCalibration(perspectivePoints,320,320);
  assert.equal(c.mode,'perspective');
  assert.ok(Math.abs(c.rings[0]-40)<1e-5);
  assert.ok(Math.abs(c.rings[1]-80)<1e-5);
  assert.ok(Math.abs(c.rings[2]-128)<1e-9);
  assert.ok(Math.abs(c.discRadius-7)<1e-5);
  assert.ok(c.perspective.centerResidual<1e-5);
});
test('angled calibration scaling keeps source-to-corrected mapping consistent', () => {
  const c=makePerspectiveCalibration(perspectivePoints,320,320), half=scaleCalibration(c,.5);
  const q=projectPoint(half.perspective.forward,{x:perspectiveSource[1].x/2,y:perspectiveSource[1].y/2});
  assert.ok(Math.abs(q.x-perspectiveDestination[1].x/2)<1e-6);
  assert.ok(Math.abs(q.y-perspectiveDestination[1].y/2)<1e-6);
  assert.ok(Math.abs(half.discRadius-c.discRadius/2)<1e-6);
});
test('perspective warp samples source pixels into corrected coordinates', () => {
  const c=makePerspectiveCalibration(perspectivePoints,320,320);
  const data=new Uint8ClampedArray(320*320*4);
  const target={x:205,y:205}, source=projectPoint(c.perspective.inverse,target);
  const sx=Math.round(source.x), sy=Math.round(source.y), si=(sy*320+sx)*4;
  data[si]=23;data[si+1]=117;data[si+2]=201;data[si+3]=255;
  const warped=warpPerspectiveRGBA(data,320,320,c), ti=(target.y*320+target.x)*4;
  assert.deepEqual(Array.from(warped.slice(ti,ti+4)),[23,117,201,255]);
});
test('bad angled calibration order is rejected instead of silently accepted', () => {
  const bad=[perspectiveSource[0],perspectiveSource[2],perspectiveSource[1],perspectiveSource[3],...perspectivePoints.slice(4)];
  assert.throws(()=>makePerspectiveCalibration(bad,320,320));
});
test('disc entirely in 15 zone gets a suggestion, not a verdict', () => assert.deepEqual(suggestedScore({x:170,y:150,r:7},cal()),{value:15,review:false}));
test('touching inner scoring line goes lower and needs review', () => assert.deepEqual(suggestedScore({x:183,y:150,r:7},cal()),{value:10,review:true}));
test('touching middle scoring line goes lower', () => assert.deepEqual(suggestedScore({x:223,y:150,r:7},cal()),{value:5,review:true}));
test('touching outer line goes out and needs review', () => assert.deepEqual(suggestedScore({x:263,y:150,r:7},cal()),{value:0,review:true}));
test('disc at centre never automatically becomes 20', () => {const s=suggestedScore({x:150,y:150,r:7},cal());assert.equal(s.value,15);assert.equal(s.review,true);});
test('difference scoring awards only margin', () => assert.deepEqual(roundResult(65,40),[25,0]));
test('difference ties award zero', () => assert.deepEqual(roundResult(40,40),[0,0]));
test('match scoring win and tie', () => {assert.deepEqual(roundResult(30,50,'match'),[0,2]);assert.deepEqual(roundResult(20,20,'match'),[1,1]);});
test('invalid scores and scoring modes rejected', () => {for(const n of [-1,NaN,Infinity,1.5])assert.throws(()=>roundResult(n,0));assert.throws(()=>roundResult(1,0,'unknown'));});
test('capture never requests audio and mode remains ideal', () => {const c=captureConstraints('720-60','device');assert.equal(c.audio,false);assert.deepEqual(c.video.frameRate,{ideal:60});assert.equal(c.video.deviceId.exact,'device');});
test('default camera has no forced device ID', () => {const c=captureConstraints('1080-30');assert.equal(c.video.deviceId,undefined);assert.equal(c.video.width.ideal,1920);});
function scene(discs=[]) {const data=new Uint8ClampedArray(300*300*4);for(let y=0;y<300;y++)for(let x=0;x<300;x++){const p=(y*300+x)*4;let color=[220,195,145];for(const d of discs)if(Math.hypot(x-d.x,y-d.y)<=7)color=d.team===0?[35,100,150]:[160,50,40];data.set([...color,255],p);}return data;}
const colors=[[35,100,150],[160,50,40]];
test('empty board yields no disc detections', () => {const b=scene();assert.equal(detectDiscs(b,b,300,300,cal(),colors).length,0);});
test('synthetic separated discs detected with correct teams', () => {const ds=detectDiscs(scene([{x:130,y:170,team:0},{x:190,y:160,team:1}]),scene(),300,300,cal(),colors);assert.equal(ds.length,2);assert.deepEqual(ds.map(d=>d.team).sort(),[0,1]);});
test('detector requires an empty-board reference', () => assert.deepEqual(detectDiscs(scene(),null,300,300,cal(),colors),[]));
test('detector ignores discs outside scoring circle', () => assert.equal(detectDiscs(scene([{x:8,y:8,team:0}]),scene(),300,300,cal(),colors).length,0));
test('sampled RGB colour matches known pixels', () => assert.deepEqual(averageColor(scene([{x:100,y:100,team:0}]),300,300,100,100),colors[0]));
test('tracker preserves unambiguous nearby identity', () => {const t=new Tracker();const a=t.update([{x:10,y:10,r:5,team:0}],1);const b=t.update([{x:12,y:10,r:5,team:0}],1.03);assert.equal(a.discs[0].id,b.discs[0].id);});
test('tracker never carries identity through a long frame gap', () => {const t=new Tracker();const a=t.update([{x:10,y:10,r:5,team:0}],1);const b=t.update([{x:12,y:10,r:5,team:0}],2);assert.notEqual(a.discs[0].id,b.discs[0].id);assert.equal(b.discontinuity,true);assert.equal(b.contacts.length,0);});
test('disappearance does not create a foul or 20', () => {const t=new Tracker();t.update([{x:10,y:10,r:5,team:0}],1);const b=t.update([],1.03);assert.equal(b.discontinuity,true);assert.equal(b.contacts.length,0);assert.equal(b.verdict,undefined);});
test('proximity event always marked review-needed', () => {const t=new Tracker();t.update([{x:10,y:10,r:5,team:0},{x:25,y:10,r:5,team:1}],1);const b=t.update([{x:14,y:10,r:5,team:0},{x:25,y:10,r:5,team:1}],1.03);assert.equal(b.contacts.length,1);assert.equal(b.contacts[0].decision,'review-needed');assert.equal(b.contacts[0].kind,'proximity-only');});
test('ambiguous same-team association does not invent contact order', () => {const t=new Tracker();const a=t.update([{x:10,y:10,r:5,team:0},{x:20,y:10,r:5,team:0}],1);const b=t.update([{x:15,y:10,r:5,team:0}],1.03);assert.ok(a.discs.every(d=>d.id!==b.discs[0].id));assert.equal(b.contacts.length,0);});
test('backward video seek resets identity', () => {const t=new Tracker();const a=t.update([{x:10,y:10,r:5,team:0}],5);const b=t.update([{x:10,y:10,r:5,team:0}],1);assert.notEqual(a.discs[0].id,b.discs[0].id);});
