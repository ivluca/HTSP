# HTSP (Help Tools Side Panel)

**HTSP** is a Chrome extension that integrates web tools and a powerful tab manager into the browser's Side Panel.

## Features (v3.0)

### Media Downloader
Extracts and downloads media assets from the active tab.
- **Extraction:** Parses the DOM to identify `img`, `video` elements, and inline background images.
- **Filtering:** Filters media by type before selection.
- **Bulk Download:** Uses the `chrome.downloads` API to process bulk downloads concurrently. Files are routed into timestamp-generated subdirectories (e.g., `MediaDownloader_YYYYMMDD_HHMMSS`).
- **Download Management:** Lifecycle controls including pause, resume, and cancel for active bulk download queues.
- **Size Estimation:** Dispatches concurrent `HEAD` requests to compute total `Content-Length` across selected assets before initializing the download sequence.
### Page Capture
Captures full-page screenshots of modern, dynamic web pages.
- **Dynamic Content Support:** Programmatically simulates smooth scrolling to force lazy-loaded and virtualized lists (like Gemini and ChatGPT chats) to render completely before taking the shot.
- **Viewport Emulation:** Adjusts device metrics to wrap the entire page layout natively without graphical clipping.
- **Preview & Management:** Offers zoomed preview, and allows direct saving or copying the resulting image to the clipboard.

### Tab Manager
Tooling for managing open browser tabs from the Side Panel.
- **Organization:** Sub-groups tabs by window ID, prioritizing pinned tabs.
- **Search & Reorder:** Implements fuzzy search across tab titles and drag-and-drop DOM reordering within windows.
- **State Management:** Individual actions (pin, bookmark, reload, close) and bulk operations (merge windows, bulk pin, bulk close non-pinned).

### AI Workspaces
- Embeds ChatGPT and Gemini web interfaces as internal frames within the Side Panel.
- Viewports are styled to fit the constraints of the Chrome Side Panel dimension limits.

## Installation
1.  Clone this repository to your local machine.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode**.
4.  Click **Load unpacked** and select the source code directory.

## Usage
- Open the Chrome Side Panel and select HTSP from the extension list.
- Switch between ChatGPT, Gemini, and Tab Manager using the provided tabs.
- Use the Tab Manager to organize, search, and manage your browser tabs efficiently.

## Development
1. Select **Developer mode** in the extensions tab.
2. Load the project folder as an unpacked extension.
3. Make your local changes and use the **Reload** button in `chrome://extensions` to apply updates during testing.

## License
