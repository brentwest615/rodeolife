'use strict';

/**
 * Data layer for RodeoLife.
 *
 * Schema (v1):
 *   {
 *     version: 1,
 *     events: { [id]: Event },
 *     eventOrder: string[]   // most-recent first
 *   }
 *
 * Event:
 *   {
 *     id: string (uuid),
 *     name: string,
 *     date: string (ISO date, optional),
 *     location: string (optional),
 *     status: 'draft' | 'running' | 'closed',
 *     created: number (ms),
 *     modified: number (ms),
 *     riders: { id, name, isHeader, isHeeler }[],
 *     teams: { id, header, heeler, conflict,
 *              r1, r1NoTime, r2, r2NoTime, shortGo, shortGoNoTime }[]
 *   }
 */

const STORAGE_KEY = 'rodeolife_v1';

const Store = (() => {
  let data = { version: 1, events: {}, eventOrder: [] };
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.events) data = parsed;
      }
    } catch (_) {
      // corrupted; reset
    }
    migrate();
  }

  function migrate() {
    // Convert legacy { headers, heelers } arrays to unified riders list.
    let dirty = false;
    for (const id of Object.keys(data.events)) {
      const evt = data.events[id];
      if (!evt.riders) {
        const headerSet = new Set((evt.headers || []).map(n => n.trim()).filter(Boolean));
        const heelerSet = new Set((evt.heelers || []).map(n => n.trim()).filter(Boolean));
        const all = new Set([...headerSet, ...heelerSet]);
        evt.riders = [...all].map(name => ({
          id: uuid(),
          name,
          isHeader: headerSet.has(name),
          isHeeler: heelerSet.has(name)
        }));
        delete evt.headers;
        delete evt.heelers;
        dirty = true;
      }
      // Backfill id + time fields onto teams drawn before live time entry existed.
      for (const t of evt.teams || []) {
        if (t.id === undefined) { t.id = uuid(); dirty = true; }
        for (const key of ['r1', 'r2', 'shortGo']) {
          if (t[key] === undefined) { t[key] = null; dirty = true; }
          if (t[key + 'NoTime'] === undefined) { t[key + 'NoTime'] = false; dirty = true; }
        }
      }
    }
    if (dirty) persist();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function notify() {
    listeners.forEach(fn => fn());
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'evt-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function listEvents() {
    return data.eventOrder.map(id => data.events[id]).filter(Boolean);
  }

  function getEvent(id) {
    return data.events[id] || null;
  }

  function createEvent({ name, date = '', location = '' }) {
    const now = Date.now();
    const id = uuid();
    data.events[id] = {
      id,
      name: name.trim() || 'Untitled Event',
      date,
      location,
      status: 'draft',
      created: now,
      modified: now,
      riders: [],
      teams: []
    };
    data.eventOrder.unshift(id);
    persist();
    notify();
    return id;
  }

  function updateEvent(id, patch) {
    const evt = data.events[id];
    if (!evt) return;
    Object.assign(evt, patch, { modified: Date.now() });
    persist();
    notify();
  }

  function addRider(id, { name, isHeader, isHeeler }) {
    const evt = data.events[id];
    if (!evt) return null;
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    if (evt.riders.some(r => r.name.toLowerCase() === trimmed.toLowerCase())) return null;
    const rider = { id: uuid(), name: trimmed, isHeader: !!isHeader, isHeeler: !!isHeeler };
    evt.riders.push(rider);
    evt.modified = Date.now();
    persist();
    notify();
    return rider.id;
  }

  function updateRider(eventId, riderId, patch) {
    const evt = data.events[eventId];
    if (!evt) return;
    const r = evt.riders.find(r => r.id === riderId);
    if (!r) return;
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (trimmed && !evt.riders.some(x => x.id !== riderId && x.name.toLowerCase() === trimmed.toLowerCase())) {
        r.name = trimmed;
      }
    }
    if (patch.isHeader !== undefined) r.isHeader = !!patch.isHeader;
    if (patch.isHeeler !== undefined) r.isHeeler = !!patch.isHeeler;
    evt.modified = Date.now();
    persist();
    notify();
  }

  function removeRider(eventId, riderId) {
    const evt = data.events[eventId];
    if (!evt) return;
    evt.riders = evt.riders.filter(r => r.id !== riderId);
    evt.modified = Date.now();
    persist();
    notify();
  }

  function generateDraw(id) {
    const evt = data.events[id];
    if (!evt) return;
    const headers = evt.riders.filter(r => r.isHeader).map(r => r.name);
    const heelers = evt.riders.filter(r => r.isHeeler).map(r => r.name);
    evt.teams = buildDraw(headers, heelers).map(t => ({
      ...t,
      id: uuid(),
      r1: null, r1NoTime: false,
      r2: null, r2NoTime: false,
      shortGo: null, shortGoNoTime: false
    }));
    if (evt.status === 'draft' && evt.teams.length > 0) evt.status = 'running';
    evt.modified = Date.now();
    persist();
    notify();
  }

  // Set one round's time for a team. `seconds` is a positive number or null
  // (cleared); `noTime` marks a real result (didn't catch) — mirrors the rodeo
  // scoring convention that a real time always outranks any no-time, but a
  // no-time is still a recorded result, not a blank.
  function setTeamTime(eventId, teamId, round, { seconds, noTime }) {
    const evt = data.events[eventId];
    if (!evt) return;
    const team = evt.teams.find(t => t.id === teamId);
    if (!team) return;
    const timeKey = round; // 'r1' | 'r2' | 'shortGo'
    const noTimeKey = round + 'NoTime';
    if (!(timeKey in team) || !(noTimeKey in team)) return;
    team[noTimeKey] = !!noTime;
    team[timeKey] = noTime ? null : (seconds != null && seconds > 0 ? seconds : null);
    evt.modified = Date.now();
    persist();
    notify();
  }

  // A team's total is the sum of its entered real times. `hasNoTime` flags any
  // no-time round so standings can sort real totals above partial/no-time ones,
  // per the same "real time beats no-time" rule used across every scoring view.
  function teamTotal(team) {
    const rounds = ['r1', 'r2', 'shortGo'];
    let sum = 0;
    let anyReal = false;
    let anyNoTime = false;
    for (const r of rounds) {
      if (team[r + 'NoTime']) anyNoTime = true;
      else if (team[r] != null) { sum += team[r]; anyReal = true; }
    }
    return { total: anyReal ? sum : null, hasNoTime: anyNoTime };
  }

  function setStatus(id, status) {
    updateEvent(id, { status });
  }

  function deleteEvent(id) {
    delete data.events[id];
    data.eventOrder = data.eventOrder.filter(x => x !== id);
    persist();
    notify();
  }

  function duplicateEvent(id) {
    const src = data.events[id];
    if (!src) return null;
    const newId = createEvent({
      name: src.name + ' (copy)',
      date: src.date,
      location: src.location
    });
    const copy = data.events[newId];
    copy.riders = src.riders.map(r => ({ ...r, id: uuid() }));
    copy.teams = []; // fresh draw on duplicate
    persist();
    notify();
    return newId;
  }

  load();

  return {
    subscribe,
    listEvents,
    getEvent,
    createEvent,
    updateEvent,
    addRider,
    updateRider,
    removeRider,
    generateDraw,
    setTeamTime,
    teamTotal,
    setStatus,
    deleteEvent,
    duplicateEvent
  };
})();
