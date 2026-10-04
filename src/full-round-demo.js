import { DemoRound } from './demo-round.js?physics=1';

/** UI-only physical-demo adapter. Never opens media devices, records clips, writes
 * storage, or calls the live round counter. The app's preview boundary restores
 * the real match when exiting. Only the animation clock is speed-adjustable. */
export class FullRoundDemo {
  constructor({state,paint,processFrame,renderScore,exit}) {
    Object.assign(this,{state,paint,processFrame,renderScore,exit});
    this.active=false;this.elapsed=0;this.paused=false;this.previousNow=null;this.frame=null;
    this.$=id=>document.getElementById(id);
    this.$('demo-pause').onclick=()=>{this.paused=!this.paused;this.previousNow=null;this.renderStatus();};
    this.$('demo-next-shot').onclick=()=>{if(!this.active)return;this.elapsed=this.model.nextShotTime(this.elapsed);this.previousNow=null;this.update(performance.now());};
    this.$('demo-restart').onclick=()=>{if(this.active)this.startRound(this.model.round);};
    this.$('demo-next-round').onclick=()=>{if(this.active&&this.frame?.phase==='complete')this.startRound(this.model.round+1);};
    this.$('demo-exit').onclick=exit;
    this.$('demo-speed').onchange=()=>{this.previousNow=null;};
  }
  start(){
    this.wasPlay=document.body.classList.contains('play-mode');
    this.active=true;document.body.classList.add('full-round-demo','play-mode');
    this.$('full-round-controls').hidden=false;
    this.state.names=['Blue · Team A','Red · Team B'];
    this.startRound(1);
    const token=this.state.token;
    const tick=now=>{
      if(!this.active||token!==this.state.token)return;
      if(!this.paused&&!document.hidden&&this.frame?.phase!=='complete'&&this.previousNow!==null){
        // Synthetic animation pauses through stalls; actual camera time is untouched.
        const speed=Number(this.$('demo-speed').value)||1;
        this.elapsed=Math.min(this.model.duration,this.elapsed+Math.min(0.1,Math.max(0,(now-this.previousNow)/1000))*speed);
      }
      this.previousNow=now;this.update(now);
      this.state.raf=requestAnimationFrame(tick);
    };
    this.state.raf=requestAnimationFrame(tick);
    document.querySelector('.play-bar').scrollIntoView({block:'start'});
  }
  startRound(number){
    this.model=new DemoRound({round:number,starter:(number-1)%2,mode:this.$('score-mode').value});
    this.elapsed=0;this.previousNow=null;this.paused=false;this.key='';this.finished=false;
    this.state.rounds=this.state.rounds.filter(r=>r.round<number);
    this.state.totals=this.state.rounds.reduce((sum,r)=>sum.map((v,i)=>v+r.awarded[i]),[0,0]);
    this.state.round=number;this.state.auto.activeShotNumber=null;
    this.update(performance.now());
  }
  update(now){
    if(!this.active)return;
    this.frame=this.model.at(this.elapsed);
    const f=this.frame;
    this.paint(f.discs,f.contacts);this.processFrame(f.time,now);
    if(f.phase==='complete'&&!this.finished){
      this.finished=true;
      this.state.rounds.push({round:f.round,scores:[...f.scores],awarded:[...f.awarded],mode:this.model.mode,source:'physics-demo',shotCountEvidence:{source:'physics-demo',used:[8,8]}});
      this.state.totals=this.state.totals.map((v,i)=>v+f.awarded[i]);
    }
    const key=`${f.round}:${f.completed}:${f.phase}`;
    if(key!==this.key){
      this.key=key;this.state.scores=[...f.scores];this.state.auto.twenties=[...f.twenties];
      this.renderScore();this.renderHistory();
    }
    this.renderStatus();
  }
  renderHistory(){
    const list=this.$('demo-shot-log');list.replaceChildren();
    for(const h of this.frame.history){
      const li=document.createElement('li');
      li.textContent=`${h.team===0?'Blue / A':'Red / B'} · ${h.title} · score ${h.scores.join('–')}${h.twenty?' · simulated 20':''}`;
      list.append(li);
    }
  }
  renderStatus(){
    if(!this.active||!this.frame)return;
    const f=this.frame,$=this.$,ended=f.phase==='complete';
    const who=f.scores[0]===f.scores[1]?'Tie':`${f.scores[0]>f.scores[1]?'Blue / A':'Red / B'} wins by ${Math.abs(f.scores[0]-f.scores[1])}`;
    const heading=ended?`Round ${f.round} finished · ${who} · ${f.scores.join('–')}`:`${this.paused?'Paused · ':''}Shot ${f.completed+1} of 16 · ${f.team===0?'Blue / A':'Red / B'} · ${f.phase==='shooting'?'in motion':f.phase==='settling'?'settling':f.phase==='clearing'?'removing out-of-play discs':'lining up'}`;
    if($('demo-round-status').textContent!==heading)$('demo-round-status').textContent=heading;
    const panel=$('full-round-controls');panel.dataset.engine='swept-circle-v1';panel.dataset.completed=String(f.completed);panel.dataset.phase=f.phase;panel.dataset.round=String(f.round);panel.dataset.score=f.scores.join(',');panel.dataset.paused=String(this.paused);
    $('demo-progress').value=f.completed;
    $('demo-shot-caption').textContent=ended?'The complete round stays on screen. Replay it, begin the next demo round, or return to your real match.':f.title;
    $('demo-ledger').textContent=`Board: A ${f.boardScores[0]} · B ${f.boardScores[1]} | Banked 20s: A ${f.twenties[0]} · B ${f.twenties[1]} | Shots left: A ${f.remaining[0]} · B ${f.remaining[1]}`;
    $('demo-pause').textContent=this.paused?'Resume':'Pause';$('demo-pause').disabled=ended;
    $('demo-next-shot').disabled=ended;$('demo-next-round').hidden=!ended;
    $('demo-result').hidden=!ended;
    if(ended)$('demo-result').textContent=`${who}. Round award: A ${f.awarded[0]} · B ${f.awarded[1]} (${this.model.mode==='match'?'match points':'point difference'}). Demo match total: ${this.state.totals.join('–')}.`;
    $('play-score').textContent=`Blue / A ${f.scores[0]} — ${f.scores[1]} Red / B · Demo round ${f.round}`;
    $('play-state').textContent=heading;
    $('play-remaining').textContent=`${f.completed}/16 simulated shots complete · ${f.remaining.join(' / ')} remaining · demo only`;
    $('score-badge').textContent='Simulated demo score';
  }
  visibilityChanged(){if(this.active&&document.hidden){this.paused=true;this.previousNow=null;this.renderStatus();}}
  stop(){
    if(!this.active)return;
    this.active=false;this.previousNow=null;
    document.body.classList.remove('full-round-demo');document.body.classList.toggle('play-mode',this.wasPlay);
    this.$('toggle-play').textContent=this.wasPlay?'Show table setup':'Play view';this.$('toggle-play').setAttribute('aria-pressed',String(this.wasPlay));
    this.$('full-round-controls').hidden=true;
  }
}
