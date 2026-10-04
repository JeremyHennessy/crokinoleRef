import test from 'node:test';
import assert from 'node:assert/strict';
import {JSONExporter} from '../src/json-export.js';
import {makeJSONExport} from '../src/json-export-worker.js';
import {diagnosticJSON,decodeBytes} from '../src/diagnostics.js';

class FakeWorker {
  constructor(){this.stopped=0;this.sent=[];}
  postMessage(...args){this.sent.push(args);}
  terminate(){this.stopped++;}
  reply(m){this.onmessage({data:m});}
}
const good=()=>({type:'json-export-result',blob:makeJSONExport({scores:[20,10]})});

test('worker export preserves original JSON bytes, typed view offsets and identity redaction',async()=>{
  const buffer=new Uint8ClampedArray([33,1,2,255,44]),view=buffer.subarray(1,4);
  const payload={background:view,clips:[{background:view},{background:view}],nested:{deviceId:'private',groupId:'private',scores:[5,20]},time:1.25};
  const file=makeJSONExport(structuredClone(payload)),text=await file.text();
  assert.equal(text,diagnosticJSON(payload));assert.equal(file.type,'application/json');
  const parsed=JSON.parse(text);assert.deepEqual([...decodeBytes(parsed.background.data)],[1,2,255]);
  assert.equal(parsed.nested.deviceId,undefined);assert.equal(buffer.byteLength,5);
});
test('export worker is lazy, one request is bounded, and live buffers are never transferred',async()=>{
  const worker=new FakeWorker();let created=0;
  const x=new JSONExporter({createWorker:()=>{created++;return worker;}});
  assert.equal(created,0);
  const pixels=new Uint8ClampedArray([0,255]),p=x.export({pixels});
  assert.equal(created,1);assert.equal(x.pending,true);assert.equal(worker.sent[0].length,1);
  await assert.rejects(x.export({}),/already/);assert.equal(created,1);
  worker.reply(good());assert.equal(await (await p).text(),diagnosticJSON({scores:[20,10]}));
  assert.equal(worker.stopped,1);assert.equal(x.pending,false);assert.equal(pixels.byteLength,2);
});
test('worker rejection clears pending state and retains live data',async()=>{
  const worker=new FakeWorker(),x=new JSONExporter({createWorker:()=>worker});
  const p=x.export({});worker.reply({type:'json-export-result',error:'Encoding failed'});
  await assert.rejects(p,/Encoding failed/);assert.equal(x.pending,false);assert.equal(worker.stopped,1);
});
test('unavailable worker fails without falling back to blocking serialization',async()=>{
  const x=new JSONExporter({createWorker:()=>{throw Error('Blocked');}});
  await assert.rejects(x.export({}),/Blocked/);assert.equal(x.pending,false);
});
test('message cloning failures and malformed files terminate the worker',async()=>{
  const worker=new FakeWorker();worker.postMessage=()=>{throw Error('Clone failed');};
  const x=new JSONExporter({createWorker:()=>worker});await assert.rejects(x.export({}),/Clone failed/);assert.equal(worker.stopped,1);
  const w=new FakeWorker(),y=new JSONExporter({createWorker:()=>w});const p=y.export({});
  w.reply({type:'json-export-result',blob:'not a blob'});await assert.rejects(p,/invalid file/);assert.equal(y.pending,false);
});
test('timed-out or late worker messages cannot complete twice',async()=>{
  const w=new FakeWorker(),x=new JSONExporter({createWorker:()=>w,timeoutMs:10});
  await assert.rejects(x.export({}),/timed out/);w.reply(good());assert.equal(w.stopped,1);assert.equal(x.pending,false);
});
test('native worker errors and message-decoding errors are reported without crashing capture',async()=>{
  for(const name of ['onerror','onmessageerror']){
    const w=new FakeWorker(),x=new JSONExporter({createWorker:()=>w}),p=x.export({});
    w[name]({preventDefault(){}});await assert.rejects(p,/export|Export/);assert.equal(x.pending,false);assert.equal(w.stopped,1);
  }
});
