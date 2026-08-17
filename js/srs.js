/**
 * ================================================================
 * SRS.JS  (Spaced Repetition System)
 * ================================================================
 * Implements a SIMPLIFIED version of the SM-2 algorithm, the same
 * family of algorithm used by tools like Anki. The core idea:
 *
 *   - Every time you review a card, you grade how well you
 *     remembered it (Again / Hard / Good / Easy).
 *   - The better you remembered it, the FARTHER in the future the
 *     card is scheduled to appear again.
 *   - If you forgot it ("Again"), the interval resets to almost
 *     zero, so the card comes back very soon.
 *
 * This is a pure function module: given a card and a grade, it
 * returns a NEW card object with updated scheduling fields. It does
 * not touch localStorage directly — that's storage.js's job. This
 * separation is a common software design pattern called
 * "separation of concerns": SRS.JS only knows about the MATH of
 * spaced repetition, not about HOW or WHERE data is saved.
 * ================================================================
 */

/** Grades a user can give after seeing the answer of a flashcard. */
const Grade = {
  AGAIN: 'again', // "I did not remember at all"
  HARD: 'hard',   // "I remembered, but it was difficult"
  GOOD: 'good',   // "I remembered with normal effort"
  EASY: 'easy',   // "It was trivial"
};

/**
 * Returns today's date as 'YYYY-MM-DD', and a helper to add N days
 * to a date and format it the same way. Keeping dates as plain
 * strings (instead of Date objects) makes them trivial to compare
 * and to store as JSON.
 */
function addDaysToToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The main scheduling function.
 * @param {object} card  a Flashcard object from storage.js
 *                        (must have interval, easeFactor, repetitions)
 * @param {string} grade one of the Grade constants above
 * @returns {object} a NEW card object with updated SRS fields
 */
function scheduleNextReview(card, grade) {
  // We never mutate the original card — we build a copy. This keeps
  // the function predictable and easy to test/reason about.
  let { interval, easeFactor, repetitions } = card;

  if (grade === Grade.AGAIN) {
    // Forgot the card: start over, but don't punish the ease factor
    // too harshly — a single slip shouldn't ruin long-term scheduling.
    repetitions = 0;
    interval = 0; // due again today
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else {
    // Remembered the card at some level -> grow the interval.
    repetitions += 1;

    if (repetitions === 1) {
      interval = 1; // first successful review -> see it again tomorrow
    } else if (repetitions === 2) {
      interval = 6; // second successful review -> a week-ish later
    } else {
      // From the third successful review onward, the interval grows
      // multiplicatively by the ease factor — this is what makes
      // well-known cards show up less and less often over time.
      interval = Math.round(interval * easeFactor);
    }

    // Adjust the ease factor itself based on how easy/hard it felt.
    // This mirrors the original SM-2 formula, simplified.
    if (grade === Grade.HARD) easeFactor = Math.max(1.3, easeFactor - 0.15);
    if (grade === Grade.EASY) easeFactor = easeFactor + 0.15;
    // GOOD leaves the ease factor unchanged.
  }

  return {
    ...card,
    interval,
    easeFactor,
    repetitions,
    dueDate: addDaysToToday(interval),
  };
}

/**
 * Filters a list of flashcards down to only the ones due today
 * (dueDate is today or earlier — "earlier" covers cards you skipped
 * on a previous day, so nothing silently disappears).
 */
function getDueCards(allCards) {
  const today = new Date().toISOString().slice(0, 10);
  return allCards.filter((card) => card.dueDate <= today);
}

window.SRS = { Grade, scheduleNextReview, getDueCards };
