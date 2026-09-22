# HTSP — Help Tools Side Panel

**HTSP** is a Chrome extension that brings tab management, AI tools, and developer utilities into the browser's native Side Panel.

---

## Features (v3.9)

### Tab Manager
A full-featured tab manager built directly into the side panel.

- **Overview:** Lists all open tabs across every window, grouped into Pinned, Tab Groups, and per-Window sections.
- **Search:** Instant filtering across tab titles and URLs.
- **Selection:** Click to switch, Ctrl-click for multi-select, Shift-click for range select.
- **Actions:** Close, Pin/Unpin, Reload, Show/Hide title, Group, Ungroup — available via row buttons and right-click context menu.
- **Tab Groups:** Create, collapse/expand, and ungroup Chrome tab groups with color support.
- **Merge Windows:** Move all tabs from every other window into the current one with one click.
- **Close Duplicates:** Automatically closes duplicate tabs (keeps the most recently accessed). Supports custom URL-pattern rules for smart deduplication (e.g. group all `chat.google.com` tabs as duplicates regardless of query params).
- **Copy Window Links:** Each window section has a button to copy all URLs in that window only.
- **Real-time Updates:** The list stays in sync even after long idle periods (service worker restart), switching between panel sections, or returning from other apps.

### Gemini
Embeds the Gemini web interface as an internal frame inside the Side Panel.

### JSON Viewer
An interactive JSON formatter and tree viewer.

- Paste JSON and press **Enter** to format instantly.
- Expand/collapse nested objects and arrays.
- Search keys and values with `Enter` / `Shift+Enter` to cycle through matches.
- One-click copy for any node (object, array, or primitive).

### Save Image As (Right-Click)
Adds a **Save image as** sub-menu to the browser's right-click menu on any image.

- Re-encode to **PNG**, **JPEG**, or **WebP** before saving.
- Conversion runs in the service worker via `OffscreenCanvas` — no tainted-canvas issues.
- Downloads directly to the default folder with a sanitized filename.

### Feature Manager (Options Tab)
Control which tabs are visible in the Side Panel.

- Toggle Tab Manager, Gemini, and JSON Viewer on or off.
- Settings persist across browser restarts via `chrome.storage.local`.
- If the active tab is hidden, the panel switches to the first available tab automatically.

### Dedupe URL Patterns (Options Tab)
Define custom URL keywords so that tabs matching the same pattern count as duplicates (ignoring query params, fragments, etc.).

---

## Installation

1. Clone this repository.
2. Open Chrome → `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the project folder.

## Development

1. Load the folder as an unpacked extension.
2. Make changes, then click **Reload** on the extension card in `chrome://extensions`.

## License

MIT
