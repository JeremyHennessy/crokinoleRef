from pathlib import Path
import hashlib

expected={
 'src/core.js':('7386536b6a0f3f42d87cf2b106006ba6e30fbd0a315b2456f8fbd5953d003088','9187e16c784000cc0f94adb6cfa3e721f0baf3ca4aee3fd01d0a3e67bbfbd261'),
 'src/visibility.js':('93488d9077ebf9c5e38bfa63fe486ee1230bef4664eca6906aa47661989448ce','a7e4bc5f3b532a858672cffb39f44b507416e60dc96760fabcae1dc084aec8bf'),
 'src/vision-worker.js':('6ae6d27ec92ef1a28d5fda58cc4aae5f02acd47bada64dec3df57b897937f718','3087aca55aa23f1418ac334b106f2e85b0a1d7c65277a52fe51800171eaa36df'),
 'src/diagnostics.js':('20773dfbb0e2d0c2f0998aa4dd2eea8c4c842f895ed7c9a9013e20e48fda0363','5b21613ae898d3d94d5a68651aeb42de4b546ba7c36030db87109b98b73b8568'),
 'src/app.js':('ae498f97094e481d8053bff241ac09743376ebd9c7d8f6f7372f8efda65f4714','d58cf55c6513acc0aa90582a65b0eab25a9c3b769e599567888e77c536585f89'),
 'docs/HANDOFF.md':('1d960aeed2002060678eb0d10e2e22b71f68b43d34856d77921ead824fd66208','f0c25c750b9e6e63c6cd64f52e131515b98b1219b41d973c303d102d3f8cdd61')
}
contents={name:Path(name).read_text() for name in expected}
for name,s in contents.items():assert hashlib.sha256(s.encode()).hexdigest()==expected[name][0],name

def replace(name,old,new):
 s=contents[name];assert s.count(old)==1,(name,old);contents[name]=s.replace(old,new)

p='src/core.js'
replace(p,'export function detectDiscEvidence(data, background, width, height, calibration, colors, tolerance = 70) {',"""/** Per-worker scratch space. It contains no retained detections or score state. */
export function createDetectionWorkspace(width,height) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>16777216)throw Error('Invalid detection workspace size.');
  return {width,height,mask:new Uint8Array(width*height),stack:new Int32Array(width*height)};
}
export function detectDiscEvidence(data, background, width, height, calibration, colors, tolerance = 70, workspace = null) {""")
replace(p,'  const n = width * height, mask = new Uint8Array(n), stack = new Int32Array(n);',"""  if(workspace&&(workspace.width!==width||workspace.height!==height))throw Error('Detection workspace does not match this frame.');
  const n = width * height, buffers=workspace||createDetectionWorkspace(width,height), {mask,stack}=buffers;
  mask.fill(0);""")
replace(p,"""      const ds = colors.map(c => c.reduce((s, v, k) => s + (data[i + k] - v) ** 2, 0));
      if (Math.min(...ds) < colorLimit && Math.abs(ds[0] - ds[1]) > 225) mask[p] = ds[0] < ds[1] ? 1 : 2;""","""      // Same RGB squared distances, without allocating arrays/closures per pixel.
      const a=(data[i]-colors[0][0])**2+(data[i+1]-colors[0][1])**2+(data[i+2]-colors[0][2])**2;
      const b=(data[i]-colors[1][0])**2+(data[i+1]-colors[1][1])**2+(data[i+2]-colors[1][2])**2;
      if (Math.min(a,b) < colorLimit && Math.abs(a-b) > 225) mask[p] = a < b ? 1 : 2;""")
replace(p,"""      const neighbors = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of neighbors) if (q >= 0 && mask[q] === team) { mask[q] = 0; stack[top++] = q; }""","""      // Preserve the original traversal order (left, right, up, down).
      if(x>0&&mask[p-1]===team){mask[p-1]=0;stack[top++]=p-1;}
      if(x<width-1&&mask[p+1]===team){mask[p+1]=0;stack[top++]=p+1;}
      if(y>0&&mask[p-width]===team){mask[p-width]=0;stack[top++]=p-width;}
      if(y<height-1&&mask[p+width]===team){mask[p+width]=0;stack[top++]=p+width;}""")
