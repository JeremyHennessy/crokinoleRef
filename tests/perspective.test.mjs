import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPoint, invertHomography, fitHomography, makePerspectiveCalibration, samplingMatrix, createWarpMap, warpPixels } from '../src/perspective.js';
import { detectDiscs } from '../src/core.js';
import { calibrationSteps } from '../src/calibration-guide.js';
const H=[1.1,.12,80,.02,.68,120,0,.00045,1];
const board=[{x:320,y:320},{x:320,y:40},{x:600,y:320},{x:320,y:600},{x:40,y:320},{x:414,y:320},{x:505,y:320},{x:440,y:420},{x:454,y:420}];
const points=()=>board.map(p=>projectPoint(H,p));
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('non-affine oblique projection round-trips through inverse',()=>{const p={x:520,y:430},q=projectPoint(invertHomography(H),projectPoint(H,p));near(p.x,q.x);near(p.y,q.y);});
test('four reference pairs recover a projective transform',()=>{const from=board.slice(1,5),to=from.map(p=>projectPoint(H,p)),h=fitHomography(from,to);const p={x:371,y:211},a=projectPoint(h,p),b=projectPoint(H,p);near(a.x,b.x);near(a.y,b.y);});
test('oblique calibration restores known board radii and puck size',()=>{const {calibration:c,projection:p}=makePerspectiveCalibration(points(),960,720);near(c.rings[0],94);near(c.rings[1],185);near(c.rings[2],280);near(c.discRadius,14);near(p.centerCheckErrorPx,0);});
test('centre opening is checked independently of four fitted marks',()=>{const ps=points();ps[0].x+=45;assert.throws(()=>makePerspectiveCalibration(ps,960,720),/centre hole/);});
test('crossed mark order rejected',()=>{const ps=points();[ps[2],ps[3]]=[ps[3],ps[2]];assert.throws(()=>makePerspectiveCalibration(ps,960,720),/order/);});
test('duplicate mark rejected',()=>{const ps=points();ps[2]=ps[1];assert.throws(()=>makePerspectiveCalibration(ps,960,720));});
test('missing point rejected without applying partial geometry',()=>assert.throws(()=>makePerspectiveCalibration(points().slice(0,8),960,720)));
test('nonfinite coordinates rejected',()=>{const ps=points();ps[4].x=Infinity;assert.throws(()=>makePerspectiveCalibration(ps,960,720));});
test('wrong ring rejected',()=>{const ps=points();ps[6]=ps[5];assert.throws(()=>makePerspectiveCalibration(ps,960,720),/rings/);});
test('zero puck radius rejected',()=>{const ps=points();ps[8]=ps[7];assert.throws(()=>makePerspectiveCalibration(ps,960,720),/Disc size/);});
test('reference outside frame rejected',()=>assert.throws(()=>makePerspectiveCalibration(points(),500,400),/inside/));
test('singular transform rejected',()=>assert.throws(()=>fitHomography([{x:0,y:0},{x:1,y:1},{x:2,y:2},{x:3,y:3}],board.slice(1,5))));
test('camera scaling and preview sampling share the same coordinates',()=>{const {projection:p}=makePerspectiveCalibration(points(),960,720);const m=samplingMatrix(p,.5,320);const a=projectPoint(m,{x:200,y:180}),b=projectPoint(p.boardToImage,{x:400,y:360});near(a.x,b.x*.5);near(a.y,b.y*.5);});
test('bilinear sampling has expected independent pixel values',()=>{const data=new Uint8ClampedArray([0,0,0,255,100,0,0,255,0,100,0,255,100,100,0,255]);const m=createWarpMap(2,2,2,2,[.25,0,.25,0,.25,.25,0,0,1]);const p=warpPixels(data,m);assert.deepEqual([...p.slice(0,4)],[25,25,0,255]);});
test('invalid sample area is transparent rather than invented pixels',()=>{const m=createWarpMap(3,3,2,2,[1,0,100,0,1,100,0,0,1]);assert.ok(warpPixels(new Uint8ClampedArray(36).fill(255),m).every(v=>v===0));});
test('frame size change rejected instead of using stale mapping',()=>{const m=createWarpMap(3,3,2,2,[1,0,0,0,1,0,0,0,1]);assert.throws(()=>warpPixels(new Uint8ClampedArray(16),m),/dimensions changed/);});
test('scratch buffer reused without changing pixel results',()=>{const m=createWarpMap(3,3,2,2,[1,0,0,0,1,0,0,0,1]);const data=new Uint8ClampedArray(36).fill(80),scratch=new Uint8ClampedArray(16);assert.equal(warpPixels(data,m,scratch),scratch);assert.deepEqual(scratch,warpPixels(data,m));});
test('instruction sets cover every click and warn about physical marks',()=>{assert.equal(calibrationSteps('overhead').length,6);const steps=calibrationSteps('angled');assert.equal(steps.length,9);assert.match(steps[2].text,/not the oval/);assert.match(steps[1].text,/intersection/);});
function cameraFrame(discs=[]) {
  const inv=invertHomography(H),data=new Uint8ClampedArray(960*720*4);
  for(let y=0;y<720;y++) for(let x=0;x<960;x++) {
    const p=projectPoint(inv,{x,y});let col=Math.hypot(p.x-320,p.y-320)<280?[220,195,145]:[20,45,40];
    for(const d of discs) if(Math.hypot(p.x-d.x,p.y-d.y)<14) col=d.color;
    data.set([...col,255],(y*960+x)*4);
  }
  return data;
}
test('oblique frame and matching background rectify into two detectable pucks',()=>{
  const {calibration,projection}=makePerspectiveCalibration(points(),960,720),map=createWarpMap(960,720,640,640,samplingMatrix(projection));
  const colors=[[35,100,150],[160,50,40]], discs=[{x:260,y:380,color:colors[0]},{x:440,y:420,color:colors[1]}];
  const background=warpPixels(cameraFrame(),map),current=warpPixels(cameraFrame(discs),map),found=detectDiscs(current,background,640,640,calibration,colors);
  assert.equal(found.length,2);for(const [i,d] of discs.entries()){const actual=found.find(v=>v.team===i);near(actual.x,d.x,1);near(actual.y,d.y,1);}
});
