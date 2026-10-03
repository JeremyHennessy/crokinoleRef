import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapture, RollingClipBuffer } from '../src/clip-buffer.js';

class Clock {
  time = 0; next = 0; tasks = new Map();
  now = () => this.time;
  set = (fn, ms) => { const id = ++this.next; this.tasks.set(id, { fn, at: this.time + ms }); return id; };
  clear = id => this.tasks.delete(id);
  advance(ms) {
    const end = this.time + ms;
    while (true) {
      const next = [...this.tasks].filter(([,v]) => v.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.time = next[1].at; this.tasks.delete(next[0]); next[1].fn();
    }
    this.time = end;
  }
}
function harness({ delayed = false, failAfter = Infinity, idleBytes = 16*1024*1024 } = {}) {
  const clock = new Clock(), instances = [], failures = [], statuses = [];
  class FakeRecorder {
    static isTypeSupported = type => type === 'video/webm;codecs=vp9';
    constructor(stream) {
      if (instances.length >= failAfter) throw Error('No encoder available');
      this.stream = stream; this.id = instances.length; this.state = 'inactive'; this.mimeType = 'video/webm'; instances.push(this);
    }
    emit(data) { this.ondataavailable?.({ data: new Blob([data]) }); }
    start() { this.state = 'recording'; if (!delayed) this.onstart?.(); this.emit(`HEADER:${this.id}|`); }
    stop() { this.state = 'inactive'; this.emit(`TAIL:${this.id}`); this.onstop?.(); }
  }
  const stream = { active: true, getTracks: () => { throw Error('must not stop camera tracks'); } };
  const options = { Recorder: FakeRecorder, now: clock.now, sourceTime: () => clock.time/1000,
    setTimer: clock.set, clearTimer: clock.clear, idleBytes,
    onError: s => failures.push(s), onStatus: s => statuses.push(s) };
  const pool = new RollingClipBuffer(options);
  return { clock, instances, failures, statuses, stream, options, pool, FakeRecorder };
}

test('no recording is started by constructing a pre-roll buffer', () => {
  const h = harness(); assert.equal(h.instances.length, 0); assert.equal(h.pool.running, false);
});
test('idle pre-roll remains bounded at two encoder sessions after many rotations', () => {
  const h = harness(); h.pool.start(h.stream); h.clock.advance(60000);
  assert.equal(h.pool.sessions.length, 2);
  assert.equal(h.instances.filter(s=>s.state==='recording').length, 2);
  assert.ok(h.statuses.every(s=>s.sessions<=2));
  assert.ok(h.pool.sessions.every(s=>h.clock.time-s.started<=4000));
  h.pool.stop(); assert.equal(h.clock.tasks.size, 0);
});
test('claimed clip retains all chunks from one session including header and early footage', async () => {
  const h = harness(); h.pool.start(h.stream); h.clock.advance(6400);
  const selected = h.pool.take(); assert.equal(selected.started, 4000);
  assert.ok(Math.abs(selected.preRollSeconds-2.4)<1e-9); assert.equal(selected.preRollState, 'buffered');
  selected.recorder.emit('AFTER TRIGGER|'); h.clock.advance(2200); await selected.stop();
  const text = await new Blob(selected.chunks).text();
  assert.equal(text, `HEADER:${selected.recorder.id}|AFTER TRIGGER|TAIL:${selected.recorder.id}`);
  h.pool.stop();
});
test('early trigger uses a shorter existing lead-in and labels warm-up honestly', async () => {
  const h = harness(); h.pool.start(h.stream); h.clock.advance(300);
  const selected = h.pool.take(); assert.equal(selected.preRollState, 'warming-up');
  assert.equal(selected.preRollSeconds, .3); assert.equal(selected.preRollRequestedSeconds, 2);
  await selected.stop(); h.pool.stop();
});
test('stopping idle buffering never stops a claimed shot or shared camera tracks', async () => {
  const h=harness();h.pool.start(h.stream);h.clock.advance(3400);const s=h.pool.take();
  h.pool.stop(); assert.equal(s.recorder.state, 'recording');assert.equal(h.pool.sessions.length,0);
  await s.stop();assert.ok(s.bytes>0);assert.equal(h.clock.tasks.size,0);
});
test('different camera stream discards old frames rather than reusing old pre-roll', () => {
  const h=harness();h.pool.start(h.stream);h.clock.advance(2500);const old=[...h.pool.sessions];
  const stream={active:true};h.pool.start(stream);
  assert.ok(old.every(s=>s.discarded&&s.bytes===0&&s.chunks.length===0));
  assert.equal(h.pool.sessions.length,1);assert.equal(h.pool.sessions[0].recorder.stream,stream);h.pool.stop();
});
test('encoder allocation failure disables buffering without a retry loop', () => {
  const h=harness({failAfter:1});h.pool.start(h.stream);h.clock.advance(8000);
  assert.equal(h.pool.running,false);assert.equal(h.failures.length,1);assert.match(h.pool.failure,/encoder/);
  assert.equal(h.pool.sessions.length,0);assert.equal(h.clock.tasks.size,0);assert.equal(h.pool.take(),null);
});
test('idle memory limit discards unused chunks and disables buffering', () => {
  const h=harness({idleBytes:32});h.pool.start(h.stream);const first=h.pool.sessions[0];
  first.recorder.emit('x'.repeat(100));
  assert.equal(h.pool.running,false);assert.equal(first.bytes,0);assert.equal(first.chunks.length,0);
  assert.equal(h.failures.length,1);assert.equal(h.clock.tasks.size,0);
});
test('unready encoders cannot be claimed and time out without growing the pool', () => {
  const h=harness({delayed:true});h.pool.start(h.stream);h.clock.advance(100);
  assert.equal(h.pool.take(),null);h.clock.advance(4500);
  assert.equal(h.pool.running,false);assert.equal(h.failures.length,1);assert.equal(h.pool.sessions.length,0);
});
test('recording errors on a claimed clip preserve its prefix and mark it incomplete', async () => {
  const h=harness();h.pool.start(h.stream);h.clock.advance(2100);const s=h.pool.take();
  s.recorder.onerror({error:Error('encoder failed')});await s.finished;
  assert.equal(s.error,true);assert.match(await new Blob(s.chunks).text(),/^HEADER/);
  assert.equal(h.pool.running,true);h.pool.stop();
});
test('stop is idempotent and stop-timeout finalizes incomplete footage instead of hanging', async () => {
  const h=harness();const s=createCapture(h.stream,h.options);s.claimed=true;
  s.recorder.stop=()=>{s.recorder.state='inactive';};
  assert.equal(s.stop(),s.stop());h.clock.advance(4000);await s.finished;
  assert.equal(s.completed,true);assert.equal(s.error,true);assert.match(s.errorMessage,/timed out/);
  assert.equal(h.clock.tasks.size,0);
});
test('late recorder callbacks cannot refill discarded idle memory', () => {
  const h=harness();h.pool.start(h.stream);const s=h.pool.sessions[0],late=s.recorder.ondataavailable;
  h.pool.stop();late({data:new Blob(['unexpected late frames'])});assert.equal(s.bytes,0);assert.deepEqual(s.chunks,[]);
});
test('inactive streams reject capture without opening an encoder', () => {
  const h=harness();assert.throws(()=>createCapture({active:false},h.options),/active video/);assert.equal(h.instances.length,0);
});
test('a second shot can claim independent lead-in while the first file finalizes', async () => {
  const h=harness();h.pool.start(h.stream);h.clock.advance(4900);const a=h.pool.take();
  h.clock.advance(2100);const b=h.pool.take();assert.notEqual(a.recorder,b.recorder);
  assert.ok(b.preRollSeconds>=2);a.recorder.emit('SHOT ONE|');b.recorder.emit('SHOT TWO|');
  await a.stop();await b.stop();assert.ok(!(await new Blob(a.chunks).text()).includes('SHOT TWO'));h.pool.stop();
});
