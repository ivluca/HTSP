// ── JSON Viewer ─────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let currentJson = null;

  // ── DOM refs (populated after DOMContentLoaded) ───────────────────────────
  let container, outputArea, input, errorBar, clearBtn;

  function init() {
    container  = document.getElementById('json-viewer-container');
    outputArea = document.getElementById('jv-output-area');
    input      = document.getElementById('jv-input');
    errorBar   = document.getElementById('jv-error-bar');
    clearBtn   = document.getElementById('jv-clear-btn');

    if (!container) return;

    // Format on Enter (no shift)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        parseAndRender();
      }
    });

    // Auto-grow textarea only
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Clear button — resets everything
    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.style.height = 'auto';
      currentJson = null;
      showEmpty();
      hideError();
    });
  }

  // ── Parse & Render ─────────────────────────────────────────────────────────
  function parseAndRender() {
    const raw = input.value.trim();
    if (!raw) { showEmpty(); hideError(); return; }

    try {
      const parsed = JSON.parse(raw);
      currentJson = parsed;
      hideError();
      renderTree(parsed);
    } catch (e) {
      showError(e.message);
    }
  }

  function renderTree(data) {
    outputArea.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'jv-tree';
    buildNode(ul, null, data, true);
    outputArea.appendChild(ul);
  }

  // ── Tree Builder ───────────────────────────────────────────────────────────
  function buildNode(parentEl, key, value, isRoot, depth) {
    if (depth === undefined) depth = 0;
    const INDENT = 20; // px per depth level

    const li = document.createElement('li');

    const row = document.createElement('div');
    row.className = 'jv-row';
    row.style.paddingLeft = (depth * INDENT) + 'px';

    const toggle = document.createElement('span');
    const content = document.createElement('span');
    content.className = 'jv-content';

    const isObj = value !== null && typeof value === 'object';
    const isArr = Array.isArray(value);

    if (isObj) {
      const childCount = Object.keys(value).length;
      toggle.className = childCount > 0 ? 'jv-toggle expanded' : 'jv-toggle leaf';

      // Key
      if (key !== null) {
        const keySpan = document.createElement('span');
        keySpan.className = 'jv-key';
        keySpan.textContent = JSON.stringify(key);
        content.appendChild(keySpan);
      }

      // Opening bracket
      const openBracket = document.createElement('span');
      openBracket.className = 'jv-bracket';
      openBracket.textContent = isArr ? '[' : '{';
      content.appendChild(openBracket);

      // Summary (shown when collapsed)
      const summary = document.createElement('span');
      summary.className = 'jv-summary';
      summary.textContent = isArr
        ? ` ${childCount} items `
        : ` ${childCount} items `;
      summary.style.display = 'none';
      content.appendChild(summary);

      // Copy button for this node
      const copyBtn = makeCopyBtn(value);
      row.appendChild(toggle);
      row.appendChild(content);
      row.appendChild(copyBtn);
      li.appendChild(row);

      if (childCount > 0) {
        // Children list — no CSS indent class needed, depth handles it
        const childUl = document.createElement('ul');
        childUl.className = 'jv-children';

        const entries = isArr
          ? value.map((v, i) => [i, v])
          : Object.entries(value);

        entries.forEach(([k, v]) => buildNode(childUl, k, v, false, depth + 1));

        li.appendChild(childUl);

        // Closing bracket row
        const closeLi = document.createElement('li');
        const closeRow = document.createElement('div');
        closeRow.className = 'jv-row';
        closeRow.style.paddingLeft = (depth * INDENT) + 'px';
        const closeToggleSpacer = document.createElement('span');
        closeToggleSpacer.className = 'jv-toggle leaf';
        const closeBracket = document.createElement('span');
        closeBracket.className = 'jv-bracket';
        closeBracket.textContent = isArr ? ']' : '}';
        closeRow.appendChild(closeToggleSpacer);
        closeRow.appendChild(closeBracket);
        closeLi.appendChild(closeRow);
        li.appendChild(closeLi);

        // Toggle expand/collapse
        const toggleCollapse = () => {
          const collapsed = childUl.classList.toggle('collapsed');
          toggle.className = collapsed ? 'jv-toggle collapsed' : 'jv-toggle expanded';
          summary.style.display = collapsed ? 'inline' : 'none';
          closeLi.style.display = collapsed ? 'none' : '';
        };

        toggle.addEventListener('click', toggleCollapse);
        summary.addEventListener('click', toggleCollapse);
      }
    } else {
      // Primitive value
      toggle.className = 'jv-toggle leaf';
      toggle.textContent = '';

      if (key !== null) {
        const keySpan = document.createElement('span');
        keySpan.className = 'jv-key';
        keySpan.textContent = JSON.stringify(key);
        content.appendChild(keySpan);
      }

      const valSpan = document.createElement('span');
      valSpan.className = getValueClass(value);
      valSpan.textContent = formatValue(value);
      content.appendChild(valSpan);

      const copyBtn = makeCopyBtn(value);
      row.appendChild(toggle);
      row.appendChild(content);
      row.appendChild(copyBtn);
      li.appendChild(row);
    }

    parentEl.appendChild(li);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getValueClass(val) {
    if (val === null)            return 'jv-null';
    if (typeof val === 'string') return 'jv-string';
    if (typeof val === 'number') return 'jv-number';
    if (typeof val === 'boolean') return 'jv-boolean';
    return '';
  }

  function formatValue(val) {
    if (val === null)            return 'null';
    if (typeof val === 'string') return JSON.stringify(val);
    return String(val);
  }

  function makeCopyBtn(value) {
    const btn = document.createElement('button');
    btn.className = 'jv-copy-btn';
    btn.title = 'Copy';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" /></svg>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : String(value);
      navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>`;
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" /></svg>`;
          btn.classList.remove('copied');
        }, 1500);
      });
    });
    return btn;
  }

  // ── UI States ──────────────────────────────────────────────────────────────
  function showEmpty() {
    outputArea.innerHTML = `
      <div id="jv-empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M14 3v4a1 1 0 0 0 1 1h4" />
          <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
          <path d="M8 11h2a2 2 0 0 1 0 4h-2v-4" />
          <path d="M14.5 11h1.5a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-1.5v-4" />
        </svg>
        <p>Paste JSON to visualize</p>
        <span>Press <b>Enter</b> to format</span>
      </div>`;
  }

  function showError(msg) {
    errorBar.textContent = '⚠ ' + msg;
    errorBar.classList.add('visible');
  }

  function hideError() {
    errorBar.classList.remove('visible');
    errorBar.textContent = '';
  }

  // ── Init on DOMContentLoaded ───────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    init();
    showEmpty();
  });

})();
