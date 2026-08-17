/**
 * ================================================================
 * APP.JS
 * ================================================================
 * This is the "controller" layer: it is the only file that touches
 * the DOM (document.querySelector, innerHTML, addEventListener...).
 * It reads/writes data through window.DataLayer (storage.js),
 * schedules cards through window.SRS (srs.js), and drives the
 * countdown through window.PomodoroTimer (pomodoro.js).
 *
 * Architecture in one sentence: storage.js and srs.js know about
 * DATA, pomodoro.js knows about TIME, and app.js knows about the
 * SCREEN — each file has one job.
 *
 * State is kept simple on purpose: `state.activeSubjectId` filters
 * everything currently on screen, `state.currentTab` says which
 * <section class="view"> is visible.
 * ================================================================
 */

const { Subject, Note, Flashcard, Session, Settings } = window.DataLayer;

const state = {
  activeSubjectId: 'all',
  currentTab: 'dashboard',
  reviewMode: 'map',     // 'map' (mind map, default) or 'cards' (sequential flip queue)
  reviewQueue: [],       // cards left to review in this session (cards mode)
  reviewShowingBack: false,
  mapZoom: 1,
  mapPan: { x: 0, y: 0 },
  timer: null,           // will hold a PomodoroTimer instance
};

/* ================================================================
 * SEED DATA
 * On the very first visit (empty localStorage), we create a couple
 * of example subjects/cards so the app isn't a blank, confusing
 * screen. This only runs once — as soon as real data exists, this
 * function does nothing.
 * ================================================================ */
function seedIfEmpty() {
  if (Subject.all().length > 0) return;

  const s1 = Subject.add('Inglês', '#F2A65A');
  const s2 = Subject.add('Programação', '#6FCF97');

  Note.add(s1.id, 'Phrasal verbs úteis', 'give up = desistir\nfigure out = descobrir/entender\nlook forward to = ansiar por');
  Flashcard.add(s1.id, 'O que significa "figure out"?', 'Descobrir, entender algo depois de pensar.');
  Flashcard.add(s2.id, 'O que é Spaced Repetition?', 'Técnica de revisão em intervalos crescentes, baseada em quando você provavelmente vai esquecer.');
}

/* ================================================================
 * SUBJECT COLOR PALETTE (used when creating a new subject)
 * ================================================================ */
const SUBJECT_COLORS = ['#F2A65A', '#6FCF97', '#7FB3F2', '#E4636F', '#C08AF2', '#F2E07F'];

/* ================================================================
 * THEME ("🎨 Personalizar")
 * ================================================================
 * Everything here is purely cosmetic -- it changes how the app
 * LOOKS, never what it does. Settings are read once at startup and
 * re-applied instantly whenever the person changes them in the
 * customize modal, by writing straight to CSS custom properties on
 * <html> (which every other stylesheet rule already reads from,
 * since the whole app was built on CSS variables from day one --
 * see the ":root" block at the top of css/style.css). No page
 * reload needed.
 * ================================================================ */
const ACCENT_PRESETS = [
  { name: 'Âmbar (padrão)', value: '#F2A65A' },
  { name: 'Verde-menta', value: '#6FCF97' },
  { name: 'Azul-céu', value: '#7FB3F2' },
  { name: 'Coral', value: '#E4636F' },
  { name: 'Lilás', value: '#C08AF2' },
  { name: 'Amarelo-sol', value: '#F2E07F' },
  { name: 'Rosa-chiclete', value: '#F28FB0' },
];
const RADIUS_PRESETS = { sharp: { radius: '6px', sm: '4px', lg: '8px' }, normal: { radius: '16px', sm: '10px', lg: '20px' }, round: { radius: '26px', sm: '16px', lg: '30px' } };
// These are the ROOT font-size (the "rem base" -- see css/style.css
// section 2). Every text size in the whole app is written in rem,
// so changing this one number scales every piece of UI text
// together: buttons, card text, mind map nodes, titles, all of it.
const FONT_SIZE_PRESETS = { small: '14px', normal: '16px', large: '18px' };

/** Lightens a hex color toward white by `amount` (0-1) -- used to
 * derive the secondary gradient shade (--accent-2) from whatever
 * single accent color the person picks, so we don't need them to
 * also pick a second color just for gradients/highlights. */
function lightenHex(hex, amount) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Applies the current theme settings to the page. Called once at
 * startup and again every time the customize modal saves a change. */
function applyTheme(theme) {
  const root = document.documentElement.style;
  root.setProperty('--accent', theme.accent);
  root.setProperty('--accent-2', lightenHex(theme.accent, 0.22));
  root.setProperty('--accent-soft', theme.accent + '1F');
  root.setProperty('--accent-ring', theme.accent + '55');

  const r = RADIUS_PRESETS[theme.radius] || RADIUS_PRESETS.normal;
  root.setProperty('--radius', r.radius);
  root.setProperty('--radius-sm', r.sm);
  root.setProperty('--radius-lg', r.lg);

  document.documentElement.style.fontSize = FONT_SIZE_PRESETS[theme.fontSize] || FONT_SIZE_PRESETS.normal;
  document.body.classList.toggle('colorize-subjects', !!theme.colorBySubject);
}

