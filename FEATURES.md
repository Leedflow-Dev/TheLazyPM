# The Lazy PM — Product Spec & Build Plan

Chrome Extension (Manifest V3) — No build step, plain HTML/CSS/JS.

---

## Usability

1. A simple settings page/html to store settings
2. A sleek plugin on screen to record the session, transcribe voice, timestamp screenshots and attach them at the proper place in the text. Toggle to avoid sending screenshots to AI.
3. User can download MD file, push to Notion directly, download just screenshots, or download PDF with images attached.

---

## Build Phases

1. ~~**Install + Settings** — Plugin installs, settings saved via popup page~~ ✅
2. ~~**Widget visibility** — Plugin circle visible on page when on, invisible when off~~ ✅
3. ~~**Screenshots** — Take screenshots, annotate (highlight, rectangle, text, color picker), save & download~~ ✅
4. ~~**Voice transcription** — Voice mode on, transcribe via Groq Whisper API~~ ✅
5. ~~**AI formatting** — Transcript sent to AI (OpenRouter), formatted doc reviewable + editable~~ ✅
6. ~~**PDF export** — Formatted text + screenshots saved as downloadable PDF~~ ⏭️ Skipped (MD download available instead)
7. ~~**Notion push** — Full doc forwarded to Notion~~ ✅
8. ~~**Session history** — Past sessions preserved locally, viewable via settings page~~ ✅

---

## Phase 1: Install + Settings

**Goal**: Extension installs, popup persists settings.

```
TheLazyPM/
├── manifest.json                # MV3, permissions: storage, activeTab
├── popup/
│   ├── popup.html               # Settings page
│   ├── popup.js                 # Save/load via chrome.storage.local
│   └── popup.css
├── background/
│   └── service-worker.js        # Message listener skeleton
├── content/
│   ├── content.js               # Injects widget iframe
│   ├── widget.html              # Widget shell (collapsed FAB)
│   ├── widget.js                # Toggle expand/collapse
│   └── widget.css
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

**Settings**: OpenRouter API key, Groq API key, Notion token, model selection (default: Gemini 2.0 Flash), send-screenshots-to-AI toggle, prompt templates (purpose, constraints, minimal sections).

**Verify**: Load unpacked → popup shows → save settings → reopen → settings persist.

---

## Phase 2: Widget Visibility

**Goal**: Widget FAB on page when enabled, hidden when disabled.

- Content script injects Shadow DOM widget (bottom-right, z-index 2147483647)
- Collapsed: 56px white circle FAB with logo
- Click FAB → expand to 380×520px panel (250ms slide-up)
- Popup toggle → saved to storage → content script respects it

**Verify**: Toggle on → FAB visible → expand/collapse works → toggle off → disappears.

---

## Phase 3: Screenshots + Annotation + Download

**Goal**: Capture, annotate, save, download screenshots.

- `chrome.tabs.captureVisibleTab` for full-page capture
- Thumbnail gallery in widget (scrollable strip)
- Click thumbnail → annotation overlay

**Annotation tools** (`content/annotator.js`):
- Highlight (semi-transparent brush)
- Rectangle outline
- Text labels
- Color picker (red, blue, green, yellow)
- Undo
- Canvas-based, full resolution, device pixel ratio aware

**Download**: Individual PNG or ZIP-all via JSZip.
**Shortcut**: `Ctrl+Shift+S`

**Verify**: Screenshot → thumbnail appears → annotate → save → download ZIP.

---

## Phase 4: Voice Recording + Transcription

**Goal**: Record voice, transcribe via Groq Whisper.

- Offscreen document for MediaRecorder (WebM/Opus)
- Manifest: add `offscreen` permission, host permission `https://api.groq.com/*`
- Widget: mic toggle → pulsing red dot + timer
- On stop → POST to `https://api.groq.com/openai/v1/audio/transcriptions`
- Transcript: editable text block with timestamps

**Shortcut**: `Ctrl+Shift+R`

**Verify**: Click mic → speak → stop → transcript appears → editable.

---

## Phase 5: AI Formatting + Review

**Goal**: Generate formatted doc from session data, review & edit.

