const hiddenTabs = new Set();
const selectedTabs = new Set();

function setupTabManagerHeader() {
  const tabManagerHeader = document.getElementById('tab-manager-header');
  tabManagerHeader.innerHTML = '';
  
  const title = document.createElement('h3');
  title.textContent = 'Tab Manager';
  
  const actions = document.createElement('div');
  actions.classList.add('header-actions');

  const mergeBtn = createActionButton('merge', false, async () => {
    const currentWindow = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: -1, pinned: false });
    const otherWindowTabs = tabs.filter(tab => tab.windowId !== currentWindow.id);
    const tabIds = otherWindowTabs.map(t => t.id);
    if (tabIds.length > 0) {
      chrome.tabs.move(tabIds, { windowId: currentWindow.id, index: -1 });
    }
  });

  const showLinksBtn = createActionButton('link', showLinks, () => {
    showLinks = !showLinks;
    renderBrowserTabs();
  });

  const pinSelectedBtn = createActionButton('pin', false, async () => {
    for (const tabId of selectedTabs) {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { pinned: !tab.pinned });
    }
    requestRenderBrowserTabs();
  });
  pinSelectedBtn.disabled = selectedTabs.size === 0;

  const reloadSelectedBtn = createActionButton('reload', false, async () => {
    for (const tabId of selectedTabs) {
      await chrome.tabs.reload(tabId);
    }
  });
  reloadSelectedBtn.disabled = selectedTabs.size === 0;

  const closeSelectedBtn = createActionButton('close', false, async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabsToDelete = Array.from(selectedTabs).filter(tabId => tabId !== activeTab.id);

    if (tabsToDelete.length > 0) {
      await chrome.tabs.remove(tabsToDelete);
      selectedTabs.clear();
      requestRenderBrowserTabs();
    }
  });
  closeSelectedBtn.disabled = selectedTabs.size === 0;

  actions.append(mergeBtn, showLinksBtn, pinSelectedBtn, reloadSelectedBtn, closeSelectedBtn);
  tabManagerHeader.append(title, actions);
}

function requestRenderBrowserTabs() {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => renderBrowserTabs(searchTerm), 100);
}

async function renderBrowserTabs(filter = '') {
  if (document.getElementById('tab-manager-container').classList.contains('hidden')) return;

  const [allWindows, allTabGroups, currentWindow] = await Promise.all([
    chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }),
    chrome.tabGroups.query({}),
    chrome.windows.getCurrent()
  ]);

  const groupMap = new Map(allTabGroups.map(group => [group.id, group]));
  const lowerCaseFilter = filter.toLowerCase();
  
  setupTabManagerHeader();

  const windowGroupsFragment = document.createDocumentFragment();
  
  allWindows.sort((a, b) => {
    if (a.id === currentWindow.id) return -1;
    if (b.id === currentWindow.id) return 1;
    return a.id - b.id;
  });

  let windowCounter = 1;
  for (const win of allWindows) {
    const windowTabs = win.tabs.filter(tab => {
        const displayTitle = tab.title;
        return filter === '' || 
               displayTitle.toLowerCase().includes(lowerCaseFilter) || 
               (tab.url && tab.url.toLowerCase().includes(lowerCaseFilter));
    });

    if (windowTabs.length === 0) continue;

    const groupEl = document.createElement('div');
    const titleEl = document.createElement('h3');
    titleEl.classList.add('section-title');
    
    const isCurrentWindow = win.id === currentWindow.id;
    const titleText = isCurrentWindow ? 'Current Window' : `Window ${windowCounter}`;
    const totalTabs = windowTabs.length;
    titleEl.textContent = `${titleText} (${totalTabs} tabs)`;
    
    groupEl.appendChild(titleEl);

    const pinnedItems = [];
    const groupItems = new Map();
    const unpinnedItems = [];

    for (const tab of windowTabs) {
        const tabItem = createTabItem(tab, tab.title);
        if (tab.pinned) {
            pinnedItems.push(tabItem);
        } else if (tab.groupId !== -1 && groupMap.has(tab.groupId)) {
            if (!groupItems.has(tab.groupId)) {
                groupItems.set(tab.groupId, { ...groupMap.get(tab.groupId), tabs: [] });
            }
            groupItems.get(tab.groupId).tabs.push(tabItem);
        } else {
            unpinnedItems.push(tabItem);
        }
    }

    pinnedItems.forEach(item => groupEl.appendChild(item));
    
    for (const group of groupItems.values()) {
        const groupHeader = document.createElement('div');
        groupHeader.className = `tab-group-header color-${group.color}`;
        groupHeader.textContent = group.title;
        groupEl.appendChild(groupHeader);
        group.tabs.forEach(tabItem => groupEl.appendChild(tabItem));
    }
    unpinnedItems.forEach(item => groupEl.appendChild(item));

    windowGroupsFragment.appendChild(groupEl);
    
    if (!isCurrentWindow) windowCounter++;
  }

  const windowGroupsContainer = document.getElementById('window-groups-container');
  windowGroupsContainer.replaceChildren(windowGroupsFragment);

  document.querySelector('.action-btn.link').classList.toggle('active', showLinks);
  
  const closeSelectedBtn = document.querySelector('.header-actions .action-btn.close');
  if (closeSelectedBtn) closeSelectedBtn.disabled = selectedTabs.size === 0;

  const pinSelectedBtn = document.querySelector('.header-actions .action-btn.pin');
  if (pinSelectedBtn) pinSelectedBtn.disabled = selectedTabs.size === 0;

  const reloadSelectedBtn = document.querySelector('.header-actions .action-btn.reload');
  if (reloadSelectedBtn) reloadSelectedBtn.disabled = selectedTabs.size === 0;
}

