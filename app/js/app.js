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

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!hash) return { name: 'events' };
  const parts = hash.split('/');
  if (parts[0] === 'event' && parts[1]) {
    return { name: 'event', id: parts[1], tab: parts[2] || 'signups' };
  }
  return { name: 'events' };
}

function navigate(path) {
  location.hash = path;
}

// ─── Views ──────────────────────────────────────────────────────────────────

function view_events() {
  const events = Store.listEvents();

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('div', { class: 'brand-mark' }, 'R'),
      el('div', { class: 'brand-text' }, [
        el('div', { class: 'brand-name' }, 'RodeoLife'),
        el('div', { class: 'brand-tag' }, 'Team Roping Manager')
      ])
    ]),
    el('div', { class: 'header-actions' }, [
      el('button', { class: 'btn btn-primary', onclick: openCreateEventModal }, [
        icon('plus'), 'New Event'
      ])
    ])
  ]);

  let main;
  if (events.length === 0) {
    main = el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-illustration' }, '🤠'),
      el('h2', {}, 'No events yet'),
      el('p', { class: 'muted' }, 'Create your first event to start managing sign-ups, draws, and time slips.'),
      el('button', { class: 'btn btn-primary btn-lg', onclick: openCreateEventModal }, [icon('plus'), 'Create Event'])
    ]);
  } else {
    const grid = el('div', { class: 'event-grid' });
    for (const evt of events) grid.appendChild(eventCard(evt));
    main = el('div', { class: 'page' }, [
      el('div', { class: 'page-header' }, [
        el('h1', {}, 'Events'),
        el('p', { class: 'muted' }, `${events.length} event${events.length === 1 ? '' : 's'}`)
      ]),
      grid
    ]);
  }

  return el('div', { class: 'shell' }, [header, el('main', {}, [main])]);
}

function eventCard(evt) {
  const teamCount = evt.teams.length;
  const headerCount = evt.riders.filter(r => r.isHeader).length;
  const heelerCount = evt.riders.filter(r => r.isHeeler).length;
  const sub = [
    fmtDate(evt.date) || 'No date',
    evt.location
  ].filter(Boolean).join(' · ');

  const meta = [
    `${headerCount} headers`,
    `${heelerCount} heelers`,
    teamCount ? `${teamCount} teams` : null
  ].filter(Boolean).join(' · ');

  return el('a', {
    class: 'event-card',
    href: '#/event/' + evt.id
  }, [
    el('div', { class: 'event-card-top' }, [
      el('h3', {}, evt.name),
      statusBadge(evt.status)
    ]),
    el('div', { class: 'event-card-sub muted' }, sub),
    el('div', { class: 'event-card-meta' }, meta),
    el('div', { class: 'event-card-foot muted' }, 'Edited ' + relTime(evt.modified))
  ]);
}

function statusBadge(status) {
  const labels = { draft: 'Draft', running: 'Running', closed: 'Closed' };
  return el('span', { class: 'badge badge-' + status }, labels[status] || status);
}

// ─── Event detail view ──────────────────────────────────────────────────────

function view_event(id, tab) {
  const evt = Store.getEvent(id);
  if (!evt) {
    return el('div', { class: 'shell' }, [
      el('div', { class: 'empty-state' }, [
        el('h2', {}, 'Event not found'),
        el('button', { class: 'btn btn-secondary', onclick: () => navigate('/') }, 'Back to Events')
      ])
    ]);
  }

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand-row' }, [
      el('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Back' }, [icon('back')]),
      el('div', { class: 'event-title' }, [
        el('h1', {}, evt.name),
        el('div', { class: 'event-sub' }, [
          fmtDate(evt.date) || 'No date',
          evt.location ? ' · ' + evt.location : '',
          ' · ',
          statusBadge(evt.status)
        ])
      ])
    ]),
    el('div', { class: 'header-actions' }, eventActions(evt))
  ]);

  const tabs = el('nav', { class: 'tabs' }, [
    tabLink('Sign-ups', `#/event/${id}/signups`, tab === 'signups', `${evt.riders.length}`),
    tabLink('Draw', `#/event/${id}/draw`, tab === 'draw', evt.teams.length || ''),
    tabLink('Times', `#/event/${id}/times`, tab === 'times'),
    tabLink('Slips', `#/event/${id}/slips`, tab === 'slips')
  ]);

  let panel;
  if (tab === 'draw') panel = panel_draw(evt);
  else if (tab === 'times') panel = panel_times(evt);
  else if (tab === 'slips') panel = panel_slips(evt);
  else panel = panel_signups(evt);

  return el('div', { class: 'shell' }, [header, tabs, el('main', {}, [panel])]);
}

