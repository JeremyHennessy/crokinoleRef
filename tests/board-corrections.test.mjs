import test from 'node:test';import assert from 'node:assert/strict';
import {addBoardCorrection,reconcileBoardCorrections,invalidateBoardCorrections} from '../src/board-corrections.js';
import {scoreSettledBoard} from '../src/auto-referee.js';
const c={center:{x:150,y:150},rings:[40,80,120],discRadius:7};const d={id:1,team:0,x:250,y:150,r:7};
test('missing-disc correction reconciles without double counting when the disc returns',()=>{
 const e=addBoardCorrection([],d,5,'missing',1);let o=reconcileBoardCorrections(scoreSettledBoard([],c),[],e,1);assert.equal(o.score.totals[0],5);
 o=reconcileBoardCorrections(scoreSettledBoard([d],c),[d],o.entries,1);assert.equal(o.score.totals[0],5);assert.equal(o.entries[0].status,'reconciled');
});
test('override changes one observation, not a permanent point bank',()=>{
 const ds=[{...d,x:180}],e=addBoardCorrection([],ds[0],10,'override',2),o=reconcileBoardCorrections(scoreSettledBoard(ds,c),ds,e,2);
 assert.equal(o.score.totals[0],10);assert.equal(o.score.items[0].manual,true);
 const next=reconcileBoardCorrections(scoreSettledBoard(ds,c),ds,invalidateBoardCorrections(o.entries),2);assert.equal(next.score.totals[0],15);assert.equal(next.needsReview,true);
});
test('stale geometry and duplicate annotations cannot fabricate points',()=>{
 const e=addBoardCorrection([],d,5,'missing',1);assert.throws(()=>addBoardCorrection(e,d,5,'missing',1));
 const o=reconcileBoardCorrections(scoreSettledBoard([],c),[],e,2);assert.equal(o.score.totals[0],0);assert.equal(o.needsReview,true);
});
