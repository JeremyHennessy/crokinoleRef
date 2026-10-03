/** Pure, testable geometry and diagnostic vision. No automatic referee decisions. */
export const VERSION = '0.2.0';
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
  return { center, rings, discRadius, width, height, mode: 'overhead' };
}

function quadArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Solve the projective transform that maps four source points to four destination points. */
export function homographyFromFourPoints(source, destination) {
  if (source?.length !== 4 || destination?.length !== 4 || [...source, ...destination].some(p => !Number.isFinite(p.x + p.y))) {
    throw Error('Four valid source and destination points are required.');
  }
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = source[i], { x: u, y: v } = destination[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (Math.abs(rows[pivot][col]) < 1e-9) throw Error('Those calibration points do not define a stable perspective. Restart and click the four outer-ring intersections carefully.');
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let j = col; j < 9; j++) rows[col][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = rows[row][col];
      if (!factor) continue;
      for (let j = col; j < 9; j++) rows[row][j] -= factor * rows[col][j];
    }
  }
  const h = rows.map(row => row[8]);
  return [...h, 1];
}

export function projectPoint(matrix, point) {
  if (!matrix || matrix.length !== 9 || !Number.isFinite(point?.x + point?.y)) throw Error('A valid projective transform and point are required.');
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) throw Error('Perspective mapping became unstable.');
  return {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator
  };
}

/**
 * Angled-view calibration.
 * Click order:
 *   0..3 = four quadrant-divider / outer-scoring-circle intersections, clockwise,
 *          starting at the far side of the board
 *   4 = 20-hole centre
 *   5 = 15/10 scoring-line point
 *   6 = 10/5 scoring-line point
 *   7 = disc centre
 *   8 = edge of that same disc
 */
export function makePerspectiveCalibration(points, width, height) {
  if (points?.length !== 9 || points.some(p => !Number.isFinite(p.x + p.y))) throw Error('Nine valid calibration points are required.');
  if (!(width > 0 && height > 0)) throw Error('A valid camera frame is required.');
  const outer = points.slice(0, 4);
  if (quadArea(outer) < width * height * 0.015) throw Error('The four outer-ring points are too close together. Keep the whole scoring circle in view and click its four quadrant-line intersections.');
  const center = { x: width / 2, y: height / 2 };
  const outerRadius = Math.min(width, height) * 0.4;
  const destination = [
    { x: center.x, y: center.y - outerRadius },
    { x: center.x + outerRadius, y: center.y },
    { x: center.x, y: center.y + outerRadius },
    { x: center.x - outerRadius, y: center.y }
  ];
  const forward = homographyFromFourPoints(outer, destination);
  const inverse = homographyFromFourPoints(destination, outer);
  const mappedCenter = projectPoint(forward, points[4]);
  const centerResidual = distance(mappedCenter, center);
  if (centerResidual > outerRadius * 0.14) {
    throw Error('Perspective check failed: the 20 hole does not land near the corrected centre. Undo and recheck the four outer intersections in clockwise order.');
  }
  const mappedInner = projectPoint(forward, points[5]);
  const mappedMiddle = projectPoint(forward, points[6]);
  const rings = [distance(center, mappedInner), distance(center, mappedMiddle), outerRadius];
  if (!(rings[0] > 10 && rings[1] > rings[0] * 1.2 && rings[2] > rings[1] * 1.1)) {
    throw Error('The scoring-ring clicks are out of order. Click the 15/10 boundary first, then the 10/5 boundary.');
  }
  const mappedDisc = projectPoint(forward, points[7]);
  const mappedEdge = projectPoint(forward, points[8]);
  const discRadius = distance(mappedDisc, mappedEdge);
  if (discRadius < 2 || discRadius > rings[0] / 3) throw Error('Disc size looks wrong. Click the centre of one disc, then the visible edge of that same disc.');
  return {
    center, rings, discRadius, width, height, mode: 'perspective',
    perspective: {
      sourcePoints: outer,
      destinationPoints: destination,
      forward,
      inverse,
      centerResidual
    }
  };
}

export function scaleCalibration(c, scale) {
  const scaled = {
    ...c,
    center: { x: c.center.x * scale, y: c.center.y * scale },
    rings: c.rings.map(r => r * scale),
    discRadius: c.discRadius * scale,
    width: c.width * scale,
    height: c.height * scale
  };
  if (c.perspective) {
    const sourcePoints = c.perspective.sourcePoints.map(p => ({ x: p.x * scale, y: p.y * scale }));
    const destinationPoints = c.perspective.destinationPoints.map(p => ({ x: p.x * scale, y: p.y * scale }));
    scaled.perspective = {
      sourcePoints,
      destinationPoints,
      forward: homographyFromFourPoints(sourcePoints, destinationPoints),
      inverse: homographyFromFourPoints(destinationPoints, sourcePoints),
      centerResidual: c.perspective.centerResidual * scale
    };
  }
  return scaled;
}

/** Rectify an angled camera frame into the calibration's top-down coordinate system. */
export function warpPerspectiveRGBA(data, width, height, calibration) {
  if (!calibration?.perspective) return new Uint8ClampedArray(data);
  if (!data || data.length !== width * height * 4) throw Error('Perspective frame dimensions do not match the pixel buffer.');
  const out = new Uint8ClampedArray(data.length);
  const h = calibration.perspective.inverse;
  const cx = calibration.center.x, cy = calibration.center.y;
  const radius = calibration.rings[2] + calibration.discRadius * 2.5;
  const minX = Math.max(0, Math.floor(cx - radius)), maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius)), maxY = Math.min(height - 1, Math.ceil(cy + radius));
  const radius2 = radius * radius;
  for (let y = minY; y <= maxY; y++) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy > radius2) continue;
      const denominator = h[6] * x + h[7] * y + h[8];
      if (Math.abs(denominator) < 1e-9) continue;
      const sx = Math.round((h[0] * x + h[1] * y + h[2]) / denominator);
      const sy = Math.round((h[3] * x + h[4] * y + h[5]) / denominator);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const source = (sy * width + sx) * 4, target = (y * width + x) * 4;
      out[target] = data[source];
      out[target + 1] = data[source + 1];
      out[target + 2] = data[source + 2];
      out[target + 3] = data[source + 3];
    }
  }
  return out;
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
    return { discs: current, contacts, discontinuity };
  }
}
