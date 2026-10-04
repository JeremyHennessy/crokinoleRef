"""Real browser worker, synthetic camera, no colour clicks or Finish-round action."""
import functools, http.server, json, os, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/'
checks=[];errors=[]
def passed(s):checks.append(s);print('PASS',s,flush=True)
def click_points(page,points):
    el=page.locator('#cal-image');sz=el.evaluate('(c)=>({w:c.width,h:c.height})')
    for x,y in points:
        el.scroll_into_view_if_needed();b=el.bounding_box()
        el.click(position={'x':x/sz['w']*b['width'],'y':y/sz['h']*b['height']})
with sync_playwright() as pw:
    exe=os.environ.get('CHROMIUM_PATH')
    browser=pw.chromium.launch(headless=True,**({'executable_path':exe} if exe else {}),args=['--no-sandbox'])
    for angled in [False,True]:
        context=browser.new_context(viewport={'width':1440,'height':1100},accept_downloads=True)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
        page.add_init_script((ROOT/'tests/capture_timing_probe.js').read_text())
        page.add_init_script('''(()=>{
          const NativeWorker=window.Worker;window.roundTiming=[];
          window.Worker=class extends NativeWorker {
            constructor(...args){super(...args);let last=null,generation=null;
              this.addEventListener('message',({data:m})=>{
                if(m.type!=='result')return;
                const dt=generation===m.generation&&last!==null?m.time-last:null;
                if(dt===null||dt<=0||dt>.15||m.frameGap||m.auto?.event){
                  window.roundTiming.push({time:m.time,previous:last,dt,generation:m.generation,gap:m.frameGap,event:m.auto?.event?.type,ids:m.discs.map(d=>d.id)});
                  if(window.roundTiming.length>100)window.roundTiming.shift();
                }
                last=m.time;generation=m.generation;
              });
            }
          };
        })();''')
        page.add_init_script((ROOT/'tests/synthetic_camera.js').read_text());page.goto(base,wait_until='networkidle')
        page.evaluate('(a)=>{syntheticCamera.angled=a}',angled)
        page.locator('#round-allocation').fill('2');page.locator('#round-allocation').press('Tab')
        expect(page.locator('#pre-roll')).to_be_checked() # Exercise the normal buffered-camera path.
        page.locator('#connect').click();expect(page.locator('#source-badge')).to_contain_text('LIVE')
        page.wait_for_timeout(1200)
        if page.locator('#calibration-dialog').is_visible():page.locator('#cal-close').click()
        page.locator('.manual-calibration summary').first.click()
        page.locator('#calibration-mode').select_option('angled' if angled else 'overhead')
        page.locator('#calibrate').click()
        points=[(480,360),(480,100),(740,360),(480,620),(220,360),(574,360),(665,360),(620,290),(634,290)] if angled else [(480,360),(574,360),(665,360),(740,360),(620,290),(634,290)]
        click_points(page,[(x+.10*y-30,.08*x+.72*y+75) if angled else (x,y) for x,y in points]);page.locator('#cal-apply').click()
        page.evaluate("syntheticCamera.mode='empty'");page.wait_for_timeout(250);page.locator('#background').click()
        page.evaluate("syntheticCamera.mode='team-teach'")
        expect(page.locator('#team-colour-status')).to_contain_text('locked',timeout=15000)
        expect(page.locator('#team-colour-0')).to_have_attribute('data-rgb','25,25,25')
        expect(page.locator('#team-colour-1')).to_have_attribute('data-rgb','240,240,240')
        expect(page.locator('#disc-count')).to_have_text('2')
        expect(page.locator('#auto-round-status')).to_have_attribute('data-used','0,0')
        page.screenshot(path=str(OUT/f'auto-colours-{angled}.png'),full_page=True)
        passed(f'{angled=}: team colours learned without either sample button')
        page.evaluate("syntheticCamera.mode='round-play'");page.wait_for_timeout(900)
        expect(page.locator('#auto-round-status')).to_contain_text('Shots remaining')
        for i in range(4):
            expect(page.locator('#buffer-status')).to_have_attribute('data-ready','true',timeout=10000)
            team=i%2
            page.evaluate('(t)=>syntheticCamera.placeRoundPuck(t)',team);page.wait_for_timeout(450)
            page.evaluate('syntheticCamera.flickRoundPuck()')
            expect(page.locator('#clip-count')).to_have_text(str(i+1),timeout=20000)
            with page.expect_download() as download:page.locator('#export-session').click()
            target=OUT/f'round-{angled}-{i}.json';download.value.save_as(str(target));payload=json.loads(target.read_text())
            timing=page.evaluate('roundTiming');(OUT/f'round-timing-{angled}-{i}.json').write_text(json.dumps(timing,indent=2));print('ROUND TIMING',timing,flush=True)
            event=payload['clips'][0]['autoResult'];print('ROUND EVENT',angled,i,event,'COUNTER',payload['roundTracking'],flush=True)
            assert payload['clips'][0]['preRollSeconds'] >= 1.5
            assert event and not event['hadObstruction'] and not event['twentyCandidates']
            if i<3:
                expect(page.locator('#round-status')).to_contain_text('Round 1')
                expected=[(i+2)//2,(i+1)//2]
                expect(page.locator('#auto-round-status')).to_have_attribute('data-used',','.join(map(str,expected)))
            # This positive proof requires clean automatic scoring, not manual confirmation.
            (OUT/f'capture-short-{angled}-{i}.json').write_text(json.dumps(page.evaluate('captureProbe.checkpoint()'),indent=2))
            assert not event['hadFrameGap'],'Camera timing gap: positive automatic-round proof not established'
        expect(page.locator('#round-status')).to_contain_text('Round 2',timeout=5000)
        expect(page.locator('.round-entry').first).to_contain_text('20 – 20')
        saved=page.evaluate("JSON.parse(localStorage.getItem('crokinole-ref-match-v1'))")
        assert saved['round']==2 and len(saved['rounds'])==1
        assert saved['rounds'][0]['source']=='automatic'
        assert saved['rounds'][0]['shotCountEvidence']['used']==[2,2]
        expect(page.locator('#auto-round-status')).to_have_attribute('data-used','0,0')
        page.wait_for_timeout(1200);assert page.locator('.round-entry').count()==1
        page.screenshot(path=str(OUT/f'auto-round-complete-{angled}.png'),full_page=True)
        passed(f'{angled=}: four actual camera shots finish exactly one round automatically; old board cannot rescore')
        page.locator('#stop-source').click();context.close()
    assert not errors,errors
    browser.close();server.shutdown()
(OUT/'teams-rounds-report.json').write_text(json.dumps({'checks':checks,'errors':errors,'physicalCameraTested':False},indent=2))
print(len(checks),'team/round browser checks passed',flush=True)