- `GENERATE_DOC` handler in service worker
- Builds prompt from: transcript, screenshot timestamps, URL context
- Calls OpenRouter (`POST https://openrouter.ai/api/v1/chat/completions`)
- Respects send-screenshots toggle
- Adaptive doc type detection (see AI Prompt Spec below)
- Prompt templates (purpose/constraints/minimal) injected from settings
- Screenshot placement: AI references SS-1, SS-2 inline; widget renders as thumbnail cards
- Review view: rendered Markdown, editable
- Actions: Copy MD | Download | Regenerate

**Verify**: Session with voice + screenshots → Generate → formatted doc → edit → copy.

---

## Phase 6: PDF Export

**Goal**: Download PDF with text + embedded images.

- Library: html2pdf.bundle.min.js (or jsPDF + html2canvas)
- Renders Markdown output → styled HTML → PDF
- Clean professional styling matching light theme

**Verify**: Generate doc → Download PDF → opens with text + images.

---

## Phase 7: Notion Integration

**Goal**: Push doc to Notion page.

- Markdown-to-Notion-Blocks converter
- Host permission: `https://api.notion.com/*`
- Push to Notion button → search pages (300ms debounce) → select → push
- Screenshots as external image blocks

**Verify**: Generate doc → Push to Notion → search page → select → appears in Notion.

---

## Phase 8: Session History

**Goal**: Past sessions saved locally, viewable/reloadable from settings.

- Store up to 20 sessions in `chrome.storage.local` (FIFO)
- Metadata: duration, comment count, screenshot count, URLs visited
- Screenshots excluded from storage (dataURLs too large)
- Settings page: session list → click to reload

**Verify**: Complete session → appears in history → reload it → data intact.

---

## UI Design System

| Property | Value |
|----------|-------|
| Background | `#ffffff` (card), `#f8f9fa` (page bg) |
| Text | `#1a1a2e` (primary), `#6b7280` (secondary) |
| Accent | `#3b82f6` (blue) |
| Success | `#22c55e` |
| Danger/Recording | `#ef4444` |
| Border | `#e5e7eb` (1px) |
| Border radius | 12-16px (cards), 8px (buttons), 24px (pills) |
| Font | Inter, -apple-system, system-ui, sans-serif |
| Shadow | `0 4px 24px rgba(0,0,0,0.06)` (cards), `0 8px 32px rgba(0,0,0,0.08)` (widget) |
| Spacing | 16px base, 20px card padding, 8px between elements |
| Transitions | 200ms hover, 300ms view changes |
| Widget | FAB: 56px circle → Expanded: 380×520px |
| z-index | 2147483647 |

**UI Principles** (Granola/Markup.io inspired):
- Light, clean theme — white backgrounds, generous whitespace
- Max 2-3 visible actions per view, no clutter
- Large touch targets (44px min), rounded, breathing room
- Widget disappears during use — just a pulsing dot + timer when recording
- Smooth micro-interactions on every click/hover (200-300ms ease)
- Empty states: single-line hint, not blank
- Annotation overlay: floating minimal toolbar, no heavy chrome
- Settings: single-column card layout, grouped logically
- Content-first — UI chrome is secondary

---

## Architecture Decisions

| Decision | Why |
|----------|-----|
| Manifest V3 | Required for modern Chrome extensions |
| No build step | Plain HTML/CSS/JS, fast iteration |
| OpenRouter API | Single endpoint for multiple LLM providers |
| Gemini 2.0 Flash default | Fast and cheap for doc generation |
| Shadow DOM for widget | Prevents page CSS conflicts |
| Offscreen document for audio | Isolates MediaRecorder from service worker |
| In-memory state in service worker | Single source of truth; popup/content are stateless |
| Message passing | Chrome extension best practice |
| chrome.storage.local | Settings, keys, history — not synced to cloud |
| Groq Whisper API | Fast, cheap transcription |
| JSZip (client-side) | No server for ZIP packaging |
| html2pdf.js | Client-side PDF generation |
| Data URLs for screenshots | Simple in-memory; cleared per session |
| 20-session history limit | Respects 10MB storage quota |

---

## AI Prompt Spec

### Adaptive Doc Types

