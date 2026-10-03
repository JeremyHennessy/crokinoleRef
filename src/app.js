import { VERSION, clamp, makeCalibration, scaleCalibration, roundResult, captureConstraints, averageColor } from './core.js';
import { CalibrationGuide } from './calibration-guide.js';
import { projectPoint, samplingMatrix } from './perspective.js';
const $ = id => document.getElementById(id);
const board = $('board'), ctx = board.getContext('2d');
const video = $('source-video'), raw = document.createElement('canvas'), rawCtx = raw.getContext('2d', { willReadFrequently: true });
const small = document.createElement('canvas'), smallCtx = small.getContext('2d', { willReadFrequently: true });
const MB = 1024 * 1024, MAX_CLIP = 64 * MB, MAX_TOTAL = 128 * MB;
const state = { mode: 'idle', token: 0, generation: 0, stream: null, sourceURL: null, callback: null, raf: null, calibration: null, projection: null, background: null, colors: [null, null], discs: [], contacts: [], calibrationPoints: null, sampleTeam: null, inflight: false, time: 0, lastTime: null, gaps: [], observed: 0, analysed: 0, statStart: performance.now(), fps: 0, analysisFps: 0, clips: [], selected: null, recording: null, settings: {}, names: ['Team A', 'Team B'], scores: [0, 0], totals: [0, 0], rounds: [], undo: [], round: 1, demoStart: 0 };
const guide = new CalibrationGuide({
  getFrame: () => { if (['camera', 'file'].includes(state.mode) && video.readyState >= 2) rawCtx.drawImage(video, 0, 0, raw.width, raw.height); return raw; },
  onOpen: () => { state.calibrationPoints = []; state.sampleTeam = null; $('stage').classList.remove('calibrating'); updateControls(); },
  onCancel: () => { state.calibrationPoints = null; $('stage-hint').textContent = 'Calibration cancelled. The previous calibration is unchanged.'; configureWorker(); ctx.drawImage(raw, 0, 0); drawOverlay(); },
  onApply: ({ calibration, projection }) => {
    state.calibration = calibration; state.projection = projection; state.calibrationPoints = null; state.background = null; state.colors = [null, null];
    $('stage-hint').textContent = 'Geometry set. Clear all pucks and hands, then save the empty board.';
    configureWorker(); ctx.drawImage(raw, 0, 0); drawOverlay();
    notify(projection ? 'Board-plane perspective correction applied. Clear the board for a new background. Hidden pucks, lens distortion and raised puck/peg surfaces remain limitations.' : 'Overhead calibration applied. Clear the board, save its empty view, then sample both puck colours.');
  }
});
let worker;
try {
  worker = new Worker(new URL('./vision-worker.js?calibration=2', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: m }) => {
    if (m.generation !== state.generation) return;
    state.inflight = false;
    if (m.type === 'error') { notify(`Tracking stopped: ${m.message}. Recording and manual scoring remain available.`, true); worker.terminate(); worker = null; return; }
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
  };
  worker.onerror = () => { state.inflight = false; worker?.terminate(); worker = null; notify('Vision worker unavailable. Camera, replay and manual scoring can still be used.', true); };
} catch { notify('This browser cannot start the tracking worker. Recording and manual scoring remain available.', true); }
function notify(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function configSnapshot() { return { calibration: state.calibration, projection: state.projection, analysisCoordinates: state.projection ? 'rectified-board-plane-640' : 'scaled-camera-image', colors: state.colors, tolerance: +$('tolerance').value, source: state.mode, cameraReports: state.settings, version: VERSION }; }
function configureWorker() {
  state.generation++; state.inflight = false; state.discs = []; state.contacts = []; $('disc-count').textContent = '—';
  const scale = small.width / board.width;
  worker?.postMessage({ type: 'configure', generation: state.generation, calibration: state.calibration ? (state.projection ? state.calibration : scaleCalibration(state.calibration, scale)) : null, warp: state.projection ? { matrix: samplingMatrix(state.projection, scale), width: small.width, height: small.height } : null, background: state.background, colors: state.colors, tolerance: +$('tolerance').value });
  $('contact-status').textContent = 'First-contact order is not verified. Proximity candidates are not referee decisions.';
  updateControls();
}
function readyToTrack() { return !!(worker && state.calibration && state.background && state.colors.every(Boolean)); }
function updateControls() {
  const active = state.mode !== 'idle', busy = !!state.recording, calibrating = !!state.calibrationPoints;
  $('stop-source').disabled = !active || busy; $('connect').disabled = busy;
  $('record').disabled = state.mode !== 'camera' || busy || calibrating || state.sampleTeam !== null || !window.MediaRecorder;
  $('record').hidden = busy; $('stop-record').hidden = !busy; $('record-label').hidden = !busy;
  $('calibrate').disabled = !active || busy; $('background').disabled = !state.calibration || busy || calibrating;
  $('sample-a').disabled = !state.background || busy || calibrating; $('sample-b').disabled = !state.background || busy || calibrating;
  ['camera', 'capture-mode', 'calibration-mode', 'import-video', 'import-button', 'tolerance', 'refresh-cameras'].forEach(id => { $(id).disabled = busy; });
  $('demo').disabled = busy; $('cancel-calibrate').hidden = !calibrating && state.sampleTeam === null;
  $('tracking-status').textContent = !worker ? 'Tracking unavailable in this browser' : readyToTrack() ? 'Experimental tracking active · human review required' : !state.calibration ? 'Waiting for calibration' : !state.background ? 'Next: save an empty board' : 'Next: sample both team colours';
  $('calibration-status').textContent = state.calibration ? `${state.projection ? 'Perspective fit' : state.mode === 'demo' ? 'Demo geometry' : 'Overhead fit'} · ${Math.round(state.calibration.discRadius * 2)} px puck diameter${state.projection ? ' in corrected view' : ''}` : 'Not calibrated';
  $('file-controls').hidden = state.mode !== 'file';
  $('record-hint').textContent = state.mode === 'demo' ? 'Demo is synthetic. Connect a camera to record real evidence.' : !window.MediaRecorder ? 'Recording is unavailable in this browser. You can still import clips.' : 'Start a clip before shooting. No pre-roll. Clips stop after 30 seconds.';
}
function resetStats() { state.lastTime = null; state.time = 0; state.gaps = []; state.observed = state.analysed = 0; state.fps = state.analysisFps = 0; state.statStart = performance.now(); $('observed-fps').textContent = '—'; $('frame-gap').textContent = '—'; }
function stopSource() {
  if (state.recording) { notify('Finish the current clip before changing the camera or source.', true); return false; }
  guide.cancel();
  state.token++;
  if (state.callback !== null && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(state.callback);
  if (state.raf !== null) cancelAnimationFrame(state.raf);
  state.callback = state.raf = null;
  state.stream?.getTracks().forEach(t => t.stop()); state.stream = null;
  video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  if (state.sourceURL) URL.revokeObjectURL(state.sourceURL); state.sourceURL = null;
  state.mode = 'idle'; state.projection = null; state.calibration = state.background = state.calibrationPoints = null; state.sampleTeam = null; state.colors = [null, null]; state.settings = {};
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
    notify('Camera connected. Calibrate the board, then save an empty-board view and sample the disc colours.');
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
  if (state.lastTime !== null && time < state.lastTime) { resetStats(); configureWorker(); }
  if (state.lastTime !== null && time > state.lastTime) { state.gaps.push(time - state.lastTime); state.gaps = state.gaps.slice(-120); }
  state.lastTime = state.time = time; state.observed++;
  if (state.calibrationPoints || state.sampleTeam !== null) return;
  if (state.mode !== 'demo') rawCtx.drawImage(video, 0, 0, raw.width, raw.height);
  ctx.drawImage(raw, 0, 0); drawOverlay();
  if (readyToTrack() && !state.inflight && !document.hidden) {
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
    const label = `${d.team === 0 ? 'A' : 'B'}${d.id}`; ctx.strokeText(label, edge.x + 6, p.y); ctx.fillText(label, edge.x + 6, p.y);
  }
  ctx.restore();
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
  state.colors[team] = color; state.sampleTeam = null; $('stage').classList.remove('calibrating');
  $('stage-hint').textContent = `Team ${team === 0 ? 'A' : 'B'} colour sampled. Tracking remains experimental.`; configureWorker();
});
function saveBackground() {
  if (!state.calibration || state.recording) return;
  smallCtx.drawImage(raw, 0, 0, small.width, small.height); state.background = smallCtx.getImageData(0, 0, small.width, small.height).data;
  configureWorker(); notify('Empty-board reference captured. Now place one disc from each team on the board and sample their centres.');
}
function sampleTeam(team) {
  if (!state.background || state.recording) return;
  state.sampleTeam = team; state.calibrationPoints = null; ctx.drawImage(raw, 0, 0); $('stage').classList.add('calibrating');
  $('stage-hint').textContent = `Click the solid centre of a TEAM ${team === 0 ? 'A' : 'B'} disc. View frozen.`; updateControls();
}
function circle(x, y, r, fill, stroke = null) { rawCtx.beginPath(); rawCtx.arc(x, y, r, 0, Math.PI * 2); rawCtx.fillStyle = fill; rawCtx.fill(); if (stroke) { rawCtx.strokeStyle = stroke; rawCtx.lineWidth = 2; rawCtx.stroke(); } }
function paintDemo(t, empty = false) {
  rawCtx.fillStyle = '#223e35'; rawCtx.fillRect(0, 0, 960, 720);
  circle(480, 360, 325, '#102a25'); circle(480, 360, 309, '#a78052'); circle(480, 360, 294, '#2d2922'); circle(480, 360, 280, '#dfc594', '#705939');
  for (const r of [185, 94]) circle(480, 360, r, '#dfc594', '#a48453');
  rawCtx.strokeStyle = '#705939'; rawCtx.lineWidth = 2;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; rawCtx.beginPath(); rawCtx.moveTo(480 + 268 * Math.cos(a), 360 + 268 * Math.sin(a)); rawCtx.lineTo(480 + 280 * Math.cos(a), 360 + 280 * Math.sin(a)); rawCtx.stroke(); }
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; circle(480 + Math.cos(a) * 94, 360 + Math.sin(a) * 94, 5, '#4a3929'); }
  circle(480, 360, 17, '#483927'); circle(480, 360, 12, '#302c22');
  rawCtx.fillStyle = '#886d48'; rawCtx.font = '16px Georgia'; rawCtx.textAlign = 'center'; rawCtx.fillText('5', 690, 363); rawCtx.fillText('10', 620, 363); rawCtx.fillText('15', 545, 363);
  if (empty) return;
  const a = [46, 113, 143], b = [168, 64, 54];
  const s = t % 7, moving = clamp(s - 1, 0, 0.6), hit = clamp(s - 1.6, 0, 0.55);
  circle(480, 572 - moving * 240, 14, `rgb(${a})`); circle(480, 400 - hit * 200, 14, `rgb(${b})`);
  circle(620, 290, 14, `rgb(${a})`); circle(340, 410, 14, `rgb(${b})`);
}
function startDemo() {
  if (!stopSource()) return;
  state.mode = 'demo'; resize(960, 720);
  state.calibration = makeCalibration([{ x: 480, y: 360 }, { x: 574, y: 360 }, { x: 665, y: 360 }, { x: 760, y: 360 }, { x: 620, y: 290 }, { x: 634, y: 290 }], 960, 720);
  paintDemo(0, true); smallCtx.drawImage(raw, 0, 0, small.width, small.height); state.background = smallCtx.getImageData(0, 0, small.width, small.height).data;
  state.colors = [[46, 113, 143], [168, 64, 54]]; state.demoStart = performance.now();
  $('welcome').hidden = true; $('demo-label').hidden = false; $('source-badge').textContent = 'DEMO · simulated board'; $('reported-fps').textContent = 'Synthetic';
  $('stage-hint').textContent = 'Synthetic motion through the same detector. This does not validate real-camera accuracy.';
  configureWorker(); const token = state.token;
  const tick = now => { if (state.mode !== 'demo' || token !== state.token) return; if (!state.calibrationPoints && state.sampleTeam === null) paintDemo((now - state.demoStart) / 1000); processFrame((now - state.demoStart) / 1000, now); state.raf = requestAnimationFrame(tick); };
  state.raf = requestAnimationFrame(tick); notify('Demo only: synthetic discs, synthetic motion. Your manual match scores are unchanged.');
}
function canAddClip(size = 0) {
  if (state.clips.length >= 6) { notify('The six-clip limit is reached. Export and remove a clip before adding another.', true); return false; }
  if (size > MAX_CLIP || state.clips.reduce((n, c) => n + c.blob.size, 0) + size > MAX_TOTAL) { notify('Clip storage limit reached (64 MB per clip / 128 MB total). Export and remove clips to make space.', true); return false; }
  return true;
}
function formatTime(seconds) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function addClip(blob, details) {
  if (!canAddClip(blob.size)) return false;
  state.clips.unshift({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), createdAt: new Date().toISOString(), verdict: 'review-needed', note: '', contacts: [], ...details }); renderClips(); return true;
}
function startClip() {
  if (state.mode !== 'camera' || !state.stream || state.recording || !window.MediaRecorder || !canAddClip(MAX_CLIP)) return;
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
  try {
    const recorder = new MediaRecorder(state.stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6000000 });
    const record = { recorder, chunks: [], bytes: 0, started: performance.now(), sourceStart: state.time, contacts: [], trackingGaps: 0, snapshot: configSnapshot(), resolve: null };
    state.recording = record;
    record.done = new Promise(resolve => { record.resolve = resolve; });
    recorder.ondataavailable = e => { if (e.data.size) { record.chunks.push(e.data); record.bytes += e.data.size; if (record.bytes > MAX_CLIP && recorder.state !== 'inactive') recorder.stop(); } };
    recorder.onerror = () => { record.error = true; notify('The browser reported a recording error. Any partial clip will be labelled incomplete.', true); if (recorder.state !== 'inactive') recorder.stop(); };
    recorder.onstop = () => {
      clearTimeout(record.timer); const duration = (performance.now() - record.started) / 1000;
      const blob = new Blob(record.chunks, { type: recorder.mimeType || mime || 'video/webm' });
      const added = blob.size && addClip(blob, { title: `Shot ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, source: 'camera', duration, complete: !record.error, contacts: record.contacts.map(e => ({ ...e, from: Math.max(0, e.from - record.sourceStart), to: Math.max(0, e.to - record.sourceStart) })), trackingGaps: record.trackingGaps, configuration: record.snapshot, timing: { observedFps: state.fps, analysedFps: state.analysisFps, maxObservedGapMs: state.gaps.length ? Math.max(...state.gaps) * 1000 : null } });
      state.recording = null; updateControls(); record.resolve();
      if (added) notify(record.error ? 'An incomplete clip was retained. Review and export it; do not rely on it for a verdict.' : 'Clip retained in this tab. Open Review to replay it or export the original video.', !!record.error);
      else if (!blob.size) notify('The recording contained no video data. Please try another capture mode.', true);
    };
    recorder.start(250); record.timer = setTimeout(finishClip, 30000); updateControls(); notify('Recording now. Take the shot, then press Finish clip. No automatic verdict will be applied.');
  } catch (error) { state.recording = null; updateControls(); notify(`Recording could not start: ${error.message}`, true); }
}
function finishClip() {
  const r = state.recording; if (!r) return Promise.resolve();
  $('stop-record').disabled = true;
  if (r.recorder.state !== 'inactive') r.recorder.stop();
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
    state.mode = 'file'; resize(video.videoWidth, video.videoHeight);
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
    title.textContent = c.title; sub.textContent = `${c.duration === null ? 'Duration unknown' : formatTime(c.duration)} · ${(c.blob.size / MB).toFixed(1)} MB · ${c.verdict}${c.complete === false ? ' · INCOMPLETE' : ''}`;
    info.append(title, sub); const actions = document.createElement('div'); actions.className = 'clip-actions';
    const review = document.createElement('button'); review.textContent = 'Review'; review.className = 'secondary'; review.onclick = () => openReplay(c.id);
    const remove = document.createElement('button'); remove.textContent = '×'; remove.className = 'text-button'; remove.setAttribute('aria-label', `Remove ${c.title}`); remove.onclick = () => {
      if (!confirm('Remove this clip from the tab? Export its video first to keep it.')) return;
      URL.revokeObjectURL(c.url); state.clips = state.clips.filter(v => v.id !== c.id); renderClips();
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
  for (const e of c.contacts) { const p = document.createElement('p'); p.textContent = `${e.from.toFixed(3)}–${e.to.toFixed(3)} s · ${e.teams[0] === 0 ? 'A' : 'B'}${e.ids[0]} ↔ ${e.teams[1] === 0 ? 'A' : 'B'}${e.ids[1]} · proximity only, not a proven collision`; $('replay-events').append(p); }
  $('replay-dialog').showModal();
}
function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000); }
function exportSession() {
  const payload = { schemaVersion: 1, appVersion: VERSION, exportedAt: new Date().toISOString(), automaticVerdictsEnabled: false, activeConfiguration: configSnapshot(), match: { names: state.names, mode: $('score-mode').value, scores: state.scores, totals: state.totals, round: state.round, rounds: state.rounds }, clips: state.clips.map(({ blob, url, ...c }) => ({ ...c, videoIncluded: false, videoMime: blob.type, videoBytes: blob.size })), limitations: ['No automatic first-contact or foul decisions.', 'Proximity is not proof of impact.', 'Angled calibration corrects the board plane, not occlusion, lens distortion or puck/peg height.', 'Video must be exported separately.', 'Observed callbacks are not a sensor-frame guarantee.'] };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `crokinole-match-${new Date().toISOString().slice(0, 10)}.json`);
}
function saveMatch() { try { localStorage.setItem('crokinole-ref-match-v1', JSON.stringify({ names: state.names, scores: state.scores, totals: state.totals, rounds: state.rounds, round: state.round, mode: $('score-mode').value })); } catch { notify('Browser storage is unavailable. Export the match log before closing.', true); } }
function loadMatch() {
  try {
    const data = JSON.parse(localStorage.getItem('crokinole-ref-match-v1') || 'null');
    if (!data) return;
    const pair = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isSafeInteger(n) && n >= 0);
    if (!Array.isArray(data.rounds) || !data.rounds.every(r => r && Number.isSafeInteger(r.round) && r.round > 0 && pair(r.scores) && pair(r.awarded) && ['match', 'difference'].includes(r.mode))) return;
    if (!pair(data.scores) || !pair(data.totals) || !Number.isSafeInteger(data.round) || data.round < 1 || !Array.isArray(data.rounds) || !Array.isArray(data.names) || data.names.length !== 2 || !data.names.every(n => typeof n === 'string') || !['match', 'difference'].includes(data.mode)) return;
    state.names = data.names.map(n => n.slice(0, 40)); state.scores = data.scores; state.totals = data.totals; state.rounds = data.rounds.slice(-100); state.round = data.round; $('score-mode').value = data.mode;
  } catch { /* Corrupt or disabled local storage is not fatal. */ }
}
function snapshotScore() { state.undo.push(JSON.stringify({ scores: state.scores, totals: state.totals, rounds: state.rounds, round: state.round, mode: $('score-mode').value })); state.undo = state.undo.slice(-100); }
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
    for (const points of [5, 10, 15, 20]) { const b = document.createElement('button'); b.textContent = `+${points}`; b.setAttribute('aria-label', `Add ${points} points to team ${team === 0 ? 'A' : 'B'}`); b.onclick = () => { snapshotScore(); state.scores[team] += points; saveMatch(); renderScore(); }; buttons.append(b); }
    const total = document.createElement('div'); total.className = 'match-total'; total.textContent = `Match total: ${state.totals[team]}`;
    card.append(header, number, caption, buttons, total); $('players').append(card);
  }
  $('round-status').textContent = `Round ${state.round} · Enter disc points and 20s manually. Detection never changes your score.`;
  $('undo-score').disabled = !state.undo.length; $('score-mode').disabled = state.rounds.length > 0;
  $('round-history').replaceChildren();
  for (const r of [...state.rounds].reverse().slice(0, 10)) { const row = document.createElement('div'); row.className = 'round-entry'; row.textContent = `Round ${r.round}: ${r.scores?.join(' – ')} → awarded ${r.awarded?.join(' – ')}`; $('round-history').append(row); }
}
$('connect').onclick = connect; $('refresh-cameras').onclick = listCameras; $('stop-source').onclick = stopSource; $('demo').onclick = startDemo;
$('calibrate').onclick = startCalibration; $('cancel-calibrate').onclick = cancelCalibration; $('background').onclick = saveBackground;
$('sample-a').onclick = () => sampleTeam(0); $('sample-b').onclick = () => sampleTeam(1);
$('tolerance').oninput = () => { $('tolerance-value').value = $('tolerance').value; configureWorker(); };
$('overlays').onchange = () => { if (state.mode !== 'idle') { ctx.drawImage(raw, 0, 0); drawOverlay(); } };
$('record').onclick = startClip; $('stop-record').onclick = finishClip;
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
$('save-verdict').onclick = () => { const c = state.clips.find(v => v.id === state.selected); if (c) { c.verdict = $('verdict').value; c.note = $('review-note').value.trim(); c.reviewedAt = new Date().toISOString(); c.decisionSource = 'human'; renderClips(); $('replay-dialog').close(); notify('Manual decision saved in this tab. Export the match log to preserve your notes. Scores are unchanged.'); } };
$('export-session').onclick = exportSession;
$('finish-round').onclick = () => {
  if (!confirm(`Finish round ${state.round} with ${state.scores[0]} – ${state.scores[1]} points?`)) return;
  snapshotScore(); const awarded = roundResult(...state.scores, $('score-mode').value);
  state.rounds.push({ round: state.round, scores: [...state.scores], awarded, mode: $('score-mode').value });
  state.totals = state.totals.map((n, i) => n + awarded[i]); state.scores = [0, 0]; state.round++; saveMatch(); renderScore();
};
$('undo-score').onclick = () => { const previous = state.undo.pop(); if (previous) { const { mode, ...values } = JSON.parse(previous); Object.assign(state, values); $('score-mode').value = mode; saveMatch(); renderScore(); } };
$('score-mode').onchange = saveMatch;
$('new-match').onclick = () => { if (!confirm('Start a new match? Scores and round history will reset. Clips remain in this tab.')) return; snapshotScore(); state.scores = [0, 0]; state.totals = [0, 0]; state.rounds = []; state.round = 1; saveMatch(); renderScore(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && state.recording) { state.recording.trackingGaps++; notify('Tab hidden: tracking may pause. Recording may continue, but contact evidence can be incomplete.', true); } resetStats(); configureWorker(); });
window.addEventListener('beforeunload', e => { if (state.clips.length || state.recording) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('pagehide', () => { state.stream?.getTracks().forEach(t => t.stop()); });
loadMatch(); renderScore(); updateControls(); listCameras();
