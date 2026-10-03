/** Bounded pre-roll made from overlapping COMPLETE MediaRecorder sessions.
 * Never splice timeslice blobs or concatenate recordings: those are not required
 * to decode independently. A claimed session continues, then exports all of its
 * own chunks, including the container header. No audio or network calls here.
 * Spec: https://www.w3.org/TR/mediastream-recording/#mediarecorder-methods
 */
const MB = 1024 * 1024;
export const PRE_ROLL_MS = 2000;

export function createCapture(stream, {
  Recorder = globalThis.MediaRecorder,
  now = () => performance.now(),
  sourceTime = () => 0,
  setTimer = setTimeout, clearTimer = clearTimeout,
  maxBytes = 64 * MB,
  onError = () => {}, onStop = () => {}, onData = () => {}
} = {}) {
  if (!Recorder || !stream?.active) throw Error('No active video stream for recording.');
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(m => Recorder.isTypeSupported(m));
  const recorder = new Recorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6000000 });
  const s = { recorder, mime, chunks: [], bytes: 0, started: now(), sourceStart: sourceTime(), ready: false,
    claimed: false, discarded: false, stopping: false, completed: false, error: false, errorMessage: null,
    preRollSeconds: 0, preRollRequestedSeconds: 0, triggerSourceTime: null, stoppedAt: null };
  let resolve, watchdog;
  s.finished = new Promise(r => { resolve = r; });
  const complete = () => {
    if (s.completed) return;
    s.completed = true; s.ready = false; s.stoppedAt ??= now(); clearTimer(watchdog);
    recorder.onstart = recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
    if (s.discarded) { s.chunks = []; s.bytes = 0; }
    onStop(s); resolve(s);
  };
  s.stop = () => {
    if (s.completed || s.stopping) return s.finished;
    s.stopping = true; s.stoppedAt = now();
    // Some browser/device failures never deliver stop. Do not leave the UI stuck.
    watchdog = setTimer(() => { s.error = true; s.errorMessage ||= 'Recorder stop timed out'; complete(); }, 4000);
    try { if (recorder.state !== 'inactive') recorder.stop(); }
    catch (e) { s.error = true; s.errorMessage = e.message; complete(); }
    return s.finished;
  };
  s.discard = () => { s.discarded = true; s.chunks = []; s.bytes = 0; return s.stop(); };
  recorder.onstart = () => { s.ready = true; };
  recorder.ondataavailable = e => {
    if (s.discarded || s.completed || !e.data?.size) return;
    if (s.bytes + e.data.size > s.maxBytes) {
      s.error = true; s.errorMessage = 'Recording memory limit reached';
      onError(s); s.stop(); return;
    }
    s.chunks.push(e.data); s.bytes += e.data.size; onData(s);
  };
  recorder.onerror = e => {
    s.error = true; s.errorMessage = e.error?.message || 'Browser encoder error'; onError(s); s.stop();
  };
  recorder.onstop = complete;
  s.maxBytes = maxBytes;
  try { recorder.start(250); }
  catch (e) { s.error = true; s.discarded = true; complete(); throw e; }
  return s;
}

export class RollingClipBuffer {
  constructor({ now = () => performance.now(), sourceTime = () => 0,
    Recorder = globalThis.MediaRecorder, setTimer = setTimeout, clearTimer = clearTimeout,
    onStatus = () => {}, onError = () => {}, targetMs = PRE_ROLL_MS, idleBytes = 16 * MB } = {}) {
    if (!(targetMs > 0 && idleBytes > 0)) throw Error('Invalid pre-roll limits.');
    Object.assign(this, { now, sourceTime, Recorder, setTimer, clearTimer, onStatus, onError, targetMs, idleBytes });
    this.sessions = []; this.stream = null; this.timer = null; this.failure = null; this.running = false;
  }
  start(stream) {
    if (this.running && this.stream === stream) return;
    this.stop(); this.stream = stream; this.failure = null; this.running = true; this.tick();
  }
  stop() {
    this.running = false; this.clearTimer(this.timer); this.timer = null;
    const old = this.sessions; this.sessions = []; old.forEach(s => s.discard());
    this.stream = null; this.publish();
  }
  fail(message) {
    if (this.failure) return;
    this.failure = message; this.stop(); this.onError(message);
  }
  eligible() { return this.sessions.filter(s => s.ready && !s.stopping && !s.completed && !s.error && s.recorder.state === 'recording'); }
  tick() {
    this.clearTimer(this.timer); this.timer = null;
    if (!this.running) return;
    const now = this.now();
    const mature = this.eligible().filter(s => now - s.started >= this.targetMs).at(-1);
    // Retire the older complete session ONLY once its replacement has matured.
    if (mature) {
      this.sessions = this.sessions.filter(s => {
        if (s.started < mature.started) { s.discard(); return false; } return true;
      });
    }
    const newest = this.sessions.at(-1);
    if ((!newest || now - newest.started >= this.targetMs) && this.sessions.length < 2) {
      try {
        const capture = createCapture(this.stream, {
          Recorder: this.Recorder, now: this.now, sourceTime: this.sourceTime,
          setTimer: this.setTimer, clearTimer: this.clearTimer, maxBytes: this.idleBytes,
          onError: s => { if (!s.claimed && !s.discarded) this.fail(s.errorMessage); },
          onStop: s => { if (!s.claimed && !s.discarded && this.running) this.fail(s.errorMessage || 'Pre-roll recorder stopped unexpectedly'); }
        });
        if (!this.running) { capture.discard(); return; }
        this.sessions.push(capture);
      } catch (e) { this.fail(e.message); return; }
    }
    if (this.sessions.some(s => !s.ready && now - s.started > 4000)) { this.fail('Pre-roll encoder did not become ready'); return; }
    this.publish(); this.timer = this.setTimer(() => this.tick(), 250);
  }
  take() {
    if (!this.running) return null;
    const now = this.now(), choices = this.eligible();
    const chosen = choices.filter(s => now - s.started >= this.targetMs).at(-1) || choices[0];
    if (!chosen) return null;
    chosen.claimed = true; chosen.maxBytes = 64 * MB;
    chosen.preRollRequestedSeconds = this.targetMs / 1000;
    chosen.triggerSourceTime = this.sourceTime();
    // Source-presentation time is approximate, not a sensor timestamp. Both the
    // recording origin and trigger origin are exported; tests inspect pixels.
    chosen.preRollSeconds = Math.max(0, chosen.triggerSourceTime - chosen.sourceStart);
    chosen.preRollState = chosen.preRollSeconds >= this.targetMs / 1000 ? 'buffered' : 'warming-up';
    this.sessions = this.sessions.filter(s => s !== chosen);
    this.tick(); return chosen;
  }
  publish() {
    const available = this.eligible();
    this.onStatus({ running: this.running, failure: this.failure, sessions: this.sessions.length,
      bytes: this.sessions.reduce((n, s) => n + s.bytes, 0),
      seconds: available.length ? Math.max(0, (this.now() - available[0].started) / 1000) : 0,
      ready: available.some(s => this.now() - s.started >= this.targetMs) });
  }
}
