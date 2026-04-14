document.addEventListener('DOMContentLoaded', () => {
    const img = document.getElementById('preview-img');

    // Request the image data from the side panel
    chrome.runtime.sendMessage({ type: 'GET_CAPTURE_PREVIEW' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Error fetching preview:", chrome.runtime.lastError);
            alert("No preview data available or the side panel was closed.");
            return;
        }

        if (response && response.dataUrl) {
            img.src = response.dataUrl;
        } else {
            alert("Could not load preview image.");
        }
    });

    // Zoom behavior
    img.addEventListener('click', function() {
        if (this.style.cursor === 'zoom-in' || !this.style.cursor) {
            this.style.cursor = 'zoom-out';
            this.style.maxWidth = 'none';
        } else {
            this.style.cursor = 'zoom-in';
            this.style.maxWidth = '100%';
        }
    });

    // Default to fit width
    img.style.maxWidth = '100%';
});
