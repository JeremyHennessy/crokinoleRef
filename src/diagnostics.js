/** Bounded observations for local debugging. No upload, network, or accuracy claim. */
export function encodeBytes(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
export function decodeBytes(text){const raw=atob(text);return Uint8ClampedArray.from(raw,c=>c.charCodeAt(0));}
export function diagnosticJSON(value){return JSON.stringify(value,(key,v)=>key==='deviceId'||key==='groupId'?undefined:ArrayBuffer.isView(v)?{encoding:'base64-rgba',data:encodeBytes(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))}:v,2);}
export class DiagnosticLog{
 constructor(limit=1800){this.limit=limit;this.reset();}
 reset(){this.frames=[];this.events=[];this.dropped=0;}
 push(m){
  const frame={time:m.time,generation:m.generation,discs:m.discs?.map(({id,team,x,y,r,trackingState})=>({id,team,x,y,r,trackingState})),frameGap:m.frameGap,visibility:m.visibility,detectionEvidence:m.detectionEvidence,state:m.auto?.state};
  this.frames.push(frame);if(this.frames.length>this.limit){this.frames.shift();this.dropped++;}
  if(m.auto?.event){this.events.push(structuredClone(m.auto.event));this.events=this.events.slice(-200);}
 }
 snapshot(){return {frames:this.frames,events:this.events,droppedFrames:this.dropped,frameLimit:this.limit,physicalCameraAccuracyMeasured:false};}
}
export function compareLabels(events,labels,tolerance=.75){
 if(!labels)return {labelled:false,accuracy:null};
 if(!Array.isArray(labels.shots))throw Error('Labels require a shots array.');
 const used=new Set(),results=labels.shots.map(label=>{
  if(!Number.isFinite(label.end)||!Array.isArray(label.visible)||label.visible.length!==2||label.visible.some(v=>!Number.isSafeInteger(v)||v<0)||!['apply','hold'].includes(label.action))throw Error('Each label requires end, visible [A,B], and action apply/hold.');
  const candidates=events.map((e,i)=>({e,i,delta:Math.abs(e.time-label.end)})).filter(x=>!used.has(x.i)&&x.e.type==='shot-end'&&x.delta<=tolerance).sort((a,b)=>a.delta-b.delta);
  const candidate=candidates[0];if(!candidate)return {label,matched:false,correct:false};used.add(candidate.i);
  const e=candidate.e;return {label,matched:true,observed:{end:e.time,visible:e.score.visible,action:e.applyScore?'apply':'hold'},correct:e.score.visible.every((v,i)=>v===label.visible[i])&&(e.applyScore?'apply':'hold')===label.action};
 });
 return {labelled:true,total:results.length,correct:results.filter(r=>r.correct).length,missed:results.filter(r=>!r.matched).length,unlabelledDetectedShots:events.filter((e,i)=>e.type==='shot-end'&&!used.has(i)).length,results};
}
