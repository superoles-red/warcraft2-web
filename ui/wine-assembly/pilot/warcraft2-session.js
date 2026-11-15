/* One Continue slot and independent campaign unlocks. */
(function (global) {
  'use strict';
  const key = 'wc2-session-v1';
  const campaigns = Object.freeze({
    'human-tod':14, 'orc-tod':14, 'human-btdp':12, 'orc-btdp':12,
  });
  const validCampaign = id => typeof id === 'string' && Object.hasOwn(campaigns, id);
  const validMission = (campaign, mission) => validCampaign(campaign) &&
    Number.isInteger(mission) && mission >= 1 && mission <= campaigns[campaign];
  function normalizeSlot(value) {
    if (value?.kind === 'campaign' && validMission(value.campaign, value.mission)) {
      return {kind:'campaign', campaign:value.campaign, mission:value.mission};
    }
    if (value?.kind === 'fast' && value.scenario && typeof value.scenario === 'object' &&
        !Array.isArray(value.scenario) && typeof value.name === 'string' && value.name.length <= 254) {
      const scenario = JSON.stringify(value.scenario);
      if (scenario.length <= 8192) return {kind:'fast', scenario:JSON.parse(scenario), name:value.name};
    }
    return null;
  }
  function normalize(value) {
    const completed = Object.fromEntries(Object.keys(campaigns).map(id => {
      const missions = value?.completed?.[id];
      return [id, Array.isArray(missions) ? [...new Set(missions.filter(m => validMission(id,m)))].sort((a,b) => a - b) : []];
    }));
    const slot = normalizeSlot(value?.slot);
    const lastCampaign = validCampaign(value?.lastCampaign) ? value.lastCampaign :
      slot?.kind === 'campaign' ? slot.campaign : null;
    return lastCampaign ? {completed, slot, lastCampaign} : {completed, slot};
  }
  function create(storage) {
    let current;
    function read() {
      try { current = normalize(JSON.parse(storage.getItem(key))); }
      catch (_) { current ??= normalize(null); }
      return current;
    }
    function write(state) {
      try {
        storage.setItem(key, JSON.stringify(state));
        current = state;
        return true;
      } catch (error) {
        console.warn('Warcraft II session could not be saved', error);
        return false;
      }
    }
    function canStart(campaign, mission) {
      if (!validMission(campaign, mission)) return false;
      return mission <= (read().completed[campaign].at(-1) ?? 0) + 1;
    }
    function start(value) {
      const slot = normalizeSlot(value);
      if (!slot || (slot.kind === 'campaign' && !canStart(slot.campaign, slot.mission))) return false;
      const state = {...read(), slot};
      if (slot.kind === 'campaign') state.lastCampaign = slot.campaign;
      return write(state);
    }
    function win({campaign, mission}) {
      if (!validMission(campaign, mission)) return false;
      const state = read();
      if (state.slot?.kind !== 'campaign' || state.slot.campaign !== campaign || state.slot.mission !== mission) return false;
      const completed = state.completed[campaign];
      if (!completed.includes(mission)) completed.push(mission);
      state.slot = validMission(campaign, mission + 1) ? {kind:'campaign', campaign, mission:mission + 1} : null;
      return write(state);
    }
    function lose(value) {
      const slot = normalizeSlot(value);
      const state = read();
      if (!slot || JSON.stringify(state.slot) !== JSON.stringify(slot)) return false;
      return write({...state, slot:null});
    }
    function importProgress(state) {
      return write(normalize({...state, lastCampaign:read().lastCampaign}));
    }
    return Object.freeze({read, canStart, start, win, lose, importProgress});
  }
  const api = Object.freeze({create, campaigns, normalizeSlot});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftSession = api;
})(globalThis);
