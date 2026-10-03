import { distance, suggestedScore } from './core.js';

const cloneDisc=d=>({id:d.id,team:d.team,x:d.x,y:d.y,r:d.r});
function geometricPairs(previous,current) {
  const candidates=[];
  previous.forEach((p,pi)=>current.forEach((d,di)=>{if(p.team===d.team)candidates.push({p,d,pi,di,dist:distance(p,d)});}));
  candidates.sort((a,b)=>a.dist-b.dist);
  const usedP=new Set(),usedD=new Set(),pairs=[];
  for(const c of candidates){
    if(usedP.has(c.pi)||usedD.has(c.di))continue;
    usedP.add(c.pi);usedD.add(c.di);
    pairs.push({...c,delta:c.dist/Math.max(1,(c.p.r+c.d.r)/2)});
  }
  return pairs;
}

export function scoreSettledBoard(discs, calibration, twenties=[0,0]) {
  if(!calibration) return {totals:[0,0],visible:[0,0],twenties:[...twenties],items:[],review:true,reviewReasons:['No calibration']};
  const visible=[0,0],items=[],reviewReasons=[];
  for(const d of discs||[]) {
    if(d.team!==0&&d.team!==1){reviewReasons.push('Unclassified puck');continue;}
    const tolerance=Math.max(2,calibration.discRadius*.16);
    const suggestion=suggestedScore(d,calibration,tolerance);
    visible[d.team]+=suggestion.value;
    items.push({id:d.id,team:d.team,value:suggestion.value,review:suggestion.review,x:d.x,y:d.y,r:d.r});
    if(suggestion.review) reviewReasons.push(`Puck ${d.team===0?'A':'B'}${d.id} is close to a scoring boundary or centre`);
  }
  return {
    visible,
    twenties:[...twenties],
    totals:visible.map((n,i)=>n+(twenties[i]||0)*20),
    items,
    review:reviewReasons.length>0,
    reviewReasons
  };
}

