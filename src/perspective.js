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
  const imageToBoard=fitHomography(q,[{x:320,y:40},{x:600,y:320},{x:320,y:600},{x:40,y:320}]);
  const boardToImage=invertHomography(imageToBoard), checkedCenter=projectPoint(imageToBoard,center);
  const centerError=Math.hypot(checkedCenter.x-320,checkedCenter.y-320);
  if(centerError>14) throw Error('The centre hole does not line up with the quarter marks. Use the actual four quadrant-line intersections, not the oval’s apparent top/left/right edges. Undo or start again.');
  const r=p=>{const v=projectPoint(imageToBoard,p);return Math.hypot(v.x-320,v.y-320);};
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
    projection:{imageToBoard,boardToImage,imageWidth:width,imageHeight:height,boardSize:640,centerCheckErrorPx:centerError,method:'four-quarter-marks-plus-independent-centre-check'}
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
