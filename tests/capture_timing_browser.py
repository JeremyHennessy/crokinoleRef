"""Controlled capture comparisons and explicit interruption/recovery.
No suppressed frame gaps, retries, fabricated media times or camera-accuracy claim.
"""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
cases=[];errors=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}),args=['--no-sandbox'])
    for angled,buffered,inject in [(False,False,False),(False,True,False),(True,False,False),(True,True,False),(False,True,True)]:
        case={'angled':angled,'preRoll':buffered,'injectedMainThreadStallMs':320 if inject else 0,'passed':False};cases.append(case)
        context=browser.new_context(viewport={'width':1440,'height':1100})
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
        page.add_init_script((ROOT/'tests/capture_timing_probe.js').read_text())
        page.add_init_script((ROOT/'tests/synthetic_camera.js').read_text())
        try:
            page.goto(base,wait_until='networkidle')
            expect(page.locator('#local-storage-status')).to_have_attribute('data-ready','true')
            page.locator('#pre-roll').set_checked(buffered)
            page.locator('#round-allocation').fill('1');page.locator('#round-allocation').press('Tab')
            page.evaluate('(a)=>{syntheticCamera.angled=a;syntheticCamera.mode="empty"}',angled)
            page.locator('#connect').click();expect(page.locator('#cal-title')).to_contain_text('Smart setup found the board',timeout=15000)
            page.locator('#cal-apply').click();page.wait_for_timeout(300);page.locator('#background').click()
            page.evaluate('syntheticCamera.mode="team-teach"');expect(page.locator('#team-colour-status')).to_contain_text('locked',timeout=15000)
            page.evaluate('syntheticCamera.clearRound()');page.wait_for_timeout(1000)
            expect(page.locator('#auto-round-status')).to_contain_text('Shots remaining')
            for shot in range(2):
                if buffered:expect(page.locator('#buffer-status')).to_have_attribute('data-ready','true',timeout=15000)
                page.evaluate('(team)=>syntheticCamera.placeRoundPuck(team)',shot);page.wait_for_timeout(450)
                page.evaluate('syntheticCamera.flickRoundPuck()')
                if inject and shot==0:
                    page.wait_for_timeout(350)
                    page.evaluate('''()=>{const end=performance.now()+320;while(performance.now()<end){};}''')
                expect(page.locator('#clip-count')).to_have_text(str(shot+1),timeout=20000)
            evidence=page.evaluate('captureProbe.checkpoint()');case['timing']=evidence
            shots=[e for e in evidence['shots'] if e['type']=='shot-end'];assert len(shots)==2
            assert shots[-1]['score']['visible']==[10,10],shots[-1]
            case['shotGaps']=[e['hadFrameGap'] for e in shots]
            saved=page.evaluate('JSON.parse(localStorage.getItem("crokinole-ref-match-v1"))')
            case['unassistedRoundCompleted']=saved['round']==2
            if inject:
                assert any(case['shotGaps']),'Injected interruption must not be hidden'
                assert saved['round']==1 and saved['autoReviewHold'],'Interrupted footage cannot finish blindly'
                assert any(g['interval']>=300 for g in evidence['sourceGaps']) and any(g['interval']>=300 for g in evidence['presentationGaps']),'Probe must measure the injected source/presentation interruption'
            if saved['round']==1:
                # No count fabrication: complete launch history must already be intact.
                expect(page.locator('#auto-round-status')).to_have_attribute('data-used','1,1')
                page.locator('#apply-reviewed-score').click()
                expect(page.locator('#round-status')).to_contain_text('Round 2',timeout=8000)
                case['explicitReviewedRecovery']=True
            saved=page.evaluate('JSON.parse(localStorage.getItem("crokinole-ref-match-v1"))')
            assert len(saved['rounds'])==1 and saved['rounds'][0]['scores']==[10,10]
            page.wait_for_timeout(600);assert page.locator('.round-entry').count()==1
            case['passed']=True
            print('CAPTURE COMPARISON',json.dumps(case),flush=True)
        finally:
            try:case['timing']=page.evaluate('captureProbe.checkpoint()')
            except Exception as e:case['probeError']=str(e)
            (OUT/'capture-timing-report.json').write_text(json.dumps({'cases':cases,'errors':errors,'physicalCameraTested':False,'unchangedFrameGapThreshold':True},indent=2))
            context.close()
    browser.close();server.shutdown()
assert not errors,errors
assert all(c['passed'] for c in cases)
print('5 capture comparisons passed; interruption required explicit review; baseline unassisted counts reported separately',flush=True)
