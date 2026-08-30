'use strict';

/**
 * Data layer for RodeoLife.
 *
 * Schema (v2) — a Rodeo (one event day) holds multiple Classes (one per
 * discipline run that day: Team Roping, Barrel Racing, Goat Tying, etc.):
 *   {
 *     version: 2,
 *     rodeos: { [id]: Rodeo },
 *     rodeoOrder: string[]   // most-recent first
 *   }
 *
 * Rodeo:
 *   {
 *     id, name, date, location,
 *     status: 'draft' | 'running' | 'closed',
 *     created, modified,
 *     classes: Class[]
 *   }
 *
 * Class — a specific discipline at this rodeo:
 *   {
 *     id, name,               // producer label, e.g. "1D Roping", "Open Barrels"
 *     discipline,             // see disciplines.js DISCIPLINES
 *     // team_roping ONLY:
 *     riders: { id, name, isHeader, isHeeler }[],
 *     teams: { id, header, heeler, conflict,
 *              r1, r1NoTime, r2, r2NoTime, shortGo, shortGoNoTime }[],
 *     // every OTHER discipline: a flat contestant list, each carrying its own
 *     // times directly (same round fields as a team — no separate runs table,
 *     // so there's nothing to orphan if a contestant is removed):
 *     contestants: { id, name, back,
 *                    r1, r1NoTime, r2, r2NoTime, shortGo, shortGoNoTime }[]
 *   }
 *
 * v1 (pre-Class) shape, migrated automatically on load:
 *   { version: 1, events: { [id]: Event }, eventOrder: string[] }
 *   Event had riders/teams directly on it (always team-roping). Each becomes
 *   a Rodeo with exactly one Class: { discipline: 'team_roping', ... }.
 */

const STORAGE_KEY = 'rodeolife_v1';