function tabLink(label, href, active, count) {
  return el('a', { class: 'tab' + (active ? ' active' : ''), href }, [
    label,
    count !== undefined && count !== '' ? el('span', { class: 'tab-count' }, String(count)) : null
  ]);
}

function eventActions(evt) {
  const actions = [];
  actions.push(el('button', { class: 'btn btn-ghost', onclick: () => openEditEventModal(evt) }, [icon('edit'), 'Edit']));
  if (evt.status !== 'closed') {
    actions.push(el('button', { class: 'btn btn-ghost', onclick: () => Store.setStatus(evt.id, 'closed') && toast('Event closed') }, [icon('archive'), 'Close']));
  } else {
    actions.push(el('button', { class: 'btn btn-ghost', onclick: () => { Store.setStatus(evt.id, 'running'); toast('Event reopened'); } }, [icon('play'), 'Reopen']));
  }
  return actions;
}

// ─── Sign-ups panel ─────────────────────────────────────────────────────────

function panel_signups(evt) {
  const riders = evt.riders;
  const headerCount = riders.filter(r => r.isHeader).length;
  const heelerCount = riders.filter(r => r.isHeeler).length;
  const dualCount = riders.filter(r => r.isHeader && r.isHeeler).length;
  const orphanCount = riders.filter(r => !r.isHeader && !r.isHeeler).length;

  // Filter / search
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
      onclick: () => openRiderModal(evt, r)
    }, [
      el('span', { class: 'rider-name' }, r.name),
      el('span', { class: 'rider-tags' }, tags),
      el('span', { class: 'icon-btn', onclick: e => {
        e.stopPropagation();
        openRiderModal(evt, r);
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
          onclick: () => openRiderModal(evt, null)
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
          Store.generateDraw(evt.id);
          toast('Draw generated', 'success');
          navigate('/event/' + evt.id + '/draw');
        }
      }, [icon('play'), 'Generate Draw'])
    ])
  ]);
}

function openRiderModal(evt, rider) {
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
      Store.updateRider(evt.id, rider.id, { name, ...flags });
      close();
      toast('Rider updated');
    } else {
      const newId = Store.addRider(evt.id, { name, ...flags });
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
            Store.removeRider(evt.id, rider.id);
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

// ─── Draw panel ─────────────────────────────────────────────────────────────

function panel_draw(evt) {
  if (evt.teams.length === 0) {
    return el('div', { class: 'page' }, [
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'empty-illustration' }, '🪢'),
        el('h2', {}, 'No draw yet'),
        el('p', { class: 'muted' }, 'Add headers and heelers to the sign-ups tab, then generate the draw.'),
        el('a', { class: 'btn btn-primary', href: `#/event/${evt.id}/signups` }, 'Go to Sign-ups')
      ])
    ]);
  }

  const conflictCount = evt.teams.filter(t => t.conflict).length;
  const headerCount = evt.riders.filter(r => r.isHeader).length;
  const heelerCount = evt.riders.filter(r => r.isHeeler).length;
  const skipped = headerCount * heelerCount - evt.teams.length;

  const list = el('ol', { class: 'draw-list' });
  evt.teams.forEach((t, i) => {
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
      el('strong', {}, `${evt.teams.length} teams`),
      el('span', { class: 'muted' }, ` · ${headerCount} × ${heelerCount}`),
      skipped > 0 ? el('span', { class: 'muted' }, ` · ${skipped} self-pair${skipped > 1 ? 's' : ''} excluded`) : null,
      conflictCount > 0 ? el('span', { class: 'inline-warn' }, ` · ${conflictCount} unavoidable conflict${conflictCount > 1 ? 's' : ''}`) : null
    ]),
    el('div', { class: 'summary-actions' }, [
      el('button', {
        class: 'btn btn-ghost',
        onclick: async () => {
          if (await confirm('Re-generate the draw? This will replace the current order.', { confirmLabel: 'Re-generate' })) {
            Store.generateDraw(evt.id);
            toast('Draw re-generated');
          }
        }
      }, 'Re-generate'),
      el('button', {
        class: 'btn btn-secondary',
        onclick: () => {
          const txt = evt.teams.map((t, i) => `${i + 1}. ${t.header} / ${t.heeler}`).join('\n');
          navigator.clipboard.writeText(txt).then(() => toast('Copied draw to clipboard'));
        }
      }, [icon('copy'), 'Copy'])
    ])
  ]);

  return el('div', { class: 'page' }, [summary, list]);
}

