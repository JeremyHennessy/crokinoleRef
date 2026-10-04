/** Hold actual captured pixels across a short worker-delivery delay. Never invent
 * timestamps/intermediate frames. A full queue drops oldest waiting footage and
 * marks the next retained frame as a capture gap for the existing review gates. */
export class CapturedFrameQueue {
  constructor(send, maxPending=3) {
    if(typeof send!=='function'||!Number.isSafeInteger(maxPending)||maxPending<1||maxPending>4)throw Error('Invalid frame queue.');
    this.send=send;this.maxPending=maxPending;this.reset(0);
  }
  reset(generation) {this.generation=generation;this.active=null;this.pending=[];this.lastTime=null;this.dropped=0;}
  get busy(){return this.active!==null;}
  push(frame){
    if(frame.generation!==this.generation)return false;
    if(!Number.isFinite(frame.time)||!Number.isSafeInteger(frame.width)||!Number.isSafeInteger(frame.height)||frame.width<=0||frame.height<=0||frame.width*frame.height>2097152||!(frame.buffer instanceof ArrayBuffer)||frame.buffer.byteLength!==frame.width*frame.height*4)throw Error('Invalid captured frame.');
    if(this.lastTime!==null&&frame.time<=this.lastTime)return false;
    this.lastTime=frame.time;this.pending.push(frame);
    if(this.pending.length>this.maxPending){this.pending.shift();this.dropped++;this.pending[0].captureGap=true;}
    this.pump();return true;
  }
  acknowledge(message){
    if(!this.active||message.generation!==this.generation||message.time!==this.active.time)return false;
    this.active=null;this.pump();return true;
  }
  pump(){
    if(this.active||!this.pending.length)return;
    const frame=this.pending.shift();this.active={generation:frame.generation,time:frame.time};
    try{this.send(frame);}catch(error){this.reset(this.generation);throw error;}
  }
}
