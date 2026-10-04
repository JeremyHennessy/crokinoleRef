import { clamp, roundResult } from './core.js';
import { scoreSettledBoard } from './auto-referee.js';
import { DEMO_BOARD as B, DemoPhysics, PHYSICS_STEP, circleImpactTime } from './demo-physics.js?physics=1';

/** Repeatable launch choices feed the demo-only physical world. No destinations,
 * contact partners, final scores, removals, or 20s are assigned by a script. */
export const DEMO_CALIBRATION=Object.freeze({center:Object.freeze({x:B.x,y:B.y}),rings:Object.freeze([94,185,260]),discRadius:B.puckRadius,width:960,height:720});
export const DEMO_INTRO_SECONDS=1.2, DEMO_SHOTS=16;
const LINEUP=.65, SETTLE=.65;
const powers=[35,0,205,260,340,145,250,315,190,340,200,285,345,155,320,210];
const cuts=[0,0,0,15,-12,8,-16,0,12,-8,0,17,-9,0,13,-15];
const copy=ds=>ds.map(d=>({...d}));
const boardDiscs=world=>world.discs.filter(d=>d.status==='board');
function planLaunch(world,role,index){
  const team=(role+world.starter)%2;
  const opponents=boardDiscs(world).filter(d=>d.team!==team).sort((a,b)=>Math.hypot(a.x-B.x,a.y-B.y)-Math.hypot(b.x-B.x,b.y-B.y));
  const targets=opponents.length?opponents:[{x:B.x+(index%3===1?-42:0),y:B.y+(index%3===1?-38:0),id:null}];
  let best=null;
  // Choose a clear starting placement/initial aim, not an animated way-point.
  for(const target of targets)for(const offset of [22.5,-22.5,32,-32,10,-10,0,40,-40]){
    const angle=(role===0?90:270)*Math.PI/180+offset*Math.PI/180;
    const start={x:B.x+250*Math.cos(angle),y:B.y+250*Math.sin(angle),r:B.puckRadius};
    if(boardDiscs(world).some(d=>Math.hypot(start.x-d.x,start.y-d.y)<start.r+d.r+1))continue;
    const dx=target.x-start.x,dy=target.y-start.y,len=Math.hypot(dx,dy),cut=target.id===null?0:cuts[index];
    const aim={x:target.x-dy/len*cut,y:target.y+dx/len*cut},dist=Math.hypot(aim.x-start.x,aim.y-start.y);
    const ux=(aim.x-start.x)/dist,uy=(aim.y-start.y)/dist;
    let first=null;
    for(const p of [...B.pegs.map(p=>({...p,type:'peg'})),...boardDiscs(world).map(d=>({...d,type:'disc'}))]){
      const time=circleImpactTime({...start,vx:ux,vy:uy},p,dist);
      if(time!==null&&(!first||time<first.time))first={...p,time};
    }
    const wanted=target.id!==null?first?.type==='disc'&&first.id===target.id:!first;
    const merit=(wanted?1000:0)-(first?.type==='disc'&&first.team===team?200:0)-dist*.05;
    if(!best||merit>best.merit){
      const stopDistance=target.id===null&&index%3===1?dist:Math.max(0,dist-(target.id===null?0:28));
      const impact=target.id===null?(index%3===1?0:35):powers[index];
      const velocity=Math.sqrt(2*world.friction*stopDistance+impact*impact);
      best={...start,id:index+1,team,vx:ux*velocity,vy:uy*velocity,merit,intent:target.id===null?(index%3===1?'A controlled draw':'Aim through the peg gap'):'An aimed '+(cut?'glancing':'direct')+' hit'};
    }
  }
  if(!best)throw Error('No unobstructed shooting position for this demo.');
  return best;
}
function picture(world){
  return world.snapshot().map(d=>({...d,opacity:d.pocketed?clamp(1-(world.time-d.enteredAt)/.22,0,1):1})).filter(d=>d.opacity>0);
}
function outcome(events,intent){
  const parts=[];
  const n=events.filter(e=>e.type==='disc').length,p=events.filter(e=>e.type==='peg').length;
  if(n)parts.push(`${n} disc contact${n===1?'':'s'}`);
  if(p)parts.push(`${p} peg deflection${p===1?'':'s'}`);
  if(events.some(e=>e.type==='gutter'))parts.push('disc into the gutter');
  if(events.some(e=>e.type==='hole'))parts.push('simulated 20');
  return parts.join(' · ')||intent;
}
export class DemoRound {
  constructor({starter=0,round=1,mode='difference'}={}){
    if(![0,1].includes(starter)||!Number.isSafeInteger(round)||round<1)throw Error('Invalid demo round.');
    roundResult(0,0,mode);this.starter=starter;this.round=round;this.mode=mode;this.stages=[];
    const world=new DemoPhysics();world.starter=starter;
    let timeline=DEMO_INTRO_SECONDS;const used=[0,0];
    for(let i=0;i<DEMO_SHOTS;i++){
      const launch=planLaunch(world,i%2,i),before=picture(world),eventIndex=world.events.length;
      const startTime=timeline,simStart=world.time;
      world.add(launch);
      const lineup=[...before,{...launch,vx:0,vy:0,status:'board'}],frames=[picture(world)];
      let steps=0;
      do {world.step();frames.push(picture(world));if(++steps>8/PHYSICS_STEP)throw Error('Demo did not settle naturally.');} while(world.moving());
      const motionTime=steps*PHYSICS_STEP;timeline+=LINEUP+motionTime+SETTLE;
      const twenties=[0,0];world.discs.forEach(d=>{if(d.status==='hole')twenties[d.team]++;});
      used[launch.team]++;
      const events=world.events.slice(eventIndex).map(e=>({...e,time:e.time-simStart}));
      const score=scoreSettledBoard(boardDiscs(world),DEMO_CALIBRATION,twenties);
      this.stages.push({id:i+1,team:launch.team,startTime,endTime:timeline,motionTime,launch: {...launch},lineup,frames,after:picture(world),events,twenties:[...twenties],used:[...used],score,title:outcome(events,launch.intent),intent:launch.intent});
    }
    this.duration=timeline;
  }
  at(seconds){
    if(!Number.isFinite(seconds))throw Error('Demo time must be finite.');
    const time=clamp(seconds,0,this.duration);
    let completed=this.stages.findIndex(s=>time<s.endTime-1e-8);if(completed<0)completed=16;
    const prev=this.stages[completed-1],current=this.stages[completed];
    const base={time,round:this.round,completed,used:prev?[...prev.used]:[0,0],remaining:prev?prev.used.map(n=>8-n):[8,8],twenties:prev?[...prev.twenties]:[0,0],scores:prev?[...prev.score.totals]:[0,0],boardScores:prev?[...prev.score.visible]:[0,0],history:this.stages.slice(0,completed).map(s=>({shot:s.id,team:s.team,title:s.title,scores:[...s.score.totals],twenty:s.events.some(e=>e.type==='hole')})),source:'physics-demo',phase:'ready',team:current?.team??null,title:current?.intent??'Round finished',contacts:[]};
    if(completed===16)return {...base,phase:'complete',discs:copy(prev.after),awarded:roundResult(...base.scores,this.mode)};
    if(time<DEMO_INTRO_SECONDS)return {...base,discs:[],title:'Clear board · eight shots per team'};
    const local=time-current.startTime;
    if(local<LINEUP)return {...base,discs:copy(current.lineup)};
    const t=local-LINEUP,index=Math.min(current.frames.length-1,Math.floor((t+1e-8)/PHYSICS_STEP));
    const phase=t<current.motionTime?'shooting':'settling';
    // Use solved fixed-step poses, never lerp a chord through a collision.
    const ds=copy(current.frames[index]).filter(d=>!d.pocketed||t<current.motionTime);
    const contacts=current.events.filter(e=>e.time<=t&&t-e.time<.16&&(e.type==='disc'||e.type==='peg')).map(e=>({...e}));
    return {...base,phase,discs:ds,contacts,title:phase==='settling'?current.title:current.intent};
  }
  nextShotTime(seconds){const f=this.at(seconds);return this.stages[f.completed]?.endTime??this.duration;}
}
