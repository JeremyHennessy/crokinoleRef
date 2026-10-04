// Test-only source. The production app receives a real canvas MediaStream and runs
// its ordinary capture, calibration, worker, scoreboard and MediaRecorder paths.
(() => {
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=720;
  const ctx=canvas.getContext('2d');
  const fixture={mode:'setup',start:null,secondStart:null,angled:false,evidenceClock:false,recorders:[]};
  const NativeRecorder=window.MediaRecorder;
  window.MediaRecorder=class extends NativeRecorder {
    constructor(...args){super(...args);if(fixture.evidenceClock)fixture.recorders.push(this);}
  };
  const circle=(x,y,r,color,stroke=null)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();if(stroke){ctx.lineWidth=2;ctx.strokeStyle=stroke;ctx.stroke();}};
  fixture.point=(x,y)=>fixture.angled?{x:x+.10*y-30,y:.08*x+.72*y+75}:{x,y};
  fixture.shoot=()=>{fixture.mode='shot';fixture.start=performance.now();};
  fixture.second=()=>{fixture.mode='second';fixture.secondStart=performance.now();};
  fixture.roundPucks=[];fixture.roundMove=null;
  fixture.placeRoundPuck=team=>{
    const start={x:480,y:team===0?600:120},n=fixture.roundPucks.filter(p=>p.team===team).length;
    fixture.roundPucks.push({team,...start,target:{x:team===0?600:360,y:n===0?320:400}});
    fixture.mode='round-play';
  };
  fixture.flickRoundPuck=()=>{fixture.roundMove={index:fixture.roundPucks.length-1,start:performance.now(),from:{...fixture.roundPucks.at(-1)}};};
  const draw=()=>{
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#223e35';ctx.fillRect(0,0,960,720);
    if(fixture.angled)ctx.setTransform(1,.08,.10,.72,-30,75);
    circle(480,360,280,'#dfc594');
    for(const r of [260,185,94]){ctx.strokeStyle='#4a3929';ctx.lineWidth=2;ctx.beginPath();ctx.arc(480,360,r,0,Math.PI*2);ctx.stroke();}
    for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.strokeStyle='#705939';ctx.beginPath();ctx.moveTo(480+250*Math.cos(a),360+250*Math.sin(a));ctx.lineTo(480+260*Math.cos(a),360+260*Math.sin(a));ctx.stroke();}
    for(let i=0;i<8;i++)circle(480+Math.cos(i*Math.PI/4)*94,360+Math.sin(i*Math.PI/4)*94,5,'#4a3929');
    circle(480,360,12,'#302c22');
    if(fixture.mode==='setup')circle(620,290,14,'rgb(46,113,143)');
    if(['pucks','shot','second'].includes(fixture.mode)){
      let ay=572,by=400;
      if(fixture.start!==null){const t=(performance.now()-fixture.start)/1000;ay=572-Math.max(0,Math.min(t,.6))*240;by=400-Math.max(0,Math.min(t-.6,.55))*200;}
      if(fixture.mode==='second')ay=428-Math.max(0,Math.min((performance.now()-fixture.secondStart)/1000,.5))*56;
      circle(480,ay,14,'rgb(46,113,143)');circle(480,by,14,'rgb(168,64,54)');circle(620,290,14,'rgb(46,113,143)');circle(340,410,14,'rgb(168,64,54)');
    }
    if(fixture.mode==='team-teach'){
      circle(620,290,14,'rgb(25,25,25)');circle(340,410,14,'rgb(240,240,240)');
    }
    if(fixture.mode==='round-play'){
      if(fixture.roundMove){const m=fixture.roundMove,p=fixture.roundPucks[m.index],t=Math.min(1,(performance.now()-m.start)/700);p.x=m.from.x+(p.target.x-m.from.x)*t;p.y=m.from.y+(p.target.y-m.from.y)*t;if(t===1)fixture.roundMove=null;}
      for(const d of fixture.roundPucks)circle(d.x,d.y,14,d.team===0?'rgb(25,25,25)':'rgb(240,240,240)');
    }
    // Test-only pixel clock OUTSIDE the scoring area. The decoder reads these
    // 24 bits from saved video, independently of the app's pre-roll metadata.
    if(fixture.evidenceClock){
      ctx.setTransform(1,0,0,1,0,0);
      const ticks=Math.floor(performance.now()/10);
      for(let i=0;i<24;i++){
        ctx.fillStyle=(ticks>>i)&1?'#fff':'#000';ctx.fillRect(8+i*12,8,10,14);
      }
    }
  };
  draw();setInterval(draw,1000/30);
  window.syntheticCamera=fixture;
  navigator.mediaDevices.getUserMedia=async constraints=>{
    if(constraints.audio!==false)throw Error('The app unexpectedly requested audio');
    draw();return canvas.captureStream(30);
  };
})();
