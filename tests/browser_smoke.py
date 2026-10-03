"""Real Chromium smoke tests; fake camera, not validation of physical crokinole footage.
Run: python -m pip install playwright==1.57.0 && playwright install chromium
     python tests/browser_smoke.py [http://127.0.0.1:8080]
"""
import functools
import http.server
import json
import os
from pathlib import Path
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
    page.locator('#calibrate').click()
    canvas = page.locator('#board')
    for index, (x,y) in enumerate([(480,360),(574,360),(665,360),(760,360),(620,290),(634,290)]):
        # The setup button can scroll the board above the viewport. Never use
        # stale absolute mouse coordinates: click relative to the visible canvas.
        canvas.scroll_into_view_if_needed()
        box = canvas.bounding_box()
        canvas.click(position={'x': x/960*box['width'], 'y': y/720*box['height']})
        if index < 5:
            expect(page.locator('#stage-hint')).to_contain_text(f'{index+2} / 6')
    expect(page.locator('#stage-hint')).to_contain_text('Geometry set.')
    page.screenshot(path=str(OUT/'calibration.png'), full_page=True)
    expect(page.locator('#calibration-status')).to_contain_text('28 px')
    expect(page.locator('#tracking-status')).to_contain_text('save an empty board')
    page.locator('#calibrate').click()
    page.locator('#cancel-calibrate').click()
    expect(page.locator('#calibration-status')).to_contain_text('28 px')
    passed('six-click calibration and cancellation preserve prior valid geometry')
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
    mobile=context.new_page()
    mobile.set_viewport_size({'width':390,'height':844})
    mobile.goto(base,wait_until='networkidle')
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    mobile.locator('#demo').click()
    expect(mobile.locator('#disc-count')).to_have_text('4', timeout=15000)
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    mobile.screenshot(path=str(OUT/'mobile.png'), full_page=True)
    passed('390 px mobile layout has no horizontal overflow and demo remains usable')
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