function openCustomizeModal() {
  const theme = Settings.get().theme;

  const swatches = ACCENT_PRESETS.map((p) => `
    <button class="theme-swatch ${p.value.toLowerCase() === theme.accent.toLowerCase() ? 'is-selected' : ''}"
            style="background:${p.value}" data-accent="${p.value}" title="${p.name}" aria-label="${p.name}"></button>
  `).join('');

  openModal(`
    <h3>🎨 Personalizar</h3>
    <p class="empty-state" style="text-align:left;padding:0;background:none;border:none;margin:-6px 0 2px;">
      Deixa do seu jeito -- isso só muda a aparência, nada do que você já criou é afetado.
    </p>

    <div class="theme-section">
      <span>Cor principal</span>
      <div class="theme-swatches" id="theme-swatches">
        ${swatches}
        <label class="theme-swatch-custom" title="Cor personalizada">
          <input type="color" id="theme-accent-custom" value="${theme.accent}" />
        </label>
      </div>
    </div>

    <div class="theme-section">
      <span>Cantos</span>
      <div class="theme-option-row" id="theme-radius-row">
        <button data-radius="sharp" class="${theme.radius === 'sharp' ? 'is-selected' : ''}">Retos</button>
        <button data-radius="normal" class="${theme.radius === 'normal' ? 'is-selected' : ''}">Normais</button>
        <button data-radius="round" class="${theme.radius === 'round' ? 'is-selected' : ''}">Arredondados</button>
      </div>
    </div>

    <div class="theme-section">
      <span>Tamanho do texto</span>
      <div class="theme-option-row" id="theme-fontsize-row">
        <button data-fontsize="small" class="${theme.fontSize === 'small' ? 'is-selected' : ''}">Pequeno</button>
        <button data-fontsize="normal" class="${theme.fontSize === 'normal' ? 'is-selected' : ''}">Médio</button>
        <button data-fontsize="large" class="${theme.fontSize === 'large' ? 'is-selected' : ''}">Grande</button>
      </div>
    </div>

    <div class="theme-toggle-row">
      <label for="theme-colorize">
        📌 Colorir por matéria
        <small>Anotações, flashcards e o mapa mental ganham a cor da matéria -- tipo post-its</small>
      </label>
      <input type="checkbox" id="theme-colorize" ${theme.colorBySubject ? 'checked' : ''} />
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Fechar</button>
    </div>
  `);

  // Every control applies (and saves) immediately -- no separate
  // "Salvar" button here, so you can see each change live before
  // deciding to keep it.
  const liveUpdate = (partial) => {
    const next = Settings.update({ theme: partial });
    applyTheme(next.theme);
    renderAll();
    if (state.currentTab === 'reviews') renderReviewsTab();
  };

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.querySelectorAll('#theme-swatches .theme-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#theme-swatches .theme-swatch').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      liveUpdate({ accent: btn.dataset.accent });
    });
  });
  document.getElementById('theme-accent-custom').addEventListener('input', (e) => {
    document.querySelectorAll('#theme-swatches .theme-swatch').forEach((b) => b.classList.remove('is-selected'));
    liveUpdate({ accent: e.target.value });
  });
  document.querySelectorAll('#theme-radius-row button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#theme-radius-row button').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      liveUpdate({ radius: btn.dataset.radius });
    });
  });
  document.querySelectorAll('#theme-fontsize-row button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#theme-fontsize-row button').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      liveUpdate({ fontSize: btn.dataset.fontsize });
    });
  });
  document.getElementById('theme-colorize').addEventListener('change', (e) => {
    liveUpdate({ colorBySubject: e.target.checked });
  });
}

/* ================================================================
 * RENDER: SIDEBAR — subject list
 * ================================================================ */
function renderSubjectList() {
  const list = document.getElementById('subject-list');
  const subjects = Subject.all();

  const allPill = `
    <div class="subject-row">
      <button class="subject-pill ${state.activeSubjectId === 'all' ? 'is-active' : ''}" data-subject-id="all">
        <span class="dot" style="--dot:#F2A65A"></span> Todas as matérias
      </button>
    </div>`;

  const rows = subjects.map((s) => `
    <div class="subject-row">
      <button class="subject-pill ${state.activeSubjectId === s.id ? 'is-active' : ''}" data-subject-id="${s.id}">
        <span class="dot" style="--dot:${s.color}"></span> ${escapeHtml(s.name)}
      </button>
      <div class="subject-row-actions">
        <button class="icon-btn" data-edit-subject="${s.id}" title="Editar matéria" aria-label="Editar matéria">✎</button>
        <button class="icon-btn" data-delete-subject="${s.id}" title="Excluir matéria" aria-label="Excluir matéria">🗑</button>
      </div>
    </div>`).join('');

  list.innerHTML = allPill + rows;

  list.querySelectorAll('.subject-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeSubjectId = btn.dataset.subjectId;
      renderAll();
      if (state.currentTab === 'reviews') renderReviewsTab();
    });
  });

  list.querySelectorAll('[data-edit-subject]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const subject = Subject.all().find((s) => s.id === btn.dataset.editSubject);
      if (subject) openEditSubjectModal(subject);
    });
  });

  list.querySelectorAll('[data-delete-subject]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const subject = Subject.all().find((s) => s.id === btn.dataset.deleteSubject);
      if (!subject) return;
      const noteCount = Note.all().filter((n) => n.subjectId === subject.id).length;
      const cardCount = Flashcard.all().filter((c) => c.subjectId === subject.id).length;
      const confirmed = window.confirm(
        `Excluir "${subject.name}"? Isso também apaga ${noteCount} anotação(ões) e ${cardCount} flashcard(s) dessa matéria. Essa ação não pode ser desfeita.`
      );
      if (!confirmed) return;

      Subject.removeCascade(subject.id);
      if (state.activeSubjectId === subject.id) state.activeSubjectId = 'all';
      renderAll();
    });
  });
}

