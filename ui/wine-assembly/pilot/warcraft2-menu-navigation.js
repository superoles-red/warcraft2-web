/* Web menu arrangement. The original game still handles its native actions. */
(() => {
  'use strict';

  const artPath = './menu-art/';
  const art = {x: 0, y: 0, w: 640, h: 480};
  const originalVersion = 'Warcraft II BNE v2.02';
  const nativeButton = (y, label) => ({label, source: {x: 208, y, w: 224, h: 28}});
  const submenu = (label, page = label.toLowerCase()) => ({label, page, glyph: page});
  const title = [{...nativeButton(240, 'Single Player Game'), action: 'single'}, submenu('Options')];
  const single = [{...nativeButton(240, 'Campaign'), caption: 'campaign'},
    {...nativeButton(312, 'Fast Scenario'), glyph: 'fast-scenario'}];
  const campaignIds = ['orc-tod', 'human-tod', 'orc-btdp', 'human-btdp'];
  const continueItem = {label:'Continue', caption:'continue', resume:true};
  const feedbackItem = {label:'Feedback', caption:'feedback', disabled:true};
  const filesItem = {label:'Files', caption:'files', files:true};
  const aboutItem = {label:'About', caption:'about', about:true};
  const about = {
    en: {
      intro:'An unofficial web adaptation of Warcraft II: Battle.net Edition. We kept the original gameplay, campaigns and art. We adapted the controls, camera and menus for phones, removed desktop-only controls and added offline play.',
      community:'Thanks to all the enthusiasts who create and support noncommercial projects and fan adaptations, share their knowledge, and keep the internet open and free.',
      credits:'Thanks to Blizzard Entertainment for Warcraft II, Vladimir Grichina and the Wine-Assembly contributors for the browser runtime, the StormLib contributors and J.C. Fields for the work on MPQ archives, and the FFmpeg contributors for the media tools.',
    },
    ru: {
      intro:'Неофициальная веб-адаптация Warcraft II: Battle.net Edition. Мы сохранили оригинальные правила, кампании и графику. Для телефонов обновили управление, камеру и меню, убрали лишние элементы и добавили игру без интернета.',
      community:'Спасибо всем энтузиастам, которые создают и поддерживают некоммерческие проекты и народные адаптации, делятся знаниями и помогают сохранять интернет открытым и свободным.',
      credits:'Спасибо Blizzard Entertainment за Warcraft II, Владимиру Гричине и участникам Wine-Assembly за запуск в браузере, разработчикам StormLib и J. C. Fields за работу с архивами MPQ, а команде FFmpeg — за инструменты для обработки видео и звука.',
    },
  };
  const optionPages = {
    options: [{label:'Sound', glyph:'sound', soundOptions:true}, submenu('Language'), submenu('Story')],
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
  function softenedArtwork(original, cleanVersion) {
    const previous = pictures.get(original);
    if (previous) return previous;
    const picture = document.createElement('canvas');
    picture.width = art.w;
    picture.height = art.h;
    const context = picture.getContext('2d');
    context.drawImage(original, 0, 0);
    context.drawImage(cleanVersion, 58, 458);
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
    const size = Math.min(90, width * .26, height * .27);
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
  const modalAtlasInk = [247, 211, 171, 95];
  const factionInk = {
    human:[[252,248,240],[252,248,240],[156,156,156],[108,108,108]],
    orc:[[244,224,32],[208,192,28],[168,140,16],[92,48,0]],
  };

  function createModalBack(wine) {
    const arrows = {human:load('menu-back-human'), orc:load('menu-back-orc')};
    const russian = language()?.current?.() === 'ru';
    let confirmationLabels;
    const font = window.WarcraftSessionText;
    font?.load(russian ? 'ru' : 'en').then(atlas => {
      function factionCaption(caption, palette) {
        const label = font.ink(caption, atlas);
        const context = label.getContext('2d'), image = context.getImageData(0,0,label.width,label.height);
        for (let i=0; i<image.data.length; i+=4) {
          const shade=modalAtlasInk.indexOf(image.data[i]);
          if (shade>=0) image.data.set(palette[shade],i);
        }
        context.putImageData(image,0,0);
        return label;
      }
      confirmationLabels = Object.fromEntries(Object.entries(factionInk).map(([faction, palette]) =>
        [faction,factionCaption('OK', palette)]));
    }).catch(console.error);
    const restartArt = Object.fromEntries(['human', 'orc'].map(faction => [faction, {
      button: load(faction + '-wide-button'),
      shortButton: load(faction + '-short-button'),
      label: load('label-' + (russian ? 'ru-' : '') + 'restart-scenario' + (faction === 'orc' ? '-orc' : '')),
    }]));
    const waiting = Object.freeze({waiting: true});
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
      const dialog = packet?.stack?.find(scene => scene.root === packet.currentDialog && scene.nativeVisible);
      if (!dialog) return null;
      const faction = view(0x4abb7c, 1)?.getUint8(0) === 0 ? 'human' : 'orc';
      const arrow = arrows[faction];
      const settings = dialog.handlerAddress === 0x441940;
      // The generic handler is shared. The active native continuation and
      // button geometry distinguish Pause and End Scenario from confirmation dialogs.
      const continuation = dialog.handlerAddress === 0x435b70 && view(0x4b4a14, 4)?.getUint32(0, true);
      const pause = continuation === 0x435560;
      const options = continuation === 0x4356d0;
      const endScenario = continuation === 0x435780;
      const confirmation = continuation === 0x435980 || continuation === 0x4359f0;
      const compact = pause || options || endScenario || confirmation;
      // The common native painter can briefly keep the old root while its
      // continuation is being replaced. No menu has a valid zero return path.
      if (dialog.handlerAddress === 0x435b70 && !continuation) return waiting;
      const required = compact || settings ? waiting : null;
      const root = view(dialog.root, 0x4a);
      if (root?.getUint32(0x2a, true) !== dialog.handlerAddress ||
          root.getUint16(0x20, true) !== dialog.scene) return required;
      const buttons = new Map();
      let previous = null;
      let node = root.getUint32(0x46, true);
      for (let count = 0; node && count < 32; count++) {
        const child = view(node, 0x36);
        if (!child || child.getUint32(0x32, true) !== dialog.root) return required;
        const id = child.getInt16(0x20, true), kind = child.getUint16(0x22, true);
        const [left, top, right, bottom] = [4, 6, 8, 10].map(offset => child.getInt16(offset, true));
        const flags = child.getUint32(0x18, true);
        if (id === -3 && !pause && !settings && (compact || dialog.handlerAddress===0x435b70) &&
            (kind===1||kind===2) && (flags&10)===8 && left===16 && top===248 && right===239 && bottom===275) {
          if (compact || previousPrefixes.some(prefix => {
            const label = view(child.getUint32(0x14, true), prefix.length);
            return label && prefix.every((value, index) => label.getUint8(index) === value);
          })) previous = {source: {left: dialog.rect.left + 16, top: dialog.rect.top + 248, width: 224, height: 28},
              image: arrow};
        }
        if ((flags & 8) && (kind === 1 || kind === 2) && (id > 0 || id === -3 || id === -2)) {
          const width=right-left+1,height=bottom-top+1;
          if (width<32||height!==28||buttons.has(id)) return required;
          buttons.set(id, {id,left,top,width,height});
        }
        node = child.getUint32(0, true);
      }
      if (node) return required;
      const art = restartArt[faction];
      const sourceOf = item => ({left: dialog.rect.left + item.left, top: dialog.rect.top + item.top,
        width:item.width, height:28});
      const controls = (items, {skip, replace} = {}) => items
        .filter(item => item.id!==skip)
        .map(item => ({id:item.id,source:sourceOf(item),
          blank:item.width===224?art.button:item.width===106?art.shortButton:null,
          ...(item.id===replace?{button:art.button,label:art.label}:null)}));

      if (settings) {
        const cancel = buttons.get(-3), ok = buttons.get(-2);
        if (!arrow.naturalWidth || cancel?.left !== 12 || cancel.top !== 256 || cancel.width !== 106 ||
            ok?.left !== 138 || ok.top !== 256 || ok.width !== 106) return waiting;
        return {source:sourceOf(cancel), ok:sourceOf(ok), image:arrow, controls:controls([ok])};
      }
      if (!compact) {
        if (previous && !arrow.naturalWidth) return waiting;
        const actions=controls([...buttons.values()],{skip:previous?-3:undefined});
        return actions.length || previous ? {...previous, controls:actions} : null;
      }
      if (!pause && !previous) return required;
      if (confirmation) {
        const accept = buttons.get(-2);
        const {shortButton:button} = restartArt[faction];
        if (!confirmationLabels || !button.naturalWidth || !arrow.naturalWidth || buttons.size !== 2 ||
            accept?.left !== 16 || accept.top !== 108 || accept.width !== 224) return waiting;
        return {...previous, compact:'confirmation', controls:[], confirmation:{ok:sourceOf(accept),
          label:confirmationLabels[faction], button}};
      }
      const expected = pause ? PAUSE_BUTTONS : options ? OPTION_BUTTONS : END_BUTTONS;
      const firstId = buttons.has(2) ? 2 : 6;
      if (buttons.size !== expected.length || expected.some(([id, left, top, width], index) => {
        const button = buttons.get(endScenario && index === 0 ? firstId : id);
        return !button || button.left !== left || button.top !== top || button.width !== width;
      })) return waiting;
      if (!arrow.naturalWidth) return waiting;
      if (endScenario) {
        if (!art.button.naturalWidth || !art.label.naturalWidth) return waiting;
        const items=[buttons.get(firstId),buttons.get(3)];
        return {...previous, compact:'end', controls:controls(items,{replace:firstId}), restartId:firstId};
      }
      if (pause) return {compact:'pause', source:sourceOf(buttons.get(-3)), image:arrow,
        controls:controls([3,5,6].map(id=>buttons.get(id)))};
      return {...previous, compact:'two-actions', controls:controls([1,2,3].map(id=>buttons.get(id)))};
    };
  }

  function create({wine, renderer, frame, activate, repaint, initialPage}) {
    const layer = document.createElement('div');
    layer.id = 'warcraft-menu-navigation';
    layer.dataset.winePageDialog = '';
    layer.hidden = true;
    frame.append(layer);
    const session = wine.warcraftSession;
    const sessionArt = window.WarcraftSessionPanel;
    const sessionPanel = session && sessionArt.create(frame);
    const sessionAtlases = new Map();
    const sessionCaptions = new Map();
    let resume = null, resumeTimer = 0;
    if (session) for (const locale of ['en', 'ru']) {
      window.WarcraftSessionText.load(locale).then(atlas => {
        sessionAtlases.set(locale, atlas);
        repaint();
      }).catch(console.error);
    }
    const images = Object.fromEntries(['orc-texture', 'title-version-clean', 'title-button', 'title-button-pressed', 'menu-back-orc', 'menu-back-orc-pressed',
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
    let returningFromDemo = false;
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

    function closeSession() {
      sessionPanel?.hide();
      layer.inert = false;
    }

    function showSession(options) {
      layer.inert = true;
      sessionPanel.show(options).catch(error => {
        closeSession();
        console.error(error);
      });
    }

    function confirm(slot, start, back, continuing = false) {
      const {text, slotName} = sessionArt;
      const lines = slotName(slot);
      if (!continuing && session.store.read().slot) lines.push(text('replace'));
      showSession({
        heading:text(continuing ? 'resume' : 'newGame'),
        lines,
        accept:{title:text(continuing ? 'continue' : 'start'), action() {
          if (!start()) return false;
          closeSession();
          return true;
        }},
        back,
      });
    }

    function launchCampaign(slot, source) {
      return session.native.armCampaign(slot) &&
        activate(source.x + source.w / 2, source.y + source.h / 2);
    }

    function showCampaign(item) {
      const {text, missionName, campaignName} = sessionArt;
      const id = item.campaign;
      const completed = session.store.read().completed[id];
      const count = window.WarcraftSession.campaigns[id];
      showSession({
        heading:campaignName(id), list:true, back:closeSession,
        rows:Array.from({length:count}, (_, index) => {
          const mission = index + 1;
          const slot = {kind:'campaign', campaign:id, mission};
          return {
            title:missionName(id, mission),
            locked:!session.store.canStart(id, mission), completed:completed.includes(mission),
            action:() => confirm(slot, () => launchCampaign(slot, item.source), () => showCampaign(item)),
          };
        }),
      });
    }

    function clearResume() {
      window.clearTimeout(resumeTimer);
      resume = null;
    }

    function startResume() {
      const slot = session?.store.read().slot;
      if (!slot) return;
      confirm(slot, () => {
        if (session.native.continueSlot?.(slot) && activate(320,362)) return true;
        if (!activate(320,254)) return false;
        resume = {slot, stage:'single'};
        resumeTimer = window.setTimeout(clearResume,6000);
        return true;
      }, closeSession, true);
    }

    function advanceResume(mode, originals) {
      if (!resume || mode !== resume.stage) return;
      const request = resume;
      const {slot} = request;
      if (mode === 'single') {
        request.stage = slot.kind === 'campaign' ? 'campaign' : 'fast';
        window.requestAnimationFrame(() => {
          if (resume === request && !activate(320,slot.kind === 'campaign' ? 254 : 326)) clearResume();
        });
      } else {
        const source = originals[campaignIds.indexOf(slot.campaign)];
        request.stage = 'loading';
        window.requestAnimationFrame(() => {
          if (resume !== request) return;
          clearResume();
          if (source) launchCampaign(slot,source);
        });
      }
    }

    function handleFastDialog() {
      if (resume?.stage !== 'fast') return;
      const request = resume;
      request.stage = 'loading';
      window.requestAnimationFrame(() => {
        if (resume !== request) return;
        clearResume();
        if (session.native.restoreFast(request.slot)) {
          session.native.armFast(request.slot);
          activate(510,418);
        }
      });
    }

    function confirmFast(start) {
      const slot = session?.native.snapshotFast?.();
      if (!slot) return false;
      confirm(slot, () => {
        session.native.armFast(slot);
        return start();
      },closeSession);
      return true;
    }

    function action(item) {
      if (!active || pending || languageBusy || sessionPanel?.active) return;
      if (item.resume) return startResume();
      if (item.files) return window.WarcraftFiles.open({session,showSession,back:closeSession});
      if (item.about) {
        const {intro,credits,community} = about[sessionArt.locale()];
        return showSession({heading:sessionArt.text('about'), lines:[originalVersion,intro,credits,community], back:closeSession, prose:true});
      }
      if (item.campaign && session) return showCampaign(item);
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
      button.setAttribute('aria-label', item.caption === 'feedback' ? sessionArt.text('feedback') : item.label);
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

    function place(width, height, count, campaign, home) {
      const portrait = width < height;
      const h = window.WarcraftAssemblyDialogLayout.menuButtonHeight(width,height);
      const gap = Math.min(8,h*.16);
      const headingRoom = campaign ? h*.42 : 0;
      const span = count*h+(count-1)*gap+2*headingRoom;
      const corner = backBox(width, height);
      const back = {x:corner.x+corner.w-h,y:corner.y+corner.h-h,w:h,h};
      const artTop = Math.min(16, height * .025);
      const rail = portrait ? 0 : Math.max(h+gap,Math.min(124,width*.18));
      const pictureSpace = portrait ? width : (width-rail)*.51;
      const controlSpace = portrait ? width : width-pictureSpace-rail;
      const controlCenter = portrait ? width/2 : pictureSpace+controlSpace/2;
      // Leave room for the five Options rows and a separate corner button on every title page.
      const artLimit = portrait ? Math.min(height*.43,back.y-5*h-6*gap-artTop) : height*.94;
      const pictureScale = Math.min((pictureSpace-16) / art.w,artLimit/art.h);
      const picture = {x: (pictureSpace-art.w*pictureScale)/2, y: portrait ? artTop : (height-art.h*pictureScale)/2,
        w: art.w * pictureScale, h: art.h * pictureScale};
      const panelTop = portrait ? picture.y+picture.h+gap : gap;
      const panelBottom = portrait && !home ? back.y-gap : height-gap;
      const scale = Math.max(.1, Math.min(1.6,
        (controlSpace-(portrait ? 28 : 18))/224,portrait ? Infinity : height*.49/172));
      const w = 224*scale;
      const centered = portrait ? height/2 : (panelTop+panelBottom)/2;
      const top = headingRoom+Math.max(panelTop,Math.min(panelBottom-span,centered-span/2));
      const boxes = Array.from({length:count},(_,i)=>({x:controlCenter-w/2,
        y:top+i*(h+gap)+(i>=2 ? headingRoom : 0),w,h}));
      return {picture, boxes, back, scale, rail};
    }

    function drawImage(context, image, box, source) {
      if (!image?.width) return false;
      if (source) context.drawImage(image, source.x, source.y, source.w, source.h, box.x, box.y, box.w, box.h);
      else context.drawImage(image, box.x, box.y, box.w, box.h);
      return true;
    }

    function labelImage(item) {
      const glyph = item.glyph;
      return language()?.current?.() === 'ru' && localizedGlyphs.has(glyph)
        ? images[`label-ru-${glyph}`] : images[`label-${glyph}`];
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
      ];
      if (page === 'language-delete') return [
        {label: 'Delete', glyph: 'delete', packAction: 'remove'},
      ];
      const action = languagePack.installed
        ? {label: 'Use language', glyph: 'use', packAction: 'use', disabled: language()?.current() === languagePack.id}
        : {label: 'Download', glyph: 'download', page: 'language-download'};
      return [action, {label: 'Delete', glyph: 'delete', page: 'language-delete'}];
    }

    function drawButton(context, image, item, box, captionScale) {
      if (item.source && !item.glyph && !item.caption) {
        const blank = images[pressed === item.label ? 'title-button-pressed' : 'title-button'];
        return window.WarcraftAssemblyDialogLayout.paintTallButton(context,image,item.source,box,blank,captionScale);
      }
      const base = images[pressed === item.label ? 'title-button-pressed' : 'title-button'];
      drawImage(context, base, box);
      if (item.caption) {
        const locale = sessionArt.locale(), id = locale + ':' + item.caption;
        if (!sessionCaptions.has(id)) sessionCaptions.set(id,
          window.WarcraftSessionText.ink(sessionArt.text(item.caption), sessionAtlases.get(locale)));
        const glyph = sessionCaptions.get(id);
        const scale = Math.min(captionScale, box.w / (glyph.width + 40));
        const w = glyph.width * scale, h = glyph.height * scale;
        drawImage(context, glyph, {x:box.x + (box.w-w)/2,y:box.y + (box.h-h)/2,w,h});
      } else {
        const glyph = labelImage(item);
        drawLabel(context, item, box, Math.min(captionScale, box.w / (glyph.naturalWidth + 40)));
      }
      if (item.language) {
        const state = item.language === (language()?.current?.() || 'en') ? 'selected' :
          (item.language === 'ru' && !language()?.available?.('ru')) ? 'disabled' : 'unselected';
        const size = 19 * captionScale;
        drawImage(context, images[`language-${state}`],
          {x: box.x + 7*captionScale, y: box.y + (box.h - size) / 2, w: size, h: size});
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
      if (owner !== identity) {
        owner = identity;
        clearPending();
        page = scene.mode === 'title' && initialPage ? initialPage : 'title';
        initialPage = null;
      }
      if (returningFromDemo && scene.mode === 'title' && !window.WarcraftAssemblyMenuPolicy?.demoPlaying(wine)) {
        returningFromDemo = false;
        page = 'story';
      }
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
      const titleItems = session?.store.read().slot ? [continueItem,...title] : title;
      const options = page === 'options' && session
        ? [...optionPages.options, ...(window.WarcraftFiles ? [filesItem] : []), aboutItem] : optionPages[page];
      const items = campaign
        ? originals.slice(0, 4).map((source, i) => ({label: campaignLabels[i], source, campaign:campaignIds[i]}))
        : scene.mode === 'single' ? (session ? single : [{...single[0],caption:null},single[1]]) :
          languageMenu ? languagePage() : options || titleItems;
      const home = scene.mode === 'title' && page === 'title';
      const feedback = session && scene.mode === 'title' && page === 'options';
      advanceResume(scene.mode, originals);
      const heading = !languageMenu ? null : page === 'language-pack' ? 'russian' :
        page === 'language-download' ? 'download-language' : page === 'language-delete' ? 'delete-language' : null;
      const hasBack = parentPage[page] || scene.mode === 'single' || campaign;
      if (!images['orc-texture'].naturalWidth || !images['title-version-clean'].naturalWidth ||
          !images['title-button'].naturalWidth || !images['title-button-pressed'].naturalWidth ||
          items.some(item => item.glyph && !labelImage(item)?.naturalWidth) ||
          ((feedback || items.some(item => item.caption)) && !sessionAtlases.has(sessionArt.locale())) ||
          (heading && !labelImage({glyph: heading})?.naturalWidth) ||
          (hasBack && (!images['menu-back-orc'].naturalWidth || !images['menu-back-orc-pressed'].naturalWidth))) {
        layer.hidden = true;
        return null;
      }
      const contentWidth = width - leftInset - rightInset;
      const {picture, boxes, back, scale, rail} = place(contentWidth,height,items.length,campaign,home);
      let feedbackBox;
      if (feedback) {
        const first = boxes[0];
        const w = Math.min(124,rail?rail-14:first.w*.38);
        feedbackBox = {x:contentWidth-w-12,y:12,w,h:first.h};
        feedbackBox.x += leftInset;
      }
      picture.x += leftInset;
      back.x += leftInset;
      for (const box of boxes) box.x += leftInset;
      active = true;
      layer.hidden = false;
      paintTexture(context, images['orc-texture'], width, height);
      drawImage(context, softenedArtwork(backdrop.canvas,images['title-version-clean']), picture, art);
      if (campaign) {
        const headings = scene.controls.filter(control => control.text).sort((a, b) => a.y - b.y);
        headings.forEach((source, i) => {
          const slot = boxes[i * 2];
          if (!slot) return;
          const nextButton = originals[i * 2];
          if (!nextButton) return;
          const trimmed = {...source, h: Math.min(source.h, nextButton.y - source.y - 2)};
          const w = trimmed.w * scale, h = trimmed.h * scale;
          if (h > 0) foreground(image, {source: trimmed,
            target: {x: slot.x+(slot.w-w)/2, y: slot.y - h - 5, w, h}});
        });
      }
      if (languageMenu) {
        const last = boxes.at(-1);
        message.style.cssText = `position:absolute;left:${last.x}px;width:${last.w}px;` +
          `top:${last.y + last.h + 8}px;margin:0;text-align:center;color:#f4d343;font:14px/1.2 system-ui`;
        const first = boxes[0];
        if (heading) {
          const h = Math.max(22, 28*scale), y = Math.max(4, first.y - h - 6);
          drawLabel(context, {glyph: heading}, {...first, y, h}, scale);
        }
      }
      items.forEach((item, i) => drawButton(context, image, item, boxes[i], scale));
      const controls = [...items];
      if (feedback) {
        controls.push(feedbackItem);
        boxes.push(feedbackBox);
        drawButton(context,image,feedbackItem,feedbackBox,scale);
      }
      if (hasBack) {
        controls.push({label: 'Back', source: parentPage[page] ? null :
          campaign ? originals[4] : nativeButton(348, 'Back').source});
        boxes.push(back);
        const arrow = images[pressed === 'Back' ? 'menu-back-orc-pressed' : 'menu-back-orc'];
        drawImage(context, arrow, back);
      }
      presented = {picture, controls, boxes, page};
      setButtons(controls, boxes);
      return true;
    }

    function hide() {
      if (window.WarcraftAssemblyMenuPolicy?.demoPlaying(wine)) returningFromDemo = true;
      active = false;owner = null;clearPending();page = 'title';pressed = null;
      presented = null;layer.hidden = true;
    }

    const keyHandlers = new Map();
    for (const name of ['handleKeyDown', 'handleKeyUp', 'handleKeyPress']) {
      const original = renderer[name];
      if (typeof original !== 'function') continue;
      keyHandlers.set(name, original);
      renderer[name] = function (...args) {
        if (sessionPanel?.active) {
          if (name === 'handleKeyDown' && args[0] === 27) sessionPanel.back();
          return;
        }
        if (!active) return original.apply(this, args);
        if (name === 'handleKeyDown' && args[0] === 27 && !pending) {
          const back = presented?.controls.find(item => item.label === 'Back' || item.label === 'Cancel');
          if (back) action(back);
        }
      };
    }
    return {paint, hide, confirmFast, handleFastDialog,
      get blocking() { return layer.inert; }, get active() { return active; }, get presented() { return presented; }, destroy() {
      for (const [name, original] of keyHandlers) renderer[name] = original;
      clearPending();
      clearResume();
      sessionPanel?.destroy();
      layer.remove();
    }};
  }

  window.WarcraftAssemblyMenuNavigation = Object.freeze({create, createModalBack, paintTexture, backBox});
})();
