const folderState = new Map();

async function renderBookmarks() {
  const bookmarksContainer = document.getElementById('bookmarks-container');
  const bookmarks = await chrome.bookmarks.getTree();
  bookmarksContainer.innerHTML = '';
  const fragment = document.createDocumentFragment();
  if (bookmarks[0] && bookmarks[0].children) {
    bookmarks[0].children.forEach(bookmark => renderBookmarkNode(bookmark, fragment, 0, ''));
  }
  bookmarksContainer.appendChild(fragment);
}

function renderBookmarkNode(node, parentElement, depth, path) {
  if (node.children && node.children.length > 0) {
    const currentPath = path ? `${path}/${node.id}` : node.id;
    const folder = document.createElement('div');
    folder.classList.add('bookmark-folder');
    folder.style.paddingLeft = `${depth * 10}px`;

    const folderHeader = document.createElement('div');
    folderHeader.classList.add('bookmark-folder-header');
    
    const icon = document.createElement('span');
    icon.classList.add('folder-icon');
    folderHeader.appendChild(icon);

    const title = document.createElement('span');
    title.textContent = node.title;
    folderHeader.appendChild(title);
    
    const childrenContainer = document.createElement('div');
    childrenContainer.classList.add('bookmark-folder-children');
    
    const isExpanded = folderState.get(currentPath) === true;
    childrenContainer.style.display = isExpanded ? 'block' : 'none';
    icon.innerHTML = isExpanded ? icons.folderOpen : icons.folder;
    
    node.children.forEach(child => renderBookmarkNode(child, childrenContainer, depth + 1, currentPath));
    
    folderHeader.addEventListener('click', () => {
      const wasExpanded = folderState.get(currentPath) === true;
      folderState.set(currentPath, !wasExpanded);
      childrenContainer.style.display = !wasExpanded ? 'block' : 'none';
      icon.innerHTML = !wasExpanded ? icons.folderOpen : icons.folder;
    });

    folder.append(folderHeader, childrenContainer);
    parentElement.appendChild(folder);
  } else if (node.url) {
    const itemContainer = document.createElement('div');
    itemContainer.classList.add('bookmark-item-container');

    const bookmarkItem = document.createElement('a');
    bookmarkItem.classList.add('bookmark-item');
    bookmarkItem.href = node.url;
    bookmarkItem.target = '_blank';
    bookmarkItem.title = `${node.title}\n${node.url}`;
    bookmarkItem.style.paddingLeft = `${depth * 10}px`;
    
    const favicon = document.createElement('img');
    favicon.src = `https://www.google.com/s2/favicons?domain=${new URL(node.url).hostname}`;
    bookmarkItem.appendChild(favicon);
    
    const title = document.createElement('span');
    title.textContent = node.title;
    bookmarkItem.appendChild(title);

    const removeButton = document.createElement('button');
    removeButton.classList.add('remove-bookmark-button');
    removeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-x"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>`;
    removeButton.title = 'Remove bookmark';
    removeButton.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await chrome.bookmarks.remove(node.id);
      await renderBookmarks();
    });
    
    itemContainer.appendChild(bookmarkItem);
    itemContainer.appendChild(removeButton);
    parentElement.appendChild(itemContainer);
  }
}
