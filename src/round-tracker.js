/** A round ends after the configured shooting allocation, not a quiet/empty board.
 * Counts require a new same-team puck at the shooting edge and observed inward
 * travel. Uncertain count/sequence stops automatic completion, never guesses.
 */
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clone=d=>({id:d.id,team:d.team,x:d.x,y:d.y,r:d.r});
const counts=ds=>[0,1].map(t=>ds.filter(d=>d.team===t).length);
function introduced(baseline,current) {
  const used=new Set();
  for(const old of baseline){
    const matches=current.map((d,i)=>({d,i,dist:distance(d,old)})).filter(v=>v.d.team===old.team&&!used.has(v.i)&&v.dist<Math.max(v.d.r,old.r)*2).sort((a,b)=>a.dist-b.dist);
    if(!matches.length)return []; // The supposed settled board changed as well.
    used.add(matches[0].i);
  }
  return current.filter((d,i)=>!used.has(i));
}
export class RoundTracker {
  constructor(shotsPerTeam=12,starter=null){this.reset(shotsPerTeam,starter);}
  reset(shotsPerTeam=this.limit,starter=null) {
    if(!Number.isInteger(shotsPerTeam)||shotsPerTeam<1||shotsPerTeam>12)throw Error('Choose 1–12 shots per team.');
    this.limit=shotsPerTeam;this.used=[0,0];this.starter=starter===0||starter===1?starter:null;this.nextTeam=this.starter;this.ready=false;this.hold='';this.emptySince=null;this.emptyFrames=0;
    this.baseline=[];this.candidate=null;this.active=null;this.lastTime=null;this.lastEvent=null;this.records=[];
  }
  snapshot(){return {shotsPerTeam:this.limit,used:[...this.used],starter:this.starter,nextTeam:this.nextTeam,ready:this.ready,hold:this.hold,records:this.records.map(r=>({...r}))};}
  restore(s) {
    if(!s)return;
    this.reset(s.shotsPerTeam,s.starter);
    if(!Array.isArray(s.used)||s.used.length!==2||s.used.some(v=>!Number.isInteger(v)||v<0||v>this.limit))throw Error('Invalid shots remaining.');
    this.used=[...s.used];this.nextTeam=s.nextTeam===0||s.nextTeam===1?s.nextTeam:null;
    this.records=Array.isArray(s.records)?s.records.slice(-24):[];
    if(this.used.some(Boolean)){this.hold='Camera/count continuity needs review. Verify shots remaining before automatic completion.';this.ready=true;}
  }
  interrupt(reason='Tracking setup changed; verify shots remaining.') {
    if(this.active||this.candidate||this.used.some(Boolean)){this.hold=reason;this.active=null;this.candidate=null;}
  }
  correct(remaining,discs) {
    if(this.active)throw Error('Wait for the shot to settle before correcting the count.');
    if(!Array.isArray(remaining)||remaining.length!==2||remaining.some(v=>!Number.isInteger(v)||v<0||v>this.limit))throw Error('Remaining shots must be between zero and the round allocation.');
    const used=remaining.map(v=>this.limit-v);
    if(Math.abs(used[0]-used[1])>1)throw Error('Alternating teams cannot differ by more than one completed shot.');
    this.used=used;this.nextTeam=used[0]===used[1]?this.starter:used[0]>used[1]?1:0;
    this.ready=true;this.hold='';this.baseline=discs.map(clone);this.candidate=null;
    this.lastTime=null;this.lastEvent=null; // A verified correction starts a fresh camera/count continuity interval.
    this.records.push({source:'player-count-correction',used:[...used]});
    return this.status();
  }
  status() {
    const remaining=this.used.map(v=>this.limit-v);
    return {shotsPerTeam:this.limit,used:[...this.used],remaining,starter:this.starter,nextTeam:this.nextTeam,ready:this.ready,hold:this.hold,
      complete:this.ready&&!this.hold&&remaining.every(v=>v===0)&&!this.active,
      active:!!this.active};
  }
  update(discs,c,time,{event=null,frameGap=false,viewObstructed=false}={}) {
    if(!c||!Number.isFinite(time))return this.status();
    if(this.lastTime!==null&&time<=this.lastTime){this.interrupt('Video timing changed; verify shots remaining.');return this.status();}
    this.lastTime=time;
    if(!this.ready){
      if(!discs.length&&!viewObstructed&&!frameGap){if(this.emptySince===null)this.emptySince=time;this.emptyFrames++;}
      else {this.emptySince=null;this.emptyFrames=0;}
      if(this.emptyFrames>=3&&time-this.emptySince>=.35){this.ready=true;this.baseline=[];}
      return this.status();
    }
    if(this.hold)return this.status();
    if(!this.active&&!viewObstructed&&!frameGap){
      const extra=introduced(this.baseline,discs);
      if(extra.length===1){
        const p=extra[0],rad=distance(p,c.center),launch=rad>=c.rings[2]-p.r*3.5&&rad<=c.rings[2]+p.r;
        if(launch&&(p.team===0||p.team===1)&&(!this.candidate||this.candidate.id!==p.id))this.candidate={...clone(p),radius:rad};
      }
      if(this.candidate&&!discs.some(d=>d.id===this.candidate.id)&&!event)this.candidate=null;
    }
    if(event?.type==='shot-start') {
      if(this.active){this.hold='Overlapping shots: verify shots remaining.';return this.status();}
      this.active={candidate:this.candidate?{...this.candidate}:null,inward:false,uncertain:false,started:time,shot:event.shotNumber};
    }
    if(this.active){
      const a=this.active,p=a.candidate;
      if((frameGap||viewObstructed)&&!a.inward)a.uncertain=true;
      const now=p?discs.find(d=>d.id===p.id&&d.team===p.team):null;
      if(now&&p.radius-distance(now,c.center)>=p.r*1.5&&!a.uncertain)a.inward=true;
    }
    if(event?.type==='shot-end'){
      const key=`${event.shotNumber}:${event.startedAt}`;
      if(this.lastEvent===key)return this.status();
      this.lastEvent=key;
      const a=this.active,p=a?.candidate;
      if(!a||!p||!a.inward||a.uncertain){this.hold='Shooting puck was not observed clearly. Verify shots remaining.';}
      else if(this.nextTeam!==null&&p.team!==this.nextTeam){this.hold='Turn sequence disagrees with the count. Verify shots remaining.';}
      else if(this.used[p.team]>=this.limit){this.hold='Extra shot beyond the round allocation. Verify shots remaining.';}
      else {if(this.starter===null)this.starter=p.team;this.used[p.team]++;this.nextTeam=1-p.team;this.records.push({source:'observed-edge-launch',team:p.team,shot:event.shotNumber,time});}
      this.active=null;this.candidate=null;this.baseline=(event.postDiscs||discs).map(clone);
    }
    return this.status();
  }
}
