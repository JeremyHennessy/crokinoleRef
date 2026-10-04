import test from 'node:test';
import assert from 'node:assert/strict';
import {installGameAutomation} from '../src/game-automation.js';
import {ClipStore} from '../src/local-library.js';

test('selected starting team survives the idle reset when connecting a camera',()=>{
 const old=globalThis.document,els=new Map();
 const get=id=>{if(!els.has(id))els.set(id,{value:id==='round-allocation'?'8':id==='starting-team'?'1':'singles',checked:true,dataset:{},disabled:false});return els.get(id);};
 globalThis.document={getElementById:get,querySelectorAll:()=>[]};
 try{
  const state={mode:'idle',round:1,colors:[null,null],recording:null,auto:{reviewHold:false}};
  const game=installGameAutomation({state,getCalibration:()=>null,readyToTrack:()=>false,reconfigure(){},updateControls(){},saveMatch(){},finishRound(){},notify(){}});
  get('starting-team').onchange();assert.equal(game.snapshot().starter,1);
  game.onReconfigure();assert.equal(game.snapshot().starter,1);
  state.round=2;game.resetRound();assert.equal(game.snapshot().starter,0);
  game.onReconfigure();assert.equal(game.snapshot().starter,0);
 }finally{globalThis.document=old;}
});

test('storage property denial is an asynchronous storage failure, not an app-constructor crash',async()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,get(){throw new Error('Property denied');}});
 try{
  let store;assert.doesNotThrow(()=>{store=new ClipStore();});
  await assert.rejects(store.open(),/unavailable|denied/i);
 }finally{if(old)Object.defineProperty(globalThis,'indexedDB',old);else delete globalThis.indexedDB;}
});
