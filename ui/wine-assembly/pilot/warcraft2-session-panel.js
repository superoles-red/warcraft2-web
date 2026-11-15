/* Campaign list and session confirmation, drawn with BNE button and font assets. */
(() => {
  'use strict';
  const label = {
    en: {about:'About', files:'Files', feedback:'Feedback', campaign:'Campaign', continue:'Continue', start:'Start', newGame:'Start a new game?',
      resume:'Continue the last session?', replace:'Your previous session will be replaced.',
      selectScenario:'Select Scenario', mapSize:'Map size', anySize:'Any size', mapCategory:'Category',
      allCategories:'All categories', noScenarios:'No scenarios match these filters.',
      mapPreview:'Map preview', terrain:['Forest', 'Winter', 'Wasteland', 'Orc Swamps'],
      scenarioFailed:'Could not select this map.', ok:'OK', mission:'Mission', locked:'Locked', completed:'Completed', fast:'Fast Scenario', back:'Back',
      failed:'The game could not start. The previous session is still available.'},
    ru: {about:'Об игре', files:'Файлы', feedback:'Отзыв', campaign:'Кампания', continue:'Продолжить', start:'Начать', newGame:'Начать новую игру?',
      resume:'Продолжить игру?', replace:'Предыдущая игра будет заменена.',
      selectScenario:'Выбор сценария', mapSize:'Размер карты', anySize:'Любой размер', mapCategory:'Категория',
      allCategories:'Все категории', noScenarios:'Нет сценариев с такими фильтрами.',
      mapPreview:'Миниатюра карты', terrain:['Лес', 'Зима', 'Пустоши', 'Орочьи топи'],
      scenarioFailed:'Не удалось выбрать эту карту.', ok:'ОК', mission:'Миссия', locked:'Закрыта', completed:'Пройдена', fast:'Быстрая игра', back:'Назад',
      failed:'Не удалось запустить игру. Предыдущая сессия доступна.'},
  };
  const names = {
    en: {'orc-tod':'Orcs · Tides of Darkness', 'human-tod':'Humans · Tides of Darkness',
      'orc-btdp':'Orcs · Beyond the Dark Portal', 'human-btdp':'Humans · Beyond the Dark Portal'},
    ru: {'orc-tod':'Орки · Приливы Тьмы', 'human-tod':'Люди · Приливы Тьмы',
      'orc-btdp':'Орки · За Тёмным порталом', 'human-btdp':'Люди · За Тёмным порталом'},
  };
  const categoryLabels = {
    en: {builtin:'Built-in', bne:'Battle.net Edition', classic:'Classic', 'classic/expansion':'Expansion',
      'classic/scenario':'Classic scenarios', 'classic/expansion/scenario':'Expansion scenarios', ladder:'Ladder', scenario:'Scenarios'},
    ru: {builtin:'Встроенные', bne:'Battle.net Edition', classic:'Классика', 'classic/expansion':'Дополнение',
      'classic/scenario':'Сценарии классики', 'classic/expansion/scenario':'Сценарии дополнения', ladder:'Ладдер', scenario:'Сценарии'},
  };
  const locale = () => window.WarcraftLanguage?.current() === 'ru' ? 'ru' : 'en';
  const text = key => label[locale()][key];
  const missionName = (campaign, mission) =>
    window.WarcraftMissionNames?.[locale()]?.[campaign]?.[mission-1] || text('mission')+' '+mission;
  const campaignName = campaign => names[locale()][campaign];
  const slotName = slot => slot.kind === 'fast' ? [text('fast'), slot.name] :
    [campaignName(slot.campaign), missionName(slot.campaign,slot.mission)];
  let scenarioPreviews;

  function loadScenarioPreviews() {
    scenarioPreviews ??= fetch('./menu-art/scenario-previews.json').then(response => {
      if (!response.ok) throw new Error('Scenario previews are unavailable');
      return response.json();
    }).catch(() => {
      scenarioPreviews = null;
      return null;
    });
    return scenarioPreviews;
  }

  function caption(text, atlas, width, alignLeft = false) {
    const glyph = document.createElement('img');
    glyph.alt = '';
    glyph.draggable = false;
    glyph.src = window.WarcraftSessionText.ink(text,atlas,width,alignLeft).toDataURL();
    return glyph;
  }

  function scrollingContent({nativeScroll = false} = {}) {
    const content = document.createElement('div');
    content.className = 'warcraft-session-content';
    if (nativeScroll) return content;
    let touch = null, dragged = false;
    content.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      dragged = false;
      if (content.scrollHeight > content.clientHeight) {
        touch = {id:event.pointerId,y:event.clientY,top:content.scrollTop};
      }
    });
    content.addEventListener('pointermove', event => {
      if (event.pointerId !== touch?.id) return;
      const delta = event.clientY-touch.y;
      if (!dragged && Math.abs(delta)<6) return;
      if (!dragged) content.setPointerCapture(event.pointerId);
      dragged = true;
      content.scrollTop = touch.top-delta;
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      content.addEventListener(type, event => {
        if (type==='lostpointercapture' && event.target!==content) return;
        if (event.pointerId === touch?.id) touch = null;
      });
    }
    content.addEventListener('click', event => {
      if (dragged && event.detail) {
        event.preventDefault();
        event.stopPropagation();
      }
      dragged = false;
    }, true);
    return content;
  }

  function create(frame) {
    const layer = document.createElement('div');
    layer.className = 'warcraft-session-overlay';
    layer.dataset.winePageDialog = '';
    layer.hidden = true;
    layer.setAttribute('role','dialog');
    layer.setAttribute('aria-modal','true');
    const panel = document.createElement('div');
    panel.className = 'warcraft-session-panel';
    layer.append(panel);
    frame.append(layer);
    let token = 0, backAction;
    const scrollUpdates = new Map();
    const scrollObserver = new ResizeObserver(changes => {
      requestAnimationFrame(() => {
        for (const {target} of changes) scrollUpdates.get(target)?.();
      });
    });
    function clearScrollIndicators() {
      scrollObserver.disconnect();
      scrollUpdates.clear();
    }
    function scrollRegion(content, box = document.createElement('div')) {
      box.classList.add('warcraft-scroll-region');
      content.classList.add('warcraft-scroll-body');
      const track = document.createElement('span');
      const thumb = document.createElement('span');
      track.className = 'warcraft-scrollbar';
      track.setAttribute('aria-hidden', 'true');
      track.hidden = true;
      thumb.className = 'warcraft-scroll-thumb';
      track.append(thumb);
      box.append(content,track);
      function update() {
        const height = content.clientHeight;
        const max = content.scrollHeight - height;
        const scrollable = height > 0 && max > 1;
        box.classList.toggle('has-scrollbar',scrollable);
        track.hidden = !scrollable;
        if (!scrollable) return;
        const extent = track.clientHeight;
        const length = Math.min(extent,Math.max(18,extent*height/(height+max)));
        const progress = Math.max(0,Math.min(1,content.scrollTop/max));
        thumb.style.height = `${length}px`;
        thumb.style.transform = `translateY(${progress*(extent-length)}px)`;
      }
      scrollObserver.observe(content,{box:'border-box'});
      scrollUpdates.set(content,update);
      content.addEventListener('scroll',update,{passive:true});
      return box;
    }

    function hide() {
      token++;
      layer.hidden = true;
      clearScrollIndicators();
      panel.replaceChildren();
      backAction = null;
    }
    async function show({heading, lines=[], rows=[], accept, back, list = false, prose = false}) {
      const id = ++token;
      const current = locale();
      const atlas = await window.WarcraftSessionText.load(current);
      if (id !== token) return;
      const print = (text,width,alignLeft) => caption(text,atlas,width,alignLeft);
      const title = document.createElement('h2');
      title.setAttribute('aria-label',heading);
      title.append(print(heading, accept ? 272 : 235));
      const content = scrollingContent();
      const controls = document.createElement('div');
      controls.className = 'warcraft-session-footer';
      function printed(message,parent) {
        if (!message) return;
        const block = document.createElement('p');
        block.setAttribute('aria-label',message);
        const inkWidth = prose ? Math.max(190, Math.min(330, frame.clientWidth - 42)) : accept ? 254 : 225;
        block.append(print(message,inkWidth,prose));
        parent.append(block);
      }
      lines.forEach(line => printed(line,content));
      function button(caption, action, parent, {locked=false, completed=false, aria=caption} = {}) {
        const element = document.createElement('button');
        element.type = 'button';
        element.disabled = locked;
        element.className = 'warcraft-session-choice';
        element.setAttribute('aria-label',aria);
        element.append(print(caption,list?255:225));
        if (completed) element.dataset.completed = '';
        if(action)element.addEventListener('click',action,{once:!list});
        parent.append(element);
        return element;
      }
      for(const row of rows)button(row.title,row.action,content,row);
      const choose = accept && button(accept.title,() => {
        if (accept.action() === false && id === token) show({heading,lines:[...lines,text('failed')],rows,accept,back,list,prose});
      },controls);
      if (choose && accept.ready) {
        const updateReady = () => {
          if (id !== token) return;
          choose.disabled = !accept.ready();
          if (choose.disabled) requestAnimationFrame(updateReady);
        };
        updateReady();
      }
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = 'warcraft-session-back';
      arrow.setAttribute('aria-label',text('back'));
      arrow.addEventListener('click',back,{once:true});
      controls.append(arrow);
      clearScrollIndicators();
      panel.replaceChildren(title,list ? scrollRegion(content) : content,controls);
      panel.classList.remove('scenario-picker');
      panel.classList.toggle('mission-list',list);
      panel.classList.toggle('session-actions',!list&&rows.length>1);
      panel.classList.toggle('session-confirmation',!!accept);
      panel.classList.toggle('session-prose',prose);
      layer.hidden = false;
      backAction = back;
      layer.setAttribute('aria-label',heading);
      content.scrollTop = 0;
      if (list) content.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
      else (choose && !choose.disabled ? choose : arrow).focus({preventScroll:true});
    }
    async function showScenarios({entries, selectedId, accept, back}) {
      const id = ++token, language = locale(), labels = label[language];
      const atlas = await window.WarcraftSessionText.load(language);
      if (id !== token) return;
      const textWidth = Math.max(170, Math.min(400, frame.clientWidth - 48));
      const print = (text, width = textWidth) => caption(text, atlas, width);
      const makeButton = (name, onClick, width) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'warcraft-session-choice';
        button.setAttribute('aria-label', name);
        button.append(print(name, width));
        button.addEventListener('click', onClick);
        return button;
      };
      const heading = document.createElement('header');
      heading.className = 'warcraft-scenario-heading';
      const title = document.createElement('h2');
      title.setAttribute('aria-label', labels.selectScenario);
      title.append(print(labels.selectScenario));
      const filters = document.createElement('div');
      filters.className = 'warcraft-scenario-filters';
      heading.append(title, filters);

      clearScrollIndicators();
      const content = scrollingContent({nativeScroll:true});
      const list = scrollRegion(content);
      const details = document.createElement('div');
      details.className = 'warcraft-scenario-details';
      details.setAttribute('aria-live', 'polite');
      const card = document.createElement('div');
      card.className = 'warcraft-scenario-card';
      card.id = 'warcraft-scenario-card';
      const footer = document.createElement('div');
      footer.className = 'warcraft-session-footer';
      let size = null, category = null, openDropdown = null;
      let choice = entries.find(entry => entry.id === selectedId);
      let previews, currentCard;
      function showDetails(messages) {
        details.replaceChildren(...messages.map(message => {
          const row = document.createElement('p');
          row.setAttribute('aria-label', message);
          row.append(print(message));
          return row;
        }));
        details.hidden = !messages.length;
      }
      const choose = makeButton(labels.ok, () => {
        if (!choice || choose.disabled) return;
        choose.disabled = true;
        if (accept(choice) === false) {
          choose.disabled = false;
          showDetails([labels.scenarioFailed]);
        }
      });
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = 'warcraft-session-back';
      arrow.setAttribute('aria-label', labels.back);
      const goBack = () => {
        if (!openDropdown) back();
        else {
          const {toggle} = openDropdown;
          openFilter(null);
          toggle.focus({preventScroll:true});
        }
      };
      arrow.addEventListener('click', goBack);
      footer.append(choose, arrow);

      const rows = entries.map(entry => {
        const wrapper = document.createElement('div');
        wrapper.className = 'warcraft-scenario-row';
        const button = makeButton(entry.title, () => {
          choice = entry;
          openFilter(null);
          refresh();
          reveal(wrapper);
        });
        wrapper.append(button);
        return {entry, button, wrapper};
      });
      content.append(...rows.map(row => row.wrapper));
      const sizes = [null, ...[...new Set(entries.map(entry => entry.size).filter(Number.isInteger))].sort((a,b) => a-b)];
      const sizeText = value => value === null ? labels.anySize : `${value} x ${value}`;
      const localizedGroups = categoryLabels[language];
      const groups = new Set(entries.map(entry => entry.category).filter(Boolean));
      const knownGroups = Object.keys(localizedGroups).filter(group => groups.delete(group));
      const categories = [null, ...knownGroups, ...groups];
      const categoryText = value => value === null ? labels.allCategories :
        (Object.hasOwn(localizedGroups,value) ? localizedGroups[value] : value);
      const categoryFilter = makeFilter('category', labels.mapCategory, categories, categoryText, value => category = value);
      const sizeFilter = makeFilter('size', labels.mapSize, sizes, sizeText, value => size = value);

      function makeFilter(key, name, values, format, chooseValue) {
        const filter = document.createElement('div');
        filter.className = 'warcraft-scenario-filter';
        const menu = document.createElement('div');
        menu.className = 'warcraft-scenario-filter-options';
        menu.id = `warcraft-scenario-${key}`;
        menu.hidden = true;
        const toggle = makeButton(format(values[0]), () => openFilter(openDropdown === control ? null : control), 152);
        toggle.classList.add('warcraft-scenario-filter-toggle');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', menu.id);
        const options = values.map(value => ({value, button:makeButton(format(value), () => {
          chooseValue(value);
          refresh();
          content.scrollTop = 0;
          openFilter(null);
          toggle.focus({preventScroll:true});
        }, 152)}));
        const items = document.createElement('div');
        items.append(...options.map(option => option.button));
        scrollRegion(items,menu);
        filter.append(toggle, menu);
        filters.append(filter);
        let rendered;
        const control = {toggle, menu, update(value) {
          if (value === rendered) return;
          rendered = value;
          for (const option of options) option.button.setAttribute('aria-pressed', String(option.value === value));
          toggle.setAttribute('aria-label', `${name} – ${format(value)}`);
          toggle.replaceChildren(print(format(value), 152));
        }};
        return control;
      }
      function openFilter(next) {
        if (openDropdown) {
          openDropdown.menu.hidden = true;
          openDropdown.toggle.setAttribute('aria-expanded', 'false');
        }
        openDropdown = next;
        if (next) {
          next.menu.hidden = false;
          next.toggle.setAttribute('aria-expanded', 'true');
          scrollUpdates.get(next.menu.querySelector('.warcraft-scroll-body'))?.();
        }
      }
      function reveal(wrapper, alignStart = false) {
        const viewport = content.getBoundingClientRect(), row = wrapper.getBoundingClientRect();
        if (alignStart || row.height >= viewport.height || row.top < viewport.top) {
          content.scrollTop += row.top - viewport.top;
        } else if (row.bottom > viewport.bottom) {
          content.scrollTop += row.bottom - viewport.bottom;
        }
      }

      function printCard(entry) {
        const info = previews?.maps[entry.id];
        const players = entry.players;
        const playerLabel = language === 'ru' ? (players === 1 ? 'игрок' : players < 5 ? 'игрока' : 'игроков') :
          (players === 1 ? 'player' : 'players');
        const copy = document.createElement('div');
        copy.className = 'warcraft-scenario-card-copy';
        const description = entry.description || info?.[2];
        const lines = [
          `${sizeText(entry.size)} · ${players} ${playerLabel}`,
          info && labels.terrain[info[0]],
          description?.trim().toLowerCase() !== entry.title.trim().toLowerCase() &&
            !/^\d+ players?$/i.test(description) && description,
        ].filter(Boolean);
        const copyWidth = Math.max(130, Math.min(280, panel.clientWidth - 150));
        for (const message of lines) {
          const line = document.createElement('p');
          line.setAttribute('aria-label', message);
          line.append(caption(message, atlas, copyWidth, true));
          copy.append(line);
        }
        const parts = [];
        if (info) {
          const [era, slot] = info, {columns, rows} = previews;
          const height = rows[era];
          const thumbnail = document.createElement('span');
          thumbnail.className = 'warcraft-scenario-thumbnail';
          thumbnail.setAttribute('role', 'img');
          thumbnail.setAttribute('aria-label', `${labels.mapPreview} – ${entry.title}`);
          thumbnail.style.backgroundImage = `url("./menu-art/scenario-preview-${era}.webp")`;
          thumbnail.style.backgroundSize = `${columns * 100}% ${height * 100}%`;
          thumbnail.style.backgroundPosition = `${100 * (slot % columns) / (columns - 1)}% ${100 * Math.floor(slot / columns) / Math.max(1, height - 1)}%`;
          parts.push(thumbnail);
        }
        card.replaceChildren(...parts, copy);
      }

      function refresh() {
        const matches = entry => (size === null || entry.size === size) && (category === null || entry.category === category);
        const selected = choice && matches(choice) ? choice : null;
        let matching = 0;
        for (const {entry,button,wrapper} of rows) {
          const hidden = !matches(entry);
          if (wrapper.hidden !== hidden) wrapper.hidden = hidden;
          if (!hidden) matching++;
          const expanded = entry === selected;
          if (button.getAttribute('aria-expanded') !== String(expanded)) {
            button.setAttribute('aria-pressed', String(expanded));
            button.setAttribute('aria-expanded', String(expanded));
            if (expanded) button.setAttribute('aria-controls', card.id);
            else button.removeAttribute('aria-controls');
          }
          if (expanded && currentCard !== entry) {
            wrapper.append(card);
            printCard(entry);
          }
        }
        currentCard = selected;
        if (!selected) card.remove();
        sizeFilter.update(size);
        categoryFilter.update(category);
        choose.disabled = !selected;
        showDetails(matching ? [] : [labels.noScenarios]);
        scrollUpdates.get(content)?.();
      }

      panel.classList.remove('mission-list','session-actions','session-confirmation','session-prose');
      panel.classList.add('scenario-picker');
      panel.replaceChildren(heading, list, details, footer);
      layer.hidden = false;
      refresh();
      layer.setAttribute('aria-label', labels.selectScenario);
      backAction = goBack;
      const selected = rows.find(row => row.entry === choice);
      if (selected) reveal(selected.wrapper, true);
      (selected?.button || rows[0]?.button || arrow).focus({preventScroll:true});
      const updateScrollbar = scrollUpdates.get(content);
      let listWidth = content.clientWidth;
      scrollUpdates.set(content, () => {
        updateScrollbar();
        if (listWidth !== content.clientWidth) {
          listWidth = content.clientWidth;
          if (currentCard) reveal(card.parentElement);
        }
      });
      void loadScenarioPreviews().then(index => {
        if (id !== token || !index) return;
        previews = index;
        if (currentCard) {
          printCard(currentCard);
          reveal(card.parentElement);
        }
        scrollUpdates.get(content)?.();
      });
    }
    return Object.freeze({show, showScenarios, hide, get active(){return !layer.hidden;},
      back(){backAction?.();},destroy(){hide();layer.remove();}});
  }
  window.WarcraftSessionPanel = Object.freeze({create, text, locale, missionName, campaignName, slotName});
})();
