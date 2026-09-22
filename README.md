<div align="center">

<img src="images/icon.png" width="80" alt="HTSP Logo" />

# HTSP — Help Tools Side Panel

**A Chrome extension that supercharges your browser's native Side Panel**  
with a powerful Tab Manager, AI workspace, JSON viewer, and more.

[![Version](https://img.shields.io/badge/version-3.9.0-6366f1?style=flat-square)](https://github.com/ivluca/HTSP)
[![Manifest](https://img.shields.io/badge/Manifest-V3-brightgreen?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## ✨ Features

### 🗂️ Tab Manager

> The heart of HTSP — a full tab manager living right inside the side panel.

| Capability | Details |
|---|---|
| **Overview** | All tabs across every window, grouped into Pinned, Tab Groups, and per-Window sections |
| **Search** | Instant real-time filtering across tab titles and URLs |
| **Multi-Select** | Click · `Ctrl+Click` multi-select · `Shift+Click` range select |
| **Actions** | Close, Pin/Unpin, Reload, Show/Hide, Group, Ungroup — via buttons or right-click menu |
| **Tab Groups** | Create groups with colors, collapse/expand, ungroup in bulk |
| **Merge Windows** | Pull all tabs from every other window into the current one in one click |
| **Close Duplicates** | Closes duplicate tabs, keeping the most recently accessed |
| **Smart Dedupe** | Custom URL patterns to treat tabs as duplicates regardless of query params |
| **Copy Links** | Copy all URLs in a specific window with one click |
| **Always in sync** | Stays accurate after long idle periods, app switches, or panel section changes |

---

### 🤖 Gemini

Embeds Google Gemini directly inside the Side Panel — no tab switching needed.

---

### 🔍 JSON Viewer

> A clean, interactive JSON formatter for developers.

- Paste JSON → press **Enter** to format instantly
- Expand / collapse nested objects and arrays
- Search keys or values — cycle with `Enter` / `Shift+Enter`
- One-click **copy** for any node, object, array, or primitive value

---

### 🖼️ Save Image As *(Right-Click)*

Adds a **Save image as** sub-menu to the browser context menu on any image.

- Re-encode to **PNG**, **JPEG**, or **WebP** before saving
- Conversion via `OffscreenCanvas` in the service worker — no tainted-canvas issues
- Downloads instantly with a clean filename derived from the source URL

---

### ⚙️ Options Tab

| Setting | Description |
|---|---|
| **Feature Visibility** | Toggle Tab Manager, Gemini, and JSON Viewer on/off individually |
| **Dedupe Patterns** | Define URL keywords for smart duplicate detection |
| **Reset Settings** | One-click restore to defaults (with confirmation) |

> Settings persist across browser restarts via `chrome.storage.local`.  
> If the active tab is hidden, the panel automatically switches to the next available one.

---

## 🚀 Installation

```
1. Clone this repository
2. Go to chrome://extensions
3. Enable Developer mode (top right)
4. Click "Load unpacked" → select the project folder
```

---

## 🛠️ Development

```
1. Load the folder as an unpacked extension
2. Edit source files
3. Click Reload on the extension card in chrome://extensions
```

---

## 📄 License

MIT © [ivluca](https://github.com/ivluca)
