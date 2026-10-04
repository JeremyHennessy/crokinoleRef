import { fitCluster } from './cluster-evidence.js';
/** Pure, testable geometry and diagnostic vision. No automatic referee decisions. */
export const VERSION = '0.1.0';
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function makeCalibration(points, width, height) {
  if (points.length !== 6 || points.some(p => !Number.isFinite(p.x + p.y))) throw Error('Six valid calibration points are required.');
  const [center, inner, middle, outer, disc, edge] = points;
  const rings = [inner, middle, outer].map(p => distance(center, p));
  const discRadius = distance(disc, edge);
  if (!(rings[0] > 10 && rings[1] > rings[0] * 1.2 && rings[2] > rings[1] * 1.1)) throw Error('Ring sizes must increase: 15, 10, then outer 5 line. Please recalibrate.');
  if (discRadius < 2 || discRadius > rings[0] / 3) throw Error('Disc size looks wrong. Click a disc centre, then its edge.');
  if (center.x - rings[2] < -2 || center.y - rings[2] < -2 || center.x + rings[2] > width + 2 || center.y + rings[2] > height + 2) throw Error('The outer scoring circle must fit inside the image.');
  return { center, rings, discRadius, width, height };
}
export function scaleCalibration(c, scale) {
  return { ...c, center: { x: c.center.x * scale, y: c.center.y * scale }, rings: c.rings.map(r => r * scale), discRadius: c.discRadius * scale, ...(Number.isFinite(c.radiusUncertainty)?{radiusUncertainty:c.radiusUncertainty*scale}:{}), width: c.width * scale, height: c.height * scale };
}
/** A suggested resting score only. Line-edge uncertainty must be reviewed. Never infers a 20. */
export function suggestedScore(disc, c, tolerance = 2) {
  const farEdge = distance(disc, c.center) + disc.r;
  const edgeTolerance=Math.max(tolerance,c.radiusUncertainty||0,disc.radiusUncertainty||0);
  const nearLine = c.rings.some(r => Math.abs(farEdge - r) <= edgeTolerance);
  const value = farEdge < c.rings[0] ? 15 : farEdge < c.rings[1] ? 10 : farEdge < c.rings[2] ? 5 : 0;
  return { value, review: !!disc.footprintReview || nearLine || distance(disc, c.center) < c.discRadius * 1.5 };
}
export function roundResult(a, b, mode = 'difference') {
  if (![a, b].every(v => Number.isFinite(v) && v >= 0 && Number.isInteger(v))) throw Error('Scores must be non-negative whole numbers.');
  if (!['difference', 'match'].includes(mode)) throw Error('Unknown scoring mode.');
  if (mode === 'match') return a === b ? [1, 1] : a > b ? [2, 0] : [0, 2];
  return [Math.max(0, a - b), Math.max(0, b - a)];
}
export function captureConstraints(mode, deviceId = '') {
  const [width, height, fps] = mode === '720-60' ? [1280, 720, 60] : [1920, 1080, 30];
  return { audio: false, video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps }, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } };
}
export function averageColor(data, width, height, x, y, radius = 2) {
  const sum = [0, 0, 0]; let n = 0;
  for (let yy = Math.max(0, Math.round(y) - radius); yy <= Math.min(height - 1, Math.round(y) + radius); yy++) {
    for (let xx = Math.max(0, Math.round(x) - radius); xx <= Math.min(width - 1, Math.round(x) + radius); xx++) {
      const i = (yy * width + xx) * 4; for (let k = 0; k < 3; k++) sum[k] += data[i + k]; n++;
    }
  }
  return sum.map(v => Math.round(v / Math.max(1, n)));
}
/** Background subtraction + colour segmentation + connected-component shape filter.
 * Touching same-colour discs can merge; missing detections must never become a foul. */
