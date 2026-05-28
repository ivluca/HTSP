# HTSP (Help Tools Side Panel)

**HTSP** is a Chrome extension that integrates web tools and a powerful tab manager into the browser's Side Panel.

## Features (v3.2)

### Google Chat Blocker (Options Tab)
Prevents senders from knowing when you have read their messages or when you are typing in Google Chat.
- **Read Receipt Blocking:** Intercepts Google Chat's gRPC-Web requests and blocks `updateSpaceReadState` API calls.
- **Typing Indicator Blocking:** Intercepts and blocks the `batchexecute?rpcids=uQwtvc` endpoint to hide your typing status.
- **Optimistic UI:** Fakes a successful HTTP 200 response so that the chat appears "Read" locally to the user, preventing UI glitches, while remaining "Unread" to the sender.
- **Isolated Injection:** Uses an isolated content script bridge and main-world interceptor to transparently modify the `window.fetch` and `XMLHttpRequest` APIs.

### Media Downloader
Extracts and downloads media assets from the active tab.
- **Extraction:** Parses the DOM to identify `img`, `video` elements, and inline background images.
- **Filtering:** Filters media by type before selection.
- **Bulk Download:** Uses the `chrome.downloads` API to process bulk downloads concurrently. Files are routed into timestamp-generated subdirectories (e.g., `MediaDownloader_YYYYMMDD_HHMMSS`).
- **Download Management:** Lifecycle controls including pause, resume, and cancel for active bulk download queues.
- **Size Estimation:** Dispatches concurrent `HEAD` requests to compute total `Content-Length` across selected assets before initializing the download sequence.

### Tab Manager
Tooling for managing open browser tabs from the Side Panel.
- **Organization:** Sub-groups tabs by window ID, prioritizing pinned tabs.
- **Search & Reorder:** Implements fuzzy search across tab titles and drag-and-drop DOM reordering within windows.
- **State Management:** Individual actions (pin, bookmark, reload, close) and bulk operations (merge windows, bulk pin, bulk close non-pinned).

### AI Workspaces
- Embeds ChatGPT and Gemini web interfaces as internal frames within the Side Panel.
- Viewports are styled to fit the constraints of the Chrome Side Panel dimension limits.

### JSON Viewer
A developer-focused tab for formatting, inspecting, and copying JSON data right within the Side Panel.
- **Auto-Formatting:** Paste unformatted JSON and press Enter to instantly prettify it.
- **Interactive Tree View:** Expand and collapse deep JSON objects and arrays effortlessly.
- **Visual Hierarchy:** Clean, GPT-style minimal interface with clear structural indentation and array boundaries.
- **Node-level Copying:** One-click copy buttons (clipboard) for copying any specific object, array, or primitive value exactly as displayed.

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
