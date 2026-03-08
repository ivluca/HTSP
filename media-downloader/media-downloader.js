let allDetectedMedia = [];
let activeDownloads = [];
let isDownloading = false;
let isPaused = false;
let pendingBulkBoxes = null;

function generateTimestampFolder() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `MediaDownloader_${year}${month}${day}_${hours}${minutes}${seconds}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refresh-media-btn');
  const filterSelect = document.getElementById('media-type-filter');
  const selectAllCb = document.getElementById('select-all-media');
  const bulkDownloadBtn = document.getElementById('download-selected-btn');
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchAndRenderMedia();
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      renderMediaItems(allDetectedMedia);
    });
  }

  if (selectAllCb) {
    selectAllCb.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const visibleCheckboxes = document.querySelectorAll('.media-list-checkbox');
      visibleCheckboxes.forEach(cb => {
        cb.checked = isChecked;
      });
    });
  }

  if (bulkDownloadBtn) {
    bulkDownloadBtn.addEventListener('click', async () => {
      // If currently paused, resume
      if (isPaused) {
        activeDownloads.forEach(id => chrome.downloads.resume(id));
        isPaused = false;
        bulkDownloadBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /><path d="M14 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /></svg>
          Pause
        `;
        return;
      }
      
      // If currently downloading, pause
      if (isDownloading) {
        activeDownloads.forEach(id => chrome.downloads.pause(id));
        isPaused = true;
        bulkDownloadBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 4v16l13 -8z" /></svg>
          Resume
        `;
        return;
      }

      // Start new bulk download
      const checkedBoxes = document.querySelectorAll('.media-list-checkbox:checked');
      if (checkedBoxes.length === 0) {
        alert("Please select at least one item to download.");
        return;
      }

      showConfirmationModal(checkedBoxes);
    });

    const cancelBtn = document.getElementById('cancel-downloads-btn');
    if (cancelBtn) {
       cancelBtn.addEventListener('click', () => {
          activeDownloads.forEach(id => chrome.downloads.cancel(id));
          resetDownloadState();
       });
    }

    const modal = document.getElementById('confirm-modal');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalOkBtn = document.getElementById('modal-ok-btn');

    if (modalCancelBtn) {
      modalCancelBtn.addEventListener('click', () => {
        if (modal) modal.classList.add('hidden');
        pendingBulkBoxes = null;
      });
    }

    if (modalOkBtn) {
      modalOkBtn.addEventListener('click', () => {
        if (modal) modal.classList.add('hidden');
        if (pendingBulkBoxes) {
          startBulkDownload(pendingBulkBoxes);
        }
      });
    }
  }

  // Hook into the tab switcher safely
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Check if the side panel tab classes changed
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const container = document.getElementById('media-downloader-container');
        if (container && !container.classList.contains('hidden')) {
          // Tab became visible
          if (allDetectedMedia.length === 0) {
             fetchAndRenderMedia();
          }
        }
      }
    });
  });

  const mediaContainer = document.getElementById('media-downloader-container');
  if (mediaContainer) {
    observer.observe(mediaContainer, { attributes: true });
    // Initial fetch if already visible on load
    if (!mediaContainer.classList.contains('hidden')) {
      fetchAndRenderMedia();
    }
  }
});

async function fetchAndRenderMedia() {
  const listContainer = document.getElementById('media-list-container');
  if (!listContainer) return;
  
  listContainer.innerHTML = '<div class="media-loader">Scanning page for media...</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showNoMediaMessage("No active tab found.");
      return;
    }
    
    // Don't try to inject script into chrome:// or other restricted URLs
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      showNoMediaMessage("Cannot extract media from browser system pages.");
      return;
    }

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractMediaLinks
    });

    const mediaItems = injectionResults[0].result;
    
    if (!mediaItems || mediaItems.length === 0) {
      allDetectedMedia = [];
      showNoMediaMessage("No images or videos found on this page.");
      return;
    }

    allDetectedMedia = mediaItems;
    renderMediaItems(allDetectedMedia);
    
  } catch (error) {
    console.error("Error fetching media:", error);
    showNoMediaMessage("Failed to extract media. " + error.message);
  }
}

// This function runs in the context of the active web page
function extractMediaLinks() {
  const mediaMap = new Map(); // using map to prevent duplicates
  
  // Extract Images
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    // try to get highest quality source
    let src = img.src || img.dataset.src || img.currentSrc;
    if (src && src.startsWith('http')) {
      mediaMap.set(src, {
        url: src,
        type: 'image',
        alt: img.alt || 'Image'
      });
    }
  });

  // Extract Videos
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    let src = video.src || video.currentSrc;
    if (!src) {
      const source = video.querySelector('source');
      if (source) src = source.src;
    }
    if (src && src.startsWith('http')) {
      mediaMap.set(src, {
        url: src,
        type: 'video',
        alt: 'Video'
      });
    }
  });
  
  // Extract Background Images (optional, basic approach)
  const elementsWithBg = document.querySelectorAll('*');
  elementsWithBg.forEach(el => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
      const m = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
      if (m && m[1] && m[1].startsWith('http')) {
         mediaMap.set(m[1], {
           url: m[1],
           type: 'image',
           alt: 'Background Image'
         });
      }
    }
  });

  return Array.from(mediaMap.values());
}

function showNoMediaMessage(message) {
  const listContainer = document.getElementById('media-list-container');
  listContainer.innerHTML = `
    <div class="no-media-message">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M15 8h.01" />
        <path d="M12 20h-5a3 3 0 0 1 -3 -3v-10a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v5" />
        <path d="M4 15l4 -4c.928 -.893 2.072 -.893 3 0l4 4" />
        <path d="M14 14l1 -1c.617 -.593 1.328 -.793 2.009 -.598" />
        <path d="M19 16v6" />
        <path d="M22 19l-3 3l-3 -3" />
      </svg>
      <span>${message}</span>
    </div>
  `;
}

function renderMediaItems(items) {
  const listContainer = document.getElementById('media-list-container');
  const filterSelect = document.getElementById('media-type-filter');
  const selectAllCb = document.getElementById('select-all-media');
  
  listContainer.innerHTML = '';
  
  // reset select all checkbox
  if (selectAllCb) selectAllCb.checked = false;

  const currentFilter = filterSelect ? filterSelect.value : 'video';
  
  const filteredItems = items.filter(item => {
    if (currentFilter === 'all') return true;
    return item.type === currentFilter;
  });

  if (filteredItems.length === 0) {
    showNoMediaMessage(`No media matches filter "${currentFilter}".`);
    return;
  }
  
  filteredItems.forEach(item => {
    const filename = getFilename(item.url);
    
    const itemEl = document.createElement('div');
    itemEl.className = 'media-item';
    
    itemEl.innerHTML = `
      <div class="media-info list-view">
        <div class="media-meta">
          <input type="checkbox" class="media-list-checkbox media-checkbox" data-url="${item.url}" data-filename="${filename}" />
          <span class="media-type">${item.type}</span>
          <div class="media-filename" title="${filename}">${filename}</div>
        </div>
        <button class="download-btn single-dl-btn" data-url="${item.url}" data-filename="${filename}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
            <path d="M7 11l5 5l5 -5" />
            <path d="M12 4l0 12" />
          </svg>
          Download
        </button>
      </div>
    `;
    
    listContainer.appendChild(itemEl);
  });
  
  // Attach single download event listeners
  const downloadBtns = listContainer.querySelectorAll('.single-dl-btn');
  downloadBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = btn.getAttribute('data-url');
      // For cross-origin downloading, passing the URL to chrome.downloads is the safest way
      // although we can also try to fetch and blob it if the server forbids direct download.
      // But chrome API usually handles it smoothly.
      let filename = btn.getAttribute('data-filename');
      // If filename is empty or not properly parsed, fallback to generic
      if (!filename || filename === '') {
        filename = item.type === 'video' ? 'video.mp4' : 'image.jpeg';
      }
      downloadMedia(url, filename);
    });
  });
}

function getFilename(url) {
  try {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;
    let filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    // Remove query params or hashes manually if URL object failed to parse out purely
    filename = filename.split('?')[0].split('#')[0];
    if (!filename) {
      return `media_${Date.now()}`;
    }
    return filename;
  } catch (e) {
    return `media_${Date.now()}`;
  }
}

function resetDownloadState() {
  isDownloading = false;
  isPaused = false;
  activeDownloads = [];
  
  const bulkBtn = document.getElementById('download-selected-btn');
  if (bulkBtn) {
    bulkBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>
      Selected
    `;
  }
  const cancelBtn = document.getElementById('cancel-downloads-btn');
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

