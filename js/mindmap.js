/**
 * ================================================================
 * MINDMAP.JS
 * ================================================================
 * Calculates node positions for the LINEAR mind map in the Reviews
 * tab: a left-to-right tree (subject -> categories -> individual
 * notes/flashcards), not a radial circle. Like srs.js and
 * pomodoro.js, this file only does MATH -- it returns plain
 * numbers, never touches the DOM. app.js turns these numbers into
 * real, auto-sized HTML boxes (see the .mm-node styles in
 * css/style.css) and draws the connecting lines as SVG curves.
 *
 * SHAPE OF THE TREE (always 3 levels):
 *
 *   [Subject] ── [📝 Anotações] ── [note 1]
 *             |                └── [note 2]
 *             └ [🗂️ Flashcards] ── [card 1]
 *                               └── [card 2]
 *
 * A category with zero items is skipped entirely (no empty
 * "Anotações" branch dangling with nothing under it).
 *
 * WHY ESTIMATE TEXT HEIGHT HERE, IF THE BOXES ARE REAL HTML?
 * Because the boxes are positioned with CSS `position: absolute`
 * (so pan/zoom can move the whole canvas as one unit) instead of
 * flowing naturally top-to-bottom. Absolute positioning means WE
 * have to calculate non-overlapping y-coordinates ourselves, which
 * means estimating how many lines each note/flashcard's text will
 * wrap to at the box's fixed width. It doesn't need to be pixel
 * perfect -- CSS `line-clamp` caps every box at 4 lines regardless
 * -- it just needs to be close enough that boxes don't overlap.
 * ================================================================
 */

const LEAF_W = 224;      // must match the CSS .mm-node--leaf width
const LEAF_CHARS_PER_LINE_BASE = 28; // rough estimate for a 224px-wide box at the DEFAULT text size
const LEAF_MAX_LINES = 40;      // effectively "no cap" -- boxes are meant to show the
                                 // FULL text now (see css/style.css: no more line-clamp),
                                 // this ceiling only guards against pathological input
const LEAF_LINE_H_BASE = 17;
const LEAF_PAD_Y = 22;   // top+bottom padding inside the box, approx
const LEAF_MIN_H = 46;

const LEVEL_GAP_X = 150; // horizontal distance between tree levels
const LEAF_GAP_Y = 16;   // vertical gap between sibling leaves
const CATEGORY_GAP_Y = 56; // vertical gap between the two category groups

const CATEGORY_COLORS = { 'cat-notes': '#6FCF97', 'cat-cards': '#F2A65A' };

/** Rough estimate of how many lines `text` will wrap to inside a
 * box that fits `charsPerLine` characters per line, capped at
 * `maxLines` (matching the CSS line-clamp so our spacing estimate
 * never UNDER-shoots the real rendered height). */
function estimateLineCount(text, charsPerLine, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let lines = 1;
  let col = 0;
  for (const word of words) {
    const needed = col === 0 ? word.length : col + 1 + word.length;
    if (needed > charsPerLine) {
      lines += 1;
      col = word.length;
    } else {
      col = needed;
    }
  }
  return Math.max(1, Math.min(maxLines, lines));
}

function leafHeight(label, fontScale) {
  // A bigger font fits FEWER characters per line but takes MORE
  // vertical space per line -- both move in the direction you'd
  // expect, so "Grande" text still gets a tall-enough box and
  // "Pequeno" text doesn't leave a big empty gap.
  const charsPerLine = Math.max(10, Math.round(LEAF_CHARS_PER_LINE_BASE / fontScale));
  const lineH = LEAF_LINE_H_BASE * fontScale;
  const lines = estimateLineCount(label, charsPerLine, LEAF_MAX_LINES);
  return Math.max(LEAF_MIN_H, LEAF_PAD_Y + lines * lineH);
}

/**
 * @param {string} rootLabel   subject name (or "Todas as matérias")
 * @param {Array<{id,label}>}            notesItems
 * @param {Array<{id,label,due}>}        cardItems
 * @param {number} [fontScale=1]  current text-size preset relative to
 *   default (0.875 for "Pequeno", 1 for "Médio", 1.125 for "Grande" --
 *   see FONT_SIZE_PRESETS in app.js). Keeps box height estimates
 *   accurate no matter what text size the person has chosen in 🎨
 *   Personalizar.
 * @returns {{ width:number, height:number, nodes:Array, edges:Array }}
 */
function computeLinearMindMap(rootLabel, notesItems, cardItems, fontScale = 1) {
  const rawCategories = [
    { id: 'cat-notes', label: '📝 Anotações', type: 'note', items: notesItems },
    { id: 'cat-cards', label: '🗂️ Flashcards', type: 'flashcard', items: cardItems },
  ].filter((c) => c.items.length > 0);

  const nodes = [];
  const edges = [];

  let cursorY = 30;
  const categoryCenters = [];

  rawCategories.forEach((cat) => {
    const groupTop = cursorY;
    const leafCenters = [];

    cat.items.forEach((item) => {
      const h = leafHeight(item.label, fontScale);
      const cy = cursorY + h / 2;
      leafCenters.push(cy);
      const defaultColor = cat.type === 'note' ? CATEGORY_COLORS['cat-notes'] : (item.due ? CATEGORY_COLORS['cat-cards'] : 'var(--text-faint)');
      nodes.push({
        id: item.id,
        kind: 'leaf',
        type: cat.type,
        due: item.due,
        label: item.label,
        // item.color lets the caller (app.js) override this per-node --
        // e.g. to color every node by its SUBJECT instead of by
        // type/due-status, for the "color-coded like post-its" theme.
        color: item.color || defaultColor,
        x: 0, // x is filled in once we know each level's column position (below)
        y: cy,
      });
      edges.push({ from: cat.id, to: item.id, color: 'var(--border)' });
      cursorY += h + LEAF_GAP_Y;
    });

    const groupBottom = cursorY - LEAF_GAP_Y;
    const catY = (groupTop + groupBottom) / 2;
    categoryCenters.push({ id: cat.id, y: catY });
    nodes.push({ id: cat.id, kind: 'category', label: `${cat.label} (${cat.items.length})`, color: CATEGORY_COLORS[cat.id], x: 0, y: catY });

    cursorY = groupBottom + CATEGORY_GAP_Y;
  });

  const totalHeight = Math.max(160, cursorY - CATEGORY_GAP_Y + 30);
  const rootY = categoryCenters.length
    ? (categoryCenters[0].y + categoryCenters[categoryCenters.length - 1].y) / 2
    : totalHeight / 2;

  // ---- Column (x) positions for each of the 3 levels ----
  const rootX = 90;
  const catX = rootX + LEVEL_GAP_X;
  const leafX = catX + LEVEL_GAP_X;

  nodes.forEach((n) => {
    if (n.kind === 'category') n.x = catX;
    else n.x = leafX;
  });

  nodes.unshift({ id: 'root', kind: 'root', label: rootLabel, x: rootX, y: rootY });
  categoryCenters.forEach((cat) => edges.push({ from: 'root', to: cat.id, color: CATEGORY_COLORS[cat.id] }));

  const totalWidth = leafX + LEAF_W / 2 + 60;

  return { width: totalWidth, height: totalHeight, nodes, edges };
}

window.MindMap = { computeLinearMindMap };