/* ================================================================
 * RENDER: DASHBOARD
 * ================================================================ */
function renderDashboard() {
  const subjects = Subject.all();
  const notes = Note.all();
  const cards = Flashcard.all();
  const dueCards = window.SRS.getDueCards(cards);

  document.getElementById('stat-grid').innerHTML = `
    <div class="stat-card"><span class="stat-ic">📚</span><span class="num">${subjects.length}</span><span class="label">Matérias</span></div>
    <div class="stat-card"><span class="stat-ic">📝</span><span class="num">${notes.length}</span><span class="label">Anotações</span></div>
    <div class="stat-card"><span class="stat-ic">🗂️</span><span class="num">${cards.length}</span><span class="label">Flashcards</span></div>
    <div class="stat-card stat-card--due"><span class="stat-ic">🔁</span><span class="num">${dueCards.length}</span><span class="label">Revisões pendentes</span></div>
  `;

  const dueList = document.getElementById('due-today-list');
  if (dueCards.length === 0) {
    dueList.innerHTML = `<li class="empty-state">Nenhuma revisão pendente por aqui. 🎉</li>`;
  } else {
    dueList.innerHTML = dueCards.slice(0, 6).map((c) => `
      <li>
        <span>${escapeHtml(truncate(c.front, 60))}</span>
        <span class="tag">${c.dueDate}</span>
      </li>
    `).join('');
  }

  document.getElementById('streak-count').textContent = Session.currentStreak();
  document.getElementById('pomodoro-count').textContent = Session.todayCount();
}

/* ================================================================
 * RENDER: NOTES
 * ================================================================ */
function renderNotes() {
  const notes = filterBySubject(Note.all());
  const grid = document.getElementById('notes-grid');

  if (notes.length === 0) {
    grid.innerHTML = `<p class="empty-state">Nenhuma anotação nesta matéria ainda.</p>`;
    return;
  }

  grid.innerHTML = notes.map((n) => `
    <div class="card" style="--card-accent:${subjectColor(n.subjectId)}">
      <span class="card-subject">${subjectName(n.subjectId)}</span>
      <h4>${escapeHtml(n.title)}</h4>
      <p>${escapeHtml(truncate(n.body, 140))}</p>
      <div class="card-actions">
        <button class="btn btn-ghost" data-edit-note="${n.id}">Editar</button>
        <button class="btn btn-ghost" data-delete-note="${n.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-edit-note]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const note = Note.all().find((n) => n.id === btn.dataset.editNote);
      if (note) openEditNoteModal(note);
    });
  });

  grid.querySelectorAll('[data-delete-note]').forEach((btn) => {
    btn.addEventListener('click', () => {
      Note.remove(btn.dataset.deleteNote);
      renderAll();
    });
  });
}

/* ================================================================
 * RENDER: FLASHCARDS (management grid, not the review mode)
 * ================================================================ */
function renderFlashcards() {
  const cards = filterBySubject(Flashcard.all());
  const grid = document.getElementById('flashcards-grid');

  if (cards.length === 0) {
    grid.innerHTML = `<p class="empty-state">Nenhum flashcard nesta matéria ainda.</p>`;
    return;
  }

  grid.innerHTML = cards.map((c) => `
    <div class="card" style="--card-accent:${subjectColor(c.subjectId)}">
      <span class="card-subject">${subjectName(c.subjectId)}</span>
      <h4>${escapeHtml(truncate(c.front, 60))}</h4>
      <p>${escapeHtml(truncate(c.back, 100))}</p>
      <div class="card-actions">
        <button class="btn btn-ghost" data-edit-card="${c.id}">Editar</button>
        <button class="btn btn-ghost" data-delete-card="${c.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-edit-card]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = Flashcard.all().find((c) => c.id === btn.dataset.editCard);
      if (card) openEditFlashcardModal(card);
    });
  });

  grid.querySelectorAll('[data-delete-card]').forEach((btn) => {
    btn.addEventListener('click', () => {
      Flashcard.remove(btn.dataset.deleteCard);
      renderAll();
    });
  });
}

/* ================================================================
 * RENDER: REVIEW MODE (spaced repetition study flow)
 * ================================================================ */
function startReviewQueue() {
  const dueCards = window.SRS.getDueCards(filterBySubject(Flashcard.all()));
  state.reviewQueue = dueCards;
  state.reviewShowingBack = false;
  renderReviewStage();
}

