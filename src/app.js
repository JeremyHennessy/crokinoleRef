import { VERSION, clamp, makeCalibration, scaleCalibration, roundResult, captureConstraints, averageColor } from './core.js';
import { CalibrationGuide } from './calibration-guide.js';
import { projectPoint, samplingMatrix } from './perspective.js';
import { autoCalibrateFrame, scaleAutoProjectionToSource } from './auto-calibration.js';
import { scoreSettledBoard } from './auto-referee.js';
import { RollingClipBuffer, createCapture } from './clip-buffer.js';
import { installGameAutomation } from './game-automation.js';
import { installReviewControls } from './review-controls.js';
import { invalidateBoardCorrections, validBoardCorrections } from './board-corrections.js';
import { DiagnosticLog, diagnosticJSON } from './diagnostics.js';
import { installLibraryControls } from './library-controls.js';
import { FullRoundDemo } from './full-round-demo.js?physics=1';
import { DEMO_BOARD } from './demo-physics.js?physics=1';
const $ = id => document.getElementById(id);
const board = $('board'), ctx = board.getContext('2d');
const video = $('source-video'), raw = document.createElement('canvas'), rawCtx = raw.getContext('2d', { willReadFrequently: true });
const small = document.createElement('canvas'), smallCtx = small.getContext('2d', { willReadFrequently: true });
const smart = document.createElement('canvas'), smartCtx = smart.getContext('2d', { willReadFrequently: true });
const MB = 1024 * 1024, MAX_CLIP = 64 * MB, MAX_TOTAL = 256 * MB, MAX_CLIPS = 120;
let previewMatch = null;
let game, reviewControls, library, fullDemo;
const diagnostics=new DiagnosticLog();
const state = { matchId:crypto.randomUUID(),storageReady:false,lastVisibility:null,clusterCandidates:[], mode: 'idle', token: 0, generation: 0, stream: null, sourceURL: null, callback: null, raf: null, calibration: null, projection: null, background: null, colors: [null, null], discs: [], contacts: [], calibrationPoints: null, sampleTeam: null, smartBusy: false, inflight: false, time: 0, lastTime: null, gaps: [], observed: 0, analysed: 0, statStart: performance.now(), fps: 0, analysisFps: 0, clips: [], selected: null, recording: null, settings: {}, names: ['Team A', 'Team B'], scores: [0, 0], totals: [0, 0], rounds: [], undo: [], round: 1, demoStart: 0, auto: { corrections:[],twenties: [0, 0], adjustments: [0, 0], reviewHold: false, awaitingClear: false, shotCount: 0, activeShotNumber: null, lastResult: null, lastLiveScore: null, stopTimer: null } };
const clipBuffer = new RollingClipBuffer({
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
const guide = new CalibrationGuide({
  getFrame: () => { if (['camera', 'file'].includes(state.mode) && video.readyState >= 2) rawCtx.drawImage(video, 0, 0, raw.width, raw.height); return raw; },
  onOpen: () => { state.calibrationPoints = []; state.sampleTeam = null; $('stage').classList.remove('calibrating'); updateControls(); },
  onCancel: () => { state.calibrationPoints = null; $('stage-hint').textContent = 'Calibration cancelled. The previous calibration is unchanged.'; configureWorker(); ctx.drawImage(raw, 0, 0); drawOverlay(); },
  onApply: ({ calibration, projection, confidence, diagnostics }) => {
    state.calibration = calibration; state.projection = projection ? { ...projection, ...(Number.isFinite(confidence) ? { autoConfidence: confidence, autoDiagnostics: diagnostics } : {}) } : projection; state.calibrationPoints = null; state.background = null; state.colors = [null, null];
    $('stage-hint').textContent = 'Geometry set. Clear all pucks and hands, then save the empty board.';
    configureWorker(); ctx.drawImage(raw, 0, 0); drawOverlay();
    notify(Number.isFinite(confidence) ? 'Smart calibration applied. Clear the board for a new background; the fit indicator is a heuristic, not an accuracy probability.' : projection ? 'Board-plane perspective correction applied. Clear the board for a new background. Hidden pucks, lens distortion and raised puck/peg surfaces remain limitations.' : 'Overhead calibration applied. Clear the board, save its empty view, then sample both puck colours.');
  }
});
let worker;
try {
  worker = new Worker(new URL('./vision-worker.js?reliability=1', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: m }) => {
    if (m.generation !== state.generation) return;
    state.inflight = false;
    if (m.type === 'error') { notify(`Tracking stopped: ${m.message}. Recording and manual scoring remain available.`, true); worker.terminate(); worker = null; clipBuffer.stop(); return; }
    if(m.type==='colours'){game.colours(m);return;}
    state.lastVisibility=m.visibility;state.clusterCandidates=m.detectionEvidence?.clusterCandidates||[];
    if(m.visibility?.viewObstructed&&!fullDemo?.active)state.auto.reviewHold=true;
    state.analysed++; state.discs = m.discs;
    $('disc-count').textContent = String(m.discs.length);
    for (const event of m.contacts) {
      state.contacts.push(event); state.contacts = state.contacts.slice(-100);
      if (state.recording && state.recording.contacts.length < 200) state.recording.contacts.push(event);
    }
    if (m.discontinuity && state.recording) state.recording.trackingGaps++;
    if (m.contacts.length) {
      const e = m.contacts[0]; $('contact-status').textContent = `${state.mode === 'demo' ? 'SIMULATED · ' : ''}Possible contact: disc ${e.ids[0]} ↔ ${e.ids[1]}. Proximity only; impact and first-contact order need human review.`;
    }
    // Scripted demonstration scores are explicitly separate from vision evidence.
    if (fullDemo?.active) { diagnostics.push(m); return; }
    if (m.auto) handleAutoUpdate(m.auto);
    diagnostics.push(m);game.onFrame(m);renderPlayStatus();
  };
  worker.onerror = () => { state.inflight = false; worker?.terminate(); worker = null; clipBuffer.stop(); notify('Vision worker unavailable. Camera, replay and manual scoring can still be used.', true); };
} catch { notify('This browser cannot start the tracking worker. Recording and manual scoring remain available.', true); }
function notify(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function configSnapshot() { return { analysisFixture:state.background?{width:small.width,height:small.height,calibration:analysisCalibration(),background:state.background,warpMatrix:state.projection?samplingMatrix(state.projection,small.width/board.width):null}:null, calibration: state.calibration, projection: state.projection, analysisCoordinates: state.projection ? 'rectified-board-plane-640' : 'scaled-camera-image', colors: state.colors, tolerance: +$('tolerance').value, source: state.mode, cameraReports: state.settings, version: VERSION }; }
// All detected discs use analysis-image coordinates, never the full camera frame.
function analysisCalibration() {
  if (!state.calibration) return null;
  return state.projection ? state.calibration : scaleCalibration(state.calibration, small.width / board.width);
}
function configureWorker() {
  reviewControls?.cancel();state.auto.corrections=invalidateBoardCorrections(state.auto.corrections||[]);
  game?.onReconfigure();
  clipBuffer.stop(); // Never keep lead-in footage from a different calibration/source generation.
  state.auto.activeShotNumber=null;
  state.auto.lastLiveScore=null;state.clusterCandidates=[];state.lastVisibility=null;
  $('apply-reviewed-score').disabled=true;
  if(state.recording?.auto){state.recording.error=true;finishClip();}
  state.generation++; state.inflight = false; state.discs = []; state.contacts = []; $('disc-count').textContent = '—';
  const scale = small.width / board.width;
  worker?.postMessage({ type: 'configure', generation: state.generation, calibration: analysisCalibration(), warp: state.projection ? { matrix: samplingMatrix(state.projection, scale), width: small.width, height: small.height } : null, requireEmpty: state.auto.awaitingClear, background: state.background, colors: state.colors, autoColours: $('auto-colours').checked, tolerance: +$('tolerance').value });
  $('contact-status').textContent = 'First-contact order is not verified. Proximity candidates are not referee decisions.';
  updateControls();
}
function readyToTrack() { return !!(worker && state.calibration && state.background && state.colors.every(Boolean)); }
function updateControls() {
  const active = state.mode !== 'idle', busy = !!state.recording, calibrating = !!state.calibrationPoints, smartBusy = state.smartBusy;
  $('stop-source').disabled = !active || busy; $('connect').disabled = busy;
  $('record').disabled = state.mode !== 'camera' || busy || calibrating || state.sampleTeam !== null || !window.MediaRecorder;
  $('record').hidden = busy; $('stop-record').hidden = !busy; $('record-label').hidden = !busy;
  $('calibrate').disabled = !active || busy || smartBusy; $('auto-calibrate').disabled = !active || busy || calibrating || smartBusy; $('background').disabled = !state.calibration || busy || calibrating || smartBusy;
  $('sample-a').disabled = !state.background || busy || calibrating; $('sample-b').disabled = !state.background || busy || calibrating;
  ['camera', 'capture-mode', 'calibration-mode', 'import-video', 'import-button', 'tolerance', 'refresh-cameras'].forEach(id => { $(id).disabled = busy || smartBusy; });
  $('demo-round').disabled = busy;
  $('demo').disabled = busy; $('cancel-calibrate').hidden = !calibrating && state.sampleTeam === null;
  $('tracking-status').textContent = !worker ? 'Tracking unavailable in this browser' : readyToTrack() ? 'Continuous puck tracking ready · analysing delivered frames' : !state.calibration ? 'Waiting for calibration' : !state.background ? 'Next: save an empty board' : ($('auto-colours').checked?'Next: show one still puck of each colour':'Next: sample both team colours');
  $('calibration-status').textContent = state.calibration ? `${Number.isFinite(state.projection?.autoConfidence) ? 'Smart fit' : state.projection ? 'Perspective fit' : state.mode === 'demo' ? 'Demo geometry' : 'Overhead fit'} · ${Math.round(state.calibration.discRadius * 2)} px puck diameter${state.projection ? ' in corrected view' : ''}` : state.smartBusy ? 'Finding board automatically…' : 'Not calibrated';
  $('file-controls').hidden = state.mode === 'file' ? false : true;
  $('record-hint').textContent = state.mode === 'demo' ? 'Demo is synthetic. Connect a camera to record real evidence.' : !window.MediaRecorder ? 'Recording is unavailable in this browser. You can still import clips.' : $('auto-clips')?.checked ? ($('pre-roll').checked ? 'Auto clips retain the pre-shot lead-in once warmed up, then finish after settlement. Buffer status is in setup.' : 'Auto clips start on detected motion; pre-shot buffering is off.') : 'Manual clip mode: start before shooting. Clips stop after 30 seconds.';
  syncClipBuffer();renderPlayStatus();
}
function resetStats() { state.lastTime = null; state.time = 0; state.gaps = []; state.observed = state.analysed = 0; state.fps = state.analysisFps = 0; state.statStart = performance.now(); $('observed-fps').textContent = '—'; $('frame-gap').textContent = '—'; }
function resetAutoRound() {
  game?.resetRound();
  state.auto.corrections=[];state.auto.twenties = [0, 0]; state.auto.adjustments=[0,0];state.auto.reviewHold=false;state.auto.awaitingClear=true; state.auto.shotCount = 0; state.auto.activeShotNumber = null; state.auto.lastResult = null; state.auto.lastLiveScore = null;
  configureWorker(); // New generation rejects any late events from the old round.
  if ($('auto-status')) $('auto-status').textContent = readyToTrack() ? 'Ready · watching for puck movement' : 'Waiting for disc tracking';
  if ($('auto-score-detail')) $('auto-score-detail').textContent = '20s: A 0 · B 0';
}
function applyAutomaticScore(event) {
  if (!event.applyScore) state.auto.reviewHold=true;
  let willApply = !!$('auto-scoring')?.checked && event.applyScore && !state.auto.reviewHold && state.mode!=='file';
  for (const twenty of event.twentiesAdded || []) if (twenty.team === 0 || twenty.team === 1) state.auto.twenties[twenty.team]++;
  let score = scoreSettledBoard(event.postDiscs || [], analysisCalibration(), state.auto.twenties, state.auto.adjustments);
  score=reviewControls?.reconcile(score,event.postDiscs||[])||score;willApply=willApply&&!state.auto.reviewHold;
  if(willApply)snapshotScore();
  event.score = score; event.scoreApplied=willApply; state.auto.lastResult = event; state.auto.lastLiveScore = score;
  if ($('auto-score-detail')) $('auto-score-detail').textContent = `Board A ${score.visible[0]} · B ${score.visible[1]} · 20s A ${state.auto.twenties[0]} · B ${state.auto.twenties[1]} · total ${score.totals[0]}–${score.totals[1]}`;
  if (willApply) { state.scores = [...score.totals]; saveMatch(); renderScore(); }
  return score;
}
function handleAutoUpdate(auto) {
  if (!auto || state.calibrationPoints || state.sampleTeam!==null || !readyToTrack()) return;
  if(auto.state==='awaiting-clear'){$('auto-status').textContent='Clear the board for the new round';return;}
  state.auto.awaitingClear=false;
  if (auto.score && auto.state === 'settled') {
    state.auto.lastLiveScore = reviewControls.reconcile(scoreSettledBoard(state.discs, analysisCalibration(), state.auto.twenties, state.auto.adjustments),state.discs);
    if ($('auto-score-detail')) {
      const live = state.auto.lastLiveScore;
      $('auto-score-detail').textContent = `Visible now: A ${live.visible[0]} · B ${live.visible[1]} · confirmed 20s A ${state.auto.twenties[0]} · B ${state.auto.twenties[1]} · total ${live.totals.join('–')}`;
    }
  }
  const event = auto.event;
  if (!event) {
    if(state.lastVisibility?.viewObstructed){$('auto-status').textContent='Review needed · unresolved foreground, touching discs or obstruction. Score held.';return;}
    if ($('auto-status') && readyToTrack() && auto.state === 'moving') $('auto-status').textContent = `Shot in motion · tracking ${state.discs.length} puck${state.discs.length === 1 ? '' : 's'}`;
    else if ($('auto-status') && readyToTrack() && !state.auto.lastResult) $('auto-status').textContent = `Ready · tracking ${state.discs.length} puck${state.discs.length === 1 ? '' : 's'}`;
    return;
  }
  if (event.type === 'shot-start') {
    state.auto.corrections=invalidateBoardCorrections(state.auto.corrections||[]);
    if(state.auto.corrections.some(e=>e.status==='stale'))state.auto.reviewHold=true;
    state.auto.shotCount++; state.auto.activeShotNumber = state.auto.shotCount;
    if ($('auto-status')) $('auto-status').textContent = `Shot ${state.auto.activeShotNumber} detected · tracking movement`;
    if(state.recording?.auto && state.auto.stopTimer){clearTimeout(state.auto.stopTimer);state.auto.stopTimer=null;state.recording.error=true;state.recording.shotNumber=state.auto.activeShotNumber;}
    if ($('auto-clips')?.checked && state.mode === 'camera' && !state.recording) startClip({ auto: true, shotNumber: state.auto.activeShotNumber });
    return;
  }
  if (event.type === 'shot-end') {
    const shotNumber = state.auto.activeShotNumber || state.auto.shotCount || event.shotNumber;
    event.shotNumber = shotNumber;
    const score = applyAutomaticScore(event);
    const evidenceLabel = event.applyScore ? 'visible-board checks passed' : 'review required';
    const reviewBits = [];
    if (event.hadFrameGap) reviewBits.push('frame gap');
    if (event.hadObstruction) reviewBits.push('unexplained foreground/occlusion');
    if (event.unexplainedLosses?.length) reviewBits.push('lost puck');
    if (score.review) reviewBits.push('line/centre call');
    if (event.twentyCandidates?.length && !event.twentiesAdded?.length) reviewBits.push('possible 20');
    if ($('auto-status')) $('auto-status').textContent = event.scoreApplied
      ? `Shot ${shotNumber} settled · auto score ${score.totals[0]}–${score.totals[1]} · ${evidenceLabel}${reviewBits.length ? ' · review ' + reviewBits.join(', ') : ''}`
      : `Shot ${shotNumber} settled · score held for review · ${evidenceLabel} · ${reviewBits.join(', ') || 'automatic scoring off or earlier review pending'}`;
    if (state.recording?.auto && state.recording.shotNumber === shotNumber) {
      state.recording.autoResult = { ...event, score };
      if (state.auto.stopTimer) clearTimeout(state.auto.stopTimer);
      state.auto.stopTimer = setTimeout(() => { if (state.recording?.auto && state.recording.shotNumber === shotNumber) finishClip(); }, 350);
    }
    state.auto.activeShotNumber = null;
    $('apply-reviewed-score').disabled=false;
    saveMatch();
  }
}
function enterPreview() {
  game.enterPreview();
  previewMatch=JSON.stringify({names:state.names,scores:state.scores,totals:state.totals,rounds:state.rounds,round:state.round,undo:state.undo,auto:state.auto,mode:$('score-mode').value});
  state.scores=[0,0];state.totals=[0,0];state.rounds=[];state.round=1;state.undo=[];
  state.auto={corrections:[],twenties:[0,0],adjustments:[0,0],reviewHold:false,awaitingClear:false,shotCount:0,activeShotNumber:null,lastResult:null,lastLiveScore:null,stopTimer:null};
  renderScore();
}
function exitPreview() {
  if(!previewMatch)return;
  game.exitPreview();
  const {mode,...saved}=JSON.parse(previewMatch);previewMatch=null;
  Object.assign(state,saved);$('score-mode').value=mode;renderScore();
}
function stopSource() {
  if (state.recording) { notify('Finish the current clip before changing the camera or source.', true); return false; }
  clipBuffer.stop(); clipBuffer.failure = null;
  guide.cancel();
  fullDemo?.stop();
  exitPreview();
  state.token++;
  if (state.callback !== null && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(state.callback);
  if (state.raf !== null) cancelAnimationFrame(state.raf);
  state.callback = state.raf = null;
  state.stream?.getTracks().forEach(t => t.stop()); state.stream = null;
  video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  if (state.sourceURL) URL.revokeObjectURL(state.sourceURL); state.sourceURL = null;
  state.mode = 'idle'; state.projection = null; state.calibration = state.background = state.calibrationPoints = null; state.sampleTeam = null; state.colors = [null, null]; state.settings = {}; state.auto.activeShotNumber = null; if (state.auto.stopTimer) clearTimeout(state.auto.stopTimer); state.auto.stopTimer = null;
  $('stage').classList.remove('calibrating'); $('demo-label').hidden = true; $('welcome').hidden = false;
  $('source-badge').textContent = 'No camera connected'; $('reported-fps').textContent = '—'; $('stage-hint').textContent = 'An angled camera is supported experimentally. Keep the entire scoring circle in view.';
  ctx.clearRect(0, 0, board.width, board.height); resetStats(); configureWorker(); return true;
}
function resize(width, height) {
  board.width = raw.width = width; board.height = raw.height = height;
  small.width = Math.min(640, width); small.height = Math.round(height * small.width / width);
}
async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    const selected = $('camera').value; $('camera').replaceChildren(new Option('Default camera', ''));
    devices.forEach((d, i) => $('camera').add(new Option(d.label || `Camera ${i + 1}`, d.deviceId)));
    if (devices.some(d => d.deviceId === selected)) $('camera').value = selected;
  } catch { notify('Camera list could not be read. Try Connect webcam to grant camera permission.', true); }
}
function waitForVideo() {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) return resolve();
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('loadeddata', ok); video.removeEventListener('error', fail); };
    const ok = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(Error('The video could not be decoded by this browser.')); };
    const timer = setTimeout(() => { cleanup(); reject(Error('Timed out waiting for video. Try reconnecting the camera.')); }, 12000);
    video.addEventListener('loadeddata', ok); video.addEventListener('error', fail);
  });
}
async function connect() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return notify('Camera access requires HTTPS or localhost. Open the published site or run the local server.', true);
  const device = $('camera').value, mode = $('capture-mode').value;
  if (!stopSource()) return;
  const token = state.token; $('connect').disabled = true; notify('Waiting for camera permission. Your microphone will not be requested.');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(captureConstraints(mode, device));
    if (token !== state.token) { stream.getTracks().forEach(t => t.stop()); return; }
    state.stream = stream; video.srcObject = stream; await video.play(); await waitForVideo();
    if (token !== state.token) { stream.getTracks().forEach(t => t.stop()); return; }
    state.mode = 'camera'; state.settings = stream.getVideoTracks()[0].getSettings();
    resize(video.videoWidth, video.videoHeight); $('welcome').hidden = true;
    $('source-badge').textContent = `LIVE · ${video.videoWidth} × ${video.videoHeight}`;
    $('reported-fps').textContent = state.settings.frameRate ? `${Number(state.settings.frameRate).toFixed(1)} fps` : 'Unknown';
    stream.getVideoTracks()[0].addEventListener('ended', async () => {
      if (token !== state.token) return;
      if (state.recording) await finishClip(); stopSource(); notify('Camera disconnected. Any completed clip remains in this tab.', true);
    });
    configureWorker(); scheduleVideo(token); await listCameras();
    notify('Camera connected. Smart setup will try to find the board automatically; you can always use the manual guide.');
    setTimeout(() => { if (token === state.token && state.mode === 'camera' && !state.calibration && !guide.active) smartCalibrate(true); }, 850);
  } catch (error) {
    stream?.getTracks().forEach(t => t.stop());
    if (token !== state.token) return;
    stopSource();
    const messages = { NotAllowedError: 'Camera permission was denied. Allow camera access in the browser address bar, then reconnect.', NotFoundError: 'No camera found. Plug in the webcam and refresh the camera list.', NotReadableError: 'The camera could not be opened. Close other apps using it and reconnect.', OverconstrainedError: 'The selected camera or mode is unavailable. Try the default camera at 1080p / 30 fps.' };
    notify(messages[error.name] || error.message, true);
  } finally { updateControls(); }
}
function scheduleVideo(token) {
  if (token !== state.token || !['camera', 'file'].includes(state.mode)) return;
  if (video.requestVideoFrameCallback) {
    state.callback = video.requestVideoFrameCallback((now, meta) => { if (token !== state.token) return; processFrame(meta.mediaTime, now); scheduleVideo(token); });
  } else {
    state.raf = requestAnimationFrame(now => { if (token !== state.token) return; if (!video.paused && video.currentTime !== state.lastTime) processFrame(video.currentTime, now); scheduleVideo(token); });
  }
}
function processFrame(time, now) {
  // A repeated presentation is not another observation. Keep real gaps and seeks unchanged.
  if (state.lastTime !== null && time === state.lastTime) return;
  if (state.lastTime !== null && time < state.lastTime) { resetStats(); configureWorker(); }
  if (state.lastTime !== null && time > state.lastTime) { state.gaps.push(time - state.lastTime); state.gaps = state.gaps.slice(-120); }
  state.lastTime = state.time = time; state.observed++;
  if (state.calibrationPoints || state.sampleTeam !== null) return;
  if (state.mode !== 'demo') rawCtx.drawImage(video, 0, 0, raw.width, raw.height);
  ctx.drawImage(raw, 0, 0); drawOverlay();
  if ((readyToTrack() || (worker && state.calibration && state.background && $('auto-colours').checked)) && !state.inflight && !document.hidden) {
    smallCtx.drawImage(raw, 0, 0, small.width, small.height);
    const image = smallCtx.getImageData(0, 0, small.width, small.height);
    state.inflight = true;
    worker.postMessage({ type: 'frame', generation: state.generation, time, width: small.width, height: small.height, buffer: image.data.buffer }, [image.data.buffer]);
  }
  if (now - state.statStart >= 1000) {
    const elapsed = (now - state.statStart) / 1000;
    state.fps = state.observed / elapsed; state.analysisFps = state.analysed / elapsed;
    $('observed-fps').textContent = `${state.fps.toFixed(1)} / ${state.analysisFps.toFixed(1)}`;
    $('frame-gap').textContent = state.gaps.length ? `${(Math.max(...state.gaps) * 1000).toFixed(0)} ms` : '—';
    state.observed = state.analysed = 0; state.statStart = now;
  }
  if (state.mode === 'file' && Number.isFinite(video.duration)) { $('file-seek').value = String(video.currentTime / video.duration * 1000); $('file-time').textContent = formatTime(video.currentTime); }
}
function drawOverlay() {
  if (!$('overlays').checked || !state.calibration) return;
  const c = state.calibration, projection = state.projection;
  const map = p => projection ? projectPoint(projection.boardToImage, p) : p;
  const outline = (center, radius) => {
    ctx.beginPath();
    if (!projection) ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    else for (let i = 0; i <= 72; i++) { const a = i * Math.PI / 36, p = map({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) }); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    ctx.stroke();
  };
  ctx.save(); ctx.strokeStyle = '#faf3c69e'; ctx.lineWidth = Math.max(1, board.width / 600); ctx.setLineDash([7, 7]);
  for (const radius of c.rings) outline(c.center, radius);
  ctx.setLineDash([]); const scale = board.width / (projection ? 640 : small.width);
  for (const d of state.discs) {
    const center = projection ? { x: d.x, y: d.y } : { x: d.x * scale, y: d.y * scale };
    const r = projection ? d.r : d.r * scale, p = map(center), edge = map({ x: center.x + r, y: center.y });
    ctx.strokeStyle = d.team === 0 ? '#a0ddf3' : '#f7b2a1'; ctx.lineWidth = 2 * scale;
    outline(center, r + (projection ? 3 : 3 * scale));
    ctx.font = `bold ${12 * scale}px system-ui`; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#183b36'; ctx.lineWidth = 3 * scale;
    const scored = state.auto.lastLiveScore?.items?.find(v => v.id === d.id && v.team === d.team); const label = `${d.team === 0 ? 'A' : 'B'}${d.id}${scored ? ` · ${scored.value}${scored.review ? '?' : ''}` : ''}`; ctx.strokeText(label, edge.x + 6, p.y); ctx.fillText(label, edge.x + 6, p.y);
  }
  ctx.strokeStyle='#edbc59';ctx.fillStyle='#edbc59';ctx.lineWidth=2*scale;ctx.setLineDash([5*scale,4*scale]);
  for(const d of state.clusterCandidates||[]){const center=projection?d:{x:d.x*scale,y:d.y*scale};outline(center,projection?d.r:d.r*scale);const p=map(center);ctx.fillText(`${d.team===0?'A':'B'}? review`,p.x,p.y);}
  for(const box of state.lastVisibility?.unresolvedRegions||[]){const factor=projection?1:scale;const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]];ctx.beginPath();corners.forEach(([x,y],i)=>{const p=map({x:x*factor,y:y*factor});if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.stroke();}
  ctx.restore();
}
function smartCalibrate(automatic = false) {
  if (state.mode === 'idle' || state.recording || guide.active || state.smartBusy) return;
  state.smartBusy = true; updateControls();
  try {
    if (['camera', 'file'].includes(state.mode) && video.readyState >= 2) rawCtx.drawImage(video, 0, 0, raw.width, raw.height);
    const maxWidth = 800, scale = Math.min(1, maxWidth / raw.width);
    smart.width = Math.max(240, Math.round(raw.width * scale)); smart.height = Math.max(180, Math.round(raw.height * scale));
    smartCtx.drawImage(raw, 0, 0, smart.width, smart.height);
    notify(automatic ? 'Smart setup is checking the board geometry…' : 'Smart setup is finding the playing surface, 20 hole and scoring rings…');
    const image = smartCtx.getImageData(0, 0, smart.width, smart.height);
    const result = autoCalibrateFrame(image.data, smart.width, smart.height);
    const projection = scaleAutoProjectionToSource(result.projection, smart.width / raw.width);
    guide.previewAuto(raw, { calibration: result.calibration, projection, confidence: result.confidence, diagnostics: result.diagnostics });
    notify('Smart setup found a candidate calibration. Check the ring overlay and straightened preview before accepting it; fit quality is not an accuracy probability.');
  } catch (error) {
    state.calibrationPoints = null;
    const prefix = automatic ? 'Smart setup could not finish automatically. ' : '';
    notify(prefix + error.message + ' The manual guide is still available.', !automatic);
  } finally {
    state.smartBusy = false; updateControls();
  }
}
function startCalibration() {
  if (state.mode === 'idle' || state.recording) return;
  guide.start($('calibration-mode').value);
}
function cancelCalibration() {
  if (guide.active) { guide.cancel(); return; }
  state.calibrationPoints = null; state.sampleTeam = null; $('stage').classList.remove('calibrating');
  $('stage-hint').textContent = 'Colour sampling cancelled. Existing calibration is unchanged.'; configureWorker();
  ctx.drawImage(raw, 0, 0); drawOverlay();
}
board.addEventListener('click', event => {
  if (state.sampleTeam === null || guide.active) return;
  const rect = board.getBoundingClientRect();
  const p = { x: (event.clientX - rect.left) * board.width / rect.width, y: (event.clientY - rect.top) * board.height / rect.height };
  const team = state.sampleTeam, image = rawCtx.getImageData(0, 0, raw.width, raw.height);
  const color = averageColor(image.data, raw.width, raw.height, p.x, p.y), other = state.colors[1 - team];
  if (other && Math.hypot(...color.map((v, i) => v - other[i])) < 35) { notify('These colour samples are too similar. Sample the solid centre of differently coloured pucks.', true); return; }
  state.colors[team] = color; game.renderPalette(); state.sampleTeam = null; $('stage').classList.remove('calibrating');
  $('stage-hint').textContent = `Team ${team === 0 ? 'A' : 'B'} colour sampled. Tracking remains experimental.`; configureWorker();
});
function saveBackground() {
  if (!state.calibration || state.recording) return;
  smallCtx.drawImage(raw, 0, 0, small.width, small.height); state.background = smallCtx.getImageData(0, 0, small.width, small.height).data;
  configureWorker(); notify('Empty-board reference captured. Place one separate puck of each colour on the board and lift your hands. Team colours will be detected automatically; manual sampling is a fallback.');
}
function sampleTeam(team) {
  $('auto-colours').checked=false;
  if (!state.background || state.recording) return;
  state.sampleTeam = team; state.calibrationPoints = null; ctx.drawImage(raw, 0, 0); $('stage').classList.add('calibrating');
  $('stage-hint').textContent = `Click the solid centre of a TEAM ${team === 0 ? 'A' : 'B'} disc. View frozen.`; updateControls();
}
function circle(x, y, r, fill, stroke = null) { rawCtx.beginPath(); rawCtx.arc(x, y, r, 0, Math.PI * 2); rawCtx.fillStyle = fill; rawCtx.fill(); if (stroke) { rawCtx.strokeStyle = stroke; rawCtx.lineWidth = 2; rawCtx.stroke(); } }
function paintDemo(t, empty = false, physical = false) {
  rawCtx.fillStyle = '#223e35'; rawCtx.fillRect(0, 0, 960, 720);
  circle(480, 360, 325, '#102a25'); circle(480, 360, physical?323:309, '#a78052'); circle(480, 360, physical?DEMO_BOARD.railRadius:294, '#2d2922'); circle(480, 360, DEMO_BOARD.radius, '#dfc594', '#705939');
  for (const r of [260, 185, 94]) circle(480, 360, r, '#dfc594', '#4a3929');
  rawCtx.strokeStyle = '#705939'; rawCtx.lineWidth = 2;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; rawCtx.beginPath(); rawCtx.moveTo(480 + 250 * Math.cos(a), 360 + 250 * Math.sin(a)); rawCtx.lineTo(480 + 260 * Math.cos(a), 360 + 260 * Math.sin(a)); rawCtx.stroke(); }
  for(const peg of DEMO_BOARD.pegs)circle(peg.x,peg.y,peg.r,'#4a3929');
  circle(480, 360, 17, '#483927'); circle(480, 360, 12, '#302c22');
  rawCtx.fillStyle = '#886d48'; rawCtx.font = '16px Georgia'; rawCtx.textAlign = 'center'; rawCtx.fillText('5', 690, 363); rawCtx.fillText('10', 620, 363); rawCtx.fillText('15', 545, 363);
  if (empty) return;
  const a = [46, 113, 143], b = [168, 64, 54];
  const s = Math.min(t, 6.9), moving = clamp(s - 1, 0, 0.6), hit = clamp(s - 1.6, 0, 0.55);
  circle(480, 572 - moving * 240, 14, `rgb(${a})`); circle(480, 400 - hit * 200, 14, `rgb(${b})`);
  circle(620, 290, 14, `rgb(${a})`); circle(340, 410, 14, `rgb(${b})`);
}
function paintPhysicsDemo(discs, contacts=[]) {
  paintDemo(0,true,true);
  for(const d of discs){
    rawCtx.save();
    if(d.out){
      // The lower gutter is occluded by the tabletop; never paint a fallen
      // disc bouncing back over the playing surface at the same height.
      rawCtx.beginPath();rawCtx.rect(0,0,raw.width,raw.height);
      rawCtx.arc(DEMO_BOARD.x,DEMO_BOARD.y,DEMO_BOARD.radius,0,Math.PI*2);
      rawCtx.clip('evenodd');rawCtx.globalAlpha=.8;
    }else rawCtx.globalAlpha=d.opacity??1;
    const radius=d.pocketed?d.r*Math.max(.1,d.opacity??1):d.r;
    circle(d.x,d.y,radius,`rgb(${state.colors[d.team]})`);
    rawCtx.restore();
  }
  $('disc-count').textContent=String(discs.filter(d=>!d.out&&!d.pocketed).length);
  $('contact-status').textContent=contacts.length?'Simulated contact: '+contacts.map(e=>e.type==='peg'?'peg deflection':'disc-to-disc impact').join(' · '):'Demo physics only · live contact/referee decisions are unchanged.';
}
function startDemo(fullRound = false) {
  if (!stopSource()) return;
  enterPreview(); state.mode = 'demo'; resize(960, 720);
  state.calibration = makeCalibration([{ x: 480, y: 360 }, { x: 574, y: 360 }, { x: 665, y: 360 }, { x: 740, y: 360 }, { x: 620, y: 290 }, { x: 634, y: 290 }], 960, 720);
  paintDemo(0, true); smallCtx.drawImage(raw, 0, 0, small.width, small.height); state.background = smallCtx.getImageData(0, 0, small.width, small.height).data;
  state.colors = [[46, 113, 143], [168, 64, 54]]; state.demoStart = performance.now();
  $('welcome').hidden = true; $('demo-label').hidden = false; $('source-badge').textContent = 'DEMO · simulated board'; $('reported-fps').textContent = 'Synthetic';
  $('stage-hint').textContent = 'Synthetic motion through the same detector. This does not validate real-camera accuracy.';
  configureWorker();
  if(fullRound){fullDemo.start();$('source-badge').textContent='DEMO · simulated physics round';$('stage-hint').textContent='Physics exhibition: trajectories and scores follow simulated impacts, not fixed outcomes or camera verdicts.';notify('Full-round demo only. No camera, recording, or changes to your saved match.');return;}
  const token = state.token;
  const tick = now => { if (state.mode !== 'demo' || token !== state.token) return; if (!state.calibrationPoints && state.sampleTeam === null) paintDemo((now - state.demoStart) / 1000); processFrame((now - state.demoStart) / 1000, now); state.raf = requestAnimationFrame(tick); };
  state.raf = requestAnimationFrame(tick); notify('Demo only: synthetic discs, synthetic motion. Your manual match scores are unchanged.');
}
function canAddClip(size = 0, quiet = false) {
  if(!state.storageReady){if(!quiet)notify('Wait for the saved clip library to finish opening.',true);return false;}
  if (state.clips.length >= MAX_CLIPS) { if (!quiet) notify(`The ${MAX_CLIPS}-clip limit is reached. Export and remove clips before adding another.`, true); return false; }
  if (size > MAX_CLIP || state.clips.reduce((n, c) => n + c.blob.size, 0) + size > MAX_TOTAL) { if (!quiet) notify('Clip storage limit reached (64 MB per clip / 256 MB total). Export and remove clips to make space.', true); return false; }
  return true;
}
function formatTime(seconds) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function addClip(blob, details) {
  if (!canAddClip(blob.size)) return false;
  const clip={ id: crypto.randomUUID(),matchId:state.matchId, blob, url: URL.createObjectURL(blob), createdAt: new Date().toISOString(), verdict: 'review-needed', note: '', contacts: [], ...details };state.clips.unshift(clip);renderClips();library.save(clip);return true;
}
function startClip(options = {}) {
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
function finishClip() {
  const r = state.recording; if (!r) return Promise.resolve();
  if(r.auto&&!r.autoResult)r.error=true;
  $('stop-record').disabled = true;
  r.stop();
  return r.done.finally(() => { $('stop-record').disabled = false; });
}
async function importVideo(file) {
  if (!file || state.recording || !canAddClip(file.size)) return;
  if (!file.type.startsWith('video/')) return notify('Choose a video file supported by your browser.', true);
  if (!stopSource()) return;
  const token = state.token;
  state.sourceURL = URL.createObjectURL(file); video.src = state.sourceURL;
  try {
    await waitForVideo(); if (token !== state.token) return;
    enterPreview(); state.mode = 'file'; resize(video.videoWidth, video.videoHeight);
    $('welcome').hidden = true; $('source-badge').textContent = 'LOCAL VIDEO · not live'; $('reported-fps').textContent = 'Unknown';
    rawCtx.drawImage(video, 0, 0); ctx.drawImage(raw, 0, 0);
    addClip(file, { title: file.name, originalName: file.name, source: 'import', duration: Number.isFinite(video.duration) ? video.duration : null, complete: null, configuration: null });
    configureWorker(); scheduleVideo(token); notify('Local video opened without upload. Use Play / pause, then calibrate and sample a suitable scene. Imported clip analysis is not saved to the shot log in v0.1.');
  } catch (error) { if (token === state.token) { stopSource(); notify(error.message, true); } }
}
function renderClips() {
  $('clip-count').textContent = String(state.clips.length);
  if (!state.clips.length) { $('clips').replaceChildren(); const p = document.createElement('p'); p.className = 'help'; p.textContent = 'No clips yet. Start recording before shooting, or open a local video.'; $('clips').append(p); return; }
  $('clips').replaceChildren();
  for (const c of state.clips) {
    const card = document.createElement('div'); card.className = 'clip';
    const info = document.createElement('div'), title = document.createElement('strong'), sub = document.createElement('p');
    title.textContent = c.title; sub.textContent = `${c.duration === null ? 'Duration unknown' : formatTime(c.duration)} · ${(c.blob.size / MB).toFixed(1)} MB${c.autoTriggered ? ' · AUTO CLIP' : ''}${c.preRollSeconds > 0 ? ` · ~${c.preRollSeconds.toFixed(1)}s lead-in` : ''}${c.autoResult?.score ? ` · score ${c.autoResult.score.totals.join('–')}` : ''} · ${c.storageState==='saved'?'SAVED LOCALLY':c.storageState==='failed'?'NOT SAVED':'SAVING'} · ${c.verdict}${c.complete === false ? ' · INCOMPLETE' : ''}`;
    info.append(title, sub); const actions = document.createElement('div'); actions.className = 'clip-actions';
    const review = document.createElement('button'); review.textContent = 'Review'; review.className = 'secondary'; review.onclick = () => openReplay(c.id);
    const remove = document.createElement('button'); remove.textContent = '×'; remove.className = 'text-button'; remove.setAttribute('aria-label', `Remove ${c.title}`); remove.onclick = () => {
      if (!confirm('Delete this clip from the local library? Export its video first to keep a backup.')) return;
      library.remove(c);
    };
    actions.append(review, remove); card.append(info, actions); $('clips').append(card);
  }
}
function openReplay(id) {
  const c = state.clips.find(v => v.id === id); if (!c) return;
  state.selected = id; $('replay-title').textContent = c.title; $('replay-video').src = c.url; $('replay-video').playbackRate = 1; $('replay-speed').value = '1';
  $('verdict').value = c.verdict; $('review-note').value = c.note;
  $('replay-events').replaceChildren();
  const intro = document.createElement('p'); intro.textContent = c.source === 'import' ? 'Imported video. No persisted automatic contact analysis.' : `${c.contacts.length} proximity candidate(s); ${c.trackingGaps || 0} tracking discontinuity/initialisation frame(s). Times are approximate relative to recording start. Candidates within one interval have unresolved order.`; $('replay-events').append(intro);
  if (c.autoTriggered) { const p = document.createElement('p'); p.textContent = `Pre-shot lead-in: approximately ${(c.preRollSeconds || 0).toFixed(1)} s (${c.preRollState || 'off'}). Event times include that lead-in and are not sensor timestamps.`; $('replay-events').append(p); }
  if (c.autoResult?.score) { const p = document.createElement('p'); p.textContent = `Auto score after settlement: ${c.autoResult.score.totals[0]}–${c.autoResult.score.totals[1]} · ${c.autoResult.scoreApplied ? 'applied' : 'held for review'}${c.autoResult.score.review ? ' · line/centre review suggested' : ''}. This is scoring assistance, not an automatic legal/foul verdict.`; $('replay-events').append(p); }
  for (const e of c.contacts) { const p = document.createElement('p'); p.textContent = `${e.from.toFixed(3)}–${e.to.toFixed(3)} s · ${e.teams[0] === 0 ? 'A' : 'B'}${e.ids[0]} ↔ ${e.teams[1] === 0 ? 'A' : 'B'}${e.ids[1]} · proximity only, not a proven collision`; $('replay-events').append(p); }
  $('replay-dialog').showModal();
}
function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000); }
function sessionPayload() {
  return { schemaVersion: 3, matchId:state.matchId, appVersion: VERSION, exportedAt: new Date().toISOString(), automaticVerdictsEnabled: false, sessionIsPreview:!!previewMatch, automaticScoringEnabled: !!$('auto-scoring')?.checked, automaticClipsEnabled: !!$('auto-clips')?.checked, roundTracking: game.snapshot(), autoReferee: { boardCorrections:state.auto.corrections||[],twenties: state.auto.twenties, adjustments:state.auto.adjustments, reviewHold:state.auto.reviewHold, shotCount: state.auto.shotCount, lastResult: state.auto.lastResult }, activeConfiguration: configSnapshot(), match: { names: state.names, mode: $('score-mode').value, scores: state.scores, totals: state.totals, round: state.round, rounds: state.rounds }, clips: state.clips.map(({ blob, url, ...c }) => ({ ...c, videoIncluded: false, videoMime: blob.type, videoBytes: blob.size })), limitations: ['No automatic first-contact or foul decisions.', 'Proximity is not proof of impact.', 'Angled calibration corrects the board plane, not occlusion, lens distortion or puck/peg height.', 'Video must be exported separately.', 'Observed callbacks are not a sensor-frame guarantee.'] };
}
function exportSession(){
  download(new Blob([diagnosticJSON(sessionPayload())], { type: 'application/json' }), `crokinole-match-${new Date().toISOString().slice(0, 10)}.json`);
}
function saveMatch() { if(previewMatch)return; try { localStorage.setItem('crokinole-ref-match-v1', JSON.stringify({ id:state.matchId,boardCorrections:state.auto.corrections||[], names: state.names, scores: state.scores, totals: state.totals, rounds: state.rounds, round: state.round, mode: $('score-mode').value, roundTracking: game.snapshot(), autoTwenties: state.auto.twenties, autoAdjustments: state.auto.adjustments, autoReviewHold: state.auto.reviewHold, autoShotCount: state.auto.shotCount })); } catch { notify('Browser storage is unavailable. Export the match log before closing.', true); } library?.saveMatch({id:state.matchId,updatedAt:new Date().toISOString(),match:sessionPayload().match}); }
function loadMatch() {
  try {
    const data = JSON.parse(localStorage.getItem('crokinole-ref-match-v1') || 'null');
    if (!data) return;
    const pair = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isSafeInteger(n) && n >= 0);
    if (!Array.isArray(data.rounds) || !data.rounds.every(r => r && Number.isSafeInteger(r.round) && r.round > 0 && pair(r.scores) && pair(r.awarded) && ['match', 'difference'].includes(r.mode))) return;
    if (!pair(data.scores) || !pair(data.totals) || !Number.isSafeInteger(data.round) || data.round < 1 || !Array.isArray(data.rounds) || !Array.isArray(data.names) || data.names.length !== 2 || !data.names.every(n => typeof n === 'string') || !['match', 'difference'].includes(data.mode)) return;
    if(typeof data.id==='string')state.matchId=data.id;
    if(validBoardCorrections(data.boardCorrections))state.auto.corrections=invalidateBoardCorrections(data.boardCorrections);
    game.restore(data.roundTracking); state.names = data.names.map(n => n.slice(0, 40)); state.scores = data.scores; state.totals = data.totals; state.rounds = data.rounds.slice(-100); state.round = data.round; $('score-mode').value = data.mode; if (pair(data.autoTwenties)) state.auto.twenties = data.autoTwenties; if(Array.isArray(data.autoAdjustments)&&data.autoAdjustments.length===2&&data.autoAdjustments.every(Number.isSafeInteger))state.auto.adjustments=data.autoAdjustments;state.auto.reviewHold=!!data.autoReviewHold; if (Number.isSafeInteger(data.autoShotCount) && data.autoShotCount >= 0) state.auto.shotCount = data.autoShotCount;
  } catch { /* Corrupt or disabled local storage is not fatal. */ }
}
function snapshotScore() { state.undo.push(JSON.stringify({ boardCorrections:state.auto.corrections||[],matchId:state.matchId,roundTracking:game.snapshot(), scores: state.scores, totals: state.totals, rounds: state.rounds, round: state.round, mode: $('score-mode').value, autoTwenties: state.auto.twenties, autoAdjustments: state.auto.adjustments, autoReviewHold: state.auto.reviewHold, autoShotCount: state.auto.shotCount })); state.undo = state.undo.slice(-100); }
function renderScore() {
  $('players').replaceChildren();
  for (let team = 0; team < 2; team++) {
    const card = document.createElement('div'); card.className = 'player';
    const header = document.createElement('div'); header.className = 'player-label';
    const dot = document.createElement('span'); dot.className = 'team-dot';
    const name = document.createElement('input'); name.type = 'text'; name.value = state.names[team]; name.maxLength = 40; name.setAttribute('aria-label', `Team ${team === 0 ? 'A' : 'B'} name`); name.onchange = () => { state.names[team] = name.value.trim() || `Team ${team === 0 ? 'A' : 'B'}`; name.value = state.names[team]; saveMatch(); };
    header.append(dot, name); const number = document.createElement('div'); number.className = 'score-number'; number.textContent = state.scores[team]; number.id = `score-${team}`;
    const caption = document.createElement('div'); caption.className = 'score-caption'; caption.textContent = 'points this round';
    const buttons = document.createElement('div'); buttons.className = 'point-buttons';
    for (const points of [5, 10, 15, 20]) { const b = document.createElement('button'); b.textContent = `+${points}`; b.setAttribute('aria-label', `Add ${points} points to team ${team === 0 ? 'A' : 'B'}`); b.onclick = () => { snapshotScore(); if(points===20)state.auto.twenties[team]++;else state.auto.adjustments[team]+=points; state.scores[team] += points; saveMatch(); renderScore(); }; buttons.append(b); }
    const total = document.createElement('div'); total.className = 'match-total'; total.textContent = `Match total: ${state.totals[team]}`;
    card.append(header, number, caption, buttons, total); $('players').append(card);
  }
  $('round-status').textContent = $('auto-scoring')?.checked ? `Round ${state.round} · Score updates automatically after a reliably settled shot. 20s are confirmed manually. Other point buttons are persistent score adjustments.` : `Round ${state.round} · Automatic scoring is off; enter points manually.`;
  if ($('score-badge')) $('score-badge').textContent = $('auto-scoring')?.checked ? 'Auto scoring + manual correction' : 'Manual scoring';
  $('undo-score').disabled = !state.undo.length; $('score-mode').disabled = state.rounds.length > 0;
  $('round-history').replaceChildren();
  for (const r of [...state.rounds].reverse().slice(0, 10)) { const row = document.createElement('div'); row.className = 'round-entry'; row.textContent = `Round ${r.round}: ${r.scores?.join(' – ')} → awarded ${r.awarded?.join(' – ')}`; $('round-history').append(row); }
  game?.renderPalette();reviewControls?.render();renderPlayStatus();
}
function renderPlayStatus(){
  if(fullDemo?.active){fullDemo.renderStatus();return;}
  if(!$('play-score'))return;
  $('play-score').textContent=`${state.names[0]} ${state.scores[0]} — ${state.scores[1]} ${state.names[1]} · Round ${state.round}`;
  $('play-state').textContent=state.recording?'Recording shot':state.lastVisibility?.viewObstructed?'Review · unresolved board region':state.auto.reviewHold?'Review needed':state.auto.activeShotNumber!==null?'Shot in motion':!readyToTrack()?'Complete table setup':state.auto.awaitingClear?'Clear board for next round':'Ready for next shot';
  $('play-remaining').textContent=$('auto-round-status')?.textContent||'';
}
$('toggle-play').onclick=()=>{const enabled=document.body.classList.toggle('play-mode');$('toggle-play').textContent=enabled?'Show table setup':'Play view';$('toggle-play').setAttribute('aria-pressed',String(enabled));renderPlayStatus();};
$('play-review').onclick=()=>{document.body.classList.remove('play-mode');$('toggle-play').textContent='Play view';$('toggle-play').setAttribute('aria-pressed','false');$('review-board').open=true;$('review-board').scrollIntoView({block:'center'});};
$('export-diagnostics').onclick=()=>{download(new Blob([diagnosticJSON({schema:1,exportedAt:new Date().toISOString(),appVersion:VERSION,activeConfiguration:configSnapshot(),observations:diagnostics.snapshot(),roundTracking:game.snapshot(),containsEmptyBoardImage:true,footageUploaded:false})],{type:'application/json'}),'crokinole-diagnostics.json');};
$('connect').onclick = connect; $('refresh-cameras').onclick = listCameras; $('stop-source').onclick = stopSource; $('demo').onclick = () => startDemo(); $('demo-round').onclick = () => startDemo(true);
$('auto-calibrate').onclick = () => smartCalibrate(false); $('calibrate').onclick = startCalibration; $('cancel-calibrate').onclick = cancelCalibration; $('background').onclick = saveBackground;
$('sample-a').onclick = () => sampleTeam(0); $('sample-b').onclick = () => sampleTeam(1);
$('tolerance').oninput = () => { $('tolerance-value').value = $('tolerance').value; configureWorker(); };
$('overlays').onchange = () => { if (state.mode !== 'idle') { ctx.drawImage(raw, 0, 0); drawOverlay(); } };
$('record').onclick = () => startClip({ auto: false }); $('stop-record').onclick = finishClip;
$('auto-scoring').onchange = () => { renderScore(); updateControls(); };
$('apply-reviewed-score').onclick=()=>{
  if(!readyToTrack()||state.auto.activeShotNumber!==null||state.mode==='file')return;
  const score=reviewControls.reconcile(scoreSettledBoard(state.discs,analysisCalibration(),state.auto.twenties,state.auto.adjustments),state.discs);
  if(!confirm(`Use the reviewed board score ${score.totals.join('–')}? Verify all pucks are visible and enter any confirmed 20s first.`))return;
  snapshotScore();state.auto.corrections=(state.auto.corrections||[]).map(e=>e.status==='stale'?{...e,status:'cleared'}:e);state.auto.reviewHold=false;state.scores=[...score.totals];saveMatch();renderScore();
  $('auto-status').textContent='Reviewed board score applied by player; automatic scoring may resume.';
};
$('auto-clips').onchange = () => {if(!$('auto-clips').checked&&state.recording?.auto)finishClip();clipBuffer.failure=null;updateControls();};
$('pre-roll').onchange = () => {clipBuffer.failure=null;syncClipBuffer();updateControls();};
$('import-button').onclick = () => $('import-video').click();
$('import-video').onchange = e => { const file = e.target.files[0]; e.target.value = ''; importVideo(file); };
$('file-play').onclick = () => video.paused ? video.play().catch(e => notify(e.message, true)) : video.pause();
$('file-seek').oninput = () => { if (Number.isFinite(video.duration)) { video.currentTime = +$('file-seek').value / 1000 * video.duration; resetStats(); configureWorker(); } };
video.addEventListener('seeked', () => { if (state.mode === 'file' && !state.calibrationPoints && state.sampleTeam === null) { rawCtx.drawImage(video, 0, 0); ctx.drawImage(raw, 0, 0); drawOverlay(); } });
$('close-replay').onclick = () => $('replay-dialog').close(); $('replay-dialog').addEventListener('close', () => $('replay-video').pause());
$('replay-speed').onchange = () => { $('replay-video').playbackRate = +$('replay-speed').value; };
function seekReplay(delta) { const v = $('replay-video'); v.pause(); v.currentTime = clamp(v.currentTime + delta, 0, Number.isFinite(v.duration) ? v.duration : Math.max(0, v.currentTime + delta)); }
$('seek-back').onclick = () => seekReplay(-1 / 30); $('seek-forward').onclick = () => seekReplay(1 / 30);
$('download-clip').onclick = () => { const c = state.clips.find(v => v.id === state.selected); if (c) download(c.blob, c.originalName || `crokinole-${c.id}.${c.blob.type.includes('mp4') ? 'mp4' : 'webm'}`); };
$('save-verdict').onclick = () => { const c = state.clips.find(v => v.id === state.selected); if (c) { c.verdict = $('verdict').value; c.note = $('review-note').value.trim(); c.reviewedAt = new Date().toISOString(); c.decisionSource = 'human'; library.save(c);renderClips(); $('replay-dialog').close(); notify('Manual decision noted; local save is in progress. Export the match archive for a backup. Scores are unchanged.'); } };
$('export-session').onclick = exportSession;
function finishRound(automatic = false) {
  if(state.recording||state.auto.activeShotNumber!==null)return notify('Wait for the current shot and clip to finish before ending the round.',true);
  if (!automatic && !confirm(`Finish round ${state.round} with ${state.scores[0]} – ${state.scores[1]} points?`)) return false;
  snapshotScore(); const awarded = roundResult(...state.scores, $('score-mode').value);
  state.rounds.push({ round: state.round, scores: [...state.scores], awarded, mode: $('score-mode').value, source: automatic?'automatic':'player', shotCountEvidence: game.snapshot() });
  state.totals = state.totals.map((n, i) => n + awarded[i]); state.scores = [0, 0]; state.round++; resetAutoRound(); saveMatch(); renderScore();
  return true;
}
$('finish-round').onclick=()=>finishRound(false);
$('undo-score').onclick = () => { const previous = state.undo.pop(); if (previous) { const { mode, boardCorrections,roundTracking, autoTwenties, autoAdjustments, autoReviewHold, autoShotCount, ...values } = JSON.parse(previous); if(roundTracking&&values.round!==state.round)game.restore(roundTracking); Object.assign(state, values);if(validBoardCorrections(boardCorrections))state.auto.corrections=boardCorrections; if (Array.isArray(autoTwenties)) state.auto.twenties = autoTwenties; if(Array.isArray(autoAdjustments))state.auto.adjustments=autoAdjustments;state.auto.reviewHold=!!autoReviewHold;$('auto-scoring').checked=false; if (Number.isSafeInteger(autoShotCount)) state.auto.shotCount = autoShotCount; $('score-mode').value = mode; saveMatch(); renderScore(); } };
$('score-mode').onchange = saveMatch;
$('new-match').onclick = () => { if(state.recording||state.auto.activeShotNumber!==null)return notify('Finish the current shot first.',true); if (!confirm('Start a new match? Scores and round history will reset. Clips remain in this tab.')) return; snapshotScore();state.matchId=crypto.randomUUID(); state.scores = [0, 0]; state.totals = [0, 0]; state.rounds = []; state.round = 1; resetAutoRound(); saveMatch(); renderScore(); };
document.addEventListener('visibilitychange', () => { if(fullDemo?.active){fullDemo.visibilityChanged();return;} if (document.hidden && state.recording) { state.recording.trackingGaps++; notify('Tab hidden: tracking may pause. Recording may continue, but contact evidence can be incomplete.', true); } resetStats(); configureWorker(); });
window.addEventListener('beforeunload', e => { if (library?.hasUnsaved() || state.recording) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('pagehide', () => { clipBuffer.stop(); state.stream?.getTracks().forEach(t => t.stop()); });
game=installGameAutomation({state,getCalibration:analysisCalibration,readyToTrack,reconfigure:configureWorker,updateControls,saveMatch,finishRound,notify});
reviewControls=installReviewControls({state,board,getCalibration:analysisCalibration,toAnalysis:p=>state.projection?projectPoint(state.projection.imageToBoard,p):{x:p.x*small.width/board.width,y:p.y*small.width/board.width},snapshotScore,saveMatch,renderScore,notify});
fullDemo=new FullRoundDemo({state,processFrame:time=>{state.time=time;ctx.drawImage(raw,0,0);},renderScore,exit:stopSource,paint:paintPhysicsDemo});
loadMatch();renderScore();library=installLibraryControls({state,renderClips,updateControls,payload:sessionPayload,download,notify});updateControls();listCameras();
