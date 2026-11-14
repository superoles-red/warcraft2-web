/* Original completed raster + rendered world camera, committed as one packet.
 * Two volatile slots and a repeated commit reject partial cross-thread reads. */
(function(global){
  'use strict';
  const FRAME=0x31524657,COMMIT=0x31434657;
  const view=bytes=>{
    if(!ArrayBuffer.isView(bytes))throw new TypeError('Byte view required');
    return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  };
  function parseCommit(bytes){
    const d=view(bytes);if(d.byteLength!==64)throw new RangeError('WFC1 length');
    const u=n=>d.getUint32(n,true),seq=u(16);
    if(u(0)!==COMMIT||u(4)!==64||u(8)!==16||u(12)!==15||!seq||u(20)>1||!u(28)||
      u(48)!==FRAME||u(52)!==0||u(56)!==seq||u(60)!==((~seq)>>>0))throw new RangeError('WFC1 commit');
    return {sequence:seq,slot:u(20),bytes:u(24),sceneEpoch:u(28),width:u(32),height:u(36),
      cameraX:d.getInt32(40,true),cameraY:d.getInt32(44,true)};
  }
  function parse(bytes){
    const d=view(bytes);if(d.byteLength<1120)throw new RangeError('WFR1 truncated');
    const u=n=>d.getUint32(n,true),h=n=>d.getUint16(n,true),s=n=>d.getInt16(n,true);
    const width=h(24),height=h(26),left=s(28),top=s(30),w=h(32),hh=h(34),n=width*height;
    if(u(0)!==FRAME||u(4)!==d.byteLength||u(8)!==16||u(12)!==15||!u(16)||!u(20)||
      width<640||width>1920||height<480||height>1536||width%32||height%32||
      left<0||top<0||!w||!hh||w%32||hh%32||left+w>width||top+hh>height||
      s(36)<0||s(38)<0||s(40)<s(36)||s(42)<s(38)||!h(44)||!h(46)||
      u(48)!==96||u(52)!==1120||u(56)!==n||u(60)||!u(64)||!u(68)||u(72)!==6||
      (u(76)!==0&&u(76)<65536)||[80,84,88,92].some(i=>u(i))||d.byteLength!==1120+n)throw new RangeError('WFR1 complete frame');
    const data=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    return {format:'WFR1',usable:true,revision:u(16),sequence:u(16),sceneEpoch:u(20),screen:{width,height},
      cameraX:s(36),cameraY:s(38),maxX:s(40),maxY:s(42),mapWidth:h(44),mapHeight:h(46),
      world:{left,top,right:left+w,bottom:top+hh},worldPaintSequence:u(64),frameCompleteSequence:u(68),dialogRoot:u(76),
      palette:data.subarray(96,1120),indices:data.subarray(1120)};
  }
  function equal(a,b){return a.byteLength===b.byteLength&&a.every((value,i)=>value===b[i]);}
  function createReader(readFile){
    if(typeof readFile!=='function')throw new TypeError('Native frame file reader required');
    let previous=null,cached=null;const counters={accepted:0,rejected:0,cacheHits:0};
    return {read(){
      try{
        const a=readFile('commit'),commit=parseCommit(a);
        if(previous&&equal(a,previous)){counters.cacheHits++;return cached;}
        const bytes=readFile(commit.slot),b=readFile('commit');
        if(!equal(a,b))throw new RangeError('WFR1 changed during read');
        const frame=parse(bytes);
        if(frame.sequence!==commit.sequence||frame.sceneEpoch!==commit.sceneEpoch||bytes.byteLength!==commit.bytes||
          frame.screen.width!==commit.width||frame.screen.height!==commit.height||
          frame.cameraX!==commit.cameraX||frame.cameraY!==commit.cameraY)throw new RangeError('WFR1 commit mismatch');
        cached=frame;previous=new Uint8Array(a);counters.accepted++;return cached;
      }catch(_){counters.rejected++;return cached;}
    },reset(){previous=cached=null;},debug:()=>({...counters,sequence:cached?.sequence||0})};
  }
  const api={parse,parseCommit,createReader};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.WarcraftNativeFrameV16=api;
})(typeof window!=='undefined'?window:globalThis);
