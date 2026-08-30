'use strict';

// ─── Utilities ──────────────────────────────────────────────────────────────

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (!Array.isArray(children)) children = [children];
  for (const c of children) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function icon(name) {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    duplicate: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
    archive: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>'
  };
  const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = svg;
  return span;
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function relTime(ms) {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  const days = Math.floor(sec / 86400);
  if (days < 7) return days + 'd ago';
  if (days < 30) return Math.floor(days / 7) + 'w ago';
  if (days < 365) return Math.floor(days / 30) + 'mo ago';
  return Math.floor(days / 365) + 'y ago';
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function toast(msg, kind = 'info') {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: `toast toast-${kind}` }, msg);
  root.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function modal({ title, body, actions }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';

  const close = () => { root.innerHTML = ''; document.body.classList.remove('modal-open'); };
  document.body.classList.add('modal-open');

  const overlay = el('div', { class: 'modal-overlay', onclick: e => { if (e.target === overlay) close(); } });
  const card = el('div', { class: 'modal-card', role: 'dialog' });

  card.appendChild(el('div', { class: 'modal-header' }, [
    el('h2', {}, title),
    el('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, [icon('close')])
  ]));

  const bodyEl = el('div', { class: 'modal-body' });
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  card.appendChild(bodyEl);

  if (actions && actions.length) {
    const footer = el('div', { class: 'modal-footer' });
    for (const a of actions) {
      footer.appendChild(el('button', {
        class: a.class || 'btn btn-secondary',
        onclick: () => { if (a.onClick) a.onClick(close); }
      }, a.label));
    }
    card.appendChild(footer);
  }

  overlay.appendChild(card);
  root.appendChild(overlay);

  const firstInput = card.querySelector('input,textarea');
  if (firstInput) firstInput.focus();

  return close;
}

function confirm(msg, { confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    modal({
      title: 'Confirm',
      body: el('p', { class: 'muted' }, msg),
      actions: [
        { label: 'Cancel', class: 'btn btn-ghost', onClick: c => { c(); resolve(false); } },
        { label: confirmLabel, class: danger ? 'btn btn-danger' : 'btn btn-primary', onClick: c => { c(); resolve(true); } }
      ]
    });
  });
}

// ─── Routing ────────────────────────────────────────────────────────────────
// #/                                          -> rodeo list
// #/rodeo/:rodeoId                            -> class list for that rodeo (producer)
// #/rodeo/:rodeoId/class/:classId/:tab        -> class detail (producer)
// #/standings/:rodeoId                        -> read-only class list (parents)
// #/standings/:rodeoId/:classId               -> read-only leaderboard (parents)

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!hash) return { name: 'rodeos' };
  const parts = hash.split('/');
  if (parts[0] === 'rodeo' && parts[1]) {
    if (parts[2] === 'class' && parts[3]) {
      return { name: 'class', rodeoId: parts[1], classId: parts[3], tab: parts[4] || 'signups' };
    }
    return { name: 'rodeo', rodeoId: parts[1] };
  }
  if (parts[0] === 'standings' && parts[1]) {
    if (parts[2]) return { name: 'standingsClass', rodeoId: parts[1], classId: parts[2] };
    return { name: 'standingsRodeo', rodeoId: parts[1] };
  }
  return { name: 'rodeos' };
}

// Absolute, copyable URL for a read-only standings page — works regardless
// of where the app is hosted (Vercel, file://, etc).
function standingsUrl(rodeoId, classId) {
  const base = location.href.split('#')[0];
  return classId ? `${base}#/standings/${rodeoId}/${classId}` : `${base}#/standings/${rodeoId}`;
}

async function copyStandingsLink(rodeoId, classId) {
  try {
    await navigator.clipboard.writeText(standingsUrl(rodeoId, classId));
    toast('Standings link copied — text or share it with parents', 'success');
  } catch (_) {
    toast('Could not copy — long-press the link to copy it manually', 'warn');
  }
}

function navigate(path) {
  location.hash = path;
}

// ─── Rodeo list view ────────────────────────────────────────────────────────

function view_rodeos() {
  const rodeos = Store.listRodeos();

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('div', { class: 'brand-mark' }, 'R'),
      el('div', { class: 'brand-text' }, [
        el('div', { class: 'brand-name' }, 'RodeoLife'),
        el('div', { class: 'brand-tag' }, 'Rodeo Manager')
      ])
    ]),
    el('div', { class: 'header-actions' }, [
      el('button', { class: 'btn btn-primary', onclick: openCreateRodeoModal }, [
        icon('plus'), 'New Rodeo'
      ])
    ])
  ]);

  let main;
  if (rodeos.length === 0) {
    main = el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-illustration' }, '🤠'),
      el('h2', {}, 'No rodeos yet'),
      el('p', { class: 'muted' }, 'Create your first rodeo, then add classes for each event (team roping, barrels, poles, etc).'),
      el('button', { class: 'btn btn-primary btn-lg', onclick: openCreateRodeoModal }, [icon('plus'), 'Create Rodeo'])
    ]);
  } else {
    const grid = el('div', { class: 'event-grid' });
    for (const rodeo of rodeos) grid.appendChild(rodeoCard(rodeo));
    main = el('div', { class: 'page' }, [
      el('div', { class: 'page-header' }, [
        el('h1', {}, 'Rodeos'),
        el('p', { class: 'muted' }, `${rodeos.length} rodeo${rodeos.length === 1 ? '' : 's'}`)
      ]),
      grid
    ]);
  }

  return el('div', { class: 'shell' }, [header, el('main', {}, [main])]);
}

function rodeoCard(rodeo) {
  const classes = rodeo.classes || [];
  const sub = [
    fmtDate(rodeo.date) || 'No date',
    rodeo.location
  ].filter(Boolean).join(' · ');

  const meta = classes.length
    ? classes.map(c => c.name).join(' · ')
    : 'No classes yet';

  return el('a', {
    class: 'event-card',
    href: '#/rodeo/' + rodeo.id
  }, [
    el('div', { class: 'event-card-top' }, [
      el('h3', {}, rodeo.name),
      statusBadge(rodeo.status)
    ]),
    el('div', { class: 'event-card-sub muted' }, sub),
    el('div', { class: 'event-card-meta' }, meta),
    el('div', { class: 'event-card-foot muted' }, 'Edited ' + relTime(rodeo.modified))
  ]);
}

