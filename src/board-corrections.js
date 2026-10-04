/** Corrections to a particular observed board, separate from banked 20s and
 * intentional round adjustments. They never silently follow a moving puck. */
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function addBoardCorrection(entries,point,value,kind,epoch){
  if(!['missing','override'].includes(kind)||![0,5,10,15].includes(value)||![0,1].includes(point.team)||![point.x,point.y,point.r].every(Number.isFinite)||point.r<=0)throw Error('Invalid board correction.');
  if(entries.some(e=>e.epoch===epoch&&e.status==='active'&&dist(e,point)<point.r))throw Error('A correction already exists at this position. Clear it before replacing it.');
  return [...entries,{key:globalThis.crypto.randomUUID(),...point,value,kind,epoch,status:'active',source:'player-board-observation'}].slice(-64);
}
export function reconcileBoardCorrections(raw,discs,entries,epoch){
  const score={...raw,visible:[...raw.visible],totals:[...raw.totals],items:raw.items.map(d=>({...d})),reviewReasons:[...raw.reviewReasons]};
  let needsReview=false;
  const updated=entries.map(original=>{
    const e={...original};if(e.status==='reconciled'||e.status==='cleared')return e;
    if(e.epoch!==epoch||e.status==='stale'){e.status='stale';needsReview=true;return e;}
    const candidates=discs.filter(d=>d.team===e.team&&dist(e,d)<=Math.max(e.r,d.r)*1.35);
    if(candidates.length>1){needsReview=true;return e;}
    let delta=0;
    if(e.kind==='missing'){
      if(candidates.length===1){e.status='reconciled';e.resolvedId=candidates[0].id;return e;}
      delta=e.value;
    }else{
      if(candidates.length!==1){e.status='stale';needsReview=true;return e;}
      const item=score.items.find(i=>i.id===candidates[0].id&&i.team===e.team);
      if(!item){needsReview=true;return e;}
      delta=e.value-item.value;item.detectedValue=item.value;item.value=e.value;item.manual=true;
    }
    score.visible[e.team]+=delta;score.totals[e.team]=Math.max(0,score.totals[e.team]+delta);
    return e;
  });
  if(needsReview){score.review=true;score.reviewReasons.push('Board correction expired or no longer maps unambiguously.');}
  return {score,entries:updated,needsReview};
}
export function invalidateBoardCorrections(entries){return entries.map(e=>e.status==='active'?{...e,status:'stale'}:e);}
export function validBoardCorrections(entries){return Array.isArray(entries)&&entries.length<=64&&entries.every(e=>e&&typeof e.key==='string'&&[0,1].includes(e.team)&&[0,5,10,15].includes(e.value)&&['missing','override'].includes(e.kind)&&['active','stale','reconciled','cleared'].includes(e.status)&&[e.x,e.y,e.r].every(Number.isFinite)&&e.r>0);}
