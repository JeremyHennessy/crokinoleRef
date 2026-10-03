"""Chromium API smoke checks with a synthetic camera, not physical-board validation."""
import functools
import http.server
import json
import os
from pathlib import Path
import re
import sys
import threading
import time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith('/crokinoleRef/'):
            path = path[len('/crokinoleRef'):]
        return super().translate_path(path)
    def log_message(self, *_):
        pass
server = None
if len(sys.argv) > 1:
    base = sys.argv[1].rstrip('/') + '/'
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/crokinoleRef/'
checks = []
def passed(name):
    checks.append(name)
    print(f'PASS {name}', flush=True)
def click_guide_points(page, points):
    canvas = page.locator('#cal-image')
    dimensions = canvas.evaluate('(c) => ({w:c.width,h:c.height})')
    for index, (x,y) in enumerate(points):
        canvas.scroll_into_view_if_needed()
        box = canvas.bounding_box()
        canvas.click(position={'x':x/dimensions['w']*box['width'], 'y':y/dimensions['h']*box['height']})
        if index < len(points)-1:
            expect(page.locator('#calibration-dialog')).to_have_attribute('data-step',str(index+2))

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}), args=['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    context = browser.new_context(viewport={'width':1440, 'height':1100}, accept_downloads=True)
    page = context.new_page()
    errors, external = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('request', lambda r: external.append(r.url) if urlparse(r.url).scheme in ('http','https') and urlparse(r.url).netloc != urlparse(base).netloc else None)
    page.on('dialog', lambda d: d.accept())
    page.goto(base, wait_until='networkidle')
    expect(page.locator('#welcome')).to_be_visible()
    expect(page.locator('#record')).to_be_disabled()
    assert page.locator('#source-video').evaluate('(v)=>v.srcObject === null')
    passed('initial page does not open camera; record is disabled')
    page.screenshot(path=str(OUT/'desktop.png'), full_page=True)
    page.get_by_role('button', name='Add 20 points to team A', exact=True).click()
    page.get_by_role('button', name='Add 15 points to team B', exact=True).click()
    page.locator('#finish-round').click()
    expect(page.locator('#round-status')).to_contain_text('Round 2')
    expect(page.locator('.match-total').first).to_have_text('Match total: 5')
    page.locator('#undo-score').click()
    expect(page.locator('#score-0')).to_have_text('20')
    expect(page.locator('#score-1')).to_have_text('15')
    page.reload(wait_until='networkidle')
    expect(page.locator('#score-0')).to_have_text('20')
    passed('manual scoreboard, round scoring, undo and local persistence')
    page.locator('#demo').click()
    expect(page.locator('#demo-label')).to_be_visible()
    expect(page.locator('#record')).to_be_disabled()
    expect(page.locator('#disc-count')).to_have_text('4', timeout=15000)
    page.wait_for_timeout(1800)
    page.screenshot(path=str(OUT/'demo.png'), full_page=True)
    assert page.locator('#board').evaluate('(c)=>Math.abs(c.getBoundingClientRect().width/c.getBoundingClientRect().height-c.width/c.height) < 0.01')
    passed('synthetic demo traverses real worker detector; canvas aspect ratio is preserved')
    auto_page=context.new_page()
    auto_page.goto(base,wait_until='networkidle')
    auto_page.locator('#demo').click()
    expect(auto_page.locator('#disc-count')).to_have_text('4',timeout=15000)
    expect(auto_page.locator('#score-0')).to_have_text('25',timeout=12000)
    expect(auto_page.locator('#score-1')).to_have_text('25')
    expect(auto_page.locator('#auto-score-detail')).to_contain_text('total 25–25')
    expect(auto_page.locator('#auto-status')).to_contain_text('settled')
    assert auto_page.evaluate("JSON.parse(localStorage.getItem('crokinole-ref-match-v1')).scores[0]") == 20
    auto_page.locator('#stop-source').click()
    expect(auto_page.locator('#score-0')).to_have_text('20')
    passed('auto demo scores 25–25 without persisting over the real match; disconnect restores it')
    auto_page.close()
    # Restart the demo so the centre hole is unobstructed, then exercise the real smart-calibration detector.
    page.locator('#stop-source').click()
    page.locator('#demo').click()
    page.locator('#auto-calibrate').click()
    expect(page.locator('#cal-title')).to_contain_text('Smart setup found the board')
    expect(page.locator('#cal-progress')).to_contain_text('Automatic calibration')
    expect(page.locator('#cal-apply')).to_be_enabled()
    expect(page.locator('#cal-example-label')).to_contain_text('Straightened')
    page.screenshot(path=str(OUT/'smart-calibration-preview.png'), full_page=True)
    page.locator('#cal-apply').click()
    expect(page.locator('#calibration-status')).to_contain_text('Smart fit')
    expect(page.locator('#tracking-status')).to_contain_text('save an empty board')
    passed('one-click smart calibration finds board, centre and scoring rings, then requires confirmation')
    page.locator('.manual-calibration summary').click()
    page.locator('#calibration-mode').select_option('overhead')
    page.locator('#calibrate').click()
    expect(page.locator('#cal-instruction')).to_contain_text('middle of the round opening')
    expect(page.locator('#cal-apply')).to_be_disabled()
    click_guide_points(page,[(480,360),(574,360),(665,360),(740,360),(620,290),(634,290)])
    expect(page.locator('#cal-apply')).to_be_enabled()
    expect(page.locator('#tracking-status')).to_contain_text('save an empty board')
    page.screenshot(path=str(OUT/'overhead-calibration-preview.png'), full_page=True)
    page.locator('#cal-apply').click()
    expect(page.locator('#tracking-status')).to_contain_text('save an empty board')
    previous = page.locator('#calibration-status').inner_text()
    assert 25 <= int(re.search(r'(\d+) px',previous).group(1)) <= 31
    page.locator('#calibrate').click()
    page.locator('#cal-close').click()
    expect(page.locator('#calibration-status')).to_have_text(previous)
    passed('guided overhead calibration requires confirmation and cancellation preserves prior geometry')
    page.locator('#calibration-mode').select_option('angled')
    page.locator('#calibrate').click()
    click_guide_points(page,[(480,360)])
    expect(page.locator('#cal-title')).to_contain_text('quarter mark A')
    expect(page.locator('#cal-instruction')).to_contain_text('FOUR')
    page.locator('#cal-undo').click()
    expect(page.locator('#calibration-dialog')).to_have_attribute('data-step','1')
    click_guide_points(page,[(480,360),(480,100),(740,360),(480,620),(220,360),(574,360),(665,360),(620,290),(634,290)])
    expect(page.locator('#cal-apply')).to_be_enabled()
    expect(page.locator('#cal-example-label')).to_contain_text('Straightened')
    page.screenshot(path=str(OUT/'angled-calibration-preview.png'), full_page=True)
    page.locator('#cal-apply').click()
    expect(page.locator('#calibration-status')).to_contain_text('Perspective fit')
    assert page.evaluate("JSON.parse(localStorage.getItem('crokinole-ref-match-v1')).scores[0]") == 20
    expect(page.locator('#tracking-status')).to_contain_text('save an empty board')
    # Let the new worker configuration build its warp map before proceeding.
    page.wait_for_timeout(400)
    previous=page.locator('#calibration-status').inner_text()
    page.locator('#calibrate').click()
    page.locator('#cal-retake').click()
    expect(page.locator('#calibration-dialog')).to_have_attribute('data-step','1')
    page.locator('#cal-close').click()
    expect(page.locator('#calibration-status')).to_have_text(previous)
    passed('nine-click perspective guide, undo, retake, corrected preview and manual apply')
    page.locator('#stop-source').click()
    page.locator('#connect').click()
    expect(page.locator('#source-badge')).to_contain_text('LIVE', timeout=15000)
    expect(page.locator('#observed-fps')).not_to_have_text('—', timeout=15000)
    assert page.locator('#source-video').evaluate('(v)=>v.srcObject.getAudioTracks().length') == 0
    passed('fake camera opens, reports observed callbacks and requests no audio')
    page.locator('#record').click()
    expect(page.locator('#stop-record')).to_be_visible()
    expect(page.locator('#connect')).to_be_disabled()
    expect(page.locator('#calibrate')).to_be_disabled()
    page.wait_for_timeout(1700)
    page.locator('#stop-record').click()
    expect(page.locator('#clip-count')).to_have_text('1',timeout=10000)
    page.locator('.clip').first.get_by_role('button',name='Review',exact=True).click()
    deadline = time.monotonic() + 15
    while not page.locator('#replay-video').evaluate('(v) => v.readyState >= 2'):
        assert time.monotonic() < deadline, 'Recorded clip did not become decodable'
        page.wait_for_timeout(100)
    with page.expect_download() as result:
        page.locator('#download-clip').click()
    clip_path = OUT/'recorded.webm'
    result.value.save_as(str(clip_path))
    assert clip_path.stat().st_size > 1000
    page.locator('#verdict').select_option('valid')
    page.locator('#review-note').fill('Human review only; no automatic decision.')
    page.locator('#save-verdict').click()
    expect(page.locator('.clip').first).to_contain_text('valid')
    expect(page.locator('#score-0')).to_have_text('20')
    passed('MediaRecorder clip is decodable/exportable; manual verdict does not alter scores')
    with page.expect_download() as result:
        page.locator('#export-session').click()
    log_path=OUT/'match.json';result.value.save_as(str(log_path));log=json.loads(log_path.read_text())
    assert log['automaticVerdictsEnabled'] is False
    assert log['clips'][0]['videoIncluded'] is False
    assert log['clips'][0]['decisionSource'] == 'human'
    assert log['clips'][0]['configuration']['source'] == 'camera'
    passed('match export contains manual decisions and explicitly excludes video bytes')
    page.locator('#source-video').evaluate('(v)=>window.testTrack=v.srcObject.getVideoTracks()[0]')
    page.locator('#stop-source').click()
    assert page.evaluate('window.testTrack.readyState') == 'ended'
    passed('disconnect releases the actual browser video track')
    page.locator('#import-video').set_input_files(str(clip_path))
    expect(page.locator('#source-badge')).to_contain_text('LOCAL VIDEO',timeout=15000)
    expect(page.locator('#clip-count')).to_have_text('2')
    expect(page.locator('#record')).to_be_disabled()
    page.locator('#file-play').click()
    passed('exported local recording can be reimported without a server upload')
    # End-to-end AUTOMATIC clips: no Record/Finish-clip calls in this test.
    for angled in (False, True):
        ac=browser.new_context(viewport={'width':1440,'height':1100},accept_downloads=True)
        ap=ac.new_page()
        ap.on('pageerror',lambda e:errors.append(str(e)))
        ap.on('dialog',lambda d:d.accept())
        ap.add_init_script((ROOT/'tests/synthetic_camera.js').read_text())
        ap.goto(base,wait_until='networkidle')
        ap.evaluate('(angled)=>{window.syntheticCamera.angled=angled;}',angled)
        ap.locator('#connect').click()
        expect(ap.locator('#source-badge')).to_contain_text('LIVE')
        ap.wait_for_timeout(1200)
        if ap.locator('#calibration-dialog').is_visible():ap.locator('#cal-close').click()
        ap.locator('.manual-calibration summary').click()
        ap.locator('#calibration-mode').select_option('angled' if angled else 'overhead')
        ap.locator('#calibrate').click()
        plain=[(480,360),(480,100),(740,360),(480,620),(220,360),(574,360),(665,360),(620,290),(634,290)] if angled else [(480,360),(574,360),(665,360),(740,360),(620,290),(634,290)]
        transformed=[(x+.10*y-30,.08*x+.72*y+75) if angled else (x,y) for x,y in plain]
        click_guide_points(ap,transformed)
        expect(ap.locator('#cal-apply')).to_be_enabled()
        ap.locator('#cal-apply').click()
        ap.evaluate("window.syntheticCamera.mode='empty'")
        ap.wait_for_timeout(250)
        ap.locator('#background').click()
        ap.evaluate("window.syntheticCamera.mode='pucks'")
        ap.wait_for_timeout(250)
        for team,(x,y) in [('a',(620,290)),('b',(340,410))]:
            ap.locator('#sample-'+team).click()
            if angled:x,y=x+.10*y-30,.08*x+.72*y+75
            canvas=ap.locator('#board');canvas.scroll_into_view_if_needed();box=canvas.bounding_box()
            canvas.click(position={'x':x/960*box['width'],'y':y/720*box['height']})
        expect(ap.locator('#disc-count')).to_have_text('4',timeout=15000)
        ap.wait_for_timeout(300)
        ap.evaluate('window.syntheticCamera.shoot()')
        expect(ap.locator('#clip-count')).to_have_text('1',timeout=15000)
        # Preserve the observed shot evidence even when a score is correctly held.
        ap.screenshot(path=str(OUT/('auto-camera-angled.png' if angled else 'auto-camera-overhead.png')),full_page=True)
        with ap.expect_download() as observed:ap.locator('#export-session').click()
        diagnostic_path=OUT/('auto-diagnostic-angled.json' if angled else 'auto-diagnostic-overhead.json')
        observed.value.save_as(str(diagnostic_path))
        observed_result=json.loads(diagnostic_path.read_text())['autoReferee']['lastResult']
        print('AUTO DIAGNOSTIC',angled,observed_result,flush=True)
        assert observed_result['score']['totals']==[25,25]
        assert not observed_result['hadObstruction'] and not observed_result['unexplainedLosses']
        assert not observed_result['score']['review'] and not observed_result['twentyCandidates']
        if observed_result['hadFrameGap']:
            # A real capture/analysis timing gap must HOLD, not be hidden to make a CI score pass.
            assert observed_result['scoreApplied'] is False
            expect(ap.locator('#score-0')).to_have_text('0')
            expect(ap.locator('#auto-status')).to_contain_text('held for review')
            ap.locator('#apply-reviewed-score').click()
        else:
            assert observed_result['scoreApplied'] is True
        expect(ap.locator('#score-0')).to_have_text('25')
        expect(ap.locator('#score-1')).to_have_text('25')
        expect(ap.locator('.clip').first).to_contain_text('AUTO CLIP')
        assert 'INCOMPLETE' not in ap.locator('.clip').first.inner_text()
        ap.screenshot(path=str(OUT/('auto-camera-angled.png' if angled else 'auto-camera-overhead.png')),full_page=True)
        ap.locator('.clip').first.get_by_role('button',name='Review',exact=True).click()
        deadline = time.monotonic() + 15
        while not ap.locator('#replay-video').evaluate('(v) => v.readyState >= 2'):
            assert time.monotonic() < deadline, 'Automatic clip did not become decodable'
            ap.wait_for_timeout(100)
        assert ap.locator('#replay-video').evaluate('(v)=>v.videoWidth')==960
        with ap.expect_download() as result:ap.locator('#download-clip').click()
        auto_path=OUT/('auto-angled.webm' if angled else 'auto-overhead.webm')
        result.value.save_as(str(auto_path));assert auto_path.stat().st_size>1000
        ap.locator('#close-replay').click()
        # Manual corrections / confirmed 20 bank must survive the NEXT auto shot.
        ap.get_by_role('button',name='Add 20 points to team A',exact=True).click()
        ap.get_by_role('button',name='Add 5 points to team A',exact=True).click()
        ap.wait_for_timeout(250)
        ap.evaluate('window.syntheticCamera.second()')
        expect(ap.locator('#clip-count')).to_have_text('2',timeout=15000)
        expect(ap.locator('#score-0')).to_have_text('50')
        expect(ap.locator('#score-1')).to_have_text('25')
        with ap.expect_download() as result:ap.locator('#export-session').click()
        log_path=OUT/('auto-angled.json' if angled else 'auto-overhead.json');result.value.save_as(str(log_path))
        alog=json.loads(log_path.read_text())
        assert alog['automaticVerdictsEnabled'] is False
        assert alog['clips'][0]['autoTriggered'] is True
        second_result=alog['clips'][0]['autoResult']
        assert second_result['score']['totals']==[50,25]
        assert not second_result['hadObstruction'] and not second_result['unexplainedLosses']
        assert not second_result['score']['review'] and not second_result['twentyCandidates']
        assert second_result['scoreApplied'] is (not second_result['hadFrameGap'])
        if second_result['hadFrameGap']:
            expect(ap.locator('#auto-status')).to_contain_text('held for review')
        print('AUTO APPLICATION',angled,{'first':observed_result['scoreApplied'],'second':second_result['scoreApplied']},flush=True)
        assert alog['autoReferee']['twenties']==[1,0]
        assert alog['autoReferee']['adjustments']==[5,0]
        assert alog['clips'][0]['preRollSeconds']==0
        ap.locator('#stop-source').click()
        assert ap.locator('#source-video').evaluate('(v)=>v.srcObject===null')
        ap.close();ac.close()
        passed(('angled' if angled else 'overhead')+' synthetic camera: automatic playable clips, correct score or explicit frame-gap hold; next shot preserves 20s and corrections')
    mobile=context.new_page()
    mobile.set_viewport_size({'width':390,'height':844})
    mobile.goto(base,wait_until='networkidle')
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    mobile.locator('#demo').click()
    expect(mobile.locator('#disc-count')).to_have_text('4', timeout=15000)
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    mobile.screenshot(path=str(OUT/'mobile.png'), full_page=True)
    passed('390 px mobile layout has no horizontal overflow and demo remains usable')
    mobile.locator('.manual-calibration summary').click()
    mobile.locator('#calibrate').click()
    expect(mobile.locator('#cal-instruction')).to_be_visible()
    assert mobile.locator('#calibration-dialog').evaluate('(d)=>d.scrollWidth <= d.clientWidth + 1')
    mobile.screenshot(path=str(OUT/'mobile-calibration-guide.png'), full_page=True)
    mobile.locator('#cal-close').click()
    passed('mobile calibration instructions and diagram fit without horizontal overflow')
    denied=browser.new_context()
    dp=denied.new_page()
    dp.add_init_script("navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied','NotAllowedError'); };")
    dp.goto(base,wait_until='networkidle');dp.locator('#connect').click()
    expect(dp.locator('#notice')).to_contain_text('permission was denied')
    expect(dp.locator('#record')).to_be_disabled()
    passed('mocked permission denial displays actionable error without claiming a live camera')
    dp.close();denied.close()
    assert errors == [], errors
    assert external == [], external
    passed('no observed console/page errors or external app network requests')
    report={'browser':browser.version,'checks':checks,'count':len(checks),'errors':errors,'externalRequests':external,'physicalCameraTested':False}
    (OUT/'browser-report.json').write_text(json.dumps(report,indent=2))
    browser.close()
if server:
    server.shutdown()
print(f'{len(checks)} browser checks passed. Physical board and real-camera accuracy remain untested.')