function statusBadge(status) {
  const labels = { draft: 'Draft', running: 'Running', closed: 'Closed' };
  return el('span', { class: 'badge badge-' + status }, labels[status] || status);
}

// ─── Rodeo detail view (list of Classes) ───────────────────────────────────

function view_rodeo(rodeoId) {
  const rodeo = Store.getRodeo(rodeoId);
  if (!rodeo) {
    return el('div', { class: 'shell' }, [
      el('div', { class: 'empty-state' }, [
        el('h2', {}, 'Rodeo not found'),
        el('button', { class: 'btn btn-secondary', onclick: () => navigate('/') }, 'Back to Rodeos')
      ])
    ]);
  }

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand-row' }, [
      el('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Back' }, [icon('back')]),
      el('div', { class: 'event-title' }, [
        el('h1', {}, rodeo.name),
        el('div', { class: 'event-sub' }, [
          fmtDate(rodeo.date) || 'No date',
          rodeo.location ? ' · ' + rodeo.location : '',
          ' · ',
          statusBadge(rodeo.status)
        ])
      ])
    ]),
    el('div', { class: 'header-actions' }, rodeoActions(rodeo))
  ]);

  const classes = rodeo.classes || [];
  const list = el('div', { class: 'event-grid' });
  classes.forEach(cls => list.appendChild(classCard(rodeo, cls)));

  const main = el('div', { class: 'page' }, [
    classes.length === 0
      ? el('div', { class: 'empty-state' }, [
          el('div', { class: 'empty-illustration' }, '🎟️'),
          el('h2', {}, 'No classes yet'),
          el('p', { class: 'muted' }, 'Add a class for each event this rodeo runs — Team Roping, Barrel Racing, Goat Tying, etc.')
        ])
      : list,
    el('div', { class: 'sticky-actions' }, [
      el('button', {
        class: 'btn btn-primary btn-lg',
        onclick: () => openCreateClassModal(rodeo)
      }, [icon('plus'), 'Add Class'])
    ])
  ]);

  return el('div', { class: 'shell' }, [header, el('main', {}, [main])]);
}

function classCard(rodeo, cls) {
  const team = isTeamDiscipline(cls.discipline);
  const entries = team ? (cls.teams || []) : (cls.contestants || []);
  const signups = team ? (cls.riders || []).length : (cls.contestants || []).length;
  const meta = team
    ? `${signups} riders · ${entries.length} teams`
    : `${signups} contestants`;

  return el('a', {
    class: 'event-card',
    href: `#/rodeo/${rodeo.id}/class/${cls.id}/signups`
  }, [
    el('div', { class: 'event-card-top' }, [
      el('h3', {}, cls.name),
      el('span', { class: 'badge' }, disciplineLabel(cls.discipline))
    ]),
    el('div', { class: 'event-card-meta' }, meta)
  ]);
}

function rodeoActions(rodeo) {
  const actions = [];
  actions.push(el('button', {
    class: 'btn btn-ghost',
    onclick: () => copyStandingsLink(rodeo.id)
  }, [icon('copy'), 'Share standings']));
  actions.push(el('button', { class: 'btn btn-ghost', onclick: () => openEditRodeoModal(rodeo) }, [icon('edit'), 'Edit']));
  if (rodeo.status !== 'closed') {
    actions.push(el('button', { class: 'btn btn-ghost', onclick: () => { Store.setStatus(rodeo.id, 'closed'); toast('Rodeo closed'); } }, [icon('archive'), 'Close']));
  } else {
    actions.push(el('button', { class: 'btn btn-ghost', onclick: () => { Store.setStatus(rodeo.id, 'running'); toast('Rodeo reopened'); } }, [icon('play'), 'Reopen']));
  }
  return actions;
}

// ─── Class detail view ──────────────────────────────────────────────────────

function view_class(rodeoId, classId, tab) {
  const rodeo = Store.getRodeo(rodeoId);
  const cls = rodeo && Store.getClass(rodeoId, classId);
  if (!rodeo || !cls) {
    return el('div', { class: 'shell' }, [
      el('div', { class: 'empty-state' }, [
        el('h2', {}, 'Class not found'),
        el('button', { class: 'btn btn-secondary', onclick: () => navigate('/rodeo/' + rodeoId) }, 'Back to Rodeo')
      ])
    ]);
  }

  const team = isTeamDiscipline(cls.discipline);

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand-row' }, [
      el('a', { class: 'icon-btn', href: `#/rodeo/${rodeoId}`, 'aria-label': 'Back' }, [icon('back')]),
      el('div', { class: 'event-title' }, [
        el('h1', {}, cls.name),
        el('div', { class: 'event-sub' }, [disciplineLabel(cls.discipline), ' · ', rodeo.name])
      ])
    ]),
    el('div', { class: 'header-actions' }, [
      el('button', {
        class: 'btn btn-ghost',
        onclick: () => copyStandingsLink(rodeoId, classId)
      }, [icon('copy'), 'Share standings']),
      el('button', { class: 'btn btn-ghost', onclick: () => openEditClassModal(rodeo, cls) }, [icon('edit'), 'Edit'])
    ])
  ]);

  const tabDefs = team
    ? [
        ['signups', 'Sign-ups', cls.riders.length],
        ['draw', 'Draw', cls.teams.length || ''],
        ['times', 'Times', undefined],
        ['slips', 'Slips', undefined]
      ]
    : [
        ['signups', 'Sign-ups', cls.contestants.length],
        ['times', 'Times', undefined]
      ];

  const tabs = el('nav', { class: 'tabs' },
    tabDefs.map(([key, label, count]) =>
      tabLink(label, `#/rodeo/${rodeoId}/class/${classId}/${key}`, tab === key, count)));

  let panel;
  if (team) {
    if (tab === 'draw') panel = panel_draw(rodeo, cls);
    else if (tab === 'times') panel = panel_times(rodeo, cls);
    else if (tab === 'slips') panel = panel_slips(rodeo, cls);
    else panel = panel_signups(rodeo, cls);
  } else {
    if (tab === 'times') panel = panel_times(rodeo, cls);
    else panel = panel_signups_solo(rodeo, cls);
  }

  return el('div', { class: 'shell' }, [header, tabs, el('main', {}, [panel])]);
}

