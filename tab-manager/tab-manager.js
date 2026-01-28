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

  const [allWindows, allTabGroups, storage] = await Promise.all([
    chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }),
    chrome.tabGroups.query({}),
    chrome.storage.local.get('collapsedGroups')
  ]);

  if (storage.collapsedGroups) {
    collapsedGroups.clear();
    storage.collapsedGroups.forEach(id => collapsedGroups.add(id));
  }

  const groupMap = new Map(allTabGroups.map(group => [group.id, group]));
  const lowerCaseFilter = filter.toLowerCase();
  
  setupTabManagerHeader();

  const fragment = document.createDocumentFragment();
  
  const allTabs = allWindows.flatMap(win => win.tabs);

  const filteredTabs = allTabs.filter(tab => {
    const displayTitle = tab.title;
    return filter === '' || 
           displayTitle.toLowerCase().includes(lowerCaseFilter) || 
           (tab.url && tab.url.toLowerCase().includes(lowerCaseFilter));
  });

  const pinnedItems = [];
  const groupItems = new Map();
  const unpinnedItems = [];

  for (const tab of filteredTabs) {
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

  if (pinnedItems.length > 0) {
    const pinsGroupEl = document.createElement('div');
    const pinsTitleEl = document.createElement('h3');
    pinsTitleEl.classList.add('section-title');
    pinsTitleEl.textContent = `Pins (${pinnedItems.length} tabs)`;
    pinsGroupEl.appendChild(pinsTitleEl);
    pinnedItems.forEach(item => pinsGroupEl.appendChild(item));
    fragment.appendChild(pinsGroupEl);
  }

  if (groupItems.size > 0) {
    const groupedTabsEl = document.createElement('div');
    const groupedTabsTitleEl = document.createElement('h3');
    groupedTabsTitleEl.classList.add('section-title');
    groupedTabsTitleEl.textContent = 'Grouped Tabs';
    groupedTabsEl.appendChild(groupedTabsTitleEl);

    for (const group of groupItems.values()) {
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
        await chrome.tabGroups.update(group.id, { collapsed: newCollapsedState });
        renderBrowserTabs();
      });

      const ungroupAllBtn = createActionButton('ungroup', false, async () => {
        const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
        const tabIdsToUngroup = tabsInGroup.map(tab => tab.id);
        if (tabIdsToUngroup.length > 0) {
          await chrome.tabs.ungroup(tabIdsToUngroup);
          requestRenderBrowserTabs();
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

  if (unpinnedItems.length > 0) {
    const otherTabsEl = document.createElement('div');
    const otherTabsTitleEl = document.createElement('h3');
    otherTabsTitleEl.classList.add('section-title');
    otherTabsTitleEl.textContent = `Other Tabs (${unpinnedItems.length} tabs)`;
    otherTabsEl.appendChild(otherTabsTitleEl);
    unpinnedItems.forEach(item => otherTabsEl.appendChild(item));
    fragment.appendChild(otherTabsEl);
  }

  const windowGroupsContainer = document.getElementById('window-groups-container');
  windowGroupsContainer.replaceChildren(fragment);

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

  tabItem.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!selectedTabs.has(tab.id)) {
      document.querySelectorAll('.browser-tab-item.is-selected').forEach(item => {
        item.classList.remove('is-selected');
      });
      tabItem.classList.add('is-selected');
      selectedTabs.clear();
      selectedTabs.add(tab.id);
    }
    showContextMenu(e.clientX, e.clientY);
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

function showContextMenu(x, y) {
  closeContextMenu(); // Close any existing menu

  const overlay = document.createElement('div');
  overlay.className = 'context-menu-overlay';
  overlay.addEventListener('click', closeContextMenu);
  document.body.appendChild(overlay);

  const menu = document.createElement('div');
  menu.className = 'context-menu';

  const actions = [
    { label: 'Group', icon: 'folderOpen', action: () => showGroupDialog(Array.from(selectedTabs)) },
    { label: 'Ungroup', icon: 'ungroup', action: async () => {
        const selectedTabIdsArray = Array.from(selectedTabs);
        const tabsInfo = await Promise.all(selectedTabIdsArray.map(tabId => chrome.tabs.get(tabId)));
        const groupedSelectedTabIds = tabsInfo.filter(tab => tab.groupId !== -1).map(tab => tab.id);
        if (groupedSelectedTabIds.length > 0) {
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
    { label: 'Show/Hide Title', icon: 'eye', action: () => {
        for (const tabId of selectedTabs) {
          if (hiddenTabs.has(tabId)) {
            hiddenTabs.delete(tabId);
          } else {
            hiddenTabs.add(tabId);
          }
        }
      }
    },
    { label: 'Close', icon: 'close', isDanger: true, action: async () => {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabsToDelete = Array.from(selectedTabs).filter(tabId => tabId !== activeTab.id);
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
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'context-menu-icon';
    iconSpan.innerHTML = icons[item.icon];
    menuItem.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    menuItem.appendChild(labelSpan);

    menuItem.addEventListener('click', async () => {
      await item.action();
      selectedTabs.clear();
      closeContextMenu();
      requestRenderBrowserTabs();
    });
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
}

function closeContextMenu() {
  const existingMenu = document.querySelector('.context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  const overlay = document.querySelector('.context-menu-overlay');
  if (overlay) {
    overlay.remove();
  }
}
