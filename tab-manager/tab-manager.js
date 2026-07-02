const hiddenTabs = new Set();
const selectedTabs = new Set();
const collapsedGroups = new Set();
let lastClickedTabId = null;

document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.browser-tab-item, .context-menu')) {
    e.preventDefault();
    closeContextMenu();
  }
});

async function mergeAllWindows() {
  const currentWindow = await chrome.windows.getCurrent();
  const allWindows = await chrome.windows.getAll({ populate: true });
  const otherWindows = allWindows.filter(win => win.id !== currentWindow.id);

  for (const win of otherWindows) {
    const groupMap = new Map();
    
    const tabGroups = await chrome.tabGroups.query({ windowId: win.id });
    for (const group of tabGroups) {
      const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
      groupMap.set(group.id, {
        title: group.title,
        color: group.color,
        tabIds: tabsInGroup.map(t => t.id)
      });
    }

    const tabs = await chrome.tabs.query({ windowId: win.id, pinned: false });
    const tabIdsToMove = tabs.map(t => t.id);

    if (tabIdsToMove.length > 0) {
      await chrome.tabs.move(tabIdsToMove, { windowId: currentWindow.id, index: -1 });

      for (const groupInfo of groupMap.values()) {
        const newGroupId = await chrome.tabs.group({ tabIds: groupInfo.tabIds });
        await chrome.tabGroups.update(newGroupId, { title: groupInfo.title, color: groupInfo.color });
      }
    }
  }
}

