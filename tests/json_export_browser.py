"""Real export-worker proof: unchanged bytes and responsive main event loop.
The blocking reference is measured only in an isolated benchmark, never capture.
"""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
report={'physicalCameraTested':False,'checks':[],'errors':[]}
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}),args=['--no-sandbox'])
    ctx=browser.new_context(accept_downloads=True);page=ctx.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
    try:
        page.goto(base,wait_until='networkidle')
        report['largeExport']=page.evaluate('''async()=>{
          const {JSONExporter}=await import('./src/json-export.js?export=1');
          const {diagnosticJSON}=await import('./src/diagnostics.js');
          const background=new Uint8ClampedArray(640*480*4);background.fill(83);
          const data={configuration:{background,deviceId:'redact'},clips:Array.from({length:12},(_,id)=>({id,configuration:{background}}))};
          let ticks=0,last=performance.now(),maxInterval=0;
          const timer=setInterval(()=>{const now=performance.now();maxInterval=Math.max(maxInterval,now-last);last=now;ticks++;},10);
          const start=performance.now(),x=new JSONExporter(),blob=await x.export(data),workerWallMs=performance.now()-start;
          clearInterval(timer);
          const text=await blob.text(),referenceStart=performance.now(),expected=diagnosticJSON(data),referenceBlockMs=performance.now()-referenceStart;
          return {identical:text===expected,bytes:blob.size,ticks,workerWallMs,maxInterval,referenceBlockMs,bufferLength:background.byteLength,pending:x.pending,deviceIdRemoved:!text.includes('redact')};
        }''')
        result=report['largeExport']
        assert result['identical'] and result['bytes']>15000000
        assert result['ticks']>=3,'Main-thread timer must run while the real worker is serializing'
        assert result['bufferLength']==640*480*4 and not result['pending'] and result['deviceIdRemoved']
        report['checks'].append('Large repeated pixel payload serializes in a real worker with main-loop progress and unchanged bytes; live buffer intact')
        with page.expect_download() as dl:page.locator('#export-diagnostics').click()
        path=OUT/'json-export-ui-proof.json';dl.value.save_as(str(path));payload=json.loads(path.read_text())
        assert payload['schema']==1 and payload['footageUploaded'] is False and payload['containsEmptyBoardImage'] is True
        expect(page.locator('#export-diagnostics')).to_be_enabled()
        report['checks'].append('Actual diagnostics button downloads the existing schema and reenables after asynchronous completion')
        ctx.close()
        ctx=browser.new_context();page=ctx.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.add_init_script('''const W=window.Worker;window.Worker=class extends W{constructor(url,...args){if(String(url).includes('json-export-worker'))throw Error('Test worker denied');super(url,...args);}};''')
        page.goto(base,wait_until='networkidle')
        page.get_by_role('button',name='Add 20 points to team A',exact=True).click()
        page.locator('#export-session').click();expect(page.locator('#notice')).to_contain_text('Export failed: Test worker denied')
        expect(page.locator('#score-0')).to_have_text('20');expect(page.locator('#export-session')).to_be_enabled();expect(page.locator('#export-diagnostics')).to_be_enabled()
        report['checks'].append('Denied export worker produces a visible error without corrupting the match or blocking the UI')
        assert not report['errors'],report['errors']
    finally:
        (OUT/'json-export-report.json').write_text(json.dumps(report,indent=2));ctx.close();browser.close();server.shutdown()
print(json.dumps(report),flush=True)
print('3 JSON export checks passed',flush=True)