function renderReviewStage() {
  const stage = document.getElementById('review-stage');

  if (state.reviewQueue.length === 0) {
    stage.innerHTML = `<p class="empty-state">Nenhum card para revisar agora. Volte mais tarde!</p>`;
    return;
  }

  const card = state.reviewQueue[0];
  const faceText = state.reviewShowingBack ? card.back : card.front;

  stage.innerHTML = `
    <p class="empty-state">${state.reviewQueue.length} card(s) restantes nesta sessão</p>
    <div class="flip-card" id="flip-card">${escapeHtml(faceText)}</div>
    ${state.reviewShowingBack ? `
      <div class="grade-row">
        <button class="grade-btn" data-grade="again">Errei</button>
        <button class="grade-btn" data-grade="hard">Difícil</button>
        <button class="grade-btn" data-grade="good">Bom</button>
        <button class="grade-btn" data-grade="easy">Fácil</button>
      </div>
    ` : `<p class="empty-state">Clique no card para ver a resposta</p>`}
  `;

  document.getElementById('flip-card').addEventListener('click', () => {
    state.reviewShowingBack = !state.reviewShowingBack;
    renderReviewStage();
  });

  stage.querySelectorAll('.grade-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const grade = btn.dataset.grade;
      const updated = window.SRS.scheduleNextReview(card, grade);
      Flashcard.update(updated);

      state.reviewQueue.shift();
      state.reviewShowingBack = false;
      renderReviewStage();
      renderDashboard(); // due-count changed
    });
  });
}

/* ================================================================
 * RENDER: REVIEWS TAB — dispatches to whichever sub-mode is active
 * ================================================================ */
function renderReviewsTab() {
  const isMap = state.reviewMode === 'map';
  document.getElementById('mindmap-layout').hidden = !isMap;
  document.getElementById('review-stage').hidden = isMap;

  if (isMap) {
    renderMindMap({ refit: true });
  } else {
    startReviewQueue();
  }
}

/* ================================================================
 * RENDER: MIND MAP MODE (linear tree, pan + zoom, node -> modal)
 * ================================================================
 * The subject sits at the top, "Anotações" and "Flashcards" branch
 * below it, and every note/flashcard is a leaf card under its
 * category (see js/mindmap.js for the coordinate math). Leaves are
 * real HTML boxes (not tiny SVG circles), so they grow to fit their
 * text and stay readable. Clicking one opens a full detail window
 * (a modal) instead of a cramped side panel.
 * ================================================================ */
function mindMapNoteItems() {
  const colorBySubject = Settings.get().theme.colorBySubject;
  return filterBySubject(Note.all()).map((n) => ({
    id: n.id, type: 'note', label: n.title,
    color: colorBySubject ? subjectColor(n.subjectId) : undefined,
  }));
}
function mindMapFlashcardItems() {
  const today = new Date().toISOString().slice(0, 10);
  const colorBySubject = Settings.get().theme.colorBySubject;
  return filterBySubject(Flashcard.all()).map((c) => ({
    id: c.id, type: 'flashcard', label: c.front, due: c.dueDate <= today,
    color: colorBySubject ? subjectColor(c.subjectId) : undefined,
  }));
}
function mindMapCenterLabel() {
  if (state.activeSubjectId === 'all') return 'Todas as matérias';
  const s = Subject.all().find((s) => s.id === state.activeSubjectId);
  return s ? s.name : 'Matéria';
}

/** Builds a smooth vertical "elbow" curve between a parent and child node. */
function edgePath(from, to) {
  const midY = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
}

