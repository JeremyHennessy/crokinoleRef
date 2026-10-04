/** Demo-only end-of-shot rules. Consumes the simulator's exact contacts, never
 * camera detections. WCC: https://www.worldcrokinole.com/thegame.html
 * Physical motion finishes before adjudication; the printed outer line is not
 * a wall. Removed discs are not teleported along a fabricated physical path.
 */
const EPS=1e-7;
export function resolveDemoShot({before,after,shooterId,events,center,innerRadius,outerRadius}) {
  const discs=after.map(d=>({...d})),byId=new Map(discs.map(d=>[d.id,d]));
  const shooter=byId.get(shooterId);
  if(!shooter||!Array.isArray(before)||!Array.isArray(events)||!center||![center.x,center.y,innerRadius,outerRadius].every(Number.isFinite)||innerRadius<=0||outerRadius<=innerRadius)throw Error('Invalid demo shot evidence.');
  if(discs.some(d=>d.status==='board'&&Math.hypot(d.vx||0,d.vy||0)>.11))throw Error('Wait for physical settlement before resolving demo rules.');
  const team=shooter.team,opponents=before.filter(d=>d.status==='board'&&d.team!==team);
  const reached=new Set([shooterId]);let opponentContact=false;
  // Group simultaneous events: contact order within an instantaneous chain must
  // not make an own-disc-first combination invalid. No connection travels back
  // in time, and peg contacts do not count as opponent contact.
  const contacts=events.filter(e=>e.type==='disc').slice().sort((a,b)=>a.time-b.time);
  for(let i=0;i<contacts.length;) {
    let j=i+1;while(j<contacts.length&&Math.abs(contacts[j].time-contacts[i].time)<=EPS)j++;
    let changed=true;
    while(changed){
      changed=false;
      for(let k=i;k<j;k++){
        const e=contacts[k],a=byId.get(e.id),b=byId.get(e.other);
        if(!a||!b||(!reached.has(a.id)&&!reached.has(b.id)))continue;
        if(a.team!==b.team&&(a.team===team||b.team===team))opponentContact=true;
        for(const id of [a.id,b.id])if(!reached.has(id)){reached.add(id);changed=true;}
      }
    }
    i=j;
  }
  const involved=discs.filter(d=>reached.has(d.id)&&d.team===team);
  const middle=involved.some(d=>d.status==='hole'||(d.status==='board'&&Math.hypot(d.x-center.x,d.y-center.y)-d.r<=innerRadius+EPS));
  const requirement=opponents.length?'opponent-contact':'play-to-middle';
  const valid=opponents.length?opponentContact:middle;
  const reason=valid?(opponents.length?'Opponent contacted directly or in combination':'An involved disc reached the middle'):(opponents.length?'No opposing disc contacted':'No involved disc finished touching or inside the 15 circle');
  const removals=[];
  const remove=(d,why)=>{
    if(d.status==='removed')return;
    removals.push({id:d.id,team:d.team,reason:why,previousStatus:d.status,x:d.x,y:d.y,r:d.r});
    // Already fallen discs remain visible in the gutter; all others are lifted
    // out between shots. A pocketed disc from this invalid shot earns no 20.
    if(d.status!=='gutter')d.status='removed';
    d.removalReason=why;d.vx=d.vy=0;
  };
  if(!valid)for(const d of involved)remove(d,'invalid-shot');
  for(const d of discs)if(d.status==='board'&&Math.hypot(d.x-center.x,d.y-center.y)+d.r>=outerRadius-EPS)remove(d,'outer-line');
  return {valid,requirement,reason,involved:involved.map(d=>d.id),opponentContact,removals,discs};
}
