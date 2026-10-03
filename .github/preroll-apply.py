from pathlib import Path
root=Path.cwd();p=root/'src/app.js';s=p.read_text()
def rep(a,b):
 global s
 assert a in s,a[:150]
 s=s.replace(a,b,1)
rep("import { scoreSettledBoard } from './auto-referee.js';", "import { scoreSettledBoard } from './auto-referee.js';\nimport { RollingClipBuffer, createCapture } from './clip-buffer.js';")
rep('const guide = new CalibrationGuide({', '''const clipBuffer = new RollingClipBuffer({
  sourceTime: () => Number.isFinite(video.currentTime) ? video.currentTime : state.time,
  onStatus: status => {
    const label = $('buffer-status');
    if (!label) return;
    label.textContent = status.failure ? 'Pre-shot buffer unavailable · motion-triggered clips still enabled'
      : !status.running ? 'Pre-shot buffer off'
      : status.ready ? `Pre-shot buffer ready · about ${status.seconds.toFixed(1)} s retained locally`
      : 'Pre-shot buffer warming up · early shots have a shorter lead-in';
    label.dataset.ready = String(!!status.ready);
  },
  onError: message => notify(`Pre-shot buffering stopped: ${message}. Automatic clips can still start on motion; manual recording is unchanged.`, true)
});
function syncClipBuffer() {
  const enabled = state.mode === 'camera' && state.stream?.active && readyToTrack() && !document.hidden
    && !state.calibrationPoints && state.sampleTeam === null && !state.smartBusy
    && $('auto-clips').checked && $('pre-roll').checked && !(state.recording && !state.recording.auto)
    && canAddClip(0, true);
  if (!enabled) { if (clipBuffer.running) clipBuffer.stop(); }
  else if (!clipBuffer.running && !clipBuffer.failure) clipBuffer.start(state.stream);
}
const guide = new CalibrationGuide({''')
rep('function configureWorker() {', 'function configureWorker() {\n  clipBuffer.stop(); // Never keep lead-in footage from a different calibration/source generation.')
rep("  $('record-hint').textContent = state.mode === 'demo' ? 'Demo is synthetic. Connect a camera to record real evidence.' : !window.MediaRecorder ? 'Recording is unavailable in this browser. You can still import clips.' : $('auto-clips')?.checked ? 'Auto clips start when puck motion is detected and stop after the board settles. Manual record remains available.' : 'Manual clip mode: start before shooting. Clips stop after 30 seconds.';",
"  $('record-hint').textContent = state.mode === 'demo' ? 'Demo is synthetic. Connect a camera to record real evidence.' : !window.MediaRecorder ? 'Recording is unavailable in this browser. You can still import clips.' : $('auto-clips')?.checked ? ($('pre-roll').checked ? 'Auto clips retain the pre-shot lead-in once warmed up, then finish after settlement. Buffer status is in setup.' : 'Auto clips start on detected motion; pre-shot buffering is off.') : 'Manual clip mode: start before shooting. Clips stop after 30 seconds.';\n  syncClipBuffer();")
rep("function stopSource() {\n  if (state.recording)","function stopSource() {\n  if (state.recording)") # verify known entry
rep("  guide.cancel();\n  exitPreview();", "  clipBuffer.stop(); clipBuffer.failure = null;\n  guide.cancel();\n  exitPreview();")
start=s.index('function startClip(options = {}) {');end=s.index('function finishClip() {',start)
s=s[:start]+'''function startClip(options = {}) {
  const auto = !!options.auto, shotNumber = Number.isInteger(options.shotNumber) ? options.shotNumber : null;
  if (state.mode !== 'camera' || !state.stream || state.recording || !window.MediaRecorder || !canAddClip(0)) return false;
  let capture;
  try {
    if (auto && $('pre-roll').checked) capture = clipBuffer.take();
    if (!capture) {
      // Manual clips and unsupported/warming-up buffering retain the original
      // motion-triggered recording fallback, with honest zero pre-roll metadata.
      if (!auto) clipBuffer.stop();
      capture = createCapture(state.stream, { sourceTime: () => video.currentTime });
      capture.claimed = true;
      capture.preRollState = auto && $('pre-roll').checked ? 'unavailable' : 'off';
      capture.preRollRequestedSeconds = auto && $('pre-roll').checked ? 2 : 0;
      capture.triggerSourceTime = video.currentTime;
    }
    capture.maxBytes = Math.min(MAX_CLIP, MAX_TOTAL - state.clips.reduce((n,c) => n + c.blob.size, 0));
    if (capture.bytes > capture.maxBytes) { capture.discard(); notify('Not enough clip storage for the pre-shot buffer. Export and remove existing clips.', true); return false; }
    const record = Object.assign(capture, {
      contacts: state.contacts.filter(e => e.to >= capture.sourceStart), trackingGaps: 0,
      snapshot: configSnapshot(), round: state.round, epoch: state.generation,
      auto, shotNumber, autoResult: null
    });
    state.recording = record;
    record.done = capture.finished.then(() => {
      clearTimeout(record.timer);
      const duration = Math.max(0, (record.stoppedAt - record.started) / 1000);
      const blob = new Blob(record.chunks, { type: record.recorder.mimeType || record.mime || 'video/webm' });
      const title = record.auto ? `Shot ${record.shotNumber ?? '?'} · Auto` : `Shot ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const added = blob.size && addClip(blob, {
        title, round: record.round, source: record.auto ? 'camera-auto' : 'camera', duration,
        complete: !record.error && (!record.auto || !!record.autoResult),
        preRollSeconds: record.preRollSeconds, preRollRequestedSeconds: record.preRollRequestedSeconds,
        preRollState: record.preRollState, recordingError: record.errorMessage,
        contacts: record.contacts.map(e => ({ ...e, from: Math.max(0, e.from - record.sourceStart), to: Math.max(0, e.to - record.sourceStart) })),
        trackingGaps: record.trackingGaps, configuration: record.snapshot,
        timing: { observedFps: state.fps, analysedFps: state.analysisFps,
          maxObservedGapMs: state.gaps.length ? Math.max(...state.gaps) * 1000 : null,
          sourceStart: record.sourceStart, triggerSourceTime: record.triggerSourceTime,
          origin: 'approximate source presentation time; not sensor time',
          preRollMethod: record.preRollSeconds > 0 ? 'complete-overlapping-recorder-session' : 'none' },
        autoResult: record.autoResult, autoTriggered: record.auto, shotNumber: record.shotNumber
      });
      record.chunks = []; // Blob now owns the saved bytes; drop session references.
      if (state.recording === record) state.recording = null;
      updateControls();
      if (added && record.error) notify('An incomplete clip was retained. Review it before relying on the footage.', true);
      else if (added && !record.auto) notify('Clip retained in this tab. Open Review to replay it or export the original video.');
      else if (!blob.size) notify('The recording contained no video data. Please try another capture mode.', true);
    });
    record.timer = setTimeout(() => { record.error = true; record.errorMessage ||= 'Clip time limit reached'; if (state.recording === record) finishClip(); }, auto ? 15000 : 30000);
    updateControls();
    if (auto) $('auto-status').textContent = `Shot ${shotNumber} detected · recording with ${record.preRollSeconds.toFixed(1)} s estimated lead-in`;
    else notify('Recording now. Take the shot, then press Finish clip. No automatic legal/foul verdict will be applied.');
    return true;
  } catch (error) {
    capture?.discard(); state.recording = null; updateControls();
    notify(`Recording could not start: ${error.message}`, true); return false;
  }
}
''' +s[end:]
rep("  if (r.recorder.state !== 'inactive') r.recorder.stop();", "  r.stop();")
rep("${c.autoTriggered ? ' · AUTO CLIP' : ''}${c.autoResult?.score ?", "${c.autoTriggered ? ' · AUTO CLIP' : ''}${c.preRollSeconds > 0 ? ` · ~${c.preRollSeconds.toFixed(1)}s lead-in` : ''}${c.autoResult?.score ?")
rep("  if (c.autoResult?.score) {", "  if (c.autoTriggered) { const p = document.createElement('p'); p.textContent = `Pre-shot lead-in: approximately ${(c.preRollSeconds || 0).toFixed(1)} s (${c.preRollState || 'off'}). Event times include that lead-in and are not sensor timestamps.`; $('replay-events').append(p); }\n  if (c.autoResult?.score) {")
rep("$('auto-clips').onchange = () => {if(!$('auto-clips').checked&&state.recording?.auto)finishClip();updateControls();};", "$('auto-clips').onchange = () => {if(!$('auto-clips').checked&&state.recording?.auto)finishClip();clipBuffer.failure=null;updateControls();};\n$('pre-roll').onchange = () => {clipBuffer.failure=null;syncClipBuffer();updateControls();};")
rep("window.addEventListener('pagehide', () => { state.stream?.getTracks().forEach(t => t.stop()); });", "window.addEventListener('pagehide', () => { clipBuffer.stop(); state.stream?.getTracks().forEach(t => t.stop()); });")
# Re-enable idle buffering when user removes a saved clip that had filled the library.
rep("state.clips = state.clips.filter(v => v.id !== c.id); renderClips();", "state.clips = state.clips.filter(v => v.id !== c.id); renderClips(); updateControls();")
p.write_text(s)
p=root/'index.html';s=p.read_text()
rep('<p id="auto-status"', '<label class="toggle-row"><input id="pre-roll" type="checkbox" checked><span><b>Include pre-shot footage</b><small>Rolling local buffer: about 2–4 seconds once warm. Uses extra video encoding; discard unused footage automatically.</small></span></label><p id="buffer-status" class="small-status" data-ready="false">Pre-shot buffer off</p><p id="auto-status"')
rep('./src/app.js?referee=2','./src/app.js?buffer=1')
p.write_text(s)
p=root/'package.json';s=p.read_text().replace('node --check src/visibility.js','node --check src/visibility.js && node --check src/clip-buffer.js');p.write_text(s)

