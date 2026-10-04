"""One-variable comparison of full-size CPU copying versus direct destinations.
Both paths use the actual app, worker, recorder and real presentation timestamps.
The alternative is served only in this test until its evidence is reviewed.
"""
import functools,http.server,json,os,re,threading,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
BASE=(ROOT/'src/app.js').read_text()
assert hashlib.sha256(BASE.encode()).hexdigest()=='706b67cebb932e26adcec17e9dc9de6dc8cba36428f69c53372222583f6d2946'
DIRECT=BASE
replacements=[
("  if (state.mode !== 'demo') rawCtx.drawImage(video, 0, 0, raw.width, raw.height);\n  ctx.drawImage(raw, 0, 0); drawOverlay();", "  const frameSource = state.mode === 'demo' ? raw : video;\n  ctx.drawImage(frameSource, 0, 0, board.width, board.height); drawOverlay();"),
("    smallCtx.drawImage(raw, 0, 0, small.width, small.height);", "    smallCtx.drawImage(frameSource, 0, 0, small.width, small.height);"),
("  smallCtx.drawImage(raw, 0, 0, small.width, small.height); state.background = smallCtx.getImageData(0, 0, small.width, small.height).data;", "  smallCtx.drawImage(state.mode === 'demo' ? raw : video, 0, 0, small.width, small.height); state.background = smallCtx.getImageData(0, 0, small.width, small.height).data;"),
("  state.sampleTeam = team; state.calibrationPoints = null; ctx.drawImage(raw, 0, 0);", "  if (state.mode !== 'demo' && video.readyState >= 2) rawCtx.drawImage(video, 0, 0, raw.width, raw.height);\n  state.sampleTeam = team; state.calibrationPoints = null; ctx.drawImage(raw, 0, 0);"),
("$('overlays').onchange = () => { if (state.mode !== 'idle') { ctx.drawImage(raw, 0, 0); drawOverlay(); } };", "$('overlays').onchange = () => { if (state.mode !== 'idle') { const source = state.mode === 'demo' || state.calibrationPoints || state.sampleTeam !== null ? raw : video; ctx.drawImage(source, 0, 0, board.width, board.height); drawOverlay(); } };")]
for old,new in replacements:
    assert DIRECT.count(old)==1,old
    DIRECT=DIRECT.replace(old,new)
Path('/tmp/direct-candidate-app.js').write_text(DIRECT)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
report={'cases':[],'errors':[],'physicalCameraTested':False,'baselineSHA256':hashlib.sha256(BASE.encode()).hexdigest(),'directSHA256':hashlib.sha256(DIRECT.encode()).hexdigest()}
probe="""(()=>{const original=CanvasRenderingContext2D.prototype.drawImage,stats={};window.canvasPathStats=stats;
CanvasRenderingContext2D.prototype.drawImage=function(...args){
 const label=(args[0] instanceof HTMLVideoElement?'video':'canvas')+'->'+(this.canvas.id||'offscreen')+':'+this.canvas.width+'x'+this.canvas.height;
 const s=stats[label]||(stats[label]={count:0,totalMs:0,maxMs:0,slow:[],readFrequently:this.getContextAttributes?.().willReadFrequently});
 const start=performance.now();try{return original.apply(this,args);}finally{const ms=performance.now()-start;s.count++;s.totalMs+=ms;s.maxMs=Math.max(s.maxMs,ms);if(ms>40&&s.slow.length<40)s.slow.push({wall:start,ms});}
};})();"""
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}),args=['--no-sandbox'])
    for angled,direct in [(False,False),(False,True),(True,False),(True,True)]:
        case={'angled':angled,'directDestinations':direct};report['cases'].append(case)
        ctx=browser.new_context(accept_downloads=True,viewport={'width':1440,'height':1100});page=ctx.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.route(re.compile(r'.*/src/app\.js(?:\?.*)?$'),lambda route:route.fulfill(status=200,content_type='text/javascript',body=DIRECT if direct else BASE))
        page.add_init_script((ROOT/'tests/capture_timing_probe.js').read_text());page.add_init_script(probe);page.add_init_script((ROOT/'tests/synthetic_camera.js').read_text())
        try:
            page.goto(base,wait_until='networkidle');expect(page.locator('#local-storage-status')).to_have_attribute('data-ready','true')
            page.locator('#round-allocation').fill('2');page.locator('#round-allocation').press('Tab')
            page.evaluate('(a)=>{syntheticCamera.angled=a;syntheticCamera.mode="empty"}',angled)
            page.locator('#connect').click();expect(page.locator('#cal-title')).to_contain_text('Smart setup found the board',timeout=15000);page.locator('#cal-apply').click()
            page.wait_for_timeout(300);page.locator('#background').click();page.evaluate('syntheticCamera.mode="team-teach"');expect(page.locator('#team-colour-status')).to_contain_text('locked',timeout=15000)
            page.evaluate('syntheticCamera.clearRound()');page.wait_for_timeout(1000);expect(page.locator('#auto-round-status')).to_contain_text('Shots remaining')
            for i in range(4):
                expect(page.locator('#buffer-status')).to_have_attribute('data-ready','true',timeout=15000)
                page.evaluate('(team)=>syntheticCamera.placeRoundPuck(team)',i%2);page.wait_for_timeout(450);page.evaluate('syntheticCamera.flickRoundPuck()')
                expect(page.locator('#clip-count')).to_have_text(str(i+1),timeout=20000)
                with page.expect_download() as dl:page.locator('#export-session').click()
                p=OUT/f'pipeline-{angled}-{direct}-{i}.json';dl.value.save_as(str(p));payload=json.loads(p.read_text());event=payload['clips'][0]['autoResult']
                assert event['score']['visible']==[10*((i+2)//2),10*((i+1)//2)]
            evidence=page.evaluate('captureProbe.checkpoint()');case['timing']=evidence
            shots=[e for e in evidence['shots'] if e['type']=='shot-end'];case['shotGaps']=[e['hadFrameGap'] for e in shots]
            saved=page.evaluate('JSON.parse(localStorage.getItem("crokinole-ref-match-v1"))');case['unassistedCompleted']=saved['round']==2
            case['paths']=page.evaluate('canvasPathStats')
            assert len(shots)==4
            if direct:
                assert case['paths'].get('video->offscreen:960x720',{}).get('count',0)<15,'No continuous full-resolution CPU readback'
                assert case['paths']['video->board:960x720']['count']>100
                assert not any(case['shotGaps']) and case['unassistedCompleted'],'The alternative must establish clean unassisted capture, not a review bypass'
            print('PIPELINE',json.dumps(case),flush=True)
        finally:
            try:case['paths']=page.evaluate('canvasPathStats');case['timing']=page.evaluate('captureProbe.checkpoint()')
            except Exception as e:case['error']=str(e)
            (OUT/'canvas-pipeline-report.json').write_text(json.dumps(report,indent=2));ctx.close()
    assert not report['errors'],report['errors']
    browser.close();server.shutdown()
print('4 canvas pipeline comparisons completed without changing clocks or evidence gates',flush=True)
