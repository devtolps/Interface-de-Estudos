/**
 * ================================================================
 * STORAGE.JS
 * ================================================================
 * This file is the ONLY place in the whole app that talks directly
 * to localStorage. Every other file (app.js, srs.js, pomodoro.js)
 * goes through the functions exported here.
 *
 * WHY centralize this? Two reasons that matter for learning:
 *   1. If we ever swap localStorage for a real backend (e.g. an
 *      Express + SQLite API), we only need to rewrite THIS file.
 *      The rest of the app wouldn't need to change at all.
 *   2. It stops "magic strings" (like the key "study_subjects")
 *      from being scattered across many files, which is a common
 *      source of bugs.
 *
 * DATA MODEL (kept intentionally simple, all plain objects/arrays):
 *
 *   Subject  { id, name, color }
 *   Note     { id, subjectId, title, body, createdAt }
 *   Flashcard{ id, subjectId, front, back,
 *              // spaced repetition fields (used by srs.js):
 *              interval, easeFactor, repetitions, dueDate }
 *   Session  { date: 'YYYY-MM-DD', pomodoros: number }
 *
 * We use the browser's built-in localStorage, which persists data
 * on the user's own machine between visits, with NO server needed.
 * That's ideal for a personal, offline-first study tool like this.
 * ================================================================
 */

const STORAGE_KEYS = {
  SUBJECTS: 'study_subjects',
  NOTES: 'study_notes',
  FLASHCARDS: 'study_flashcards',
  SESSIONS: 'study_sessions', // one entry per day, tracks pomodoro count + streak
  SETTINGS: 'study_settings', // pomodoro durations, and any future app-wide setting
};

/**
 * SAFE STORAGE ADAPTER
 * --------------------
 * Some browsers (Safari is the main one) refuse to expose
 * localStorage when a page is opened straight from disk
 * (a "file://" URL). Under the hood they treat that as an "opaque
 * origin" and throw a SecurityError the moment ANY code touches
 * localStorage -- even just checking if it exists.
 *
 * To keep the app usable everywhere, we test localStorage once, up
 * front, inside a try/catch. If it works, `backend` below IS the
 * real localStorage and everything is saved to disk as normal.
 * If it throws, we swap in a plain in-memory object with the same
 * get/set/removeItem shape. The rest of this file (readList,
 * writeList, etc.) never needs to know which one it's talking to.
 *
 * The trade-off: in the in-memory fallback, data is NOT saved
 * between visits (it resets on refresh) -- but the app stays fully
 * functional for the session, instead of silently breaking. A
 * banner in the UI (see app.js) warns the person when this fallback
 * is active and points them to a fix (running a local server, or
 * using Chrome/Firefox instead of Safari for file:// pages).
 */
function createSafeStorage() {
  try {
    const testKey = '__study_system_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return { backend: window.localStorage, isPersistent: true };
  } catch (err) {
    console.warn('localStorage unavailable (likely a file:// restriction). Falling back to in-memory storage; data will not be saved between visits.', err);
    const memory = new Map();
    const memoryBackend = {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    };
    return { backend: memoryBackend, isPersistent: false };
  }
}

const SafeStorage = createSafeStorage();

/**
 * Generic "read a list from localStorage" helper.
 * Returns an empty array if the key has never been set yet,
 * so callers never have to worry about `null` or `undefined`.
 */
function readList(key) {
  const raw = SafeStorage.backend.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (err) {
    // If the stored JSON is somehow corrupted, fail safely
    // instead of crashing the whole app.
    console.error(`Could not parse localStorage key "${key}"`, err);
    return [];
  }
}

/** Generic "write a list to localStorage" helper. */
function writeList(key, list) {
  SafeStorage.backend.setItem(key, JSON.stringify(list));
}

/** Same idea as readList/writeList, but for a single settings object
 * instead of an array -- used only by SettingsStore below. */
function readObject(key, fallback) {
  const raw = SafeStorage.backend.getItem(key);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch (err) {
    console.error(`Could not parse localStorage key "${key}"`, err);
    return fallback;
  }
}
function writeObject(key, obj) {
  SafeStorage.backend.setItem(key, JSON.stringify(obj));
}

/** Creates a short, reasonably-unique id without needing a library. */
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ------------------------------------------------------------
 * Public API — Subjects
 * ------------------------------------------------------------ */
