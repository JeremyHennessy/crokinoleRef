"""User-facing PHYSICS demo acceptance, separate from camera accuracy tests."""
import functools, http.server, json, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
checks=[];errors=[]
def passed(s):checks.append(s);print('PASS',s,flush=True)
expected=['20,0','20,15','35,10','35,25','35,20','30,35','45,35','45,50','55,50','40,65','55,65','50,80','65,65','65,75','75,75','70,90']
def database(page):
    return page.evaluate('''async()=>{const {ClipStore}=await import('./src/local-library.js');const s=new ClipStore();const data={matches:await s.matches(),clips:await Promise.all((await s.clips()).map(async c=>({...c,blob:await c.blob.text()})))};s.close();return data;}''')
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}),args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100},record_video_dir=str(OUT/'physics-recording'))
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('''window.demoPermissionCalls=0;window.demoRecorderCalls=0;navigator.mediaDevices.getUserMedia=()=>{window.demoPermissionCalls++;throw Error('Demo must not ask for a camera');};if(window.MediaRecorder)window.MediaRecorder=new Proxy(window.MediaRecorder,{construct(){window.demoRecorderCalls++;throw Error('Demo must not record');}});''')
    page.goto(base,wait_until='networkidle');expect(page.locator('#local-storage-status')).to_have_attribute('data-ready','true')
    page.get_by_role('textbox',name='Team A name').fill('Jeremy');page.get_by_role('textbox',name='Team A name').press('Tab')
    page.get_by_role('textbox',name='Team B name').fill('Alison');page.get_by_role('textbox',name='Team B name').press('Tab')
    page.get_by_role('button',name='Add 20 points to team A',exact=True).click()
    page.get_by_role('button',name='Add 10 points to team B',exact=True).click()
    page.locator('#format-preset').select_option('doubles');page.locator('#starting-team').select_option('1')
    expect(page.locator('#local-storage-status')).to_have_attribute('data-pending','0')
    page.evaluate('''async()=>{const {ClipStore}=await import('./src/local-library.js');const s=new ClipStore();await s.saveClip({id:'preservation-fixture',matchId:'test-only',blob:new Blob(['unchanged test bytes'],{type:'video/webm'}),createdAt:'2026-01-01T00:00:00Z',title:'Test fixture',duration:1,source:'test-only',contacts:[],note:'Keep this note',verdict:'review-needed'});s.close();}''')
    page.reload(wait_until='networkidle');expect(page.locator('#clip-count')).to_have_text('1')
    original=page.evaluate("localStorage.getItem('crokinole-ref-match-v1')");stored=database(page)
    page.locator('#demo-round').click();panel=page.locator('#full-round-controls')
    expect(panel).to_be_visible();expect(panel).to_have_attribute('data-completed','0');expect(panel).to_have_attribute('data-engine','swept-circle-v1')
    expect(page.locator('#play-score')).to_contain_text('Demo round 1')
    page.locator('#demo-pause').click();expect(panel).to_have_attribute('data-paused','true')
    page.wait_for_timeout(1500);expect(panel).to_have_attribute('data-completed','0')
    page.screenshot(path=str(OUT/'full-demo-desktop.png'),full_page=True)
    passed('Full demo starts on an empty board without calibration and pause freezes its shot count')
    page.locator('#demo-speed').select_option('2');page.locator('#demo-pause').click()
    expect(panel).to_have_attribute('data-completed','16',timeout=60000)
    expect(panel).to_have_attribute('data-score','70,90');expect(panel).to_have_attribute('data-phase','complete')
    expect(page.locator('#demo-result')).to_contain_text('A 0 · B 20')
    expect(page.locator('#demo-ledger')).to_contain_text('Banked 20s: A 1 · B 0')
    page.wait_for_timeout(750);expect(panel).to_have_attribute('data-completed','16')
    assert page.locator('#demo-shot-log li').count()==16
    page.screenshot(path=str(OUT/'full-demo-finished.png'),full_page=True)
    passed('Unassisted autoplay at 2× completes all 16 shots, scores 70–90 and awards the 20-point margin once')
    guided=page.locator('#board').evaluate('(canvas)=>canvas.toDataURL()')
    page.locator('#overlays').uncheck();page.wait_for_timeout(100)
    plain=page.locator('#board').evaluate('(canvas)=>canvas.toDataURL()')
    assert guided!=plain,'Guides must change rendered pixels, including while the completed round is held'
    page.locator('#overlays').check();page.wait_for_timeout(100)
    assert page.locator('#board').evaluate('(canvas)=>canvas.toDataURL()')==guided
    expect(panel).to_have_attribute('data-score','70,90')
    passed('Existing Guides switch removes and restores the overlay without changing the simulated result')
    assert page.evaluate("localStorage.getItem('crokinole-ref-match-v1')")==original
    assert database(page)==stored
    passed('Autoplay writes neither the saved live match nor existing clip bytes, notes or match snapshots')
    page.locator('#demo-restart').click();expect(panel).to_have_attribute('data-completed','0')
    page.locator('#demo-pause').click()
    for i,score in enumerate(expected):
        page.locator('#demo-next-shot').click();expect(panel).to_have_attribute('data-completed',str(i+1));expect(panel).to_have_attribute('data-score',score)
    expect(page.locator('#demo-result')).to_contain_text('Demo match total: 0–20')
    expect(page.locator('#demo-shot-log')).to_contain_text('Stopped outer-line disc removed before the next shot')
    passed('Replay clears the demo result; skip control reproduces every independently expected intermediate score')
    page.locator('#demo-next-round').click();expect(panel).to_have_attribute('data-round','2')
    expect(page.locator('#demo-round-status')).to_contain_text('Red / B');page.locator('#demo-pause').click()
    for i in range(16):page.locator('#demo-next-shot').click()
    expect(panel).to_have_attribute('data-score','90,70');expect(page.locator('#demo-result')).to_contain_text('Demo match total: 20–20')
    passed('Next demo round alternates the starter and adds the second award without duplicating the first')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.screenshot(path=str(OUT/'full-demo-mobile.png'),full_page=True)
    page.locator('#demo-exit').click();expect(panel).to_be_hidden();expect(page.locator('#score-0')).to_have_text('20');expect(page.locator('#score-1')).to_have_text('10')
    expect(page.get_by_role('textbox',name='Team A name')).to_have_value('Jeremy');expect(page.locator('#format-preset')).to_have_value('doubles');expect(page.locator('#starting-team')).to_have_value('1');expect(page.locator('#clip-count')).to_have_text('1')
    assert page.evaluate("localStorage.getItem('crokinole-ref-match-v1')")==original
    assert database(page)==stored
    assert not page.locator('body').evaluate("b=>b.classList.contains('play-mode')")
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.screenshot(path=str(OUT/'full-demo-mobile-welcome.png'),full_page=True)
    passed('390px layout fits; Exit restores names, scores, selected format/starter, layout and clip library')
    page.locator('#score-mode').select_option('match');expect(page.locator('#local-storage-status')).to_have_attribute('data-pending','0')
    original=page.evaluate("localStorage.getItem('crokinole-ref-match-v1')")
    page.locator('#demo-round').click();page.locator('#demo-pause').click()
    for i in range(16):page.locator('#demo-next-shot').click()
    expect(page.locator('#demo-result')).to_contain_text('A 0 · B 2 (match points)')
    page.reload(wait_until='networkidle');expect(page.locator('#score-0')).to_have_text('20');expect(page.locator('#score-mode')).to_have_value('match');expect(page.locator('#clip-count')).to_have_text('1')
    assert page.evaluate("localStorage.getItem('crokinole-ref-match-v1')")==original
    passed('Selected match-point mode awards 0–2; reloading during a demo recovers the original live match')
    page.locator('#demo-round').click()
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
    expect(panel).to_have_attribute('data-paused','true')
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(1200);expect(panel).to_have_attribute('data-completed','0');expect(panel).to_have_attribute('data-paused','true')
    page.locator('#demo-exit').click()
    passed('Simulated tab hiding pauses rather than skips the demo; returning requires Resume')
    page.locator('#demo').click();expect(page.locator('#source-badge')).to_have_text('DEMO · simulated board')
    expect(page.locator('#score-0')).to_have_text('25',timeout=12000);expect(page.locator('#score-1')).to_have_text('25')
    page.locator('#stop-source').click();expect(page.locator('#score-0')).to_have_text('20')
    assert page.evaluate('window.demoPermissionCalls')==0;assert page.evaluate('window.demoRecorderCalls')==0
    passed('Original detector-driven quick demo still scores 25–25; neither demo requests camera access or records')
    context.close();page.video.save_as(str(OUT/'physics-demo.webm'));browser.close();server.shutdown()
assert not errors,errors
(OUT/'full-round-demo-report.json').write_text(json.dumps({'checks':checks,'errors':errors,'physicsDemo':True,'physicalCameraTested':False},indent=2))
print(len(checks),'full-round demo checks passed',flush=True)
