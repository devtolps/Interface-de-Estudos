/**
 * ================================================================
 * POMODORO.JS
 * ================================================================
 * A small self-contained class that implements the Pomodoro
 * Technique: alternating "focus" blocks with "short break" blocks,
 * and a "long break" every 4th focus block.
 *
 * This is written as a CLASS (not a bunch of loose functions) on
 * purpose: a timer has internal STATE that changes over time
 * (how many seconds are left, whether it's running, which mode
 * it's in), and a class is a natural way to bundle state + the
 * behavior that operates on it together.
 *
 * The class knows NOTHING about the DOM (no document.querySelector
 * here). It only exposes callbacks (onTick, onModeChange) that
 * app.js subscribes to. This is the same "separation of concerns"
 * idea used in srs.js: the timer's logic is independent from how
 * it's drawn on screen, which makes it easy to test or reuse.
 * ================================================================
 */

class PomodoroTimer {
  /**
   * @param {object} config
   * @param {number} config.focusMinutes
   * @param {number} config.shortBreakMinutes
   * @param {number} config.longBreakMinutes
   * @param {function} config.onTick        called every second with {secondsLeft, totalSeconds, mode}
   * @param {function} config.onModeChange  called whenever we switch focus/break
   * @param {function} config.onFocusComplete called each time a FULL focus block finishes
   */
  constructor({ focusMinutes, shortBreakMinutes, longBreakMinutes, onTick, onModeChange, onFocusComplete }) {
    this.durations = {
      focus: focusMinutes * 60,
      short: shortBreakMinutes * 60,
      long: longBreakMinutes * 60,
    };

    this.mode = 'focus';           // 'focus' | 'short' | 'long'
    this.secondsLeft = this.durations.focus;
    this.completedFocusBlocks = 0; // used to know when a long break is due
    this.intervalId = null;

    this.onTick = onTick || (() => {});
    this.onModeChange = onModeChange || (() => {});
    this.onFocusComplete = onFocusComplete || (() => {});
  }

  /** Updates the configured durations (called when the user edits the number inputs). */
  setDurations({ focusMinutes, shortBreakMinutes, longBreakMinutes }) {
    this.durations = {
      focus: focusMinutes * 60,
      short: shortBreakMinutes * 60,
      long: longBreakMinutes * 60,
    };
    // If the timer isn't running, refresh the visible countdown to
    // match the newly edited duration for the current mode.
    if (!this.intervalId) {
      this.secondsLeft = this.durations[this.mode];
      this._emitTick();
    }
  }

  start() {
    if (this.intervalId) return; // already running, avoid double intervals
    this.intervalId = setInterval(() => this._tick(), 1000);
  }

  pause() {
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  reset() {
    this.pause();
    this.mode = 'focus';
    this.completedFocusBlocks = 0;
    this.secondsLeft = this.durations.focus;
    this.onModeChange(this.mode);
    this._emitTick();
  }

  isRunning() {
    return this.intervalId !== null;
  }

  /** Internal: runs once per second while the timer is active. */
  _tick() {
    this.secondsLeft -= 1;

    if (this.secondsLeft <= 0) {
      this._advanceMode();
    } else {
      this._emitTick();
    }
  }

  /** Internal: decides which mode comes next and switches to it. */
  _advanceMode() {
    if (this.mode === 'focus') {
      this.completedFocusBlocks += 1;
      this.onFocusComplete(this.completedFocusBlocks);

      // Every 4th completed focus block earns a long break, otherwise
      // a short break — this is the classic Pomodoro cadence.
      const isLongBreakDue = this.completedFocusBlocks % 4 === 0;
      this.mode = isLongBreakDue ? 'long' : 'short';
    } else {
      this.mode = 'focus';
    }

    this.secondsLeft = this.durations[this.mode];
    this.onModeChange(this.mode);
    this._emitTick();
  }

  /** Internal: notifies the UI layer of the current countdown state. */
  _emitTick() {
    this.onTick({
      secondsLeft: this.secondsLeft,
      totalSeconds: this.durations[this.mode],
      mode: this.mode,
    });
  }
}

window.PomodoroTimer = PomodoroTimer;
