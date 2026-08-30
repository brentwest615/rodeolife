'use strict';

/**
 * CSV export — column shapes ported from the mobile app's csv.ts, adapted
 * to RodeoLife's Store.classStandings/riderStandings so the exported order
 * always matches what's on screen. Delivery differs: the mobile app hands
 * the file to the native OS share sheet; a web app just downloads a Blob.
 */

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvRow(fields) {
  return fields.map(csvEscape).join(',');
}

// Mobile app convention: a penalized time displays as "17.200b" — raw time
// plus its penalty letters appended.
function roundDisplay(entry, round, decimals) {
  if (entry[round + 'NoTime']) return 'NT';
  if (entry[round] == null) return '';
  return entry[round].toFixed(decimals) + (entry[round + 'PenaltyLabel'] || '');
}

// Per-entry (per-pairing, for team roping) results CSV.
function classResultsCsv(rodeo, cls) {
  const decimals = decimalsFor(cls.discipline);
  const rounds = roundsForClass(cls);
  const team = isTeamDiscipline(cls.discipline);
  const nameFor = entry => team ? `${entry.header} / ${entry.heeler}` : entry.name;
  const { sections } = Store.classStandings(cls);

  const lines = [
    csvRow([`${rodeo.name} — ${cls.name}`]),
    csvRow([disciplineLabel(cls.discipline), formatLabel(cls.format), rodeo.date || '']),
    ''
  ];

  if (cls.format === 'one_round') {
    lines.push(csvRow(['Place', 'Contestant', 'Time', 'Reason/Note']));
    sections.forEach(sec => {
      sec.rows.forEach(({ entry, rank, total, badge }) => {
        if (badge === 'to run') return; // not-yet-run entries aren't part of a results export
        const place = rank != null ? rank : 'NT';
        const time = rank != null ? total.toFixed(decimals) : '999.99';
        const note = badge === 'NT' ? (entry.r1NoTimeReason || '') : '';
        lines.push(csvRow([place, nameFor(entry), time, note]));
      });
    });
  } else {
    lines.push(csvRow(['Place', 'Contestant', ...rounds.map(r => ROUND_LABELS[r]), 'Total']));
    sections.forEach(sec => {
      sec.rows.forEach(({ entry, rank, total, badge }) => {
        const place = rank != null ? rank : (badge || '');
        const isNoTimeBadge = badge === 'NT' || badge === 'NT round 1';
        const totalText = total != null ? total.toFixed(decimals) : (isNoTimeBadge ? '999.99' : '');
        lines.push(csvRow([place, nameFor(entry), ...rounds.map(r => roundDisplay(entry, r, decimals)), totalText]));
      });
    });
  }

  return lines.join('\n');
}

// Round-robin ("by rider") results CSV — team roping only.
function riderResultsCsv(rodeo, cls) {
  const decimals = decimalsFor(cls.discipline);
  const ranked = Store.riderStandings(cls);
  const lines = [
    csvRow([`${rodeo.name} — ${cls.name} (by rider)`]),
    csvRow([disciplineLabel(cls.discipline), formatLabel(cls.format), rodeo.date || '']),
    '',
    csvRow(['Place', 'Rider', 'Catches', 'Runs', 'Total time'])
  ];
  ranked.forEach(r => {
    lines.push(csvRow([
      r.rank != null ? r.rank : '',
      r.name,
      r.catches,
      r.runs,
      r.catches > 0 ? r.totalTime.toFixed(decimals) : ''
    ]));
  });
  return lines.join('\n');
}

// Web download — no OS share sheet here, just a Blob + a throwaway <a download>.
function downloadCsv(filename, csvText) {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, '_');
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
