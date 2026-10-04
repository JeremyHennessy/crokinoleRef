import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDemoShot} from '../src/demo-rules.js';
const d=(id,team,x,y=50,status='board')=>({id,team,x,y,r:14,vx:0,vy:0,status});
const hit=(id,other,time=1)=>({type:'disc',id,other,time});
function resolve(before,after,events=[],shooterId=1){return resolveDemoShot({before,after,events,shooterId,center:{x:0,y:0},innerRadius:94,outerRadius:260});}

test('valid direct opponent hit keeps its settled discs',()=>{
 const before=[d(2,1,120)],after=[d(1,0,90),d(2,1,145)];
 const r=resolve(before,after,[hit(1,2)]);assert.equal(r.valid,true);assert.equal(r.removals.length,0);
 assert.deepEqual(after,[d(1,0,90),d(2,1,145)],'Evidence input remains unchanged');
});
test('own-disc-first combination satisfies opponent contact, even at a simultaneous chain',()=>{
 const before=[d(2,0,110),d(3,1,145)],after=[d(1,0,70),d(2,0,130),d(3,1,180)];
 for(const events of [[hit(1,2,1),hit(2,3,2)],[hit(2,3,1),hit(1,2,1)]])assert.equal(resolve(before,after,events).valid,true);
});
test('peg-only contact cannot replace an opponent hit',()=>{
 const r=resolve([d(2,1,120)],[d(1,0,50),d(2,1,120)],[{type:'peg',id:1,other:0,time:1}]);
 assert.equal(r.valid,false);assert.deepEqual(r.removals.map(d=>d.id),[1]);assert.equal(r.discs[1].status,'board');
});
test('failed shot removes struck own discs and current-shot 20s, not unrelated or prior banked discs',()=>{
 const before=[d(2,0,100),d(3,0,-120),d(4,1,150),d(5,0,0,0,'hole')];
 const r=resolve(before,[d(1,0,0,0,'hole'),d(2,0,120),d(3,0,-120),d(4,1,150),d(5,0,0,0,'hole')],[hit(1,2)]);
 assert.equal(r.valid,false);assert.deepEqual(r.removals.map(d=>d.id),[1,2]);
 assert.equal(r.discs.find(d=>d.id===5).status,'hole');assert.equal(r.discs.find(d=>d.id===3).status,'board');
});
test('an unrelated disc already in the middle cannot rescue a missed play-to-middle shot',()=>{
 const r=resolve([d(2,0,30,0)],[d(1,0,170,0),d(2,0,30,0)]);
 assert.equal(r.valid,false);assert.deepEqual(r.removals.map(d=>d.id),[1]);
});
test('touching the 15 circle is enough for a valid open-board shot',()=>{
 assert.equal(resolve([],[d(1,0,108,0)]).valid,true);
 assert.equal(resolve([],[d(1,0,108.01,0)]).valid,false);
 assert.equal(resolve([],[d(1,0,0,0,'hole')]).valid,true);
});
test('play-to-middle can be achieved with another involved own disc',()=>{
 assert.equal(resolve([d(2,0,160,0)],[d(1,0,190,0),d(2,0,105,0)],[hit(1,2)]).valid,true);
});
test('the outer line is resolved only at settlement; moving across and returning is allowed',()=>{
 const before=[d(2,1,140,0)];
 const r=resolve(before,[d(1,0,248.63,0),d(2,1,160,0)],[hit(1,2)]);
 assert.equal(r.valid,true);assert.equal(r.discs[0].status,'removed');assert.equal(r.removals[0].reason,'outer-line');
 assert.equal(resolve(before,[d(1,0,245.99,0),d(2,1,160,0)],[hit(1,2)]).removals.length,0);
 assert.equal(resolve(before,[d(1,0,246,0),d(2,1,160,0)],[hit(1,2)]).removals.length,1);
 assert.throws(()=>resolve(before,[{...d(1,0,248,0),vx:15},d(2,1,160,0)],[hit(1,2)]),/settlement/);
});
test('outer-line cleanup applies to both teams; fallen discs never re-enter play',()=>{
 const r=resolve([d(2,1,140,0)],[d(1,0,248,0),d(2,1,-247,0),d(3,1,300,0,'gutter')],[hit(1,2)]);
 assert.deepEqual(r.removals.map(d=>d.id),[1,2]);assert.equal(r.discs[2].status,'gutter');
});
test('contact connectivity never travels backwards in time',()=>{
 const r=resolve([d(2,0,120),d(3,1,150)],[d(1,0,50),d(2,0,145),d(3,1,175)],[hit(2,3,1),hit(1,2,2)]);
 assert.equal(r.valid,false);
});
