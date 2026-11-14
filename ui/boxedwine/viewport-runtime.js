/* Native viewport observation. Dimensions come from the original UI thread. */
(function (global) {
  'use strict';
  const MAGIC = 0x31505657; // WVP1
  function parseViewportPacket(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 40) return null;
    const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if (view.getUint32(0,true) !== MAGIC || view.getUint16(4,true) !== 40) return null;
    const flags = view.getUint16(6,true);
    if (!(flags & 1)) return null;
    const width = view.getUint16(8,true), height = view.getUint16(10,true);
    const left = view.getInt16(12,true), top = view.getInt16(14,true);
    const worldWidth = view.getUint16(16,true), worldHeight = view.getUint16(18,true);
    const columns = view.getUint16(20,true), rows = view.getUint16(22,true);
    if (width < 32 || width > 8192 || height < 32 || height > 8192 ||
        left < 0 || top < 0 || !worldWidth || !worldHeight ||
        left + worldWidth > width || top + worldHeight > height ||
        !columns || !rows || columns * 32 !== worldWidth || rows * 32 !== worldHeight) return null;
    return {
      source:'native-WVP1', flags, active:!!(flags & 2),
      width,height,world:{left,top,right:left+worldWidth,bottom:top+worldHeight},
      columns,rows,cameraX:view.getInt16(24,true),cameraY:view.getInt16(26,true),
      maxX:view.getInt16(28,true),maxY:view.getInt16(30,true),
      mapWidth:view.getUint16(32,true),mapHeight:view.getUint16(34,true),
      revision:view.getUint32(36,true),
    };
  }
  function createViewportReader(readBytes) {
    if (typeof readBytes !== 'function') throw new TypeError('Native viewport reader is required');
    return {
      snapshot() {
        try { return parseViewportPacket(readBytes()); } catch (_) { return null; }
      },
      getNativeGeometry() {
        const value = this.snapshot();
        return value && {width:value.width,height:value.height,world:value.world};
      },
    };
  }
  function viewportRequest(width,height) {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<640||width>1920||height<480||height>1536||width%32||height%32)
      throw new RangeError('Native viewport request must use supported 32-pixel dimensions');
    return {width,height};
  }
  function encodeViewportRequest(width,height) {
    viewportRequest(width,height);
    const bytes=new Uint8Array(16),v=new DataView(bytes.buffer);
    v.setUint32(0,0x31525657,true);v.setUint16(4,16,true);v.setUint16(6,1,true);
    v.setUint16(8,width,true);v.setUint16(10,height,true);return bytes;
  }
  function chooseViewportRequest(width,height) {
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Visible browser area required');
    const aspect=width/height;
    const columns=aspect>=1?Math.min(54,Math.max(28,Math.ceil(14*aspect))):Math.max(14,Math.ceil(28*aspect));
    const rows=aspect>=1?Math.max(14,Math.ceil(columns/aspect)):28;
    return viewportRequest((columns+6)*32,(rows+1)*32);
  }
  function mergeFixedScreenRegistry(text) {
    if(typeof text!=='string'||!text.startsWith('WINE REGISTRY Version 2'))throw new TypeError('Existing Wine registry required');
    const target='[Software\\\\Wine\\\\X11 Driver]',result=[];
    let selected=false,inserted=false;
    for(const line of text.split('\n')) {
      if(line.startsWith('[')) {
        selected=line.toLowerCase().startsWith(target.toLowerCase());
        result.push(line);
        if(selected&&!inserted){result.push('"UseXRandR"="N"','"UseXVidMode"="N"');inserted=true;}
      } else if(!selected||!/^"(?:UseXRandR|UseXVidMode)"\s*=/i.test(line))result.push(line);
    }
    if(!inserted)result.push('',target,'"UseXRandR"="N"','"UseXVidMode"="N"','');
    return result.join('\n');
  }
  const exports = {parseViewportPacket,createViewportReader,viewportRequest,encodeViewportRequest,chooseViewportRequest,mergeFixedScreenRegistry};
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  else global.WarcraftViewportProtocol = exports;
})(typeof window !== 'undefined' ? window : globalThis);