const SubjectStore = {
  all() {
    return readList(STORAGE_KEYS.SUBJECTS);
  },
  add(name, color) {
    const subjects = this.all();
    const subject = { id: makeId(), name, color };
    subjects.push(subject);
    writeList(STORAGE_KEYS.SUBJECTS, subjects);
    return subject;
  },
  /** Renames a subject and/or changes its color. Pass only the fields you want to change. */
  update(id, { name, color } = {}) {
    const subjects = this.all().map((s) => {
      if (s.id !== id) return s;
      return { ...s, ...(name !== undefined ? { name } : {}), ...(color !== undefined ? { color } : {}) };
    });
    writeList(STORAGE_KEYS.SUBJECTS, subjects);
  },
  /**
   * Removes a subject AND everything that belongs to it (its notes
   * and flashcards). This is a deliberate design choice: a subject
   * with orphaned notes floating around with no home would be more
   * confusing than useful. The confirmation prompt lives in app.js,
   * this function just does the deletion once the user has agreed.
   */
  removeCascade(id) {
    const remaining = this.all().filter((s) => s.id !== id);
    writeList(STORAGE_KEYS.SUBJECTS, remaining);
    NoteStore.removeBySubject(id);
    FlashcardStore.removeBySubject(id);
  },
};

/* ------------------------------------------------------------
 * Public API — Notes
 * ------------------------------------------------------------ */
const NoteStore = {
  all() {
    return readList(STORAGE_KEYS.NOTES);
  },
  add(subjectId, title, body) {
    const notes = this.all();
    const note = { id: makeId(), subjectId, title, body, createdAt: Date.now() };
    notes.push(note);
    writeList(STORAGE_KEYS.NOTES, notes);
    return note;
  },
  /** Edits an existing note's subject, title and/or body in place. */
  update(id, { subjectId, title, body } = {}) {
    const notes = this.all().map((n) => {
      if (n.id !== id) return n;
      return {
        ...n,
        ...(subjectId !== undefined ? { subjectId } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(body !== undefined ? { body } : {}),
      };
    });
    writeList(STORAGE_KEYS.NOTES, notes);
  },
  remove(id) {
    writeList(STORAGE_KEYS.NOTES, this.all().filter((n) => n.id !== id));
  },
  /** Used by SubjectStore.removeCascade() when a whole subject is deleted. */
  removeBySubject(subjectId) {
    writeList(STORAGE_KEYS.NOTES, this.all().filter((n) => n.subjectId !== subjectId));
  },
};

/* ------------------------------------------------------------
 * Public API — Flashcards
 * ------------------------------------------------------------ */
const FlashcardStore = {
  all() {
    return readList(STORAGE_KEYS.FLASHCARDS);
  },
  add(subjectId, front, back) {
    const cards = this.all();
    const card = {
      id: makeId(),
      subjectId,
      front,
      back,
      // Spaced-repetition state — see js/srs.js for how these evolve.
      // A brand-new card is due immediately (today) so it shows up
      // in the review queue right away.
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      dueDate: new Date().toISOString().slice(0, 10),
    };
    cards.push(card);
    writeList(STORAGE_KEYS.FLASHCARDS, cards);
    return card;
  },
  remove(id) {
    writeList(STORAGE_KEYS.FLASHCARDS, this.all().filter((c) => c.id !== id));
  },
  /** Used by SubjectStore.removeCascade() when a whole subject is deleted. */
  removeBySubject(subjectId) {
    writeList(STORAGE_KEYS.FLASHCARDS, this.all().filter((c) => c.subjectId !== subjectId));
  },
  /** Overwrites one card in place (used after grading a review). */
  update(updatedCard) {
    const cards = this.all().map((c) => (c.id === updatedCard.id ? updatedCard : c));
    writeList(STORAGE_KEYS.FLASHCARDS, cards);
  },
  /**
   * Edits just the CONTENT of a card (subject/front/back) without
   * touching its spaced-repetition state (interval, easeFactor,
   * repetitions, dueDate). This is deliberately a different function
   * from update() above: update() is for the SRS algorithm to
   * overwrite the whole card after a review, while editContent() is
   * for a person fixing a typo or rewording a question -- that
   * shouldn't reset their review progress on the card.
   */
  editContent(id, { subjectId, front, back } = {}) {
    const cards = this.all().map((c) => {
      if (c.id !== id) return c;
      return {
        ...c,
        ...(subjectId !== undefined ? { subjectId } : {}),
        ...(front !== undefined ? { front } : {}),
        ...(back !== undefined ? { back } : {}),
      };
    });
    writeList(STORAGE_KEYS.FLASHCARDS, cards);
  },
};

/* ------------------------------------------------------------
 * Public API — Study sessions (pomodoro + streak tracking)
 * ------------------------------------------------------------ */
const SessionStore = {
  all() {
    return readList(STORAGE_KEYS.SESSIONS);
  },
  todayKey() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  },
  /** Increments today's pomodoro count by 1, creating today's entry if needed. */
  logPomodoro() {
    const sessions = this.all();
    const today = this.todayKey();
    let entry = sessions.find((s) => s.date === today);
    if (!entry) {
      entry = { date: today, pomodoros: 0 };
      sessions.push(entry);
    }
    entry.pomodoros += 1;
    writeList(STORAGE_KEYS.SESSIONS, sessions);
    return entry;
  },
  todayCount() {
    const today = this.todayKey();
    const entry = this.all().find((s) => s.date === today);
    return entry ? entry.pomodoros : 0;
  },
  /**
   * Calculates the current daily streak by walking backwards from
   * today, day by day, counting how many consecutive days have at
   * least one logged pomodoro.
   */
  currentStreak() {
    const sessions = this.all();
    const hasStudyOn = (dateStr) => sessions.some((s) => s.date === dateStr && s.pomodoros > 0);

    let streak = 0;
    const cursor = new Date();
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (hasStudyOn(key)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  },
};

/* ------------------------------------------------------------
 * Public API — App settings (Pomodoro durations + visual theme)
 * ------------------------------------------------------------ */
const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  // Everything below is "🎨 Personalizar" -- the whole point is that
  // people organize/study differently (some like a tidy, uniform
  // look; others think in colored post-its). Nothing here changes
  // what the app DOES, only how it looks.
  theme: {
    accent: '#F2A65A',      // primary accent color (buttons, active tab, timer ring...)
    radius: 'normal',       // 'sharp' | 'normal' | 'round' -- corner roundness
    fontSize: 'normal',     // 'small' | 'normal' | 'large' -- base text size
    colorBySubject: true,   // color notes/flashcards/mind-map nodes by their
                             // subject's color, like different-colored post-its,
                             // instead of by type/review-status
  },
};

