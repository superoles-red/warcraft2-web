/* Portable Warcraft II browser saves and project files menu. */
(function (global) {
  'use strict';

  const format = 'warcraft2-bne-web-save';
  const version = 1;
  const maxBytes = 16 * 1024;
  const source = 'https://github.com/superoles-red/warcraft2-playtest';
  const labels = {
    en: {files:'Files', download:'Export Save', upload:'Import Save', code:'Source Code',
      github:'Open GitHub', private:'The GitHub repository requires access.',
      details:'Campaign progress and saved mission. Imported missions restart.',
      confirm:'Import this save?', replace:'Campaign progress and the Continue slot on this device will be replaced.',
      progress:'Campaign progress only.', invalid:'This save file is invalid or incompatible.',
      imported:'Save imported.', storage:'The browser could not save these changes.',
      exportError:'The browser could not export the save.', unavailable:'This scenario cannot be transferred. Campaign progress is included.'},
    ru: {files:'Файлы', download:'Экспорт сохранения', upload:'Импорт сохранения', code:'Исходный код',
      github:'Открыть GitHub', private:'Для просмотра репозитория нужен доступ.',
      details:'Прогресс кампаний и выбранная миссия. Миссия начнётся заново.',
      confirm:'Импортировать сохранение?', replace:'Прогресс кампаний и слот «Продолжить» на этом устройстве будут заменены.',
      progress:'Только прогресс кампаний.', invalid:'Файл сохранения повреждён или несовместим.',
      imported:'Сохранение импортировано.', storage:'Браузер не смог записать изменения.',
      exportError:'Браузер не смог экспортировать сохранение.', unavailable:'Этот сценарий нельзя перенести. Прогресс кампаний входит в файл.'},
  };
  const encoder = new TextEncoder();
  const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value,key));

  function checkedState(value, session, portableFastSlot) {
    const {campaigns, normalizeSlot} = session;
    if (!keys(value, ['completed','slot']) || !keys(value.completed, Object.keys(campaigns))) {
      throw new Error('Invalid save state');
    }
    const completed = Object.fromEntries(Object.entries(campaigns).map(([id, limit]) => {
      const missions = value.completed[id];
      if (!Array.isArray(missions) || missions.length > limit || missions.some((mission,i) =>
        !Number.isInteger(mission) || mission < 1 || mission > limit || mission !== i + 1)) {
        throw new Error('Invalid mission progress');
      }
      return [id, missions.slice()];
    }));
    if (value.slot === null) return {completed, slot:null};
    if (!keys(value.slot, value.slot?.kind === 'campaign' ? ['kind','campaign','mission'] : ['kind','scenario','name'])) {
      throw new Error('Invalid saved mission');
    }
    const slot = normalizeSlot(value.slot);
    if (!slot || (slot.kind === 'fast' ? !portableFastSlot?.(slot) :
        slot.mission > (completed[slot.campaign].at(-1) || 0) + 1)) {
      throw new Error('Invalid saved mission');
    }
    return {completed, slot};
  }

  async function digest(value) {
    const bytes = await global.crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value)));
    return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
  }

  async function makeFile({completed, slot}, session, portableFastSlot) {
    const limited = slot?.kind === 'fast' && !portableFastSlot?.(slot);
    const payload = checkedState({completed, slot:limited ? null : slot}, session, portableFastSlot);
    const body = {format, version, payload};
    const text = JSON.stringify({...body, checksum:await digest(body)}, null, 2) + '\n';
    if (encoder.encode(text).length > maxBytes) throw new Error('Save file is too large');
    const date = new Date().toISOString().replace(/[:.]/g,'-');
    return {text, filename:`warcraft2-${date}.wc2-save.json`, limited};
  }

  async function readFile(text, session, portableFastSlot) {
    if (typeof text !== 'string' || text.length > maxBytes || encoder.encode(text).length > maxBytes) {
      throw new Error('Save file is too large');
    }
    const file = JSON.parse(text);
    if (!keys(file, ['format','version','payload','checksum']) || file.format !== format || file.version !== version ||
        typeof file.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(file.checksum)) throw new Error('Invalid save file');
    const payload = checkedState(file.payload, session, portableFastSlot);
    if (file.checksum !== await digest({format, version, payload})) throw new Error('Invalid save checksum');
    return payload;
  }

  function chooseFile(onFile) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) onFile(file);
    }, {once:true});
    input.addEventListener('cancel', () => input.remove(), {once:true});
    document.body.append(input);
    input.click();
    return input;
  }

  async function saveFile({text,filename}, title) {
    const blob = new Blob([text], {type:'application/json'});
    if (typeof File === 'function' && navigator.canShare && navigator.share) {
      const file = new File([blob], filename, {type:blob.type});
      if (navigator.canShare({files:[file]})) {
        try { await navigator.share({title, files:[file]}); return; }
        catch (error) { if (error.name === 'AbortError') return; }
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function open({session, showSession, back}) {
    const art = global.WarcraftSessionPanel;
    const label = labels[art.locale()];
    const stateAPI = global.WarcraftSession;
    const portableFastSlot = global.WarcraftSessionNative?.portableFastSlot;
    let current = true;
    let picker;
    let prepared;
    let subpage = 'files';

    function close() {
      current = false;
      picker?.remove();
      back();
    }
    function sourcePanel() {
      subpage = 'source';
      showSession({heading:label.code, lines:[label.private], back:() => {
        subpage = 'files';
        showFiles();
      }, rows:[{
        title:label.github,
        action:() => {
          global.open(source,'_blank','noopener,noreferrer');
          sourcePanel();
        },
      }]});
    }
    function showFiles(message) {
      if (!current || subpage !== 'files') return;
      showSession({heading:label.files, lines:[label.details, prepared?.limited && label.unavailable, message].filter(Boolean), back:close,
        rows:[{title:label.download, locked:!prepared, action:() => {
          const contents = prepared;
          saveFile(contents, label.download).then(() => showFiles(), () => showFiles(label.exportError));
        }}, {title:label.upload, action:() => {
          picker?.remove();
          picker = chooseFile(importFile);
          showFiles();
        }}, {title:label.code, action:sourcePanel}]});
    }
    function refresh(message) {
      prepared = null;
      showFiles(message);
      makeFile(session.store.read(), stateAPI, portableFastSlot).then(value => {
        prepared = value;
        if (subpage === 'files') showFiles(message);
      }, () => { if (subpage === 'files') showFiles(label.exportError); });
    }
    async function importFile(file) {
      try {
        if (file.size > maxBytes) throw new Error('Save file is too large');
        const payload = await readFile(await file.text(), stateAPI, portableFastSlot);
        if (!current || subpage !== 'files') return;
        const contents = payload.slot ? art.slotLines(payload.slot) : [label.progress];
        subpage = 'confirm';
        showSession({heading:label.confirm, lines:[...contents,label.replace], back:() => {
          subpage = 'files';
          showFiles();
        }, accept:{title:label.upload, action:() => {
          subpage = 'files';
          if (session.store.importProgress(payload)) {
            session.native.clearCheckpoint();
            refresh(label.imported);
          } else showFiles(label.storage);
        }}});
      } catch (_) { if (subpage === 'files') showFiles(label.invalid); }
    }
    refresh();
  }

  const api = Object.freeze({open, makeFile, readFile});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.WarcraftFiles = api;
})(globalThis);
