/** Board-plane perspective calibration. Does not recover occluded or elevated objects. */
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
export function projectPoint(h, p) {
  const d = h[6] * p.x + h[7] * p.y + h[8];
  if (!Number.isFinite(d) || Math.abs(d) < 1e-10) throw Error('Perspective fit is unstable. Recheck the reference marks.');
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / d, y: (h[3] * p.x + h[4] * p.y + h[5]) / d };
}
export function invertHomography(m) {
  const [a,b,c,d,e,f,g,h,i] = m;
  const r = [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  const det = a*r[0]+b*r[3]+c*r[6];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw Error('The reference marks do not define a usable perspective.');
  return r.map(v => v/det);
}
export function fitHomography(from, to) {
  if (from.length !== 4 || to.length !== 4 || ![...from,...to].every(finitePoint)) throw Error('Four valid reference pairs are required.');
  const rows = [];
  for (let i=0; i<4; i++) {
    const {x,y}=from[i], {x:u,y:v}=to[i];
    rows.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for (let c=0; c<8; c++) {
    let pivot=c; for (let r=c+1;r<8;r++) if (Math.abs(rows[r][c]) > Math.abs(rows[pivot][c])) pivot=r;
    if (Math.abs(rows[pivot][c]) < 1e-10) throw Error('Reference points overlap or are nearly in a straight line.');
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
    const div=rows[c][c]; for(let k=c;k<9;k++) rows[c][k]/=div;
    for(let r=0;r<8;r++) if(r!==c) { const factor=rows[r][c];for(let k=c;k<9;k++) rows[r][k]-=factor*rows[c][k]; }
  }
  const h=rows.map(r=>r[8]);h.push(1);
  if (!h.every(Number.isFinite)) throw Error('Could not fit the perspective.');
  return h;
}

function multiply3x3(a,b) {
  const out=new Array(9).fill(0);
  for(let r=0;r<3;r++) for(let c=0;c<3;c++) for(let k=0;k<3;k++) out[r*3+c]+=a[r*3+k]*b[k*3+c];
  return out;
}
function normalizePoints(points) {
  const center={x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};
  const mean=points.reduce((n,p)=>n+Math.hypot(p.x-center.x,p.y-center.y),0)/points.length;
  if(!(mean>1e-9)) throw Error('Reference points overlap or are nearly in a straight line.');
  const scale=Math.SQRT2/mean;
  return {
    points:points.map(p=>({x:(p.x-center.x)*scale,y:(p.y-center.y)*scale})),
    transform:[scale,0,-scale*center.x,0,scale,-scale*center.y,0,0,1],
    inverse:[1/scale,0,center.x,0,1/scale,center.y,0,0,1]
  };
}
function solveLinearSystem(matrix, vector) {
  const rows=matrix.map((row,i)=>[...row,vector[i]]);
  for(let c=0;c<rows.length;c++) {
    let pivot=c;
    for(let r=c+1;r<rows.length;r++) if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c])) pivot=r;
    if(Math.abs(rows[pivot][c])<1e-12) throw Error('The reference marks do not define a stable perspective.');
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
    const div=rows[c][c];for(let k=c;k<=rows.length;k++) rows[c][k]/=div;
    for(let r=0;r<rows.length;r++) if(r!==c) {
      const factor=rows[r][c];if(!factor) continue;
      for(let k=c;k<=rows.length;k++) rows[r][k]-=factor*rows[c][k];
    }
  }
  return rows.map(row=>row[rows.length]);
}
/** Least-squares projective fit for 4+ landmarks, normalized for numerical stability. */
export function fitHomographyLeastSquares(from,to) {
  if(from.length!==to.length||from.length<4||![...from,...to].every(finitePoint)) throw Error('At least four valid reference pairs are required.');
  const nf=normalizePoints(from),nt=normalizePoints(to), ata=Array.from({length:8},()=>new Array(8).fill(0)), atb=new Array(8).fill(0);
  for(let i=0;i<from.length;i++) {
    const {x,y}=nf.points[i],{x:u,y:v}=nt.points[i];
    const equations=[
      {a:[x,y,1,0,0,0,-u*x,-u*y],b:u},
      {a:[0,0,0,x,y,1,-v*x,-v*y],b:v}
    ];
    for(const eq of equations) for(let r=0;r<8;r++) {
      atb[r]+=eq.a[r]*eq.b;
      for(let c=0;c<8;c++) ata[r][c]+=eq.a[r]*eq.a[c];
    }
  }
  const h=solveLinearSystem(ata,atb), normalized=[...h,1];
  const denormalized=multiply3x3(nt.inverse,multiply3x3(normalized,nf.transform));
  const scale=denormalized[8];
  if(!Number.isFinite(scale)||Math.abs(scale)<1e-12) throw Error('Could not fit the perspective.');
  return denormalized.map(v=>v/scale);
}
export function makePerspectiveCalibration(points, width, height) {
  if (points.length !== 9 || !points.every(finitePoint)) throw Error('Complete all nine reference clicks.');
  if (!(width>0 && height>0) || points.some(p=>p.x<0||p.y<0||p.x>width||p.y>height)) throw Error('Click inside the camera image.');
  const [center,a,b,c,d,inner,middle,disc,edge]=points, q=[a,b,c,d];
  let area=0; const crosses=[];
  for(let i=0;i<4;i++) {
    const p=q[i],n=q[(i+1)%4],t=q[(i+2)%4];
    area+=p.x*n.y-n.x*p.y;
    crosses.push((n.x-p.x)*(t.y-n.y)-(n.y-p.y)*(t.x-n.x));
    if(Math.hypot(n.x-p.x,n.y-p.y)<8) throw Error('Quarter marks are too close together. Use four different printed quadrant marks.');
  }
  if (Math.abs(area)<width*height*.04 || !(crosses.every(v=>v>1)||crosses.every(v=>v< -1))) throw Error('Quarter marks must go around the board in order, without crossing or repeating.');
  const boardMarks=[{x:320,y:40},{x:600,y:320},{x:320,y:600},{x:40,y:320}], boardCenter={x:320,y:320};
  const quarterOnly=fitHomography(q,boardMarks), rawCheckedCenter=projectPoint(quarterOnly,center);
  const rawCenterError=Math.hypot(rawCheckedCenter.x-boardCenter.x,rawCheckedCenter.y-boardCenter.y);
  // A real 45-degree webcam view includes click error and some lens distortion. A 14 px hard
  // rejection was too strict. Reject only a gross inconsistency, then fit all five landmarks
  // together so the independently clicked centre contributes to the board-plane solution.
  if(rawCenterError>90) throw Error('The centre hole is far from the four quarter marks. Recheck that A–D are the actual quadrant-line intersections on the outer printed circle, in order around the board.');
  const fitFrom=[...q,center], fitTo=[...boardMarks,boardCenter];
  const imageToBoard=fitHomographyLeastSquares(fitFrom,fitTo), boardToImage=invertHomography(imageToBoard);
  const anchorErrors=fitFrom.map((p,i)=>{const v=projectPoint(imageToBoard,p),t=fitTo[i];return Math.hypot(v.x-t.x,v.y-t.y);});
  const fitRmsError=Math.sqrt(anchorErrors.reduce((n,v)=>n+v*v,0)/anchorErrors.length), fitMaxError=Math.max(...anchorErrors);
  if(fitRmsError>30||fitMaxError>55) throw Error('The calibration landmarks disagree too much for a stable board-plane fit. Undo the least certain click or retake the image.');
  const checkedCenter=projectPoint(imageToBoard,center), centerError=Math.hypot(checkedCenter.x-boardCenter.x,checkedCenter.y-boardCenter.y);
  const r=p=>{const v=projectPoint(imageToBoard,p);return Math.hypot(v.x-boardCenter.x,v.y-boardCenter.y);};
  const rings=[r(inner),r(middle),280], pc=projectPoint(imageToBoard,disc), pe=projectPoint(imageToBoard,edge);
  const discRadius=Math.hypot(pc.x-pe.x,pc.y-pe.y);
  if (!(rings[0]>28 && rings[1]>rings[0]*1.25 && rings[1]<252)) throw Error('Scoring rings are out of order. Click the inner 15 line, then the middle 10 line.');
  if (!(discRadius>=3 && discRadius<=rings[0]/3)) throw Error('Disc size looks wrong. Click a puck centre and the edge of that same puck.');
  for(let i=0;i<96;i++) {
    const t=i*Math.PI/48, p=projectPoint(boardToImage,{x:320+280*Math.cos(t),y:320+280*Math.sin(t)});
    if(p.x< -2||p.y< -2||p.x>width+2||p.y>height+2) throw Error('Part of the scoring circle is outside the camera image. Move the camera back and retake the view.');
  }
  return {
    calibration:{center:{x:320,y:320},rings,discRadius,width:640,height:640},
    projection:{imageToBoard,boardToImage,imageWidth:width,imageHeight:height,boardSize:640,centerCheckErrorPx:centerError,rawCenterCheckErrorPx:rawCenterError,anchorRmsErrorPx:fitRmsError,anchorMaxErrorPx:fitMaxError,method:'five-landmark-best-fit-with-centre-anchor'}
  };
}
/** Transform output pixels (possibly a small preview) to a scaled source image. */
export function samplingMatrix(projection, sourceScale=1, outputSize=640) {
  const m=[...projection.boardToImage], k=projection.boardSize/outputSize;
  for(const i of [0,1,3,4,6,7]) m[i]*=k;
  for(let i=0;i<6;i++) m[i]*=sourceScale;
  return m;
}
export function createWarpMap(width,height,outWidth,outHeight,matrix) {
  if (![width,height,outWidth,outHeight].every(n=>Number.isInteger(n)&&n>1) || outWidth*outHeight>4194304) throw Error('Unsupported perspective image size.');
  const count=outWidth*outHeight, indices=new Int32Array(count).fill(-1), fx=new Float32Array(count),fy=new Float32Array(count);
  for(let y=0;y<outHeight;y++) for(let x=0;x<outWidth;x++) {
    const j=y*outWidth+x, p=projectPoint(matrix,{x,y}), xx=Math.floor(p.x), yy=Math.floor(p.y);
    if(xx<0||yy<0||xx>=width-1||yy>=height-1) continue;
    indices[j]=(yy*width+xx)*4;fx[j]=p.x-xx;fy[j]=p.y-yy;
  }
  return {width,height,outWidth,outHeight,indices,fx,fy};
}
export function warpPixels(data,map,output=null) {
  if(data.length!==map.width*map.height*4) throw Error('Camera dimensions changed; recalibrate the view.');
  const {indices,fx,fy,width}=map, result=output||new Uint8ClampedArray(indices.length*4);
  if(result.length!==indices.length*4) throw Error('Incorrect warp output buffer.');
  for(let j=0;j<indices.length;j++) {
    const p=indices[j],o=j*4;
    if(p<0) {result[o]=result[o+1]=result[o+2]=result[o+3]=0;continue;}
    const xx=fx[j],yy=fy[j],row=width*4;
    for(let k=0;k<4;k++) result[o+k]=(data[p+k]*(1-xx)+data[p+4+k]*xx)*(1-yy)+(data[p+row+k]*(1-xx)+data[p+row+4+k]*xx)*yy;
  }
  return result;
}
