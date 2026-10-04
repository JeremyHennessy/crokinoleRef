import { RoundTracker } from './round-tracker.js';

/** Integrates new round/colour automation without replacing the recorder or score ledger. */
export function installGameAutomation({state, getCalibration, readyToTrack, reconfigure, updateControls, saveMatch, finishRound, notify}) {
  const $=id=>document.getElementById(id);
  let counter=new RoundTracker(Number($('round-allocation').value)),preview=null,lastCompleted='';
  const readLimit=()=>Number($('round-allocation').value);
  const readStarter=()=>['0','1'].includes($('starting-team')?.value)?Number($('starting-team').value):null;
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
      :`Shots remaining · A ${s.remaining[0]} · B ${s.remaining[1]} of ${s.shotsPerTeam} per team${s.nextTeam!==null?` · next ${s.nextTeam===0?'A':'B'}`:''}`;
    $('auto-round-status').dataset.complete=String(s.complete);
    $('auto-round-status').dataset.used=s.used.join(',');
    if($('format-preset'))$('format-preset').disabled=s.used.some(Boolean)||s.active||!!state.recording;
    if($('starting-team'))$('starting-team').disabled=s.used.some(Boolean)||s.active||state.round>1;
    $('correct-round-count').disabled=s.active||!!state.recording||!readyToTrack();
  }
  function snapshot(){return {...counter.snapshot(),enabled:$('auto-rounds').checked,format:$('format-preset')?.value||'custom',firstStarter:readStarter()};}
  function restore(s){
    if(!s)return;
    try{counter.restore(s);if($('format-preset'))$('format-preset').value=s.format||'custom';if($('starting-team'))$('starting-team').value=s.firstStarter===0||s.firstStarter===1?String(s.firstStarter):'auto';lastCompleted='';$('round-allocation').value=String(counter.limit);$('auto-rounds').checked=s.enabled!==false;renderCounter();}catch{counter.reset(12);}
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
    try{counter.reset(readLimit(),readStarter());if($('format-preset'))$('format-preset').value='custom';renderCounter();saveMatch();}catch(e){$('round-allocation').value=String(counter.limit);notify(e.message,true);}
  };
  if($('format-preset'))$('format-preset').onchange=()=>{
    if(counter.used.some(Boolean)||counter.active||state.recording)return;
    const preset=$('format-preset').value,limits={casual:12,singles:8,doubles:12};
    if(limits[preset])$('round-allocation').value=String(limits[preset]);
    counter.reset(readLimit(),readStarter());renderCounter();saveMatch();
  };
  if($('starting-team'))$('starting-team').onchange=()=>{if(counter.used.some(Boolean)||state.round>1)return;counter.reset(readLimit(),readStarter());renderCounter();saveMatch();};
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
    resetRound(){const starter=state.round===1?readStarter():counter.starter!==null?1-counter.starter:null;counter.reset(readLimit(),starter);lastCompleted='';renderCounter();},
    enterPreview(){preview=snapshot();counter=new RoundTracker(readLimit());renderCounter();},
    exitPreview(){if(preview){const saved=preview;preview=null;counter=new RoundTracker(saved.shotsPerTeam);counter.restore(saved);}renderCounter();},
    colours(m){
      if(m.colors){if(m.measurement&&state.calibration){const scale=getCalibration().discRadius/state.calibration.discRadius;state.calibration.discRadius=m.measurement.radius/scale;state.calibration.radiusUncertainty=m.measurement.uncertainty/scale;state.calibration.radiusSource=m.measurement.source;}state.colors=m.colors.map(c=>[...c]);renderPalette();updateControls();notify('Team colours detected automatically. Clear the two setup pucks and start playing; no colour clicks are needed.');}
      else $('team-colour-status').textContent=m.status;
    },
    onFrame(m){
      if(state.mode!=='camera'||!readyToTrack()||state.calibrationPoints||state.sampleTeam!==null)return;
      const wasReady=counter.ready;
      const s=counter.update(m.discs,getCalibration(),m.time,{event:m.auto?.event,frameGap:m.frameGap,viewObstructed:m.visibility?.viewObstructed});
      renderCounter();
      if(!wasReady&&s.ready){if(counter.used.every(v=>v===0)&&!state.auto.lastResult)state.auto.reviewHold=false;reconfigure();return;} // Drop teaching-puck tracks at the clear-board start.
      if(m.auto?.event?.type==='shot-end')saveMatch();
      maybeFinish(m);
    }
  };
}
