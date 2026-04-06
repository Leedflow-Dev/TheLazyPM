# TheLazyPM — Development Rules

## Architecture

- Chrome Extension (Manifest V3) with: content script (`content/content.js`), service worker (`background/service-worker.js`), popup (`popup/`)
- Service worker is the single source of truth for session data (screenshots, transcripts, meta)
- Content script communicates with service worker via `chrome.runtime.sendMessage`
- IndexedDB (`TheLazyPM` DB) persists active session; `chrome.storage.local` persists settings + session history metadata

## Critical Conventions

### Screenshot references
- Screenshot references in markdown MUST use the format `[📷 SS-n]` (with camera emoji)
- The Notion parser regex is `\[📷\s*SS-(\d+)\]` — any code generating markdown with screenshot refs must match this pattern
- This applies to: AI-generated docs, skip-AI local docs (`buildLocalDoc`), and any future doc generators

### Session data flow
- Screenshots are too large for `chrome.storage.local` — they live in IndexedDB only
- Session history in `chrome.storage.local` stores metadata + transcripts, NOT screenshot blobs
- Archived session screenshots go in the `sessionScreenshots` IndexedDB store (keyed by `[sessionId, index]`)
- When loading a session, content script must fetch screenshots via `GET_SCREENSHOTS` message (not from the session object)

### Duplicate save prevention
- `sessionSaved` flag tracks whether current session was already saved
- `startNewSession()` checks this flag before auto-saving — prevents duplicate history entries
- Flag resets on new session and session load

### Notion integration
- Notion File Upload API is a 2-step process: create upload object, then send blob
- `uploadScreenshotsToNotion()` runs BEFORE markdown→blocks conversion
- `addLineWithInlineImages()` splits text on `[📷 SS-n]` and inserts Notion image blocks
- If screenshot upload fails, falls back to callout blocks

### Doc invalidation
- Any change to session content (add/edit/delete note, add/delete screenshot) MUST call `invalidateDoc()` to reset `hasGeneratedDoc`
- This ensures the "Generate Document" button re-appears instead of showing stale "View Document"
- `invalidateDoc()` also syncs meta to the service worker

### Session deletion
- `deleteSession()` checks `sessionMeta.loadedId` to detect if the deleted session is currently active
- If active: clears in-memory state + IndexedDB, returns `{ wasActive: true }`
- Popup broadcasts `SESSION_CLEARED` to content script, which resets the widget to empty state

### Skip-AI local doc (`buildLocalDoc`)
- Must NOT include timestamps in the output — just the text and screenshot refs
- Screenshot refs use `[📷 SS-n]` format (matches Notion parser)

### Widget visibility
- `showSessionView()`, `showDocView()`, `showLoadingState()` must hide/show the note bar (`lpm-note-bar`) along with other elements
- New UI elements added to the panel must be toggled in all three view-switch functions