p='src/visibility.js'
replace(p,'export function assessVisibility(pixels, background, width, height, calibration, discs) {',"""export function createVisibilityWorkspace(width,height){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>16777216)throw Error('Invalid visibility workspace size.');
  const size=Math.ceil(width/2)*Math.ceil(height/2);
  return {width,height,residual:new Uint8Array(size),stack:new Int32Array(size)};
}
export function assessVisibility(pixels, background, width, height, calibration, discs, workspace=null) {""")
replace(p,'  const residual=new Uint8Array(cols*rows),stack=new Int32Array(residual.length);',"""  if(workspace&&(workspace.width!==width||workspace.height!==height))throw Error('Visibility workspace does not match this frame.');
  const {residual,stack}=workspace||createVisibilityWorkspace(width,height);residual.fill(0);""")
p='src/vision-worker.js'
replace(p,"import { detectDiscEvidence, Tracker } from './core.js';","import { detectDiscEvidence, Tracker, createDetectionWorkspace } from './core.js?workspace=1';")
replace(p,"import { assessVisibility } from './visibility.js';","import { assessVisibility, createVisibilityWorkspace } from './visibility.js?workspace=1';")
replace(p,'const tracker = new Tracker();',"""const tracker = new Tracker();
let detectionWorkspace=null, visibilityWorkspace=null;
function prepareWorkspace(width,height){
  if(!detectionWorkspace||detectionWorkspace.width!==width||detectionWorkspace.height!==height){
    detectionWorkspace=createDetectionWorkspace(width,height);
    visibilityWorkspace=createVisibilityWorkspace(width,height);
  }
}""")
replace(p,'    tracker.reset(); learner=','    detectionWorkspace=visibilityWorkspace=null;\n    tracker.reset(); learner=')
replace(p,'    const input = new Uint8ClampedArray(m.buffer), pixels =','    const begun=performance.now();\n    const input = new Uint8ClampedArray(m.buffer), pixels =')
replace(p,'    if(!colors.every(Boolean)&&autoColours){','    prepareWorkspace(width,height);const prepared=performance.now();\n    if(!colors.every(Boolean)&&autoColours){')
replace(p,'const visible=assessVisibility(pixels,background,width,height,calibration,candidates);','const visible=assessVisibility(pixels,background,width,height,calibration,candidates,visibilityWorkspace);')
replace(p,'calibration, colors, tolerance);','calibration, colors, tolerance, detectionWorkspace);')
replace(p,'    const tracking = tracker.update(detections, m.time);','    const detected=performance.now();\n    const tracking = tracker.update(detections, m.time);const tracked=performance.now();')
replace(p,'calibration, tracking.discs);','calibration, tracking.discs, visibilityWorkspace);')
replace(p,'    const auto = referee.update({...tracking,...visibility}, m.time);',"""    const visible=performance.now();
    const auto = referee.update({...tracking,...visibility}, m.time);const ended=performance.now();
    // Worker CPU spans, separate from media timestamps and main-thread delivery.
    // Diagnostic only: never used to relax the existing gap/score gates.
    const processing={totalMs:ended-begun,prepareMs:prepared-begun,detectMs:detected-prepared,trackMs:tracked-detected,visibilityMs:visible-tracked,refereeMs:ended-visible};""")
replace(p,'time: m.time, ...tracking, auto, visibility,','time: m.time, ...tracking, auto, visibility, processing,')
replace('src/diagnostics.js','frameGap:m.frameGap,visibility:','frameGap:m.frameGap,processing:m.processing,visibility:')
replace('src/app.js',"./vision-worker.js?reliability=1","./vision-worker.js?workspace=1")
replace('src/app.js',"from './diagnostics.js';","from './diagnostics.js?workspace=1';")
replace('docs/HANDOFF.md','Keep live vision/calibration/scoring/round/recorder/library implementations unchanged while finishing this demo release.','The latest request also authorizes continued camera reliability work. The only subsequent live-path change is evidence-equivalent reusable vision scratch and worker CPU diagnostics, described in `VISION-WORKSPACE.md`. Keep calibration, scoring, round and recorder/library decisions unchanged.')
for name,s in contents.items():assert hashlib.sha256(s.encode()).hexdigest()==expected[name][1],name
for name,s in contents.items():Path(name).write_text(s)
print('All six source updates match the locally tested hashes.')
