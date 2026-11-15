/* Campaign list and session confirmation, drawn with BNE button and font assets. */
(() => {
  'use strict';
  const label = {
    en: {about:'About', files:'Files', feedback:'Feedback', campaign:'Campaign', continue:'Continue', start:'Start', newGame:'Start a new game?',
      resume:'Continue the last session?', replace:'Your previous session will be replaced.',
      selectScenario:'Select Scenario', mapSize:'Map size', anySize:'Any size', noScenarios:'No scenarios available.',
      scenarioFailed:'Could not select this map.', ok:'OK', mission:'Mission', locked:'Locked', completed:'Completed', fast:'Fast Scenario', back:'Back',
      failed:'The game could not start. The previous session is still available.'},
    ru: {about:'Об игре', files:'Файлы', feedback:'Отзыв', campaign:'Кампания', continue:'Продолжить', start:'Начать', newGame:'Начать новую игру?',
      resume:'Продолжить игру?', replace:'Предыдущая игра будет заменена.',
      selectScenario:'Выбор сценария', mapSize:'Размер карты', anySize:'Любой размер', noScenarios:'Нет доступных сценариев.',
      scenarioFailed:'Не удалось выбрать эту карту.', ok:'ОК', mission:'Миссия', locked:'Закрыта', completed:'Пройдена', fast:'Быстрая игра', back:'Назад',
      failed:'Не удалось запустить игру. Предыдущая сессия доступна.'},
  };
  const names = {
    en: {'orc-tod':'Orcs · Tides of Darkness', 'human-tod':'Humans · Tides of Darkness',
      'orc-btdp':'Orcs · Beyond the Dark Portal', 'human-btdp':'Humans · Beyond the Dark Portal'},
    ru: {'orc-tod':'Орки · Приливы Тьмы', 'human-tod':'Люди · Приливы Тьмы',
      'orc-btdp':'Орки · За Тёмным порталом', 'human-btdp':'Люди · За Тёмным порталом'},
  };
  const locale = () => window.WarcraftLanguage?.current() === 'ru' ? 'ru' : 'en';
  const text = key => label[locale()][key];
  const missionName = (campaign, mission) =>
    window.WarcraftMissionNames?.[locale()]?.[campaign]?.[mission-1] || text('mission')+' '+mission;
  const campaignName = campaign => names[locale()][campaign];
  const slotName = slot => slot.kind === 'fast' ? [text('fast'), slot.name] :
    [campaignName(slot.campaign), missionName(slot.campaign,slot.mission)];

  function caption(text, atlas, width, alignLeft = false) {
    const glyph = document.createElement('img');
    glyph.alt = '';
    glyph.draggable = false;
    glyph.src = window.WarcraftSessionText.ink(text,atlas,width,alignLeft).toDataURL();
    return glyph;
  }

  function scrollingContent() {
    const content = document.createElement('div');
    content.className = 'warcraft-session-content';
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
    function hide() {
      token++;
      layer.hidden = true;
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
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = 'warcraft-session-back';
      arrow.setAttribute('aria-label',text('back'));
      arrow.addEventListener('click',back,{once:true});
      controls.append(arrow);
      panel.replaceChildren(title,content,controls);
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
      else (choose || arrow).focus({preventScroll:true});
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
      const filter = document.createElement('div');
      filter.className = 'warcraft-scenario-filter';
      const choices = document.createElement('div');
      choices.className = 'warcraft-scenario-sizes';
      choices.hidden = true;
      const toggle = makeButton(labels.anySize, () => openFilter(choices.hidden), 160);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'warcraft-scenario-sizes');
      choices.id = 'warcraft-scenario-sizes';
      filter.append(toggle, choices);
      heading.append(title, filter);

      const content = scrollingContent();
      const details = document.createElement('div');
      details.className = 'warcraft-scenario-details';
      details.setAttribute('aria-live', 'polite');
      const footer = document.createElement('div');
      footer.className = 'warcraft-session-footer';
      let size = null, choice = entries.find(entry => entry.id === selectedId);
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
        if (choices.hidden) back();
        else { openFilter(false); toggle.focus({preventScroll:true}); }
      };
      arrow.addEventListener('click', goBack);
      footer.append(choose, arrow);

      const rows = entries.map(entry => ({entry, button:makeButton(entry.title, () => {
        choice = entry;
        refresh();
      })}));
      content.append(...rows.map(row => row.button));
      const sizes = [null, ...[...new Set(entries.map(entry => entry.size).filter(Number.isInteger))].sort((a,b) => a-b)];
      const sizeText = value => value === null ? labels.anySize : `${value} x ${value}`;
      const options = sizes.map(value => ({value, button:makeButton(sizeText(value), () => {
        size = value;
        refresh();
        content.scrollTop = 0;
        openFilter(false);
        toggle.focus({preventScroll:true});
      }, 160)}));
      choices.append(...options.map(option => option.button));
      function openFilter(open) {
        choices.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
      }
      function refresh() {
        for (const {entry,button} of rows) {
          button.hidden = size !== null && entry.size !== size;
          button.setAttribute('aria-pressed', String(entry === choice));
        }
        for (const {value,button} of options) button.setAttribute('aria-pressed', String(value === size));
        const sizeCaption = sizeText(size);
        toggle.setAttribute('aria-label', `${labels.mapSize} – ${sizeCaption}`);
        toggle.replaceChildren(print(sizeCaption, 160));
        const selected = choice && (size === null || choice.size === size) && choice;
        choose.disabled = !selected;
        const players = selected?.players;
        const metadata = [selected?.size && sizeText(selected.size), players && (language === 'ru'
          ? `${players} ${players === 1 ? 'игрок' : players < 5 ? 'игрока' : 'игроков'}`
          : `${players} ${players === 1 ? 'player' : 'players'}`)].filter(Boolean).join(' · ');
        showDetails(entries.length ? [metadata, selected?.description].filter(Boolean) : [labels.noScenarios]);
      }

      panel.classList.remove('mission-list','session-actions','session-confirmation','session-prose');
      panel.classList.add('scenario-picker');
      panel.replaceChildren(heading, content, details, footer);
      refresh();
      layer.hidden = false;
      layer.setAttribute('aria-label', labels.selectScenario);
      backAction = goBack;
      const selected = rows.find(row => row.entry === choice)?.button;
      if (selected) content.scrollTop = selected.offsetTop - content.offsetTop;
      (selected || rows[0]?.button || arrow).focus({preventScroll:true});
    }
    return Object.freeze({show, showScenarios, hide, get active(){return !layer.hidden;},
      back(){backAction?.();},destroy(){hide();layer.remove();}});
  }
  window.WarcraftSessionPanel = Object.freeze({create, text, locale, missionName, campaignName, slotName});
})();
