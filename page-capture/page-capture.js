document.addEventListener('DOMContentLoaded', () => {
    const captureBtn = document.getElementById('capture-btn');
    const loadingState = document.getElementById('capture-loading');
    const previewContainer = document.getElementById('capture-preview-container');
    const previewImg = document.getElementById('capture-preview-img');
    const downloadBtn = document.getElementById('download-capture-btn');
    let capturedDataUrl = null;

    if (!captureBtn) return; // Prevent errors if not in DOM

    captureBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            alert('Cannot capture this page. Try a normal web page.');
            return;
        }

        // Show loading
        captureBtn.style.display = 'none';
        loadingState.classList.remove('hidden');
        previewContainer.classList.add('hidden');

        try {

            // 1. Calculate actual scrollable height. To handle lazy loading and virtualized lists (like Gemini/ChatGPT),
            // we must smoothly scroll down piece by piece to perfectly simulate human interaction and load all DOM items.
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
                    
                    // Smoothly scroll Main Window
                    let lastScroll = -1;
                    while (window.scrollY < Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight && window.scrollY > lastScroll) {
                        lastScroll = window.scrollY;
                        window.scrollBy(0, 800);
                        await delays(200);
                    }
                    window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
                    
                    // Smoothly scroll Inner Scrollers
                    for (let i = 0; i < scrollers.length; i++) {
                        let s = scrollers[i];
                        s.dataset.htspId = i.toString();
                        window.__htsp_scrollers.push({ id: i, top: s.scrollTop });
                        
                        let sLast = -1;
                        while (s.scrollTop < s.scrollHeight - s.clientHeight && s.scrollTop > sLast) {
                            sLast = s.scrollTop;
                            s.scrollTop += 800;
                            await delays(150); // Give time for new data to fetch
                        }
                        s.scrollTop = s.scrollHeight;
                    }

                    // Settle time for images and DOM manipulation
                    await delays(800);

                    // NOW calculate max height after lazy content has been rendered
                    let maxH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
                    let maxW = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
                    for (let s of scrollers) {
                        if (s.scrollHeight > maxH) maxH = s.scrollHeight;
                        if (s.scrollWidth > maxW) maxW = s.scrollWidth;
                    }

                    return {
                        width: maxW,
                        height: maxH,
                        devicePixelRatio: window.devicePixelRatio || 1,
                        origWindowY: origWindowY
                    };
                }
            });

            let { width, height, devicePixelRatio, origWindowY } = sizeInfo[0].result;
            // Cap height to prevent renderer crash
            height = Math.min(height, 16000);

            // 2. Attach Debugger
            await new Promise((resolve, reject) => {
                chrome.debugger.attach({ tabId: tab.id }, "1.3", () => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve();
                });
            });

            // 3. Force viewport to match full content size
            await new Promise((resolve, reject) => {
                chrome.debugger.sendCommand({ tabId: tab.id }, "Emulation.setDeviceMetricsOverride", {
                    width: width,
                    height: height,
                    deviceScaleFactor: devicePixelRatio,
                    mobile: false
                }, (result) => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve(result);
                });
            });

            // Wait a moment for the DOM to reflow/expand to the new giant viewport
            await new Promise(r => setTimeout(r, 600));

            // 4. Capture the screenshot (now that the whole page fits in the viewport)
            const screenshotResult = await new Promise((resolve, reject) => {
                chrome.debugger.sendCommand({ tabId: tab.id }, "Page.captureScreenshot", {
                    format: "png",
                    fromSurface: true
                }, (result) => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve(result);
                });
            });

            // 5. Restore viewport
            await new Promise((resolve) => {
                chrome.debugger.sendCommand({ tabId: tab.id }, "Emulation.clearDeviceMetricsOverride", {}, resolve);
            });

            // Detach Debugger immediately after success
            await new Promise((resolve) => chrome.debugger.detach({ tabId: tab.id }, resolve));

            // Restoring viewport scroll position so user isn't stuck at the bottom
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
                    },
                    args: [origWindowY ?? 0]
                });
            } catch (e) {
                console.warn('Scroll restore failed', e);
            }

            if (screenshotResult && screenshotResult.data) {
                capturedDataUrl = "data:image/png;base64," + screenshotResult.data;
                previewImg.src = capturedDataUrl;
                
                loadingState.classList.add('hidden');
                previewContainer.classList.remove('hidden');
                captureBtn.style.display = 'flex'; // Show button again
                
                captureBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 8v-2a2 2 0 0 1 2 -2h2" /><path d="M4 16v2a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M16 20h2a2 2 0 0 0 2 -2v-2" /><circle cx="12" cy="12" r="3" /></svg>
                    Capture Again
                `;
            } else {
                throw new Error("Failed to capture screenshot data");
            }

        } catch (error) {
            console.error('Capture error:', error);
            alert('Failed to capture page: ' + (error.message || error));
            loadingState.classList.add('hidden');
            captureBtn.style.display = 'flex';
            
            // Try to detach in case of fatal error before detach logic 
            chrome.debugger.detach({ tabId: tab.id }, () => {});
            
            // Try to restore scroll even on error
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
                    }
                });
            } catch(e) {}
        }
    });

    downloadBtn.addEventListener('click', () => {
        if (!capturedDataUrl) return;

        chrome.downloads.download({
            url: capturedDataUrl,
            filename: `page_capture_${new Date().getTime()}.png`,
            saveAs: true
        });
    });
});
