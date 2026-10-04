/** Serialize large pixel-bearing logs in a separate worker, not on the camera's
 * event loop. One request at a time; no buffer transfers or synchronous fallback
 * can detach live reference pixels or silently stall capture. */
export class JSONExporter {
  constructor({createWorker=()=>new Worker(new URL('./json-export-worker.js?export=1',import.meta.url),{type:'module'}),timeoutMs=30000}={}){
    this.createWorker=createWorker;this.timeoutMs=timeoutMs;this.pending=false;
  }
  export(value){
    if(this.pending)return Promise.reject(Error('An export is already being prepared.'));
    this.pending=true;
    return new Promise((resolve,reject)=>{
      let worker,timer,finished=false;
      const finish=(error,blob)=>{
        if(finished)return;finished=true;
        clearTimeout(timer);worker?.terminate();this.pending=false;
        if(error)reject(error);else resolve(blob);
      };
      try{
        worker=this.createWorker();
        worker.onmessage=({data:m})=>{
          if(m?.type!=='json-export-result')return;
          if(m.error)return finish(Error(m.error));
          if(!(m.blob instanceof Blob)||m.blob.type!=='application/json')return finish(Error('The export worker returned an invalid file.'));
          finish(null,m.blob);
        };
        worker.onerror=e=>{e.preventDefault?.();finish(Error('Could not prepare the export in a background worker. Your match and clips are unchanged.'));};
        worker.onmessageerror=()=>finish(Error('The export could not be decoded. Your match and clips are unchanged.'));
        timer=setTimeout(()=>finish(Error('Export timed out. Your match and clips are unchanged.')),this.timeoutMs);
        // Structured clone takes a snapshot and preserves shared references.
        // Deliberately DO NOT transfer buffers used by the camera/vision worker.
        worker.postMessage({type:'json-export',value});
      }catch(error){finish(error);}
    });
  }
}
