/** TEST ONLY: observe source/callback/worker/encoder timing without altering
 * timestamps, results, cadence, recorder settings or frame-gap thresholds. */
(() => {
  const logs={source:[],presentation:[],callbacks:[],worker:[],encoders:[],longTasks:[],shots:[],operations:[]};
  const add=(name,value)=>{const a=logs[name];a.push(value);if(a.length>6000)a.shift();};
  const time=()=>performance.now();let lastSource=null,lastPresentation=null;
  const quantile=(values,q)=>{if(!values.length)return null;const v=values.slice().sort((a,b)=>a-b);return v[Math.floor((v.length-1)*q)];};
  const stats=(values)=>({n:values.length,p50:quantile(values,.5),p95:quantile(values,.95),max:quantile(values,1)});
  window.captureProbe={
    sourceDraw(wall){add('source',{wall,interval:lastSource===null?null:wall-lastSource});lastSource=wall;},
    raw:()=>structuredClone(logs),
    checkpoint:()=>({
      sourceIntervalsMs:stats(logs.source.map(v=>v.interval).filter(Number.isFinite)),
      presentationIntervalsMs:stats(logs.presentation.map(v=>v.interval).filter(Number.isFinite)),
      mainCallbackMs:stats(logs.callbacks.map(v=>v.ms)),
      workerRoundTripMs:stats(logs.worker.map(v=>v.ms)),
      sourceGaps:logs.source.filter(v=>v.interval>150).slice(-50),
      presentationGaps:logs.presentation.filter(v=>v.interval>150).slice(-50),
      slowWorkerTrips:logs.worker.filter(v=>v.ms>150).slice(-50),
      operations:logs.operations.slice(-100),longTasks:logs.longTasks.slice(-50),encoders:logs.encoders.slice(-50),shots:logs.shots.slice(-32),
      meaning:'Observed timing, not sensor frame rate. Coincident encoder events do not prove causation.'
    })
  };
  function measure(owner,name,label){
    const original=owner?.[name];if(typeof original!=='function')return;
    owner[name]=function(...args){const wall=time();let result;
      try{return result=original.apply(this,args);}
      finally{const ms=time()-wall;if(ms>4)add('operations',{wall,ms,operation:label,bytes:typeof result==='string'?result.length:undefined});}
    };
  }
  measure(JSON,'stringify','JSON.stringify');
  measure(IDBObjectStore.prototype,'put','IndexedDB.put');
  measure(CanvasRenderingContext2D.prototype,'getImageData','canvas.getImageData');
  measure(CanvasRenderingContext2D.prototype,'drawImage','canvas.drawImage');
  const original=HTMLVideoElement.prototype.requestVideoFrameCallback;
  if(original)HTMLVideoElement.prototype.requestVideoFrameCallback=function(fn){
    return original.call(this,(now,meta)=>{
      const wall=time();add('presentation',{wall,media:meta.mediaTime,interval:lastPresentation===null?null:wall-lastPresentation,frames:meta.presentedFrames});lastPresentation=wall;
      try{return fn(now,meta);}finally{add('callbacks',{wall,ms:time()-wall});}
    });
  };
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker {
    constructor(...args){super(...args);this.pending=new Map();
      this.addEventListener('message',({data:m})=>{
        const key=m.generation+':'+m.time,start=this.pending.get(key);
        const entry=start??(m.type==='colours'?[...this.pending.values()].at(-1):null);
        if(entry){add('worker',{wall:time(),media:entry.media,ms:time()-entry.wall,type:m.type,frameGap:m.frameGap});this.pending.delete(key);if(m.type==='colours')this.pending.clear();}
        if(m.auto?.event)add('shots',structuredClone(m.auto.event));
      });
    }
    postMessage(m,...rest){
      if(m.type==='configure')this.pending.clear();
      if(m.type==='frame')this.pending.set(m.generation+':'+m.time,{wall:time(),media:m.time});
      return super.postMessage(m,...rest);
    }
  };
  if(window.MediaRecorder){
    const start=MediaRecorder.prototype.start,stop=MediaRecorder.prototype.stop;
    MediaRecorder.prototype.start=function(...args){add('encoders',{wall:time(),action:'start',mime:this.mimeType});return start.apply(this,args);};
    MediaRecorder.prototype.stop=function(...args){add('encoders',{wall:time(),action:'stop',mime:this.mimeType});return stop.apply(this,args);};
  }
  if(window.PerformanceObserver&&PerformanceObserver.supportedEntryTypes.includes('longtask')){
    new PerformanceObserver(list=>{for(const e of list.getEntries())add('longTasks',{wall:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});
  }
})();