from pathlib import Path
r=Path.cwd()
p=r/'README.md';s=p.read_text().replace('Camera clips can start on detected motion and stop after the board settles; manual recording remains available.', 'Camera clips retain an optional rolling pre-shot lead-in (nominally 2–4 seconds after warm-up) and stop after the board settles; manual recording remains available.').replace('Auto clips currently begin after motion is detected, so true pre-roll is not implemented.', 'Buffered clips include pre-trigger frames when the buffer is ready. Early shots can have a shorter lead-in, and unavailable/disabled buffering falls back to recording on motion. Pre-roll uses additional local video encoders; actual frame delivery and encoded lead-in must be checked on the physical computer.').replace('See [setup and click instructions](docs/QUICKSTART.md)', 'See [pre-shot buffering](docs/BUFFERING.md), [setup and click instructions](docs/QUICKSTART.md)');p.write_text(s)
p=r/'docs/QUICKSTART.md';s=p.read_text();old='With **Auto clips** enabled on a live camera, recording starts when the shot detector sees puck motion and stops shortly after the board settles. This reuses the same browser MediaRecorder path as manual clips. It does **not** yet include true pre-roll, so the first movement frame may precede the recorded clip by a small detection/recorder delay. Manual recording remains available.';assert old in s
s=s.replace(old,'With **Auto clips** and **Include pre-shot footage** enabled, the app keeps a small rolling video buffer locally once tracking is ready. Wait for **Pre-shot buffer ready** before the first shot. When motion is detected, a recording that was already running is retained and continues through settlement. Its nominal lead-in is about 2–4 seconds; the actual estimated lead-in is shown on the clip and in Review. Early shots can have a shorter lead-in. When buffering is off or unavailable, automatic clips still start on motion, with zero pre-roll clearly recorded. Manual clips remain available.\n\nUnused buffer footage is discarded, not uploaded or added to the shot library. Turning off the pre-shot option releases the idle encoders without deleting saved clips. Disconnecting, changing calibration/source, or hiding the tab discards stale idle footage. The buffer uses extra video encoding; turn off **Include pre-shot footage** if your computer cannot sustain capture and analysis. See [buffering details and test boundaries](BUFFERING.md).')
s=s.replace('With **Auto clips** enabled, live-camera clips start from detected puck motion and stop after settlement.', 'With **Auto clips** enabled, live-camera clips are retained on detected motion and stop after settlement; enabled, warmed-up buffering also includes the pre-shot lead-in.')
p.write_text(s)
p=r/'docs/BUFFERING.md';p.write_text('''# Pre-shot buffering

## Scope and preserved baseline

This change starts from deployed `3afc3d757c99cb05e0957662c0a0348f95b46fdb`. Scoring, tracker, calibration mathematics, colour detection, foul/20 review gates, manual score ledger and existing replay controls are unchanged. This is a recording improvement, not new physical-camera accuracy evidence. There is no user-approved visual checkpoint to invent.

## Recording method

Once a real camera is connected, tracking is ready, and both Auto clips and Include pre-shot footage are enabled, at most two short idle MediaRecorder sessions overlap. One new session starts about every two seconds. The older session is discarded only when a replacement has at least two seconds of lead-in. On shot detection, a ready session is claimed and continues through settlement; the entire session, including all original header and timeslice chunks, becomes one clip. During an active shot there can be one claimed recorder plus two idle recorders.

No arbitrary timeslice fragments are joined, no encoded timestamps are rewritten, and no frames are synthesized. The [W3C recording specification](https://www.w3.org/TR/mediastream-recording/#mediarecorder-methods) requires all blobs from a completed recording to be playable together; it does not require every timeslice blob to be independently playable. Complete overlapping sessions avoid depending on unsupported fragment splicing or a new muxing dependency.

The target lead-in is two seconds, nominally two to four depending on rotation timing. It is NOT an exact sensor-timestamp guarantee. The displayed/JSON lead-in is estimated from video presentation times; browser encoder start delay and frame loss can reduce actual coverage. Warm-up and fallback are labelled explicitly. No promise that every flick or contact will be captured.

## Resource and lifecycle bounds

Idle buffer chunks are capped at 16 MiB per session (two sessions, at most 32 MiB in retained JS blobs; this is not a bound on the browser's internal encoder memory). A claimed clip uses the existing 64 MiB cap and shares the existing 256 MiB saved-clip budget. Clips are not evicted silently. Byte/time/encoder failures mark evidence incomplete. Stop has a bounded four-second watchdog to avoid leaving controls permanently busy.

The buffer shares the existing video-only stream and does not request another camera or microphone permission. Idle data is discarded when disabled, hidden, disconnected, recalibrated or switched to another source. Saved clips are unaffected. Encoder allocation failure disables pre-roll for that session and leaves motion-triggered/manual capture available; toggle the pre-shot option or reconnect to retry. Extra encoding may reduce performance on older hardware.

## Verification gate

Dependency-free tests exercise rotation, complete prefixes, warm-up, multiple shots, byte caps, encoder failures, stop/discard cleanup, inactive streams, late callbacks and watchdogs. Existing scoring/calibration tests must remain passing. Browser tests additionally encode a binary clock into synthetic camera pixels OUTSIDE the board, then decode that clock from saved video after several buffer rotations. The test must show frames at least 1.5 seconds before the actual scripted flick, not merely plausible metadata. Two successive clips are checked in both overhead and angled views, alongside existing trigger-only and manual recording regressions. Exported synthetic clips and JSON evidence are retained by CI for inspection.

No real-board video was found in the current conversation or Library during this task; supplied still images do not validate shot timing. A real webcam video is still required for physical validation, and must not be committed to this public repository without explicit permission. New source changes and passing unit tests are not a deployment: check the exact PR, main workflow and published build-info before reporting release.
''')
p=r/'docs/HANDOFF.md';s=p.read_text();s='''# Current handoff — pre-shot buffering

Current recording baseline: deployed `3afc3d757c99cb05e0957662c0a0348f95b46fdb` (PR #6). Pre-roll work is on `feature/buffered-shot-clips`. See `docs/BUFFERING.md` for the design, limits and release gates. Do not confuse a branch or a documentation statement with a verified Pages deployment.

Keep the existing board UI and all scoring/calibration/tracking code unchanged for this recording change. Add only the pre-shot option, buffer status and clip lead-in metadata. Complete overlapping recording sessions preserve the container header; do not concatenate arbitrary video chunks. Actual pixel-decoded pre-flick frames are required in browser evidence.

Real webcam video was not found in this conversation or Library. Physical Logitech performance, occlusion, disc contacts and 20s remain unverified. Request a recording for that test; do not treat synthetic camera or still-image success as real-game validation. Never commit room footage publicly without specific permission.

The source transport workflow is branch-only and is removed before release. Run the full Node and browser suites, inspect recorded proof/screenshots, compare the exact release tree and verify Pages build-info. No opportunistic scoring changes, UI redesign, dependency changes or automatic legal/foul decisions.

## Earlier automation review (historical)

'''+s.split('\n',1)[1];p.write_text(s)

