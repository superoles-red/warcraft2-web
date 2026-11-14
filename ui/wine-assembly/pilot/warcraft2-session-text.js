/* Warcraft II FONT12X glyphs in original pixel metrics, with alpha. */
(() => {
  'use strict';
  const sources = {"en":{"chars":" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~","widths":[5,5,5,11,7,10,10,5,5,5,9,9,4,7,4,8,11,6,9,9,10,9,9,9,9,9,4,5,6,6,6,10,15,12,11,10,11,10,9,11,12,6,10,13,11,15,14,12,12,12,13,11,12,13,15,16,12,12,11,4,8,4,9,13,5,10,9,9,9,9,9,9,9,6,6,8,4,15,10,9,10,11,9,9,8,10,12,16,10,10,8,5,3,5,9]},"ru":{"chars":" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюяЁё","widths":[5,5,5,11,7,10,10,5,5,5,9,9,4,7,4,8,11,6,9,9,10,9,9,9,9,9,4,5,6,6,6,10,15,12,11,10,11,10,9,11,12,6,10,13,11,15,14,12,12,12,13,11,12,13,15,16,12,12,11,4,8,4,9,13,5,10,9,9,9,9,9,9,9,6,6,8,4,15,10,9,10,11,9,9,8,10,12,16,10,10,8,5,3,5,9,12,11,11,11,15,10,16,9,14,14,13,15,15,12,12,12,12,10,12,12,17,12,13,12,16,16,13,16,12,9,17,13,10,9,9,9,10,9,14,9,10,10,8,11,16,11,9,10,10,9,15,10,15,11,11,11,16,17,11,12,9,9,13,10,10,10]}};
  const charWidth = 20, charHeight = 19, columns = 16;
  const atlases = new Map();
  const originalChar = {'–':'-', '—':'-', '’':"'", '«':'"', '»':'"', '…':'?', '·':'-'};

  function load(locale) {
    const id = locale === 'ru' ? 'ru' : 'en';
    if (atlases.has(id)) return atlases.get(id);
    const source = sources[id], image = new Image();
    const bitmap = new Promise((resolve, reject) => {
      image.onload = () => resolve({source, image});
      image.onerror = () => reject(new Error('Warcraft II menu font did not load'));
      image.src = './menu-art/session-font-' + id + '.png';
    }).catch(error => { atlases.delete(id); throw error; });
    atlases.set(id, bitmap);
    return bitmap;
  }

  function ink(text, {source, image}, lineWidth = Infinity, alignLeft = false) {
    const fallback = source.chars.indexOf('?');
    const glyphs = string => [...string].map(char => {
      const index = source.chars.indexOf(originalChar[char] || char);
      return index < 0 ? fallback : index;
    });
    const width = ids => ids.reduce((sum,i) => sum + source.widths[i],0);
    const limit = Math.max(1,lineWidth);
    const lines = [];
    for(const paragraph of text.split('\n')){
      let line = [];
      for(const word of paragraph.split(' ')){
        const ids = glyphs(word), candidate = line.length ? [...line,0,...ids] : ids;
        if(line.length && width(candidate)>limit){lines.push(line);line=ids;}
        else line=candidate;
      }
      lines.push(line);
    }
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden','true');
    canvas.width = Math.max(1,...lines.map(width))+2;
    canvas.height = lines.length*charHeight;
    const context = canvas.getContext('2d');
    for(let y=0;y<lines.length;y++){
      let x=alignLeft ? 1 : Math.floor((canvas.width-width(lines[y]))/2);
      for(const i of lines[y]){
        context.drawImage(image,i%columns*charWidth,Math.floor(i/columns)*charHeight,charWidth,charHeight,
          x,y*charHeight,charWidth,charHeight);
        x+=source.widths[i];
      }
    }
    return canvas;
  }

  window.WarcraftSessionText = Object.freeze({load, ink});
})();