export function detectDiscs(data, background, width, height, calibration, colors, tolerance = 70) {
  return detectDiscEvidence(data,background,width,height,calibration,colors,tolerance).discs;
}
/** Per-worker scratch space. It contains no retained detections or score state. */
export function createDetectionWorkspace(width,height) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>16777216)throw Error('Invalid detection workspace size.');
  return {width,height,mask:new Uint8Array(width*height),stack:new Int32Array(width*height)};
}
export function detectDiscEvidence(data, background, width, height, calibration, colors, tolerance = 70, workspace = null) {
  if (!calibration || !background || background.length !== data.length || !colors?.every(Boolean)) return {discs:[],unresolved:[],clusterCandidates:[]};
  if(workspace&&(workspace.width!==width||workspace.height!==height))throw Error('Detection workspace does not match this frame.');
  const n = width * height, buffers=workspace||createDetectionWorkspace(width,height), {mask,stack}=buffers;
  mask.fill(0);
  const [cx, cy] = [calibration.center.x, calibration.center.y], boardR = calibration.rings[2];
  const colorLimit = tolerance * tolerance, bgLimit = 28 * 28;
  for (let y = Math.max(0, Math.floor(cy - boardR)); y < Math.min(height, cy + boardR); y++) {
    for (let x = Math.max(0, Math.floor(cx - boardR)); x < Math.min(width, cx + boardR); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > boardR ** 2) continue;
      const p = y * width + x, i = p * 4;
      let bg = 0; for (let k = 0; k < 3; k++) bg += (data[i + k] - background[i + k]) ** 2;
      if (bg < bgLimit) continue;
      // Same RGB squared distances, without allocating arrays/closures per pixel.
      const a=(data[i]-colors[0][0])**2+(data[i+1]-colors[0][1])**2+(data[i+2]-colors[0][2])**2;
      const b=(data[i]-colors[1][0])**2+(data[i+1]-colors[1][1])**2+(data[i+2]-colors[1][2])**2;
      if (Math.min(a,b) < colorLimit && Math.abs(a-b) > 225) mask[p] = a < b ? 1 : 2;
    }
  }
  const result = [], unresolved=[], clusterCandidates=[], expected = Math.PI * calibration.discRadius ** 2;
  for (let start = 0; start < n; start++) {
    const team = mask[start]; if (!team) continue;
    const members=[];
    let top = 0, count = 0, sx = 0, sy = 0, minX = width, minY = height, maxX = 0, maxY = 0;
    stack[top++] = start; mask[start] = 0;
    while (top) {
      const p = stack[--top], x = p % width, y = Math.floor(p / width);
      members.push(p); count++; sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      // Preserve the original traversal order (left, right, up, down).
      if(x>0&&mask[p-1]===team){mask[p-1]=0;stack[top++]=p-1;}
      if(x<width-1&&mask[p+1]===team){mask[p+1]=0;stack[top++]=p+1;}
      if(y>0&&mask[p-width]===team){mask[p-width]=0;stack[top++]=p-width;}
      if(y<height-1&&mask[p+width]===team){mask[p+width]=0;stack[top++]=p+width;}
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (count >= expected * 0.3 && count <= expected * 1.65 && bw / bh > 0.6 && bw / bh < 1.65 && count / (bw * bh) > 0.45) {
      result.push({ x: sx / count, y: sy / count, r: calibration.discRadius, team: team - 1 });
    } else if(count>=expected*.3){
      unresolved.push({x:minX,y:minY,width:bw,height:bh,area:count,team:team-1,kind:'rejected-puck-region'});
      clusterCandidates.push(...fitCluster(members,width,{minX,minY,maxX,maxY},calibration.discRadius,team-1));
    }
  }
  return {discs:result.slice(0,32),unresolved:unresolved.slice(0,32),clusterCandidates:clusterCandidates.slice(0,24)};
}
// Public API retained for existing worker and tests.
export { MotionTracker as Tracker } from './motion-tracker.js';
