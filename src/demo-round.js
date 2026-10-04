import { clamp, roundResult } from './core.js';
import { scoreSettledBoard } from './auto-referee.js';

/** An illustrative, deterministic exhibition, NOT a physics or legal-shot model.
 * The script supplies known outcomes, including 20s. It never trains or certifies
 * the camera detector. Coordinates match the existing 960 x 720 demo board. */
export const DEMO_CALIBRATION = Object.freeze({
  center: Object.freeze({x:480,y:360}), rings:Object.freeze([94,185,260]),
  discRadius:14, width:960, height:720
});
export const DEMO_INTRO_SECONDS=1.2, DEMO_SHOT_SECONDS=4.2, DEMO_SHOTS=16;
const script=[
  {title:'Opening 20',to:[0,0],twenty:true},
  {title:'Draw into the 15',to:[-40,-30]},
  {title:'Bump the opposing disc out of the 15',to:[-40,-26],hit:2,move:[-115,-100]},
  {title:'Return bump into the 10',to:[-40,-30],hit:3,move:[60,110]},
  {title:'Takeout into the gutter',to:[-115,-100],hit:2,move:[-205,-215],out:true},
  {title:'Push an opposing disc into the 5',to:[60,110],hit:3,move:[140,155]},
  {title:'Take the inside position',to:[-40,-30],hit:4,move:[30,-130]},
  {title:'Illustrative carom and banked 20',to:[0,0],hit:7,move:[-115,70],twenty:true},
  {title:'Clear the right-hand disc',to:[60,110],hit:6,move:[100,285],out:true},
  {title:'Answer with a left-side takeout',to:[-115,-100],hit:5,move:[-270,-120],out:true},
  {title:'Bump an opponent toward the outer ring',to:[-115,-100],hit:10,move:[-190,-130]},
  {title:'Move an opposing disc from 10 to 5',to:[60,110],hit:9,move:[180,120]},
  {title:'Remove the far-side opposing disc',to:[30,-130],hit:4,move:[65,-295],out:true},
  {title:'A costly bump gives the opponent 15',to:[-145,-130],hit:11,move:[-55,-40]},
  {title:'Last blue shot: reduce the opposing score',to:[50,140],hit:12,move:[70,210]},
  {title:'Last red shot: an illustrative carom 20',to:[0,0],hit:13,move:[110,-160],twenty:true}
];
const point=([x,y])=>({x:480+x,y:360+y});
const copy=ds=>ds.map(d=>({...d}));
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const ease=t=>1-(1-clamp(t,0,1))**2;

export class DemoRound {
  constructor({starter=0,round=1,mode='difference'}={}) {
    if(![0,1].includes(starter)||!Number.isSafeInteger(round)||round<1)throw Error('Invalid demo round.');
    roundResult(0,0,mode); // Validate the shared round-scoring mode.
    this.starter=starter;this.round=round;this.mode=mode;
    this.duration=DEMO_INTRO_SECONDS+DEMO_SHOTS*DEMO_SHOT_SECONDS;
    this.stages=[];
    let discs=[],twenties=[0,0],used=[0,0];
    script.forEach((shot,i)=>{
      const team=(i+starter)%2,id=i+1,before=copy(discs),target=before.find(d=>d.id===shot.hit);
      if(shot.hit&&(!target||target.out||target.team===team))throw Error('Invalid scripted contact.');
      const start={x:480+(team===starter?-36:36),y:360+(team===starter?242:-242)};
      const end=point(shot.to);
      const length=target?Math.hypot(start.x-target.x,start.y-target.y):1;
      const contact=target?{x:target.x+(start.x-target.x)*28/length,y:target.y+(start.y-target.y)*28/length}:end;
      const shooter={id,team,...start,r:14};
      if(target)discs=discs.map(d=>d.id===target.id?{...d,...point(shot.move),out:!!shot.out}:d);
      if(shot.twenty)twenties[team]++;else discs.push({...shooter,...end});
      used[team]++;
      const score=scoreSettledBoard(discs.filter(d=>!d.out),DEMO_CALIBRATION,twenties);
      this.stages.push({id,team,title:shot.title.replace('blue',team===0?'blue':'red').replace('Last red',team===1?'Last red':'Last blue'),
        before,after:copy(discs),shooter,contact,end,target:target?{...target}:null,
        moved:target?discs.find(d=>d.id===target.id):null,twenty:!!shot.twenty,
        twenties:[...twenties],used:[...used],score});
    });
  }
  at(seconds) {
    if(!Number.isFinite(seconds))throw Error('Demo time must be finite.');
    const time=clamp(seconds,0,this.duration),play=Math.max(0,time-DEMO_INTRO_SECONDS);
    const completed=Math.min(DEMO_SHOTS,Math.floor((play+1e-8)/DEMO_SHOT_SECONDS));
    const previous=this.stages[completed-1],current=this.stages[completed];
    const base={time,round:this.round,completed,used:previous?[...previous.used]:[0,0],
      remaining:previous?previous.used.map(n=>8-n):[8,8],twenties:previous?[...previous.twenties]:[0,0],
      scores:previous?[...previous.score.totals]:[0,0],boardScores:previous?[...previous.score.visible]:[0,0],
      history:this.stages.slice(0,completed).map(s=>({shot:s.id,team:s.team,title:s.title,scores:[...s.score.totals],twenty:s.twenty})),
      source:'scripted-demo',phase:'ready',team:current?.team??null,title:current?.title??'Round finished'};
    if(completed===DEMO_SHOTS)return {...base,phase:'complete',discs:copy(previous.after),awarded:roundResult(...base.scores,this.mode)};
    if(time<DEMO_INTRO_SECONDS)return {...base,discs:[],title:'Clear board · eight shots per team'};
    const local=play-completed*DEMO_SHOT_SECONDS,ds=copy(current.before);
    let shooter={...current.shooter};
    if(local>=0.8){
      base.phase=local<2.6?'shooting':'settling';
      const approaching=local<1.5;
      shooter={...shooter,...(approaching?lerp(current.shooter,current.contact,ease((local-0.8)/0.7)):lerp(current.contact,current.end,ease((local-1.5)/1.1)))};
      if(!approaching&&current.target){
        const victim=ds.find(d=>d.id===current.target.id);
        Object.assign(victim,lerp(current.target,current.moved,ease((local-1.5)/1.1)));
      }
      if(current.twenty)shooter.opacity=clamp((2.6-local)/0.25,0,1);
    }
    if(!current.twenty||local<2.6)ds.push(shooter);
    return {...base,discs:ds};
  }
  nextShotTime(seconds){
    const frame=this.at(seconds);
    return Math.min(this.duration,DEMO_INTRO_SECONDS+(frame.completed+1)*DEMO_SHOT_SECONDS);
  }
}
