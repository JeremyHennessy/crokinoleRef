"""Verify deterministic replay of the actual browser-produced synthetic video."""
import json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';base=OUT/'offline-proof'
files=sorted((base/'clips').glob('*.webm'))
assert len(files)==1,'Browser proof must export exactly one input for offline replay'
video=files[0];fixture=base/'fixtures'/(video.stem+'.json')
outputs=[]
for i in range(2):
    out=OUT/f'offline-replay-{i}.json'
    subprocess.run([sys.executable,str(ROOT/'tools/replay_video.py'),str(video),str(fixture),'--out',str(out)],check=True)
    outputs.append(json.loads(out.read_text()))
assert outputs[0]==outputs[1],'Same recorded frames must produce identical reports'
ends=[e for e in outputs[0]['events'] if e['type']=='shot-end'];assert ends,'No decoded shot end'
assert ends[-1]['score']['visible']==[80,80],ends[-1]
assert outputs[0]['comparison']['labelled'] is False
(OUT/'offline-proof-report.json').write_text(json.dumps({'sameVideoSameResult':True,'lastVisibleScore':[80,80],'physicalCameraTested':False,'frames':outputs[0]['frames']},indent=2))
print('PASS same browser video replays deterministically twice through ffmpeg and the actual analysis modules',flush=True)
