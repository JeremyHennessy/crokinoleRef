import { detectDiscs, Tracker } from './core.js';
let background = null, calibration = null, colors = [null, null], tolerance = 70, generation = 0;
const tracker = new Tracker();
self.onmessage = ({ data: m }) => {
  if (m.type === 'configure') {
    ({ calibration, colors, tolerance, generation } = m); background = m.background; tracker.reset(); return;
  }
  if (m.type !== 'frame' || m.generation !== generation) return;
  try {
    const detections = detectDiscs(new Uint8ClampedArray(m.buffer), background, m.width, m.height, calibration, colors, tolerance);
    self.postMessage({ type: 'result', generation, time: m.time, ...tracker.update(detections, m.time) });
  } catch (error) { self.postMessage({ type: 'error', generation, message: error.message }); }
};