function downloadMedia(url, filename) {
  chrome.downloads.download({
    url: url,
    filename: filename, // Suggested filename
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error("Download failed:", chrome.runtime.lastError);
      
      // Attempt fallback: Open in new tab if we can't download via API directly
      if (chrome.runtime.lastError.message.includes("network") || chrome.runtime.lastError.message.includes("forbidden")) {
        window.open(url, '_blank');
      } else {
        alert("Download failed: " + chrome.runtime.lastError.message);
      }
    }
  });
}

async function showConfirmationModal(checkedBoxes) {
  pendingBulkBoxes = checkedBoxes;
  const modal = document.getElementById('confirm-modal');
  const modalText = document.getElementById('confirm-modal-text');
  const modalOkBtn = document.getElementById('modal-ok-btn');

  if (!modal || !modalText || !modalOkBtn) return;
  
  modal.classList.remove('hidden');
  modalText.innerText = `Calculating size for ${checkedBoxes.length} files...`;
  modalOkBtn.disabled = true;
  modalOkBtn.classList.add('disabled');

  let totalBytes = 0;
  let unknownCount = 0;

  const promises = Array.from(checkedBoxes).map(async (cb) => {
    const url = cb.getAttribute('data-url');
    try {
      // Use HEAD request to retrieve file size
      const config = { method: 'HEAD' };
      // Adding mode: no-cors will make the request opaque (length is 0). 
      // We'll just try normal mode, and if it fails due to CORS, catch the error.
      const res = await fetch(url, config);
      if (res.ok) {
        const len = res.headers.get('content-length');
        if (len) {
          totalBytes += parseInt(len, 10);
        } else {
          unknownCount++;
        }
      } else {
        unknownCount++;
      }
    } catch (e) {
      // CORS or network error
      unknownCount++;
    }
  });

  await Promise.allSettled(promises);

  let sizeStr = "";
  if (totalBytes > 0) {
    const mb = (totalBytes / (1024 * 1024)).toFixed(2);
    sizeStr = `approx. ${mb} MB`;
  } else {
    sizeStr = "unknown size";
  }

  if (unknownCount > 0 && totalBytes > 0) {
    sizeStr += ` (plus ${unknownCount} unknown sizes)`;
  } else if (unknownCount > 0 && totalBytes === 0) {
    sizeStr = `unknown total size`;
  }

  modalText.innerText = `Are you sure you want to download ${checkedBoxes.length} files (${sizeStr})?`;
  modalOkBtn.disabled = false;
  modalOkBtn.classList.remove('disabled');
}

async function startBulkDownload(checkedBoxes) {
  isDownloading = true;
  activeDownloads = [];
  
  const bulkDownloadBtn = document.getElementById('download-selected-btn');
  const cancelBtn = document.getElementById('cancel-downloads-btn');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  if (bulkDownloadBtn) {
    bulkDownloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /><path d="M14 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /></svg>
      Pause
    `;
  }

  const folderName = generateTimestampFolder();
  let completedCount = 0;
  
  for (let i = 0; i < checkedBoxes.length; i++) {
    const cb = checkedBoxes[i];
    const url = cb.getAttribute('data-url');
    const filename = cb.getAttribute('data-filename');
    const fullPath = `${folderName}/${filename}`;
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!isDownloading && !isPaused) break;
    
    chrome.downloads.download({
      url: url,
      filename: fullPath,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
         console.error("Bulk download failed for", url, chrome.runtime.lastError);
      } else {
         activeDownloads.push(downloadId);
      }
      
      completedCount++;
      if (completedCount === checkedBoxes.length) {
        resetDownloadState();
      }
    });
  }
}