function tabLink(label, href, active, count) {
  return el('a', { class: 'tab' + (active ? ' active' : ''), href }, [
    label,
    count !== undefined && count !== '' ? el('span', { class: 'tab-count' }, String(count)) : null
  ]);
}

// ─── Read-only standings (parent-facing, shareable links) ──────────────────
// No inputs, no edit affordances — safe to hand out even though there's no
// login, since there's nothing on this page to accidentally change. Lives in
// the same render()/Store.subscribe loop as every other view, so it updates
// live right along with everything else — no separate refresh mechanism.

function view_standings_rodeo(rodeoId) {
  const rodeo = Store.getRodeo(rodeoId);
  if (!rodeo) {
    return el('div', { class: 'shell' }, [
      el('div', { class: 'empty-state' }, [el('h2', {}, 'Rodeo not found')])
    ]);
  }
  const classes = rodeo.classes || [];

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand-row' }, [
      el('div', { class: 'event-title' }, [
        el('h1', {}, rodeo.name),
        el('div', { class: 'event-sub' }, [
          fmtDate(rodeo.date) || 'No date',
          rodeo.location ? ' · ' + rodeo.location : ''
        ])
      ])
    ])
  ]);

  const main = el('div', { class: 'page' }, [
    classes.length === 0
      ? el('p', { class: 'muted' }, 'No events yet — check back soon.')
      : el('div', { class: 'event-grid' },
          classes.map(cls => el('a', { class: 'event-card', href: `#/standings/${rodeoId}/${cls.id}` }, [
            el('div', { class: 'event-card-top' }, [
              el('h3', {}, cls.name),
              el('span', { class: 'badge' }, disciplineLabel(cls.discipline))
            ])
          ])))
  ]);

  return el('div', { class: 'shell' }, [header, el('main', {}, [main])]);
}

function view_standings_class(rodeoId, classId) {
  const rodeo = Store.getRodeo(rodeoId);
  const cls = rodeo && Store.getClass(rodeoId, classId);
  if (!rodeo || !cls) {
    return el('div', { class: 'shell' }, [
      el('div', { class: 'empty-state' }, [el('h2', {}, 'Not found')])
    ]);
  }
  const team = isTeamDiscipline(cls.discipline);
  const entries = team ? cls.teams : cls.contestants;
  const decimals = decimalsFor(cls.discipline);

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand-row' }, [
      el('a', { class: 'icon-btn', href: `#/standings/${rodeoId}`, 'aria-label': 'Back' }, [icon('back')]),
      el('div', { class: 'event-title' }, [
        el('h1', {}, cls.name),
        el('div', { class: 'event-sub' }, [disciplineLabel(cls.discipline), ' · ', rodeo.name])
      ])
    ])
  ]);

  let main;
  if (entries.length === 0) {
    main = el('div', { class: 'empty-state' }, [
      el('p', { class: 'muted' }, 'No one has run yet — check back soon.')
    ]);
  } else {
    const ranked = [...entries].sort((a, b) => {
      const ta = Store.entryTotal(a), tb = Store.entryTotal(b);
      if (ta.total != null && tb.total != null) return ta.total - tb.total;
      if (ta.total != null) return -1;
      if (tb.total != null) return 1;
      return 0;
    });
    main = el('div', { class: 'page' }, [
      el('div', { class: 'times-list' }, ranked.map((entry, i) => standingsRowReadOnly(entry, i + 1, team, decimals)))
    ]);
  }

  return el('div', { class: 'shell' }, [header, el('main', {}, [main])]);
}

function standingsRowReadOnly(entry, rank, team, decimals) {
  const { total, hasNoTime } = Store.entryTotal(entry);
  const nameEl = team
    ? el('div', { class: 'draw-pair' }, [
        el('span', { class: 'rider header-name' }, entry.header),
        el('span', { class: 'pair-sep' }, '/'),
        el('span', { class: 'rider heeler-name' }, entry.heeler)
      ])
    : el('div', { class: 'draw-pair' }, [
        el('span', { class: 'rider header-name' }, entry.name),
        entry.back ? el('span', { class: 'pair-sep muted' }, '#' + entry.back) : null
      ]);
  const roundText = (key) => entry[key + 'NoTime'] ? 'NT' : (entry[key] != null ? entry[key].toFixed(decimals) : '—');
  return el('div', { class: 'times-row times-row-readonly' }, [
    el('span', { class: 'draw-num' }, String(rank)),
    nameEl,
    el('span', { class: 'ro-time' }, roundText('r1')),
    el('span', { class: 'ro-time' }, roundText('r2')),
    el('span', { class: 'ro-time' }, roundText('shortGo')),
    el('div', { class: 'times-total' + (hasNoTime ? ' has-no-time' : '') }, [
      el('span', { class: 'times-total-label' }, 'Total'),
      el('span', { class: 'times-total-value' },
        total != null ? total.toFixed(decimals) : (hasNoTime ? 'NT' : '—'))
    ])
  ]);
}

// ─── Sign-ups panel (team_roping classes) ──────────────────────────────────

