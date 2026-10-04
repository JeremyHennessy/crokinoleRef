/** Local colour learning from stable, separate puck-shaped foreground objects.
 * Never infer teams from the board's wood, scoring ink, pegs, or one moving hand.
 * This is appearance grouping, not player identification or trained confidence.
 */
const colourDistance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const luminance = c => .299*c[0]+.587*c[1]+.114*c[2];
export function findColourPucks(pixels, background, width, height, c) {
  if (!c || !background || pixels.length!==width*height*4 || background.length!==pixels.length) return [];
  const mask=new Uint8Array(width*height),stack=new Int32Array(mask.length),R=c.rings[2],r=c.discRadius;
  const expected=Math.PI*r*r;
  if (!(r>=2)) return [];
  for (let y=Math.max(0,Math.floor(c.center.y-R));y<Math.min(height,c.center.y+R);y++) {
    for (let x=Math.max(0,Math.floor(c.center.x-R));x<Math.min(width,c.center.x+R);x++) {
      const i=(y*width+x)*4;
      if ((x-c.center.x)**2+(y-c.center.y)**2>(R-r)**2 || !pixels[i+3] || !background[i+3]) continue;
      const delta=(pixels[i]-background[i])**2+(pixels[i+1]-background[i+1])**2+(pixels[i+2]-background[i+2])**2;
      if (delta>42**2) mask[y*width+x]=1;
    }
  }
  const found=[];
  for (let start=0;start<mask.length;start++) {
    if(!mask[start]) continue;
    let top=0,area=0,sx=0,sy=0,minX=width,maxX=0,minY=height,maxY=0;
    stack[top++]=start;mask[start]=0;
    while(top) {
      const p=stack[--top],x=p%width,y=Math.floor(p/width);
      area++;sx+=x;sy+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1]) if(q>=0&&mask[q]){mask[q]=0;stack[top++]=q;}
    }
    const bw=maxX-minX+1,bh=maxY-minY+1,x=sx/area,y=sy/area;
    if(area<expected*.55||area>expected*1.5||bw/bh<.72||bw/bh>1.39||area/(bw*bh)<.58||bw<1.35*r||bh<1.35*r||bw>2.6*r||bh>2.6*r) continue;
    if(distance({x,y},c.center)<r*2.0) continue;
    const channels=[[],[],[]];
    for(let yy=Math.max(0,Math.floor(y-r*.45));yy<=Math.min(height-1,y+r*.45);yy++)for(let xx=Math.max(0,Math.floor(x-r*.45));xx<=Math.min(width-1,x+r*.45);xx++){
      if((xx-x)**2+(yy-y)**2>(r*.45)**2)continue;
      const p=(yy*width+xx)*4;
      for(let k=0;k<3;k++)channels[k].push(pixels[p+k]);
    }
    if(channels[0].length<4)continue;
    channels.forEach(a=>a.sort((u,v)=>u-v));
    if(channels.some(a=>a[Math.floor(a.length*.9)]-a[Math.floor(a.length*.1)]>48))continue;
    const color=channels.map(a=>a[Math.floor(a.length/2)]);
    found.push({x,y,r,color});
  }
  return found.slice(0,24);
}
export class TeamColourLearner {
  constructor(known=[null,null]) { this.known=known.map(c=>c?[...c]:null);this.previous=null;this.since=null;this.frames=0;this.lastTime=null; }
  update(candidates,time) {
    if(this.known.every(Boolean))return {colors:this.known,status:'locked'};
    const groups=[];
    for(const p of candidates){let g=groups.find(g=>colourDistance(g.color,p.color)<36);if(!g)groups.push(g={color:p.color,items:[]});g.items.push(p);}
    // More than two distinct groups is ambiguous; do not arbitrarily choose a pair.
    if(groups.length!==2||colourDistance(groups[0].color,groups[1].color)<80){this.previous=null;this.since=null;this.frames=0;return {colors:null,status:'Show one separate puck of each colour, with hands clear.'};}
    let pair=groups.map(g=>g.items[0]).sort((a,b)=>luminance(a.color)-luminance(b.color)||a.color[0]-b.color[0]||a.color[1]-b.color[1]);
    if(this.known.some(Boolean)) {
      const index=this.known.findIndex(Boolean),options=pair.map((p,i)=>({i,delta:colourDistance(p.color,this.known[index])})).filter(v=>v.delta<36);
      if(options.length!==1)return {colors:null,status:'The visible pucks do not match the existing team sample.'};
      if(options[0].i!==index)pair.reverse();
    }
    const stable=this.previous&&time>this.lastTime&&time-this.lastTime<=.4&&pair.every((p,i)=>distance(p,this.previous[i])<p.r*.5&&colourDistance(p.color,this.previous[i].color)<24);
    if(!stable){this.since=time;this.frames=1;}else this.frames++;
    this.previous=pair;this.lastTime=time;
    if(this.frames>=5&&time-this.since>=.55){this.known=pair.map((p,i)=>this.known[i]||p.color);return {colors:this.known,status:'Team colours detected and locked. Clear the setup pucks to start the round.'};}
    return {colors:null,status:'Two puck colours found · checking that they stay still…'};
  }
}