function renderMindMap(opts = {}) {
  const notesItems = mindMapNoteItems();
  const cardItems = mindMapFlashcardItems();
  const canvas = document.getElementById('mindmap-canvas');
  const total = notesItems.length + cardItems.length;

  // ---- Stats strip (a little "how am I doing" readout) ----
  const dueCount = cardItems.filter((c) => c.due).length;
  const stats = document.getElementById('mindmap-stats');
  if (total === 0) {
    stats.innerHTML = '';
  } else {
    stats.innerHTML = `
      <span>📝 <strong>${notesItems.length}</strong> anotaç${notesItems.length === 1 ? 'ão' : 'ões'}</span>
      <span>🗂️ <strong>${cardItems.length}</strong> flashcard${cardItems.length === 1 ? '' : 's'}</span>
      ${dueCount > 0
        ? `<span>🔁 <strong>${dueCount}</strong> pendente${dueCount === 1 ? '' : 's'} pra revisar</span>`
        : cardItems.length > 0 ? `<span class="stat-ok">✅ tudo em dia por aqui</span>` : ''}
    `;
  }

  if (total === 0) {
    canvas.innerHTML = `<p class="empty-state" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:320px;">Nada pra mapear ainda nesta matéria. Crie uma anotação ou flashcard primeiro.</p>`;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    return;
  }

  const FONT_SCALE = { small: 14 / 16, normal: 1, large: 18 / 16 };
  const fontScale = FONT_SCALE[Settings.get().theme.fontSize] || 1;
  const layout = window.MindMap.computeLinearMindMap(mindMapCenterLabel(), notesItems, cardItems, fontScale);
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;

  const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
  const edgesSvg = layout.edges.map((e) => {
    const from = byId[e.from], to = byId[e.to];
    return `<path class="mm-edge" d="${edgePath(from, to)}" stroke="${e.color || 'var(--border)'}" />`;
  }).join('');

  let leafIndex = 0;
  const nodeHtml = layout.nodes.map((n) => {
    if (n.kind === 'root') {
      return `<div class="mm-node mm-node--root" style="left:${n.x}px;top:${n.y}px;"><div class="mm-node-box">${escapeHtml(n.label)}</div></div>`;
    }
    if (n.kind === 'category') {
      return `<div class="mm-node mm-node--category" style="left:${n.x}px;top:${n.y}px;--node-color:${n.color};"><div class="mm-node-box">${escapeHtml(n.label)}</div></div>`;
    }
    // leaf (note or flashcard)
    const tilt = leafIndex % 2 === 0 ? 'mm-tilt-a' : 'mm-tilt-b';
    leafIndex += 1;
    const kindLabel = n.type === 'note' ? '📝 Anotação' : (n.due ? '🗂️ Flashcard · pendente' : '🗂️ Flashcard · em dia');
    return `
      <div class="mm-node mm-node--leaf ${tilt}" data-node-id="${n.id}" data-node-type="${n.type}" data-node-label="${escapeHtml(n.label).toLowerCase()}" style="left:${n.x}px;top:${n.y}px;--node-color:${n.color};">
        <div class="mm-node-box">
          <span class="mm-node-kind">${kindLabel}</span>
          <p class="mm-node-text">${escapeHtml(n.label)}</p>
        </div>
      </div>`;
  }).join('');

  canvas.innerHTML = `<svg class="mm-edges" width="${layout.width}" height="${layout.height}">${edgesSvg}</svg>${nodeHtml}`;

  canvas.querySelectorAll('.mm-node--leaf').forEach((el) => {
    el.addEventListener('click', () => openNodeDetailModal(el.dataset.nodeId, el.dataset.nodeType));
  });

  // Re-apply the current search filter (if any) to the freshly built nodes.
  applyMindMapSearchFilter();

  if (opts.refit) fitMindMapToViewport(layout.width, layout.height);
  else applyMindMapTransform();
}

/* ---- Pan + zoom ---- */
function applyMindMapTransform() {
  const canvas = document.getElementById('mindmap-canvas');
  if (!canvas) return;
  canvas.style.transform = `translate(${state.mapPan.x}px, ${state.mapPan.y}px) scale(${state.mapZoom})`;
}

function fitMindMapToViewport(canvasWidth, canvasHeight) {
  const viewport = document.getElementById('mindmap-viewport');
  const vw = viewport.clientWidth || 800;
  const vh = viewport.clientHeight || 520;
  // Fit to width (maps can get tall, but rarely wider than the
  // viewport looks good scaled down) -- capped so short maps don't
  // get blown up huge.
  const zoom = Math.max(0.45, Math.min(1, (vw - 40) / canvasWidth));
  state.mapZoom = zoom;
  state.mapPan = {
    x: Math.max(20, (vw - canvasWidth * zoom) / 2),
    y: 24,
  };
  applyMindMapTransform();
}

function setMindMapZoom(nextZoom) {
  state.mapZoom = Math.max(0.4, Math.min(2, nextZoom));
  applyMindMapTransform();
}

/** Wires drag-to-pan, wheel-to-zoom and the zoom buttons. Called
 * once at startup -- the viewport element itself is never replaced,
 * only its contents, so these listeners live for the app's lifetime. */
function setupMindMapInteractions() {
  const viewport = document.getElementById('mindmap-viewport');
  let dragging = false;
  let lastX = 0, lastY = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mm-node')) return; // let node clicks through untouched
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    state.mapPan = { x: state.mapPan.x + dx, y: state.mapPan.y + dy };
    applyMindMapTransform();
  });
  const stopDrag = () => { dragging = false; viewport.classList.remove('is-dragging'); };
  viewport.addEventListener('pointerup', stopDrag);
  viewport.addEventListener('pointerleave', stopDrag);

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.deltaY > 0 ? -0.1 : 0.1;
    setMindMapZoom(state.mapZoom + step);
  }, { passive: false });

  document.getElementById('mm-zoom-in').addEventListener('click', () => setMindMapZoom(state.mapZoom + 0.15));
  document.getElementById('mm-zoom-out').addEventListener('click', () => setMindMapZoom(state.mapZoom - 0.15));
  document.getElementById('mm-zoom-reset').addEventListener('click', () => renderMindMap({ refit: true }));

  document.getElementById('mindmap-search').addEventListener('input', applyMindMapSearchFilter);
}

/** Dims nodes that don't match the search box, highlights the ones that do. */
function applyMindMapSearchFilter() {
  const query = (document.getElementById('mindmap-search').value || '').trim().toLowerCase();
  document.querySelectorAll('.mm-node--leaf').forEach((el) => {
    if (!query) {
      el.classList.remove('is-dimmed', 'is-highlighted');
      return;
    }
    const matches = el.dataset.nodeLabel.includes(query);
    el.classList.toggle('is-dimmed', !matches);
    el.classList.toggle('is-highlighted', matches);
  });
}