function panel_signups(rodeo, cls) {
  const riders = cls.riders;
  const headerCount = riders.filter(r => r.isHeader).length;
  const heelerCount = riders.filter(r => r.isHeeler).length;
  const dualCount = riders.filter(r => r.isHeader && r.isHeeler).length;
  const orphanCount = riders.filter(r => !r.isHeader && !r.isHeeler).length;

  const searchInput = el('input', {
    class: 'input riders-search',
    placeholder: 'Search riders…',
    oninput: e => filterList(e.target.value)
  });

  const list = el('ul', { class: 'riders-list' });

  function rowFor(r) {
    const tags = [];
    if (r.isHeader) tags.push(el('span', { class: 'role-tag role-header' }, 'Header'));
    if (r.isHeeler) tags.push(el('span', { class: 'role-tag role-heeler' }, 'Heeler'));
    if (!r.isHeader && !r.isHeeler) tags.push(el('span', { class: 'role-tag' }, 'No role'));

    return el('li', {
      class: 'rider-row',
      dataset: { name: r.name.toLowerCase() },
      onclick: () => openRiderModal(rodeo, cls, r)
    }, [
      el('span', { class: 'rider-name' }, r.name),
      el('span', { class: 'rider-tags' }, tags),
      el('span', { class: 'icon-btn', onclick: e => {
        e.stopPropagation();
        openRiderModal(rodeo, cls, r);
      } }, [icon('edit')])
    ]);
  }

  function filterList(query) {
    const q = query.trim().toLowerCase();
    list.querySelectorAll('.rider-row').forEach(row => {
      row.hidden = q && !row.dataset.name.includes(q);
    });
  }

  if (riders.length === 0) {
    list.appendChild(el('div', { class: 'rider-empty' }, [
      el('p', {}, 'No riders yet. Click "Add Rider" to get started.')
    ]));
  } else {
    [...riders].sort((a, b) => a.name.localeCompare(b.name)).forEach(r => list.appendChild(rowFor(r)));
  }

  const dualNote = dualCount > 0
    ? el('div', { class: 'note' }, [
        el('strong', {}, `${dualCount} dual-role rider${dualCount > 1 ? 's' : ''}`),
        ' — they will rope as both header and heeler. The draw will avoid back-to-back appearances.'
      ])
    : null;

  const orphanNote = orphanCount > 0
    ? el('div', { class: 'note' }, [
        el('strong', {}, `${orphanCount} rider${orphanCount > 1 ? 's' : ''} with no role`),
        ' — assign them a role to include in the draw.'
      ])
    : null;

  return el('div', { class: 'page' }, [
    el('div', { class: 'riders-panel' }, [
      el('div', { class: 'riders-toolbar' }, [
        el('div', { class: 'riders-stats' }, [
          el('span', {}, [el('strong', {}, String(headerCount)), ' headers']),
          el('span', {}, [el('strong', {}, String(heelerCount)), ' heelers']),
          el('span', { class: 'muted' }, [el('strong', {}, String(riders.length)), ' total'])
        ]),
        searchInput,
        el('button', {
          class: 'btn btn-primary',
          onclick: () => openRiderModal(rodeo, cls, null)
        }, [icon('plus'), 'Add Rider'])
      ]),
      list
    ]),
    dualNote,
    orphanNote,
    el('div', { class: 'sticky-actions' }, [
      el('div', { class: 'muted small' }, headerCount && heelerCount
        ? `Will produce ${headerCount * heelerCount - dualCount} teams when generated`
        : 'Add at least one header and one heeler'),
      el('button', {
        class: 'btn btn-primary btn-lg',
        disabled: !(headerCount && heelerCount),
        onclick: () => {
          if (!headerCount || !heelerCount) return;
          Store.generateDraw(rodeo.id, cls.id);
          toast('Draw generated', 'success');
          navigate(`/rodeo/${rodeo.id}/class/${cls.id}/draw`);
        }
      }, [icon('play'), 'Generate Draw'])
    ])
  ]);
}

function openRiderModal(rodeo, cls, rider) {
  const isEdit = !!rider;
  let role = rider ? (rider.isHeader && rider.isHeeler ? 'both' : rider.isHeader ? 'header' : rider.isHeeler ? 'heeler' : 'header') : 'header';

  const form = el('form', { class: 'form' });
  form.innerHTML = `
    <label class="field">
      <span class="field-label">Rider name</span>
      <input class="input" name="name" required autocomplete="off" placeholder="Last, First">
    </label>
    <div class="field">
      <span class="field-label">Role</span>
      <div class="role-chooser" id="role-chooser">
        <label class="role-option" data-value="header"><input type="radio" name="role" value="header"> Header</label>
        <label class="role-option" data-value="heeler"><input type="radio" name="role" value="heeler"> Heeler</label>
        <label class="role-option" data-value="both"><input type="radio" name="role" value="both"> Both</label>
      </div>
    </div>
  `;

  const nameInput = form.querySelector('[name=name]');
  if (rider) nameInput.value = rider.name;

  const setRole = v => {
    role = v;
    form.querySelectorAll('.role-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.value === v);
      o.querySelector('input').checked = o.dataset.value === v;
    });
  };
  form.querySelectorAll('.role-option').forEach(o => {
    o.addEventListener('click', e => { e.preventDefault(); setRole(o.dataset.value); });
  });
  setRole(role);

  const apply = (close, addAnother = false) => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const flags = {
      isHeader: role === 'header' || role === 'both',
      isHeeler: role === 'heeler' || role === 'both'
    };
    if (isEdit) {
      Store.updateRider(rodeo.id, cls.id, rider.id, { name, ...flags });
      close();
      toast('Rider updated');
    } else {
      const newId = Store.addRider(rodeo.id, cls.id, { name, ...flags });
      if (newId === null) {
        toast('That name already exists', 'warn');
        return;
      }
      if (addAnother) {
        nameInput.value = '';
        nameInput.focus();
        toast(`Added ${name}`, 'success');
      } else {
        close();
        toast(`Added ${name}`, 'success');
      }
    }
  };

  const actions = isEdit
    ? [
        { label: 'Remove', class: 'btn btn-danger-ghost', onClick: async c => {
          c();
          if (await confirm(`Remove ${rider.name}?`, { confirmLabel: 'Remove', danger: true })) {
            Store.removeRider(rodeo.id, cls.id, rider.id);
            toast('Rider removed');
          }
        } },
        { label: 'Cancel', class: 'btn btn-ghost', onClick: c => c() },
        { label: 'Save', class: 'btn btn-primary', onClick: c => apply(c) }
      ]
    : [
        { label: 'Cancel', class: 'btn btn-ghost', onClick: c => c() },
        { label: 'Add & New', class: 'btn btn-secondary', onClick: c => apply(c, true) },
        { label: 'Add Rider', class: 'btn btn-primary', onClick: c => apply(c) }
      ];

  modal({ title: isEdit ? 'Edit Rider' : 'Add Rider', body: form, actions });

  form.addEventListener('submit', e => {
    e.preventDefault();
    document.querySelector('.modal-footer .btn-primary')?.click();
  });

  setTimeout(() => nameInput.focus(), 50);
}

