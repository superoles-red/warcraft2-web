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
    options: [submenu('Story'), submenu('Sound'), submenu('Music'), submenu('Language')],
    story: [nativeButton(312, 'Replay Introduction'), nativeButton(348, 'Show Credits'),
      {label: 'Replay Demo', glyph: 'replay-demo', demo: true}],
    sound: [{label: 'Sound', glyph: 'sound', volume: 'sound'}],
    music: [{label: 'Music', glyph: 'music', volume: 'music'}],
  };
  const parentPage = {options: 'title', story: 'options', sound: 'options', music: 'options', language: 'options'};
  const localizedGlyphs = new Set(['options', 'fast-scenario', 'replay-demo', 'story', 'sound', 'music', 'language']);
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

  function createModalBack(wine) {
    const arrow = load('orc-back');
    const prefix = [0x10, 0x50, 0x72, 0x65, 0x76, 0x69, 0x6f, 0x75, 0x73, 0x20, 0x28]; // Previous (
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
      if (!dialog || ![0x435b70, 0x4353a0].includes(dialog.handlerAddress)) return null;
      const root = view(dialog.root, 0x4a);
      if (root?.getUint32(0x2a, true) !== dialog.handlerAddress ||
          root.getUint16(0x20, true) !== dialog.scene) return null;
      let node = root.getUint32(0x46, true);
      for (let count = 0; node && count < 32; count++) {
        const child = view(node, 0x36);
        if (!child || child.getUint32(0x32, true) !== dialog.root) return null;
        if (child.getInt16(0x20, true) === -3) {
          const kind = child.getUint16(0x22, true);
          if ((kind !== 1 && kind !== 2) || (child.getUint32(0x18, true) & 10) !== 8 ||
              child.getInt16(4, true) !== 16 || child.getInt16(6, true) !== 248 ||
              child.getInt16(8, true) !== 239 || child.getInt16(10, true) !== 275) return null;
          const label = view(child.getUint32(0x14, true), prefix.length);
          if (!label || !prefix.every((value, index) => label.getUint8(index) === value)) return null;
          return {source: {left: dialog.rect.left + 16, top: dialog.rect.top + 248, width: 224, height: 28},
            image: arrow, marginScale: Math.max(1, Math.min(3, window.devicePixelRatio || 1))};
        }
        node = child.getUint32(0, true);
      }
      return null;
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
      'label-story', 'label-sound', 'label-music', 'label-language', 'label-english',
      'label-russian', 'label-russian-text', 'language-selected', 'language-unselected',
      'language-disabled', 'volume-track', 'volume-thumb', 'volume-digits',
      ...Array.from(localizedGlyphs, name => `label-ru-${name}`)].map(name => [name, load(name)]));
    Object.values(images).forEach(image => image.addEventListener('load', repaint));
    let page = 'title', owner = null, buttons = [], pending = false, active = false, pressed = null;
    let languageBusy = false;
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

    function action(item) {
      if (!active || pending || languageBusy) return;
      if (item.page || (item.label === 'Back' && parentPage[page])) {
        page = item.page || parentPage[page];
        message.hidden = true;
        repaint();
        return;
      }
      if (item.language) {
        const settings = language();
        if (!settings?.available?.(item.language) ||
            (item.language === settings.current() && !settings.needsDownload?.(item.language))) return;
        languageBusy = true;
        message.hidden = false;
        message.textContent = 'Загружаю язык…';
        repaint();
        Promise.resolve().then(() => settings.select(item.language, ({loaded, total}) => {
          if (total > 0) message.textContent = 'Загружаю язык… ' + Math.floor(100 * loaded / total) + '%';
        })).catch(error => {
          languageBusy = false;
          message.textContent = error.message;
          repaint();
        });
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

    function makeSlider(item) {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';
      slider.setAttribute('aria-label', item.label);
      slider.style.cssText = 'position:absolute;opacity:0;touch-action:none;margin:0;cursor:pointer';
      for (const name of ['focus', 'blur']) slider.addEventListener(name, repaint);
      slider.addEventListener('input', () => {
        window.WarcraftAssemblyMenuPolicy?.setVolume(wine, item.volume, Number(slider.value));
        repaint();
      });
      return slider;
    }

    function makeButton(item) {
      if (item.volume) {
        const slider = makeSlider(item);
        layer.append(slider);
        return slider;
      }
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
        const value = item.volume && window.WarcraftAssemblyMenuPolicy?.volume(wine, item.volume);
        control.disabled = pending || languageBusy ||
          !!(item.language === 'ru' && !language()?.available?.('ru')) ||
          !!(item.volume && !Number.isInteger(value));
        if (item.volume && Number.isInteger(value) && Number(control.value) !== value) control.value = value;
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

    function drawVolume(context, item, box) {
      const ratio = box.w / 224;
      const track = {x: box.x, y: box.y + (box.h - 19 * ratio) / 2, w: box.w, h: 19 * ratio};
      const value = window.WarcraftAssemblyMenuPolicy?.volume(wine, item.volume);
      const label = labelImage(item);
      drawImage(context, label, {x: box.x, y: box.y - 23 * ratio,
        w: label.naturalWidth * ratio, h: label.naturalHeight * ratio});
      drawImage(context, images['volume-track'], track);
      if (!Number.isInteger(value)) return;
      const thumb = 17 * ratio;
      drawImage(context, images['volume-thumb'], {x: track.x + (track.w - thumb) * value / 100,
        y: track.y + (track.h - thumb) / 2, w: thumb, h: thumb});
      const digits = `${value}%`;
      const cell = 11 * ratio;
      for (let i = 0; i < digits.length; i++) {
        drawImage(context, images['volume-digits'],
          {x: box.x + box.w - (digits.length - i) * cell, y: box.y - 23 * ratio, w: cell, h: 17 * ratio},
          {x: 11 * '0123456789%'.indexOf(digits[i]), y: 0, w: 11, h: 17});
      }
      if (layer.contains(document.activeElement) && document.activeElement.type === 'range') {
        context.strokeStyle = '#f4d343';
        context.strokeRect(track.x - 1, track.y - 1, track.w + 2, track.h + 2);
      }
    }

    let presented = null;
    function paint(context, image, backdrop, scene, width, height, foreground, leftInset=0, rightInset=0) {
      if (!backdrop || !['title', 'single', 'campaign'].includes(scene.mode)) {
        hide();
        return false;
      }
      const root = scene.scenes.find(s => s.handler)?.root;
      const identity = `${scene.mode}:${root}`;
      if (owner !== identity) { owner = identity; clearPending(); page = 'title'; }
      const campaign = scene.mode === 'campaign';
      const originals = campaign ? scene.controls.filter(control => !control.text).sort((a, b) => a.y - b.y) : [];
      if (campaign && originals.length !== 5) { hide(); return false; }
      const campaignLabels = ['Orc: Tides of Darkness', 'Human: Tides of Darkness',
        'Orc: Beyond the Dark Portal', 'Human: Beyond the Dark Portal'];
      const items = campaign ? originals.slice(0, 4).map((source, i) => ({label: campaignLabels[i], source}))
        : scene.mode === 'single' ? single : page === 'language' ? languages() : optionPages[page] || title;
      const contentWidth = width - leftInset - rightInset;
      const {picture, boxes: slots, back, scale} = place(contentWidth, height);
      picture.x += leftInset;
      back.x += leftInset;
      for (const slot of slots) slot.x += leftInset;
      const boxes = slots.slice(0, items.length);
      if (items[0]?.volume) {
        boxes[0].y += 32 * scale;
        boxes[0].h = Math.max(44, boxes[0].h);
      }
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
      if (page === 'language') {
        const last = boxes.at(-1);
        message.style.cssText = `position:absolute;left:${last.x}px;width:${last.w}px;` +
          `top:${last.y + last.h + 8}px;margin:0;text-align:center;color:#f4d343;font:14px/1.2 system-ui`;
      }
      items.forEach((item, i) => {
        if (item.volume) drawVolume(context, item, boxes[i]);
        else drawButton(context, image, item, boxes[i]);
      });
      const controls = [...items];
      if (parentPage[page] || scene.mode === 'single' || campaign) {
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
          const back = presented?.controls.find(item => item.label === 'Back');
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
