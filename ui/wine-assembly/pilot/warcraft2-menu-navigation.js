/* Web menu arrangement. The original game still handles its native actions. */
(() => {
  'use strict';

  const artPath = './menu-art/';
  const art = {x: 0, y: 0, w: 640, h: 480};
  const nativeButton = (y, label) => ({label, source: {x: 208, y, w: 224, h: 28}});
  const submenu = (label, page = label.toLowerCase()) => ({label, page, glyph: page});
  const title = [{...nativeButton(240, 'Single Player Game'), action: 'single'}, submenu('Options')];
  const single = [nativeButton(240, 'New Campaign'),
    {...nativeButton(312, 'Fast Scenario'), glyph: 'fast-scenario'}, nativeButton(276, 'Load Game')];
  const optionPages = {
    options: [submenu('Story'), {label:'Sound', glyph:'sound', soundOptions:true}, submenu('Language')],
    story: [nativeButton(312, 'Replay Introduction'), nativeButton(348, 'Show Credits'),
      {label: 'Replay Demo', glyph: 'replay-demo', demo: true}],
  };
  const parentPage = {options: 'title', story: 'options', language: 'options',
    'language-pack': 'language', 'language-download': 'language', 'language-delete': 'language-pack'};
  const localizedGlyphs = new Set(['options', 'fast-scenario', 'replay-demo', 'story', 'sound', 'language']);
  const packGlyphs = ['download', 'delete', 'cancel', 'use', 'download-language', 'delete-language'];
  for (const name of packGlyphs) localizedGlyphs.add(name);
  const language = () => window.WarcraftLanguage;
  const languages = () => [
    {label: 'English', glyph: 'english', language: 'en'},
    {label: language()?.hasAudio?.('ru') ? 'Русский' : 'Русский (текст)',
      glyph: language()?.hasAudio?.('ru') ? 'russian' : 'russian-text', language: 'ru'},
  ];

  // One continuous section of the original dialog stone. No tile seams.
  function paintTexture(context, image, width, height) {
    if (!image?.naturalWidth || !image.naturalHeight || width <= 0 || height <= 0) return false;
    const w = image.naturalWidth, h = image.naturalHeight;
    const scale = Math.max(width / w, height / h);
    const sw = width / scale, sh = height / scale;
    context.save();
    context.imageSmoothingEnabled = true;
    context.drawImage(image, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, width, height);
    context.restore();
    return true;
  }

  const pictures = new WeakMap();
  function softenedArtwork(original) {
    const previous = pictures.get(original);
    if (previous) return previous;
    const picture = document.createElement('canvas');
    picture.width = art.w;
    picture.height = art.h;
    const context = picture.getContext('2d');
    context.drawImage(original, 0, 0);
    context.globalCompositeOperation = 'destination-in';
    for (const axis of ['x', 'y']) {
      const length = axis === 'x' ? art.w : art.h;
      const fade = context.createLinearGradient(0, 0, axis === 'x' ? length : 0, axis === 'y' ? length : 0);
      for (const [position, opacity] of [[0, 0], [10 / length, 1], [1 - 10 / length, 1], [1, 0]]) {
        fade.addColorStop(position, `rgba(0,0,0,${opacity})`);
      }
      context.fillStyle = fade;
      context.fillRect(0, 0, art.w, art.h);
    }
    pictures.set(original, picture);
    return picture;
  }

  function backBox(width, height) {
    const size = Math.min(80, width * .23, height * .25);
    const inset = Math.min(12, size / 6);
    return {x: width - size - inset, y: height - size - inset, w: size, h: size};
  }

  function load(name) {
    const image = new Image();
    image.src = artPath + name + '.png';
    return image;
  }

  // Stock End Scenario uses Restart in a campaign and Load Custom in a
  // skirmish. Keep the original action in the first slot in both variants.
  const PAUSE_BUTTONS = [[1, 16, 40, 106], [2, 134, 40, 106], [3, 16, 74, 224],
    [4, 16, 108, 224], [5, 16, 142, 224], [6, 16, 176, 224], [-3, 16, 248, 224]];
  const OPTION_BUTTONS = [[1, 16, 40, 224], [2, 16, 74, 224], [3, 16, 108, 224], [-3, 16, 248, 224]];
  const END_BUTTONS = [[2, 16, 40, 224], [1, 16, 74, 224], [3, 16, 108, 224],
    [4, 16, 142, 224], [-3, 16, 248, 224]];

  function createModalBack(wine) {
    const arrow = load('orc-back');
    const previousPrefixes = [
      [0x10, 0x50, 0x72, 0x65, 0x76, 0x69, 0x6f, 0x75, 0x73, 0x20, 0x28], // Previous (
      [0x10, 0xcf, 0xf0, 0xe5, 0xe4, 0xfb, 0xe4, 0xf3, 0xf9, 0xe5, 0xe5, 0x20, 0x28], // Предыдущее (
    ];
    function view(address, size) {
      const wasm = wine.instance?.exports, memory = wine.memory?.buffer;
      if (!wasm?.guest_to_wasm || !memory || address < 0x10000 || address + size > 0x100000000) return null;
      const start = wasm.guest_to_wasm(address) >>> 0, end = wasm.guest_to_wasm(address + size - 1) >>> 0;
      return start > 0xf0 && end === start + size - 1 && end < memory.byteLength
        ? new DataView(memory, start, size) : null;
    }
    return packet => {
      if (!arrow.naturalWidth) return null;
      const dialog = packet?.stack?.find(scene => scene.root === packet.currentDialog && scene.nativeVisible);
      if (!dialog || dialog.handlerAddress !== 0x435b70) return null;
      const root = view(dialog.root, 0x4a);
      if (root?.getUint32(0x2a, true) !== dialog.handlerAddress ||
          root.getUint16(0x20, true) !== dialog.scene) return null;
      // The generic handler is shared. The active native continuation and
      // button geometry distinguish Pause and End Scenario from confirmation dialogs.
      const continuation = dialog.handlerAddress === 0x435b70 && view(0x4b4a14, 4)?.getUint32(0, true);
      const pause = continuation === 0x435560;
      const options = continuation === 0x4356d0;
      const endScenario = continuation === 0x435780;
      const compact = pause || options || endScenario;
      const buttons = new Map();
      let previous = null;
      let node = root.getUint32(0x46, true);
      for (let count = 0; node && count < 32; count++) {
        const child = view(node, 0x36);
        if (!child || child.getUint32(0x32, true) !== dialog.root) return null;
        const id = child.getInt16(0x20, true), kind = child.getUint16(0x22, true);
        const [left, top, right, bottom] = [4, 6, 8, 10].map(offset => child.getInt16(offset, true));
        const flags = child.getUint32(0x18, true);
        if (id === -3 && !pause) {
          if ((kind !== 1 && kind !== 2) || (flags & 10) !== 8 || left !== 16 || top !== 248 ||
              right !== 239 || bottom !== 275) return null;
          if (!compact && !previousPrefixes.some(prefix => {
            const label = view(child.getUint32(0x14, true), prefix.length);
            return label && prefix.every((value, index) => label.getUint8(index) === value);
          })) return null;
          previous = {source: {left: dialog.rect.left + 16, top: dialog.rect.top + 248, width: 224, height: 28},
            image: arrow, marginScale: Math.max(1, Math.min(3, window.devicePixelRatio || 1))};
          if (!compact) return previous;
        }
        if (compact && (flags & 8) && (kind === 1 || kind === 2)) {
          if (bottom !== top + 27 || buttons.has(id)) return null;
          buttons.set(id, {left, top, width: right - left + 1});
        }
        node = child.getUint32(0, true);
      }
      if (node || !compact || (!pause && !previous)) return null;
      const expected = pause ? PAUSE_BUTTONS : options ? OPTION_BUTTONS : END_BUTTONS;
      const firstId = buttons.has(2) ? 2 : 6;
      if (buttons.size !== expected.length || expected.some(([id, left, top, width], index) => {
        const button = buttons.get(endScenario && index === 0 ? firstId : id);
        return !button || button.left !== left || button.top !== top || button.width !== width;
      })) return null;
      return {...previous, compact: pause ? 'pause' : 'two-actions'};
    };
  }

  function create({wine, renderer, frame, activate, repaint}) {
    const layer = document.createElement('div');
    layer.id = 'warcraft-menu-navigation';
    layer.dataset.winePageDialog = '';
    layer.hidden = true;
    frame.append(layer);
    const images = Object.fromEntries(['orc-texture', 'title-button', 'title-button-pressed', 'orc-back', 'orc-back-pressed',
      'label-options', 'label-fast-scenario', 'label-replay-demo',
      'label-story', 'label-sound', 'label-language', 'label-english',
      'label-russian', 'label-russian-text', 'language-selected', 'language-unselected',
      'language-disabled',
      ...packGlyphs.map(name => `label-${name}`),
      ...Array.from(localizedGlyphs, name => `label-ru-${name}`)].map(name => [name, load(name)]));
    Object.values(images).forEach(image => image.addEventListener('load', repaint));
    let page = 'title', owner = null, buttons = [], pending = false, active = false, pressed = null;
    let languageBusy = false, languagePack = null;
    let soundOptions = null;
    let pendingTimer = 0;
    const message = document.createElement('p');
    message.className = 'warcraft-language-status';
    message.setAttribute('role', 'status');
    message.hidden = true;

    function clearPending() {
      pending = false;
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;
    }

    function go(next) {
      page = next;
      message.hidden = true;
      repaint();
    }

    function languageTask(run) {
      languageBusy = true;
      message.hidden = true;
      repaint();
      Promise.resolve().then(run).catch(error => {
        message.textContent = error.message;
        message.hidden = false;
      }).finally(() => {
        languageBusy = false;
        repaint();
      });
    }

    function languageAction(item) {
      const settings = language();
      if (item.language === 'en') {
        if (settings?.current() === 'ru') languageTask(() => settings.select('en'));
        return;
      }
      if (item.language) {
        if (!settings?.available(item.language)) return;
        languageTask(async () => {
          languagePack = {id: item.language, ...await settings.status(item.language)};
          go(languagePack.stored ? 'language-pack' : 'language-download');
        });
        return;
      }
      const {id} = languagePack;
      if (item.packAction === 'remove') {
        languageTask(async () => {
          await settings.remove(id);
          languagePack = null;
          go('language');
        });
        return;
      }
      languageTask(() => settings.select(id, {
        download: item.packAction === 'download',
        progress({loaded, total}) {
          if (item.packAction !== 'download' || total <= 0) return;
          const label = settings.current() === 'ru' ? 'Загрузка' : 'Downloading';
          message.textContent = `${label}… ${Math.floor(100 * loaded / total)}%`;
          message.hidden = false;
        },
      }));
    }

    function action(item) {
      if (!active || pending || languageBusy) return;
      if (item.soundOptions) {
        const before = window.WarcraftAssemblyMenuPolicy?.requestSoundOptions(wine);
        if (before) soundOptions = {before, opened:false};
        return;
      }
      if (item.page || (item.label === 'Back' && parentPage[page])) {
        go(item.page || parentPage[page]);
        return;
      }
      if (item.language || item.packAction) {
        languageAction(item);
        return;
      }
      pending = item.demo
        ? !!window.WarcraftAssemblyMenuPolicy?.requestDemo(wine)
        : activate(item.source.x + item.source.w / 2, item.source.y + item.source.h / 2);
      if (pending) {
        pendingTimer = window.setTimeout(() => { clearPending(); repaint(); }, 2000);
        repaint();
      }
    }

    function makeButton(item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', item.label);
      if (item.action) button.dataset.warcraftMenuAction = item.action;
      button.addEventListener('pointerdown', () => { pressed = item.label; repaint(); });
      for (const event of ['pointerup', 'pointerleave', 'pointercancel']) {
        button.addEventListener(event, () => { pressed = null; repaint(); });
      }
      button.addEventListener('click', () => action(item));
      layer.append(button);
      return button;
    }

    function setButtons(items, boxes) {
      const labels = items.map(i => i.label).join('|');
      if (layer.dataset.buttons !== labels) {
        layer.replaceChildren();
        buttons = items.map(makeButton);
        layer.append(message);
        layer.dataset.buttons = labels;
      }
      boxes.forEach((box, i) => {
        const {x, y, w, h} = box;
        Object.assign(buttons[i].style, {left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`});
        const item = items[i], control = buttons[i];
        control.disabled = pending || languageBusy || !!item.disabled ||
          !!(item.language === 'ru' && !language()?.available?.('ru'));
        if (item.language) control.setAttribute('aria-pressed',
          String(item.language === (language()?.current?.() || 'en')));
      });
    }

    function place(width, height) {
      const portrait = width < height;
      const artTop = Math.min(16, height * .025);
      const artScale = Math.min((width - 16) / art.w, height * (portrait ? .43 : .94) / art.h);
      const picture = {x: (width - art.w * artScale) / 2, y: artTop,
        w: art.w * artScale, h: art.h * artScale};
      const back = backBox(width, height);
      const top = portrait ? picture.y + picture.h + Math.min(56, height * .08) : height * .41;
      const available = (portrait ? back.y : height * .90) - top;
      const scale = Math.max(0.1, Math.min(1.6, (width - (portrait ? 28 : 44)) / 224, available / 165));
      const w = 224 * scale, h = 28 * scale;
      const boxes = [0, 36, 96, 132].map(y => ({x: (width - w) / 2, y: top + y * scale, w, h}));
      return {picture, boxes, back, scale};
    }

    function drawImage(context, image, box, source) {
      if (!image?.width) return false;
      if (source) context.drawImage(image, source.x, source.y, source.w, source.h, box.x, box.y, box.w, box.h);
      else context.drawImage(image, box.x, box.y, box.w, box.h);
      return true;
    }

    function labelImage(item) {
      const glyph = item.glyph;
      const translated = language()?.current?.() === 'ru' && localizedGlyphs.has(glyph)
        ? images[`label-ru-${glyph}`] : null;
      return translated?.naturalWidth ? translated : images[`label-${glyph}`];
    }

    function drawLabel(context, item, box, scale) {
      const glyph = labelImage(item);
      if (!glyph?.naturalWidth) return false;
      const w = glyph.naturalWidth * scale, h = glyph.naturalHeight * scale;
      return drawImage(context, glyph, {x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h});
    }

    function languagePage() {
      if (!languagePack || page === 'language') return languages();
      if (page === 'language-download') return [
        {label: 'Download', glyph: 'download', packAction: 'download'},
        {label: 'Cancel', glyph: 'cancel', page: languagePack.stored ? 'language-pack' : 'language'},
      ];
      if (page === 'language-delete') return [
        {label: 'Delete', glyph: 'delete', packAction: 'remove'},
        {label: 'Cancel', glyph: 'cancel', page: 'language-pack'},
      ];
      const action = languagePack.installed
        ? {label: 'Use language', glyph: 'use', packAction: 'use', disabled: language()?.current() === languagePack.id}
        : {label: 'Download', glyph: 'download', page: 'language-download'};
      return [action, {label: 'Delete', glyph: 'delete', page: 'language-delete'}];
    }

    function drawButton(context, image, item, box) {
      if (item.source && !item.glyph) return drawImage(context, image, box, item.source);
      const base = images[pressed === item.label ? 'title-button-pressed' : 'title-button'];
      if (!drawImage(context, base, box)) {
        drawImage(context, image, box, {x: 208, y: 240, w: 34, h: 28});
      }
      const glyph = labelImage(item);
      if (glyph?.naturalWidth) {
        const scale = Math.min(box.h / 28, box.w / (glyph.naturalWidth + 40));
        const w = glyph.naturalWidth * scale, h = glyph.naturalHeight * scale;
        drawImage(context, glyph, {x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h});
      } else {
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#f4d343';
        context.font = `${Math.max(11, box.h * .52)}px serif`;
        context.fillText(item.label, box.x + box.w / 2, box.y + box.h / 2);
      }
      if (item.language) {
        const state = item.language === (language()?.current?.() || 'en') ? 'selected' :
          (item.language === 'ru' && !language()?.available?.('ru')) ? 'disabled' : 'unselected';
        const size = box.h * 19 / 28;
        drawImage(context, images[`language-${state}`],
          {x: box.x + box.h / 4, y: box.y + (box.h - size) / 2, w: size, h: size});
      }
    }

    let presented = null;
    function paint(context, image, backdrop, scene, width, height, foreground, leftInset=0, rightInset=0) {
      if (scene.scenes.some(s => s.handler === 0x441940)) {
        if (soundOptions) soundOptions.opened = true;
        hide();
        return false;
      }
      if (!backdrop || !['title', 'single', 'campaign'].includes(scene.mode)) {
        hide();
        return false;
      }
      const root = scene.scenes.find(s => s.handler)?.root;
      const identity = `${scene.mode}:${root}`;
      if (owner !== identity) { owner = identity; clearPending(); page = 'title'; }
      if (soundOptions?.opened && scene.mode === 'title') {
        window.WarcraftAssemblyMenuPolicy.persistSoundOptions(wine, soundOptions.before);
        soundOptions = null;
        page = 'options';
      }
      const campaign = scene.mode === 'campaign';
      const originals = campaign ? scene.controls.filter(control => !control.text).sort((a, b) => a.y - b.y) : [];
      if (campaign && originals.length !== 5) { hide(); return false; }
      const campaignLabels = ['Orc: Tides of Darkness', 'Human: Tides of Darkness',
        'Orc: Beyond the Dark Portal', 'Human: Beyond the Dark Portal'];
      const languageMenu = page.startsWith('language');
      const items = campaign ? originals.slice(0, 4).map((source, i) => ({label: campaignLabels[i], source}))
        : scene.mode === 'single' ? single : languageMenu ? languagePage() : optionPages[page] || title;
      const contentWidth = width - leftInset - rightInset;
      const {picture, boxes: slots, back, scale} = place(contentWidth, height);
      picture.x += leftInset;
      back.x += leftInset;
      for (const slot of slots) slot.x += leftInset;
      const boxes = slots.slice(0, items.length);
      if (!campaign && boxes[2]) boxes[2].y = boxes[1].y + (boxes[1].y - boxes[0].y);
      active = true;
      layer.hidden = false;
      paintTexture(context, images['orc-texture'], width, height);
      drawImage(context, softenedArtwork(backdrop.canvas), picture, art);
      if (campaign) {
        const headings = scene.controls.filter(control => control.text).sort((a, b) => a.y - b.y);
        headings.forEach((source, i) => {
          const slot = slots[i * 2];
          if (!slot) return;
          const nextButton = originals[i * 2];
          if (!nextButton) return;
          const trimmed = {...source, h: Math.min(source.h, nextButton.y - source.y - 2)};
          const w = trimmed.w * scale, h = trimmed.h * scale;
          if (h > 0) foreground(image, {source: trimmed,
            target: {x: leftInset + (contentWidth - w) / 2, y: slot.y - h - 5, w, h}});
        });
      }
      if (languageMenu) {
        const last = boxes.at(-1);
        message.style.cssText = `position:absolute;left:${last.x}px;width:${last.w}px;` +
          `top:${last.y + last.h + 8}px;margin:0;text-align:center;color:#f4d343;font:14px/1.2 system-ui`;
        const first = boxes[0];
        const heading = page === 'language-pack' ? 'russian' :
          page === 'language-download' ? 'download-language' : page === 'language-delete' ? 'delete-language' : null;
        if (heading) {
          const h = Math.max(22, first.h), y = Math.max(4, first.y - h - 6);
          drawLabel(context, {glyph: heading}, {...first, y, h}, scale);
        }
      }
      items.forEach((item, i) => drawButton(context, image, item, boxes[i]));
      const controls = [...items];
      if (!['language-download', 'language-delete'].includes(page) &&
          (parentPage[page] || scene.mode === 'single' || campaign)) {
        controls.push({label: 'Back', source: parentPage[page] ? null :
          campaign ? originals[4] : nativeButton(348, 'Back').source});
        boxes.push(back);
        const arrow = images[pressed === 'Back' ? 'orc-back-pressed' : 'orc-back'];
        const size = Math.round(back.w * .9);
        if (!drawImage(context, arrow, {x: back.x + (back.w - size) / 2,
          y: back.y + (back.h - size * .95) / 2, w: size, h: size * .95})) {
          context.textAlign = 'center';context.textBaseline = 'middle';context.fillStyle = '#f4d343';
          context.font = `${size * .75}px serif`;context.fillText('←', back.x + back.w / 2, back.y + back.h / 2);
        }
      }
      presented = {picture, controls, boxes, page};
      setButtons(controls, boxes);
      return true;
    }

    function hide() {
      active = false;owner = null;clearPending();page = 'title';pressed = null;
      presented = null;layer.hidden = true;
    }

    const keyHandlers = new Map();
    for (const name of ['handleKeyDown', 'handleKeyUp', 'handleKeyPress']) {
      const original = renderer[name];
      if (typeof original !== 'function') continue;
      keyHandlers.set(name, original);
      renderer[name] = function (...args) {
        if (!active) return original.apply(this, args);
        if (name === 'handleKeyDown' && args[0] === 27 && !pending) {
          const back = presented?.controls.find(item => item.label === 'Back' || item.label === 'Cancel');
          if (back) action(back);
        }
      };
    }
    return {paint, hide, get active() { return active; }, get presented() { return presented; }, destroy() {
      for (const [name, original] of keyHandlers) renderer[name] = original;
      clearPending();
      layer.remove();
    }};
  }

  window.WarcraftAssemblyMenuNavigation = Object.freeze({create, createModalBack, paintTexture, backBox});
})();
