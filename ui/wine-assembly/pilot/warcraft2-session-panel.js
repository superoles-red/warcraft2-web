/* Campaign list and session confirmation, drawn with BNE button and font assets. */
(() => {
  'use strict';
  const label = {
    en: {about:'About', files:'Files', feedback:'Feedback', campaign:'Campaign', continue:'Continue', start:'Start', newGame:'Start a new game?',
      resume:'Continue the last session?', replace:'Your previous session will be replaced.',
      mission:'Mission', locked:'Locked', completed:'Completed', fast:'Fast Scenario', back:'Back',
      failed:'The game could not start. The previous session is still available.'},
    ru: {about:'Об игре', files:'Файлы', feedback:'Отзыв', campaign:'Кампания', continue:'Продолжить', start:'Начать', newGame:'Начать новую игру?',
      resume:'Продолжить игру?', replace:'Предыдущая игра будет заменена.',
      mission:'Миссия', locked:'Закрыта', completed:'Пройдена', fast:'Быстрая игра', back:'Назад',
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
      function print(text, width, alignLeft = false) {
        const glyph = document.createElement('img');
        glyph.alt = '';
        glyph.draggable = false;
        glyph.src = window.WarcraftSessionText.ink(text,atlas,width,alignLeft).toDataURL();
        return glyph;
      }
      const title = document.createElement('h2');
      title.setAttribute('aria-label',heading);
      title.append(print(heading, accept ? 272 : 235));
      const content = document.createElement('div');
      content.className = 'warcraft-session-content';
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
      panel.classList.toggle('mission-list',list);
      panel.classList.toggle('session-confirmation',!!accept);
      panel.classList.toggle('session-prose',prose);
      layer.hidden = false;
      backAction = back;
      layer.setAttribute('aria-label',heading);
      content.scrollTop = 0;
      if (list) content.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
      else (choose || arrow).focus({preventScroll:true});
    }
    return Object.freeze({show, hide, get active(){return !layer.hidden;},
      back(){backAction?.();},destroy(){hide();layer.remove();}});
  }
  window.WarcraftSessionPanel = Object.freeze({create, text, locale, missionName, campaignName, slotName});
})();
