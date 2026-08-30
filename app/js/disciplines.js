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

// No-time reason presets per discipline — ported from the mobile app
// (rodeo-app's NO_TIME_REASONS), same wording so producers who use both
// apps see the same options.
const NO_TIME_REASONS = {
  team_roping: ['Header missed', 'Heeler missed', 'Time limit', 'Scratch'],
  breakaway: ['Missed', 'Top knot', 'Illegal catch', 'Time limit', 'Scratch'],
  tiedown: ['Missed', 'Calf got up', 'Time limit', 'Scratch'],
  barrels: ['Knocked barrel', 'Broken pattern', 'Time limit', 'Scratch'],
  poles: ['Broken pattern', 'Off pattern', 'Time limit', 'Scratch'],
  trail: ['Off pattern', 'Broken pattern', 'Time limit', 'Scratch'],
  goat_tying: ["Didn't stay tied", 'Illegal tie', 'Time limit', 'Horse stepped on goat', 'Scratch'],
  flag_racing: ['Dropped/missed flag', 'Broken pattern', 'Knocked barrel', 'Time limit', 'Scratch'],
  ribbon_roping: ['No catch', 'No ribbon', 'Time limit', 'Scratch', 'No dally']
};

function reasonsFor(code) {
  return NO_TIME_REASONS[code] || ['Time limit', 'Scratch'];
}

// Scoring formats a Class can use — ported from the mobile app's three
// real (fully-implemented) formats. "Round-robin" isn't a format here: it's
// an alternate standings VIEW (by rider) on top of team roping's existing
// pairing-based entries, see Store.riderStandings.
const CLASS_FORMATS = ['one_round', 'two_round', 'two_round_progressive'];

const FORMAT_LABELS = {
  one_round: 'One round',
  two_round: 'Two round (average)',
  two_round_progressive: 'Two round progressive'
};

function formatLabel(code) {
  return FORMAT_LABELS[code] || code;
}