// ─── Sign-ups panel (every other discipline — flat contestant list) ───────

function panel_signups_solo(rodeo, cls) {
  const contestants = cls.contestants;

  const searchInput = el('input', {
    class: 'input riders-search',
    placeholder: 'Search contestants…',
    oninput: e => filterList(e.target.value)
  });

  const list = el('ul', { class: 'riders-list' });

  function rowFor(c) {
    return el('li', {
      class: 'rider-row',
      dataset: { name: c.name.toLowerCase() },
      onclick: () => openContestantModal(rodeo, cls, c)
    }, [
      el('span', { class: 'rider-name' }, c.name),
      c.back ? el('span', { class: 'role-tag' }, '#' + c.back) : null,
      el('span', { class: 'icon-btn', onclick: e => {
        e.stopPropagation();
        openContestantModal(rodeo, cls, c);
      } }, [icon('edit')])
    ]);
  }

  function filterList(query) {
    const q = query.trim().toLowerCase();
    list.querySelectorAll('.rider-row').forEach(row => {
      row.hidden = q && !row.dataset.name.includes(q);
    });
  }

  if (contestants.length === 0) {
    list.appendChild(el('div', { class: 'rider-empty' }, [
      el('p', {}, 'No contestants yet. Click "Add Contestant" to get started.')
    ]));
  } else {
    [...contestants].sort((a, b) => a.name.localeCompare(b.name)).forEach(c => list.appendChild(rowFor(c)));
  }

  return el('div', { class: 'page' }, [
    el('div', { class: 'riders-panel' }, [
      el('div', { class: 'riders-toolbar' }, [
        el('div', { class: 'riders-stats' }, [
          el('span', { class: 'muted' }, [el('strong', {}, String(contestants.length)), ' total'])
        ]),
        searchInput,
        el('button', {
          class: 'btn btn-primary',
          onclick: () => openContestantModal(rodeo, cls, null)
        }, [icon('plus'), 'Add Contestant'])
      ]),
      list
    ]),
    contestants.length > 0
      ? el('div', { class: 'sticky-actions' }, [
          el('a', {
            class: 'btn btn-primary btn-lg',
            href: `#/rodeo/${rodeo.id}/class/${cls.id}/times`
          }, 'Go to Times →')
        ])
      : null
  ]);
}

function openContestantModal(rodeo, cls, contestant) {
  const isEdit = !!contestant;
  const form = el('form', { class: 'form' });
  form.innerHTML = `
    <label class="field">
      <span class="field-label">Contestant name</span>
      <input class="input" name="name" required autocomplete="off" placeholder="Last, First">
    </label>
    <label class="field">
      <span class="field-label">Back number <span class="muted">(optional)</span></span>
      <input class="input" name="back" autocomplete="off" placeholder="42">
    </label>
  `;
  const nameInput = form.querySelector('[name=name]');
  const backInput = form.querySelector('[name=back]');
  if (contestant) {
    nameInput.value = contestant.name;
    backInput.value = contestant.back || '';
  }

  const apply = (close, addAnother = false) => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const back = backInput.value.trim();
    if (isEdit) {
      Store.updateContestant(rodeo.id, cls.id, contestant.id, { name, back });
      close();
      toast('Contestant updated');
    } else {
      const newId = Store.addContestant(rodeo.id, cls.id, { name, back });
      if (newId === null) {
        toast('That name already exists', 'warn');
        return;
      }
      if (addAnother) {
        nameInput.value = '';
        backInput.value = '';
        nameInput.focus();
        toast(`Added ${name}`, 'success');
      } else {
        close();
        toast(`Added ${name}`, 'success');
      }
    }
  };

  const actions = isEdit
    ? [
        { label: 'Remove', class: 'btn btn-danger-ghost', onClick: async c => {
          c();
          if (await confirm(`Remove ${contestant.name}?`, { confirmLabel: 'Remove', danger: true })) {
            Store.removeContestant(rodeo.id, cls.id, contestant.id);
            toast('Contestant removed');
          }
        } },
        { label: 'Cancel', class: 'btn btn-ghost', onClick: c => c() },
        { label: 'Save', class: 'btn btn-primary', onClick: c => apply(c) }
      ]
    : [
        { label: 'Cancel', class: 'btn btn-ghost', onClick: c => c() },
        { label: 'Add & New', class: 'btn btn-secondary', onClick: c => apply(c, true) },
        { label: 'Add Contestant', class: 'btn btn-primary', onClick: c => apply(c) }
      ];

  modal({ title: isEdit ? 'Edit Contestant' : 'Add Contestant', body: form, actions });

  form.addEventListener('submit', e => {
    e.preventDefault();
    document.querySelector('.modal-footer .btn-primary')?.click();
  });

  setTimeout(() => nameInput.focus(), 50);
}

// ─── Draw panel (team_roping classes only) ─────────────────────────────────

