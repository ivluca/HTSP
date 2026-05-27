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
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
      showNoMediaMessage("Cannot extract media from browser system pages.");
      return;
    }

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractMediaLinks
    }).catch(err => {
      console.warn("Script injection blocked or failed:", err);
      return null;
    });

    if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
      allDetectedMedia = [];
      showNoMediaMessage("Cannot extract media from this page. Content Script execution might be blocked.");
      return;
    }

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
// Single-pass DOM traversal to preserve visual order
function extractMediaLinks() {
  const mediaMap = new Map(); // Map preserves insertion order & deduplicates

  // Helper: pick highest-resolution URL from srcset attribute
  function getBestSrc(srcset) {
    if (!srcset) return null;
    let best = null, bestW = 0;
    srcset.split(',').forEach(part => {
      const tokens = part.trim().split(/\s+/);
      const url = tokens[0];
      const w = tokens[1] ? parseFloat(tokens[1]) : 1;
      if (url && w >= bestW) { bestW = w; best = url; }
    });
    return best;
  }

  document.querySelectorAll('*').forEach(el => {
    // --- <img> elements: prefer srcset highest-res over currentSrc ---
    if (el.tagName === 'IMG') {
      const src = getBestSrc(el.srcset || el.dataset.srcset)
        || el.dataset.src
        || el.src;
      if (src && src.startsWith('http')) {
        if (!mediaMap.has(src)) {
          mediaMap.set(src, { url: src, type: 'image', alt: el.alt || '' });
        }
      }
      return;
    }

    // --- <video> elements ---
    if (el.tagName === 'VIDEO') {
      let src = el.currentSrc || el.src;
      if (!src) {
        const source = el.querySelector('source');
        if (source) src = source.src;
      }
      if (src && src.startsWith('http')) {
        if (!mediaMap.has(src)) {
          mediaMap.set(src, { url: src, type: 'video', alt: 'Video' });
        }
      }
      return;
    }

    // --- CSS background-image ---
    const bg = window.getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none' && bg.includes('url(')) {
      const m = bg.match(/url\(['"]?(.*?)['"]?\)/);
      if (m && m[1] && m[1].startsWith('http')) {
        if (!mediaMap.has(m[1])) {
          mediaMap.set(m[1], { url: m[1], type: 'image', alt: 'Background Image' });
        }
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

  if (selectAllCb) selectAllCb.checked = false;

  const currentFilter = filterSelect ? filterSelect.value : 'all';

  const filteredItems = items.filter(item => {
    if (currentFilter === 'all') return true;
    return item.type === currentFilter;
  });

  if (filteredItems.length === 0) {
    showNoMediaMessage(`No media matches filter "${currentFilter}".`);
    return;
  }

  filteredItems.forEach(item => {
    const filename = getFilename(item.url, item.alt);

    const itemEl = document.createElement('div');
    itemEl.className = 'media-item';

    // --- Single info row (no big thumbnail banner) ---
    const infoRow = document.createElement('div');
    infoRow.className = 'media-info list-view';

    const metaDiv = document.createElement('div');
    metaDiv.className = 'media-meta';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'media-list-checkbox media-checkbox';
    checkbox.dataset.url = item.url;
    checkbox.dataset.filename = filename;

    const filenameEl = document.createElement('div');
    filenameEl.className = 'media-filename';
    filenameEl.title = filename;
    filenameEl.textContent = filename;

    // Small preview: thumbnail for images, icon for videos
    let previewEl;
    if (item.type === 'image') {
      previewEl = document.createElement('img');
      previewEl.className = 'media-inline-thumb';
      previewEl.src = item.url;
      previewEl.alt = '';
      previewEl.loading = 'lazy';
      previewEl.title = 'Click to preview';
      previewEl.addEventListener('error', () => {
        // fallback to broken icon on load error
        const span = document.createElement('span');
        span.className = 'media-type-icon';
        span.title = 'image';
        span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="15" y1="8" x2="15.01" y2="8" /><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 15l4 -4a3 5 0 0 1 3 0l5 5" /><path d="M14 14l1 -1a3 5 0 0 1 3 0l2 2" /></svg>`;
        previewEl.replaceWith(span);
      });
      previewEl.addEventListener('click', (e) => {
        e.stopPropagation();
        openImagePreview(item.url, filename);
      });
    } else {
      previewEl = document.createElement('span');
      previewEl.className = 'media-type-icon';
      previewEl.title = 'video';
      previewEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4z" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>`;
    }

    // Order: [checkbox] [thumb/icon] [filename]
    metaDiv.append(checkbox, previewEl, filenameEl);

    // Sync select-all checkbox state when individual item is toggled
    checkbox.addEventListener('change', () => {
      const selectAllCb = document.getElementById('select-all-media');
      if (!selectAllCb) return;
      const all = [...document.querySelectorAll('.media-list-checkbox')];
      const checkedCount = all.filter(c => c.checked).length;
      if (checkedCount === 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      } else if (checkedCount === all.length) {
        selectAllCb.checked = true;
        selectAllCb.indeterminate = false;
      } else {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = true;
      }
    });

    const dlBtn = document.createElement('button');
    dlBtn.className = 'download-btn single-dl-btn';
    dlBtn.dataset.url = item.url;
    dlBtn.dataset.filename = filename;
    dlBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg> Download`;
    dlBtn.addEventListener('click', () => {
      let fn = dlBtn.dataset.filename;
      if (!fn) fn = item.type === 'video' ? 'video.mp4' : 'image.jpeg';
      downloadMedia(dlBtn.dataset.url, fn);
    });

    infoRow.append(metaDiv, dlBtn);
    itemEl.append(infoRow);
    listContainer.appendChild(itemEl);
  });
}

function getFilename(url, alt = '') {
  try {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;
    let filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    filename = filename.split('?')[0].split('#')[0];

    // Get extension from URL (most reliable source)
    const extMatch = filename.match(/\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';

    // Detect CDN hash filenames (hex hash with no meaningful words)
    const isHash = /^[a-f0-9]{16,}\.(jpe?g|png|webp|gif|avif)$/i.test(filename);

    if (!filename || isHash) {
      if (alt && alt.trim()) {
        // Strip common AI-generated alt text prefixes
        const aiPrefixes = [
          /^this contains an image of[_:\s-]*/i,
          /^this image contains[_:\s-]*/i,
          /^may be an image of[_:\s-]*/i,
          /^image may contain[_:\s-]*/i,
          /^a photo of[_:\s-]*/i,
          /^a picture of[_:\s-]*/i,
          /^photo of[_:\s-]*/i,
          /^picture of[_:\s-]*/i,
          /^an image of[_:\s-]*/i,
          /^image of[_:\s-]*/i,
        ];
        let cleanAlt = alt.trim();
        for (const prefix of aiPrefixes) {
          cleanAlt = cleanAlt.replace(prefix, '');
        }
        cleanAlt = cleanAlt.trim();

        if (cleanAlt) {
          const safeName = cleanAlt
            .replace(/[/\\:*?"<>|]/g, '_')
            .substring(0, 80)
            .trim();
          return `${safeName}.${ext}`;
        }
      }
      return filename || `media_${Date.now()}.${ext}`;
    }

    return filename;
  } catch (e) {
    return `media_${Date.now()}.jpg`;
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

// ── Image Lightbox ──────────────────────────────────────────────

function openImagePreview(src, filename) {
  // Remove any existing lightbox first
  closeLightbox();

  const overlay = document.createElement('div');
  overlay.id = 'img-lightbox';
  overlay.className = 'lightbox-overlay';

  overlay.innerHTML = `
    <div class="lightbox-box" id="lightbox-box">
      <div class="lightbox-toolbar">
        <span class="lightbox-filename">${filename}</span>
        <div class="lightbox-actions">
          <a href="${src}" download="${filename}" class="lightbox-dl-btn" title="Download">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>
          </a>
          <button class="lightbox-close-btn" id="lightbox-close" title="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div class="lightbox-img-wrapper">
        <img src="${src}" alt="${filename}" class="lightbox-img" />
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('lightbox-visible'));

  // Close on backdrop click (not on the box itself)
  overlay.addEventListener('click', (e) => {
    if (!e.target.closest('#lightbox-box')) closeLightbox();
  });

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);

  // Close on Escape
  document._lightboxKeyHandler = (e) => { if (e.key === 'Escape') closeLightbox(); };
  document.addEventListener('keydown', document._lightboxKeyHandler);
}

function closeLightbox() {
  const overlay = document.getElementById('img-lightbox');
  if (!overlay) return;
  overlay.classList.remove('lightbox-visible');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  if (document._lightboxKeyHandler) {
    document.removeEventListener('keydown', document._lightboxKeyHandler);
    delete document._lightboxKeyHandler;
  }
}
