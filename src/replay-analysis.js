import { detectDiscEvidence, Tracker } from './core.js';
import { assessVisibility } from './visibility.js';
import { AutoShotAnalyzer } from './auto-referee.js';
import { createWarpMap, warpPixels } from './perspective.js';
import { decodeBytes } from './diagnostics.js';
/** Deterministic offline analysis at decoded presentation timestamps. No UI or
 * score writes. The source video and fixture stay on the local machine. */
export class ReplayAnalysis{
 constructor(configuration){
  const f=configuration.analysisFixture;if(!f)throw Error('Use a diagnostics export or a bundled clip fixture from the updated app.');
  this.c=f.calibration;this.width=f.width;this.height=f.height;this.colors=configuration.colors;this.tolerance=configuration.tolerance||70;
  if(!this.c||!this.colors?.every(Boolean))throw Error('Fixture needs calibration and both team colours.');
  this.background=f.background?.encoding==='base64-rgba'?decodeBytes(f.background.data):new Uint8ClampedArray(f.background);
  if(this.background.length!==f.width*f.height*4)throw Error('Fixture background dimensions do not match.');
  this.map=f.warpMatrix?createWarpMap(f.width,f.height,this.c.width,this.c.height,f.warpMatrix):null;
  if(this.map)this.background=warpPixels(this.background,this.map);
  this.tracker=new Tracker();this.analyzer=new AutoShotAnalyzer(this.c);this.last=null;this.frames=0;
 }
 update(pixels,time){
  if(time===this.last)return null;this.last=time;this.frames++;
  if(pixels.length!==this.width*this.height*4)throw Error('Incorrect replay frame dimensions.');
  const px=this.map?warpPixels(pixels,this.map):pixels,w=this.map?this.c.width:this.width,h=this.map?this.c.height:this.height;
  const e=detectDiscEvidence(px,this.background,w,h,this.c,this.colors,this.tolerance),tr=this.tracker.update(e.discs,time),vis=assessVisibility(px,this.background,w,h,this.c,tr.discs);
  if(e.unresolved.length)vis.viewObstructed=true;
  return {time,...tr,visibility:vis,detectionEvidence:e,auto:this.analyzer.update({...tr,...vis},time)};
 }
}
