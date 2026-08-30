'use strict';

/**
 * Discipline metadata shared across every Class. Team roping is the one
 * discipline with its own paired-entry sign-up/draw flow (see draw.js);
 * every other discipline is a flat contestant list scored identically
 * (see Store.addContestant/setContestantTime and panel_times' generalized
 * per-entry rendering in app.js).
 */

const DISCIPLINES = [
  { code: 'team_roping', label: 'Team Roping', team: true },
  { code: 'breakaway', label: 'Breakaway' },
  { code: 'tiedown', label: 'Tie-Down' },
  { code: 'barrels', label: 'Barrel Racing' },
  { code: 'poles', label: 'Pole Bending' },
  { code: 'trail', label: 'Trail' },
  { code: 'goat_tying', label: 'Goat Tying' },
  { code: 'flag_racing', label: 'Flag Racing' },
  { code: 'ribbon_roping', label: 'Ribbon Roping' }
];

function disciplineLabel(code) {
  return (DISCIPLINES.find(d => d.code === code) || {}).label || code;
}

function isTeamDiscipline(code) {
  return !!(DISCIPLINES.find(d => d.code === code) || {}).team;
}

// Speed events are timed to thousandths; roping/tying are hundredths — same
// rule already established and validated in the rodeo-app project.
function decimalsFor(code) {
  return code === 'barrels' || code === 'poles' || code === 'trail' || code === 'flag_racing'
    ? 3
    : 2;
}

function stepFor(code) {
  return decimalsFor(code) === 3 ? '0.001' : '0.01';
}