function panel_draw(rodeo, cls) {
  if (cls.teams.length === 0) {
    return el('div', { class: 'page' }, [
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'empty-illustration' }, '🪢'),
        el('h2', {}, 'No draw yet'),
        el('p', { class: 'muted' }, 'Add headers and heelers to the sign-ups tab, then generate the draw.'),
        el('a', { class: 'btn btn-primary', href: `#/rodeo/${rodeo.id}/class/${cls.id}/signups` }, 'Go to Sign-ups')
      ])
    ]);
  }

  const conflictCount = cls.teams.filter(t => t.conflict).length;
  const headerCount = cls.riders.filter(r => r.isHeader).length;
  const heelerCount = cls.riders.filter(r => r.isHeeler).length;
  const skipped = headerCount * heelerCount - cls.teams.length;

  const list = el('ol', { class: 'draw-list' });
  cls.teams.forEach((t, i) => {
    list.appendChild(el('li', { class: 'draw-row' + (t.conflict ? ' is-conflict' : '') }, [
      el('span', { class: 'draw-num' }, String(i + 1)),
      el('div', { class: 'draw-pair' }, [
        el('span', { class: 'rider header-name' }, t.header),
        el('span', { class: 'pair-sep' }, '/'),
        el('span', { class: 'rider heeler-name' }, t.heeler)
      ]),
      t.conflict ? el('span', { class: 'badge badge-warning' }, [icon('warn'), 'back-to-back']) : null
    ]));
  });

  const summary = el('div', { class: 'summary-bar' }, [
    el('div', {}, [
      el('strong', {}, `${cls.teams.length} teams`),
      el('span', { class: 'muted' }, ` · ${headerCount} × ${heelerCount}`),
      skipped > 0 ? el('span', { class: 'muted' }, ` · ${skipped} self-pair${skipped > 1 ? 's' : ''} excluded`) : null,
      conflictCount > 0 ? el('span', { class: 'inline-warn' }, ` · ${conflictCount} unavoidable conflict${conflictCount > 1 ? 's' : ''}`) : null
    ]),
    el('div', { class: 'summary-actions' }, [
      el('button', {
        class: 'btn btn-ghost',
        onclick: async () => {
          if (await confirm('Re-generate the draw? This will replace the current order.', { confirmLabel: 'Re-generate' })) {
            Store.generateDraw(rodeo.id, cls.id);
            toast('Draw re-generated');
          }
        }
      }, 'Re-generate'),
      el('button', {
        class: 'btn btn-secondary',
        onclick: () => {
          const txt = cls.teams.map((t, i) => `${i + 1}. ${t.header} / ${t.heeler}`).join('\n');
          navigator.clipboard.writeText(txt).then(() => toast('Copied draw to clipboard'));
        }
      }, [icon('copy'), 'Copy'])
    ])
  ]);

  return el('div', { class: 'page' }, [summary, list]);
}

// ─── Slips panel (team_roping classes only) ────────────────────────────────

function panel_slips(rodeo, cls) {
  if (cls.teams.length === 0) {
    return el('div', { class: 'page' }, [
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'empty-illustration' }, '📄'),
        el('h2', {}, 'No slips to print'),
        el('p', { class: 'muted' }, 'Generate the draw first to produce printable time slips.'),
        el('a', { class: 'btn btn-primary', href: `#/rodeo/${rodeo.id}/class/${cls.id}/signups` }, 'Go to Sign-ups')
      ])
    ]);
  }

  const pageCount = Math.ceil(cls.teams.length / 3);
  const container = el('div', { class: 'slips-container' });

  for (let p = 0; p < pageCount; p++) {
    const page = el('div', { class: 'slip-page' });
    for (let s = 0; s < 3; s++) {
      const team = cls.teams[p * 3 + s];
      if (s > 0) page.appendChild(el('div', { class: 'cut-line' }));
      page.appendChild(team ? buildSlip(team, rodeo, cls) : el('div', { class: 'slip slip-empty' }));
    }
    container.appendChild(page);
  }

  const summary = el('div', { class: 'summary-bar no-print' }, [
    el('div', {}, [
      el('strong', {}, `Pages 1 through ${pageCount}`),
      el('span', { class: 'muted' }, ` · ${cls.teams.length} slips`)
    ]),
    el('button', { class: 'btn btn-primary', onclick: () => window.print() }, [icon('print'), 'Print Slips'])
  ]);

  return el('div', { class: 'page' }, [summary, container]);
}

function buildSlip(team, rodeo, cls) {
  return el('div', { class: 'slip' }, [
    el('div', { class: 'slip-header' }, [
      el('div', { class: 'slip-event' }, `${rodeo.name} — ${cls.name}`),
      rodeo.date ? el('div', { class: 'slip-date' }, fmtDate(rodeo.date)) : null
    ]),
    el('div', { class: 'slip-names' }, [
      el('div', { class: 'slip-rider' }, [
        el('div', { class: 'slip-role' }, 'Header'),
        el('div', { class: 'slip-name' }, team.header)
      ]),
      el('div', { class: 'slip-rider' }, [
        el('div', { class: 'slip-role' }, 'Heeler'),
        el('div', { class: 'slip-name' }, team.heeler)
      ])
    ]),
    el('div', { class: 'slip-scores' }, [
      slipRow('Round 1'),
      slipRow('Round 2'),
      slipRow('Short Go'),
      slipRow('Total', true)
    ])
  ]);
}

function slipRow(label, isTotal) {
  return el('div', { class: 'slip-row' + (isTotal ? ' slip-total' : '') }, [
    el('span', { class: 'slip-row-label' }, label),
    el('span', { class: 'slip-row-line' })
  ]);
}

// ─── Times panel (every discipline — teams or solo contestants share the
//     same round-scoring shape, see Store.entryTotal/setEntryTime) ────────
// Live time entry — the scorekeeper enters Round 1 / Round 2 / Short Go as
// runs happen (or right after, from the paper slip), and sees a running
// Total/standings immediately instead of re-typing everything from slips
// later.

// View-only preference (not persisted data), so declared at module scope to
// survive the full re-render every Store change triggers.
let timesSort = 'draw';

