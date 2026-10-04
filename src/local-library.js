/** Origin-local IndexedDB. A write is 'saved' only after transaction completion.
 * Quota/private-mode failures leave in-tab evidence intact and visible. */
export class ClipStore {
  constructor(factory){
    try{this.factory=factory===undefined?globalThis.indexedDB:factory;}catch{this.factory=null;}
    this.database=null;this.opening=null;
  }
  open(){
    if(this.database)return Promise.resolve(this.database);if(this.opening)return this.opening;
    this.opening=new Promise((resolve,reject)=>{
      if(!this.factory){reject(Error('Local clip storage is unavailable in this browser.'));return;}
      let request,finished=false;const fail=error=>{if(finished)return;finished=true;clearTimeout(timer);reject(error);};
      const timer=setTimeout(()=>fail(Error('Local clip storage is blocked. Close another Crokinole Ref tab and retry.')),4000);
      try{request=this.factory.open('crokinole-ref-library',1);}catch(error){fail(error);return;}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('clips'))db.createObjectStore('clips',{keyPath:'id'});if(!db.objectStoreNames.contains('matches'))db.createObjectStore('matches',{keyPath:'id'});};
      request.onerror=()=>fail(request.error||Error('Cannot open local clip storage.'));
      request.onblocked=()=>fail(Error('Another tab is blocking local clip storage.'));
      request.onsuccess=()=>{if(finished){request.result.close();return;}finished=true;clearTimeout(timer);this.database=request.result;this.database.onversionchange=()=>{this.database?.close();this.database=null;this.opening=null;};resolve(this.database);};
    }).catch(e=>{this.opening=null;throw e;});return this.opening;
  }
  async run(store,mode,operation){
    const db=await this.open();return new Promise((resolve,reject)=>{
      let request,tx;try{tx=db.transaction(store,mode);request=operation(tx.objectStore(store));}catch(e){reject(e);return;}
      tx.oncomplete=()=>resolve(request?.result);tx.onabort=()=>reject(tx.error||request?.error||Error('Local storage transaction aborted.'));
      tx.onerror=()=>{}; // onabort is the authoritative write failure.
    });
  }
  async saveClip(clip){
    const {url,storageState,storageError,...data}=clip;
    if(typeof data.id!=='string'||!(data.blob instanceof Blob)||!data.blob.size)throw Error('Invalid saved clip.');
    await this.run('clips','readwrite',s=>s.put(data));
  }
  async remove(id){await this.run('clips','readwrite',s=>s.delete(id));}
  async clips(){return (await this.run('clips','readonly',s=>s.getAll())).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
  async saveMatch(data){if(!data?.id)throw Error('Missing match ID.');await this.run('matches','readwrite',s=>s.put(data));}
  async matches(){return this.run('matches','readonly',s=>s.getAll());}
  close(){this.database?.close();this.database=null;this.opening=null;}
}
