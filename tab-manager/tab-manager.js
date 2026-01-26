const hiddenTabs = new Set();
const selectedTabs = new Set();
const collapsedGroups = new Set();

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

  const groupBtn = createActionButton('folderOpen', false, () => {
    const tabIds = Array.from(selectedTabs);
    if (tabIds.length > 0) {
      showGroupDialog(tabIds);
    }
  });
  groupBtn.disabled = selectedTabs.size === 0;

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

  actions.append(mergeBtn, showLinksBtn, groupBtn, pinSelectedBtn, reloadSelectedBtn, closeSelectedBtn);
  tabManagerHeader.append(title, actions);
}

function requestRenderBrowserTabs() {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => renderBrowserTabs(searchTerm), 100);
}

async function renderBrowserTabs(filter = '') {
  if (document.getElementById('tab-manager-container').classList.contains('hidden')) return;

  const [allWindows, allTabGroups, currentWindow, storage] = await Promise.all([
    chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }),
    chrome.tabGroups.query({}),
    chrome.windows.getCurrent(),
    chrome.storage.local.get('collapsedGroups')
  ]);

  if (storage.collapsedGroups) {
    collapsedGroups.clear(); // Clear previous state to avoid stale data
    storage.collapsedGroups.forEach(id => collapsedGroups.add(id));
  }

  const groupMap = new Map(allTabGroups.map(group => [group.id, group]));
  const lowerCaseFilter = filter.toLowerCase();
  
  setupTabManagerHeader();

  const windowGroupsFragment = document.createDocumentFragment();
  const allPinnedItems = [];

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

    const groupItems = new Map();
    const unpinnedItems = [];
    let hasUnpinned = false;

    for (const tab of windowTabs) {
      if (tab.pinned) {
        allPinnedItems.push(createTabItem(tab, tab.title));
      } else {
        hasUnpinned = true;
        const tabItem = createTabItem(tab, tab.title);
        if (tab.groupId !== -1 && groupMap.has(tab.groupId)) {
          if (!groupItems.has(tab.groupId)) {
            groupItems.set(tab.groupId, { ...groupMap.get(tab.groupId), tabs: [] });
          }
          groupItems.get(tab.groupId).tabs.push(tabItem);
        } else {
          unpinnedItems.push(tabItem);
        }
      }
    }

    if (windowTabs.length === 0) continue; // Only continue if there are tabs in the window

    const groupEl = document.createElement('div');
    const titleEl = document.createElement('h3');
    titleEl.classList.add('section-title');
    
    const isCurrentWindow = win.id === currentWindow.id;
    const titleText = isCurrentWindow ? 'Current Window' : `Window ${windowCounter}`;
    const totalUnpinnedTabs = unpinnedItems.length + Array.from(groupItems.values()).reduce((acc, group) => acc + group.tabs.length, 0);
    titleEl.textContent = `${titleText} (${totalUnpinnedTabs} tabs)`;
    
    groupEl.appendChild(titleEl);
    
    for (const group of groupItems.values()) {
        const groupHeader = document.createElement('div');
        groupHeader.className = `tab-group-header color-${group.color}`;
        groupHeader.textContent = group.title;

        const chevron = document.createElement('span');
        chevron.classList.add('chevron');
        const isCollapsed = collapsedGroups.has(group.id);
        chevron.innerHTML = isCollapsed ? icons.plus : icons.minus;
        groupHeader.prepend(chevron);

        groupHeader.addEventListener('click', () => {
          if (collapsedGroups.has(group.id)) {
            collapsedGroups.delete(group.id);
          } else {
            collapsedGroups.add(group.id);
          }
          chrome.storage.local.set({ collapsedGroups: Array.from(collapsedGroups) });
          renderBrowserTabs();
        });

        groupEl.appendChild(groupHeader);
        group.tabs.forEach(tabItem => {
          if (isCollapsed) {
            tabItem.classList.add('is-collapsed-item');
          }
          groupEl.appendChild(tabItem);
        });
    }
    unpinnedItems.forEach(item => groupEl.appendChild(item));

    windowGroupsFragment.appendChild(groupEl);
    
    if (!isCurrentWindow) windowCounter++;
  }

  if (allPinnedItems.length > 0) {
    const pinsGroupEl = document.createElement('div');
    const pinsTitleEl = document.createElement('h3');
    pinsTitleEl.classList.add('section-title');
    pinsTitleEl.textContent = `Pins (${allPinnedItems.length} tabs)`;
    pinsGroupEl.appendChild(pinsTitleEl);
    allPinnedItems.forEach(item => pinsGroupEl.appendChild(item));
    windowGroupsFragment.prepend(pinsGroupEl);
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

  const groupBtn = document.querySelector('.header-actions .action-btn.folderOpen');
  if (groupBtn) groupBtn.disabled = selectedTabs.size === 0;
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

function showGroupDialog(tabIds) {
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

  const colors = ['blue', 'cyan', 'green', 'grey', 'orange', 'pink', 'purple', 'red', 'yellow'];
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
    
    // Always create a new group
    const newGroupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(newGroupId, { title: groupName, color: selectedColor });
    
    selectedTabs.clear();
    dialog.remove();
    requestRenderBrowserTabs();
  });

  dialogContent.appendChild(form);
  dialog.appendChild(dialogContent);
  document.body.appendChild(dialog);
  nameInput.focus();
}
