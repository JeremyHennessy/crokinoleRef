/** Time-aware association. Predictions label identities; only actual observed
 * discs are returned for scoring. Missing tracks never become phantom points. */
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class MotionTracker {
  constructor(){this.reset();}
  reset(){this.previous=[];this.nextId=1;this.time=null;this.memory=new Map();}
  update(detections,time){
    const dt=this.time===null?null:time-this.time,gap=dt===null||dt<=0||dt>.15;
    if(gap)this.memory.clear();
    const old=gap?[]:this.previous,seen=new Set(old.map(p=>p.id));
    const candidates=old.map(p=>({...p,lastSeen:this.time}));
    for(const [id,p] of this.memory)if(!seen.has(id)&&time-p.lastSeen<=.10)candidates.push(p);
    const proposals=[];
    detections.forEach((d,i)=>candidates.forEach(p=>{
      if(d.team!==p.team)return;
      const elapsed=time-p.lastSeen,r=Math.max(d.r,p.r),dist=distance(d,p);
      const predicted={x:p.x+(p.vx||0)*elapsed,y:p.y+(p.vy||0)*elapsed};
      const error=distance(d,predicted),hasVelocity=!!p.velocitySamples;
      // Broad travel must have a measured velocity. Initial association stays local.
      const gate=r*Math.min(7,Math.max(3,2+elapsed*90));
      if(dist>gate&&(!hasVelocity||error>r*2.2))return;
      if(!seen.has(p.id)&&(error>r*1.5||dist>r*5))return;
      const cost=hasVelocity?Math.min(error,dist+r*.5):dist;
      proposals.push({i,p,dist,cost,error});
    }));
    proposals.sort((a,b)=>a.cost-b.cost);
    const assigned=new Map(),used=new Set(),ambiguous=new Set();
    for(const pair of proposals){
      if(assigned.has(pair.i)||used.has(pair.p.id))continue;
      const competing=proposals.some(q=>q!==pair&&(q.i===pair.i||q.p.id===pair.p.id)&&Math.abs(q.cost-pair.cost)<detections[pair.i].r);
      if(competing){ambiguous.add(pair.i);continue;}
      assigned.set(pair.i,pair.p);used.add(pair.p.id);
    }
    const current=detections.map((d,i)=>{
      const p=assigned.get(i),elapsed=p?time-p.lastSeen:0,reacquired=!!p&&!seen.has(p.id);
      const vx=p&&elapsed>0?(d.x-p.x)/elapsed:0,vy=p&&elapsed>0?(d.y-p.y)/elapsed:0;
      return {...d,id:p?.id??this.nextId++,vx,vy,velocitySamples:p?(p.velocitySamples||0)+1:0,
        trackingState:reacquired?'reacquired':p?'observed':ambiguous.has(i)?'identity-unresolved':'new',lastSeen:time};
    });
    const ids=new Set(current.map(d=>d.id)),contacts=[];
    for(let i=0;i<current.length;i++)for(let j=i+1;j<current.length;j++){
      const a=current[i],b=current[j],pa=old.find(p=>p.id===a.id),pb=old.find(p=>p.id===b.id);
      if(!pa||!pb||a.trackingState==='reacquired'||b.trackingState==='reacquired')continue;
      const threshold=a.r+b.r+2;
      if(distance(a,b)<=threshold&&distance(pa,pb)>threshold&&Math.max(distance(a,pa),distance(b,pb))>a.r*.12)
        contacts.push({ids:[a.id,b.id],teams:[a.team,b.team],from:this.time,to:time,kind:'proximity-only',decision:'review-needed'});
    }
    for(const p of old)if(!ids.has(p.id))this.memory.set(p.id,{...p,lastSeen:this.time});
    for(const [id,p] of this.memory)if(ids.has(id)||time-p.lastSeen>.10)this.memory.delete(id);
    const unresolvedTracks=[...this.memory.values()].map(p=>({id:p.id,team:p.team,x:p.x,y:p.y,r:p.r,state:'temporarily-unobserved',lastSeen:p.lastSeen}));
    const discontinuity=gap||old.some(p=>!ids.has(p.id))||current.some(d=>d.trackingState==='reacquired'||d.trackingState==='identity-unresolved');
    this.previous=current;this.time=time;
    return {discs:current,contacts,discontinuity,frameGap:gap,unresolvedTracks};
  }
}