p=root/'src/app.js';s=p.read_text();s=s.replace('worker.terminate(); worker = null; return;', 'worker.terminate(); worker = null; clipBuffer.stop(); return;',1);s=s.replace("worker = null; notify('Vision worker unavailable.","worker = null; clipBuffer.stop(); notify('Vision worker unavailable.",1);p.write_text(s)
p=root/'index.html';s=p.read_text().replace('Start on detected motion and stop after settlement. No pre-roll yet.','Keep detected shots and finish after settlement. Optional pre-shot buffer below.');p.write_text(s)
p=root/'tests/synthetic_camera.js';s=p.read_text();s=s.replace("const fixture={mode:'setup',start:null,secondStart:null,angled:false};", "const fixture={mode:'setup',start:null,secondStart:null,angled:false,evidenceClock:false,recorders:[]};\n  const NativeRecorder=window.MediaRecorder;\n  window.MediaRecorder=class extends NativeRecorder {\n    constructor(...args){super(...args);if(fixture.evidenceClock)fixture.recorders.push(this);}\n  };")
s=s.replace("\n  };\n  draw();setInterval(draw,1000/30);", """
    // Test-only pixel clock OUTSIDE the scoring area. The decoder reads these
    // 24 bits from saved video, independently of the app's pre-roll metadata.
    if(fixture.evidenceClock){
      ctx.setTransform(1,0,0,1,0,0);
      const ticks=Math.floor(performance.now()/10);
      for(let i=0;i<24;i++){
        ctx.fillStyle=(ticks>>i)&1?'#fff':'#000';ctx.fillRect(8+i*12,8,10,14);
      }
    }
  };
  draw();setInterval(draw,1000/30);""")
p.write_text(s)
p=root/'tests/browser_smoke.py';s=p.read_text();old="        ap.goto(base,wait_until='networkidle')\n        ap.evaluate('(angled)=>{window.syntheticCamera.angled=angled;}',angled)";assert old in s
s=s.replace(old,"        ap.goto(base,wait_until='networkidle')\n        ap.locator('#pre-roll').uncheck() # Keep the existing trigger-only fallback regression.\n        ap.evaluate('(angled)=>{window.syntheticCamera.angled=angled;}',angled)")
marker='    mobile=context.new_page()';assert s.count(marker)==1;s=s.replace(marker,Path('.github/preroll-browser-block.txt').read_text()+'\n'+marker);p.write_text(s)
p=root/'.github/workflows/pages.yml';s=p.read_text().replace('            test-results/*.png','            test-results/*.png\n            test-results/preroll-*.webm');p.write_text(s)
(root/'.github/workflows/preroll-review-source.yml').unlink()
