async function renderBookmarks() {
  const bookmarksContainer = document.getElementById('bookmarks-container');
  const bookmarks = await chrome.bookmarks.getTree();
  bookmarksContainer.innerHTML = '';
  const fragment = document.createDocumentFragment();
  bookmarks[0].children.forEach(bookmark => renderBookmarkNode(bookmark, fragment, 0));
  bookmarksContainer.appendChild(fragment);
}

function renderBookmarkNode(node, parentElement, depth) {
  if (node.children && node.children.length > 0) {
    const folder = document.createElement('div');
    folder.classList.add('bookmark-folder');
    folder.style.paddingLeft = `${depth * 10}px`;

    const folderHeader = document.createElement('div');
    folderHeader.classList.add('bookmark-folder-header');
    
    const icon = document.createElement('span');
    icon.classList.add('folder-icon');
    icon.innerHTML = icons.folder;
    folderHeader.appendChild(icon);

    const title = document.createElement('span');
    title.textContent = node.title;
    folderHeader.appendChild(title);
    
    const childrenContainer = document.createElement('div');
    childrenContainer.classList.add('bookmark-folder-children');
    childrenContainer.style.display = 'none';
    
    node.children.forEach(child => renderBookmarkNode(child, childrenContainer, depth + 1));
    
    folderHeader.addEventListener('click', () => {
      const isExpanded = childrenContainer.style.display === 'block';
      childrenContainer.style.display = isExpanded ? 'none' : 'block';
      icon.innerHTML = isExpanded ? icons.folder : icons.folderOpen;
    });

    folder.append(folderHeader, childrenContainer);
    parentElement.appendChild(folder);
  } else if (node.url) {
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
    
    parentElement.appendChild(bookmarkItem);
  }
}
