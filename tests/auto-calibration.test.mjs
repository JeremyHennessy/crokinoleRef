import test from 'node:test';
import assert from 'node:assert/strict';
import { autoCalibrateFrame, scaleAutoProjectionToSource, otsuThreshold } from '../src/auto-calibration.js';
import { invertHomography, projectPoint } from '../src/perspective.js';

const WIDTH=960, HEIGHT=720;
const BOARD_TO_IMAGE=[1.1,.12,80,.02,.68,120,0,.00045,1];

function syntheticBoard() {
  const imageToBoard=invertHomography(BOARD_TO_IMAGE),data=new Uint8ClampedArray(WIDTH*HEIGHT*4);
  for(let y=0;y<HEIGHT;y++) for(let x=0;x<WIDTH;x++) {
    const p=projectPoint(imageToBoard,{x,y}),r=Math.hypot(p.x-320,p.y-320);
    let color=[24,36,31];
    if(r<=280) color=[188,149,108];
    if(r<=280 && ([94,185,260].some(v=>Math.abs(r-v)<=2.4))) color=[31,27,23];
    if(r<17) color=[22,20,18];
    const i=(y*WIDTH+x)*4;data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=255;
  }
  return data;
}

test('otsu threshold separates simple dark and light populations',()=>{
  const gray=new Uint8Array([20,21,22,23,180,181,182,183]);
  const t=otsuThreshold(gray);
  assert.ok(t>=23&&t<180);
});

test('smart calibration finds board, centre and scoring rings without clicks',()=>{
  const frame=syntheticBoard(),result=autoCalibrateFrame(frame,WIDTH,HEIGHT);
  assert.ok(result.confidence>=.55);
  assert.equal(result.projection.method,'automatic-playing-surface-ellipse-plus-20-hole');
  assert.equal(result.calibration.width,640);
  assert.equal(result.calibration.height,640);
  for(const [actual,expected] of result.calibration.rings.map((v,i)=>[v,[94,185,260][i]])) assert.ok(Math.abs(actual-expected)<=6,`${actual} != ${expected}`);
  const imageCentre=projectPoint(BOARD_TO_IMAGE,{x:320,y:320}),corrected=projectPoint(result.projection.imageToBoard,imageCentre);
  assert.ok(Math.hypot(corrected.x-320,corrected.y-320)<7);
  assert.ok(result.diagnostics.boardConfidence>.5);
  assert.ok(result.diagnostics.holeConfidence>.45);
});

test('smart projection can be lifted from a downscaled analysis frame to source coordinates',()=>{
  const scale=.5,source=syntheticBoard(),smallWidth=WIDTH*scale,smallHeight=HEIGHT*scale;
  const small=new Uint8ClampedArray(smallWidth*smallHeight*4);
  for(let y=0;y<smallHeight;y++)for(let x=0;x<smallWidth;x++){
    const sx=Math.min(WIDTH-1,Math.round(x/scale)),sy=Math.min(HEIGHT-1,Math.round(y/scale)),si=(sy*WIDTH+sx)*4,di=(y*smallWidth+x)*4;
    small.set(source.slice(si,si+4),di);
  }
  const result=autoCalibrateFrame(small,smallWidth,smallHeight),projection=scaleAutoProjectionToSource(result.projection,scale);
  const imageCentre=projectPoint(BOARD_TO_IMAGE,{x:320,y:320}),corrected=projectPoint(projection.imageToBoard,imageCentre);
  assert.ok(Math.hypot(corrected.x-320,corrected.y-320)<10);
  assert.equal(Math.round(projection.imageWidth),WIDTH);
  assert.equal(Math.round(projection.imageHeight),HEIGHT);
});

test('smart calibration refuses frames without a plausible board',()=>{
  const blank=new Uint8ClampedArray(640*480*4);
  for(let i=0;i<blank.length;i+=4){blank[i]=blank[i+1]=blank[i+2]=120;blank[i+3]=255;}
  assert.throws(()=>autoCalibrateFrame(blank,640,480),/playing surface|board/i);
});
