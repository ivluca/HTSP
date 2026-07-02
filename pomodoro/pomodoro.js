/* ── Pomodoro Timer ──────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── Defaults ────────────────────────────────────────────────────────────
  const DEFAULTS = {
    focusMin: 45,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakInterval: 5,
    autoStartBreaks: false,
    autoStartFocus: false,
  };

  // ── State ───────────────────────────────────────────────────────────────
  let config = { ...DEFAULTS };
  let mode = 'focus';            // 'focus' | 'short-break' | 'long-break'
  let remaining = 0;             // seconds left
  let total = 0;                 // total seconds for current mode
  let running = false;
  let timerId = null;

  // Stats (persisted)
  let stats = { focus: 0, breaks: 0, sessions: 0 };
  let log = [];

  // DOM refs
  let els = {};

  // ── SVG ring constants ──────────────────────────────────────────────────
  const RING_RADIUS = 78;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  // ── Init ────────────────────────────────────────────────────────────────
  function init() {
    const container = document.getElementById('pomodoro-container');
    if (!container) return;

    container.innerHTML = buildHTML();
    cacheEls();
    loadData();
    applyConfig();
    setMode(mode);
    bindEvents();
  }

  // ── HTML ────────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <!-- Mode tabs -->
      <div class="pomo-modes">
        <button class="pomo-mode-btn active" data-mode="focus">Focus</button>
        <button class="pomo-mode-btn" data-mode="short-break">Short Break</button>
        <button class="pomo-mode-btn" data-mode="long-break">Long Break</button>
      </div>

      <!-- Timer ring -->
      <div class="pomo-timer-wrap">
        <svg class="pomo-ring-svg" viewBox="0 0 180 180">
          <circle class="pomo-ring-bg" cx="90" cy="90" r="${RING_RADIUS}" />
          <circle id="pomo-ring" class="pomo-ring-progress focus" cx="90" cy="90" r="${RING_RADIUS}"
            stroke-dasharray="${RING_CIRCUMFERENCE}"
            stroke-dashoffset="0" />
        </svg>
        <div class="pomo-time-display">
          <div id="pomo-time" class="pomo-time-text">45:00</div>
          <div id="pomo-label" class="pomo-mode-label">Focus</div>
        </div>
      </div>

      <!-- Controls -->
      <div class="pomo-controls">
        <button class="pomo-ctrl-btn" id="pomo-reset-btn" title="Reset Timer">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
        </button>
        <button class="pomo-ctrl-btn primary" id="pomo-play-btn" title="Start">
          <svg id="pomo-play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" fill="currentColor" stroke="none" /></svg>
        </button>
        <button class="pomo-ctrl-btn" id="pomo-skip-btn" title="Skip to Next">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5v14l12 -7z" /><path d="M20 5l0 14" /></svg>
        </button>
      </div>

      <div class="pomo-divider"></div>

      <!-- Bottom row: settings toggle -->
      <div class="pomo-controls">
        <button class="pomo-ctrl-btn" id="pomo-settings-toggle" title="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.573 1.066c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.066 -2.573c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>
        </button>
      </div>

      <!-- Settings panel -->
      <div class="pomo-settings" id="pomo-settings">
        <div class="pomo-setting-row">
          <label>Focus (min)</label>
          <input type="number" id="pomo-cfg-focus" min="1" max="120" value="45">
        </div>
        <div class="pomo-setting-row">
          <label>Short Break (min)</label>
          <input type="number" id="pomo-cfg-short" min="1" max="30" value="5">
        </div>
        <div class="pomo-setting-row">
          <label>Long Break (min)</label>
          <input type="number" id="pomo-cfg-long" min="1" max="60" value="15">
        </div>
        <div class="pomo-setting-row">
          <label>Long Break Interval</label>
          <input type="number" id="pomo-cfg-interval" min="2" max="10" value="5">
        </div>
        <div class="pomo-setting-row">
          <label>Auto-start Breaks</label>
          <label class="pomo-toggle">
            <input type="checkbox" id="pomo-cfg-auto-break">
            <span class="pomo-toggle-slider"></span>
          </label>
        </div>
        <div class="pomo-setting-row">
          <label>Auto-start Focus</label>
          <label class="pomo-toggle">
            <input type="checkbox" id="pomo-cfg-auto-focus">
            <span class="pomo-toggle-slider"></span>
          </label>
        </div>
      </div>


    `;
  }

  // ── Cache DOM refs ──────────────────────────────────────────────────────
  function cacheEls() {
    els = {
      ring:          document.getElementById('pomo-ring'),
      time:          document.getElementById('pomo-time'),
      label:         document.getElementById('pomo-label'),
      playBtn:       document.getElementById('pomo-play-btn'),
      playIcon:      document.getElementById('pomo-play-icon'),
      resetBtn:      document.getElementById('pomo-reset-btn'),
      skipBtn:       document.getElementById('pomo-skip-btn'),
      settingsToggle: document.getElementById('pomo-settings-toggle'),
      settings:      document.getElementById('pomo-settings'),

      statFocus:     null,
      statBreaks:    null,
      statTotal:     null,
      statPct:       null,
      cfgFocus:      document.getElementById('pomo-cfg-focus'),
      cfgShort:      document.getElementById('pomo-cfg-short'),
      cfgLong:       document.getElementById('pomo-cfg-long'),
      cfgInterval:   document.getElementById('pomo-cfg-interval'),
      cfgAutoBreak:  document.getElementById('pomo-cfg-auto-break'),
      cfgAutoFocus:  document.getElementById('pomo-cfg-auto-focus'),
      modeBtns:      document.querySelectorAll('.pomo-mode-btn'),
    };
  }

  // ── Persistence ─────────────────────────────────────────────────────────
  function loadData() {
    chrome.storage.local.get(['pomoConfig', 'pomoStats', 'pomoLog', 'pomoMode', 'pomoSessions'], (d) => {
      if (d.pomoConfig) config = { ...DEFAULTS, ...d.pomoConfig };
      if (d.pomoStats)  stats  = d.pomoStats;
      if (d.pomoMode)   mode   = d.pomoMode;
      if (d.pomoSessions) stats.sessions = d.pomoSessions;
      applyConfig();
      setMode(mode, true);
    });
  }

  function saveData() {
    chrome.storage.local.set({
      pomoConfig:   config,
      pomoStats:    stats,
      pomoMode:     mode,
      pomoSessions: stats.sessions,
    });
  }

  function applyConfig() {
    els.cfgFocus.value     = config.focusMin;
    els.cfgShort.value     = config.shortBreakMin;
    els.cfgLong.value      = config.longBreakMin;
    els.cfgInterval.value  = config.longBreakInterval;
    els.cfgAutoBreak.checked = config.autoStartBreaks;
    els.cfgAutoFocus.checked = config.autoStartFocus;
  }

  // ── Mode ────────────────────────────────────────────────────────────────
  function setMode(m, silent) {
    if (running) stop();
    mode = m;

    const minutes =
      m === 'focus' ? config.focusMin :
      m === 'short-break' ? config.shortBreakMin :
      config.longBreakMin;

    total = minutes * 60;
    remaining = total;

    // Update mode buttons
    els.modeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === m);
    });

    // Ring color class
    els.ring.setAttribute('class', 'pomo-ring-progress ' + (m === 'focus' ? 'focus' : m === 'short-break' ? 'short-break' : 'long-break'));

    // Label
    const labels = { 'focus': 'Focus', 'short-break': 'Short Break', 'long-break': 'Long Break' };
    els.label.textContent = labels[m];

    updateDisplay();
    if (!silent) saveData();
  }

  // ── Timer Logic ─────────────────────────────────────────────────────────
  function start() {
    if (running) return;
    running = true;
    updatePlayIcon();

    // Derive remaining time from a fixed end timestamp rather than decrementing
    // a counter, so the countdown stays accurate even if Chrome throttles the
    // 1s interval while the side panel is inactive/backgrounded.
    const endTime = Date.now() + remaining * 1000;
    timerId = setInterval(() => {
      remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      updateDisplay();

      if (remaining <= 0) {
        stop();
        onComplete();
      }
    }, 1000);
  }

  function stop() {
    running = false;
    clearInterval(timerId);
    timerId = null;
    updatePlayIcon();
  }

  function toggle() {
    running ? stop() : start();
  }

  function resetTimer() {
    stop();
    remaining = total;
    updateDisplay();
  }

  function skip() {
    stop();
    onComplete();
  }

  function onComplete() {
    // Record session
    const now = new Date();
    const minutes =
      mode === 'focus' ? config.focusMin :
      mode === 'short-break' ? config.shortBreakMin :
      config.longBreakMin;

    if (mode === 'focus') {
      stats.focus += minutes;
      stats.sessions++;
    } else {
      stats.breaks += minutes;
    }

    log.unshift({
      type: mode,
      minutes,
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    // Keep log to 50 entries max
    if (log.length > 50) log.length = 50;

    saveData();

    // Determine next mode
    let nextMode;
    if (mode === 'focus') {
      nextMode = (stats.sessions % config.longBreakInterval === 0) ? 'long-break' : 'short-break';
    } else {
      nextMode = 'focus';
    }

    setMode(nextMode);

    // Auto-start
    if ((nextMode !== 'focus' && config.autoStartBreaks) ||
        (nextMode === 'focus' && config.autoStartFocus)) {
      start();
    }
  }

  // ── Display ─────────────────────────────────────────────────────────────
  function updateDisplay() {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    els.time.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Ring progress
    const progress = total > 0 ? (total - remaining) / total : 0;
    const offset = RING_CIRCUMFERENCE * (1 - progress);
    els.ring.style.strokeDashoffset = offset;
  }

  function updatePlayIcon() {
    if (running) {
      els.playIcon.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" fill="currentColor" stroke="none" /><path d="M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" fill="currentColor" stroke="none" />';
      els.playBtn.title = 'Pause';
    } else {
      els.playIcon.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" fill="currentColor" stroke="none" />';
      els.playBtn.title = 'Start';
    }
  }



  // ── Events ──────────────────────────────────────────────────────────────
  function bindEvents() {
    // Mode buttons
    els.modeBtns.forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    // Controls
    els.playBtn.addEventListener('click', toggle);
    els.resetBtn.addEventListener('click', resetTimer);
    els.skipBtn.addEventListener('click', skip);

    // Settings toggle
    els.settingsToggle.addEventListener('click', () => {
      els.settings.classList.toggle('open');
    });



    // Config changes
    const configInputs = [els.cfgFocus, els.cfgShort, els.cfgLong, els.cfgInterval];
    configInputs.forEach(input => {
      input.addEventListener('change', () => {
        config.focusMin          = parseInt(els.cfgFocus.value) || DEFAULTS.focusMin;
        config.shortBreakMin     = parseInt(els.cfgShort.value) || DEFAULTS.shortBreakMin;
        config.longBreakMin      = parseInt(els.cfgLong.value)  || DEFAULTS.longBreakMin;
        config.longBreakInterval = parseInt(els.cfgInterval.value) || DEFAULTS.longBreakInterval;
        saveData();
        // If timer is not running, update the current mode time
        if (!running) setMode(mode);
      });
    });

    els.cfgAutoBreak.addEventListener('change', () => {
      config.autoStartBreaks = els.cfgAutoBreak.checked;
      saveData();
    });

    els.cfgAutoFocus.addEventListener('change', () => {
      config.autoStartFocus = els.cfgAutoFocus.checked;
      saveData();
    });
  }

  // ── Bootstrap ───────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
