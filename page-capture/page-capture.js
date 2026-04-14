document.addEventListener('DOMContentLoaded', () => {
    const captureBtn = document.getElementById('capture-btn');
    const loadingState = document.getElementById('capture-loading');
    const previewContainer = document.getElementById('capture-preview-container');
    const previewImg = document.getElementById('capture-preview-img');
    const downloadBtn = document.getElementById('download-capture-btn');
    let capturedDataUrl = null;

        const captureFrameBtn = document.getElementById('capture-frame-btn');
    if (!captureBtn) return;

    captureBtn.addEventListener('click', () => performCapture('full'));
    if (captureFrameBtn) captureFrameBtn.addEventListener('click', () => performCapture('frame'));

    async function performCapture(captureMode) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
            alert('Cannot capture this page. Try a normal web page.');
            return;
        }

        let targetType = captureMode;
        if (captureMode === 'frame') {
            try {
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    css: `.htsp-highlight-overlay { position: fixed; pointer-events: none; z-index: 2147483647; background: rgba(20, 96, 186, 0.2); border: 2px solid rgba(20, 96, 186, 0.8); transition: all 0.05s ease; cursor: crosshair; }`
                });
            } catch (e) {}

            const selectionResult = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    return new Promise((resolve) => {
                        let overlay = document.createElement('div');
                        overlay.className = 'htsp-highlight-overlay';
                        document.body.appendChild(overlay);

                        let currentTarget = null;
                        const moveHandler = (e) => {
                            if (currentTarget === e.target) return;
                            currentTarget = e.target;
                            const rect = currentTarget.getBoundingClientRect();
                            overlay.style.top = rect.top + 'px';
                            overlay.style.left = rect.left + 'px';
                            overlay.style.width = rect.width + 'px';
                            overlay.style.height = rect.height + 'px';
                        };

                        const clickHandler = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            document.removeEventListener('mousemove', moveHandler, true);
                            document.removeEventListener('click', clickHandler, true);
                            overlay.remove();

                            const isFullPage = (currentTarget === document.body || currentTarget === document.documentElement);
                            if (isFullPage) {
                                resolve({ type: 'full' });
                            } else {
                                const uniqueId = `htsp-target-${Date.now()}`;
                                currentTarget.dataset.htspTarget = uniqueId;
                                resolve({ type: 'frame', targetId: uniqueId });
                            }
                        };

                        document.addEventListener('mousemove', moveHandler, true);
                        document.addEventListener('click', clickHandler, true);
                    });
                }
            });

            if (!selectionResult || !selectionResult[0] || !selectionResult[0].result) return;
            targetType = selectionResult[0].result.type;
        }

        captureBtn.style.display = 'none';
        if (captureFrameBtn) captureFrameBtn.style.display = 'none';
        loadingState.classList.remove('hidden');
        previewContainer.classList.add('hidden');

        try {
            const sizeInfo = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: async () => {
                    const delays = (ms) => new Promise(res => setTimeout(res, ms));
                    
                    let scrollers = [];
                    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
                    let node;
                    while ((node = walker.nextNode())) {
                        const style = window.getComputedStyle(node);
                        if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') {
                            if (node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 10) {
                                scrollers.push(node);
                            }
                        }
                    }
                    
                    window.__htsp_scrollers = [];
                    const origWindowY = window.scrollY;
                    
                    let lastScroll = -1;
                    while (window.scrollY < Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight && window.scrollY > lastScroll) {
                        lastScroll = window.scrollY;
                        window.scrollBy(0, 800);
                        await delays(200);
                    }
                    window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
                    
                    for (let i = 0; i < scrollers.length; i++) {
                        let s = scrollers[i];
                        s.dataset.htspId = i.toString();
                        window.__htsp_scrollers.push({ id: i, top: s.scrollTop });
                        
                        let sLast = -1;
                        while (s.scrollTop < s.scrollHeight - s.clientHeight && s.scrollTop > sLast) {
                            sLast = s.scrollTop;
                            s.scrollTop += 800;
                            await delays(150);
                        }
                        s.scrollTop = s.scrollHeight;
                    }

                    await delays(800);

                    let maxH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
                    let maxW = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
                    for (let s of scrollers) {
                        let fixedVerticalSpace = Math.max(0, window.innerHeight - s.clientHeight);
                        let requiredHeight = s.scrollHeight + fixedVerticalSpace + 50;
                        if (requiredHeight > maxH) maxH = requiredHeight;

                        let fixedHorizontalSpace = Math.max(0, window.innerWidth - s.clientWidth);
                        let requiredWidth = s.scrollWidth + fixedHorizontalSpace;
                        if (requiredWidth > maxW) maxW = requiredWidth;
                    }

                    window.scrollTo(0, 0);
                    for (let s of scrollers) {
                        s.scrollTop = 0;
                    }
                    await delays(500);

                    return { width: maxW, height: maxH, devicePixelRatio: window.devicePixelRatio || 1, origWindowY: origWindowY };
                }
            });

            let { width, height, devicePixelRatio, origWindowY } = sizeInfo[0].result;
            height = Math.min(height, 16000);

            await chrome.debugger.attach({ tabId: tab.id }, "1.3");

            await chrome.debugger.sendCommand({ tabId: tab.id }, "Emulation.setDeviceMetricsOverride", {
                width: width,
                height: height,
                deviceScaleFactor: devicePixelRatio,
                mobile: false
            });

            await new Promise(r => setTimeout(r, 600));

            let screenshotParams = { format: "png", fromSurface: true };
            if (targetType === 'frame') {
                const clipResult = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const el = document.querySelector('[data-htsp-target]');
                        if (!el) return null;
                        const rect = el.getBoundingClientRect();
                        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
                    }
                });
                if (clipResult && clipResult[0] && clipResult[0].result) {
                    const r = clipResult[0].result;
                    if (r.width > 0 && r.height > 0) {
                        screenshotParams.clip = { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
                        screenshotParams.captureBeyondViewport = true;
                    }
                }
            }

            const screenshotResult = await chrome.debugger.sendCommand({ tabId: tab.id }, "Page.captureScreenshot", screenshotParams);

            await chrome.debugger.sendCommand({ tabId: tab.id }, "Emulation.clearDeviceMetricsOverride", {});
            await chrome.debugger.detach({ tabId: tab.id });

            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (origY) => {
                        window.scrollTo(0, origY);
                        if (window.__htsp_scrollers) {
                            window.__htsp_scrollers.forEach(data => {
                                let s = document.querySelector(`[data-htsp-id="${data.id}"]`);
                                if (s) {
                                    s.scrollTop = data.top;
                                    delete s.dataset.htspId;
                                }
                            });
                            delete window.__htsp_scrollers;
                        }
                        const el = document.querySelector('[data-htsp-target]');
                        if (el) delete el.dataset.htspTarget;
                    },
                    args: [origWindowY ?? 0]
                });
            } catch (e) {}

            if (screenshotResult && screenshotResult.data) {
                capturedDataUrl = "data:image/png;base64," + screenshotResult.data;
                previewImg.src = capturedDataUrl;
                
                loadingState.classList.add('hidden');
                previewContainer.classList.remove('hidden');
                captureBtn.style.display = 'flex';
                if (captureFrameBtn) captureFrameBtn.style.display = 'flex';
                
                captureBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 8v-2a2 2 0 0 1 2 -2h2" /><path d="M4 16v2a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M16 20h2a2 2 0 0 0 2 -2v-2" /><circle cx="12" cy="12" r="3" /></svg>Full Page`;
                if (captureFrameBtn) captureFrameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" /><path d="M9 9m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" /></svg>Frame`;
            } else {
                throw new Error("Failed to capture screenshot data");
            }

        } catch (error) {
            console.error('Capture error:', error);
            alert('Failed to capture page: ' + (error.message || error));
            loadingState.classList.add('hidden');
            captureBtn.style.display = 'flex';
            if (captureFrameBtn) captureFrameBtn.style.display = 'flex';
            
            chrome.debugger.detach({ tabId: tab.id }, () => {});
            
            try {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        if (window.__htsp_scrollers) {
                            window.__htsp_scrollers.forEach(data => {
                                let s = document.querySelector(`[data-htsp-id="${data.id}"]`);
                                if (s) s.scrollTop = data.top;
                            });
                        }
                        const el = document.querySelector('[data-htsp-target]');
                        if (el) delete el.dataset.htspTarget;
                    }
                });
            } catch(e) {}
        }
    }

    downloadBtn.addEventListener('click', () => {
        if (!capturedDataUrl) return;

        chrome.downloads.download({
            url: capturedDataUrl,
            filename: `page_capture_${new Date().getTime()}.png`,
            saveAs: true
        });
    });

    const copyBtn = document.getElementById('copy-capture-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            if (!capturedDataUrl) return;
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>
                Copied!
            `;
            try {
                // Fetch blob from base64 data url
                const response = await fetch(capturedDataUrl);
                const blob = await response.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]);
            } catch (err) {
                console.error("Failed to copy image: ", err);
                alert("Failed to copy image to clipboard");
            }
            setTimeout(() => {
                copyBtn.innerHTML = originalHtml;
            }, 2000);
        });
    }
    if (previewImg) {
        previewImg.addEventListener('click', () => {
            if (!capturedDataUrl) return;
            chrome.tabs.create({ url: chrome.runtime.getURL('page-capture/preview.html') });
        });
    }
    // Listen for requests from the preview tab
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GET_CAPTURE_PREVIEW') {
            sendResponse({ dataUrl: capturedDataUrl });
        }
    });
});
