import { detectDiscs, Tracker, warpPerspectiveRGBA } from './core.js';
let background = null, calibration = null, colors = [null, null], tolerance = 70, generation = 0, width = 0, height = 0;
const tracker = new Tracker();

function preparePixels(pixels) {
  if (!calibration?.perspective) return pixels;
  return warpPerspectiveRGBA(pixels, width, height, calibration);
}

self.onmessage = ({ data: m }) => {
  if (m.type === 'configure') {
    ({ calibration, colors, tolerance, generation } = m);
    width = m.width || 0; height = m.height || 0;
    const supplied = m.background ? new Uint8ClampedArray(m.background) : null;
    background = supplied && calibration?.perspective ? preparePixels(supplied) : supplied;
    tracker.reset();
    return;
  }
  if (m.type !== 'frame' || m.generation !== generation) return;
  try {
    width = m.width; height = m.height;
    const pixels = preparePixels(new Uint8ClampedArray(m.buffer));
    const detections = detectDiscs(pixels, background, width, height, calibration, colors, tolerance);
    self.postMessage({ type: 'result', generation, time: m.time, ...tracker.update(detections, m.time) });
  } catch (error) {
    self.postMessage({ type: 'error', generation, message: error.message });
  }
};
