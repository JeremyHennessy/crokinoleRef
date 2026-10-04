/** Image-change evidence, not a semantic hand detector. Unknown foreground is
 * retained even if it was NEVER previously tracked. A small puck cluster must
 * not disappear into a large whole-board percentage threshold. */
export function createVisibilityWorkspace(width,height){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>16777216)throw Error('Invalid visibility workspace size.');
  const size=Math.ceil(width/2)*Math.ceil(height/2);
  return {width,height,residual:new Uint8Array(size),stack:new Int32Array(size)};
}
export function assessVisibility(pixels, background, width, height, calibration, discs, workspace=null) {
  if (!background || !calibration || pixels.length !== width * height * 4 || background.length !== pixels.length) return { viewObstructed: true, unexplainedPixels: null, unresolvedRegions: [] };
  const {center, rings, discRadius} = calibration;
  const step=2, cols=Math.ceil(width/step), rows=Math.ceil(height/step);
  if(workspace&&(workspace.width!==width||workspace.height!==height))throw Error('Visibility workspace does not match this frame.');
  const {residual,stack}=workspace||createVisibilityWorkspace(width,height);residual.fill(0);
  let changed=0,unexplained=0,sampled=0;
  for(let gy=0;gy<rows;gy++) for(let gx=0;gx<cols;gx++) {
    const x=gx*step,y=gy*step;
    if ((x-center.x)**2+(y-center.y)**2 > rings[2]**2) continue;
    const i=(y*width+x)*4; if(!pixels[i+3]||!background[i+3])continue;
    sampled++;
    const delta=(pixels[i]-background[i])**2+(pixels[i+1]-background[i+1])**2+(pixels[i+2]-background[i+2])**2;
    if(delta<42**2)continue;
    changed++;
    if(!discs.some(d=>(x-d.x)**2+(y-d.y)**2<(d.r*1.35)**2)){unexplained++;residual[gy*cols+gx]=1;}
  }
  const unresolvedRegions=[],minArea=Math.max(12,Math.PI*discRadius**2*.35);
  for(let start=0;start<residual.length;start++){
    if(!residual[start])continue;
    let top=0,area=0,minX=cols,minY=rows,maxX=0,maxY=0;
    stack[top++]=start;residual[start]=0;
    while(top){const p=stack[--top],x=p%cols,y=Math.floor(p/cols);area++;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      for(const q of [x>0?p-1:-1,x+1<cols?p+1:-1,y>0?p-cols:-1,y+1<rows?p+cols:-1])if(q>=0&&residual[q]){residual[q]=0;stack[top++]=q;}
    }
    if(area*4>=minArea)unresolvedRegions.push({x:minX*2,y:minY*2,width:(maxX-minX+1)*2,height:(maxY-minY+1)*2,area:area*4,kind:'unresolved-foreground'});
  }
  const limit=Math.max(Math.PI*discRadius**2*.65,sampled*.008);
  return {viewObstructed:sampled===0||unexplained>limit||unresolvedRegions.length>0,unexplainedPixels:unexplained*4,changedFraction:sampled?changed/sampled:1,unresolvedRegions:unresolvedRegions.slice(0,32)};
}
