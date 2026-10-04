import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const fn=source.match(/function processFrame\(time, now\) \{[\s\S]*?\n\}/)[0];
function capture(time, busy=false) {
  const state={lastTime:1,time:1,observed:7,inflight:busy,calibrationPoints:null,sampleTeam:null,mode:'camera',gaps:[],statStart:0,generation:3};
  const sent=[];let resets=0;
  const context={frameQueue:{push(m){state.inflight=true;sent.push(m);}},state,readyToTrack:()=>true,document:{hidden:false},drawOverlay:()=>{},video:{},raw:{width:4,height:4},rawCtx:{drawImage(){}},ctx:{drawImage(){}},small:{width:4,height:4},smallCtx:{drawImage(){},getImageData(){return {data:new Uint8ClampedArray(64)};}},worker:{postMessage(m){sent.push(m);}},resetStats(){state.lastTime=null;resets++;},configureWorker(){state.generation++;},time};
  vm.runInNewContext(fn+';processFrame(time, 100)',context);
  return {state,sent,resets};
}
test('duplicate presentation timestamp is not analysed twice or counted as a new frame',()=>{
  const {state,sent}=capture(1);
  assert.equal(sent.length,0);
  assert.equal(state.observed,7);
  assert.equal(state.inflight,false);
});
test('next distinct presentation frame is sent with its original timestamp',()=>{
  const {state,sent}=capture(1+1/30);
  assert.equal(sent.length,1);assert.equal(sent[0].time,1+1/30);assert.equal(state.observed,8);
});
test('a real presentation gap is retained, not smoothed or hidden',()=>{
  const {state,sent}=capture(1.4);
  assert.equal(sent.length,1);assert.equal(sent[0].time,1.4);assert.ok(state.gaps[0]>.39);
});
test('backward video seek still resets the analysis generation',()=>{
  const {sent,resets}=capture(.5);
  assert.equal(resets,1);assert.equal(sent.length,1);assert.equal(sent[0].time,.5);assert.equal(sent[0].generation,4);
});

test('a worker still busy does not prevent capturing the next actual source image',()=>{
 const {sent}=capture(1+1/30,true);assert.equal(sent.length,1);assert.equal(sent[0].time,1+1/30);
});
