'use strict';

/**
 * Data layer for RodeoLife.
 *
 * Backend: Supabase Postgres, one `rodeos` table, one JSONB blob per row
 * (`data` column = the exact Rodeo object shape below). No login — anyone
 * with this app's URL shares one dataset (see supabase-client.js and the
 * SQL in the project's setup notes). Realtime keeps every open tab/device in
 * sync automatically.
 *
 * In-memory cache: every getter below (`listRodeos`, `getRodeo`, `getClass`)
 * reads a plain synchronous in-memory `data.rodeos` map — app.js's calling
 * code never changed when this moved off localStorage. Mutators update that
 * cache immediately (instant UI) and fire an async Supabase write in the
 * background; the Realtime subscription merges in changes made by OTHER
 * tabs/devices and re-renders.
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
 * Legacy local shapes, migrated ONCE (only if Supabase has zero rows — i.e.
 * this is the first device to ever connect this app to a fresh backend —
 * so a real weekend's data already on this device isn't stranded):
 *   v1 (pre-Class): { version: 1, events: { [id]: Event }, eventOrder }
 *     Event had riders/teams directly on it (always team-roping). Each
 *     becomes a Rodeo with exactly one Class: { discipline: 'team_roping' }.
 *   v2 (pre-Supabase, local only): { version: 2, rodeos: { [id]: Rodeo }, rodeoOrder }
 *     Same Rodeo/Class shape as today — just needs uploading.
 */

const LEGACY_STORAGE_KEY = 'rodeolife_v1';

