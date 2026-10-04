import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoPhysics,DEMO_BOARD as B,PHYSICS_STEP,circleImpactTime} from '../src/demo-physics.js';
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function run(w,seconds){for(let i=0;i<Math.round(seconds/PHYSICS_STEP);i++)w.step();}
const add=(w,id,x,y,vx=0,vy=0)=>w.add({id,team:id%2,x:B.x+x,y:B.y+y,vx,vy});
const localPeg=(x,y)=>({x:B.x+x,y:B.y+y,r:5,id:0});

test('swept contact catches a fast puck even if both sampled endpoints miss the peg',()=>{
  const peg=localPeg(0,50),w=new DemoPhysics({friction:0,pegs:[peg]});
  const d=add(w,1,-60,50,40000,0);w.step();
  assert.ok(w.events.some(e=>e.type==='peg'));assert.ok(d.vx<0);assert.ok(d.x<peg.x-d.r-peg.r);
});
test('static peg reverses only the normal component with the configured restitution',()=>{
  const peg=localPeg(0,50),w=new DemoPhysics({friction:0,pegRestitution:.8,pegs:[peg]});
  const d=add(w,1,-50,50,200,0);run(w,.20);
  assert.equal(w.events.filter(e=>e.type==='peg').length,1);near(d.vx,-160);near(d.vy,0);
});
test('equal-mass head-on impact transfers momentum instead of moving toward assigned endpoints',()=>{
  const w=new DemoPhysics({friction:0,discRestitution:1,pegs:[]});
  const a=add(w,1,-80,50,200,0),b=add(w,2,-20,50);run(w,.25);
  near(a.vx,0);near(b.vx,200);near(a.vy,0);near(b.vy,0);near(a.vx+b.vx,200);
});
test('glancing disc impact conserves both momentum components and has a nonparallel rebound',()=>{
  const w=new DemoPhysics({friction:0,discRestitution:1,pegs:[]});
  const a=add(w,1,-70,50,250,0),b=add(w,2,-10,66);run(w,.20);
  const event=w.events.find(e=>e.type==='disc');assert.ok(event);
  near(a.vx+b.vx,250);near(a.vy+b.vy,0);
  near(a.vx*a.vx+a.vy*a.vy+b.vx*b.vx+b.vy*b.vy,250*250,1e-5);
  assert.ok(Math.abs(b.vy)>10);assert.ok(a.vy*b.vy<0);
});
test('non-unit restitution cannot add kinetic energy to a two-puck impact',()=>{
  const w=new DemoPhysics({friction:0,discRestitution:.8,pegs:[]});
  const a=add(w,1,-80,50,200,0),b=add(w,2,-20,50);run(w,.25);
  near(a.vx,20);near(b.vx,180);assert.ok(a.vx*a.vx+b.vx*b.vx<200*200);
});
test('a target does not move before physical contact, and a near miss never becomes a hit',()=>{
  const w=new DemoPhysics({friction:0,pegs:[]});
  add(w,1,-80,50,200,0);const b=add(w,2,-20,50);run(w,.10);near(b.x,B.x-20);near(b.vx,0);
  const m=new DemoPhysics({friction:0,pegs:[]});add(m,1,-80,50,200,0);const c=add(m,2,-20,79);run(m,.4);
  near(c.vx,0);assert.equal(m.events.filter(e=>e.type==='disc').length,0);
});
test('a touching pair already moving apart receives no attraction or second impulse',()=>{
  const a={x:0,y:0,r:14,vx:-10,vy:0},b={x:28,y:0,r:14,vx:10,vy:0};
  assert.equal(circleImpactTime(a,b,1),null);
});
test('three-disc chain contacts transfer motion through real contact distances',()=>{
  const w=new DemoPhysics({friction:0,discRestitution:1,pegs:[]});
  add(w,1,-80,50,240,0);add(w,2,-30,50);const c=add(w,3,-2,50);run(w,.15);
  assert.ok(c.vx>230);assert.equal(w.events.filter(e=>e.type==='disc').length,2);
  for(const e of w.events.filter(e=>e.type==='disc'))near(e.gap,0,1e-5);
});
test('friction brings a free puck to rest at its stopping distance without teleportation',()=>{
  const w=new DemoPhysics({friction:100,pegs:[]});const d=add(w,1,-150,100,100,0);run(w,1.5);
  near(d.x,B.x-100,.01);near(d.vx,0);assert.equal(w.moving(),false);
});
test('scoring circles are markings, not walls; only the actual edge drops a puck',()=>{
  const w=new DemoPhysics({friction:0,pegs:[]});const d=add(w,1,245,40,200,0);run(w,.08);
  assert.equal(d.status,'board');assert.ok(Math.hypot(d.x-B.x,d.y-B.y)>260);
  run(w,.2);assert.equal(d.status,'gutter');assert.ok(w.events.some(e=>e.type==='gutter'));
  run(w,2);assert.equal(d.status,'gutter');assert.equal(w.events.filter(e=>e.type==='gutter').length,1);
});
test('centred slow entry captures once; off-centre and fast passes are not invented 20s',()=>{
  const slow=new DemoPhysics({friction:0,pegs:[]});const a=add(slow,1,-20,0,40,0);run(slow,.6);
  assert.equal(a.status,'hole');assert.equal(slow.events.filter(e=>e.type==='hole').length,1);
  const miss=new DemoPhysics({friction:0,pegs:[]});const b=add(miss,1,-20,5,40,0);run(miss,.6);assert.equal(b.status,'board');
  const fast=new DemoPhysics({friction:0,pegs:[]});const c=add(fast,1,-20,0,400,0);run(fast,.1);assert.equal(c.status,'board');
});
test('invalid placements, nonfinite values and unbounded time steps fail closed',()=>{
  const w=new DemoPhysics();assert.throws(()=>add(w,1,94,0));assert.throws(()=>add(w,2,280,0));
  add(w,1,150,0);assert.throws(()=>add(w,2,155,0));assert.throws(()=>w.step(1));assert.throws(()=>w.step(NaN));
  assert.throws(()=>new DemoPhysics({discRestitution:1.1}));
});