const SettingsStore = {
  get() {
    const stored = readObject(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    // readObject only merges TOP-LEVEL keys, so an old save (or one
    // missing just one theme field) could leave `theme` incomplete.
    // Merge it one level deeper here so new theme fields always have
    // a sane default even for people who saved settings before this
    // feature existed.
    return { ...DEFAULT_SETTINGS, ...stored, theme: { ...DEFAULT_SETTINGS.theme, ...(stored.theme || {}) } };
  },
  /** Merges in only the fields passed, keeping the rest as they were.
   * Pass `{ theme: {...} }` to update just some theme fields. */
  update(partial) {
    const current = this.get();
    const next = {
      ...current,
      ...partial,
      theme: partial.theme ? { ...current.theme, ...partial.theme } : current.theme,
    };
    writeObject(STORAGE_KEYS.SETTINGS, next);
    return next;
  },
};

/* ------------------------------------------------------------
 * Import / Export helper
 * ------------------------------------------------------------
 * Used by the "Importar dados" button in app.js. It takes the
 * exact shape produced by exportData() in app.js and REPLACES
 * everything currently stored -- subjects, notes, flashcards,
 * sessions and settings -- with what's in the file.
 *
 * This exists mainly so that testing new versions of the app
 * doesn't mean rebuilding your study data from scratch every time:
 * export before trying a new version, import right after opening
 * it, and you're back where you left off.
 *
 * It's intentionally an all-or-nothing REPLACE, not a merge --
 * merging would mean deciding what happens when two flashcards
 * have the same id but different content, which adds a lot of
 * complexity for a personal single-user tool. A confirmation
 * prompt (in app.js) warns before this runs.
 * ------------------------------------------------------------ */
function importAll(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Arquivo de importação inválido.');
  }
  writeList(STORAGE_KEYS.SUBJECTS, Array.isArray(data.subjects) ? data.subjects : []);
  writeList(STORAGE_KEYS.NOTES, Array.isArray(data.notes) ? data.notes : []);
  writeList(STORAGE_KEYS.FLASHCARDS, Array.isArray(data.flashcards) ? data.flashcards : []);
  writeList(STORAGE_KEYS.SESSIONS, Array.isArray(data.sessions) ? data.sessions : []);
  if (data.settings && typeof data.settings === 'object') {
    writeObject(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS, ...data.settings });
  }
}

/* ------------------------------------------------------------
 * Export everything as one bundle for the whole data layer.
 * (No ES modules here on purpose — this project uses plain
 * <script> tags with no build step, so everything is attached
 * to the global `window` object instead of using import/export.)
 * ------------------------------------------------------------ */
window.DataLayer = {
  Subject: SubjectStore,
  Note: NoteStore,
  Flashcard: FlashcardStore,
  Session: SessionStore,
  Settings: SettingsStore,
  makeId,
  importAll,
  isPersistent: SafeStorage.isPersistent,
};
