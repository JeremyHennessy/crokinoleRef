import { diagnosticJSON } from './diagnostics.js';

/** Original export schema/encoding retained byte-for-byte; only its execution
 * location changes. Return a Blob so the main thread need not re-encode text. */
export function makeJSONExport(value){
  return new Blob([diagnosticJSON(value)],{type:'application/json'});
}
if(typeof self!=='undefined'&&typeof document==='undefined')self.onmessage=({data:m})=>{
  if(m?.type!=='json-export')return;
  try{self.postMessage({type:'json-export-result',blob:makeJSONExport(m.value)});}
  catch(error){self.postMessage({type:'json-export-result',error:error.message||'JSON export failed.'});}
};
