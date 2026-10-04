/** Conservative geometric hypotheses for 2–6 touching same-colour discs.
 * These are review overlays, not scored detections. No inferred identity is
 * permitted to manufacture a contact, a 20, or a clean automatic score. */
export function fitCluster(members, width, bounds, radius, team) {
  const {minX,minY,maxX,maxY}=bounds,w=maxX-minX+3,h=maxY-minY+3;
  if(members.length<Math.PI*radius**2*1.3||members.length>Math.PI*radius**2*6.8||w>radius*13||h>radius*13)return [];
  const mask=new Uint8Array(w*h),dt=new Float32Array(w*h),root=Math.SQRT2;
  for(const p of members)mask[(Math.floor(p/width)-minY+1)*w+(p%width-minX+1)]=1;
  for(let i=0;i<dt.length;i++)dt[i]=mask[i]?1e6:0;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x;if(mask[p])dt[p]=Math.min(dt[p],dt[p-1]+1,dt[p-w]+1,dt[p-w-1]+root,dt[p-w+1]+root);}
  for(let y=h-2;y>0;y--)for(let x=w-2;x>0;x--){const p=y*w+x;if(mask[p])dt[p]=Math.min(dt[p],dt[p+1]+1,dt[p+w]+1,dt[p+w+1]+root,dt[p+w-1]+root);}
  const peaks=[];
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=y*w+x,v=dt[p];if(v<radius*.65||v>radius*1.3)continue;
    if([p-1,p+1,p-w,p+w,p-w-1,p-w+1,p+w-1,p+w+1].every(k=>dt[k]<=v))peaks.push({x:x+minX-1,y:y+minY-1,v});
  }
  peaks.sort((a,b)=>b.v-a.v||a.y-b.y||a.x-b.x);
  const centres=[];for(const p of peaks)if(centres.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>radius*1.5))centres.push(p);
  if(centres.length<2||centres.length>6)return [];
  let covered=0,template=0,inside=0;
  for(const p of members){const x=p%width,y=Math.floor(p/width);if(centres.some(q=>Math.hypot(x-q.x,y-q.y)<=radius*1.16))covered++;}
  for(const q of centres)for(let y=Math.floor(q.y-radius);y<=q.y+radius;y++)for(let x=Math.floor(q.x-radius);x<=q.x+radius;x++){
    if((x-q.x)**2+(y-q.y)**2>radius**2)continue;template++;const xx=x-minX+1,yy=y-minY+1;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[yy*w+xx])inside++;
  }
  if(covered/members.length<.90||inside/template<.87)return [];
  return centres.map(q=>({x:q.x,y:q.y,r:radius,team,kind:'cluster-hypothesis',review:true}));
}
