"""Full smart-setup games, negative evidence and durable library acceptance.
All footage is SYNTHETIC. No physical-camera accuracy assertion.
"""
import functools, http.server, json, os, threading, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
checks=[];errors=[]
def passed(s):checks.append(s);print('PASS',s,flush=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}),args=['--no-sandbox'])
    for angled in [False,True]:
        ctx=browser.new_context(viewport={'width':1440,'height':1100},accept_downloads=True)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
        page.add_init_script((ROOT/'tests/synthetic_camera.js').read_text());page.goto(base,wait_until='networkidle')
        expect(page.locator('#local-storage-status')).to_have_attribute('data-ready','true')
        page.evaluate('(a)=>{syntheticCamera.angled=a;syntheticCamera.mode="empty"}',angled)
        page.locator('#format-preset').select_option('singles');page.locator('#connect').click()
        expect(page.locator('#cal-title')).to_contain_text('Smart setup found the board',timeout=15000)
        page.locator('#cal-apply').click();page.wait_for_timeout(300);page.locator('#background').click()
        page.evaluate('syntheticCamera.mode="team-teach"')
        expect(page.locator('#team-colour-status')).to_contain_text('locked',timeout=15000)
        with page.expect_download() as dl:page.locator('#export-diagnostics').click()
        fp=OUT/f'diagnostics-teach-{angled}.json';dl.value.save_as(str(fp));diag=json.loads(fp.read_text())
        assert diag['activeConfiguration']['calibration']['radiusSource']=='stationary-puck-pixel-area'
        passed(f'{angled=}: smart board fit + automatic colours + measured puck radius without calibration clicks')
        page.evaluate('syntheticCamera.clearRound()');page.wait_for_timeout(1000)
        page.locator('#toggle-play').click();expect(page.locator('.setup')).to_be_hidden()
        for field in ['format-preset','starting-team']:
            assert page.locator('#'+field).bounding_box()['width'] >= 160, 'Game-format controls must remain readable'
        page.screenshot(path=str(OUT/f'play-view-{angled}.png'),full_page=True)
        total=0
        for round_index in range(2):
            if round_index:page.evaluate('syntheticCamera.clearRound()');page.wait_for_timeout(1000)
            expect(page.locator('#auto-round-status')).to_contain_text('Shots remaining')
            for shot in range(16):
                team=(shot+round_index)%2 # B starts the second round.
                expect(page.locator('#buffer-status')).to_have_attribute('data-ready','true',timeout=15000)
                page.evaluate('(team)=>syntheticCamera.placeFullPuck(team)',team);page.wait_for_timeout(450)
                page.evaluate('syntheticCamera.flickRoundPuck()');total+=1
                expect(page.locator('#clip-count')).to_have_text(str(total),timeout=20000)
                # Inspect persisted match rather than injecting expected detector output.
                if shot<15:
                    expect(page.locator('#round-status')).to_contain_text(f'Round {round_index+1}')
                else:
                    expect(page.locator('#round-status')).to_contain_text(f'Round {round_index+2}',timeout=8000)
            saved=page.evaluate('JSON.parse(localStorage.getItem("crokinole-ref-match-v1"))')
            assert saved['rounds'][-1]['scores']==[80,80],saved['rounds'][-1]
            assert saved['rounds'][-1]['source']=='automatic'
            assert saved['rounds'][-1]['shotCountEvidence']['used']==[8,8]
            passed(f'{angled=}: full round {round_index+1} completed 16 observed launches and 80–80, starting team {round_index%2}')
        expect(page.locator('#local-storage-status')).to_have_attribute('data-pending','0',timeout=15000)
        with page.expect_download(timeout=30000) as dl:page.locator('#export-match-clips').click()
        archive=OUT/f'full-match-{angled}.zip';dl.value.save_as(str(archive))
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            videos=[n for n in z.namelist() if n.startswith('clips/')];assert len(videos)==32
            payload=json.loads(z.read('match.json'));assert len(payload['match']['rounds'])==2
            assert all(c['complete'] for c in payload['clips'])
            assert all(c['preRollSeconds']>0 for c in payload['clips'])
            assert len([n for n in z.namelist() if n.startswith('fixtures/')])==32
            # Save one fixture/video for the independent ffmpeg->Node replay proof.
            if not angled:
                first=payload['clips'][0]['id'];z.extract(f'clips/{first}.webm',OUT/'offline-proof');z.extract(f'fixtures/{first}.json',OUT/'offline-proof')
        passed(f'{angled=}: all 32 original clips + fixtures export in a valid CRC-checked ZIP')
        page.locator('#toggle-play').click();page.locator('#stop-source').click();page.reload(wait_until='networkidle')
        expect(page.locator('#clip-count')).to_have_text('32',timeout=15000)
        expect(page.locator('#round-status')).to_contain_text('Round 3')
        page.locator('#clips button',has_text='Review').first.click()
        v=page.locator('#replay-video');v.evaluate('(v)=>v.play()');page.wait_for_timeout(300);assert v.evaluate('(v)=>v.videoWidth')>0
        page.locator('#review-note').fill('Retained review note');page.locator('#save-verdict').click()
        expect(page.locator('#local-storage-status')).to_have_attribute('data-pending','0',timeout=10000)
        page.reload(wait_until='networkidle');expect(page.locator('#clip-count')).to_have_text('32',timeout=10000)
        page.locator('#clips button',has_text='Review').first.click();expect(page.locator('#review-note')).to_have_value('Retained review note');page.locator('#close-replay').click()
        page.locator('#clips .clip-actions button').filter(has_text='×').first.click();expect(page.locator('#clip-count')).to_have_text('31',timeout=10000)
        page.reload(wait_until='networkidle');expect(page.locator('#clip-count')).to_have_text('31',timeout=10000)
        passed(f'{angled=}: saved clips, playable video and match survive reload without reopening camera')
        if angled:
            page.set_viewport_size({'width':390,'height':844});page.locator('#toggle-play').click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            for field in ['format-preset','starting-team','round-allocation']:
                assert page.locator('#'+field).bounding_box()['width'] >= 160, 'Mobile format fields cannot shrink to arrows'
            page.screenshot(path=str(OUT/'play-mobile.png'),full_page=True)
            page.locator('#play-review').click();expect(page.locator('#review-board')).to_have_attribute('open','')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            passed('390px Play view and board correction controls fit and return to setup')
        ctx.close()
    ctx=browser.new_context(accept_downloads=True);page=ctx.new_page()
    page.add_init_script("Object.defineProperty(window,'indexedDB',{get(){return {open(){throw new DOMException('Test storage denial','SecurityError')}}}})")
    page.add_init_script((ROOT/'tests/synthetic_camera.js').read_text());page.goto(base,wait_until='networkidle')
    expect(page.locator('#local-storage-status')).to_have_attribute('data-ready','true')
    expect(page.locator('#local-storage-status')).to_contain_text('unavailable')
    page.locator('#connect').click();expect(page.locator('#source-badge')).to_contain_text('LIVE')
    page.locator('#record').click();page.wait_for_timeout(400);page.locator('#stop-record').click()
    expect(page.locator('#clip-count')).to_have_text('1',timeout=10000)
    expect(page.locator('#clips')).to_contain_text('NOT SAVED',timeout=10000)
    page.locator('#clips button',has_text='Review').click()
    with page.expect_download() as dl:page.locator('#download-clip').click()
    dl.value.save_as(str(OUT/'storage-denial-proof.webm'))
    assert (OUT/'storage-denial-proof.webm').stat().st_size>0
    passed('Denied local storage retains exportable in-tab recording and never labels it saved')
    ctx.close();browser.close();server.shutdown()
assert not errors,errors
(OUT/'reliability-report.json').write_text(json.dumps({'checks':checks,'errors':errors,'physicalCameraTested':False},indent=2))
print(len(checks),'reliability browser checks passed',flush=True)
