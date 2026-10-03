import { makeCalibration } from './core.js';
import { makePerspectiveCalibration, projectPoint, samplingMatrix, createWarpMap, warpPixels } from './perspective.js';
const centerStep = { short:'20', title:'Click the centre of the 20 hole', text:'Click the middle of the round opening at the centre of the board. Use the opening at the playing surface, not a peg, a puck, or the dark bottom of the hole.', target:'centre' };
const innerStep = { short:'15', title:'Click the printed 15-point circle', text:'This is the smallest scoring circle, where the eight pegs stand. Click the printed line BETWEEN two pegs. Do not click the top of a peg or the centre hole.', target:'inner' };
const middleStep = { short:'10', title:'Click the printed 10-point circle', text:'Click the middle circular line: the boundary between the 10-point area inside and the 5-point area outside. Do not click the outer shooting circle.', target:'middle' };
const discStep = { short:'P', title:'Click the centre of one puck', text:'Choose a stationary puck that is fully visible and separate from the others. Click the centre of its top face. The image is frozen, so keep using this same puck for the next click.', target:'disc' };
const edgeStep = { short:'E', title:'Click the edge of that same puck', text:'Click where the same puck ends and the board begins, preferably on its left or right edge. Do not click its shadow. The magnifier can help. This measures approximate puck size, not the height of the puck.', target:'edge' };
export function calibrationSteps(mode) {
  if(mode==='overhead') return [centerStep,innerStep,middleStep,{short:'5',title:'Click the outer printed shooting circle',text:'Use the outermost circular LINE printed on the flat playing surface. Do not click the wooden rail, the edge of the board, or the black gutter/ditch.',target:'outer'},discStep,edgeStep];
  return [centerStep,
    {short:'A',title:'Click quarter mark A on the outer circle',text:'Choose one of the FOUR printed quadrant/divider marks where it meets the outer shooting circle. Start with a clearly visible mark. A does not need to be the top of the image. Click the line intersection on the flat board, not the rail.',target:'A'},
    {short:'B',title:'Click the next quarter mark, B',text:'Move clockwise around the board to the next printed quadrant mark and click its intersection with the SAME outer shooting circle. These are physical quarter-turn marks — not the oval’s apparent top, bottom, left or right edges.',target:'B'},
    {short:'C',title:'Click quarter mark C, opposite A',text:'Continue clockwise to the third printed quadrant mark. It is directly opposite A on the physical board. Click where the divider meets the outer shooting circle.',target:'C'},
    {short:'D',title:'Click quarter mark D, opposite B',text:'Click the final quadrant mark, opposite B. You should now have one point at each of the board’s four quarter-turn marks, all on the same outer circle. Never substitute the gutter or guessed oval extrema.',target:'D'},
    innerStep,middleStep,discStep,edgeStep];
}
export class CalibrationGuide {
  constructor({ getFrame, onOpen, onApply, onCancel }) {
    Object.assign(this,{ getFrame,onOpen,onApply,onCancel,active:false,points:[],candidate:null });
    const dialog=document.createElement('dialog'); dialog.id='calibration-dialog';
    dialog.innerHTML=`<div class="cal-heading"><div><p class="eyebrow">GUIDED CALIBRATION · FROZEN IMAGE</p><h2 id="cal-title">Set up the board</h2></div><button id="cal-close" class="secondary">Cancel</button></div>
      <div id="cal-progress" class="cal-progress" role="status" aria-live="polite"></div>
      <div class="cal-layout"><div class="cal-main"><p id="cal-instruction"></p><p class="cal-prep">Before starting: have one puck on the board, clear your hands, and show the whole scoring circle. <b>Retake image</b> starts again with a fresh frame.</p><div class="cal-image-wrap"><canvas id="cal-image" tabindex="0" aria-label="Frozen camera image. Click the landmark described above."></canvas></div><p id="cal-feedback" role="status" aria-live="polite"></p></div>
      <aside class="cal-explainer"><canvas id="cal-example" width="240" height="240" aria-label="Illustrative target diagram, not the camera image"></canvas><p id="cal-example-label">Illustration only — find this feature on your actual board.</p><canvas id="cal-magnifier" width="240" height="130" aria-label="Magnified view under the pointer"></canvas><p class="cal-magnifier-help">Magnifier follows the pointer. Click the feature, not its shadow.</p><p id="cal-mode-note"></p></aside></div>
      <div class="cal-actions"><button id="cal-undo" class="secondary">Undo last click</button><button id="cal-retake" class="secondary">Retake image / start over</button><button id="cal-apply" class="primary" disabled>Use this calibration</button></div>`;
    document.body.append(dialog); this.dialog=dialog; this.canvas=dialog.querySelector('#cal-image'); this.ctx=this.canvas.getContext('2d');
    this.frame=document.createElement('canvas'); this.frameCtx=this.frame.getContext('2d',{willReadFrequently:true});
    this.$=id=>dialog.querySelector(`#${id}`);
    this.$('cal-close').onclick=()=>this.cancel();
    this.$('cal-undo').onclick=()=>{this.points.pop();this.candidate=null;this.error='';this.render();};
    this.$('cal-retake').onclick=()=>this.capture();
    this.$('cal-apply').onclick=()=>{
      if(!this.candidate) return;
      const result=this.candidate;this.active=false;dialog.close();this.onApply(result);
    };
    dialog.addEventListener('cancel',event=>{event.preventDefault();this.cancel();});
    this.canvas.addEventListener('click',event=>{
      if(!this.active || this.points.length>=this.steps.length) return;
      const p=this.coordinates(event); this.points.push(p);this.error='';
      if(this.points.length===this.steps.length) {
        try {this.candidate=this.mode==='angled'?makePerspectiveCalibration(this.points,this.frame.width,this.frame.height):{calibration:makeCalibration(this.points,this.frame.width,this.frame.height),projection:null};}
        catch(error){this.error=error.message;this.candidate=null;}
      }
      this.render();
    });
    this.canvas.addEventListener('pointermove',event=>this.magnify(this.coordinates(event)));
  }
  coordinates(event) { const r=this.canvas.getBoundingClientRect();return {x:(event.clientX-r.left)*this.canvas.width/r.width,y:(event.clientY-r.top)*this.canvas.height/r.height}; }
  start(mode='angled') {
    if(this.active) return;
    this.mode=mode;this.steps=calibrationSteps(mode);this.active=true;this.onOpen();this.capture();this.dialog.showModal();
  }
  capture() {
    const source=this.getFrame();
    this.canvas.width=this.frame.width=source.width;this.canvas.height=this.frame.height=source.height;
    this.frameCtx.drawImage(source,0,0);this.points=[];this.candidate=null;this.error='';this.render();
  }
  cancel() {
    if(!this.active) return;
    this.active=false;this.dialog.close();this.onCancel();
  }
  render() {
    const n=this.points.length, ready=!!this.candidate, failed=n===this.steps.length&&!ready;
    const step=this.steps[Math.min(n,this.steps.length-1)];this.dialog.dataset.step=String(n+1);
    this.$('cal-title').textContent=ready?'Check the fit before using it':failed?'One of the clicks needs correction':step.title;
    this.$('cal-progress').textContent=ready?`${n} / ${n} points placed · confirm the preview`:`Step ${Math.min(n+1,this.steps.length)} of ${this.steps.length} · ${this.mode==='angled'?'Angled camera':'Overhead camera'}`;
    this.$('cal-instruction').textContent=ready?'The coloured guides should follow the printed circles all the way around. The straightened preview should show circular scoring rings. If they do not line up, undo or retake — do not accept a poor fit.':failed?'Your previous calibration is unchanged. Use Undo last click to work back to the mistaken point, or retake the image and start again.':step.text;
    const fit=this.candidate?.projection?.anchorRmsErrorPx;
    const fitNote=Number.isFinite(fit)?` Best-fit landmark residual: ${fit.toFixed(1)} corrected px. Small mismatch is expected from manual clicks and webcam distortion; use the coloured overlay as the final check.`:'';
    this.$('cal-feedback').textContent=this.error||(ready?`No new calibration is applied until you press “Use this calibration”.${fitNote}`:`${n} point${n===1?'':'s'} placed. A mistaken click can be undone.`);
    this.$('cal-feedback').classList.toggle('cal-error',!!this.error);
    this.$('cal-undo').disabled=n===0;this.$('cal-apply').disabled=!ready;
    this.$('cal-mode-note').textContent=this.mode==='angled'?'Use four known quarter-turn marks on the FLAT playing surface. If they are missing or hidden, cancel rather than guessing. Perspective correction cannot reveal hidden pucks or remove puck-height/peg parallax.':'Overhead mode assumes the board already appears circular. Use angled mode for an oval board; stretching a circle by eye is not calibration.';
    this.ctx.drawImage(this.frame,0,0);
    if(ready) this.drawGuides();
    this.drawPoints();this.drawExample(ready?'preview':step.target);
  }
  drawPoints() {
    const c=this.ctx,s=this.canvas.width/800;c.save();c.font=`bold ${14*s}px system-ui`;c.textAlign='left';c.textBaseline='middle';
    this.points.forEach((p,i)=>{c.fillStyle='#f4d178';c.strokeStyle='#173d37';c.lineWidth=2*s;c.beginPath();c.arc(p.x,p.y,5*s,0,Math.PI*2);c.fill();c.stroke();const short=this.steps[i].short,label=`${i+1} · ${short}`,x=p.x+(short==='P'?-38:9)*s,y=p.y+(short==='E'?18:short==='P'?-18:-9)*s;c.lineWidth=4*s;c.strokeText(label,x,y);c.fillStyle='#fffbea';c.fillText(label,x,y);});c.restore();
  }
  drawGuides() {
    const {calibration:c,projection:p}=this.candidate,ctx=this.ctx;
    ctx.save();ctx.strokeStyle='#88eddf';ctx.lineWidth=Math.max(2,this.canvas.width/500);ctx.setLineDash([8,6]);
    for(const r of c.rings) {ctx.beginPath();for(let i=0;i<=96;i++){const a=i*Math.PI/48,pt={x:c.center.x+r*Math.cos(a),y:c.center.y+r*Math.sin(a)},v=p?projectPoint(p.boardToImage,pt):pt;if(i)ctx.lineTo(v.x,v.y);else ctx.moveTo(v.x,v.y);}ctx.stroke();}ctx.restore();
  }
  drawExample(target) {
    const cv=this.$('cal-example'),g=cv.getContext('2d');g.clearRect(0,0,240,240);
    if(target==='preview') {
      const {calibration:c,projection:p}=this.candidate,s=c.rings[2]/280;
      const projection=p||{boardSize:640,boardToImage:[s,0,c.center.x-320*s,0,s,c.center.y-320*s,0,0,1]};
      const map=createWarpMap(this.frame.width,this.frame.height,240,240,samplingMatrix(projection,1,240));
      const source=this.frameCtx.getImageData(0,0,this.frame.width,this.frame.height);
      g.putImageData(new ImageData(warpPixels(source.data,map),240,240),0,0);
      this.$('cal-example-label').textContent='Straightened board-plane preview. This does not certify contact accuracy.';return;
    }
    this.$('cal-example-label').textContent='Illustration only. A can be any first quarter mark; use the next physical marks clockwise.';
    g.fillStyle='#eee6d6';g.fillRect(0,0,240,240);g.fillStyle='#d9be8e';g.strokeStyle='#735c38';g.lineWidth=2;
    g.beginPath();g.arc(120,120,103,0,Math.PI*2);g.fill();g.stroke();
    for(const [name,r] of [['inner',32],['middle',64],['outer',96]]) {g.strokeStyle=target===name?'#ad3730':'#997c50';g.lineWidth=target===name?5:1.5;g.beginPath();g.arc(120,120,r,0,Math.PI*2);g.stroke();}
    g.strokeStyle='#735c38';g.lineWidth=2;
    for(let i=0;i<4;i++){const a=i*Math.PI/2;g.beginPath();g.moveTo(120+96*Math.cos(a),120+96*Math.sin(a));g.lineTo(120+103*Math.cos(a),120+103*Math.sin(a));g.stroke();}
    for(let i=0;i<8;i++){const a=i*Math.PI/4;g.fillStyle='#594b37';g.beginPath();g.arc(120+32*Math.cos(a),120+32*Math.sin(a),2.5,0,Math.PI*2);g.fill();}
    g.fillStyle=target==='centre'?'#ad3730':'#574a34';g.beginPath();g.arc(120,120,6,0,Math.PI*2);g.fill();
    const marks={A:[120,24],B:[216,120],C:[120,216],D:[24,120]};g.font='bold 13px system-ui';g.textAlign='center';g.textBaseline='middle';
    for(const [name,[x,y]] of Object.entries(marks)){g.fillStyle=target===name?'#ad3730':'#173d37';g.beginPath();g.arc(x,y,target===name?12:9,0,Math.PI*2);g.fill();g.fillStyle='white';g.fillText(name,x,y);}
    g.fillStyle='#38738c';g.beginPath();g.arc(162,170,10,0,Math.PI*2);g.fill();
    if(['disc','edge'].includes(target)){g.strokeStyle='#ad3730';g.lineWidth=2;const x=target==='disc'?162:172;g.beginPath();g.arc(x,170,4,0,Math.PI*2);g.stroke();}
  }
  magnify(p) {
    if(!this.active) return;
    const cv=this.$('cal-magnifier'),c=cv.getContext('2d');c.fillStyle='#edeadd';c.fillRect(0,0,240,130);
    c.imageSmoothingEnabled=false;c.drawImage(this.frame,p.x-30,p.y-16.25,60,32.5,0,0,240,130);
    c.strokeStyle='#e24234';c.lineWidth=1;c.beginPath();c.moveTo(108,65);c.lineTo(132,65);c.moveTo(120,53);c.lineTo(120,77);c.stroke();
  }
}