/* ---- Node detail modal (the "bigger window" to read/edit/review) ---- */
function openNodeDetailModal(nodeId, nodeType) {
  if (nodeType === 'note') {
    const note = Note.all().find((n) => n.id === nodeId);
    if (!note) return;
    openModal(`
      <div class="detail-modal">
        <span class="panel-kind">📝 Anotação — ${subjectName(note.subjectId)}</span>
        <h3>${escapeHtml(note.title)}</h3>
        <p class="panel-body">${escapeHtml(note.body) || '<em>Sem conteúdo.</em>'}</p>
        <div class="panel-actions">
          <button class="btn btn-ghost" id="node-delete">Excluir</button>
          <button class="btn btn-ghost" id="node-close">Fechar</button>
          <button class="btn btn-primary" id="node-edit">Editar</button>
        </div>
      </div>
    `);
    document.getElementById('node-close').addEventListener('click', closeModal);
    document.getElementById('node-edit').addEventListener('click', () => openEditNoteModal(note));
    document.getElementById('node-delete').addEventListener('click', () => {
      Note.remove(note.id);
      closeModal();
      renderAll();
      renderMindMap();
    });
    return;
  }

  // Flashcard node: a proper flip card + grading, all inside the modal.
  const card = Flashcard.all().find((c) => c.id === nodeId);
  if (!card) return;
  const today = new Date().toISOString().slice(0, 10);
  const dueBadge = card.dueDate <= today
    ? `<span class="tag">vence ${card.dueDate}</span>`
    : `<span class="tag" style="color:var(--success);border-color:var(--success);background:var(--success-soft)">em dia até ${card.dueDate}</span>`;

  openModal(`
    <div class="detail-modal">
      <span class="panel-kind">🗂️ Flashcard — ${subjectName(card.subjectId)} · ${dueBadge}</span>
      <div class="study-flip" id="node-flip">
        <div class="study-flip-inner">
          <div class="flip-face flip-face--front">${escapeHtml(card.front)}</div>
          <div class="flip-face flip-face--back">${escapeHtml(card.back)}</div>
        </div>
      </div>
      <p class="study-flip-hint" id="node-flip-hint">Clique no card pra virar</p>
      <div class="grade-row" id="node-grade-row" hidden>
        <button class="grade-btn" data-grade="again">Errei</button>
        <button class="grade-btn" data-grade="hard">Difícil</button>
        <button class="grade-btn" data-grade="good">Bom</button>
        <button class="grade-btn" data-grade="easy">Fácil</button>
      </div>
      <div class="panel-actions">
        <button class="btn btn-ghost" id="node-delete">Excluir</button>
        <button class="btn btn-ghost" id="node-close">Fechar</button>
        <button class="btn btn-primary" id="node-edit">Editar</button>
      </div>
    </div>
  `);

  const flipEl = document.getElementById('node-flip');
  flipEl.addEventListener('click', () => {
    flipEl.classList.toggle('is-flipped');
    const flipped = flipEl.classList.contains('is-flipped');
    document.getElementById('node-flip-hint').hidden = flipped;
    document.getElementById('node-grade-row').hidden = !flipped;
  });

  document.getElementById('node-close').addEventListener('click', closeModal);
  document.getElementById('node-edit').addEventListener('click', () => {
    openEditFlashcardModal(card, { onSaved: () => renderMindMap() });
  });
  document.getElementById('node-delete').addEventListener('click', () => {
    Flashcard.remove(card.id);
    closeModal();
    renderAll();
    renderMindMap();
  });
  document.querySelectorAll('#node-grade-row .grade-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const updated = window.SRS.scheduleNextReview(card, btn.dataset.grade);
      Flashcard.update(updated);
      closeModal();
      renderMindMap();     // colors/labels may have changed (due status)
      renderDashboard();
    });
  });
}

/* ================================================================
 * POMODORO wiring
 * ================================================================ */
const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // matches r="90" in the SVG

function initPomodoro() {
  const saved = Settings.get(); // { focusMinutes, shortBreakMinutes, longBreakMinutes }

  state.timer = new window.PomodoroTimer({
    focusMinutes: saved.focusMinutes,
    shortBreakMinutes: saved.shortBreakMinutes,
    longBreakMinutes: saved.longBreakMinutes,
    onTick: renderTimerTick,
    onModeChange: renderTimerMode,
    onFocusComplete: () => {
      Session.logPomodoro();
      renderDashboard();
    },
  });

  // Reflect the saved durations in the number inputs, so what you
  // see matches what the timer will actually run (instead of
  // always showing the hardcoded 25/5/15 defaults).
  document.getElementById('cfg-focus').value = saved.focusMinutes;
  document.getElementById('cfg-short').value = saved.shortBreakMinutes;
  document.getElementById('cfg-long').value = saved.longBreakMinutes;

  renderTimerTick({ secondsLeft: saved.focusMinutes * 60, totalSeconds: saved.focusMinutes * 60, mode: 'focus' });
}

function renderTimerTick({ secondsLeft, totalSeconds, mode }) {
  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');
  document.getElementById('timer-time').textContent = `${mins}:${secs}`;

  const progressRatio = 1 - secondsLeft / totalSeconds;
  const offset = RING_CIRCUMFERENCE * (1 - progressRatio);
  document.getElementById('ring-progress').style.strokeDashoffset = offset;
}

