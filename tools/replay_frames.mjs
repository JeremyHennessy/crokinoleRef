import fs from 'node:fs';
import {ReplayAnalysis} from '../src/replay-analysis.js';
import {compareLabels} from '../src/diagnostics.js';
const [fixturePath,timesPath,outputPath,labelsPath]=process.argv.slice(2);
try{
 const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8')),config=fixture.configuration||fixture.activeConfiguration||fixture;
 const times=JSON.parse(fs.readFileSync(timesPath,'utf8')),engine=new ReplayAnalysis(config),size=engine.width*engine.height*4,events=[];let buffered=Buffer.alloc(0),index=0,obstructed=0;
 for await(const chunk of process.stdin){buffered=Buffer.concat([buffered,chunk]);while(buffered.length>=size){if(index>=times.length)throw Error('More video frames than timestamps.');const out=engine.update(new Uint8ClampedArray(buffered.subarray(0,size)),times[index++]);buffered=buffered.subarray(size);if(out?.visibility.viewObstructed)obstructed++;if(out?.auto.event)events.push(out.auto.event);}}
 if(buffered.length||index!==times.length)throw Error('Incomplete decoded video stream.');
 const labels=labelsPath?JSON.parse(fs.readFileSync(labelsPath,'utf8')):null;
 fs.writeFileSync(outputPath,JSON.stringify({schema:1,source:'local-decoded-video',fixtureVersion:config.version,frames:index,obstructedFrames:obstructed,events,comparison:compareLabels(events,labels),note:'Decoded video timing, not necessarily the live browser analysis schedule. A report without labels is not an accuracy test.'},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
