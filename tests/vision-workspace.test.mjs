import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDetectionWorkspace,detectDiscEvidence} from '../src/core.js';
import {createVisibilityWorkspace,assessVisibility} from '../src/visibility.js';
import {visionCase} from './fixtures/vision-cases.mjs';
import {DiagnosticLog} from '../src/diagnostics.js';

test('reused vision scratch preserves the exact prior detector and visibility evidence for 72 raster scenes',()=>{
 const results=[];
 for(const [w,h] of [[161,123],[320,240],[640,480]]){
  const dw=createDetectionWorkspace(w,h),vw=createVisibilityWorkspace(w,h),mask=dw.mask,stack=dw.stack,residual=vw.residual;
  for(let i=0;i<24;i++){
   const x=visionCase(i,w,h),d=detectDiscEvidence(x.data,x.background,w,h,x.c,x.colors,x.tolerance,dw);
   const v=assessVisibility(x.data,x.background,w,h,x.c,d.discs,vw);results.push([d,v]);
   assert.equal(dw.mask,mask);assert.equal(dw.stack,stack);assert.equal(vw.residual,residual);
  }
 }
 // Captured from the unchanged fe8f121 detector/visibility modules, before edits.
 assert.equal(createHash('sha256').update(JSON.stringify(results)).digest('hex'),'f7e5d46860692b02767fbfa4049eeecf547912d206beac6618f81b6abb632b6e');
});
test('scratch never carries unknown foreground or detections from an earlier frame',()=>{
 const a=visionCase(4),empty=visionCase(0),dw=createDetectionWorkspace(a.width,a.height),vw=createVisibilityWorkspace(a.width,a.height);
 const d=detectDiscEvidence(a.data,a.background,a.width,a.height,a.c,a.colors,a.tolerance,dw);
 assert.equal(assessVisibility(a.data,a.background,a.width,a.height,a.c,d.discs,vw).viewObstructed,true);
 const args=[empty.data,empty.background,empty.width,empty.height,empty.c,empty.colors,empty.tolerance];
 assert.deepEqual(detectDiscEvidence(...args,dw),{discs:[],unresolved:[],clusterCandidates:[]});
 const v=assessVisibility(empty.data,empty.background,empty.width,empty.height,empty.c,[],vw);
 assert.equal(v.viewObstructed,false);assert.equal(v.unexplainedPixels,0);assert.deepEqual(v.unresolvedRegions,[]);
});
test('resized frames require matching scratch and missing setup continues to fail closed',()=>{
 for(const bad of [[0,480],[640,0],[NaN,1],[1.5,20],[1e9,100]]){assert.throws(()=>createDetectionWorkspace(...bad));assert.throws(()=>createVisibilityWorkspace(...bad));}
 const x=visionCase(3),dw=createDetectionWorkspace(160,120),vw=createVisibilityWorkspace(160,120);
 assert.throws(()=>detectDiscEvidence(x.data,x.background,x.width,x.height,x.c,x.colors,70,dw),/does not match/);
 assert.throws(()=>assessVisibility(x.data,x.background,x.width,x.height,x.c,[],vw),/does not match/);
 assert.equal(assessVisibility(x.data,null,x.width,x.height,x.c,[],vw).viewObstructed,true);
});
test('diagnostic processing spans remain separate from the original media time and gap',()=>{
 const log=new DiagnosticLog(1),processing={totalMs:5,detectMs:3,visibilityMs:1};
 log.push({time:12.5,frameGap:true,processing,discs:[],auto:{state:'settled'}});
 const f=log.snapshot().frames[0];assert.equal(f.time,12.5);assert.equal(f.frameGap,true);assert.deepEqual(f.processing,processing);
 log.push({time:13,discs:[]});assert.equal(log.snapshot().frames.length,1);assert.equal(log.snapshot().droppedFrames,1);
});
test('real worker retains media time and gap gates while reporting its own CPU spans',async()=>{
 const previous=globalThis.self,results=[];
 globalThis.self={postMessage:m=>results.push(m)};
 try{
  await import('../src/vision-worker.js?workspace-regression=1');
  const x=visionCase(1);
  self.onmessage({data:{type:'configure',generation:42,calibration:x.c,colors:x.colors,tolerance:70,background:x.background,autoColours:false}});
  for(const time of [2,2.033,2.4])self.onmessage({data:{type:'frame',generation:42,time,width:x.width,height:x.height,buffer:x.data.slice().buffer}});
  assert.equal(results.length,3);assert.ok(results.every(r=>r.type==='result'));
  assert.deepEqual(results.map(r=>r.time),[2,2.033,2.4]);assert.deepEqual(results.map(r=>r.frameGap),[true,false,true]);
  for(const r of results){assert.ok(Object.values(r.processing).every(ms=>Number.isFinite(ms)&&ms>=0));assert.ok(r.processing.totalMs>=r.processing.detectMs);}
  self.onmessage({data:{type:'frame',generation:41,time:3,width:x.width,height:x.height,buffer:x.data.slice().buffer}});assert.equal(results.length,3);
 }finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
});