function renderTimerMode(mode) {
  const labels = { focus: 'foco', short: 'pausa curta', long: 'pausa longa' };
  document.getElementById('timer-mode').textContent = labels[mode];
}

/* ================================================================
 * MODAL helpers (shared by "new subject" / "new note" / "new flashcard")
 * ================================================================ */
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-backdrop').classList.add('is-open');
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('is-open');
}

function subjectOptionsHtml() {
  return Subject.all().map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

function openNewSubjectModal() {
  openModal(`
    <h3>Nova matéria</h3>
    <label>Nome
      <input type="text" id="input-subject-name" placeholder="Ex: Direito Constitucional" />
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar</button>
    </div>
  `);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', () => {
    const name = document.getElementById('input-subject-name').value.trim();
    if (!name) return;
    const color = SUBJECT_COLORS[Subject.all().length % SUBJECT_COLORS.length];
    Subject.add(name, color);
    closeModal();
    renderAll();
  });
}

function openNewNoteModal() {
  if (Subject.all().length === 0) return openNewSubjectModal();
  openModal(`
    <h3>Nova anotação</h3>
    <label>Matéria
      <select id="input-note-subject">${subjectOptionsHtml()}</select>
    </label>
    <label>Título
      <input type="text" id="input-note-title" placeholder="Ex: Verbos irregulares" />
    </label>
    <label>Conteúdo
      <textarea id="input-note-body" placeholder="Escreva sua anotação aqui..."></textarea>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar</button>
    </div>
  `);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', () => {
    const subjectId = document.getElementById('input-note-subject').value;
    const title = document.getElementById('input-note-title').value.trim();
    const body = document.getElementById('input-note-body').value.trim();
    if (!title) return;
    Note.add(subjectId, title, body);
    closeModal();
    renderAll();
  });
}

function openNewFlashcardModal() {
  if (Subject.all().length === 0) return openNewSubjectModal();
  openModal(`
    <h3>Novo flashcard</h3>
    <label>Matéria
      <select id="input-card-subject">${subjectOptionsHtml()}</select>
    </label>
    <label>Frente (pergunta)
      <textarea id="input-card-front" placeholder="Ex: O que é um closure em JavaScript?"></textarea>
    </label>
    <label>Verso (resposta)
      <textarea id="input-card-back" placeholder="Resposta..."></textarea>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar</button>
    </div>
  `);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', () => {
    const subjectId = document.getElementById('input-card-subject').value;
    const front = document.getElementById('input-card-front').value.trim();
    const back = document.getElementById('input-card-back').value.trim();
    if (!front || !back) return;
    Flashcard.add(subjectId, front, back);
    closeModal();
    renderAll();
  });
}

function openEditSubjectModal(subject) {
  openModal(`
    <h3>Editar matéria</h3>
    <label>Nome
      <input type="text" id="input-subject-name" value="${escapeHtml(subject.name)}" />
    </label>
    <label>Cor
      <select id="input-subject-color">
        ${SUBJECT_COLORS.map((c) => `<option value="${c}" ${c === subject.color ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar</button>
    </div>
  `);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', () => {
    const name = document.getElementById('input-subject-name').value.trim();
    const color = document.getElementById('input-subject-color').value;
    if (!name) return;
    Subject.update(subject.id, { name, color });
    closeModal();
    renderAll();
  });
}

function openEditNoteModal(note) {
  openModal(`
    <h3>Editar anotação</h3>
    <label>Matéria
      <select id="input-note-subject">${subjectOptionsHtml()}</select>
    </label>
    <label>Título
      <input type="text" id="input-note-title" value="${escapeHtml(note.title)}" />
    </label>
    <label>Conteúdo
      <textarea id="input-note-body">${escapeHtml(note.body)}</textarea>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar</button>
    </div>
  `);
  document.getElementById('input-note-subject').value = note.subjectId;
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', () => {
    const subjectId = document.getElementById('input-note-subject').value;
    const title = document.getElementById('input-note-title').value.trim();
    const body = document.getElementById('input-note-body').value.trim();
    if (!title) return;
    Note.update(note.id, { subjectId, title, body });
    closeModal();
    renderAll();
  });
}

function openEditFlashcardModal(card, { onSaved } = {}) {
  openModal(`
    <h3>Editar flashcard</h3>
    <label>Matéria
      <select id="input-card-subject">${subjectOptionsHtml()}</select>
    </label>
    <label>Frente (pergunta)
      <textarea id="input-card-front">${escapeHtml(card.front)}</textarea>
    </label>
    <label>Verso (resposta)
      <textarea id="input-card-back">${escapeHtml(card.back)}</textarea>
    </label>
    <p class="empty-state" style="text-align:left;padding:8px 0;background:none;border:none;">
      Editar aqui só corrige o conteúdo — o progresso de revisão desse card não é afetado.
    </p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar</button>
    </div>
  `);
  document.getElementById('input-card-subject').value = card.subjectId;
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', () => {
    const subjectId = document.getElementById('input-card-subject').value;
    const front = document.getElementById('input-card-front').value.trim();
    const back = document.getElementById('input-card-back').value.trim();
    if (!front || !back) return;
    Flashcard.editContent(card.id, { subjectId, front, back });
    closeModal();
    renderAll();
    if (onSaved) onSaved();
  });
}

/* ================================================================
 * TAB NAVIGATION
 * ================================================================ */
function switchTab(tabName) {
  state.currentTab = tabName;

  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tabName));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${tabName}`));

  if (tabName === 'reviews') renderReviewsTab();
}

