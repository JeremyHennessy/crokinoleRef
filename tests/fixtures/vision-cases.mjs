/** Reproducible raster fixtures. No camera/worker output is injected. */
export function visionCase(index,width=161,height=123){
 let seed=(index+1)*7919;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const c={center:{x:width/2,y:height/2},rings:[height*.14,height*.28,height*.45],discRadius:height*.03,width,height};
 const colors=[[30,110,160],[175,55,40]],background=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<background.length;i+=4){const noise=Math.floor(rand()*8);background.set([203+noise,175+noise,117+noise,255],i);}
 const data=background.slice();
 function circle(x,y,r,rgb){for(let yy=Math.max(0,Math.floor(y-r));yy<Math.min(height,y+r+1);yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<Math.min(width,x+r+1);xx++)if((xx-x)**2+(yy-y)**2<=r*r)data.set([...rgb,255],(yy*width+xx)*4);}
 const type=index%8;
 if(type!==0)for(let i=0,n=type===7?16:1+index%6;i<n;i++){
   const a=rand()*Math.PI*2,rr=rand()*c.rings[2]*1.2;
   const x=c.center.x+rr*Math.cos(a),y=c.center.y+rr*Math.sin(a),r=c.discRadius*(.75+rand()*.5);
   circle(x,y,r,colors[i%2]);if(type===2&&i===0)circle(x+r*1.7,y,r,colors[0]);
 }
 if(type===3)circle(c.center.x+height*.15,c.center.y,c.discRadius,[245,245,245]);
 if(type===4)for(let y=height*.3|0;y<height*.6;y++)for(let x=width*.25|0;x<width*.55;x++)data.set([70,70,65,255],(y*width+x)*4);
 if(type===5)for(let i=0;i<data.length;i+=4){data[i]=Math.min(255,data[i]+20);data[i+1]=Math.min(255,data[i+1]+20);}
 if(type===6)for(let i=0;i<data.length;i+=32)data[i+3]=0;
 return {data,background,c,colors,width,height,tolerance:40+(index%5)*20};
}
