import test from 'node:test';
import assert from 'node:assert/strict';
import { RollingClipBuffer } from '../src/clip-buffer.js';

test('default window timer functions never receive the buffer object as their receiver', () => {
  const set = globalThis.setTimeout, clear = globalThis.clearTimeout;
  const timers = new Map(); let sequence = 0;
  globalThis.setTimeout = function (fn, ms) {
    assert.ok(this === undefined || this === globalThis, 'setTimeout received a non-window receiver');
    const id = ++sequence; timers.set(id, {fn, ms}); return id;
  };
  globalThis.clearTimeout = function (id) {
    assert.ok(this === undefined || this === globalThis, 'clearTimeout received a non-window receiver');
    timers.delete(id);
  };
  class Recorder {
    static isTypeSupported = () => true;
    state = 'inactive';
    start() { this.state = 'recording'; this.onstart?.(); }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  try {
    const pool = new RollingClipBuffer({Recorder, now: () => 0});
    pool.stop(); // Also used by Finish round while no camera is connected.
    pool.start({active: true});
    assert.equal(pool.running, true); assert.equal(timers.size, 1);
    pool.stop(); assert.equal(pool.running, false); assert.equal(timers.size, 0);
  } finally { globalThis.setTimeout = set; globalThis.clearTimeout = clear; }
});
