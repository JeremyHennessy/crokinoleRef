import { invertHomography, projectPoint, createWarpMap, warpPixels } from './perspective.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

function grayscale(rgba) {
  const n=rgba.length/4, out=new Uint8Array(n);
  for(let i=0;i<n;i++) {
    const p=i*4;
    out[i]=Math.round(rgba[p]*0.299+rgba[p+1]*0.587+rgba[p+2]*0.114);
  }
  return out;
}
function boxBlur(gray,width,height,radius=3) {
  const stride=width+1, integral=new Float64Array((width+1)*(height+1));
  for(let y=0;y<height;y++) {
    let row=0;
    for(let x=0;x<width;x++) {
      row+=gray[y*width+x];
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
    }
  }
  const out=new Uint8Array(gray.length);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const x0=Math.max(0,x-radius),x1=Math.min(width-1,x+radius),y0=Math.max(0,y-radius),y1=Math.min(height-1,y+radius);
    const sum=integral[(y1+1)*stride+x1+1]-integral[y0*stride+x1+1]-integral[(y1+1)*stride+x0]+integral[y0*stride+x0];
    out[y*width+x]=Math.round(sum/((x1-x0+1)*(y1-y0+1)));
  }
  return out;
}
export function otsuThreshold(gray, mask=null) {
  const hist=new Uint32Array(256); let total=0,sum=0;
  for(let i=0;i<gray.length;i++) if(!mask||mask[i]) {hist[gray[i]]++;total++;sum+=gray[i];}
  if(!total) return 128;
  let back=0,sumBack=0,best=-1,threshold=128;
  for(let t=0;t<256;t++) {
    back+=hist[t];sumBack+=t*hist[t];
    if(!back||back===total) continue;
    const fore=total-back,meanBack=sumBack/back,meanFore=(sum-sumBack)/fore;
    const variance=back*fore*(meanBack-meanFore)*(meanBack-meanFore);
    if(variance>best){best=variance;threshold=t;}
  }
  return threshold;
}
function components(binary,width,height) {
  const mask=new Uint8Array(binary),stack=new Int32Array(binary.length),out=[];
  for(let start=0;start<mask.length;start++) {
    if(!mask[start]) continue;
    let top=0,area=0,sx=0,sy=0,sxx=0,syy=0,sxy=0,minX=width,minY=height,maxX=0,maxY=0;
    stack[top++]=start;mask[start]=0;
    while(top) {
      const p=stack[--top],x=p%width,y=Math.floor(p/width);
      area++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
      const left=x>0?p-1:-1,right=x<width-1?p+1:-1,up=y>0?p-width:-1,down=y<height-1?p+width:-1;
      if(left>=0&&mask[left]){mask[left]=0;stack[top++]=left;}
      if(right>=0&&mask[right]){mask[right]=0;stack[top++]=right;}
      if(up>=0&&mask[up]){mask[up]=0;stack[top++]=up;}
      if(down>=0&&mask[down]){mask[down]=0;stack[top++]=down;}
    }
    out.push({area,sx,sy,sxx,syy,sxy,minX,minY,maxX,maxY,cx:sx/area,cy:sy/area});
  }
  return out;
}
function ellipseFromComponent(c) {
  const xx=c.sxx/c.area-c.cx*c.cx,yy=c.syy/c.area-c.cy*c.cy,xy=c.sxy/c.area-c.cx*c.cy;
  const trace=xx+yy,disc=Math.sqrt(Math.max(0,(xx-yy)*(xx-yy)+4*xy*xy));
  const l1=(trace+disc)/2,l2=(trace-disc)/2;
  if(!(l1>0&&l2>0)) throw Error('The playing surface shape is unstable.');
  let vx,vy;
  if(Math.abs(xy)>1e-9){vx=l1-yy;vy=xy;const n=Math.hypot(vx,vy);vx/=n;vy/=n;}
  else if(xx>=yy){vx=1;vy=0;} else {vx=0;vy=1;}
  const ux=-vy,uy=vx,a=2*Math.sqrt(l1),b=2*Math.sqrt(l2);
  return {cx:c.cx,cy:c.cy,a,b,vx,vy,ux,uy,fill:c.area/(Math.PI*a*b)};
}
function chooseBoard(gray,width,height) {
  const blurred=boxBlur(gray,width,height,3),threshold=otsuThreshold(blurred),binary=new Uint8Array(gray.length);
  for(let i=0;i<binary.length;i++) binary[i]=blurred[i]>threshold?1:0;
  const frameArea=width*height,candidates=[];
  for(const c of components(binary,width,height)) {
    const frac=c.area/frameArea;
    if(frac<0.14||frac>0.78) continue;
    let e;try{e=ellipseFromComponent(c);}catch{continue;}
    const ratio=e.b/e.a,centerDistance=Math.hypot(e.cx-width/2,e.cy-height/2)/Math.hypot(width/2,height/2);
    if(e.fill<0.58||e.fill>1.25||ratio<0.35||ratio>1.02||centerDistance>0.55) continue;
    const score=clamp((e.fill-.58)/.38,0,1)*.38+clamp((frac-.14)/.32,0,1)*.32+clamp((ratio-.35)/.45,0,1)*.15+clamp(1-centerDistance/.55,0,1)*.15;
    candidates.push({component:c,ellipse:e,score,threshold,blurred});
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length||candidates[0].score<0.5) throw Error('Smart setup could not confidently isolate the round playing surface. Keep the full light playing surface visible with dark rail around it, or use the manual guide.');
  return candidates[0];
}
function normalizedEllipseDistance(e,x,y) {
  const dx=x-e.cx,dy=y-e.cy,u=dx*e.vx+dy*e.vy,v=dx*e.ux+dy*e.uy;
  return Math.sqrt((u/e.a)**2+(v/e.b)**2);
}
function chooseHole(gray,width,height,board) {
  const e=board.ellipse,darkThreshold=Math.round(clamp(board.threshold*.9,45,95)),binary=new Uint8Array(gray.length);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=y*width+x;
    if(normalizedEllipseDistance(e,x,y)<.72&&gray[i]<darkThreshold) binary[i]=1;
  }
  const boardArea=board.component.area,candidates=[];
  for(const c of components(binary,width,height)) {
    const frac=c.area/boardArea,w=c.maxX-c.minX+1,h=c.maxY-c.minY+1,aspect=w/h,fill=c.area/(w*h),dist=normalizedEllipseDistance(e,c.cx,c.cy);
    if(frac<0.00035||frac>0.018||dist>.52||aspect<.42||aspect>2.4||fill<.35) continue;
    let darkness=0; // sample the bounding component approximately from all dark pixels represented by the threshold
    darkness=clamp((darkThreshold-25)/Math.max(1,darkThreshold),0,1);
    const sizeTarget=.0024,sizeScore=Math.exp(-Math.abs(Math.log(Math.max(frac,1e-6)/sizeTarget)));
    const score=clamp(1-dist/.52,0,1)*.45+clamp((fill-.35)/.5,0,1)*.2+sizeScore*.25+darkness*.1;
    candidates.push({component:c,score,dist,fill,frac});
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length||candidates[0].score<.46) throw Error('Smart setup found the playing surface but not the 20 hole confidently. Make the hole clearly visible, reduce glare, or use the manual guide.');
  return {...candidates[0],x:candidates[0].component.cx,y:candidates[0].component.cy,darkThreshold};
}
function mul3(a,b) {
  const out=new Array(9).fill(0);
  for(let r=0;r<3;r++)for(let c=0;c<3;c++)for(let k=0;k<3;k++)out[r*3+c]+=a[r*3+k]*b[k*3+c];
  return out;
}
function transpose3(a){return[a[0],a[3],a[6],a[1],a[4],a[7],a[2],a[5],a[8]];}
function conicTransform(C,Hinv){return mul3(transpose3(Hinv),mul3(C,Hinv));}
function evalConic(C,p){return p[0]*(C[0]*p[0]+C[1]*p[1]+C[2])+p[1]*(C[3]*p[0]+C[4]*p[1]+C[5])+(C[6]*p[0]+C[7]*p[1]+C[8]);}
function sqrtSymmetric2(a,b,d) {
  const trace=a+d,disc=Math.sqrt(Math.max(0,(a-d)*(a-d)+4*b*b)),l1=(trace+disc)/2,l2=(trace-disc)/2;
  if(!(l1>0&&l2>0)) throw Error('The detected playing surface does not yield a valid perspective.');
  const angle=.5*Math.atan2(2*b,a-d),c=Math.cos(angle),s=Math.sin(angle),q1=Math.sqrt(l1),q2=Math.sqrt(l2);
  return [c*c*q1+s*s*q2,c*s*(q1-q2),c*s*(q1-q2),s*s*q1+c*c*q2];
}
function projectionFromEllipseAndCenter(e,hole,width,height) {
  const ia=1/(e.a*e.a),ib=1/(e.b*e.b);
  const A00=e.vx*e.vx*ia+e.ux*e.ux*ib,A01=e.vx*e.vy*ia+e.ux*e.uy*ib,A11=e.vy*e.vy*ia+e.uy*e.uy*ib;
  const q0=-(A00*e.cx+A01*e.cy),q1=-(A01*e.cx+A11*e.cy);
  const C=[A00,A01,q0,A01,A11,q1,q0,q1,e.cx*(A00*e.cx+A01*e.cy)+e.cy*(A01*e.cx+A11*e.cy)-1];
  const p=[hole.x,hole.y,1],line=[
    C[0]*p[0]+C[1]*p[1]+C[2],
    C[3]*p[0]+C[4]*p[1]+C[5],
    C[6]*p[0]+C[7]*p[1]+C[8]
  ];
  if(Math.abs(line[2])<1e-8) throw Error('The board angle is too extreme for stable automatic correction.');
  const Haff=[1,0,0,0,1,0,line[0]/line[2],line[1]/line[2],1],Hinv=invertHomography(Haff),Caff=conicTransform(C,Hinv);
  const ca=projectPoint(Haff,{x:hole.x,y:hole.y}),cp=[ca.x,ca.y,1],f0=evalConic(Caff,cp);
  if(!(f0<0)) throw Error('The detected centre and playing surface are geometrically inconsistent.');
  const scale=-f0,m00=Caff[0]/scale,m01=Caff[1]/scale,m11=Caff[4]/scale,sqrt=sqrtSymmetric2(m00,m01,m11),r=280;
  const m=[r*sqrt[0],r*sqrt[1],r*sqrt[2],r*sqrt[3]],tx=320-(m[0]*ca.x+m[1]*ca.y),ty=320-(m[2]*ca.x+m[3]*ca.y);
  const Hmetric=[m[0],m[1],tx,m[2],m[3],ty,0,0,1],imageToBoard=mul3(Hmetric,Haff),boardToImage=invertHomography(imageToBoard);
  const center=projectPoint(imageToBoard,{x:hole.x,y:hole.y});
  if(Math.hypot(center.x-320,center.y-320)>1) throw Error('Automatic centre correction did not converge.');
  let maxOuterError=0;
  for(let i=0;i<64;i++){
    const t=i*Math.PI/32,x=e.cx+e.a*Math.cos(t)*e.vx+e.b*Math.sin(t)*e.ux,y=e.cy+e.a*Math.cos(t)*e.vy+e.b*Math.sin(t)*e.uy,q=projectPoint(imageToBoard,{x,y});
    maxOuterError=Math.max(maxOuterError,Math.abs(Math.hypot(q.x-320,q.y-320)-280));
  }
  return {imageToBoard,boardToImage,imageWidth:width,imageHeight:height,boardSize:640,centerCheckErrorPx:0,outerFitMaxErrorPx:maxOuterError,method:'automatic-playing-surface-ellipse-plus-20-hole'};
}
function peak(profile,min,max) {
  let index=min,value=-1;
  for(let i=min;i<=max;i++) if(profile[i]>value){value=profile[i];index=i;}
  return {index,value};
}
function detectRings(warped,lineThreshold) {
  const gray=grayscale(warped),dark=new Float64Array(281),count=new Uint32Array(281);
  for(let y=34;y<606;y++)for(let x=34;x<606;x++){
    const i=y*640+x;if(warped[i*4+3]===0)continue;
    const r=Math.round(Math.hypot(x-320,y-320));if(r>280)continue;
    count[r]++;if(gray[i]<lineThreshold)dark[r]++;
  }
  const raw=Array.from({length:281},(_,r)=>count[r]?dark[r]/count[r]:0),smooth=new Float64Array(281);
  for(let r=2;r<279;r++)smooth[r]=(raw[r-2]+raw[r-1]+raw[r]+raw[r+1]+raw[r+2])/5;
  const inner=peak(smooth,54,126),middle=peak(smooth,132,224),outer=peak(smooth,230,274);
  if(inner.value<.025||middle.value<.025||outer.value<.035) throw Error('Smart setup found the board and centre but could not confidently identify all three printed scoring circles. Improve contrast or use the manual guide.');
  if(!(inner.index<middle.index&&middle.index<outer.index&&middle.index>inner.index*1.35&&outer.index>middle.index*1.12)) throw Error('The automatically detected scoring circles are inconsistent. Use the manual guide for this view.');
  const ringConfidence=clamp(Math.min(inner.value/.12,middle.value/.08,outer.value/.12),0,1);
  return {rings:[inner.index,middle.index,outer.index],peaks:[inner.value,middle.value,outer.value],confidence:ringConfidence};
}
export function autoCalibrateFrame(rgba,width,height) {
  if(!(rgba instanceof Uint8Array||rgba instanceof Uint8ClampedArray)||rgba.length!==width*height*4) throw Error('Smart calibration needs a complete camera frame.');
  if(width<240||height<180) throw Error('The camera image is too small for smart calibration.');
  const gray=grayscale(rgba),board=chooseBoard(gray,width,height),hole=chooseHole(gray,width,height,board),projection=projectionFromEllipseAndCenter(board.ellipse,hole,width,height);
  const map=createWarpMap(width,height,640,640,projection.boardToImage),warped=warpPixels(rgba,map);
  const rings=detectRings(warped,Math.round(clamp(board.threshold*.95,48,105))),discRadius=clamp(rings.rings[2]*.052,9,20);
  const confidence=clamp(board.score*.35+hole.score*.3+rings.confidence*.35,0,1);
  if(confidence<.55) throw Error('Smart setup found a possible board but confidence is low. Use the manual guide rather than accepting uncertain geometry.');
  const calibration={center:{x:320,y:320},rings:rings.rings,discRadius,width:640,height:640};
  return {
    calibration,projection,warped,confidence,
    diagnostics:{
      boardConfidence:board.score,holeConfidence:hole.score,ringConfidence:rings.confidence,
      boardThreshold:board.threshold,holeThreshold:hole.darkThreshold,
      playingSurface:{center:{x:board.ellipse.cx,y:board.ellipse.cy},semiAxes:[board.ellipse.a,board.ellipse.b],fill:board.ellipse.fill},
      hole:{x:hole.x,y:hole.y},
      ringPeaks:rings.peaks,
      discRadiusSource:'estimated-from-outer-scoring-circle'
    }
  };
}
export function scaleAutoProjectionToSource(projection,sourceScale) {
  if(!(sourceScale>0)) throw Error('A positive camera scale is required.');
  // The automatic detector ran on coordinates x_small = sourceScale * x_source.
  const S=[sourceScale,0,0,0,sourceScale,0,0,0,1],imageToBoard=mul3(projection.imageToBoard,S),boardToImage=invertHomography(imageToBoard);
  return {...projection,imageToBoard,boardToImage,imageWidth:projection.imageWidth/sourceScale,imageHeight:projection.imageHeight/sourceScale};
}
