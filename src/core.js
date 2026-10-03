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
  return { ...c, center: { x: c.center.x * scale, y: c.center.y * scale }, rings: c.rings.map(r => r * scale), discRadius: c.discRadius * scale, width: c.width * scale, height: c.height * scale };
}
/** A suggested resting score only. Line-edge uncertainty must be reviewed. Never infers a 20. */
export function suggestedScore(disc, c, tolerance = 2) {
  const farEdge = distance(disc, c.center) + disc.r;
  const nearLine = c.rings.some(r => Math.abs(farEdge - r) <= tolerance);
  const value = farEdge < c.rings[0] ? 15 : farEdge < c.rings[1] ? 10 : farEdge < c.rings[2] ? 5 : 0;
  return { value, review: nearLine || distance(disc, c.center) < c.discRadius * 1.5 };
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
  if (!calibration || !background || background.length !== data.length || !colors?.every(Boolean)) return [];
  const n = width * height, mask = new Uint8Array(n), stack = new Int32Array(n);
  const [cx, cy] = [calibration.center.x, calibration.center.y], boardR = calibration.rings[2];
  const colorLimit = tolerance * tolerance, bgLimit = 28 * 28;
  for (let y = Math.max(0, Math.floor(cy - boardR)); y < Math.min(height, cy + boardR); y++) {
    for (let x = Math.max(0, Math.floor(cx - boardR)); x < Math.min(width, cx + boardR); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > boardR ** 2) continue;
      const p = y * width + x, i = p * 4;
      let bg = 0; for (let k = 0; k < 3; k++) bg += (data[i + k] - background[i + k]) ** 2;
      if (bg < bgLimit) continue;
      const ds = colors.map(c => c.reduce((s, v, k) => s + (data[i + k] - v) ** 2, 0));
      if (Math.min(...ds) < colorLimit && Math.abs(ds[0] - ds[1]) > 225) mask[p] = ds[0] < ds[1] ? 1 : 2;
    }
  }
  const result = [], expected = Math.PI * calibration.discRadius ** 2;
  for (let start = 0; start < n; start++) {
    const team = mask[start]; if (!team) continue;
    let top = 0, count = 0, sx = 0, sy = 0, minX = width, minY = height, maxX = 0, maxY = 0;
    stack[top++] = start; mask[start] = 0;
    while (top) {
      const p = stack[--top], x = p % width, y = Math.floor(p / width);
      count++; sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const neighbors = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of neighbors) if (q >= 0 && mask[q] === team) { mask[q] = 0; stack[top++] = q; }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (count >= expected * 0.3 && count <= expected * 1.65 && bw / bh > 0.6 && bw / bh < 1.65 && count / (bw * bh) > 0.45) {
      result.push({ x: sx / count, y: sy / count, r: calibration.discRadius, team: team - 1 });
    }
  }
  return result.slice(0, 32);
}
export class Tracker {
  constructor() { this.reset(); }
  reset() { this.previous = []; this.nextId = 1; this.time = null; }
  update(detections, time) {
    const dt = this.time === null ? null : time - this.time;
    const gap = dt === null || dt <= 0 || dt > 0.15;
    const old = gap ? [] : this.previous;
    const proposals = [];
    detections.forEach((d, i) => old.forEach(p => { const dist = distance(d, p); if (d.team === p.team && dist < d.r * 5) proposals.push({ i, p, dist }); }));
    proposals.sort((a, b) => a.dist - b.dist);
    const assigned = new Map(), used = new Set();
    for (const pair of proposals) {
      if (assigned.has(pair.i) || used.has(pair.p.id)) continue;
      const ambiguous = proposals.some(q => q !== pair && (q.i === pair.i || q.p.id === pair.p.id) && Math.abs(q.dist - pair.dist) < detections[pair.i].r);
      if (!ambiguous) { assigned.set(pair.i, pair.p); used.add(pair.p.id); }
    }
    const current = detections.map((d, i) => ({ ...d, id: assigned.get(i)?.id ?? this.nextId++ }));
    const contacts = [];
    for (let i = 0; i < current.length; i++) for (let j = i + 1; j < current.length; j++) {
      const a = current[i], b = current[j], pa = old.find(p => p.id === a.id), pb = old.find(p => p.id === b.id);
      if (!pa || !pb) continue;
      const threshold = a.r + b.r + 2;
      if (distance(a, b) <= threshold && distance(pa, pb) > threshold && Math.max(distance(a, pa), distance(b, pb)) > a.r * 0.12) {
        contacts.push({ ids: [a.id, b.id], teams: [a.team, b.team], from: this.time, to: time, kind: 'proximity-only', decision: 'review-needed' });
      }
    }
    const discontinuity = gap || old.some(p => !current.some(d => d.id === p.id));
    this.previous = current; this.time = time;
    return { discs: current, contacts, discontinuity, frameGap: gap };
  }
}
