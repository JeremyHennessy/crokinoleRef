/** Demo-only planar circle physics. Launches are inputs; positions are outputs.
 * Fixed steps + swept time-of-impact prevent tunnelling through pegs/discs.
 * Equal puck masses, no spin. Friction/restitution/hole capture are illustrative,
 * not measured parameters of the user's physical board or a live rule engine.
 */
export const DEMO_BOARD = Object.freeze({
  x:480, y:360, radius:280, railRadius:309, holeRadius:17,
  puckRadius:14, pegRadius:5, pegCircle:94,
  pegs:Object.freeze(Array.from({length:8},(_,i)=>Object.freeze({
    x:480+94*Math.cos(i*Math.PI/4),y:360+94*Math.sin(i*Math.PI/4),r:5,id:i
  })))
});
export const PHYSICS_STEP=1/240;
const EPS=1e-8, SKIN=1e-6;
const active=d=>d.status==='board';
const speed=d=>Math.hypot(d.vx,d.vy);
const separation=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)-(a.r+b.r);

/** First *approaching* contact of two circles under linear relative motion. */
export function circleImpactTime(a,b,horizon){
  const x=b.x-a.x,y=b.y-a.y,vx=(b.vx||0)-a.vx,vy=(b.vy||0)-a.vy;
  const radius=a.r+b.r,approach=x*vx+y*vy,v2=vx*vx+vy*vy;
  if(approach>=-EPS||v2<EPS)return null;
  const c=x*x+y*y-radius*radius;
  if(c<=EPS)return 0;
  const discr=approach*approach-v2*c;if(discr<0)return null;
  // Stable quadratic root avoids cancellation on very close contacts.
  const t=c/(-approach+Math.sqrt(discr));
  return t>=-EPS&&t<=horizon+EPS?Math.max(0,Math.min(horizon,t)):null;
}
function boundaryTime(d,radius,horizon){
  const x=d.x-DEMO_BOARD.x,y=d.y-DEMO_BOARD.y,v2=d.vx*d.vx+d.vy*d.vy;
  if(v2<EPS)return null;
  const c=x*x+y*y-radius*radius,b=x*d.vx+y*d.vy,discr=b*b-v2*c;
  if(c>=-EPS&&b>0)return 0;
  if(discr<0)return null;
  const t=(-b+Math.sqrt(discr))/v2;
  return t>=0&&t<=horizon+EPS?t:null;
}
function captureTime(d,horizon,maxSpeed){
  if(speed(d)>maxSpeed)return null;
  const r=DEMO_BOARD.holeRadius-d.r;if(r<=0)return null;
  const target={x:DEMO_BOARD.x,y:DEMO_BOARD.y,r:0};
  if(Math.hypot(d.x-target.x,d.y-target.y)<=r)return 0;
  return circleImpactTime({...d,r},target,horizon);
}
function slow(d,deceleration,dt){
  const v=speed(d),next=Math.max(0,v-deceleration*dt);
  if(v>0){d.vx*=next/v;d.vy*=next/v;}
  if(next<0.1)d.vx=d.vy=0;
}
export class DemoPhysics {
  constructor({friction=145,discRestitution=.9,pegRestitution=.82,captureSpeed=95,pegs=DEMO_BOARD.pegs}={}){
    if(![friction,discRestitution,pegRestitution,captureSpeed].every(Number.isFinite)||friction<0||captureSpeed<0||discRestitution<0||discRestitution>1||pegRestitution<0||pegRestitution>1)throw Error('Invalid demo physics options.');
    this.friction=friction;this.discRestitution=discRestitution;this.pegRestitution=pegRestitution;this.captureSpeed=captureSpeed;this.pegs=pegs;
    this.discs=[];this.events=[];this.time=0;
  }
  add({id,team,x,y,vx=0,vy=0,r=DEMO_BOARD.puckRadius}){
    if(![x,y,vx,vy,r].every(Number.isFinite)||r<=0||r>=DEMO_BOARD.radius||![0,1].includes(team)||this.discs.some(d=>d.id===id))throw Error('Invalid demo puck.');
    const d={id,team,x,y,vx,vy,r,status:'board'};
    if(Math.hypot(x-DEMO_BOARD.x,y-DEMO_BOARD.y)>DEMO_BOARD.radius-r)throw Error('Launch is outside the playing surface.');
    if(this.discs.some(o=>active(o)&&separation(d,o)<-SKIN)||this.pegs.some(p=>separation(d,p)<-SKIN))throw Error('Launch overlaps a disc or peg.');
    this.discs.push(d);return d;
  }
  snapshot(){return this.discs.map(d=>({...d,out:d.status==='gutter',pocketed:d.status==='hole'}));}
  moving(){return this.discs.some(d=>d.status!=='hole'&&speed(d)>0);}
  step(dt=PHYSICS_STEP){
    if(!Number.isFinite(dt)||dt<=0||dt>PHYSICS_STEP+EPS)throw Error('Use the bounded fixed physics step.');
    // Half-step drag brackets the swept collision interval; no frame-rate scaling.
    for(const d of this.discs)if(active(d))slow(d,this.friction,dt/2);
    let remaining=dt,iterations=0;
    while(remaining>EPS){
      if(++iterations>256)throw Error('Demo contact solver did not converge; do not show an invented path.');
      let hit=null;
      const offer=(time,type,a,b=null)=>{if(time!==null&&(!hit||time<hit.time-EPS))hit={time,type,a,b};};
      for(let i=0;i<this.discs.length;i++){
        const a=this.discs[i];if(!active(a))continue;
        offer(captureTime(a,remaining,this.captureSpeed),'hole',a);
        offer(boundaryTime(a,DEMO_BOARD.radius,remaining),'gutter',a);
        for(const p of this.pegs)offer(circleImpactTime(a,p,remaining),'peg',a,p);
        for(let j=i+1;j<this.discs.length;j++){const b=this.discs[j];if(active(b))offer(circleImpactTime(a,b,remaining),'disc',a,b);}
      }
      const elapsed=hit?hit.time:remaining;
      for(const d of this.discs)if(active(d)){d.x+=d.vx*elapsed;d.y+=d.vy*elapsed;}
      this.time+=elapsed;remaining=Math.max(0,remaining-elapsed);
      if(!hit)break;
      const {type,a,b}=hit;
      if(type==='hole'||type==='gutter'){
        a.status=type;a.enteredAt=this.time;
        if(type==='hole'){a.vx=0;a.vy=0;}
        this.events.push({type,time:this.time,id:a.id,team:a.team,x:a.x,y:a.y});
        continue;
      }
      const dx=b.x-a.x,dy=b.y-a.y,norm=Math.hypot(dx,dy);
      if(norm<EPS)throw Error('Coincident demo contact centres.');
      const nx=dx/norm,ny=dy/norm,bvx=type==='disc'?b.vx:0,bvy=type==='disc'?b.vy:0;
      const relative=(bvx-a.vx)*nx+(bvy-a.vy)*ny;
      const before=[a.vx,a.vy,bvx,bvy];
      if(relative<0){
        const e=type==='disc'?this.discRestitution:this.pegRestitution;
        const impulse=-(1+e)*relative/(type==='disc'?2:1);
        a.vx-=impulse*nx;a.vy-=impulse*ny;
        if(type==='disc'){b.vx+=impulse*nx;b.vy+=impulse*ny;}
      }
      // Tiny separating skin is numerical only, not a position animation.
      const push=Math.max(0,a.r+b.r-norm)+SKIN;
      a.x-=nx*push/(type==='disc'?2:1);a.y-=ny*push/(type==='disc'?2:1);
      if(type==='disc'){b.x+=nx*push/2;b.y+=ny*push/2;}
      this.events.push({type,time:this.time,id:a.id,other:b.id,x:a.x+nx*a.r,y:a.y+ny*a.r,normal:[nx,ny],before,after:[a.vx,a.vy,type==='disc'?b.vx:0,type==='disc'?b.vy:0],gap:norm-a.r-b.r});
    }
    for(const d of this.discs){
      if(active(d))slow(d,this.friction,dt/2);
      else if(d.status==='gutter'){
        // A fallen disc lives in the lower gutter plane, never re-enters play.
        // The raised rail catches it; tabletop rendering occludes inward travel.
        slow(d,650,dt/2);d.x+=d.vx*dt;d.y+=d.vy*dt;
        const dx=d.x-DEMO_BOARD.x,dy=d.y-DEMO_BOARD.y,r=Math.hypot(dx,dy),limit=DEMO_BOARD.railRadius-d.r;
        if(r>limit){
          const nx=dx/r,ny=dy/r,vn=d.vx*nx+d.vy*ny;d.x=DEMO_BOARD.x+nx*limit;d.y=DEMO_BOARD.y+ny*limit;
          if(vn>0){d.vx-=1.35*vn*nx;d.vy-=1.35*vn*ny;this.events.push({type:'rail',time:this.time,id:d.id});}
        }
        slow(d,650,dt/2);
      }
    }
  }
}
