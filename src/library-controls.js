import {ClipStore} from './local-library.js';
import {createZip} from './zip-export.js';
import {diagnosticJSON} from './diagnostics.js';
export function installLibraryControls({state,renderClips,updateControls,payload,download,notify}){
 const $=id=>document.getElementById(id),store=new ClipStore(),pending=new Set();let failure='';
 const textBlob=v=>new Blob([diagnosticJSON(v)],{type:'application/json'});
 function render(){const bytes=state.clips.reduce((n,c)=>n+c.blob.size,0),unsaved=state.clips.filter(c=>c.storageState!=='saved').length;
  $('local-storage-status').textContent=!state.storageReady?'Opening local clip library…':`${state.clips.length} clips · ${(bytes/1048576).toFixed(1)} MB · ${unsaved?`${unsaved} not yet saved`:'saved in this browser'}${failure?' · '+failure:''}. Export a backup; clearing site data or private browsing can remove local files.`;
  $('local-storage-status').dataset.pending=String(pending.size);$('local-storage-status').dataset.ready=String(state.storageReady);
 }
 function track(p){pending.add(p);render();p.finally(()=>{pending.delete(p);render();}).catch(()=>{});return p;}
 function save(c){c.storageState='saving';return track(store.saveClip(c).then(()=>{c.storageState='saved';c.storageError='';renderClips();}).catch(e=>{c.storageState='failed';c.storageError=e.message;failure='Storage failed; export unsaved clips before closing';renderClips();notify('Clip remains available in this tab, but could not be saved locally: '+e.message,true);}));}
 async function restore(){
  try{const saved=await store.clips();for(const c of saved)if(c?.id&&c.blob instanceof Blob&&!state.clips.some(x=>x.id===c.id))state.clips.push({...c,url:URL.createObjectURL(c.blob),storageState:'saved'});state.clips.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
  catch(e){failure='Local storage unavailable; clips will stay in-tab only';notify(e.message,true);}
  finally{state.storageReady=true;renderClips();render();updateControls();}
 }
 async function remove(c){try{await Promise.allSettled([...pending]);await store.remove(c.id);URL.revokeObjectURL(c.url);state.clips=state.clips.filter(x=>x.id!==c.id);renderClips();render();updateControls();}catch(e){notify('Could not delete the saved clip: '+e.message,true);}}
 async function backup(){
  if(state.recording)return notify('Finish the current clip before exporting the match archive.',true);
  $('export-match-clips').disabled=true;
  try{
   await Promise.allSettled([...pending]);const clips=[...state.clips],matches=await store.matches().catch(()=>[]),meta=payload();
   const entries=[{name:'match.json',blob:textBlob(meta)},{name:'saved-matches.json',blob:textBlob(matches)},{name:'README.txt',blob:new Blob(['Local Crokinole Ref archive. match.json links clip IDs to metadata. Original videos are in clips/; offline replay configurations are in fixtures/. No footage was uploaded. Browser timing is not sensor timing.'])}];
   for(const c of clips){const name=c.id.replace(/[^a-zA-Z0-9_-]/g,'_');entries.push({name:`clips/${name}.${c.blob.type.includes('mp4')?'mp4':'webm'}`,blob:c.blob});if(c.configuration)entries.push({name:`fixtures/${name}.json`,blob:textBlob({clip:c.id,configuration:c.configuration,timing:c.timing})});}
   download(await createZip(entries),`crokinole-match-with-clips-${new Date().toISOString().slice(0,10)}.zip`);notify('Match archive prepared with original clip bytes and replay fixtures. Keep the downloaded ZIP as your backup.');
  }catch(e){notify('Archive export failed: '+e.message,true);}finally{$('export-match-clips').disabled=false;}
 }
 $('export-match-clips').onclick=backup;
 $('retry-local-save').onclick=async()=>{failure='';for(const c of state.clips)if(c.storageState!=='saved')await save(c);render();};
 $('keep-local-storage').onclick=async()=>{try{const granted=await navigator.storage?.persist?.();notify(granted?'Browser granted persistent storage. Export a backup as well.':'Browser did not grant persistent storage. Clips are still saved when supported; export a backup.');}catch(e){notify('Persistent storage request failed: '+e.message,true);}};
 restore();
 return {save,remove,render,hasUnsaved:()=>pending.size>0||state.clips.some(c=>c.storageState!=='saved'),saveMatch(data){track(store.saveMatch(data).catch(()=>{}));}};
}
