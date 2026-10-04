"""Test-only current runtime profiling. No source timestamps/gates/settings changed."""
import functools,http.server,json,threading,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=s.serve_forever,daemon=True).start()
probe=r'''(() => {
 const ids=new WeakMap(),stats={},slow=[];let next=0;
 for(const method of ['drawImage','getImageData','stroke','strokeText','fillText']){
  const original=CanvasRenderingContext2D.prototype[method];
  CanvasRenderingContext2D.prototype[method]=function(...args){
   const c=this.canvas;if(!ids.has(c))ids.set(c,++next);
   const label=c.id||'canvas-'+ids.get(c),key=label+':'+method;
   const t=performance.now();try{return original.apply(this,args);}finally{
    const ms=performance.now()-t;const v=stats[key]||(stats[key]={n:0,total:0,max:0,width:c.width,height:c.height});v.n++;v.total+=ms;v.max=Math.max(v.max,ms);
    if(ms>8){slow.push({wall:t,ms,key,source:method==='drawImage'?(args[0]?.tagName||'bitmap'):null});if(slow.length>150)slow.shift();}
   }
  };
 }
 const Original=window.Worker,spans=[];
 window.Worker=class extends Original{constructor(...a){super(...a);this.addEventListener('message',({data:m})=>{if(m.processing){spans.push({wall:performance.now(),media:m.time,gap:m.frameGap,processing:m.processing});if(spans.length>3500)spans.shift();}});}};
 window.stageProbe=()=>({stats,slow,spans});
})();'''
result={'runtimeChanges':False,'shots':[],'errors':[]};page=None
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':1440,'height':1100});page=ctx.new_page()
 page.on('pageerror',lambda e:result['errors'].append(str(e)))
 page.add_init_script((ROOT/'tests/capture_timing_probe.js').read_text());page.add_init_script(probe);page.add_init_script((ROOT/'tests/synthetic_camera.js').read_text())
 try:
  page.goto(f'http://127.0.0.1:{s.server_port}',wait_until='networkidle');expect(page.locator('#local-storage-status')).to_have_attribute('data-ready','true')
  page.evaluate('syntheticCamera.mode="empty"');page.locator('#format-preset').select_option('singles');page.locator('#connect').click()
  expect(page.locator('#cal-title')).to_contain_text('Smart setup found the board',timeout=15000);page.locator('#cal-apply').click();page.wait_for_timeout(300);page.locator('#background').click()
  page.evaluate('syntheticCamera.mode="team-teach"');expect(page.locator('#team-colour-status')).to_contain_text('locked',timeout=15000)
  page.evaluate('syntheticCamera.clearRound()');page.wait_for_timeout(1000);page.locator('#toggle-play').click()
  for shot in range(16):
   expect(page.locator('#buffer-status')).to_have_attribute('data-ready','true',timeout=15000)
   page.evaluate('(t)=>syntheticCamera.placeFullPuck(t)',shot%2);page.wait_for_timeout(450);page.evaluate('syntheticCamera.flickRoundPuck()')
   expect(page.locator('#clip-count')).to_have_text(str(shot+1),timeout=20000)
   result['shots'].append(page.evaluate('''()=>({match:JSON.parse(localStorage.getItem('crokinole-ref-match-v1')),status:document.querySelector('#auto-status').textContent,count:document.querySelector('#auto-round-status').textContent,at:performance.now()})'''))
  page.wait_for_timeout(1000);result['finalStatus']=page.locator('#round-status').inner_text()
 except Exception as e:
  result['error']=str(e);traceback.print_exc()
 finally:
  if page:
   result['capture']=page.evaluate('captureProbe.checkpoint()');result['stages']=page.evaluate('stageProbe()')
  (OUT/'frame-stage-profile.json').write_text(json.dumps(result,indent=2));ctx.close();b.close();s.shutdown()
print(json.dumps({'final':result.get('finalStatus'),'error':result.get('error'),'shots':len(result['shots']),'slow':result['stages']['slow'][-30:]},indent=2))
assert not result.get('error') and not result['errors']