export class AutoShotAnalyzer {
  constructor(calibration, options={}) {
    this.options={
      moveStart:options.moveStart??.20,
      moveStop:options.moveStop??.16,
      settleSeconds:options.settleSeconds??1.0,
      maxShotSeconds:options.maxShotSeconds??10,
      twentyRadiusFactor:options.twentyRadiusFactor??1.85
    };
    this.setCalibration(calibration);
    this.resetRound();
  }
  setCalibration(calibration){this.calibration=calibration||null;}
  resetRound(){
    this.active=false;this.shotNumber=0;this.twenties=[0,0];this.last=[];this.lastSettled=[];
    this.motionFrames=0;this.stableSince=null;this.startedAt=null;this.preDiscs=[];this.tracks=new Map();this.hadFrameGap=false;this.contacts=[];this.armed=false;this.baselineKey='';this.baselineStreak=0;
  }
  _recordTracks(discs,time){
    for(const d of discs||[]){
      let t=this.tracks.get(d.id);
      if(!t)t={id:d.id,team:d.team,r:d.r,minCenterDistance:Infinity,last:null,firstTime:time,lastTime:time};
      const centerDistance=this.calibration?distance(d,this.calibration.center):Infinity;
      t.minCenterDistance=Math.min(t.minCenterDistance,centerDistance);t.last=cloneDisc(d);t.lastTime=time;t.team=d.team;t.r=d.r;
      this.tracks.set(d.id,t);
    }
  }
  update(frame,time){
    const current=(frame.discs||[]).map(cloneDisc),previous=this.last;
    const prevBy=new Map(previous.map(d=>[d.id,d])),curBy=new Map(current.map(d=>[d.id,d]));
    const matched=geometricPairs(previous,current);
    const maxMotion=matched.length?Math.max(...matched.map(v=>v.delta)):0;
    const moving=matched.filter(v=>v.delta>=this.options.moveStart).map(v=>v.d.id);
    const appeared=current.filter(d=>!prevBy.has(d.id)).map(d=>d.id);
    const disappeared=previous.filter(d=>!curBy.has(d.id)).map(d=>d.id);
    const topologyAppeared=Math.max(0,current.length-matched.length),topologyDisappeared=Math.max(0,previous.length-matched.length);
    const frameGap=!!frame.frameGap;
    let event=null;

    if(!this.active){
      const counts=[0,0];for(const d of current)if(d.team===0||d.team===1)counts[d.team]++;
      const key=counts.join(':');
      const quiet=!frameGap&&maxMotion<this.options.moveStop&&topologyAppeared===0&&topologyDisappeared===0;
      if(quiet){
        if(this.baselineKey===key)this.baselineStreak++;else{this.baselineKey=key;this.baselineStreak=1;}
        // Keep the most complete repeatedly observed settled board. A one-frame
        // detector dropout must not redefine the pre-shot baseline.
        if(this.baselineStreak>=2&&current.length>=this.lastSettled.length){
          this.lastSettled=current.map(cloneDisc);this.armed=true;
        }
      } else if(topologyAppeared||topologyDisappeared){
        this.baselineStreak=0;this.baselineKey='';this.armed=false;
      }
      if(this.armed&&!frameGap&&moving.length){this.motionFrames++;}else this.motionFrames=0;
      if(this.motionFrames>=1){
        this.active=true;this.armed=false;this.shotNumber++;this.startedAt=time;this.stableSince=null;this.hadFrameGap=false;this.contacts=[];
        this.tracks=new Map();const seed=this.lastSettled.length?this.lastSettled:previous;this.preDiscs=seed.map(cloneDisc);this._recordTracks(seed,time);this._recordTracks(current,time);
        event={type:'shot-start',shotNumber:this.shotNumber,time,movingDiscIds:moving,preDiscs:this.preDiscs.map(cloneDisc)};
      }
    } else {
      this._recordTracks(current,time);
      if(frameGap)this.hadFrameGap=true;
      if(frame.contacts?.length)this.contacts.push(...frame.contacts);
      const stable=!frameGap&&maxMotion<this.options.moveStop&&topologyAppeared===0&&topologyDisappeared===0;
      if(stable){if(this.stableSince===null)this.stableSince=time;}else this.stableSince=null;
      const settledReady=this.stableSince!==null&&time-this.stableSince>=this.options.settleSeconds;
      const timedOut=time-this.startedAt>=this.options.maxShotSeconds;
      if(settledReady||timedOut){
        const twentyCandidates=[];
        const currentIds=new Set(current.map(d=>d.id));
        const limit=(this.calibration?.discRadius||12)*this.options.twentyRadiusFactor;
        const preCounts=[0,0],currentCounts=[0,0];
        for(const d of this.preDiscs)if(d.team===0||d.team===1)preCounts[d.team]++;
        for(const d of current)if(d.team===0||d.team===1)currentCounts[d.team]++;
        const missingByTeam=preCounts.map((n,i)=>Math.max(0,n-currentCounts[i]));
        for(const t of this.tracks.values()){
          if(currentIds.has(t.id)||!t.last||t.minCenterDistance>limit||(t.team!==0&&t.team!==1)||missingByTeam[t.team]<1)continue;
          const lastDistance=this.calibration?distance(t.last,this.calibration.center):Infinity;
          if(lastDistance>limit*1.15)continue;
          const sameTeamNearCentre=current.some(d=>d.team===t.team&&this.calibration&&distance(d,this.calibration.center)<=limit*1.15);
          if(!sameTeamNearCentre)twentyCandidates.push({id:t.id,team:t.team,minCenterDistance:t.minCenterDistance,last:t.last});
        }
        const possibleConfirmed=!this.hadFrameGap&&!timedOut&&twentyCandidates.length===1?twentyCandidates:[];
        const outerRadius=this.calibration?.rings?.[2]||Infinity;
        const outOfPlay=[...this.tracks.values()].filter(t=>!currentIds.has(t.id)&&!possibleConfirmed.some(v=>v.id===t.id)&&t.last&&this.calibration&&distance(t.last,this.calibration.center)>=outerRadius-t.r*2.2);
        const outIds=new Set(outOfPlay.map(t=>t.id));
        const unexplainedLosses=[...this.tracks.values()].filter(t=>!currentIds.has(t.id)&&!possibleConfirmed.some(v=>v.id===t.id)&&!outIds.has(t.id)&&t.last&&(t.team===0||t.team===1)&&missingByTeam[t.team]>0);

        // A stable-looking frame with an unexplained interior loss is not a settled board.
        // Keep waiting for the detector to recover instead of scoring an incomplete snapshot.
        if(settledReady&&!timedOut&&unexplainedLosses.length){
          this.last=current;
          return {
            event:null,state:'moving',shotNumber:this.shotNumber,maxMotion,movingDiscIds:moving,appeared,disappeared,
            score:null,twenties:[...this.twenties],waitingForRecovery:true
          };
        }

        const confirmedTwenties=timedOut?[]:possibleConfirmed;
        for(const t of confirmedTwenties)this.twenties[t.team]++;
        const score=scoreSettledBoard(current,this.calibration,this.twenties);
        let confidence=1;
        if(this.hadFrameGap)confidence-=.38;
        if(unexplainedLosses.length)confidence-=Math.min(.45,unexplainedLosses.length*.15);
        if(score.review)confidence-=.12;
        if(twentyCandidates.length>1)confidence-=.25;
        if(timedOut)confidence-=.45;
        confidence=Math.max(0,Math.min(1,confidence));
        event={
          type:'shot-end',shotNumber:this.shotNumber,time,startedAt:this.startedAt,duration:time-this.startedAt,
          postDiscs:current.map(cloneDisc),score,twentiesAdded:confirmedTwenties.map(v=>({id:v.id,team:v.team})),
          twentyCandidates:twentyCandidates.map(v=>({id:v.id,team:v.team,minCenterDistance:v.minCenterDistance})),
          outOfPlay:outOfPlay.map(v=>({id:v.id,team:v.team,last:v.last})),
          unexplainedLosses:unexplainedLosses.map(v=>({id:v.id,team:v.team,last:v.last})),
          contacts:this.contacts.slice(0,300),hadFrameGap:this.hadFrameGap,timedOut,
          confidence,applyScore:!timedOut&&!unexplainedLosses.length&&confidence>=.62
        };
        this.active=false;this.armed=false;this.baselineKey='';this.baselineStreak=0;this.stableSince=null;this.startedAt=null;this.motionFrames=0;this.tracks=new Map();this.contacts=[];
        this.lastSettled=current.map(cloneDisc);
      }
    }
    this.last=current;
    return {
      event,
      state:this.active?'moving':'settled',
      shotNumber:this.shotNumber,
      maxMotion,
      movingDiscIds:moving,
      appeared,
      disappeared,
      score:!this.active&&this.calibration?scoreSettledBoard(current,this.calibration,this.twenties):null,
      twenties:[...this.twenties],armed:this.armed,baselineCount:this.lastSettled.length
    };
  }
}