function panel_times(rodeo, cls) {
  const team = isTeamDiscipline(cls.discipline);
  const entries = team ? cls.teams : cls.contestants;

  if (entries.length === 0) {
    return el('div', { class: 'page' }, [
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'empty-illustration' }, '⏱️'),
        el('h2', {}, team ? 'No teams to score yet' : 'No contestants to score yet'),
        el('p', { class: 'muted' }, team
          ? 'Generate the draw first, then enter times here as runs happen.'
          : 'Add contestants first, then enter times here as runs happen.'),
        el('a', {
          class: 'btn btn-primary',
          href: `#/rodeo/${rodeo.id}/class/${cls.id}/${team ? 'draw' : 'signups'}`
        }, team ? 'Go to Draw' : 'Go to Sign-ups')
      ])
    ]);
  }

  const decimals = decimalsFor(cls.discipline);
  const rows = timesSort === 'standings'
    ? [...entries].sort((a, b) => {
        const ta = Store.entryTotal(a), tb = Store.entryTotal(b);
        if (ta.total != null && tb.total != null) return ta.total - tb.total;
        if (ta.total != null) return -1;
        if (tb.total != null) return 1;
        return 0;
      })
    : entries;

  const list = el('div', { class: 'times-list' });
  rows.forEach(entry => {
    const { total, hasNoTime } = Store.entryTotal(entry);
    const nameEl = team
      ? el('div', { class: 'draw-pair' }, [
          el('span', { class: 'rider header-name' }, entry.header),
          el('span', { class: 'pair-sep' }, '/'),
          el('span', { class: 'rider heeler-name' }, entry.heeler)
        ])
      : el('div', { class: 'draw-pair' }, [
          el('span', { class: 'rider header-name' }, entry.name),
          entry.back ? el('span', { class: 'pair-sep muted' }, '#' + entry.back) : null
        ]);
    list.appendChild(el('div', { class: 'times-row' }, [
      el('span', { class: 'draw-num' }, String(entries.indexOf(entry) + 1)),
      nameEl,
      timeField(rodeo, cls, entry, 'r1', 'R1', decimals),
      timeField(rodeo, cls, entry, 'r2', 'R2', decimals),
      timeField(rodeo, cls, entry, 'shortGo', 'SG', decimals),
      el('div', { class: 'times-total' + (hasNoTime ? ' has-no-time' : '') }, [
        el('span', { class: 'times-total-label' }, 'Total'),
        el('span', { class: 'times-total-value' },
          total != null ? total.toFixed(decimals) : (hasNoTime ? 'NT' : '—'))
      ])
    ]));
  });

  const summary = el('div', { class: 'summary-bar' }, [
    el('div', {}, [el('strong', {}, `${entries.length} ${team ? 'teams' : 'contestants'}`)]),
    el('div', { class: 'summary-actions' }, [
      el('button', {
        class: 'btn btn-ghost' + (timesSort === 'draw' ? ' is-active' : ''),
        onclick: () => { timesSort = 'draw'; render(); }
      }, team ? 'Draw order' : 'Sign-up order'),
      el('button', {
        class: 'btn btn-ghost' + (timesSort === 'standings' ? ' is-active' : ''),
        onclick: () => { timesSort = 'standings'; render(); }
      }, 'Standings')
    ])
  ]);

  return el('div', { class: 'page' }, [summary, list]);
}

// A single R1/R2/Short-Go field: a time input plus a "no time" (didn't catch)
// toggle. Uses onchange (commits on blur/Enter), not oninput — every Store
// write triggers a full app re-render (see render()/Store.subscribe below),
// which would otherwise steal focus back after every keystroke.
function timeField(rodeo, cls, entry, round, label, decimals) {
  const noTimeKey = round + 'NoTime';
  const isNoTime = !!entry[noTimeKey];
  const input = el('input', {
    class: 'input time-input',
    type: 'number',
    step: stepFor(cls.discipline),
    min: '0',
    inputmode: 'decimal',
    placeholder: (0).toFixed(decimals),
    value: entry[round] != null ? String(entry[round]) : '',
    disabled: isNoTime,
    onchange: e => {
      const v = parseFloat(e.target.value);
      Store.setEntryTime(rodeo.id, cls.id, entry.id, round, { seconds: isNaN(v) ? null : v, noTime: false });
    }
  });
  const ntBtn = el('button', {
    class: 'nt-toggle' + (isNoTime ? ' is-active' : ''),
    type: 'button',
    title: 'No time (didn’t catch)',
    onclick: () => {
      Store.setEntryTime(rodeo.id, cls.id, entry.id, round, { seconds: null, noTime: !isNoTime });
    }
  }, 'NT');
  return el('div', { class: 'time-field' }, [
    el('label', { class: 'time-field-label' }, label),
    el('div', { class: 'time-field-row' }, [input, ntBtn])
  ]);
}

// ─── Modals: Rodeo ──────────────────────────────────────────────────────────

function openCreateRodeoModal() {
  const today = new Date().toISOString().slice(0, 10);
  const form = el('form', { class: 'form' });
  form.innerHTML = `
    <label class="field">
      <span class="field-label">Name</span>
      <input class="input" name="name" required placeholder="Spring Rodeo 2026" autocomplete="off">
    </label>
    <label class="field">
      <span class="field-label">Date</span>
      <input class="input" name="date" type="date" value="${today}">
    </label>
    <label class="field">
      <span class="field-label">Location <span class="muted">(optional)</span></span>
      <input class="input" name="location" placeholder="Bozeman, MT" autocomplete="off">
    </label>
  `;

  modal({
    title: 'New Rodeo',
    body: form,
    actions: [
      { label: 'Cancel', class: 'btn btn-ghost', onClick: c => c() },
      { label: 'Create Rodeo', class: 'btn btn-primary', onClick: c => {
        const fd = new FormData(form);
        const name = (fd.get('name') || '').toString().trim();
        if (!name) { form.querySelector('[name=name]').focus(); return; }
        const id = Store.createRodeo({
          name,
          date: (fd.get('date') || '').toString(),
          location: (fd.get('location') || '').toString().trim()
        });
        c();
        navigate('/rodeo/' + id);
        toast('Rodeo created');
      } }
    ]
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn = document.querySelector('.modal-footer .btn-primary');
    if (btn) btn.click();
  });
}