/* ================================================================
 * EXPORT (used by the "Exportar dados" button — a JSON backup the
 * Python script in /python can also read to generate a report).
 * ================================================================ */
function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    subjects: Subject.all(),
    notes: Note.all(),
    flashcards: Flashcard.all(),
    sessions: Session.all(),
    settings: Settings.get(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `study-system-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reads a .json file previously produced by exportData() (see the
 * hidden <input type="file"> wired to the "Importar dados" button)
 * and replaces everything currently stored with it. Mainly useful
 * so you don't have to rebuild your study data by hand every time
 * you try out a new version of the app -- export before, import
 * after.
 */
function importDataFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (err) {
      alert('Esse arquivo não é um JSON válido.');
      return;
    }

    const confirmed = window.confirm(
      'Importar vai SUBSTITUIR todos os dados atuais (matérias, anotações, flashcards, sessões e configurações) pelos do arquivo. Essa ação não pode ser desfeita. Continuar?'
    );
    if (!confirmed) return;

    try {
      window.DataLayer.importAll(data);
    } catch (err) {
      alert('Não consegui importar esse arquivo: ' + err.message);
      return;
    }

    state.activeSubjectId = 'all';
    switchTab('dashboard');
    applyTheme(Settings.get().theme);
    renderAll();
    if (state.timer) state.timer.pause(); // don't leave an orphaned interval running
    initPomodoro(); // reload durations in case the import brought different ones
    document.getElementById('btn-timer-start').textContent = 'Iniciar';
  };
  reader.readAsText(file);
}

/* ================================================================
 * SMALL UTILITIES
 * ================================================================ */
function filterBySubject(items) {
  if (state.activeSubjectId === 'all') return items;
  return items.filter((i) => i.subjectId === state.activeSubjectId);
}
function subjectName(id) {
  const s = Subject.all().find((s) => s.id === id);
  return s ? escapeHtml(s.name) : 'Sem matéria';
}
function subjectColor(id) {
  const s = Subject.all().find((s) => s.id === id);
  return s ? s.color : 'var(--border-soft)';
}
function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
/** Escapes HTML special characters to prevent broken markup or XSS
 * when rendering user-typed text back into innerHTML. */
function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================================================================
 * MASTER RENDER — calls every render function for the active tab
 * plus the sidebar, which is always visible.
 * ================================================================ */
function renderAll() {
  renderSubjectList();
  renderDashboard();
  renderNotes();
  renderFlashcards();
}

/* ================================================================
 * BOOTSTRAP — runs once when the page loads
 * ================================================================ */
function init() {
  // Data loading/seeding is wrapped in its own try/catch. If ANYTHING
  // here throws unexpectedly, we still want every button below to
  // respond to clicks -- a broken render is much less frustrating
  // than a page that looks alive but silently does nothing.
  try {
    seedIfEmpty();
    applyTheme(Settings.get().theme);
    renderAll();
    initPomodoro();
  } catch (err) {
    console.error('Failed to initialize app data:', err);
  }

  if (window.DataLayer.isPersistent === false) {
    document.getElementById('persist-banner').hidden = false;
  }

  // Tab clicks
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Sidebar "new subject" button
  document.getElementById('btn-customize').addEventListener('click', openCustomizeModal);
  document.getElementById('btn-new-subject').addEventListener('click', openNewSubjectModal);
  document.getElementById('btn-new-note').addEventListener('click', openNewNoteModal);
  document.getElementById('btn-new-flashcard').addEventListener('click', openNewFlashcardModal);
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('input-import-file').click();
  });
  document.getElementById('input-import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importDataFromFile(file);
    e.target.value = ''; // allow importing the same filename again later
  });

  setupMindMapInteractions();

  // Clicking the dark backdrop (but not the modal itself) closes it
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  // Pomodoro controls
  document.getElementById('btn-timer-start').addEventListener('click', (e) => {
    if (state.timer.isRunning()) {
      state.timer.pause();
      e.target.textContent = 'Iniciar';
    } else {
      state.timer.start();
      e.target.textContent = 'Pausar';
    }
  });
  document.getElementById('btn-timer-reset').addEventListener('click', () => {
    state.timer.reset();
    document.getElementById('btn-timer-start').textContent = 'Iniciar';
  });
  ['cfg-focus', 'cfg-short', 'cfg-long'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      const durations = {
        focusMinutes: Number(document.getElementById('cfg-focus').value) || 1,
        shortBreakMinutes: Number(document.getElementById('cfg-short').value) || 1,
        longBreakMinutes: Number(document.getElementById('cfg-long').value) || 1,
      };
      state.timer.setDurations(durations);
      Settings.update(durations); // persist so it's remembered next time you open the app
    });
  });

  // Review mode toggle (Mapa mental <-> Sequencial)
  document.querySelectorAll('#review-mode-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.reviewMode = btn.dataset.mode;
      document.querySelectorAll('#review-mode-toggle button').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderReviewsTab();
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
