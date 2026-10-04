import { detectDiscEvidence, Tracker } from './core.js';
import { createWarpMap, warpPixels } from './perspective.js';
import { AutoShotAnalyzer } from './auto-referee.js';
import { assessVisibility } from './visibility.js';
import { TeamColourLearner, findColourPucks } from './team-colours.js';

let background = null, calibration = null, colors = [null, null], tolerance = 70, generation = 0, warp = null, scratch = null;
const tracker = new Tracker();
let learner=new TeamColourLearner(), autoColours=true, lastLearn=-Infinity;
let referee = new AutoShotAnalyzer(null);

self.onmessage = ({ data: m }) => {
  if (m.type === 'configure') {
    ({ calibration, colors, tolerance, generation } = m);
    tracker.reset(); learner=new TeamColourLearner(colors);autoColours=m.autoColours!==false;lastLearn=-Infinity; warp = scratch = null; background = m.background;
    referee = new AutoShotAnalyzer(calibration);
    referee.requireEmpty = !!m.requireEmpty;
    try {
      if (m.warp && calibration) {
        warp = createWarpMap(m.warp.width, m.warp.height, calibration.width, calibration.height, m.warp.matrix);
        scratch = new Uint8ClampedArray(calibration.width * calibration.height * 4);
        if (background) background = warpPixels(background, warp);
      }
    } catch (error) { self.postMessage({ type: 'error', generation, message: error.message }); }
    return;
  }
  if (m.type === 'reset-round' && m.generation === generation) {
    referee.resetRound();
    return;
  }
  if (m.type !== 'frame' || m.generation !== generation) return;
  try {
    const input = new Uint8ClampedArray(m.buffer), pixels = warp ? warpPixels(input, warp, scratch) : input;
    const width = warp ? calibration.width : m.width, height = warp ? calibration.height : m.height;
    if(!colors.every(Boolean)&&autoColours){
      let learned={colors:null,status:'Looking for two still, separate puck colours…'};
      if(m.time-lastLearn>=.08){
        lastLearn=m.time;
        const candidates=findColourPucks(pixels,background,width,height,calibration);
        const visible=assessVisibility(pixels,background,width,height,calibration,candidates);
        learned=learner.update(visible.viewObstructed?[]:candidates,m.time);
      }
      if(learned.colors){colors=learned.colors;if(learned.measurement){calibration={...calibration,discRadius:learned.measurement.radius,radiusUncertainty:learned.measurement.uncertainty,radiusSource:learned.measurement.source};referee.setCalibration(calibration);}tracker.reset();referee.resetRound();}
      self.postMessage({type:'colours',generation,...learned});return;
    }
    const evidence = detectDiscEvidence(pixels, background, width, height, calibration, colors, tolerance);
    const detections=evidence.discs;
    const tracking = tracker.update(detections, m.time);
    const visibility = assessVisibility(pixels, background, width, height, calibration, tracking.discs);
    if(evidence.unresolved.length)visibility.viewObstructed=true;
    const auto = referee.update({...tracking,...visibility}, m.time);
    self.postMessage({ type: 'result', generation, time: m.time, ...tracking, auto, visibility, detectionEvidence:{unresolved:evidence.unresolved,clusterCandidates:evidence.clusterCandidates} });
  } catch (error) { self.postMessage({ type: 'error', generation, message: error.message }); }
};