// ─── Slips panel ────────────────────────────────────────────────────────────

function panel_slips(evt) {
  if (evt.teams.length === 0) {
    return el('div', { class: 'page' }, [
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'empty-illustration' }, '📄'),
        el('h2', {}, 'No slips to print'),
        el('p', { class: 'muted' }, 'Generate the draw first to produce printable time slips.'),
        el('a', { class: 'btn btn-primary', href: `#/event/${evt.id}/signups` }, 'Go to Sign-ups')
      ])
    ]);
  }

  const pageCount = Math.ceil(evt.teams.length / 3);
  const container = el('div', { class: 'slips-container' });

  for (let p = 0; p < pageCount; p++) {
    const page = el('div', { class: 'slip-page' });
    for (let s = 0; s < 3; s++) {
      const team = evt.teams[p * 3 + s];
      if (s > 0) page.appendChild(el('div', { class: 'cut-line' }));
      page.appendChild(team ? buildSlip(team, evt) : el('div', { class: 'slip slip-empty' }));
    }
    container.appendChild(page);
  }

  const summary = el('div', { class: 'summary-bar no-print' }, [
    el('div', {}, [
      el('strong', {}, `Pages 1 through ${pageCount}`),
      el('span', { class: 'muted' }, ` · ${evt.teams.length} slips`)
    ]),
    el('button', { class: 'btn btn-primary', onclick: () => window.print() }, [icon('print'), 'Print Slips'])
  ]);

  return el('div', { class: 'page' }, [summary, container]);
}

