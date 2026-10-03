import { detectDiscs, Tracker } from './core.js';
import { createWarpMap, warpPixels } from './perspective.js';
import { AutoShotAnalyzer } from './auto-referee.js';

let background = null, calibration = null, colors = [null, null], tolerance = 70, generation = 0, warp = null, scratch = null;
const tracker = new Tracker();
let referee = new AutoShotAnalyzer(null);

self.onmessage = ({ data: m }) => {
  if (m.type === 'configure') {
    ({ calibration, colors, tolerance, generation } = m);
    tracker.reset(); warp = scratch = null; background = m.background;
    referee = new AutoShotAnalyzer(calibration);
    try {
      if (m.warp && calibration) {
        warp = createWarpMap(m.warp.width, m.warp.height, calibration.width, calibration.height, m.warp.matrix);
        scratch = new Uint8ClampedArray(calibration.width * calibration.height * 4);
        if (background) background = warpPixels(background, warp);
      }
    } catch (error) { self.postMessage({ type: 'error', generation, message: error.message }); }
    return;
  }
  if (m.type === 'reset-round') {
    referee.resetRound();
    return;
  }
  if (m.type !== 'frame' || m.generation !== generation) return;
  try {
    const input = new Uint8ClampedArray(m.buffer), pixels = warp ? warpPixels(input, warp, scratch) : input;
    const width = warp ? calibration.width : m.width, height = warp ? calibration.height : m.height;
    const detections = detectDiscs(pixels, background, width, height, calibration, colors, tolerance);
    const tracking = tracker.update(detections, m.time);
    const auto = referee.update(tracking, m.time);
    self.postMessage({ type: 'result', generation, time: m.time, ...tracking, auto });
  } catch (error) { self.postMessage({ type: 'error', generation, message: error.message }); }
};