async function closeDuplicateTabs() {
  // Load user-defined dedupe patterns from storage
  const storage = await chrome.storage.local.get('dedupePatterns');
  const patterns = storage.dedupePatterns || [];

  // Query all tabs across all windows
  const allTabs = await chrome.tabs.query({});

  // Group tabs by their deduplication key
  const urlMap = new Map();
  for (const tab of allTabs) {
    if (!tab.url || tab.url === '' || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;

    // Check if tab URL matches any user-defined pattern
    // If it does, use the pattern as the dedup key (ignoring query params etc.)
    let key = tab.url; // default: exact URL match
    for (const pattern of patterns) {
      if (tab.url.includes(pattern)) {
        key = `__pattern__${pattern}`;
        break;
      }
    }

    if (!urlMap.has(key)) {
      urlMap.set(key, []);
    }
    urlMap.get(key).push(tab);
  }

  const tabsToClose = [];
  for (const [, tabs] of urlMap) {
    if (tabs.length <= 1) continue;

    // Keep the tab with the highest lastAccessed timestamp (most recently accessed)
    // Fallback: if lastAccessed is undefined/equal, keep the one with the highest id (opened later)
    tabs.sort((a, b) => {
      const aTime = a.lastAccessed || 0;
      const bTime = b.lastAccessed || 0;
      if (bTime !== aTime) return bTime - aTime;
      return b.id - a.id;
    });

    // The first element (index 0) is kept; the rest are duplicates to be closed
    const [, ...duplicates] = tabs;
    duplicates.forEach(tab => tabsToClose.push(tab.id));
  }

  if (tabsToClose.length === 0) return;

  await chrome.tabs.remove(tabsToClose);
}

/**
 * Copy the links of every tab that belongs to a single window.
 * Only the tabs living in that window are copied — never all open tabs.
 * @param {number} windowId
 * @param {HTMLButtonElement} [btn] optional button to flash success feedback on
 */
async function copyWindowTabLinks(windowId, btn) {
  const cachedState = await chrome.storage.session.get('tabCache');
  const { windows: allWindows } = cachedState.tabCache || { windows: [] };
  const win = allWindows.find(w => w.id === windowId);
  if (!win || !win.tabs) return;

  const links = win.tabs
    .map(t => t.url)
    .filter(url => url && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://'));

  if (links.length === 0) return;

  try {
    await navigator.clipboard.writeText(links.join('\n'));
    if (btn) {
      btn.innerHTML = icons.check;
      btn.classList.add('active');
      setTimeout(() => {
        btn.innerHTML = icons.copy;
        btn.classList.remove('active');
      }, 1500);
    }
  } catch (err) {
    console.error('Failed to copy tab links:', err);
  }
}

function setupTabManagerHeader() {
  const tabManagerHeader = document.getElementById('tab-manager-header');
  tabManagerHeader.innerHTML = '';
  
  const title = document.createElement('h3');
  title.textContent = 'Tab Manager';
  
  const actions = document.createElement('div');
  actions.classList.add('header-actions');

  const mergeBtn = createActionButton('merge', false, mergeAllWindows);
  const dedupeBtn = createActionButton('dedupe', false, closeDuplicateTabs);

  const showLinksBtn = createActionButton('link', showLinks, async () => {
    showLinks = !showLinks;
    document.querySelectorAll('.tab-url').forEach(el => el.classList.toggle('visible', showLinks));
    document.querySelector('.action-btn.link').classList.toggle('active', showLinks);
  });

  const groupBtn = createActionButton('folderOpen', false, () => {
    const tabIds = Array.from(selectedTabs);
    if (tabIds.length > 0) {
      showGroupDialog(tabIds);
    }
  });
  groupBtn.disabled = selectedTabs.size === 0;

  actions.append(mergeBtn, dedupeBtn, showLinksBtn, groupBtn);
  tabManagerHeader.append(title, actions);
}

function requestRenderBrowserTabs() {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => renderBrowserTabs(searchTerm).catch(console.error), 50);
}

async function renderBrowserTabs(filter = '') {
  const container = document.getElementById('window-groups-container');
  
  // Only show loader on the very first load.
  if (!container.hasChildNodes()) {
    container.innerHTML = '<div class="loader">Loading...</div>';
  }

  if (document.getElementById('tab-manager-container').classList.contains('hidden')) return;

  const cachedState = await chrome.storage.session.get('tabCache');
  const { windows: allWindows, tabGroups: allTabGroups } = cachedState.tabCache || { windows: [], tabGroups: [] };

  const storage = await chrome.storage.local.get(['collapsedGroups']);

  if (storage.collapsedGroups) {
    collapsedGroups.clear();
    storage.collapsedGroups.forEach(id => collapsedGroups.add(id));
  }

  const groupMap = new Map(allTabGroups.map(group => [group.id, group]));
  const lowerCaseFilter = filter.toLowerCase();
  
  setupTabManagerHeader();

  const allTabs = allWindows.reduce((acc, win) => acc.concat(win.tabs || []), []);

  const filteredTabs = allTabs.filter(tab => {
    const displayTitle = tab.title;
    return filter === '' || 
           displayTitle.toLowerCase().includes(lowerCaseFilter) || 
           (tab.url && tab.url.toLowerCase().includes(lowerCaseFilter));
  });

  // --- Build new content in a fragment to prevent flicker ---
  const fragment = document.createDocumentFragment();
  const pinnedItems = [];
  const groupData = new Map();
  const windowOtherItems = new Map(); // windowId -> [tab item elements]

  for (const tab of filteredTabs) {
      if (tab.pinned) {
          pinnedItems.push(createTabItem(tab, tab.title));
      } else if (tab.groupId !== -1 && groupMap.has(tab.groupId)) {
          if (!groupData.has(tab.groupId)) {
            groupData.set(tab.groupId, { ...groupMap.get(tab.groupId), tabs: [] });
          }
          groupData.get(tab.groupId).tabs.push(createTabItem(tab, tab.title));
      } else {
          if (!windowOtherItems.has(tab.windowId)) windowOtherItems.set(tab.windowId, []);
          windowOtherItems.get(tab.windowId).push(createTabItem(tab, tab.title));
      }
  }

  if (pinnedItems.length > 0) {
    const pinsGroupEl = document.createElement('div');
    const pinsTitleEl = document.createElement('h3');
    pinsTitleEl.classList.add('section-title');
    pinsTitleEl.textContent = `Pins (${pinnedItems.length} tabs)`;
    pinsGroupEl.appendChild(pinsTitleEl);
    pinnedItems.forEach(item => pinsGroupEl.appendChild(item));
    fragment.appendChild(pinsGroupEl);
  }

  if (groupData.size > 0) {
    const groupedTabsEl = document.createElement('div');
    const groupedTabsTitleEl = document.createElement('h3');
    groupedTabsTitleEl.classList.add('section-title');
    groupedTabsTitleEl.textContent = 'Grouped Tabs';
    groupedTabsEl.appendChild(groupedTabsTitleEl);

    for (const group of groupData.values()) {
      const groupHeader = document.createElement('div');
      groupHeader.className = `tab-group-header color-${group.color}`;
      
      const leftContent = document.createElement('div');
      leftContent.style.display = 'flex';
      leftContent.style.alignItems = 'center';

      const chevron = document.createElement('span');
      chevron.classList.add('chevron');
      const isCollapsed = collapsedGroups.has(group.id);
      chevron.innerHTML = isCollapsed ? icons.plus : icons.minus;
      leftContent.appendChild(chevron);

      const groupTitle = document.createElement('span');
      groupTitle.textContent = group.title;
      leftContent.appendChild(groupTitle);
      
      groupHeader.appendChild(leftContent);

      groupHeader.addEventListener('click', async (e) => {
        if (e.target.closest('.action-btn')) return;
        const newCollapsedState = !collapsedGroups.has(group.id);
        if (newCollapsedState) {
          collapsedGroups.add(group.id);
        } else {
          collapsedGroups.delete(group.id);
        }
        await chrome.storage.local.set({ collapsedGroups: Array.from(collapsedGroups) });
        requestRenderBrowserTabs();
      });

      const ungroupAllBtn = createActionButton('ungroup', false, async () => {
        const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
        const tabIdsToUngroup = tabsInGroup.map(tab => tab.id);
        if (tabIdsToUngroup.length > 0) {
          await chrome.tabs.ungroup(tabIdsToUngroup);
        }
      });
      groupHeader.appendChild(ungroupAllBtn);

      groupedTabsEl.appendChild(groupHeader);
      group.tabs.forEach(tabItem => {
        if (isCollapsed) {
          tabItem.classList.add('is-collapsed-item');
        }
        groupedTabsEl.appendChild(tabItem);
      });
    }
    fragment.appendChild(groupedTabsEl);
  }

  // Split ungrouped/unpinned tabs by their window: "Window 1", "Window 2", ...
  let windowCounter = 0;
  for (const win of allWindows) {
    const items = windowOtherItems.get(win.id);
    if (!items || items.length === 0) continue;
    windowCounter++;

    const windowEl = document.createElement('div');

    const headerEl = document.createElement('div');
    headerEl.classList.add('window-section-header');

    const titleEl = document.createElement('h3');
    titleEl.classList.add('section-title');
    titleEl.textContent = `Window ${windowCounter} (${items.length} tabs)`;
    headerEl.appendChild(titleEl);

    // Copy links of every tab that lives in THIS window only (not all open tabs).
    const copyBtn = createActionButton('copy', false, () => copyWindowTabLinks(win.id, copyBtn));
    headerEl.appendChild(copyBtn);

    windowEl.appendChild(headerEl);
    items.forEach(item => windowEl.appendChild(item));
    fragment.appendChild(windowEl);
  }

  // --- Atomic DOM Update ---
  container.replaceChildren(fragment);

  document.querySelector('.action-btn.link').classList.toggle('active', showLinks);
  
  const groupBtn = document.querySelector('.header-actions .action-btn.folderOpen');
  if (groupBtn) groupBtn.disabled = selectedTabs.size === 0;
}


/**
 * @param {chrome.tabs.Tab} tab
 * @param {string} displayTitle
 * @returns {HTMLDivElement}
 */
function createTabItem(tab, displayTitle) {
  const tabItem = document.createElement('div');
  tabItem.classList.add('browser-tab-item');
  tabItem.dataset.tabId = tab.id;
  tabItem.dataset.windowId = tab.windowId;

  if (tab.active) tabItem.classList.add('is-active');
  if (selectedTabs.has(tab.id)) tabItem.classList.add('is-selected');
  
  tabItem.addEventListener('click', async (e) => {
    e.stopPropagation();
    const currentTabId = parseInt(tabItem.dataset.tabId);

    if (e.shiftKey && lastClickedTabId !== null) {
      const allTabElements = [...document.querySelectorAll('.browser-tab-item')];
      const lastClickedIndex = allTabElements.findIndex(el => parseInt(el.dataset.tabId) === lastClickedTabId);
      const currentIndex = allTabElements.findIndex(el => parseInt(el.dataset.tabId) === currentTabId);
      
      const [start, end] = [lastClickedIndex, currentIndex].sort((a, b) => a - b);
      
      for (let i = start; i <= end; i++) {
        const tabId = parseInt(allTabElements[i].dataset.tabId);
        selectedTabs.add(tabId);
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (selectedTabs.has(currentTabId)) {
        selectedTabs.delete(currentTabId);
      } else {
        selectedTabs.add(currentTabId);
      }
    } else {
      if (e.target.closest('.action-btn')) return;
      selectedTabs.clear();
      selectedTabs.add(currentTabId);
      await chrome.tabs.update(currentTabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    
    lastClickedTabId = currentTabId;
    requestRenderBrowserTabs();
  });

  tabItem.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedTabs.has(tab.id)) {
      document.querySelectorAll('.browser-tab-item.is-selected').forEach(item => {
        item.classList.remove('is-selected');
      });
      tabItem.classList.add('is-selected');
      selectedTabs.clear();
      selectedTabs.add(tab.id);
    }
    await showContextMenu(e.clientX, e.clientY);
  });
  
  const mainPart = document.createElement('div');
  mainPart.classList.add('browser-tab-item-main');
  
  const clickablePart = document.createElement('div');
  clickablePart.classList.add('browser-tab-item-main-clickable');
  clickablePart.title = displayTitle;

  if (tab.groupId !== -1) {
    const groupIcon = document.createElement('div');
    groupIcon.classList.add('group-icon');
    groupIcon.innerHTML = icons.commit;
    clickablePart.appendChild(groupIcon);
  }
  
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

  const closeBtn = createActionButton('close', false, async () => {
    await chrome.tabs.remove(tab.id);
    selectedTabs.delete(tab.id);
  });

  actions.append(closeBtn);

  mainPart.append(clickablePart, actions);

  const urlPart = document.createElement('div');
  urlPart.classList.add('tab-url');
  if (showLinks) urlPart.classList.add('visible');
  urlPart.textContent = tab.url;

  tabItem.append(mainPart, urlPart);
  return tabItem;
}

async function showGroupDialog(tabIds) {
  const dialog = document.createElement('div');
  dialog.className = 'dialog-overlay';

  const dialogContent = document.createElement('div');
  dialogContent.className = 'dialog-content';

  const title = document.createElement('h3');
  title.textContent = 'Create Tab Group';
  dialogContent.appendChild(title);

  const form = document.createElement('form');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Group Name';
  form.appendChild(nameInput);

  const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
  const colorContainer = document.createElement('div');
  colorContainer.className = 'color-options';
  
  colors.forEach(color => {
    const colorOption = document.createElement('div');
    colorOption.className = `color-option color-${color}`;
    colorOption.dataset.color = color;
    if (color === 'blue') colorOption.classList.add('selected'); // Default to blue
    colorOption.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
      colorOption.classList.add('selected');
    });
    colorContainer.appendChild(colorOption);
  });
  form.appendChild(colorContainer);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'dialog-buttons';

  const createBtn = document.createElement('button');
  createBtn.type = 'submit';
  createBtn.textContent = 'Create';
  buttonContainer.appendChild(createBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => dialog.remove());
  buttonContainer.appendChild(cancelBtn);
  
  form.appendChild(buttonContainer);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const groupName = nameInput.value.trim();
    const selectedColor = document.querySelector('.color-option.selected').dataset.color;
    
    const firstTab = await chrome.tabs.get(tabIds[0]);
    const windowId = firstTab.windowId;

    const newGroupId = await chrome.tabs.group({
      tabIds: tabIds,
      createProperties: { windowId: windowId }
    });
    const updateProperties = { title: groupName, color: selectedColor };
    await chrome.tabGroups.update(newGroupId, /** @type {chrome.tabGroups.UpdateProperties} */ (updateProperties));
    
    selectedTabs.clear();
    dialog.remove();
  });

  dialogContent.appendChild(form);
  dialog.appendChild(dialogContent);
  document.body.appendChild(dialog);
  nameInput.focus();
}