| Session content | Doc type |
|-----------------|----------|
| Bug discussion + screenshots | Bug report (repro steps, severity) |
| Feature walkthrough + comments | Feature spec / PRD |
| Meeting + voice transcript | Meeting notes (decisions, action items) |
| Design review + annotations | Design feedback (visual references) |
| Mixed / scattered | Organized notes by topic |

Detection: keyword-based in `buildAdaptiveSystemPrompt()`.

### System Prompt Structure

```
You are a senior product manager AI. You receive raw session data...
Your job: convert into a clean, actionable {docType}.
{docGuidance — specific to detected type}

## Critical Rules
- Every task ≤1 day for one engineer
- Acceptance criteria must be testable
- Respect frontend/backend tagging
- Bug fixes → P0, Features → P1, Polish → P2
- Don't invent, flag gaps with [NEEDS INPUT]
- Reference screenshots as SS-1, SS-2...
- Crisp language, Markdown only
- Transcript is primary source when available
```

### User Message Template

```
## Recording Session
Duration: {duration}s | URLs visited: {urls} | Screenshots: {count}

## Voice Transcript
{timestamped segments}

## Comments & Annotations
[{timestamp}] ({type}) {text}

## Screenshots Captured
SS-{n}: [{timestamp}] {url} — {comment}

---
Convert this session into a complete, actionable document.
```

### Prompt Tuning

- **With transcript**: Transcript is primary, comments are anchors. Resolve conflicts favoring transcript.
- **Without transcript**: Comments are only signal — be conservative, flag open questions.
- **Thin sessions** (< 3 comments, no transcript): Generate skeleton with `[NEEDS INPUT]` markers.
- **Multi-page sessions**: Organize by page/feature area, create sub-sections.

### AI Rules

1. Infer intelligently — fill gaps but FLAG assumptions
2. Keep actionable — every task doable by one engineer in one day
3. Link comments to screenshots where possible
4. Don't invent — say "needs clarification" over guessing
5. Priority: bugs → P0, features → P1, polish → P2
6. Respect frontend/backend tags; infer from context if untagged
7. Acceptance criteria must be testable ("user can click X and see Y")

---

## PRD Output Template

_template below is only for reference, if a particular section is not there in the transcribed session, remove it. Keep it as minimal and concise as possible_

```markdown
# [Feature/Product Name] — PRD
> Auto-generated by The Lazy PM on [date] | Session: [duration] | [n] screenshots

---

## 1. Context & Problem Statement
[2-3 sentences from recording context]

## 2. Proposed Solution
[1-2 sentences, high-level]

## 3. User Stories
- As a [user], I want [goal] so that [benefit].

## 4. Requirements

### 4.1 Frontend Tasks
| # | Task | Priority | Acceptance Criteria | Screenshot Ref |
|---|------|----------|--------------------|----|
| FE-1 | ... | P0/P1/P2 | [testable] | SS-1 |

### 4.2 Backend Tasks
| # | Task | Priority | Acceptance Criteria | Notes |
|---|------|----------|--------------------|----|
| BE-1 | ... | P0/P1/P2 | [testable] | |

### 4.3 General Tasks
| # | Task | Priority | Owner | Notes |
|---|------|----------|-------|----|
| G-1 | ... | ... | TBD | |

## 5. UI/UX Notes
- **SS-1** ([timestamp]): [shown] → [change needed]

## 6. Technical Considerations
[Architecture, API, DB, performance]

## 7. Out of Scope
[Deferred or ruled out]

## 8. Open Questions
- [ ] [unclear items]

---
*Generated from The Lazy PM session. Review before sharing.*
```

---

## Deferred (post-v1)

- Region-based screenshot selection
- Auto-screenshot timer
- Quick-comment bar (`Ctrl+Shift+C`)
- Comment type auto-detection
- In-browser Whisper (transformers.js) fallback
- Multiple transcription providers
- Dark theme / auto theme toggle

---

## TODO / Known Issues

- [x] ZIP download — fixed (moved to service worker)
- [x] Screenshots/transcripts persistence — IndexedDB storage, survives SW restarts/browser restarts
- [x] Widget panel scroll — textarea scrolls internally, flex layout fixed
- [x] Notion images — screenshots uploaded via Notion File Upload API, rendered inline as image blocks
