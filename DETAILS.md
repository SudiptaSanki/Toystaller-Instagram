# 📘 Toystaller Technical Specification & Deep Architecture Guide

> **Main Global Multi-Platform Repository:** [https://github.com/SudiptaSanki/Toystaller](https://github.com/SudiptaSanki/Toystaller)  
> **Instagram Specialized Repository:** [https://github.com/SudiptaSanki/Toystaller-Instagram](https://github.com/SudiptaSanki/Toystaller-Instagram)  
> **Version:** 6.0 (Specialized Edition)  
> **Specification Target:** Chromium Manifest V3

---

## 📑 Table of Contents
1. [Executive Summary & Motivation](#1-executive-summary--motivation)
2. [Why Standard Media Downloaders Fail on Instagram](#2-why-standard-media-downloaders-fail-on-instagram)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Component Deep Dive](#4-component-deep-dive)
   - [4.1 Main World Execution & Page Interceptor](#41-main-world-execution--page-interceptor)
   - [4.2 React Fiber State Inspection Engine](#42-react-fiber-state-inspection-engine)
   - [4.3 Dynamic Network Interception Pipeline](#43-dynamic-network-interception-pipeline)
   - [4.4 Content Script & Cross-World Messaging](#44-content-script--cross-world-messaging)
   - [4.5 Overlay Manager & Collision Resolution Engine](#45-overlay-manager--collision-resolution-engine)
   - [4.6 Modal Isolation & Zero-Bleed Backdrop Engine](#46-modal-isolation--zero-bleed-backdrop-engine)
   - [4.7 DeclarativeNetRequest & Referer Header Spoofing](#47-declarativeNetRequest--referer-header-spoofing)
   - [4.8 Background Service Worker & Download Pipeline](#48-background-service-worker--download-pipeline)
5. [Instagram Section-by-Section Handler Matrix](#5-instagram-section-by-section-handler-matrix)
6. [Performance, Memory & Lifecycle Optimization](#6-performance-memory--lifecycle-optimization)
7. [Security, Sandboxing & Privacy Guarantees](#7-security-sandboxing--privacy-guarantees)
8. [Comparison with Alternative Approaches](#8-comparison-with-alternative-approaches)
9. [Global Multi-Platform Ecosystem](#9-global-multi-platform-ecosystem)

---

## 1. Executive Summary & Motivation

**Toystaller** was created to solve a fundamental problem in the modern web: **access to original, uncompressed user media**. Social media networks such as Instagram employ sophisticated client-side rendering engines (React), dynamic adaptive streaming (DASH/HLS), and segmented blob streams (`blob:https://...`) to obscure direct media sources.

Traditional approaches either:
1. Require users to copy URLs and paste them into third-party websites loaded with advertisements, trackers, and aggressive rate limits.
2. Rely on scraping public video tags from the DOM, which only exposes low-bitrate, heavily compressed video segments or thumbnail covers.
3. Query external server-side APIs that frequently break whenever Instagram updates its internal GraphQL schemas.

**Toystaller operates entirely within the client's browser**, non-destructively reading memory states and network buffers that the official Instagram web client has already authenticated and decrypted.

---

## 2. Why Standard Media Downloaders Fail on Instagram

Instagram's web client implements multiple anti-scraping and optimization layers:

```
[User Browser]
   ├── 1. Blob URLs: <video src="blob:https://instagram.com/xyz...">
   │      └── Direct download returns 0-byte or corrupted stream.
   ├── 2. DASH Segmentation: Video and audio streams are split into tiny chunks.
   ├── 3. Custom DOM Overlay Layers: Transparent divs layer over <video>,
   │      intercepting all right-click and context menu events.
   ├── 4. Referer Verification on CDN: Requests to cdninstagram.com lacking
   │      an official Referer header trigger HTTP 403 Forbidden.
   └── 5. Single-Page Navigation (SPA): Posts opened from profile grids render
          as modals without a full page reload, leaving background media active.
```

Toystaller bypasses all five barriers directly at the browser runtime level without modifying Instagram's original DOM or triggering anti-bot heuristics.

---

## 3. System Architecture Overview

```
+-----------------------------------------------------------------------------------+
| CHROMIUM BROWSER RUNTIME                                                          |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | MAIN WORLD (Page Context - window)                                         |  |
|  |                                                                             |  |
|  |   [ Instagram React Application ]                                          |  |
|  |      │                                                                      |  |
|  |      ├─── React Fiber Tree (__reactFiber$, __reactProps$)                   |  |
|  |      │       ▲                                                              |  |
|  |      │       │ [Deep Object Traversal Engine]                               |  |
|  |      │   [ page_interceptor.js ]                                            |  |
|  |      │       ▲                                                              |  |
|  |      └─── Network Hooks (window.fetch, window.XMLHttpRequest)               |  |
|  |              │                                                              |  |
|  |              ▼ window.postMessage                                           |  |
|  +--------------┼--------------------------------------------------------------+  |
|                 │                                                                 |
|  +--------------┼--------------------------------------------------------------+  |
|  | ISOLATED CONTENT SCRIPT WORLD                                               |  |
|  |              ▼                                                              |  |
|  |   [ content_script.js ] ◄───► [ platforms/instagram.js ]                    |  |
|  |          │                                                                  |  |
|  |          ▼                                                                  |  |
|  |   [ overlay_manager.js ]                                                     |  |
|  |      ├── MutationObserver (Modal Dialog Detection)                          |  |
|  |      ├── IntersectionObserver (Media Viewport Tracking)                     |  |
|  |      ├── ResizeObserver (Dynamic Element Relocation)                        |  |
|  |      └── elementsFromPoint (Occlusion & Hover Hit Testing)                  |  |
|  |              │                                                              |  |
|  |              ▼ chrome.runtime.sendMessage                                   |  |
|  +--------------┼--------------------------------------------------------------+  |
|                 │                                                                 |
|  +--------------┼--------------------------------------------------------------+  |
|  | BACKGROUND SERVICE WORKER                                                   |  |
|  |              ▼                                                              |  |
|  |   [ background_script.js ]                                                  |  |
|  |      ├── chrome.downloads.download() ───► [ Local File System ]             |  |
|  |      ├── chrome.tabs.create()         ───► [ HD Media New Tab ]             |  |
|  |      └── declarativeNetRequest        ───► [ rules.json Referer Rewrite ]   |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 4. Component Deep Dive

### 4.1 Main World Execution & Page Interceptor
Chrome extension content scripts run by default in an **Isolated World**. While this protects DOM integrity, it hides the page's actual JavaScript variables, React Fiber tree, and prototype chains (`window.fetch`, `window.XMLHttpRequest`).

Toystaller dynamically injects `platforms/instagram.js` and `page_interceptor.js` directly into the **MAIN world** using standard script tag injection at `document_start`:

```javascript
const script = document.createElement('script');
script.src = chrome.runtime.getURL('page_interceptor.js');
(document.head || document.documentElement).appendChild(script);
script.remove();
```

### 4.2 React Fiber State Inspection Engine
Instagram's React components store their full data models (including direct CDN URLs, progressive MP4 streams, and multi-resolution image arrays) inside internal DOM node properties prefixed with `__reactFiber$` or `__reactProps$`.

When a user hovers or clicks a media item:
1. The extension queries the target `<video>` or `<img>` DOM node.
2. Traverses parent ancestors up to 12 levels in the DOM tree looking for Fiber instances.
3. Recursively scans the Fiber state tree for candidate fields:
   - `video_versions`: Array of streams ordered by bitrate and resolution (`height: 1080`, `height: 720`).
   - `image_versions2.candidates`: Array of image objects ordered by resolution (`width: 1440`, `width: 1080`).
   - `display_url` / `display_resources`: Direct CDN links.
   - `progressiveUrl` / `streamingUrl`: High-bandwidth master MP4 streams.

### 4.3 Dynamic Network Interception Pipeline
In addition to React Fiber inspection, `page_interceptor.js` monkey-patches `window.fetch` and `window.XMLHttpRequest` at runtime:
- Watches for responses from `/graphql/query/`, `instagram.com/api/v1/`, and `*.cdninstagram.com`.
- Clones responses asynchronously without blocking page performance.
- Parses JSON payloads in real time, harvesting valid video and image CDN URLs into an indexed memory set.
- Automatically rejects thumbnail covers, DASH manifests (`.mpd`), and segmented chunks (`bytestart/byteend`) using an intelligent scoring algorithm:
  $$\text{Score} = +10(\text{.mp4}) + 20(\text{1080p}) + 10(\text{720p}) - 50(\text{dash}) - 500(\text{thumbnail})$$

### 4.4 Content Script & Cross-World Messaging
Because the MAIN world interceptor and the Content Script live in different execution contexts, communication is handled via bi-directional asynchronous `window.postMessage` channels with unique random transaction IDs (`magic_get_react_url` ➔ `magic_response_react_url_${id}`) with a 350ms safety timeout fallback.

### 4.5 Overlay Manager & Collision Resolution Engine
Rather than altering Instagram's fragile layout by appending child elements inside `<video>` wrappers, `OverlayManager` appends all UI elements to `document.body` with `position: fixed` and `z-index: 2147483646`.

Key features:
- **`ResizeObserver`**: Instantly tracks changes in media dimensions and viewport scaling.
- **`IntersectionObserver`**: Deactivates overlays for off-screen media (threshold: 15%).
- **Collision Avoidance (`cornerHasConflict`)**: Detects native Instagram interactive controls (Mute, Volume, Close, Share, Like) and automatically shifts buttons to alternative corners (`top-left` ➔ `bottom-left` ➔ `top-right`).

### 4.6 Modal Isolation & Zero-Bleed Backdrop Engine
On Instagram user profile pages (`https://www.instagram.com/<username>/`), clicking any grid item creates a `<div role="dialog">` modal over the existing 20+ grid items.

**The Zero-Bleed Solution:**
1. A real-time `MutationObserver` on `document.body` monitors modal creation/removal.
2. When a modal opens (`hasActiveModal() === true`), all background overlays outside the modal are immediately forced to `display: none; visibility: hidden; pointer-events: none;`.
3. Pointer hit testing (`document.elementsFromPoint`) verifies that cursor coordinates directly intersect with the active modal media before allowing any overlay to display.

### 4.7 DeclarativeNetRequest & Referer Header Spoofing
When opening direct CDN links (`https://scontent.cdninstagram.com/...`) in a new browser tab, Instagram returns HTTP 403 Forbidden because the request lacks an internal Instagram Referer header.

Toystaller includes a declarative net request ruleset in `rules.json`:
```json
[
  {
    "id": 1,
    "priority": 1,
    "action": {
      "type": "modifyHeaders",
      "requestHeaders": [
        {
          "header": "Referer",
          "operation": "set",
          "value": "https://www.instagram.com/"
        }
      ]
    },
    "condition": {
      "urlFilter": "||cdninstagram.com",
      "resourceTypes": ["main_frame", "sub_frame", "media", "xmlhttprequest"]
    }
  }
]
```
This ensures uninhibited playback and clean direct file downloads in any browser tab.

---

## 5. Instagram Section-by-Section Handler Matrix

```mermaid
graph TD
    URL[Current Instagram URL] --> Route{Route Classifier}
    Route -->|hasActiveModal| Modal[Modal Post Handler]
    Route -->|/reels/ or /reel/| Reels[Reels Video Handler]
    Route -->|/stories/| Stories[Stories Fullscreen Handler]
    Route -->|/direct/| DMs[Direct Messages Handler]
    Route -->|/| Feed[Home Feed Handler]
    Route -->|/username/| Profile[Profile Grid Handler]
```

| Section | Detection Rule | Target Strategy | Filter Strategy |
| :--- | :--- | :--- | :--- |
| **Modal Dialog** | `[role="dialog"], [aria-modal="true"]` | Topmost post media, carousel visible slide | Rejects all background grid items, comment avatars, suggested accounts |
| **Profile Grid** | `/<username>/`, `/<username>/saved/` | Grid post tiles (`scale: 0.75`), header avatar (`scale: 0.8`) | Rejects story highlight circles (`[role="menu"]`), icons `< 80px` |
| **Reels** | `/reels/`, `/reel/<id>/` | Viewport-centered active vertical reel | Rejects side preview thumbnails, comment icons |
| **Feed** | `/` (Home) | Main post `<article>` media | Rejects top story tray circles, author avatars |
| **Stories** | `/stories/<username>/<id>/` | Screen-centered active story | Rejects blurred left/right story preview cards |
| **Direct Messages** | `/direct/` | Chat media attachments (`> 150px`) | Rejects contact avatars in sidebar list |

---

## 6. Performance, Memory & Lifecycle Optimization

- **Throttled Pointer Events**: Mousemove handlers are throttled to 30ms intervals to eliminate frame drops and maintain 60/120fps scrolling.
- **Garbage Collection Safety**: DOM nodes are tracked in `Map` collections; when media elements are detached from the DOM, their corresponding observers and overlay containers are disconnected and removed.
- **Context Invalidation Protection**: All background messaging calls are wrapped in `safeSendMessage` try-catch blocks to prevent console warnings when the extension is updated or reloaded during an active session.

---

## 7. Security, Sandboxing & Privacy Guarantees

1. **Zero External Communication**: The extension never makes network calls to external analytical, tracking, or proxy servers. All requests remain within `instagram.com` and `cdninstagram.com`.
2. **Read-Only Inspection**: React Fiber states and GraphQL responses are read in memory without modifying client-side session tokens, cookies, or account credentials.
3. **Shadow DOM Isolation**: The dashboard UI is rendered inside a closed-mode `ShadowRoot`, completely immune to host page CSS pollution.

---

## 8. Comparison with Alternative Approaches

| Feature / Metric | Toystaller: Instagram Edition | Generic Web Scraper / Web Tools | DOM Video Scraping Extensions |
| :--- | :--- | :--- | :--- |
| **Video Quality** | **1080p / Original Master MP4** | Often capped at 720p | Capped at compressed preview |
| **Image Resolution** | **Uncompressed (up to 1440p)** | Compressed JPEG | Screen-size cropped preview |
| **Account Safety** | **100% Safe (Local client-side)** | High risk (Requires login/cookies) | Safe |
| **Speed** | **Instant (0 ms network overhead)** | Slow (Server processing time) | Instant |
| **Advertisements / Trackers** | **None (Zero)** | Heavy Adware / Popups | Minimal |
| **Private Account Support** | **Yes (If you follow the account)** | No | Limited |

---

## 9. Global Multi-Platform Ecosystem

Toystaller was engineered as a modular framework. While this repository represents the **specialized standalone edition for Instagram**, the **Main Global Repository** provides multi-platform capabilities across the entire social web:

- 📷 **Instagram**: Reels, Stories, High-Res Posts, Profile Avatars, DMs.
- 💼 **LinkedIn**: Uncompressed Document Images, Native Video Streams.
- 📘 **Facebook**: Mobile & Desktop Progressive Video Extraction, High-Res Photos.
- 💬 **WhatsApp Web**: Full-Resolution Media Attachments & Voice Notes.

👉 **Explore the Main Project:** [https://github.com/SudiptaSanki/Toystaller](https://github.com/SudiptaSanki/Toystaller)

---

<div align="center">
<b>Toystaller Architecture Documentation</b> • Maintained by <a href="https://github.com/SudiptaSanki">Sudipta Sanki</a>
</div>