function openEditRodeoModal(rodeo) {
  const form = el('form', { class: 'form' });
  form.innerHTML = `
    <label class="field">
      <span class="field-label">Name</span>
      <input class="input" name="name" required value="${escHtml(rodeo.name)}">
    </label>
    <label class="field">
      <span class="field-label">Date</span>
      <input class="input" name="date" type="date" value="${escHtml(rodeo.date || '')}">
    </label>
    <label class="field">
      <span class="field-label">Location</span>
      <input class="input" name="location" value="${escHtml(rodeo.location || '')}">
    </label>
    <label class="field">
      <span class="field-label">Status</span>
      <select class="input" name="status">
        <option value="draft" ${rodeo.status === 'draft' ? 'selected' : ''}>Draft</option>
        <option value="running" ${rodeo.status === 'running' ? 'selected' : ''}>Running</option>
        <option value="closed" ${rodeo.status === 'closed' ? 'selected' : ''}>Closed</option>
      </select>
    </label>
  `;

  modal({
    title: 'Edit Rodeo',
    body: form,
    actions: [
      { label: 'Delete Rodeo', class: 'btn btn-danger-ghost', onClick: async c => {
        c();
        if (await confirm(`Delete "${rodeo.name}"? This can't be undone.`, { confirmLabel: 'Delete', danger: true })) {
          Store.deleteRodeo(rodeo.id);
          navigate('/');
          toast('Rodeo deleted');
        }
      } },
      { label: 'Duplicate', class: 'btn btn-ghost', onClick: c => {
        const id = Store.duplicateRodeo(rodeo.id);
        c();
        if (id) { navigate('/rodeo/' + id); toast('Rodeo duplicated'); }
      } },
      { label: 'Save', class: 'btn btn-primary', onClick: c => {
        const fd = new FormData(form);
        const name = (fd.get('name') || '').toString().trim();
        if (!name) return;
        Store.updateRodeo(rodeo.id, {
          name,
          date: (fd.get('date') || '').toString(),
          location: (fd.get('location') || '').toString().trim(),
          status: (fd.get('status') || 'draft').toString()
        });
        c();
        toast('Rodeo updated');
      } }
    ]
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    document.querySelector('.modal-footer .btn-primary')?.click();
  });
}

// ─── Modals: Class ──────────────────────────────────────────────────────────

function openCreateClassModal(rodeo) {
  let discipline = DISCIPLINES[0].code;
  const form = el('form', { class: 'form' });
  form.innerHTML = `
    <label class="field">
      <span class="field-label">Class name</span>
      <input class="input" name="name" autocomplete="off" placeholder="e.g. 1D Roping, Open Barrels">
    </label>
    <div class="field">
      <span class="field-label">Discipline</span>
      <div class="role-chooser discipline-chooser" id="discipline-chooser">
        ${DISCIPLINES.map(d => `<label class="role-option" data-value="${d.code}"><input type="radio" name="discipline" value="${d.code}"> ${d.label}</label>`).join('')}
      </div>
    </div>
  `;
  const nameInput = form.querySelector('[name=name]');

  const setDiscipline = v => {
    discipline = v;
    form.querySelectorAll('.role-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.value === v);
      o.querySelector('input').checked = o.dataset.value === v;
    });
    if (!nameInput.dataset.touched) nameInput.value = disciplineLabel(v);
  };
  form.querySelectorAll('.role-option').forEach(o => {
    o.addEventListener('click', e => { e.preventDefault(); setDiscipline(o.dataset.value); });
  });
  nameInput.addEventListener('input', () => { nameInput.dataset.touched = '1'; });
  setDiscipline(discipline);

  modal({
    title: 'Add Class',
    body: form,
    actions: [
      { label: 'Cancel', class: 'btn btn-ghost', onClick: c => c() },
      { label: 'Add Class', class: 'btn btn-primary', onClick: c => {
        const name = nameInput.value.trim();
        const id = Store.createClass(rodeo.id, { name, discipline });
        c();
        if (id) { navigate(`/rodeo/${rodeo.id}/class/${id}/signups`); toast('Class added'); }
      } }
    ]
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    document.querySelector('.modal-footer .btn-primary')?.click();
  });
}

function openEditClassModal(rodeo, cls) {
  const form = el('form', { class: 'form' });
  form.innerHTML = `
    <label class="field">
      <span class="field-label">Class name</span>
      <input class="input" name="name" required value="${escHtml(cls.name)}">
    </label>
    <p class="muted small">Discipline: ${escHtml(disciplineLabel(cls.discipline))} (can't be changed after entries exist)</p>
  `;

  modal({
    title: 'Edit Class',
    body: form,
    actions: [
      { label: 'Delete Class', class: 'btn btn-danger-ghost', onClick: async c => {
        c();
        if (await confirm(`Delete "${cls.name}"? This can't be undone.`, { confirmLabel: 'Delete', danger: true })) {
          Store.deleteClass(rodeo.id, cls.id);
          navigate('/rodeo/' + rodeo.id);
          toast('Class deleted');
        }
      } },
      { label: 'Cancel', class: 'btn btn-ghost', onClick: c => c() },
      { label: 'Save', class: 'btn btn-primary', onClick: c => {
        const name = form.querySelector('[name=name]').value.trim();
        if (!name) return;
        Store.updateClass(rodeo.id, cls.id, { name });
        c();
        toast('Class updated');
      } }
    ]
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    document.querySelector('.modal-footer .btn-primary')?.click();
  });
}

// ─── Render ─────────────────────────────────────────────────────────────────

function render() {
  const route = parseRoute();
  const root = document.getElementById('app');
  let view;
  if (route.name === 'class') view = view_class(route.rodeoId, route.classId, route.tab);
  else if (route.name === 'rodeo') view = view_rodeo(route.rodeoId);
  else if (route.name === 'standingsClass') view = view_standings_class(route.rodeoId, route.classId);
  else if (route.name === 'standingsRodeo') view = view_standings_rodeo(route.rodeoId);
  else view = view_rodeos();
  root.innerHTML = '';
  root.appendChild(view);
}

function renderLoading() {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'shell' }, [
    el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-illustration' }, '🤠'),
      el('p', { class: 'muted' }, 'Connecting…')
    ])
  ]));
}

window.addEventListener('hashchange', render);
Store.subscribe(render);
// Store.ready resolves once the first fetch from the shared backend
// completes (see store.js Store.init()) — before that there's nothing to
// render yet, so show a brief connecting state instead of an empty list.
renderLoading();
Store.ready.then(render);