function buildSlip(team, evt) {
  return el('div', { class: 'slip' }, [
    el('div', { class: 'slip-header' }, [
      el('div', { class: 'slip-event' }, evt.name),
      evt.date ? el('div', { class: 'slip-date' }, fmtDate(evt.date)) : null
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

// ─── Times panel ────────────────────────────────────────────────────────────
// Live time entry — the scorekeeper enters Round 1 / Round 2 / Short Go as runs
// happen (or right after, from the paper slip), and sees a running Total/
// standings immediately instead of Toni re-typing everything from slips later.

// View-only preference (not persisted event data), so declared at module scope
// to survive the full re-render every Store change triggers.
let timesSort = 'draw';

function panel_times(evt) {
  if (evt.teams.length === 0) {
    return el('div', { class: 'page' }, [
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'empty-illustration' }, '⏱️'),
        el('h2', {}, 'No teams to score yet'),
        el('p', { class: 'muted' }, 'Generate the draw first, then enter times here as runs happen.'),
        el('a', { class: 'btn btn-primary', href: `#/event/${evt.id}/draw` }, 'Go to Draw')
      ])
    ]);
  }

  const rows = timesSort === 'standings'
    ? [...evt.teams].sort((a, b) => {
        const ta = Store.teamTotal(a), tb = Store.teamTotal(b);
        if (ta.total != null && tb.total != null) return ta.total - tb.total;
        if (ta.total != null) return -1;
        if (tb.total != null) return 1;
        return 0;
      })
    : evt.teams;

  const list = el('div', { class: 'times-list' });
  rows.forEach(t => {
    const { total, hasNoTime } = Store.teamTotal(t);
    list.appendChild(el('div', { class: 'times-row' }, [
      el('span', { class: 'draw-num' }, String(evt.teams.indexOf(t) + 1)),
      el('div', { class: 'draw-pair' }, [
        el('span', { class: 'rider header-name' }, t.header),
        el('span', { class: 'pair-sep' }, '/'),
        el('span', { class: 'rider heeler-name' }, t.heeler)
      ]),
      timeField(evt, t, 'r1', 'R1'),
      timeField(evt, t, 'r2', 'R2'),
      timeField(evt, t, 'shortGo', 'SG'),
      el('div', { class: 'times-total' + (hasNoTime ? ' has-no-time' : '') }, [
        el('span', { class: 'times-total-label' }, 'Total'),
        el('span', { class: 'times-total-value' },
          total != null ? total.toFixed(2) : (hasNoTime ? 'NT' : '—'))
      ])
    ]));
  });

  const summary = el('div', { class: 'summary-bar' }, [
    el('div', {}, [el('strong', {}, `${evt.teams.length} teams`)]),
    el('div', { class: 'summary-actions' }, [
      el('button', {
        class: 'btn btn-ghost' + (timesSort === 'draw' ? ' is-active' : ''),
        onclick: () => { timesSort = 'draw'; render(); }
      }, 'Draw order'),
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
function timeField(evt, team, round, label) {
  const noTimeKey = round + 'NoTime';
  const isNoTime = !!team[noTimeKey];
  const input = el('input', {
    class: 'input time-input',
    type: 'number',
    step: '0.01',
    min: '0',
    inputmode: 'decimal',
    placeholder: '0.00',
    value: team[round] != null ? String(team[round]) : '',
    disabled: isNoTime,
    onchange: e => {
      const v = parseFloat(e.target.value);
      Store.setTeamTime(evt.id, team.id, round, { seconds: isNaN(v) ? null : v, noTime: false });
    }
  });
  const ntBtn = el('button', {
    class: 'nt-toggle' + (isNoTime ? ' is-active' : ''),
    type: 'button',
    title: 'No time (didn’t catch)',
    onclick: () => {
      Store.setTeamTime(evt.id, team.id, round, { seconds: null, noTime: !isNoTime });
    }
  }, 'NT');
  return el('div', { class: 'time-field' }, [
    el('label', { class: 'time-field-label' }, label),
    el('div', { class: 'time-field-row' }, [input, ntBtn])
  ]);
}

// ─── Modals ─────────────────────────────────────────────────────────────────

function openCreateEventModal() {
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

  const close = modal({
    title: 'New Event',
    body: form,
    actions: [
      { label: 'Cancel', class: 'btn btn-ghost', onClick: c => c() },
      { label: 'Create Event', class: 'btn btn-primary', onClick: c => {
        const fd = new FormData(form);
        const name = (fd.get('name') || '').toString().trim();
        if (!name) { form.querySelector('[name=name]').focus(); return; }
        const id = Store.createEvent({
          name,
          date: (fd.get('date') || '').toString(),
          location: (fd.get('location') || '').toString().trim()
        });
        c();
        navigate('/event/' + id + '/signups');
        toast('Event created');
      } }
    ]
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn = document.querySelector('.modal-footer .btn-primary');
    if (btn) btn.click();
  });
}

function openEditEventModal(evt) {
  const form = el('form', { class: 'form' });
  form.innerHTML = `
    <label class="field">
      <span class="field-label">Name</span>
      <input class="input" name="name" required value="${escHtml(evt.name)}">
    </label>
    <label class="field">
      <span class="field-label">Date</span>
      <input class="input" name="date" type="date" value="${escHtml(evt.date || '')}">
    </label>
    <label class="field">
      <span class="field-label">Location</span>
      <input class="input" name="location" value="${escHtml(evt.location || '')}">
    </label>
    <label class="field">
      <span class="field-label">Status</span>
      <select class="input" name="status">
        <option value="draft" ${evt.status === 'draft' ? 'selected' : ''}>Draft</option>
        <option value="running" ${evt.status === 'running' ? 'selected' : ''}>Running</option>
        <option value="closed" ${evt.status === 'closed' ? 'selected' : ''}>Closed</option>
      </select>
    </label>
  `;

  const close = modal({
    title: 'Edit Event',
    body: form,
    actions: [
      { label: 'Delete Event', class: 'btn btn-danger-ghost', onClick: async c => {
        c();
        if (await confirm(`Delete "${evt.name}"? This can't be undone.`, { confirmLabel: 'Delete', danger: true })) {
          Store.deleteEvent(evt.id);
          navigate('/');
          toast('Event deleted');
        }
      } },
      { label: 'Duplicate', class: 'btn btn-ghost', onClick: c => {
        const id = Store.duplicateEvent(evt.id);
        c();
        if (id) { navigate('/event/' + id + '/signups'); toast('Event duplicated'); }
      } },
      { label: 'Save', class: 'btn btn-primary', onClick: c => {
        const fd = new FormData(form);
        const name = (fd.get('name') || '').toString().trim();
        if (!name) return;
        Store.updateEvent(evt.id, {
          name,
          date: (fd.get('date') || '').toString(),
          location: (fd.get('location') || '').toString().trim(),
          status: (fd.get('status') || 'draft').toString()
        });
        c();
        toast('Event updated');
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
  if (route.name === 'event') view = view_event(route.id, route.tab);
  else view = view_events();
  root.innerHTML = '';
  root.appendChild(view);
}

window.addEventListener('hashchange', render);
Store.subscribe(render);
render();
