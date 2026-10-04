"""Reproduce a returning browser loading new HTML with cached old JavaScript.
Uses exact pre-demo release bytes and the candidate, real browser HTTP caching,
no request routing, injected handlers or cleared site data. Synthetic UI only.
"""
import argparse, functools, http.server, io, json, os, subprocess, tarfile, tempfile, threading
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
PREVIOUS='616f9cf03caf17e0815925275d9fc04a71187526'
parser=argparse.ArgumentParser()
parser.add_argument('--diagnose-only',action='store_true',help='Expect the currently deployed cache regression; never a release gate.')
parser.add_argument('--engines',default='chromium')
args=parser.parse_args()
archive=subprocess.check_output(['git','archive','--format=tar',PREVIOUS],cwd=ROOT)
checks=[]; records=[]
with tempfile.TemporaryDirectory() as tmp:
    previous=Path(tmp)/'previous';previous.mkdir()
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:tar.extractall(previous,filter='data')
    release={'root':previous}; requests=[]
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self,*a,**kw):super().__init__(*a,directory=str(release['root']),**kw)
        def log_message(self,*a):pass
        def end_headers(self):
            asset=urlsplit(self.path).path.endswith(('.js','.css'))
            self.send_header('Cache-Control','public, max-age=3600' if asset else 'no-store')
            super().end_headers()
        def do_GET(self):
            requests.append({'release':'previous' if release['root']==previous else 'candidate','path':self.path})
            super().do_GET()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}/'
    with sync_playwright() as pw:
        for engine in args.engines.split(','):
            opts={'headless':True}
            if engine=='chromium':
                opts['args']=['--no-sandbox']
                if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
            browser=getattr(pw,engine).launch(**opts)
            try:
                for width in [1440,390]:
                    release['root']=previous
                    context=browser.new_context(viewport={'width':width,'height':1100 if width==1440 else 844})
                    page=context.new_page(); errors=[]
                    page.on('pageerror',lambda e:errors.append(str(e)))
                    page.goto(base+f'?previous={engine}-{width}',wait_until='networkidle')
                    expect(page.locator('#local-storage-status')).to_have_attribute('data-ready','true')
                    page.get_by_role('button',name='Add 20 points to team A',exact=True).click()
                    page.get_by_role('button',name='Add 10 points to team B',exact=True).click()
                    expect(page.locator('#local-storage-status')).to_have_attribute('data-pending','0')
                    before=page.evaluate("localStorage.getItem('crokinole-ref-match-v1')")
                    old_entry=page.locator('script[type=module]').get_attribute('src')
                    request_start=len(requests)
                    release['root']=ROOT
                    page.goto(base+f'?candidate={engine}-{width}',wait_until='networkidle')
                    button=page.locator('#demo-round')
                    expect(button).to_be_visible()
                    record={'engine':engine,'width':width,'previousEntry':old_entry,
                            'candidateEntry':page.locator('script[type=module]').get_attribute('src'),
                            'handler':button.evaluate('(b)=>typeof b.onclick'),
                            'fetchedAssets':[r['path'] for r in requests[request_start:] if urlsplit(r['path']).path.endswith(('.js','.css'))]}
                    button.click();page.wait_for_timeout(500)
                    record['controlsVisible']=page.locator('#full-round-controls').is_visible()
                    record['errors']=errors.copy()
                    if args.diagnose_only:
                        assert record['candidateEntry']==old_entry
                        assert record['handler']=='object' and not record['controlsVisible'],record
                        assert not any(urlsplit(r).path=='/src/app.js' for r in record['fetchedAssets']),record
                        assert not errors,errors
                        assert page.evaluate("localStorage.getItem('crokinole-ref-match-v1')")==before
                        checks.append(f'{engine} {width}px: exact cached old entry leaves new full-round button inert without a JavaScript error')
                    else:
                        assert record['candidateEntry']!=old_entry, 'Deployment must not reuse the previous bootstrap URL'
                        assert record['handler']=='function' and record['controlsVisible'],record
                        assert any(urlsplit(r).path=='/src/app.js' for r in record['fetchedAssets']),record
                        page.locator('#demo-speed').select_option('2')
                        expect(page.locator('#full-round-controls')).to_have_attribute('data-completed','2',timeout=15000)
                        page.locator('#demo-pause').click()
                        expect(page.locator('#full-round-controls')).to_have_attribute('data-paused','true')
                        page.screenshot(path=str(OUT/f'cache-upgrade-{engine}-{width}.png'),full_page=True)
                        page.locator('#demo-exit').click()
                        expect(page.locator('#score-0')).to_have_text('20')
                        expect(page.locator('#score-1')).to_have_text('10')
                        assert page.evaluate("localStorage.getItem('crokinole-ref-match-v1')")==before
                        assert not errors,errors
                        checks.append(f'{engine} {width}px: returning cached browser starts full demo, advances two shots and preserves live scores')
                    records.append(record)
                    if args.diagnose_only:page.screenshot(path=str(OUT/f'cache-broken-{engine}-{width}.png'),full_page=True)
                    context.close()
                # Fresh-profile control distinguishes a cache regression from a universally broken button.
                release['root']=ROOT
                context=browser.new_context(viewport={'width':1440,'height':1100})
                page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(base+f'?fresh={engine}',wait_until='networkidle')
                page.locator('#demo-round').click()
                expect(page.locator('#full-round-controls')).to_be_visible()
                page.locator('#demo-speed').select_option('2')
                expect(page.locator('#full-round-controls')).to_have_attribute('data-completed','2',timeout=15000)
                assert not errors,errors
                checks.append(f'{engine}: fresh-profile control starts and advances normally')
                context.close()
            finally:browser.close()
        server.shutdown()
report={'diagnoseOnly':args.diagnose_only,'previousRelease':PREVIOUS,'checks':checks,'records':records,'physicalCameraTested':False}
(OUT/'cache-upgrade-report.json').write_text(json.dumps(report,indent=2))
for check in checks:print('PASS',check,flush=True)
print(json.dumps(report,indent=2),flush=True)