const Store = (() => {
  const data = { rodeos: {} };
  const listeners = new Set();

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function emptyTimeFields() {
    return {
      r1: null, r1NoTime: false,
      r2: null, r2NoTime: false,
      shortGo: null, shortGoNoTime: false
    };
  }

  // ─── Init / sync with Supabase ──────────────────────────────────────────

  async function init() {
    let rows = [];
    try {
      const { data: rows_, error } = await db.from('rodeos').select('*');
      if (error) throw error;
      rows = rows_ || [];
    } catch (e) {
      console.error('RodeoLife: could not reach the shared backend', e);
    }

    if (rows.length === 0) {
      // Nobody has ever put data in this backend yet — if THIS device has
      // pre-Supabase local data, upload it now so it isn't stranded.
      const legacy = migrateLegacyLocalData();
      for (const rodeo of Object.values(legacy)) {
        data.rodeos[rodeo.id] = rodeo;
        upsertRemote(rodeo);
      }
    } else {
      for (const row of rows) data.rodeos[row.id] = row.data;
    }

    subscribeRealtime();
    notify();
  }

  // Reads the OLD localStorage-only schema (v1 events, or v2 rodeos saved
  // before the Supabase migration) and returns a { [id]: Rodeo } map. Pure —
  // does not touch `data` or localStorage itself; the caller decides whether
  // to actually adopt/upload it (only when the shared backend is empty).
  function migrateLegacyLocalData() {
    let legacy;
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return {};
      legacy = JSON.parse(raw);
    } catch (_) {
      return {};
    }
    if (!legacy) return {};

    let rodeos = legacy.rodeos;
    if (!rodeos && legacy.events) {
      // v1 -> v2: wrap each old riders/teams Event into a Rodeo with one
      // team_roping Class, preserving every id already assigned.
      rodeos = {};
      for (const id of Object.keys(legacy.events)) {
        const evt = legacy.events[id];
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
    }
    if (!rodeos) return {};

    // Backfill anything from before live time entry / the Rodeo-Class split.
    for (const rodeo of Object.values(rodeos)) {
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
        }
        if (!cls.contestants) cls.contestants = [];
        for (const t of (cls.teams || []).concat(cls.contestants || [])) {
          if (t.id === undefined) t.id = uuid();
          for (const key of ['r1', 'r2', 'shortGo']) {
            if (t[key] === undefined) t[key] = null;
            if (t[key + 'NoTime'] === undefined) t[key + 'NoTime'] = false;
          }
        }
      }
    }
    return rodeos;
  }

  async function upsertRemote(rodeo) {
    try {
      const { error } = await db.from('rodeos').upsert({
        id: rodeo.id,
        data: rodeo,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
    } catch (e) {
      console.error('RodeoLife: failed to sync a change to the shared backend', e);
    }
  }

  async function deleteRemote(id) {
    try {
      const { error } = await db.from('rodeos').delete().eq('id', id);
      if (error) throw error;
    } catch (e) {
      console.error('RodeoLife: failed to delete on the shared backend', e);
    }
  }

  function subscribeRealtime() {
    db
      .channel('rodeos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rodeos' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          delete data.rodeos[payload.old.id];
        } else {
          data.rodeos[payload.new.id] = payload.new.data;
        }
        notify();
      })
      .subscribe();
  }

  function notify() {
    listeners.forEach(fn => fn());
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Bumps `modified`, pushes the updated rodeo to the shared backend
  // (fire-and-forget — the in-memory cache and UI update immediately either
  // way), and re-renders. Every mutator below funnels through this.
  function touch(rodeoId) {
    const rodeo = data.rodeos[rodeoId];
    if (rodeo) {
      rodeo.modified = Date.now();
      upsertRemote(rodeo);
    }
    notify();
  }

  // ─── Rodeos ─────────────────────────────────────────────────────────────

  function listRodeos() {
    return Object.values(data.rodeos).sort((a, b) => (b.created || 0) - (a.created || 0));
  }

  function getRodeo(id) {
    return data.rodeos[id] || null;
  }

  // Every rider/contestant ever entered across every rodeo in the shared
  // backend, deduped by name — the same circuit's kids show up again and
  // again, so this powers a "you've seen this name before" autocomplete
  // instead of retyping full names + back numbers every time. Purely derived
  // from data already loaded in memory; no separate roster table. Iterates
  // oldest-rodeo-first so a more recent back number (someone's number can
  // change rodeo to rodeo) wins over an older one for the same name.
  function knownRiders() {
    const byName = new Map();
    const oldestFirst = [...listRodeos()].reverse();
    for (const rodeo of oldestFirst) {
      for (const cls of rodeo.classes || []) {
        for (const person of [...(cls.riders || []), ...(cls.contestants || [])]) {
          const key = person.name.trim().toLowerCase();
          if (!key) continue;
          byName.set(key, { name: person.name.trim(), back: (person.back || '').trim() });
        }
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
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
    touch(id);
    return id;
  }

  function updateRodeo(id, patch) {
    const rodeo = data.rodeos[id];
    if (!rodeo) return;
    Object.assign(rodeo, patch);
    touch(id);
  }

  function setStatus(id, status) {
    updateRodeo(id, { status });
  }

  function deleteRodeo(id) {
    delete data.rodeos[id];
    deleteRemote(id);
    notify();
  }

  function duplicateRodeo(id) {
    const src = data.rodeos[id];
    if (!src) return null;
    const newId = createRodeo({ name: src.name + ' (copy)', date: src.date, location: src.location });
    const copy = data.rodeos[newId];
    // Copy each class's sign-up list with fresh ids; times/draw are wiped —
    // same "fresh draw on duplicate" behavior as before.
    copy.classes = (src.classes || []).map(cls => ({
      id: uuid(),
      name: cls.name,
      discipline: cls.discipline,
      riders: (cls.riders || []).map(r => ({ ...r, id: uuid() })),
      teams: [],
      contestants: (cls.contestants || []).map(c => ({ ...c, id: uuid(), ...emptyTimeFields() }))
    }));
    touch(newId);
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
    touch(rodeoId);
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
    touch(rodeoId);
  }

  // ─── Riders (team_roping classes only) ─────────────────────────────────

  function addRider(rodeoId, classId, { name, isHeader, isHeeler, back }) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return null;
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    if (cls.riders.some(r => r.name.toLowerCase() === trimmed.toLowerCase())) return null;
    const rider = { id: uuid(), name: trimmed, isHeader: !!isHeader, isHeeler: !!isHeeler, back: (back || '').trim() };
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
    if (patch.back !== undefined) r.back = patch.back.trim();
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

  const ready = init();

  return {
    ready,
    subscribe,
    listRodeos,
    getRodeo,
    knownRiders,
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
