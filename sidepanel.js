let showLinks = false;
let renderTimeout;
let searchTerm = '';

const icons = {
  merge: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M15 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M7 8l0 8" /><path d="M7 8a4 4 0 0 0 4 4h4" /></svg>',
  link: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 15l6 -6" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M13 18l-.397 .534a5 5 0 0 1 -7.071 -7.072l.534 -.464" /></svg>',
  pin: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4" /><path d="M9 15l-4.5 4.5" /><path d="M14.5 4l5.5 5.5" /></svg>',
  star: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245" /></svg>',
  reload: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>',
  folderOpen: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-category-plus"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 4h6v6h-6v-6" /><path d="M14 4h6v6h-6v-6" /><path d="M4 14h6v6h-6v-6" /><path d="M14 17h6m-3 -3v6" /></svg>',
  ungroup: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-category-minus"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 4h6v6h-6v-6" /><path d="M14 4h6v6h-6v-6" /><path d="M4 14h6v6h-6v-6" /><path d="M14 17h6" /></svg>',
  eye: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-eye"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></svg>',
  commit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-git-commit"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M12 3l0 6" /><path d="M12 15l0 6" /></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-plus"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>',
  minus: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-minus"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l14 0" /></svg>'
};

const tooltips = {
  merge: 'Merge All Windows',
  link: 'Show/Hide Links',
  pin: 'Pin/Unpin Tab',
  star: 'Bookmark/Un-bookmark Tab',
  reload: 'Reload Tab',
  close: 'Close Tab',
  group: 'Group Tabs',
  ungroup: 'Ungroup Tabs',
  pinAll: 'Pin All Tabs',
  unpinAll: 'Unpin All Tabs',
  eye: 'Show/Hide Tab Title'
};

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
}

function checkColorScheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  } else {
    applyTheme('light');
  }
}

function createActionButton(iconName, isActive, onClick) {
  const btn = document.createElement('button');
  btn.classList.add('action-btn', iconName);
  if (isActive) btn.classList.add('active');
  btn.innerHTML = icons[iconName];
  btn.title = tooltips[iconName] || '';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function switchTab(targetId) {
  const allTabs = document.querySelectorAll('.tab');
  const iframesAndContainers = document.querySelectorAll('.ai-frame');
  
  iframesAndContainers.forEach(c => c.classList.add('hidden'));
  const target = document.getElementById(targetId);
  if (target) target.classList.remove('hidden');

  if (targetId === 'tab-manager-container') {
    requestRenderBrowserTabs();
  }

  allTabs.forEach(t => {
    if (t.dataset.target === targetId) {
      t.classList.add('active');
      t.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } else {
      t.classList.remove('active');
    }
  });
}

function setupEventListeners() {
  const tabsContainer = document.querySelector('.tabs');
  const allTabs = document.querySelectorAll('.tab');
  const searchBox = document.getElementById('search-box');
  const tabManagerContainer = document.getElementById('tab-manager-container');

  // Add event listeners
  searchBox.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    requestRenderBrowserTabs();
  });

  allTabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.target)));

  tabManagerContainer.addEventListener('click', async (e) => {
    if (!e.target.closest('.browser-tab-item')) {
      selectedTabs.clear();
      await renderBrowserTabs();
    }
  });

  // Mouse drag scrolling for tabs
  let isDown = false, startX, scrollLeft;
  tabsContainer.addEventListener('mousedown', (e) => {
    if (e.target.closest('.dropdown')) return;
    isDown = true;
    startX = e.pageX - tabsContainer.offsetLeft;
    scrollLeft = tabsContainer.scrollLeft;
  });
  tabsContainer.addEventListener('mouseleave', () => isDown = false);
  tabsContainer.addEventListener('mouseup', () => isDown = false);
  tabsContainer.addEventListener('mousemove', (e) => {
    if(!isDown) return;
    e.preventDefault();
    const x = e.pageX - tabsContainer.offsetLeft;
    const walk = (x - startX) * 2;
    tabsContainer.scrollLeft = scrollLeft - walk;
  });

  // Trackpad scrolling for tabs
  tabsContainer.addEventListener('wheel', (e) => {
    if (e.deltaY === 0 && e.deltaX === 0) return;
    e.preventDefault();
    tabsContainer.scrollLeft += e.deltaX || e.deltaY;
  });
}

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', setupEventListeners);

chrome.runtime.onMessage.addListener((request) => {
  switch (request.type) {
    case 'TAB_CREATED':
    case 'TAB_REMOVED':
    case 'TAB_UPDATED':
    case 'TAB_MOVED':
    case 'TAB_ATTACHED':
    case 'TAB_DETACHED':
    case 'TAB_ACTIVATED':
    case 'WINDOW_CREATED':
    case 'WINDOW_REMOVED':
      requestRenderBrowserTabs();
      break;
  }
});

chrome.tabGroups.onUpdated.addListener((group) => {
  if (group.collapsed !== undefined) {
    requestRenderBrowserTabs();
  }
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', checkColorScheme);
checkColorScheme();
