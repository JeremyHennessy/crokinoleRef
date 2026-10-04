"""Exercise the public Pages button after deployment, not a local dev copy."""
import argparse,hashlib,json,re
from pathlib import Path
from urllib.parse import urlsplit,urljoin,parse_qs
from playwright.sync_api import sync_playwright,expect

parser=argparse.ArgumentParser()
parser.add_argument('--url',required=True)
parser.add_argument('--commit',required=True)
args=parser.parse_args()
assert re.fullmatch(r'[0-9a-f]{40}',args.commit)
base=args.url.rstrip('/')+'/'
assert urlsplit(base).scheme=='https' and urlsplit(base).hostname=='jeremyhennessy.github.io'
OUT=Path('test-results');OUT.mkdir(exist_ok=True)
errors=[];bad_responses=[];assets=[];report={'url':base,'expectedCommit':args.commit,'errors':errors,'badResponses':bad_responses}
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100})
    page.on('pageerror',lambda error:errors.append(str(error)))
    def response_seen(response):
        if response.status>=400:bad_responses.append({'url':response.url,'status':response.status})
        if urlsplit(response.url).path.endswith(('.js','.css')):assets.append(response)
    page.on('response',response_seen)
    try:
        build=page.request.get(base+'build-info.json?verify='+args.commit)
        assert build.ok and build.json()['commit']==args.commit
        page.goto(base+'?verify='+args.commit,wait_until='networkidle')
        expect(page.locator('footer')).to_contain_text(args.commit[:7])
        entry=page.locator('script[type=module]').get_attribute('src')
        digest=parse_qs(urlsplit(entry).query).get('v',[''])[0]
        assert re.fullmatch(r'[0-9a-f]{64}',digest),entry
        fetched=[r for r in assets if r.url==urljoin(base,entry)]
        assert len(fetched)==1 and hashlib.sha256(fetched[0].body()).hexdigest()==digest
        report['entry']=entry;report['entryBytesVerified']=True
        page.locator('#demo-round').click()
        panel=page.locator('#full-round-controls');expect(panel).to_be_visible()
        page.locator('#demo-speed').select_option('2')
        expect(panel).to_have_attribute('data-completed','16',timeout=65000)
        expect(panel).to_have_attribute('data-score','70,90')
        expect(panel).to_have_attribute('data-phase','complete')
        expect(panel).to_have_attribute('data-engine','swept-circle-v1')
        expect(page.locator('#demo-shot-log')).to_contain_text('Stopped outer-line disc removed before the next shot')
        report['completed']=16;report['score']=[70,90];report['settlementRulesVerified']=True
        page.screenshot(path=str(OUT/'live-full-demo-complete.png'),full_page=True)
        page.locator('#demo-exit').click();expect(page.locator('#welcome')).to_be_visible()
        report['exitVerified']=True
        assert not errors,errors
        assert not bad_responses,bad_responses
        report['passed']=True
    finally:
        (OUT/'live-demo-report.json').write_text(json.dumps(report,indent=2))
        browser.close()
print('Live full-demo button verified:',args.commit,'16 shots, 70–90, Exit works',flush=True)
