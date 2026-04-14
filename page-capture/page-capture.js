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

        let abortResolver = null;
        let activeTabId = tab.id;
        window.htsp_abortCapture = false;
        const cancelBtn = document.getElementById('cancel-capture-btn');
        const loadingText = document.getElementById('capture-loading-text');

        const abortFn = () => {
            window.htsp_abortCapture = true;
            try { chrome.scripting.executeScript({ target: {tabId: activeTabId}, func: () => window.dispatchEvent(new Event('htsp-abort-selection')) }); } catch(e) {}
            if (abortResolver) abortResolver({ aborted: true });
        };
        if (cancelBtn) {
            cancelBtn.onclick = abortFn;
        }

        let targetType = captureMode;
        
        captureBtn.style.display = 'none';
        if (captureFrameBtn) captureFrameBtn.style.display = 'none';
        previewContainer.classList.add('hidden');
        
        if (captureMode === 'frame') {
            loadingText.innerText = 'Select a frame on the page (or press Esc to cancel)...';
            loadingState.classList.remove('hidden');

            try {
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    css: `.htsp-highlight-overlay { position: fixed; pointer-events: none; z-index: 2147483647; background: rgba(20, 96, 186, 0.2); border: 2px solid rgba(20, 96, 186, 0.8); transition: all 0.05s ease; cursor: crosshair; }`
                });
            } catch (e) {}

            const extSelectionPromise = chrome.scripting.executeScript({
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

                        const cleanup = () => {
                            document.removeEventListener('mousemove', moveHandler, true);
                            document.removeEventListener('click', clickHandler, true);
                            document.removeEventListener('keydown', keyHandler, true);
                            window.removeEventListener('htsp-abort-selection', abortHandler);
                            if (overlay) overlay.remove();
                        };

                        const clickHandler = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            cleanup();

                            const isFullPage = (currentTarget === document.body || currentTarget === document.documentElement);
                            if (isFullPage) {
                                resolve({ type: 'full' });
                            } else {
                                const uniqueId = `htsp-target-${Date.now()}`;
                                currentTarget.dataset.htspTarget = uniqueId;
                                resolve({ type: 'frame', targetId: uniqueId });
                            }
                        };

                        const keyHandler = (e) => {
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                cleanup();
                                resolve({ type: 'cancel' });
                            }
                        };
                        
                        const abortHandler = () => {
                            cleanup();
                            resolve({ type: 'cancel' });
                        };

                        document.addEventListener('mousemove', moveHandler, true);
                        document.addEventListener('click', clickHandler, true);
                        document.addEventListener('keydown', keyHandler, true);
                        window.addEventListener('htsp-abort-selection', abortHandler);
                    });
                }
            });

            const abortPromise = new Promise(r => abortResolver = r);
            const selectionResult = await Promise.race([extSelectionPromise, abortPromise]);

            if (window.htsp_abortCapture || !selectionResult || (selectionResult[0] && selectionResult[0].result && selectionResult[0].result.type === 'cancel') || selectionResult.aborted) {
                // Aborted or error
                captureBtn.style.display = 'flex';
                if (captureFrameBtn) captureFrameBtn.style.display = 'flex';
                loadingState.classList.add('hidden');
                
                // Cleanup potentially injected elements/css
                try {
                    await chrome.scripting.executeScript({ target: {tabId: tab.id}, func: () => {
                        document.querySelectorAll('.htsp-highlight-overlay').forEach(el => el.remove());
                    }});
                } catch(e) {}
                
                return;
            }
            targetType = selectionResult[0].result.type;
        }

        loadingText.innerText = 'Capturing page, please wait...';
        loadingState.classList.remove('hidden');

        try {
            if (window.htsp_abortCapture) throw new Error("Aborted");
            const sizeInfoAsync = chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: async () => {
                    window.htsp_page_abort = false;
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
                    while (!window.htsp_page_abort && window.scrollY < Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight && window.scrollY > lastScroll) {
                        lastScroll = window.scrollY;
                        window.scrollBy(0, 800);
                        await delays(200);
                    }
                    window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
                    
                    for (let i = 0; i < scrollers.length; i++) {
                        if (window.htsp_page_abort) break;
                        let s = scrollers[i];
                        s.dataset.htspId = i.toString();
                        window.__htsp_scrollers.push({ id: i, top: s.scrollTop });
                        
                        let sLast = -1;
                        while (!window.htsp_page_abort && s.scrollTop < s.scrollHeight - s.clientHeight && s.scrollTop > sLast) {
                            sLast = s.scrollTop;
                            s.scrollTop += 800;
                            await delays(150);
                        }
                        s.scrollTop = s.scrollHeight;
                    }

                    await delays(500);

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

                    return { width: maxW, height: maxH, devicePixelRatio: window.devicePixelRatio || 1, origWindowY: origWindowY, aborted: window.htsp_page_abort === true };
                }
            });

            const abortProm = new Promise(r => abortResolver = r);
            const sizeInfo = await Promise.race([sizeInfoAsync, abortProm]);

            if (window.htsp_abortCapture || !sizeInfo || sizeInfo.aborted || (sizeInfo[0] && sizeInfo[0].result && sizeInfo[0].result.aborted)) {
                throw new Error("Aborted");
            }

            let { width, height, devicePixelRatio, origWindowY } = sizeInfo[0].result;
            height = Math.min(height, 16000);

            await chrome.debugger.attach({ tabId: tab.id }, "1.3");

            // Freeze visibility of fixed elements before resize to prevent responsive media queries from hiding them (like Footers)
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
                        let node;
                        while ((node = walker.nextNode())) {
                            const style = window.getComputedStyle(node);
                            if (style.position === 'fixed' || style.position === 'sticky' || node.tagName === 'FOOTER' || node.id.toLowerCase().includes('footer') || node.className.toLowerCase().includes('footer')) {
                                node.style.setProperty('display', style.display, 'important');
                                node.style.setProperty('opacity', style.opacity, 'important');
                                node.style.setProperty('visibility', style.visibility, 'important');
                                const childWalker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null, false);
                                let child;
                                while ((child = childWalker.nextNode())) {
                                    const cStyle = window.getComputedStyle(child);
                                    child.style.setProperty('display', cStyle.display, 'important');
                                    child.style.setProperty('opacity', cStyle.opacity, 'important');
                                    child.style.setProperty('visibility', cStyle.visibility, 'important');
                                }
                            }
                        }
                    }
                });
            } catch (e) {}

            await chrome.debugger.sendCommand({ tabId: tab.id }, "Emulation.setDeviceMetricsOverride", {
                width: width,
                height: height,
                deviceScaleFactor: devicePixelRatio,
                mobile: false
            });

            // Disable Chromium native viewport size tooltip after Emulation is configured
            try { await chrome.debugger.sendCommand({ tabId: tab.id }, "Overlay.disable", {}); } catch(e) {}
            try { await chrome.debugger.sendCommand({ tabId: tab.id }, "Overlay.setShowViewportSizeOnResize", { show: false }); } catch(e) {}

            // Hide scrollbars before capture
            try {
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id, allFrames: true },
                    css: '::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; } * { scrollbar-width: none !important; }'
                });
            } catch (e) {}

            // Force reflow/repaint compositor to ensure fixed elements aren't dropped by Chromium
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        window.dispatchEvent(new Event('resize'));
                        window.scrollBy(0, 1);
                        setTimeout(() => window.scrollBy(0, -1), 50);
                    }
                });
            } catch (e) {}

            await new Promise(r => setTimeout(r, 1200));

            let screenshotParams = { format: "png", fromSurface: true };
            let clipRect = null;
            if (targetType === 'frame') {
                const clipResult = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const el = document.querySelector('[data-htsp-target]');
                        if (!el) return null;
                        const rect = el.getBoundingClientRect();
                        return { 
                            x: rect.left, 
                            y: rect.top, 
                            width: rect.width, 
                            height: rect.height 
                        };
                    }
                });
                if (clipResult && clipResult[0] && clipResult[0].result) {
                    clipRect = clipResult[0].result;
                }
            }

            const screenshotResult = await chrome.debugger.sendCommand({ tabId: tab.id }, "Page.captureScreenshot", screenshotParams);

            await chrome.debugger.sendCommand({ tabId: tab.id }, "Emulation.clearDeviceMetricsOverride", {});
            try { await chrome.debugger.detach({ tabId: tab.id }); } catch(e) {}
            
            // Restore scrollbars
            try {
                await chrome.scripting.removeCSS({
                    target: { tabId: tab.id, allFrames: true },
                    css: '::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; } * { scrollbar-width: none !important; }'
                });
            } catch (e) {}

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
                let finalDataUrl = "data:image/png;base64," + screenshotResult.data;
                
                // Crop the frame robustly via HTML Canvas to avoid Chromium CDP scaling/stretching bugs
                if (targetType === 'frame' && clipRect && clipRect.width > 0 && clipRect.height > 0) {
                    finalDataUrl = await new Promise((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const physicalX = clipRect.x * devicePixelRatio;
                            const physicalY = clipRect.y * devicePixelRatio;
                            const physicalWidth = clipRect.width * devicePixelRatio;
                            const physicalHeight = clipRect.height * devicePixelRatio;

                            // Floor/Ceil ensures no sub-pixel clipping, padding grabs up to 2px outlines/borders
                            const padding = Math.round(2 * devicePixelRatio);
                            const srcX = Math.max(0, Math.floor(physicalX) - padding);
                            const srcY = Math.max(0, Math.floor(physicalY) - padding);
                            const srcEndX = Math.min(img.width, Math.ceil(physicalX + physicalWidth) + padding);
                            const srcEndY = Math.min(img.height, Math.ceil(physicalY + physicalHeight) + padding);

                            canvas.width = srcEndX - srcX;
                            canvas.height = srcEndY - srcY;

                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 
                                srcX, srcY, canvas.width, canvas.height,
                                0, 0, canvas.width, canvas.height
                            );
                            resolve(canvas.toDataURL('image/png'));
                        };
                        img.onerror = () => reject(new Error("Failed to load image for cropping"));
                        img.src = finalDataUrl;
                    });
                }

                capturedDataUrl = finalDataUrl;
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
            
            let errMsg = error.message || error;
            if (errMsg.includes('Another debugger is already attached')) {
                errMsg = 'Please close Developer Tools (F12) on this page to capture it.';
            }
            if (errMsg !== 'Aborted') {
                alert('Failed to capture page: ' + errMsg);
            }
            
            loadingState.classList.add('hidden');
            captureBtn.style.display = 'flex';
            if (captureFrameBtn) captureFrameBtn.style.display = 'flex';
            
            try { await chrome.debugger.detach({ tabId: tab.id }); } catch (e) {}
            
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
