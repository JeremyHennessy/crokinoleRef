import test from 'node:test';
import assert from 'node:assert/strict';
import { installGameAutomation } from '../src/game-automation.js';

// Exercise the actual integration guard, including its once-only completion key.
test('automatic completion runs once per round and a new match can reuse round one',()=>{
  const oldDocument=globalThis.document;
  const elements=new Map();
  const el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:true,dataset:{}});return elements.get(id);};
  globalThis.document={getElementById:el,querySelectorAll:()=>[]};
  el('round-allocation').value='1';
  const c={center:{x:150,y:150},rings:[40,80,120],discRadius:7};
  const state={mode:'camera',round:1,colors:[[25,25,25],[240,240,240]],scores:[5,5],discs:[],sampleTeam:null,auto:{reviewHold:false,activeShotNumber:null,lastResult:{},lastLiveScore:{totals:[5,5]}}};
  let finishes=0,game,time=0;
  const frame=(discs,event=null)=>{time+=.2;state.discs=discs;game.onFrame({discs,time,frameGap:false,visibility:{viewObstructed:false},auto:{state:event?.type==='shot-start'?'moving':'settled',event}});};
  const d=(id,team,x,y=150)=>({id,team,x,y,r:7});
  const play=()=>{
    frame([]);frame([]);frame([]);
    frame([d(1,0,250)]);frame([d(1,0,248)],{type:'shot-start',shotNumber:1});frame([d(1,0,235)]);
    frame([d(1,0,235)],{type:'shot-end',shotNumber:1,startedAt:time-.4,postDiscs:[d(1,0,235)]});
    frame([d(1,0,235),d(2,1,50)]);frame([d(1,0,235),d(2,1,52)],{type:'shot-start',shotNumber:2});frame([d(1,0,235),d(2,1,65)]);
    frame([d(1,0,235),d(2,1,65)],{type:'shot-end',shotNumber:2,startedAt:time-.4,postDiscs:[d(1,0,235),d(2,1,65)]});
  };
  try{
    game=installGameAutomation({state,getCalibration:()=>c,readyToTrack:()=>true,reconfigure:()=>{},updateControls:()=>{},saveMatch:()=>{},notify:()=>{},finishRound:()=>{finishes++;state.round++;game.resetRound();return true;}});
    play();assert.equal(finishes,1);assert.equal(state.round,2);
    frame(state.discs);frame(state.discs);assert.equal(finishes,1);
    state.round=1;game.resetRound();play();assert.equal(finishes,2);assert.equal(state.round,2);
  }finally{globalThis.document=oldDocument;}
});
