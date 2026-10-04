/** Small dependency-free ZIP writer, STORE method: video is already compressed.
 * CRCs are streamed; each entry retains its original bytes and container header. */
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export async function crc32(blob){let crc=0xffffffff;const reader=blob.stream().getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;for(const byte of value)crc=table[(crc^byte)&255]^(crc>>>8);}}finally{reader.releaseLock();}return (crc^0xffffffff)>>>0;}
export async function createZip(entries){
 if(entries.length>65535)throw Error('Too many archive entries.');
 const locals=[],central=[];let offset=0,centralSize=0;const names=new Set();
 for(const {name,blob} of entries){
  if(typeof name!=='string'||!name||name.startsWith('/')||name.includes('..')||name.includes('\\')||names.has(name)||!(blob instanceof Blob)||blob.size>0xffffffff)throw Error('Invalid archive entry.');
  names.add(name);const utf=new TextEncoder().encode(name);if(utf.length>65535)throw Error('Archive name too long.');
  const crc=await crc32(blob),head=new Uint8Array(30),h=new DataView(head.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);
  h.setUint32(14,crc,true);h.setUint32(18,blob.size,true);h.setUint32(22,blob.size,true);h.setUint16(26,utf.length,true);
  locals.push(head,utf,blob);
  const c=new Uint8Array(46),v=new DataView(c.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,crc,true);v.setUint32(20,blob.size,true);v.setUint32(24,blob.size,true);v.setUint16(28,utf.length,true);v.setUint32(42,offset,true);
  central.push(c,utf);centralSize+=46+utf.length;offset+=30+utf.length+blob.size;
  if(offset+centralSize>0xffffffff)throw Error('Archive exceeds the supported size.');
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
 return new Blob([...locals,...central,end],{type:'application/zip'});
}
