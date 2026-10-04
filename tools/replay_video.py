"""Local-only replay: Python 3, Node 22, ffmpeg and ffprobe on PATH.
No footage is uploaded. Never place private camera files in the public repo.
"""
import argparse, json, subprocess, tempfile, pathlib, shutil, sys
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('video',type=pathlib.Path);p.add_argument('fixture',type=pathlib.Path)
p.add_argument('--labels',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,default=pathlib.Path('replay-report.json'))
a=p.parse_args()
try:
    for exe in ('ffmpeg','ffprobe','node'):
        if not shutil.which(exe): raise ValueError(f'{exe} must be installed and on PATH')
    if not a.video.is_file() or not a.fixture.is_file(): raise ValueError('Video and fixture must be existing local files')
    data=json.loads(a.fixture.read_text());config=data.get('configuration',data.get('activeConfiguration',data));f=config['analysisFixture'];w,h=f['width'],f['height']
    if not isinstance(w,int) or not isinstance(h,int) or not (1<=w<=4096 and 1<=h<=4096):raise ValueError('Invalid fixture frame dimensions')
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(a.video.resolve())]))
    times=[float(x['best_effort_timestamp_time']) for x in probe['frames']]
    if not times:raise ValueError('No timestamped video frames found')
    # Encoded clip timestamps are intentionally used for labels. Do not claim
    # wall-clock or sensor synchronization from browser recorder timestamps.
    with tempfile.TemporaryDirectory() as tmp:
        timefile=pathlib.Path(tmp)/'times.json';timefile.write_text(json.dumps(times))
        decoder=subprocess.Popen(['ffmpeg','-v','error','-i',str(a.video.resolve()),'-an','-sn','-vf',f'scale={w}:{h}','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','pipe:1'],stdout=subprocess.PIPE)
        args=['node',str(pathlib.Path(__file__).with_name('replay_frames.mjs')),str(a.fixture.resolve()),str(timefile),str(a.out.resolve())]
        if a.labels:args.append(str(a.labels.resolve()))
        try:
            result=subprocess.run(args,stdin=decoder.stdout,check=False);decoder.stdout.close()
            if result.returncode: decoder.terminate()
            code=decoder.wait(timeout=15)
            if result.returncode or code:raise ValueError('Replay failed; output is not a verified result')
        finally:
            if decoder.poll() is None:decoder.kill();decoder.wait()
    print(f'Replay report: {a.out}')
except (ValueError,KeyError,OSError,subprocess.SubprocessError) as e:
    print(f'Error: {e}',file=sys.stderr);sys.exit(1)
