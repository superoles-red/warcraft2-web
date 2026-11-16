/* Web menu arrangement. The original game still handles its native actions. */
(() => {
  'use strict';

  const artPath = './menu-art/';
  const art = {x: 0, y: 0, w: 640, h: 480};
  const portraitArt = {x: 0, y: 0, w: 400, h: 832};
  const originalVersion = 'Warcraft II BNE v2.02';
  const nativeButton = (y, label) => ({label, source: {x: 208, y, w: 224, h: 28}});
  const submenu = (label, page = label.toLowerCase()) => ({label, page, glyph: page});
  const title = [{label: 'Campaign', caption: 'campaign', destination: 254},
    {label: 'Fast Scenario', glyph: 'fast-scenario', destination: 326}, submenu('Options')];
  const campaignIds = ['orc-tod', 'human-tod', 'orc-btdp', 'human-btdp'];
  const continueItem = {label:'Continue', caption:'continue', resume:true};
  const feedbackItem = {label:'Feedback', caption:'feedback', disabled:true};
  const updateItem = {label:'Update', caption:'update', checkUpdate:true};
  const updateMessages = {
    en: {checking:'Checking for updates…', current:'You have the latest version.', unreachable:'Could not reach the update server.',
      failed:'Could not download the update. Try again.', downloading:'The update is still downloading.',
      ready:'Update ready. Return to the main menu to apply it.', applying:'Applying update…'},
    ru: {checking:'Проверяю обновления…', current:'У тебя последняя версия.', unreachable:'Сервер обновлений недоступен.',
      failed:'Не удалось скачать обновление. Попробуй ещё раз.', downloading:'Обновление ещё скачивается.',
      ready:'Обновление готово. Вернись в главное меню.', applying:'Применяю обновление…'},
  };
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
      {label: 'Replay Demo', caption: 'replayDemo', demo: true}],
  };
  const parentPage = {options: 'title', story: 'options', language: 'options',
    'language-pack': 'language', 'language-download': 'language', 'language-delete': 'language-pack'};
  const sectionTitles = {
    en: {campaign:'Campaign', options:'Options', story:'Story', language:'Language',
      'language-pack':'Russian', 'language-download':'Download Language', 'language-delete':'Delete Language'},
    ru: {campaign:'Кампания', options:'Настройки', story:'История', language:'Язык',
      'language-pack':'Русский', 'language-download':'Скачать язык', 'language-delete':'Удалить язык'},
  };
  const localizedGlyphs = new Set(['options', 'fast-scenario', 'story', 'sound', 'language']);
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

  function featherArtwork(context, width, height, edge) {
    context.save();
    context.globalCompositeOperation = 'destination-in';
    for (const axis of ['x', 'y']) {
      const length = axis === 'x' ? width : height;
      const fade = context.createLinearGradient(0, 0, axis === 'x' ? length : 0, axis === 'y' ? length : 0);
      for (const [position, opacity] of [[0, 0], [edge / length, 1], [1 - edge / length, 1], [1, 0]]) {
        fade.addColorStop(position, `rgba(0,0,0,${opacity})`);
      }
      context.fillStyle = fade;
      context.fillRect(0, 0, width, height);
    }
    context.restore();
  }

  const pictures = new WeakMap(), portraitPictures = new WeakMap();
  function softenedArtwork(original, cleanVersion) {
    const previous = pictures.get(original);
    if (previous) return previous;
    const picture = document.createElement('canvas');
    picture.width = original.naturalWidth || original.width;
    picture.height = original.naturalHeight || original.height;
    const context = picture.getContext('2d');
    context.drawImage(original, 0, 0);
    if (cleanVersion) context.drawImage(cleanVersion, 58, 458);
    featherArtwork(context, picture.width, picture.height, 10);
    pictures.set(original, picture);
    return picture;
  }

  function paintPortraitRim(context, original, width, height) {
    // Stretch only the original grain at the four edges. The source strips
    // stop outside the drawings, and the four corners keep their own pixels.
    const x = [0, 28, art.w-18, art.w], y = [0, 30, art.h-23, art.h];
    const edgesX = [0, 42, width-42, width], edgesY = [0, 40, height-40, height];
    const rim = document.createElement('canvas');
    rim.width = width;
    rim.height = height;
    const border = rim.getContext('2d');
    for (let row=0;row<3;row++) for (let col=0;col<3;col++) {
      if (row===1 && col===1) continue;
      border.drawImage(original,x[col],y[row],x[col+1]-x[col],y[row+1]-y[row],
        edgesX[col],edgesY[row],edgesX[col+1]-edgesX[col],edgesY[row+1]-edgesY[row]);
    }
    // Blend the inner edges with the matching parchment under the drawings.
    // The edge color itself comes from the original plate.
    const pixels = border.getImageData(0,0,width,height), bytes = pixels.data;
    for (let py=0;py<height;py++) {
      const vertical = Math.min(py,height-1-py)/40;
      for (let px=0;px<width;px++) {
        const horizontal = Math.min(px,width-1-px)/42;
        const position = 4*(py*width+px)+3;
        bytes[position] *= Math.max(0,Math.min(1,1.6*(1-Math.min(horizontal,vertical))));
      }
    }
    border.putImageData(pixels,0,0);
    context.drawImage(rim,0,0);
  }

  function portraitArtwork(original) {
    const previous = portraitPictures.get(original);
    if (previous) return previous;
    const {w, h} = portraitArt;
    const picture = document.createElement('canvas');
    picture.width = w;
    picture.height = h;
    const context = picture.getContext('2d');
    // Use the clear parchment between the two drawings. Both figures use a
    // uniform scale, with the orc above and to the right of the archer.
    context.drawImage(original, 276, 160, 101, 260, 0, 0, w, h);
    const fragment = document.createElement('canvas');
    for (const [sx, sy, sw, sh, x, y, scale] of [
      [280, 10, 360, 442, 112, 69, .8],
      [4, 166, 303, 314, 10, 315, .84],
    ]) {
      fragment.width = sw;
      fragment.height = sh;
      const ink = fragment.getContext('2d');
      ink.drawImage(original,sx,sy,sw,sh,0,0,sw,sh);
      featherArtwork(ink, sw, sh, 23);
      context.drawImage(fragment, x, y, sw*scale, sh*scale);
    }
    paintPortraitRim(context,original,w,h);
    featherArtwork(context,w,h,10);
    portraitPictures.set(original,picture);
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
  const factionInk = {
    human:[[252,248,240],[252,248,240],[156,156,156],[108,108,108]],
    orc:[[244,224,32],[208,192,28],[168,140,16],[92,48,0]],
  };

  function createModalBack(wine) {
    const arrows = {human:load('menu-back-human'), orc:load('menu-back-orc')};
    const confirmationArt = Object.fromEntries(['human','orc'].map(faction => [faction, {
      accept:load(faction + '-accept-button'), cancel:load(faction + '-cancel-back'),
    }]));
    const russian = language()?.current?.() === 'ru';
    let modalLabels, confirmationCopy;
    const font = window.WarcraftSessionText;
    font?.load(russian ? 'ru' : 'en').then(atlas => {
      const factionCaption = (caption,palette) => font.recolor(font.ink(caption,atlas),palette);
      modalLabels = Object.fromEntries(Object.entries(factionInk).map(([faction, palette]) =>
        [faction,{ok:factionCaption('OK',palette),
          restart:factionCaption(russian ? 'Начать заново' : 'Restart',palette),
          quit:factionCaption(russian ? 'Выйти в меню' : 'Quit to Menu',palette)}]));
      const plain = russian ? 'Вы уверены, что хотите' : 'Are you sure you want';
      const restart = russian ? 'начать миссию заново?' : 'restart the scenario?';
      const quit = russian ? 'главное меню?' : 'the main menu?';
      const warning = russian ? ['Прогресс миссии будет','перезаписан.'] :
        ['Mission progress will','be overwritten.'];
      const neutral = line => factionCaption(line,factionInk.human);
      const emphasis = line => factionCaption(line,factionInk.orc);
      confirmationCopy = {
        restart:{heading:[neutral(russian ? plain : plain+' to'),emphasis(restart)],
          warning:warning.map(line => factionCaption(line,font.warningInk))},
        quit:{heading:[neutral(plain),neutral(russian ? 'выйти в' : 'to quit to'),emphasis(quit)]},
      };
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
      const objectives = dialog.handlerAddress === 0x4353a0;
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
      const controls = (items, {skip, replace, captions} = {}) => items
        .filter(item => item.id!==skip)
        .map(item => {
          const accept = item.id === -2 || (objectives && item.id === -3);
          const blank = accept
            ? window.WarcraftAssemblyDialogLayout.acceptArtwork(faction,item.width)
            : item.width===224?art.button:item.width===106?art.shortButton:null;
          return {id:item.id,source:sourceOf(item),blank,accept,
            ...(item.id===replace||captions?.[item.id]
              ? {button:art.button,label:captions?.[item.id]||art.label} : null)};
        });

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
        const {accept:button, cancel} = confirmationArt[faction];
        if (!confirmationCopy || !modalLabels || !button.naturalWidth || !cancel.naturalWidth || buttons.size !== 2 ||
            accept?.left !== 16 || accept.top !== 108 || accept.width !== 224) return waiting;
        return {...previous, image:cancel, compact:'confirmation', controls:[], confirmation:{ok:sourceOf(accept),
          label:modalLabels[faction].ok, button, ...confirmationCopy[continuation===0x4359f0?'restart':'quit']}};
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
      if (pause) {
        if (!modalLabels || !art.button.naturalWidth) return waiting;
        const {restart,quit} = modalLabels[faction];
        return {compact:'pause', source:sourceOf(buttons.get(-3)), image:arrow,
          controls:controls([3,5,4,6].map(id=>buttons.get(id)),{captions:{4:restart,6:quit}})};
      }
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
    let resume = null, resumeTimer = 0, titleRoute = null;
    let scenarioPickerOpen = false, scenarioCloseTimer = 0;
    for (const locale of ['en', 'ru']) {
      window.WarcraftSessionText.load(locale).then(atlas => {
        sessionAtlases.set(locale, atlas);
        repaint();
      }).catch(console.error);
    }
    const images = Object.fromEntries(['orc-texture', 'title-version-clean', 'title-landscape-art', 'title-logo', 'title-button', 'title-button-pressed', 'menu-back-orc', 'menu-back-orc-pressed',
      'title-accept-button', 'title-accept-button-pressed',
      'label-options', 'label-fast-scenario',
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
    const sectionHeading = document.createElement('h2');
    sectionHeading.className = 'warcraft-menu-section-heading';
    sectionHeading.hidden = true;
    const downloadSize = document.createElement('p');
    downloadSize.className = 'warcraft-menu-section-heading';
    downloadSize.hidden = true;
    const updateNotice = document.createElement('p');
    updateNotice.className = 'warcraft-update-status';
    updateNotice.setAttribute('role', 'status');
    updateNotice.hidden = true;
    let updateBusy = false;

    async function checkForUpdate() {
      if (updateBusy) return;
      updateBusy = true;
      const messages = updateMessages[sessionArt.locale()];
      updateNotice.textContent = messages.checking;
      repaint();
      try {
        const result = await window.WarcraftGameUpdate.check();
        updateNotice.textContent = messages[result] || messages.failed;
      } catch {
        updateNotice.textContent = messages.failed;
      } finally {
        updateBusy = false;
        repaint();
      }
    }

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
          const status = await settings.status(item.language);
          const locale = sessionArt.locale();
          const size = new Intl.NumberFormat(locale, {maximumFractionDigits: 1}).format(status.bytes / 1_000_000);
          const sizeLabel = locale === 'ru' ? `Нужно ${size} МБ` : `${size} MB required`;
          languagePack = {id: item.language, ...status, sizeLabel};
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
          if (message.hidden) {
            message.hidden = false;
            repaint();
          }
        },
      }));
    }

    function closeSession() {
      window.clearTimeout(scenarioCloseTimer);
      scenarioCloseTimer = 0;
      scenarioPickerOpen = false;
      sessionPanel?.hide();
      layer.inert = false;
    }

    function showScenarioPicker(dialog, choose, back, retryId) {
      const scenarios = session?.native.scenarioChoices?.(dialog);
      if (!scenarios?.entries.length || !sessionPanel?.showScenarios) return false;
      scenarioPickerOpen = true;
      layer.inert = true;
      function finish(action, selectedId) {
        if (scenarioCloseTimer) return false;
        // The click is queued for the original dialog. Keep the picker over
        // the last native picture until the Fast setup has actually painted.
        scenarioCloseTimer = window.setTimeout(() => {
          scenarioCloseTimer = 0;
          if (selectedId !== undefined && !showScenarioPicker(dialog, choose, back, selectedId)) closeSession();
        }, 2500);
        if (action()) return true;
        window.clearTimeout(scenarioCloseTimer);
        scenarioCloseTimer = 0;
        return false;
      }
      sessionPanel.showScenarios({
        ...scenarios,
        selectedId: retryId ?? scenarios.selectedId,
        accept: entry => finish(() => session.native.selectScenario(entry.id,dialog) && choose(), entry.id),
        back: () => finish(back),
      }).catch(error => {
        closeSession();
        console.error(error);
      });
      return true;
    }

    function showSession(options) {
      layer.inert = true;
      sessionPanel.show(options).catch(error => {
        closeSession();
        console.error(error);
      });
    }

    function confirm(slot, start, back, continuing = false, ready) {
      const {text, slotLines} = sessionArt;
      const lines = slotLines(slot);
      if (!continuing && session.store.read().slot) lines.push({text:text('replace'),warning:true});
      showSession({
        heading:text(continuing ? 'resume' : 'newGame'),
        lines,
        accept:{title:text(continuing ? 'continue' : 'start'), ready, nativeClick:true, action() {
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
      if (scenarioPickerOpen) closeSession();
      clearTitleRoute();
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
      wine.playWarcraftMenuClick?.();
      confirm(slot, () => {
        session.native.armFast(slot);
        return start();
      },closeSession,false,session.native.fastSetupReady);
      return true;
    }

    function clearTitleRoute() {
      if (!titleRoute) return;
      window.clearTimeout(titleRoute.timer);
      titleRoute = null;
    }

    function beginTitleRoute(destination) {
      clearTitleRoute();
      titleRoute = {destination, sent:false, timer:window.setTimeout(() => {
        clearTitleRoute();
        repaint();
      },3000)};
    }

    function bridgeSinglePlayer() {
      if (resume) return;
      if (!titleRoute) beginTitleRoute(362);
      const route = titleRoute;
      if (route.sent) return;
      route.sent = true;
      window.requestAnimationFrame(() => {
        if (titleRoute !== route) return;
        const clearSilence = wine.silenceWarcraftMenuTransition?.();
        if (!activate(320,route.destination)) {
          clearSilence?.();
          route.sent = false;
        }
      });
    }

    function action(item) {
      if (!active || pending || titleRoute || resume || languageBusy || sessionPanel?.active) return;
      if (!item.checkUpdate && !updateBusy) updateNotice.textContent = '';
      if (item.checkUpdate) return checkForUpdate();
      if (item.resume) return startResume();
      if (item.destination) {
        if (!activate(320,254)) return;
        beginTitleRoute(item.destination);
        return;
      }
      if (item.files) return window.WarcraftFiles.open({session,showSession,back:closeSession});
      if (item.about) {
        const {intro,credits,community} = about[sessionArt.locale()];
        return showSession({heading:sessionArt.text('about'), lines:[originalVersion,intro,credits,community], back:closeSession, prose:true});
      }
      if (item.campaign && session) return showCampaign(item);
      if (item.soundOptions) {
        if (window.WarcraftAssemblyMenuPolicy?.requestSoundOptions(wine)) soundOptions = {opened:false};
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
      const cornerLabel = item.checkUpdate || item === feedbackItem;
      button.setAttribute('aria-label', cornerLabel ? sessionArt.text(item.caption) : item.label);
      if (item.checkUpdate) button.dataset.warcraftCheckUpdate = '';
      button.toggleAttribute('data-warcraft-native-click', !!item.destination || !!item.source && !item.campaign);
      button.addEventListener('pointerdown', () => { pressed = item.label; repaint(); });
      for (const event of ['pointerup', 'pointerleave', 'pointercancel']) {
        button.addEventListener(event, () => { pressed = null; repaint(); });
      }
      button.addEventListener('click', () => action(item));
      layer.append(button);
      return button;
    }

    function setButtons(items, boxes, home, preferredCampaign) {
      const labels = items.map(i => i.label).join('|');
      if (layer.dataset.buttons !== labels) {
        layer.replaceChildren(sectionHeading, downloadSize);
        buttons = items.map(makeButton);
        layer.append(message, updateNotice);
        layer.dataset.buttons = labels;
      }
      boxes.forEach((box, i) => {
        const {x, y, w, h} = box;
        Object.assign(buttons[i].style, {left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`});
        const item = items[i], control = buttons[i];
        control.disabled = pending || !!titleRoute || !!resume || languageBusy || !!item.disabled ||
          !!(item.checkUpdate && updateBusy) ||
          !!(item.language === 'ru' && !language()?.available?.('ru'));
        control.toggleAttribute('data-warcraft-default', home && i === 0 ||
          !!preferredCampaign && item.campaign === preferredCampaign);
        if (item.language) control.setAttribute('aria-pressed',
          String(item.language === (language()?.current?.() || 'en')));
      });
    }

    function place(width, height, count, {portrait, campaign, hasBack, hasHeading, hasPackSize, hasMessage, safeBottom, showLogo}) {
      const standardHeight = window.WarcraftAssemblyDialogLayout.menuButtonHeight(width,height);
      const gap = Math.min(!portrait&&count>4?5:8,standardHeight*.16);
      const corner = backBox(width, height);
      const back = {x:corner.x+corner.w-standardHeight,
        y:Math.min(corner.y+corner.h,height-safeBottom)-standardHeight,w:standardHeight,h:standardHeight};
      const artTop = Math.min(16, height * .025);
      const artLimit = portrait ? Math.min(height*.43,corner.y+corner.h-6*standardHeight-6*gap-artTop) : height*.94;
      const heroHeight = Math.min((width-16)*art.h/art.w,Math.max(1,artLimit));
      const pictureSource = portrait && showLogo ? portraitArt : art;
      const pictureLimit = portrait && showLogo ? height*.98 : heroHeight;
      const pictureScale = Math.min((width-16)/pictureSource.w,pictureLimit/pictureSource.h);
      const picture = {x:(width-pictureSource.w*pictureScale)/2,
        y:portrait&&!showLogo ? artTop : (height-pictureSource.h*pictureScale)/2,
        w:pictureSource.w*pictureScale,h:pictureSource.h*pictureScale};
      const sideRoom = !portrait && hasBack ? Math.max(24,2*(width-back.x+gap)) : portrait ? 28 : 24;
      const scale = Math.max(.1,Math.min(portrait?1.6:1.25,(width-sideRoom)/224,portrait?Infinity:height*.49/172));
      const w = 224*scale;
      const buttonBottom = (portrait && hasBack ? back.y : height-safeBottom)-gap;
      const messageRoom = hasMessage ? 28 : 0;
      const headingHeight = hasHeading ? Math.max(16,Math.min(27,19*scale)) : 0;
      const sizeHeight = hasPackSize ? Math.max(12, headingHeight*.75) : 0;
      const sectionRoom = headingHeight + (hasHeading ? gap : 0) + (hasPackSize ? sizeHeight + gap : 0);
      let logo = null;
      if (showLogo) {
        const image = images['title-logo'];
        const ratio = image.naturalWidth/image.naturalHeight;
        const rows = count + (campaign ? .84 : 0);
        const homeRows = Math.max(3,count);
        const homeTop = height-safeBottom-homeRows*(standardHeight+gap);
        const sectionTop = buttonBottom-messageRoom-rows*Math.min(standardHeight,count>4?40:44)-
          (count-1)*gap-sectionRoom;
        const logoBottom = hasHeading ? sectionTop : homeTop;
        const logoRoom = Math.max(hasHeading ? height*.12 : 0,logoBottom-artTop-gap);
        const logoWidth = portrait ? Math.min(width*.67,height*.36,326) :
          Math.min(width*.45,height*.64,326,logoRoom*ratio);
        if (logoWidth > 0) logo = {x:(width-logoWidth)/2,y:artTop,w:logoWidth,h:logoWidth/ratio};
      }
      const artEnd = artTop + heroHeight;
      const logoEnd = logo ? logo.y + logo.h : artTop;
      const panelTop = (portrait ? Math.max(artEnd,logoEnd) : logoEnd)+gap+sectionRoom;
      const panelBottom = buttonBottom-messageRoom;
      const rowUnits = count + (campaign ? .84 : 0);
      const rowGap = Math.min(gap,Math.max(1,(panelBottom-panelTop)/(count*6)));
      const h = Math.min(standardHeight,Math.max(1,(panelBottom-panelTop-(count-1)*rowGap)/rowUnits));
      const headingRoom = campaign ? h*.42 : 0;
      const span = count*h+(count-1)*rowGap+2*headingRoom;
      const centered = (Math.max(artEnd,logoEnd)+height-span+sectionRoom)/2;
      const top = (portrait ? Math.max(panelTop,Math.min(panelBottom-span,centered)) : panelBottom-span)+headingRoom;
      const boxes = Array.from({length:count},(_,i)=>({x:(width-w)/2,
        y:top+i*(h+rowGap)+(i>=2?headingRoom:0),w,h}));
      const heading = hasHeading ? {x:(width-w)/2,y:top-headingRoom-sectionRoom,w,h:headingHeight} : null;
      const packInfo = heading && hasPackSize ? {x:heading.x, y:heading.y+headingHeight+gap, w, h:sizeHeight} : null;
      return {picture, boxes, back, scale, logo, heading, packInfo};
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

    function captionInk(label) {
      const locale = sessionArt.locale(), id = locale + ':' + label;
      if (!sessionCaptions.has(id)) sessionCaptions.set(id,
        window.WarcraftSessionText.ink(label, sessionAtlases.get(locale)));
      return sessionCaptions.get(id);
    }

    function updateSectionCaption(element, label, box) {
      element.hidden = !box;
      if (!box) return;
      const glyph = captionInk(label);
      if (element.firstChild !== glyph) {
        element.setAttribute('aria-label', label);
        element.replaceChildren(glyph);
      }
      const {x,y,w,h} = box;
      Object.assign(element.style, {left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
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

    function drawButton(context, image, item, box, captionScale, home = false) {
      if (item.source && !item.glyph && !item.caption) {
        const blank = images[pressed === item.label ? 'title-button-pressed' : 'title-button'];
        // The web menu owns the highlight in the campaign chooser and Story.
        const ignoreNativeFocus = !!item.campaign || page === 'story';
        return window.WarcraftAssemblyDialogLayout.paintTallButton(context,image,item.source,box,blank,captionScale,false,
          !home&&!ignoreNativeFocus,false,ignoreNativeFocus);
      }
      const face = item.resume ? 'title-accept-button' : 'title-button';
      const base = images[pressed === item.label ? face+'-pressed' : face];
      drawImage(context, base, box);
      if (item.caption) {
        const glyph = captionInk(sessionArt.text(item.caption));
        const scale = Math.min(captionScale, box.w / (glyph.width + (item.checkUpdate ? 12 : 40)));
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
    function paint(context, image, backdrop, scene, width, height, foreground, leftInset=0, rightInset=0, bottomInset=8) {
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
        soundOptions = null;
        page = 'options';
      }
      const campaign = scene.mode === 'campaign';
      if (campaign || (scene.mode === 'title' && titleRoute?.destination === 362)) clearTitleRoute();
      if (scene.mode === 'single') bridgeSinglePlayer();
      const originals = campaign ? scene.controls.filter(control => !control.text).sort((a, b) => a.y - b.y) : [];
      if (campaign && originals.length !== 5) { hide(); return false; }
      const campaignLabels = ['Orc: Tides of Darkness', 'Human: Tides of Darkness',
        'Orc: Beyond the Dark Portal', 'Human: Beyond the Dark Portal'];
      const languageMenu = page.startsWith('language');
      const saved = session?.store.read();
      const titleItems = saved?.slot ? [continueItem,...title] : title;
      const options = page === 'options' && session
        ? [...optionPages.options, ...(window.WarcraftFiles ? [filesItem] : []), aboutItem] : optionPages[page];
      const items = campaign
        ? originals.slice(0, 4).map((source, i) => ({label: campaignLabels[i], source, campaign:campaignIds[i]}))
        : languageMenu ? languagePage() : options || titleItems;
      const home = !campaign && page === 'title';
      const cornerItem = scene.mode === 'title' && (
        home && window.WarcraftGameUpdate ? updateItem : session && page === 'options' ? feedbackItem : null);
      advanceResume(scene.mode, originals);
      const sectionTitle = sectionTitles[sessionArt.locale()][scene.mode === 'title' ? page : scene.mode];
      const packSize = page === 'language-download' ? languagePack?.sizeLabel : null;
      const hasBack = parentPage[page] || campaign;
      if (!images['orc-texture'].naturalWidth || !images['title-version-clean'].naturalWidth ||
          !images['title-button'].naturalWidth || !images['title-button-pressed'].naturalWidth ||
          (home && titleItems[0].resume &&
            (!images['title-accept-button'].naturalWidth || !images['title-accept-button-pressed'].naturalWidth)) ||
          items.some(item => item.glyph && !labelImage(item)?.naturalWidth) ||
          ((sectionTitle || cornerItem || items.some(item => item.caption)) && !sessionAtlases.has(sessionArt.locale())) ||
          (hasBack && (!images['menu-back-orc'].naturalWidth || !images['menu-back-orc-pressed'].naturalWidth))) {
        layer.hidden = true;
        return null;
      }
      const contentWidth = width - leftInset - rightInset;
      const portrait = width < height;
      if (!images['title-landscape-art'].complete || !images['title-logo'].complete) return null;
      const useSeparatedArt = !!images['title-landscape-art'].naturalWidth && !!images['title-logo'].naturalWidth;
      const {picture, boxes, back, scale, logo, heading, packInfo} = place(contentWidth,height,items.length,
        {portrait,campaign,hasBack,hasHeading:!!sectionTitle,hasPackSize:!!packSize,hasMessage:languageMenu&&!message.hidden,
          safeBottom:Math.max(8,bottomInset),showLogo:useSeparatedArt});
      let cornerBox;
      if (cornerItem) {
        const first = boxes[0];
        const room = logo ? contentWidth-logo.x-logo.w-22 : Infinity;
        const w = cornerItem.checkUpdate ? Math.min(108, Math.max(80, first.w*.32)) :
          Math.min(portrait?124:110,first.w*.38,Math.max(44,room));
        const y = room < (cornerItem.checkUpdate ? w : 44) ? logo.y+logo.h+6 : 12;
        const h = cornerItem.checkUpdate ? Math.min(44, first.h) : portrait?Math.min(first.h,w*.67):first.h;
        cornerBox = {x:leftInset+contentWidth-w-12,y,w,h};
      }
      picture.x += leftInset;
      if (logo) logo.x += leftInset;
      if (heading) heading.x += leftInset;
      if (packInfo) packInfo.x += leftInset;
      back.x += leftInset;
      for (const box of boxes) box.x += leftInset;
      active = true;
      layer.hidden = false;
      paintTexture(context, images['orc-texture'], width, height);
      const artwork = useSeparatedArt ? images['title-landscape-art'] : backdrop.canvas;
      if (useSeparatedArt && portrait) {
        drawImage(context,portraitArtwork(artwork),picture,portraitArt);
      } else {
        drawImage(context,softenedArtwork(artwork,useSeparatedArt ? null : images['title-version-clean']),picture,art);
      }
      if (logo) drawImage(context,images['title-logo'],logo);
      if (campaign) {
        const headings = scene.controls.filter(control => control.text).sort((a, b) => a.y - b.y);
        headings.forEach((source, i) => {
          const slot = boxes[i * 2];
          if (!slot) return;
          const nextButton = originals[i * 2];
          if (!nextButton) return;
          const trimmed = {...source, h: Math.min(source.h, nextButton.y - source.y - 2)};
          const captionScale = Math.min(scale,(slot.h*.42-2)/trimmed.h);
          const w = trimmed.w * captionScale, h = trimmed.h * captionScale;
          if (h > 0) foreground(image, {source: trimmed,
            target: {x: slot.x+(slot.w-w)/2, y: slot.y - h - 2, w, h}});
        });
      }
      if (languageMenu) {
        const last = boxes.at(-1);
        message.style.cssText = `position:absolute;left:${last.x}px;width:${last.w}px;` +
          `top:${last.y + last.h + 8}px;margin:0;text-align:center;color:#f4d343;font:14px/1.2 system-ui`;
      }
      items.forEach((item, i) => drawButton(context, image, item, boxes[i], scale, home));
      const controls = [...items];
      if (cornerItem) {
        controls.push(cornerItem);
        boxes.push(cornerBox);
        drawButton(context,image,cornerItem,cornerBox,scale);
      }
      updateNotice.toggleAttribute('hidden', cornerItem !== updateItem || !updateNotice.textContent);
      if (!updateNotice.hidden) {
        updateNotice.style.top = cornerBox.y + cornerBox.h + 5 + 'px';
        updateNotice.style.right = rightInset + 12 + 'px';
      }
      if (hasBack) {
        controls.push({label: 'Back', source: campaign ? originals[4] : null});
        boxes.push(back);
        const arrow = images[pressed === 'Back' ? 'menu-back-orc-pressed' : 'menu-back-orc'];
        drawImage(context, arrow, back);
      }
      presented = {picture, logo, controls, boxes, page, heading: heading && {label:sectionTitle,box:heading}};
      setButtons(controls, boxes, home, campaign ? saved?.lastCampaign ?? campaignIds[0] : null);
      layer.toggleAttribute('data-warcraft-menu-home', scene.mode === 'title' && home);
      updateSectionCaption(sectionHeading, sectionTitle, heading);
      updateSectionCaption(downloadSize, packSize, packInfo);
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
          const back = presented?.controls.findIndex(item => item.label === 'Back' || item.label === 'Cancel');
          buttons[back]?.click();
        }
      };
    }
    return {paint, hide, confirmFast, handleFastDialog, showScenarioPicker,
      get blocking() { return layer.inert; }, get active() { return active; }, get presented() { return presented; }, destroy() {
      clearTitleRoute();
      for (const [name, original] of keyHandlers) renderer[name] = original;
      clearPending();
      clearResume();
      window.clearTimeout(scenarioCloseTimer);
      sessionPanel?.destroy();
      layer.remove();
    }};
  }

  window.WarcraftAssemblyMenuNavigation = Object.freeze({create, createModalBack, paintTexture, backBox});
})();
