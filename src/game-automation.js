import { RoundTracker } from './round-tracker.js';

/** Integrates new round/colour automation without replacing the recorder or score ledger. */
export function installGameAutomation({state, getCalibration, readyToTrack, reconfigure, updateControls, saveMatch, finishRound, notify}) {
  const $=id=>document.getElementById(id);
  let counter=new RoundTracker(Number($('round-allocation').value)),preview=null,lastCompleted='';
  const readLimit=()=>Number($('round-allocation').value);
  function renderPalette(){
    const known=state.colors.every(Boolean);
    $('team-colour-status').textContent=known?'Team colours locked · labels below show the assignments.':$('auto-colours').checked?'Waiting for two separate, still pucks of different colours.':'Manual colour sampling selected.';
    for(let i=0;i<2;i++){
      const chip=$(`team-colour-${i}`),c=state.colors[i];
      const name=!c?'not detected':Math.max(...c)<60?'Black':Math.min(...c)>205?'White':Math.max(...c)-Math.min(...c)<28?'Grey':c[0]>c[1]&&c[0]>c[2]?'Red / warm':c[2]>c[1]?'Blue':'Green';
      chip.textContent=`Team ${i===0?'A':'B'} · ${name}`;
      chip.title=c?'Detected RGB '+c.join(', '):'';
      chip.dataset.rgb=c?c.join(','):'';
      const dot=document.querySelectorAll('.player .team-dot')[i];
      if(dot&&c){dot.style.backgroundColor=`rgb(${c.join(',')})`;dot.title=chip.textContent;dot.style.border='1px solid #777';}
    }
  }
  function renderCounter(){
    const s=counter.status();
    $('round-allocation').disabled=s.used.some(Boolean)||s.active||!!state.recording;
    $('auto-round-status').textContent=!$('auto-rounds').checked?'Automatic round completion is off.'
      :state.mode!=='camera'?'Live camera required for automatic rounds; select shots per team before play.'
      :!s.ready?'Clear the setup pucks to begin automatic round counting.'
      :s.hold?s.hold
      :s.complete?(state.auto.reviewHold?'All shots used · resolve the score review to finish automatically.':'All shots used · waiting for final score and clip.')
      :`Shots remaining · A ${s.remaining[0]} · B ${s.remaining[1]} of ${s.shotsPerTeam} per team`;
    $('auto-round-status').dataset.complete=String(s.complete);
    $('auto-round-status').dataset.used=s.used.join(',');
    $('correct-round-count').disabled=s.active||!!state.recording||!readyToTrack();
  }
  function snapshot(){return {...counter.snapshot(),enabled:$('auto-rounds').checked};}
  function restore(s){
    if(!s)return;
    try{counter.restore(s);lastCompleted='';$('round-allocation').value=String(counter.limit);$('auto-rounds').checked=s.enabled!==false;renderCounter();}catch{counter.reset(12);}
  }
  function maybeFinish(m){
    const s=counter.status();
    if(!s.complete||state.mode!=='camera'||!$('auto-rounds').checked||!$('auto-scoring').checked||state.auto.reviewHold||state.auto.activeShotNumber!==null||state.recording||!readyToTrack())return;
    if(m.auto?.state!=='settled'||m.visibility?.viewObstructed||!state.auto.lastResult)return;
    if(!state.auto.lastLiveScore||state.auto.lastLiveScore.totals.some((v,i)=>v!==state.scores[i]))return;
    const key=`${state.round}:${s.used.join(',')}`;
    if(lastCompleted===key)return;
    lastCompleted=key;
    const round=state.round;
    if(finishRound(true))notify(`Round ${round} finished automatically after ${s.shotsPerTeam} shots per team. Clear the board for round ${state.round}.`);
    else lastCompleted='';
  }
  $('auto-colours').onchange=()=>{reconfigure();renderPalette();};
  $('auto-rounds').onchange=()=>{renderCounter();saveMatch();};
  $('round-allocation').onchange=()=>{
    if(counter.status().used.some(Boolean)||state.recording){$('round-allocation').value=String(counter.limit);return;}
    try{counter.reset(readLimit());renderCounter();saveMatch();}catch(e){$('round-allocation').value=String(counter.limit);notify(e.message,true);}
  };
  $('correct-round-count').onclick=()=>{
    try{
      const remaining=[Number($('remaining-a').value),Number($('remaining-b').value)];
      if(!confirm(`Use A ${remaining[0]} and B ${remaining[1]} shots remaining? This is a player correction, not an observed count.`))return;
      counter.correct(remaining,state.discs);state.auto.reviewHold=true;notify('Shot count corrected. Review the visible board score before automatic play resumes.');saveMatch();renderCounter();
    }catch(e){notify(e.message,true);}
  };
  return {
    snapshot,restore,renderPalette,
    onReconfigure(){if(state.mode==='idle'&&!counter.used.some(Boolean))counter.reset(readLimit());else counter.interrupt();renderCounter();},
    resetRound(){counter.reset(readLimit());lastCompleted='';renderCounter();},
    enterPreview(){preview=snapshot();counter=new RoundTracker(readLimit());renderCounter();},
    exitPreview(){if(preview){const saved=preview;preview=null;counter=new RoundTracker(saved.shotsPerTeam);counter.restore(saved);}renderCounter();},
    colours(m){
      if(m.colors){state.colors=m.colors.map(c=>[...c]);renderPalette();updateControls();notify('Team colours detected automatically. Clear the two setup pucks and start playing; no colour clicks are needed.');}
      else $('team-colour-status').textContent=m.status;
    },
    onFrame(m){
      if(state.mode!=='camera'||!readyToTrack()||state.calibrationPoints||state.sampleTeam!==null)return;
      const wasReady=counter.ready;
      const s=counter.update(m.discs,getCalibration(),m.time,{event:m.auto?.event,frameGap:m.frameGap,viewObstructed:m.visibility?.viewObstructed});
      renderCounter();
      if(!wasReady&&s.ready){reconfigure();return;} // Drop teaching-puck tracks at the clear-board start.
      if(m.auto?.event?.type==='shot-end')saveMatch();
      maybeFinish(m);
    }
  };
}