function createTabItem(tab, displayTitle) {
  const tabItem = document.createElement('div');
  tabItem.classList.add('browser-tab-item');
  tabItem.dataset.tabId = tab.id;
  tabItem.dataset.windowId = tab.windowId;

  if (tab.active) tabItem.classList.add('is-active');
  if (selectedTabs.has(tab.id)) tabItem.classList.add('is-selected');
  
  tabItem.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      if (selectedTabs.has(tab.id)) {
        selectedTabs.delete(tab.id);
      } else {
        selectedTabs.add(tab.id);
      }
      renderBrowserTabs();
    } else {
      if (e.target.closest('.action-btn')) return;
      selectedTabs.clear();
      chrome.tabs.update(tab.id, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
    }
  });
  
  const mainPart = document.createElement('div');
  mainPart.classList.add('browser-tab-item-main');
  
  const clickablePart = document.createElement('div');
  clickablePart.classList.add('browser-tab-item-main-clickable');
  clickablePart.title = displayTitle;
  
  const favicon = document.createElement('img');
  favicon.src = tab.favIconUrl || 'images/icon.png';
  clickablePart.appendChild(favicon);

  const title = document.createElement('span');
  title.textContent = displayTitle;
  if (hiddenTabs.has(tab.id)) {
    title.classList.add('blurred');
  }
  clickablePart.appendChild(title);
  
  const actions = document.createElement('div');
  actions.classList.add('browser-tab-actions');

  const pinBtn = createActionButton('pin', tab.pinned, () => {
    chrome.tabs.update(tab.id, { pinned: !tab.pinned }, requestRenderBrowserTabs);
  });
  const eyeBtn = createActionButton('eye', hiddenTabs.has(tab.id), () => {
    if (hiddenTabs.has(tab.id)) {
      hiddenTabs.delete(tab.id);
    } else {
      hiddenTabs.add(tab.id);
    }
    requestRenderBrowserTabs();
  });
  const reloadBtn = createActionButton('reload', false, () => chrome.tabs.reload(tab.id));
  const closeBtn = createActionButton('close', false, () => {
    chrome.tabs.remove(tab.id);
    selectedTabs.delete(tab.id);
  });

  actions.append(pinBtn, eyeBtn, reloadBtn, closeBtn);
  mainPart.append(clickablePart, actions);

  const urlPart = document.createElement('div');
  urlPart.classList.add('tab-url');
  if (showLinks) urlPart.classList.add('visible');
  urlPart.textContent = tab.url;

  tabItem.append(mainPart, urlPart);
  return tabItem;
}
