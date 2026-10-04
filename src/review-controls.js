import { addBoardCorrection, reconcileBoardCorrections } from './board-corrections.js';
export function installReviewControls({state,board,getCalibration,toAnalysis,snapshotScore,saveMatch,renderScore,notify}){
 const $=id=>document.getElementById(id);let placing=false;
 const idle=()=>state.calibration&&!state.calibrationPoints&&state.sampleTeam===null&&state.auto.activeShotNumber===null&&!state.recording;
 function render(){const entries=state.auto.corrections||[];const active=entries.filter(e=>e.status==='active').length,stale=entries.filter(e=>e.status==='stale').length;
  $('board-correction-status').textContent=`${active} current board correction(s) · ${stale} need renewed review. Board corrections expire on the next shot; round adjustments do not.`;
  for(let t=0;t<2;t++){if(document.activeElement!==$('adjustment-'+t))$('adjustment-'+t).value=state.auto.adjustments[t];if(document.activeElement!==$('confirmed20-'+t))$('confirmed20-'+t).value=state.auto.twenties[t];}
 }
 function reconcile(score,ds){const out=reconcileBoardCorrections(score,ds,state.auto.corrections||[],state.generation);state.auto.corrections=out.entries;if(out.needsReview)state.auto.reviewHold=true;return out.score;}
 $('place-correction').onclick=()=>{if(!idle())return notify('Wait until the board is still and tracking is configured.',true);placing=true;board.focus();notify('Click the disc position in the camera image. This is a player correction, not a new detection.');};
 board.addEventListener('click',e=>{
  if(!placing||!idle())return;
  const b=board.getBoundingClientRect(),p=toAnalysis({x:(e.clientX-b.left)*board.width/b.width,y:(e.clientY-b.top)*board.height/b.height});
  const c=getCalibration(),kind=$('correction-kind').value,team=Number($('correction-team').value),value=Number($('correction-value').value);
  const matches=state.discs.filter(d=>Math.hypot(d.x-p.x,d.y-p.y)<d.r*1.4);
  try{
   if(kind==='override'&&matches.length!==1)throw Error('Choose one clearly detected disc to override, or select Missing disc.');
   if(kind==='missing'&&matches.length)throw Error('A disc is already detected there. Use Correct detected disc instead.');
   const point=kind==='override'?matches[0]:{...p,r:c.discRadius,team};
   if(Math.hypot(point.x-c.center.x,point.y-c.center.y)>c.rings[2])throw Error('Choose a position on the scoring surface.');
   snapshotScore();state.auto.corrections=addBoardCorrection(state.auto.corrections||[],point,value,kind,state.generation);
   state.auto.reviewHold=true;placing=false;$('apply-reviewed-score').disabled=false;saveMatch();render();notify('Board correction noted. Inspect all discs, then use the reviewed board score.');
  }catch(error){notify(error.message,true);}
 });
 $('clear-board-corrections').onclick=()=>{if(!idle())return;if(!confirm('Clear the current board corrections? Recheck the score before resuming.'))return;snapshotScore();state.auto.corrections=[];state.auto.reviewHold=true;saveMatch();render();};
 $('set-adjustments').onclick=()=>{
  if(state.auto.activeShotNumber!==null||state.recording)return notify('Wait for the current shot.',true);
  const values=[0,1].map(t=>Number($('adjustment-'+t).value));
  if(values.some(v=>!Number.isSafeInteger(v)||Math.abs(v)>10000))return notify('Use whole-point adjustments from −10000 to 10000.',true);
  const twenties=[0,1].map(t=>Number($('confirmed20-'+t).value));if(twenties.some(v=>!Number.isSafeInteger(v)||v<0||v>1000))return notify('Use non-negative whole confirmed-20 counts.',true);
  snapshotScore();state.scores=state.scores.map((v,t)=>Math.max(0,v+values[t]-state.auto.adjustments[t]+20*(twenties[t]-state.auto.twenties[t])));state.auto.twenties=twenties;state.auto.adjustments=values;saveMatch();renderScore();render();
 };
 return {render,reconcile,cancel(){placing=false;}};
}
