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
 *     format,                 // 'one_round' | 'two_round' | 'two_round_progressive'
 *     shortGoSize,            // number|null — top-N cutoff, two_round_progressive only
 *     // team_roping ONLY:
 *     riders: { id, name, isHeader, isHeeler }[],
 *     teams: { id, header, heeler, conflict,
 *              r1, r1NoTime, r1NoTimeReason, r2, r2NoTime, r2NoTimeReason,
 *              shortGo, shortGoNoTime, shortGoNoTimeReason }[],
 *     // every OTHER discipline: a flat contestant list, each carrying its own
 *     // times directly (same round fields as a team — no separate runs table,
 *     // so there's nothing to orphan if a contestant is removed):
 *     contestants: { id, name, back,
 *                    r1, r1NoTime, r1NoTimeReason, r2, r2NoTime, r2NoTimeReason,
 *                    shortGo, shortGoNoTime, shortGoNoTimeReason }[]
 *     // *NoTimeReason is a preset (from disciplines.js reasonsFor) and/or a
 *     // free-text note, joined with " · " when both are given — null when
 *     // no reason was recorded (a plain NT is still valid on its own).
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
      r1: null, r1NoTime: false, r1NoTimeReason: null,
      r2: null, r2NoTime: false, r2NoTimeReason: null,
      shortGo: null, shortGoNoTime: false, shortGoNoTimeReason: null
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
        backfillRodeo(rodeo);
        data.rodeos[rodeo.id] = rodeo;
        upsertRemote(rodeo);
      }
    } else {
      // Every field ever added after a class already existed (NoTime
      // reasons, scoring formats, ...) needs backfilling here too, on the
      // NORMAL load path — not just the empty-backend migration path above.
      // A live rodeo on the shared backend goes through this branch on
      // every single load, so this is where real production data actually
      // picks up new fields.
      for (const row of rows) {
        backfillRodeo(row.data);
        data.rodeos[row.id] = row.data;
      }
    }

    subscribeRealtime();
    notify();
  }

  // Fills in any field added to the schema after a rodeo/class already
  // existed, so old data loaded fresh from Supabase behaves identically to
  // a class created today. Mutates `rodeo` in place; safe to call on every
  // load (idempotent — only touches fields that are actually missing).
  function backfillRodeo(rodeo) {
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
      // Classes created before scoring formats existed default to 'two_round'
      // (average, no gating) — the safe migration choice, since it changes
      // nothing about who can enter what vs. today's behavior. Only NEW
      // classes (see createClass) default to 'two_round_progressive'.
      if (cls.format === undefined) cls.format = 'two_round';
      if (cls.shortGoSize === undefined) cls.shortGoSize = null;
      for (const t of (cls.teams || []).concat(cls.contestants || [])) {
        if (t.id === undefined) t.id = uuid();
        for (const key of ['r1', 'r2', 'shortGo']) {
          if (t[key] === undefined) t[key] = null;
          if (t[key + 'NoTime'] === undefined) t[key + 'NoTime'] = false;
          if (t[key + 'NoTimeReason'] === undefined) t[key + 'NoTimeReason'] = null;
        }
      }
    }
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

  function createClass(rodeoId, { name, discipline, format }) {
    const rodeo = data.rodeos[rodeoId];
    if (!rodeo) return null;
    const id = uuid();
    rodeo.classes.push({
      id,
      name: (name || '').trim() || disciplineLabel(discipline),
      discipline,
      format: format || 'two_round_progressive',
      shortGoSize: null,
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
    if (patch.format !== undefined && CLASS_FORMATS.includes(patch.format)) {
      cls.format = patch.format;
    }
    if (patch.shortGoSize !== undefined) {
      const n = parseInt(patch.shortGoSize, 10);
      cls.shortGoSize = Number.isFinite(n) && n > 0 ? n : null;
    }
    // Applied last, keyed off the FINAL format, regardless of patch order —
    // a shortGoSize value never survives on a class that isn't progressive.
    if (cls.format !== 'two_round_progressive') cls.shortGoSize = null;
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

  function setEntryTime(rodeoId, classId, entryId, round, { seconds, noTime, reason }) {
    const cls = getClass(rodeoId, classId);
    if (!cls) return;
    const entry = (cls.teams || []).find(e => e.id === entryId) ||
                  (cls.contestants || []).find(e => e.id === entryId);
    if (!entry) return;
    const timeKey = round; // 'r1' | 'r2' | 'shortGo'
    const noTimeKey = round + 'NoTime';
    const reasonKey = round + 'NoTimeReason';
    if (!(timeKey in entry) || !(noTimeKey in entry)) return;
    entry[noTimeKey] = !!noTime;
    entry[timeKey] = noTime ? null : (seconds != null && seconds > 0 ? seconds : null);
    entry[reasonKey] = noTime ? (reason || null) : null;
    touch(rodeoId);
  }

  // A round's numeric contribution to a total: a no-time is the NLBRA-style
  // 999.99 stand-in (a real time always beats it), a real time is itself,
  // and "not yet run" is null — the caller decides whether null also means
  // 999.99 (two_round: yes, matches the mobile app) or "still pending"
  // (progressive: a not-yet-run round doesn't retroactively count against
  // someone who hasn't had the chance to run it, except where the mobile
  // app's own rule already treats a pending R2 as 999.99 — see below).
  function roundContribution(entry, round) {
    if (entry[round + 'NoTime']) return 999.99;
    return entry[round] != null ? entry[round] : null;
  }

  // An entry's total, aware of the Class's scoring format. Works on a team OR
  // a contestant; both carry the same round fields. `cls` is required for
  // anything beyond a bare no-op default — every call site has a Class handy.
  //
  //   one_round:              only r1 matters; returns `pending: true` for an
  //                           unrun entry instead of folding it into the total.
  //   two_round:              total = r1 + r2 contributions; a no-time OR an
  //                           unrun round both count as 999.99 (ports the
  //                           mobile app's "average" format exactly).
  //   two_round_progressive:  r1 must be clean to "advance" (`advanced: true`);
  //                           an unrun/no-time r1 returns total: null with
  //                           `advanced: false` or `pending: true`. Once
  //                           advanced, total = r1 + r2-contribution (r2
  //                           pending also counts as 999.99, same mobile
  //                           rule), plus a short-go contribution on top if
  //                           one has been entered (only finalists — see
  //                           shortGoQualifiers — are ever given a short-go
  //                           time by the UI, so this needs no extra gating).
  function entryTotal(entry, cls) {
    const format = (cls && cls.format) || 'two_round';

    if (format === 'one_round') {
      if (entry.r1NoTime) return { total: null, hasNoTime: true, pending: false };
      if (entry.r1 != null) return { total: entry.r1, hasNoTime: false, pending: false };
      return { total: null, hasNoTime: false, pending: true };
    }

    if (format === 'two_round') {
      const c1 = roundContribution(entry, 'r1') ?? 999.99;
      const c2 = roundContribution(entry, 'r2') ?? 999.99;
      return { total: c1 + c2, hasNoTime: !!entry.r1NoTime || !!entry.r2NoTime };
    }

    // two_round_progressive
    const r1Clean = entry.r1 != null && !entry.r1NoTime;
    if (!r1Clean) {
      return {
        total: null,
        hasNoTime: !!entry.r1NoTime,
        pending: entry.r1 == null && !entry.r1NoTime,
        advanced: false
      };
    }
    const c2 = roundContribution(entry, 'r2') ?? 999.99;
    const r1r2 = entry.r1 + c2;
    const cSG = roundContribution(entry, 'shortGo');
    const total = cSG != null ? r1r2 + cSG : r1r2;
    return {
      total,
      hasNoTime: !!entry.r2NoTime || !!entry.shortGoNoTime,
      advanced: true,
      r2Pending: entry.r2 == null && !entry.r2NoTime
    };
  }

  // Which entries (by id) qualify for the short-go round: clean in BOTH r1
  // and r2, ranked by combined r1+r2 time, top `shortGoSize` of them. Exact
  // port of the mobile app's cutoff rule. Returns null when there's no cutoff
  // to apply (not a progressive class, or no shortGoSize configured yet) —
  // callers treat null as "no restriction," not "nobody qualifies."
  function shortGoQualifiers(cls) {
    if (cls.format !== 'two_round_progressive' || !cls.shortGoSize) return null;
    const entries = (cls.teams || []).concat(cls.contestants || []);
    const pool = entries
      .filter(e => e.r1 != null && !e.r1NoTime && e.r2 != null && !e.r2NoTime)
      .sort((a, b) => (a.r1 + a.r2) - (b.r1 + b.r2))
      .slice(0, cls.shortGoSize);
    return new Set(pool.map(e => e.id));
  }

  // Full standings for a Class, sectioned per the scoring format — the single
  // source of truth both the producer's standings view and the read-only
  // parent-facing page render from, so they can never drift. Collapses the
  // mobile app's six-way progressive breakdown into three section headers
  // (Short-go finalists / Everyone else / Did not advance / Still to run),
  // carrying the same information via a per-row `badge` instead — same facts,
  // less scrolling during live use.
  function classStandings(cls) {
    const team = isTeamDiscipline(cls.discipline);
    const entries = team ? (cls.teams || []) : (cls.contestants || []);
    const format = cls.format || 'two_round';
    const row = (entry, rank, total, badge) => ({ entry, rank, total, badge });

    if (format === 'one_round') {
      const placed = entries
        .filter(e => e.r1 != null && !e.r1NoTime)
        .sort((a, b) => a.r1 - b.r1)
        .map((e, i) => row(e, i + 1, e.r1, null));
      const noTime = entries.filter(e => e.r1NoTime).map(e => row(e, null, null, 'NT'));
      const pending = entries.filter(e => e.r1 == null && !e.r1NoTime).map(e => row(e, null, null, 'to run'));
      const sections = [{ label: null, rows: placed }];
      if (noTime.length) sections.push({ label: 'No time', rows: noTime });
      if (pending.length) sections.push({ label: 'Still to run', rows: pending });
      return { sections };
    }

    if (format === 'two_round') {
      const rows = entries
        .map(e => ({ e, ...entryTotal(e, cls) }))
        .sort((a, b) => a.total - b.total)
        .map((r, i) => row(r.e, i + 1, r.total, r.hasNoTime ? 'NT' : null));
      return { sections: [{ label: null, rows }] };
    }

    // two_round_progressive
    const qualifiers = shortGoQualifiers(cls);
    const advanced = entries.filter(e => e.r1 != null && !e.r1NoTime);
    const notAdvanced = entries.filter(e => e.r1NoTime);
    const pendingR1 = entries.filter(e => e.r1 == null && !e.r1NoTime);

    const finalists = qualifiers ? advanced.filter(e => qualifiers.has(e.id)) : [];
    const rest = qualifiers ? advanced.filter(e => !qualifiers.has(e.id)) : advanced;

    // A finalist who hasn't finished their short go yet has a total that
    // only reflects R1+R2 — ranking that against a finalist who HAS run
    // (R1+R2+SG) would unfairly favor whoever simply hasn't gone yet. Mobile
    // app avoids this by only ranking completed short-go runs; incomplete
    // ones get no rank number (shown via badge instead, not a rank).
    const finalistRows = finalists.map(e => ({ e, ...entryTotal(e, cls) }));
    const finalistsDone = finalistRows
      .filter(r => r.e.shortGo != null || r.e.shortGoNoTime)
      .sort((a, b) => a.total - b.total);
    const finalistsToRun = finalistRows
      .filter(r => r.e.shortGo == null && !r.e.shortGoNoTime)
      .sort((a, b) => a.total - b.total); // pre-SG order (by R1+R2), for a sensible display order
    const restRows = rest
      .map(e => ({ e, ...entryTotal(e, cls) }))
      .sort((a, b) => a.total - b.total);

    let rank = 0;
    const finalSection = [
      ...finalistsDone.map(r => {
        rank++;
        return row(r.e, rank, r.total, r.e.shortGoNoTime ? 'NT' : (r.r2Pending ? 'R2 to run' : null));
      }),
      ...finalistsToRun.map(r => row(r.e, null, r.total, r.r2Pending ? 'R2 to run' : 'to run'))
    ];
    const restSection = restRows.map(r => {
      rank++;
      return row(r.e, rank, r.total, r.hasNoTime ? 'NT' : (r.r2Pending ? 'R2 to run' : null));
    });

    const sections = [];
    if (finalSection.length) sections.push({ label: 'Short-go finalists', rows: finalSection });
    sections.push({ label: qualifiers ? 'Everyone else' : null, rows: restSection });
    if (notAdvanced.length) {
      sections.push({ label: 'Did not advance', rows: notAdvanced.map(e => row(e, null, null, 'NT round 1')) });
    }
    if (pendingR1.length) {
      sections.push({ label: 'Still to run', rows: pendingR1.map(e => row(e, null, null, 'to run')) });
    }
    return { sections };
  }

  // Round-robin ("Texas") standings by individual rider — team roping only.
  // RodeoLife's draw already pairs every header with every heeler once (see
  // draw.js), so round-robin isn't a different data shape, just a different
  // lens on the same teams: aggregate every round a rider was part of
  // (across every pairing they're in), rank by catches, then by time on the
  // catches they made — exact port of the mobile app's Texas algorithm.
  function riderStandings(cls) {
    const teams = cls.teams || [];
    const rounds = cls.format === 'one_round' ? ['r1']
      : cls.format === 'two_round' ? ['r1', 'r2']
      : ['r1', 'r2', 'shortGo'];
    const byName = new Map();
    function credit(name, clean, time) {
      const key = (name || '').trim();
      if (!key) return;
      if (!byName.has(key)) byName.set(key, { name: key, catches: 0, totalTime: 0, runs: 0 });
      const agg = byName.get(key);
      agg.runs += 1;
      if (clean) { agg.catches += 1; agg.totalTime += time; }
    }
    teams.forEach(t => {
      rounds.forEach(r => {
        const ran = t[r] != null || t[r + 'NoTime'];
        if (!ran) return;
        const clean = t[r] != null && !t[r + 'NoTime'];
        credit(t.header, clean, clean ? t[r] : 0);
        credit(t.heeler, clean, clean ? t[r] : 0);
      });
    });
    return [...byName.values()]
      .sort((a, b) => b.catches - a.catches || a.totalTime - b.totalTime)
      .map((r, i) => ({ ...r, rank: r.catches > 0 ? i + 1 : null }));
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
    entryTotal,
    shortGoQualifiers,
    classStandings,
    riderStandings
  };
})();
