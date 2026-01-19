document.addEventListener('DOMContentLoaded', () => {
  const tabsContainer = document.querySelector('.tabs');
  const allTabs = document.querySelectorAll('.tab');
  const iframesAndContainers = document.querySelectorAll('.ai-frame');
  const dropdownBtn = document.getElementById('dropdown-btn');
  const dropdownContent = document.getElementById('dropdown-content');
  
  // Tab Manager Elements
  const tabManagerHeader = document.getElementById('tab-manager-header');
  const searchBox = document.getElementById('search-box');
  const pinnedTabsSection = document.getElementById('pinned-tabs-section');
  const pinnedTabsList = document.getElementById('pinned-tabs-list');
  const windowGroupsContainer = document.getElementById('window-groups-container');

  let showLinks = false;
  let renderTimeout;
  let searchTerm = '';
  let draggedElement = null;

  const icons = {
    merge: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M15 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M7 8l0 8" /><path d="M7 8a4 4 0 0 0 4 4h4" /></svg>',
    link: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 15l6 -6" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M13 18l-.397 .534a5 5 0 0 1 -7.071 -7.072l.534 -.464" /></svg>',
    pin: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4" /><path d="M9 15l-4.5 4.5" /><path d="M14.5 4l5.5 5.5" /></svg>',
    star: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245" /></svg>',
    reload: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>'
  };

  const tooltips = {
    merge: 'Merge All Windows',
    link: 'Show/Hide Links',
    pin: 'Pin/Unpin Tab',
    star: 'Bookmark/Un-bookmark Tab',
    reload: 'Reload Tab',
    close: 'Close Tab',
    pinAll: 'Pin All Tabs',
    unpinAll: 'Unpin All Tabs'
  };

  function setupTabManagerHeader(allTabsArePinned = false) {
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
  
    pinnedTabsList.replaceChildren(pinnedTabsFragment);
    windowGroupsContainer.replaceChildren(windowGroupsFragment);
  
    document.querySelector('.action-btn.link').classList.toggle('active', showLinks);
  }

  function createTabItem(tab, bookmarkMap, displayTitle) {
    const tabItem = document.createElement('div');
    tabItem.classList.add('browser-tab-item');
    tabItem.setAttribute('draggable', 'true');
    tabItem.dataset.tabId = tab.id;
    tabItem.dataset.windowId = tab.windowId;

    if (tab.active) tabItem.classList.add('is-active');
    
    tabItem.addEventListener('dragstart', (e) => {
      draggedElement = e.currentTarget;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => draggedElement.classList.add('dragging'), 0);
    });

    tabItem.addEventListener('dragend', () => {
      draggedElement.classList.remove('dragging');
      draggedElement = null;
    });

    tabItem.addEventListener('dragover', (e) => {
      e.preventDefault();
      const target = e.currentTarget;
      if (target === draggedElement) return;

      const rect = target.getBoundingClientRect();
      const isAfter = e.clientY > rect.top + rect.height / 2;
      
      document.querySelectorAll('.browser-tab-item').forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      if (isAfter) {
        target.classList.add('drag-over-bottom');
      } else {
        target.classList.add('drag-over-top');
      }
    });
    
    tabItem.addEventListener('dragleave', (e) => {
      e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    tabItem.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropTarget = e.currentTarget;
      dropTarget.classList.remove('drag-over-top', 'drag-over-bottom');

      if (draggedElement && draggedElement !== dropTarget) {
        const draggedTabId = parseInt(draggedElement.dataset.tabId);
        const targetTabId = parseInt(dropTarget.dataset.tabId);
        
        if (draggedElement.dataset.windowId !== dropTarget.dataset.windowId) {
          return;
        }

        const rect = dropTarget.getBoundingClientRect();
        const isAfter = e.clientY > rect.top + rect.height / 2;

        chrome.tabs.get(targetTabId, (targetTabDetails) => {
          const newIndex = isAfter ? targetTabDetails.index + 1 : targetTabDetails.index;
          
          if (isAfter) {
            dropTarget.after(draggedElement);
          } else {
            dropTarget.before(draggedElement);
          }
          
          chrome.tabs.move(draggedTabId, { index: newIndex });
        });
      }
    });
    
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

  // --- Event Listeners ---
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
      case 'BOOKMARK_CREATED':
      case 'BOOKMARK_REMOVED':
      case 'BOOKMARK_CHANGED':
        requestRenderBrowserTabs();
        break;
    }
  });

  searchBox.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    requestRenderBrowserTabs();
  });

  allTabs.forEach(tab => {
    const item = document.createElement('a');
    item.textContent = tab.textContent;
    item.classList.add('dropdown-item');
    item.dataset.target = tab.dataset.target;
    dropdownContent.appendChild(item);
  });

  const dropdownItems = document.querySelectorAll('.dropdown-item');

  function switchTab(targetId) {
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
    
    dropdownContent.classList.remove('show');
  }

  allTabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.target)));
  dropdownItems.forEach(item => item.addEventListener('click', () => switchTab(item.dataset.target)));
  dropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownContent.classList.toggle('show');
  });
  window.addEventListener('click', () => {
    if (dropdownContent.classList.contains('show')) {
      dropdownContent.classList.remove('show');
    }
  });

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

  document.getElementById('year').textContent = new Date().getFullYear();
  setupTabManagerHeader();
  switchTab('tab-manager-container');
});
