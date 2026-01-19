function setupTabManagerHeader(allTabsArePinned = false) {
  const tabManagerHeader = document.getElementById('tab-manager-header');
  tabManagerHeader.innerHTML = '';
  
  const title = document.createElement('h3');
  title.textContent = 'Tab Manager';
  
  const actions = document.createElement('div');
  actions.classList.add('header-actions');

  const mergeBtn = createActionButton('merge', false, async () => {
    if (confirm('Are you sure you want to merge all tabs from other windows into this one?')) {
      const currentWindow = await chrome.windows.getCurrent();
      const tabs = await chrome.tabs.query({ windowId: -1, pinned: false });
      const otherWindowTabs = tabs.filter(tab => tab.windowId !== currentWindow.id);
      const tabIds = otherWindowTabs.map(t => t.id);
      if (tabIds.length > 0) {
        chrome.tabs.move(tabIds, { windowId: currentWindow.id, index: -1 });
      }
    }
  });

  const showLinksBtn = createActionButton('link', showLinks, () => {
    showLinks = !showLinks;
    renderBrowserTabs();
  });

  const pinAllBtn = createActionButton('pin', allTabsArePinned, async () => {
    const tabsToChange = await chrome.tabs.query({ pinned: allTabsArePinned });
    for (const tab of tabsToChange) {
      await chrome.tabs.update(tab.id, { pinned: !allTabsArePinned });
    }
    requestRenderBrowserTabs();
  });
  pinAllBtn.title = allTabsArePinned ? tooltips.unpinAll : tooltips.pinAll;

  const reloadAllBtn = createActionButton('reload', false, async () => {
    if (confirm('Are you sure you want to reload all tabs?')) {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) await chrome.tabs.reload(tab.id);
    }
  });

  const closeAllBtn = createActionButton('close', false, async () => {
    if (confirm('Are you sure you want to close all non-pinned tabs?')) {
      const tabs = await chrome.tabs.query({ pinned: false });
      const tabIds = tabs.map(t => t.id);
      chrome.tabs.remove(tabIds, renderBrowserTabs);
    }
  });

  actions.append(mergeBtn, showLinksBtn, pinAllBtn, reloadAllBtn, closeAllBtn);
  tabManagerHeader.append(title, actions);
}

function requestRenderBrowserTabs() {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => renderBrowserTabs(searchTerm), 100);
}

