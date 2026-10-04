import test from 'node:test';
import assert from 'node:assert/strict';
import {CapturedFrameQueue} from '../src/frame-queue.js';
const frame=(time,generation=1)=>({type:'frame',generation,time,width:4,height:4,buffer:new Uint8Array(64).fill(Math.round(time*100)).buffer});
function setup(){const sent=[];const q=new CapturedFrameQueue(f=>sent.push(f));q.reset(1);return {q,sent};}
test('worker delay retains real observations rather than skipping them while in flight',()=>{
 const {q,sent}=setup(),packets=[0,.033,.066,.099].map(t=>frame(t));
 packets.forEach(f=>q.push(f));assert.equal(sent.length,1);assert.equal(q.pending.length,3);
 for(let i=0;i<packets.length;i++){assert.equal(sent[i],packets[i]);assert.equal(sent[i].captureGap,undefined);q.acknowledge(sent[i]);}
 assert.deepEqual(sent.map(f=>f.time),[0,.033,.066,.099]);assert.equal(q.busy,false);assert.equal(q.pending.length,0);
});
test('queue overrun is bounded and becomes a real review flag on the next retained pixels',()=>{
 const {q,sent}=setup();for(let i=0;i<100;i++)q.push(frame(i/30));
 assert.equal(q.pending.length,3);assert.equal(sent.length,1);assert.equal(q.dropped,96);
 q.acknowledge(sent[0]);assert.equal(sent[1].time,97/30);assert.equal(sent[1].captureGap,true);
 assert.equal(new Uint8Array(sent[1].buffer)[0],Math.round(97/30*100)%256);
});
test('generation reset drops queued pixels and late/duplicate replies cannot release another frame',()=>{
 const {q,sent}=setup();q.push(frame(1));q.push(frame(2));assert.equal(q.acknowledge({generation:1,time:.5}),false);
 q.reset(2);q.push(frame(0,2));q.push(frame(.033,2));assert.equal(q.acknowledge(sent[0]),false);assert.equal(sent.length,2);
 assert.equal(q.acknowledge(sent[1]),true);assert.equal(sent.length,3);assert.equal(q.acknowledge(sent[1]),false);
});
test('duplicate/backward observations and stale generations cannot fabricate or reorder frames',()=>{
 const {q,sent}=setup();q.push(frame(2));assert.equal(q.push(frame(2)),false);assert.equal(q.push(frame(1)),false);assert.equal(q.push(frame(3,0)),false);assert.equal(sent.length,1);
 q.reset(2);assert.equal(q.push(frame(.1,2)),true);
});
test('frame ownership is transferred only on dispatch; invalid sizes and transport errors fail closed',()=>{
 const {q}=setup();assert.throws(()=>q.push({...frame(1),width:5}));assert.throws(()=>q.push({...frame(1),time:NaN}));
 const f=frame(2);q.push(f);const next=frame(3);q.push(next);assert.equal(next.buffer.byteLength,64);
 const bad=new CapturedFrameQueue(()=>{throw Error('Transport failed');});bad.reset(1);assert.throws(()=>bad.push(frame(0)),/Transport/);assert.equal(bad.busy,false);assert.equal(bad.pending.length,0);
});
test('real worker treats captured queue loss as a gap even when media times are close',async()=>{
 const previous=globalThis.self,results=[];globalThis.self={postMessage:m=>results.push(m)};
 try{
  await import('../src/vision-worker.js?queue-test=1');
  const c={center:{x:10,y:10},rings:[3,6,9],discRadius:1,width:20,height:20};const pixels=new Uint8ClampedArray(1600).fill(120);
  self.onmessage({data:{type:'configure',generation:1,calibration:c,colors:[[20,20,20],[240,240,240]],background:pixels,autoColours:false,tolerance:70}});
  for(const [time,captureGap] of [[0,false],[.033,false],[.066,true]])self.onmessage({data:{type:'frame',generation:1,time,width:20,height:20,buffer:pixels.slice().buffer,captureGap}});
  assert.deepEqual(results.map(r=>r.frameGap),[true,false,true]);assert.deepEqual(results.map(r=>r.time),[0,.033,.066]);
 }finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
});
