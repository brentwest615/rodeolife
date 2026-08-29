'use strict';

/**
 * Returns true if two runs share any rider (header or heeler, in either role).
 * This catches dual-role riders appearing in consecutive runs.
 */
function conflictsBetween(a, b) {
  if (!a || !b) return false;
  return (
    a.header === b.header ||
    a.heeler === b.heeler ||
    a.header === b.heeler ||
    a.heeler === b.header
  );
}

/**
 * Generate an ordered team draw.
 *
 * Every header ropes with every heeler exactly once.
 * Self-pairs (same name in both lists) are excluded.
 * Ordering minimizes back-to-back appearances for all riders including dual-role.
 *
 * Fixes two Excel v0 bugs:
 *   1. Dual-role riders back-to-back: greedy scheduler blocks any rider who appeared
 *      in the previous run from appearing in the next, regardless of role.
 *   2. Uneven counts → incomplete teams: pairs are built with nested loops (not a
 *      formula), so all nH × nL valid pairs are always generated.
 *
 * @param {string[]} rawHeaders
 * @param {string[]} rawHeelers
 * @returns {{ header: string, heeler: string, conflict: boolean }[]}
 */
function buildDraw(rawHeaders, rawHeelers) {
  const headers = [...new Set(rawHeaders.map(s => s.trim()).filter(Boolean))];
  const heelers = [...new Set(rawHeelers.map(s => s.trim()).filter(Boolean))];

  if (headers.length === 0 || heelers.length === 0) return [];

  const nH = headers.length;
  const nL = heelers.length;

  // Build pool with rotationKey so the greedy tiebreak preserves the rotation feel.
  // rotationKey comes from the classic formula: header_idx = k%nH, heeler_idx = (k%nH + k/nH)%nL
  const pool = [];
  for (let k = 0; k < nH * nL; k++) {
    const hIdx = k % nH;
    const lIdx = (hIdx + Math.floor(k / nH)) % nL;
    const header = headers[hIdx];
    const heeler = heelers[lIdx];
    if (header !== heeler) {
      pool.push({ header, heeler, rotationKey: k });
    }
  }

  // Greedy scheduler: at each position, pick the eligible pair whose riders have
  // rested the longest (max gap since last appearance). Tiebreak by rotationKey.
  const lastSeen = {};
  headers.forEach(h => { lastSeen[h] = -Infinity; });
  heelers.forEach(l => { lastSeen[l] = -Infinity; });

  const result = [];
  const remaining = [...pool];

  for (let pos = 0; pos < pool.length; pos++) {
    const prev = result[pos - 1];
    const blocked = prev ? new Set([prev.header, prev.heeler]) : new Set();

    let candidates = remaining.filter(p => !blocked.has(p.header) && !blocked.has(p.heeler));
    const isConflict = candidates.length === 0;
    if (isConflict) candidates = remaining.slice(); // fallback: allow conflict, flag it

    // Score: minimum rest among both riders. Higher = preferred.
    const score = p => Math.min(pos - lastSeen[p.header], pos - lastSeen[p.heeler]);
    candidates.sort((a, b) => {
      const d = score(b) - score(a);
      return d !== 0 ? d : a.rotationKey - b.rotationKey;
    });

    const pick = candidates[0];
    result.push({ header: pick.header, heeler: pick.heeler, conflict: isConflict });
    lastSeen[pick.header] = pos;
    lastSeen[pick.heeler] = pos;
    remaining.splice(remaining.indexOf(pick), 1);
  }

  return result;
}