const Store = (() => {
  let data = { version: 2, rodeos: {}, rodeoOrder: [] };
  const listeners = new Set();

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.events || parsed.rodeos)) data = parsed;
      }
    } catch (_) {
      // corrupted; reset
    }
    migrate();
  }

  function emptyTimeFields() {
    return {
      r1: null, r1NoTime: false,
      r2: null, r2NoTime: false,
      shortGo: null, shortGoNoTime: false
    };
  }

  function migrate() {
    let dirty = false;

    // v1 -> v2: wrap each old riders/teams Event into a Rodeo with one
    // team_roping Class, preserving every id already assigned.
    if (!data.version || data.version < 2) {
      const rodeos = {};
      const rodeoOrder = data.eventOrder || [];
      for (const id of Object.keys(data.events || {})) {
        const evt = data.events[id];
        rodeos[id] = {
          id: evt.id,
          name: evt.name,
          date: evt.date,
          location: evt.location,
          status: evt.status,
          created: evt.created,
          modified: evt.modified,
          classes: [{
            id: uuid(),
            name: 'Team Roping',
            discipline: 'team_roping',
            riders: evt.riders || [],
            teams: evt.teams || [],
            contestants: []
          }]
        };
      }
      data = { version: 2, rodeos, rodeoOrder };
      dirty = true;
    }

    // Legacy pre-riders Event shape (headers/heelers arrays) — only ever seen
    // inside a v1 Event, so migrate it on the now-wrapped team_roping class.
    for (const id of Object.keys(data.rodeos)) {
      const rodeo = data.rodeos[id];
      for (const cls of rodeo.classes || []) {
        if (isTeamDiscipline(cls.discipline) && !cls.riders) {
          const headerSet = new Set((cls.headers || []).map(n => n.trim()).filter(Boolean));
          const heelerSet = new Set((cls.heelers || []).map(n => n.trim()).filter(Boolean));
          const all = new Set([...headerSet, ...heelerSet]);
          cls.riders = [...all].map(name => ({
            id: uuid(), name,
            isHeader: headerSet.has(name), isHeeler: heelerSet.has(name)
          }));
          delete cls.headers;
          delete cls.heelers;
          dirty = true;
        }
        if (!cls.contestants) { cls.contestants = []; dirty = true; }
        // Backfill id + time fields onto teams/contestants from before live
        // time entry (or before the Rodeo/Class split) existed.
        for (const t of (cls.teams || []).concat(cls.contestants || [])) {
          if (t.id === undefined) { t.id = uuid(); dirty = true; }
          for (const key of ['r1', 'r2', 'shortGo']) {
            if (t[key] === undefined) { t[key] = null; dirty = true; }
            if (t[key + 'NoTime'] === undefined) { t[key + 'NoTime'] = false; dirty = true; }
          }
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

  // ─── Rodeos ─────────────────────────────────────────────────────────────

  function listRodeos() {
    return data.rodeoOrder.map(id => data.rodeos[id]).filter(Boolean);
  }

  function getRodeo(id) {
    return data.rodeos[id] || null;
  }

  function createRodeo({ name, date = '', location = '' }) {
    const now = Date.now();
    const id = uuid();
    data.rodeos[id] = {
      id,
      name: name.trim() || 'Untitled Rodeo',
      date,
      location,
      status: 'draft',
      created: now,
      modified: now,
      classes: []
    };
    data.rodeoOrder.unshift(id);
    persist();
    notify();
    return id;
  }

  function updateRodeo(id, patch) {
    const rodeo = data.rodeos[id];
    if (!rodeo) return;
    Object.assign(rodeo, patch, { modified: Date.now() });
    persist();
    notify();
  }

  function setStatus(id, status) {
    updateRodeo(id, { status });
  }

  function deleteRodeo(id) {
    delete data.rodeos[id];
    data.rodeoOrder = data.rodeoOrder.filter(x => x !== id);
    persist();
    notify();
  }

  function duplicateRodeo(id) {
    const src = data.rodeos[id];
    if (!src) return null;
    const newId = createRodeo({ name: src.name + ' (copy)', date: src.date, location: src.location });
    const copy = data.rodeos[newId];
    // Copy each class's sign-up list with fresh ids; times/draw are wiped —
    // same "fresh draw on duplicate" behavior as before the Rodeo/Class split.
    copy.classes = (src.classes || []).map(cls => ({
      id: uuid(),
      name: cls.name,
      discipline: cls.discipline,
      riders: (cls.riders || []).map(r => ({ ...r, id: uuid() })),
      teams: [],
      contestants: (cls.contestants || []).map(c => ({ ...c, id: uuid(), ...emptyTimeFields() }))
    }));
    persist();
    notify();
    return newId;
  }

  // ─── Classes ────────────────────────────────────────────────────────────

  function getClass(rodeoId, classId) {
    const rodeo = data.rodeos[rodeoId];
    if (!rodeo) return null;
    return (rodeo.classes || []).find(c => c.id === classId) || null;
  }

  function createClass(rodeoId, { name, discipline }) {
    const rodeo = data.rodeos[rodeoId];
    if (!rodeo) return null;
    const id = uuid();
    rodeo.classes.push({
      id,
      name: (name || '').trim() || disciplineLabel(discipline),
      discipline,
      riders: [],
      teams: [],
      contestants: []
    });
    rodeo.modified = Date.now();
    persist();
    notify();
    return id;
  }

  function updateClass(rodeoId, classId, patch) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return;
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (trimmed) cls.name = trimmed;
    }
    touch(rodeoId);
  }

  function deleteClass(rodeoId, classId) {
    const rodeo = data.rodeos[rodeoId];
    if (!rodeo) return;
    rodeo.classes = rodeo.classes.filter(c => c.id !== classId);
    rodeo.modified = Date.now();
    persist();
    notify();
  }

  // ─── Riders (team_roping classes only) ─────────────────────────────────

  function addRider(rodeoId, classId, { name, isHeader, isHeeler }) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return null;
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    if (cls.riders.some(r => r.name.toLowerCase() === trimmed.toLowerCase())) return null;
    const rider = { id: uuid(), name: trimmed, isHeader: !!isHeader, isHeeler: !!isHeeler };
    cls.riders.push(rider);
    touch(rodeoId);
    return rider.id;
  }

  function updateRider(rodeoId, classId, riderId, patch) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return;
    const r = cls.riders.find(r => r.id === riderId);
    if (!r) return;
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (trimmed && !cls.riders.some(x => x.id !== riderId && x.name.toLowerCase() === trimmed.toLowerCase())) {
        r.name = trimmed;
      }
    }
    if (patch.isHeader !== undefined) r.isHeader = !!patch.isHeader;
    if (patch.isHeeler !== undefined) r.isHeeler = !!patch.isHeeler;
    touch(rodeoId);
  }

  function removeRider(rodeoId, classId, riderId) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return;
    cls.riders = cls.riders.filter(r => r.id !== riderId);
    touch(rodeoId);
  }

  function generateDraw(rodeoId, classId) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return;
    const headers = cls.riders.filter(r => r.isHeader).map(r => r.name);
    const heelers = cls.riders.filter(r => r.isHeeler).map(r => r.name);
    cls.teams = buildDraw(headers, heelers).map(t => ({ ...t, id: uuid(), ...emptyTimeFields() }));
    const rodeo = data.rodeos[rodeoId];
    if (rodeo && rodeo.status === 'draft' && cls.teams.length > 0) rodeo.status = 'running';
    touch(rodeoId);
  }

  // ─── Contestants (every non-team_roping class) ─────────────────────────

  function addContestant(rodeoId, classId, { name, back }) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return null;
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    if (cls.contestants.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return null;
    const contestant = { id: uuid(), name: trimmed, back: (back || '').trim(), ...emptyTimeFields() };
    cls.contestants.push(contestant);
    const rodeo = data.rodeos[rodeoId];
    if (rodeo && rodeo.status === 'draft') rodeo.status = 'running';
    touch(rodeoId);
    return contestant.id;
  }

  function updateContestant(rodeoId, classId, contestantId, patch) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return;
    const c = cls.contestants.find(c => c.id === contestantId);
    if (!c) return;
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (trimmed && !cls.contestants.some(x => x.id !== contestantId && x.name.toLowerCase() === trimmed.toLowerCase())) {
        c.name = trimmed;
      }
    }
    if (patch.back !== undefined) c.back = patch.back.trim();
    touch(rodeoId);
  }

  function removeContestant(rodeoId, classId, contestantId) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return;
    cls.contestants = cls.contestants.filter(c => c.id !== contestantId);
    touch(rodeoId);
  }

  // ─── Times (teams and contestants share the same round fields, so one
  //     setter works for both — the entry id is a UUID, effectively unique
  //     across the two lists) ────────────────────────────────────────────

  function setEntryTime(rodeoId, classId, entryId, round, { seconds, noTime }) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return;
    const entry = (cls.teams || []).find(e => e.id === entryId) ||
                  (cls.contestants || []).find(e => e.id === entryId);
    if (!entry) return;
    const timeKey = round; // 'r1' | 'r2' | 'shortGo'
    const noTimeKey = round + 'NoTime';
    if (!(timeKey in entry) || !(noTimeKey in entry)) return;
    entry[noTimeKey] = !!noTime;
    entry[timeKey] = noTime ? null : (seconds != null && seconds > 0 ? seconds : null);
    touch(rodeoId);
  }

  // An entry's total is the sum of its entered real times. `hasNoTime` flags
  // any no-time round so standings can sort real totals above partial/no-time
  // ones — the same "real time beats no-time" rule used across every scoring
  // view. Works on a team OR a contestant; both carry the same round fields.
  function entryTotal(entry) {
    const rounds = ['r1', 'r2', 'shortGo'];
    let sum = 0;
    let anyReal = false;
    let anyNoTime = false;
    for (const r of rounds) {
      if (entry[r + 'NoTime']) anyNoTime = true;
      else if (entry[r] != null) { sum += entry[r]; anyReal = true; }
    }
    return { total: anyReal ? sum : null, hasNoTime: anyNoTime };
  }

  function touch(rodeoId) {
    const rodeo = data.rodeos[rodeoId];
    if (rodeo) rodeo.modified = Date.now();
    persist();
    notify();
  }

  load();

  return {
    subscribe,
    listRodeos,
    getRodeo,
    createRodeo,
    updateRodeo,
    setStatus,
    deleteRodeo,
    duplicateRodeo,
    getClass,
    createClass,
    updateClass,
    deleteClass,
    addRider,
    updateRider,
    removeRider,
    generateDraw,
    addContestant,
    updateContestant,
    removeContestant,
    setEntryTime,
    entryTotal
  };
})();