async function showContextMenu(x, y) {
  closeContextMenu(); // Close any existing menu

  const menu = document.createElement('div');
  menu.className = 'context-menu';

  const selectedTabIdsArray = Array.from(selectedTabs);
  const tabsInfo = await Promise.all(selectedTabIdsArray.map(tabId => chrome.tabs.get(tabId)));
  const hasGroupedTabs = tabsInfo.some(tab => tab.groupId !== -1);

  const actions = [
    { label: 'Group', icon: 'folderOpen', action: async () => showGroupDialog(Array.from(selectedTabs)) },
    { label: 'Ungroup', icon: 'ungroup', disabled: !hasGroupedTabs, action: async () => {
        if (hasGroupedTabs) {
          const groupedSelectedTabIds = tabsInfo.filter(tab => tab.groupId !== -1).map(tab => tab.id);
          await chrome.tabs.ungroup(groupedSelectedTabIds);
        }
      }
    },
    { label: 'Pin/Unpin', icon: 'pin', action: async () => {
        for (const tabId of selectedTabs) {
          const tab = await chrome.tabs.get(tabId);
          await chrome.tabs.update(tabId, { pinned: !tab.pinned });
        }
      }
    },
    { label: 'Reload', icon: 'reload', action: async () => {
        for (const tabId of selectedTabs) {
          await chrome.tabs.reload(tabId);
        }
      }
    },
    { label: 'Show/Hide Title', icon: 'eye', action: async () => {
        for (const tabId of selectedTabs) {
          if (hiddenTabs.has(tabId)) {
            hiddenTabs.delete(tabId);
          } else {
            hiddenTabs.add(tabId);
          }
        }
        requestRenderBrowserTabs();
      }
    },
    { label: 'Close', icon: 'close', isDanger: true, action: async () => {
        const tabsToDelete = Array.from(selectedTabs);
        if (tabsToDelete.length > 0) {
          await chrome.tabs.remove(tabsToDelete);
        }
      }
    }
  ];

  actions.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    if (item.isDanger) {
      menuItem.classList.add('danger');
    }
    if (item.disabled) {
      menuItem.classList.add('disabled');
    }
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'context-menu-icon';
    iconSpan.innerHTML = icons[item.icon];
    menuItem.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    menuItem.appendChild(labelSpan);

    if (!item.disabled) {
      menuItem.addEventListener('click', async () => {
        await item.action();
        selectedTabs.clear();
        closeContextMenu();
      });
    }
    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);

  const menuHeight = menu.offsetHeight;
  const menuWidth = menu.offsetWidth;
  const { innerWidth, innerHeight } = window;

  let top = y;
  if (y + menuHeight > innerHeight) {
    top = y - menuHeight;
  }

  let left = x;
  if (x + menuWidth > innerWidth) {
    left = x - menuWidth;
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  setTimeout(() => {
    document.addEventListener('click', clickOutsideHandler, { once: true });
  }, 0);
}

function clickOutsideHandler(event) {
  const menu = document.querySelector('.context-menu');
  if (menu && !menu.contains(event.target)) {
    closeContextMenu();
  }
}

function closeContextMenu() {
  const existingMenu = document.querySelector('.context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  document.removeEventListener('click', clickOutsideHandler);
}