async function renderBrowserTabs(filter = '') {
  if (document.getElementById('tab-manager-container').classList.contains('hidden')) return;

  const [browserTabs, allBookmarks, currentWindow] = await Promise.all([
    chrome.tabs.query({}),
    chrome.bookmarks.getTree(),
    chrome.windows.getCurrent()
  ]);

  const bookmarkMap = new Map();
  function extractBookmarkData(nodes) {
    for (const node of nodes) {
      if (node.url) bookmarkMap.set(node.url, node.title);
      if (node.children) extractBookmarkData(node.children);
    }
  }
  extractBookmarkData(allBookmarks);

  const windows = new Map();
  const pinnedTabsFragment = document.createDocumentFragment();
  let pinnedCount = 0;
  let unpinnedCount = 0;
  const lowerCaseFilter = filter.toLowerCase();

  for (const tab of browserTabs) {
    const displayTitle = bookmarkMap.get(tab.url) || tab.title;
    const matchesFilter = filter === '' || 
                          displayTitle.toLowerCase().includes(lowerCaseFilter) || 
                          (tab.url && tab.url.toLowerCase().includes(lowerCaseFilter));

    if (matchesFilter) {
      const tabItem = createTabItem(tab, bookmarkMap, displayTitle);
      if (tab.pinned) {
        pinnedTabsFragment.appendChild(tabItem);
        pinnedCount++;
      } else {
        unpinnedCount++;
        if (!windows.has(tab.windowId)) {
          windows.set(tab.windowId, []);
        }
        windows.get(tab.windowId).push(tabItem);
      }
    }
  }
  
  setupTabManagerHeader(unpinnedCount === 0 && pinnedCount > 0);
  const pinnedTabsSection = document.getElementById('pinned-tabs-section');
  pinnedTabsSection.style.display = pinnedCount > 0 ? 'block' : 'none';

  const windowGroupsFragment = document.createDocumentFragment();
  const sortedWindows = [...windows.entries()].sort((a, b) => {
    if (a[0] === currentWindow.id) return -1;
    if (b[0] === currentWindow.id) return 1;
    return a[0] - b[0];
  });

  let windowCounter = 1;
  for (const [windowId, tabItems] of sortedWindows) {
    const group = document.createElement('div');
    const title = document.createElement('h3');
    title.classList.add('section-title');
    
    const isCurrentWindow = windowId === currentWindow.id;
    const titleText = isCurrentWindow ? 'Current Window' : `Window ${windowCounter}`;
    title.textContent = `${titleText} (${tabItems.length} tabs)`;
    
    group.appendChild(title);
    tabItems.forEach(tabItem => group.appendChild(tabItem));
    windowGroupsFragment.appendChild(group);
    
    if (!isCurrentWindow) windowCounter++;
  }

  const pinnedTabsList = document.getElementById('pinned-tabs-list');
  const windowGroupsContainer = document.getElementById('window-groups-container');
  pinnedTabsList.replaceChildren(pinnedTabsFragment);
  windowGroupsContainer.replaceChildren(windowGroupsFragment);

  document.querySelector('.action-btn.link').classList.toggle('active', showLinks);
}

function createTabItem(tab, bookmarkMap, displayTitle) {
  const tabItem = document.createElement('div');
  tabItem.classList.add('browser-tab-item');
  tabItem.dataset.tabId = tab.id;
  tabItem.dataset.windowId = tab.windowId;

  if (tab.active) tabItem.classList.add('is-active');
  
  tabItem.addEventListener('click', (e) => {
    if (e.target.closest('.action-btn')) return;
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  });
  
  const mainPart = document.createElement('div');
  mainPart.classList.add('browser-tab-item-main');
  
  const clickablePart = document.createElement('div');
  clickablePart.classList.add('browser-tab-item-main-clickable');
  clickablePart.title = displayTitle;
  
  const isBookmarked = bookmarkMap.has(tab.url);
  
  const favicon = document.createElement('img');
  favicon.src = tab.favIconUrl || 'images/icon.png';
  clickablePart.appendChild(favicon);

  const title = document.createElement('span');
  title.textContent = displayTitle;
  clickablePart.appendChild(title);
  
  const actions = document.createElement('div');
  actions.classList.add('browser-tab-actions');

  const pinBtn = createActionButton('pin', tab.pinned, () => {
    chrome.tabs.update(tab.id, { pinned: !tab.pinned }, requestRenderBrowserTabs);
  });
  const bookmarkBtn = createActionButton('star', isBookmarked, async () => {
    if (isBookmarked) {
      const bookmarks = await chrome.bookmarks.search({url: tab.url});
      for (const bm of bookmarks) await chrome.bookmarks.remove(bm.id);
    } else {
      await chrome.bookmarks.create({title: tab.title, url: tab.url});
    }
    requestRenderBrowserTabs();
  });
  const reloadBtn = createActionButton('reload', false, () => chrome.tabs.reload(tab.id));
  const closeBtn = createActionButton('close', false, () => chrome.tabs.remove(tab.id));

  actions.append(pinBtn, bookmarkBtn, reloadBtn, closeBtn);
  mainPart.append(clickablePart, actions);

  const urlPart = document.createElement('div');
  urlPart.classList.add('tab-url');
  if (showLinks) urlPart.classList.add('visible');
  urlPart.textContent = tab.url;

  tabItem.append(mainPart, urlPart);
  return tabItem;
}
