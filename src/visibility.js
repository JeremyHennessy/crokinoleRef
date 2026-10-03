/** Conservative image-change diagnostic, not a semantic hand detector. */
export function assessVisibility(pixels, background, width, height, calibration, discs) {
  if (!background || !calibration || pixels.length !== width * height * 4 || background.length !== pixels.length) return { viewObstructed: true, unexplainedPixels: null };
  const {center, rings, discRadius} = calibration;
  let changed = 0, unexplained = 0, sampled = 0;
  // Sample every second pixel to keep this gate light enough for webcam frames.
  for (let y=Math.max(0,Math.floor(center.y-rings[2]));y<Math.min(height,center.y+rings[2]);y+=2) {
    for (let x=Math.max(0,Math.floor(center.x-rings[2]));x<Math.min(width,center.x+rings[2]);x+=2) {
      if ((x-center.x)**2+(y-center.y)**2 > rings[2]**2) continue;
      const i=(y*width+x)*4; if(pixels[i+3]===0||background[i+3]===0)continue;
      sampled++;
      const delta=(pixels[i]-background[i])**2+(pixels[i+1]-background[i+1])**2+(pixels[i+2]-background[i+2])**2;
      if(delta<42**2)continue;
      changed++;
      if(!discs.some(d=>(x-d.x)**2+(y-d.y)**2<(d.r*1.55)**2))unexplained++;
    }
  }
  const limit=Math.max(Math.PI*discRadius**2*.65,sampled*.008);
  return {viewObstructed:sampled===0||unexplained>limit,unexplainedPixels:unexplained*4,changedFraction:sampled?changed/sampled:1};
}
