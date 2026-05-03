# Contributing to The Lazy PM

Thanks for your interest in contributing! This is a small project and contributions of any size are welcome — bug fixes, features, docs, or just reporting issues you run into.

## Local Development

There is no build step. The extension runs directly from source.

1. Clone the repo: `git clone https://github.com/Leedflow-Dev/TheLazyPM.git`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked** → select the cloned folder
5. After editing source files, click the reload icon on the extension card in `chrome://extensions`. Content script changes also require reloading any tabs where the widget is already injected.

## Project Layout

See [README.md](README.md#project-structure) for the file tree. The short version:

- `background/service-worker.js` — session state, API calls, IndexedDB
- `content/content.js` — widget UI (Shadow DOM), screen capture, recording
- `popup/` — settings UI
- `libs/jszip.min.js` — vendored ZIP library

## Conventions

**Read [CLAUDE.md](CLAUDE.md) before making non-trivial changes.** It documents critical conventions — screenshot reference format, `safeSendMessage` wrapper, doc invalidation flow, session data boundaries — that aren't obvious from the code alone. Violating these will break features in subtle ways.

## Testing Changes

There is no automated test suite. Before opening a PR, please manually verify the golden path:

1. Start a new session
2. Capture a screenshot and annotate it
3. Record a short voice note (Groq key required)
4. Add a text note
5. Generate a doc (OpenRouter key required) — or use **Skip AI**
6. Push to Notion (if you touched Notion code)
7. Reload the extension and confirm session history persists

If your change touches a specific area, include the manual test steps in your PR description.

## Pull Requests

**Feel free to open a pull request** — for bug fixes, features, docs, or even small tweaks. No PR is too small. If you're unsure whether something fits, open a draft PR or an issue first to discuss.

- Keep PRs focused on one concern
- Reference the related issue if there is one
- Describe what you changed and how you tested it
- If you changed UI, include a before/after screenshot

## Reporting Issues

Use the GitHub issue templates. Include:
- Chrome version
- Extension version (from `manifest.json`)
- Steps to reproduce
- Expected vs. actual behavior
- Console logs (from the page and from the service worker — `chrome://extensions` → **service worker** link)
