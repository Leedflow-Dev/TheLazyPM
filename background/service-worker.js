// The Lazy PM — Background Service Worker
try { importScripts('../libs/jszip.min.js'); } catch (e) { console.error('JSZip load failed:', e); }

// ── Session state (in-memory, synced to IndexedDB) ──
const sessionScreenshots = [];
let sessionTranscripts = [];
let sessionMeta = { name: 'Untitled Session', markdown: '', hasDoc: false };

// ── IndexedDB for persistence ──
const DB_NAME = 'TheLazyPM';
const DB_VERSION = 3;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('screenshots')) {
        db.createObjectStore('screenshots', { keyPath: 'index' });
      }
      if (!db.objectStoreNames.contains('transcripts')) {
        db.createObjectStore('transcripts', { keyPath: 'index' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('sessionScreenshots')) {
        const ssStore = db.createObjectStore('sessionScreenshots', { keyPath: ['sessionId', 'index'] });
        ssStore.createIndex('bySession', 'sessionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistSessionScreenshots(sessionId, screenshotsArray) {
  try {
    const db = await openDB();
    const tx = db.transaction('sessionScreenshots', 'readwrite');
    const store = tx.objectStore('sessionScreenshots');
    screenshotsArray.forEach((ss, i) => {
      store.put({ sessionId, index: i, ...ss });
    });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  } catch (e) { console.error('[TheLazyPM] persistSessionScreenshots failed:', e); }
}

async function getSessionScreenshots(sessionId) {
  try {
    const db = await openDB();
    const tx = db.transaction('sessionScreenshots', 'readonly');
    const store = tx.objectStore('sessionScreenshots');
    const idx = store.index('bySession');
    const req = idx.getAll(sessionId);
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const items = req.result.sort((a, b) => a.index - b.index);
        resolve(items.map(({ sessionId: _sid, index: _idx, ...ss }) => ss));
      };
      req.onerror = () => resolve([]);
    });
  } catch (e) { console.error('[TheLazyPM] getSessionScreenshots failed:', e); return []; }
}

async function deleteSessionScreenshots(sessionId) {
  try {
    const db = await openDB();
    const tx = db.transaction('sessionScreenshots', 'readwrite');
    const store = tx.objectStore('sessionScreenshots');
    const idx = store.index('bySession');
    const req = idx.getAllKeys(sessionId);
    await new Promise((resolve) => {
      req.onsuccess = () => {
        req.result.forEach((key) => store.delete(key));
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch (e) { console.error('[TheLazyPM] deleteSessionScreenshots failed:', e); }
}

async function persistScreenshots() {
  try {
    const db = await openDB();
    const tx = db.transaction('screenshots', 'readwrite');
    const store = tx.objectStore('screenshots');
    store.clear();
    sessionScreenshots.forEach((ss, i) => {
      store.put({ index: i, ...ss });
    });
  } catch (e) { console.error('[TheLazyPM] IndexedDB persist screenshots failed:', e); }
}

async function persistTranscripts() {
  try {
    const db = await openDB();
    const tx = db.transaction('transcripts', 'readwrite');
    const store = tx.objectStore('transcripts');
    store.clear();
    sessionTranscripts.forEach((tr, i) => {
      store.put({ index: i, ...tr });
    });
  } catch (e) { console.error('[TheLazyPM] IndexedDB persist transcripts failed:', e); }
}

async function restoreFromDB() {
  try {
    const db = await openDB();

    // Restore screenshots
    const ssTx = db.transaction('screenshots', 'readonly');
    const ssStore = ssTx.objectStore('screenshots');
    const ssReq = ssStore.getAll();
    await new Promise((resolve) => {
      ssReq.onsuccess = () => {
        const items = ssReq.result.sort((a, b) => a.index - b.index);
        sessionScreenshots.length = 0;
        items.forEach((item) => {
          const { index: _idx, ...ss } = item;
          sessionScreenshots.push(ss);
        });
        resolve();
      };
    });

    // Restore transcripts
    const trTx = db.transaction('transcripts', 'readonly');
    const trStore = trTx.objectStore('transcripts');
    const trReq = trStore.getAll();
    await new Promise((resolve) => {
      trReq.onsuccess = () => {
        const items = trReq.result.sort((a, b) => a.index - b.index);
        sessionTranscripts = items.map((item) => {
          const { index: _idx, ...tr } = item;
          return tr;
        });
        resolve();
      };
    });

    // Restore meta
    const metaTx = db.transaction('meta', 'readonly');
    const metaStore = metaTx.objectStore('meta');
    const metaReq = metaStore.getAll();
    await new Promise((resolve) => {
      metaReq.onsuccess = () => {
        metaReq.result.forEach((item) => {
          if (item.key === 'session') {
            sessionMeta = { ...sessionMeta, ...item.value };
          }
        });
        resolve();
      };
    });

    console.log(`[TheLazyPM] Restored ${sessionScreenshots.length} screenshots, ${sessionTranscripts.length} transcripts, meta: "${sessionMeta.name}" from IndexedDB`);
  } catch (e) { console.error('[TheLazyPM] IndexedDB restore failed:', e); }
}

async function persistMeta() {
  try {
    const db = await openDB();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key: 'session', value: sessionMeta });
  } catch (e) { console.error('[TheLazyPM] IndexedDB persist meta failed:', e); }
}

function touchLastActive() {
  sessionMeta.lastActiveAt = Date.now();
  persistMeta();
}

async function clearDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(['screenshots', 'transcripts', 'meta'], 'readwrite');
    tx.objectStore('screenshots').clear();
    tx.objectStore('transcripts').clear();
    tx.objectStore('meta').clear();
  } catch (e) { console.error('[TheLazyPM] IndexedDB clear failed:', e); }
}

// Restore on startup
restoreFromDB();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    // ── Screenshots ──
    case 'CAPTURE_SCREENSHOT':
      captureScreenshot()
        .then((dataUrl) => sendResponse({ success: true, dataUrl }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'ADD_SCREENSHOT': {
      sessionScreenshots.push({
        dataUrl: message.dataUrl,
        timestamp: message.timestamp || Date.now(),
        url: message.url || '',
        annotatedUrl: null,
      });
      persistScreenshots();
      touchLastActive();
      broadcastToTabs({ type: 'SESSION_DATA_UPDATED' });
      sendResponse({ success: true, index: sessionScreenshots.length - 1 });
      return false;
    }

    case 'GET_SCREENSHOTS':
      sendResponse({ success: true, screenshots: sessionScreenshots });
      return false;

    case 'DELETE_SCREENSHOT': {
      const idx = message.index;
      if (idx >= 0 && idx < sessionScreenshots.length) {
        sessionScreenshots.splice(idx, 1);
        persistScreenshots();
        broadcastToTabs({ type: 'SESSION_DATA_UPDATED' });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Invalid index' });
      }
      return false;
    }

    case 'UPDATE_SCREENSHOT': {
      const i = message.index;
      if (i >= 0 && i < sessionScreenshots.length) {
        if (message.annotatedUrl !== undefined) {
          sessionScreenshots[i].annotatedUrl = message.annotatedUrl;
          persistScreenshots();
          touchLastActive();
        }
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Invalid index' });
      }
      return false;
    }

    case 'CLEAR_SCREENSHOTS':
      sessionScreenshots.length = 0;
      persistScreenshots();
      sendResponse({ success: true });
      return false;

    case 'GENERATE_ZIP':
      generateZip()
        .then((zipDataUrl) => sendResponse({ success: true, zipDataUrl }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    // ── AI Doc Generation ──
    case 'GENERATE_DOC':
      generateDoc()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'REFINE_DOC':
      refineDoc(message.currentMarkdown, message.refinement)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    // ── Transcription ──
    case 'TRANSCRIBE_AUDIO':
      transcribeAudio(message.audioData, message.duration, message.recordingStartTime)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'STOP_RECORDING_REQUEST':
      broadcastToTabs({ type: 'STOP_RECORDING_REQUEST' });
      sendResponse({ success: true });
      return false;

    case 'GET_RECORDING_STATE':
      sendResponse({ isRecording: sessionMeta.isRecording || false, startTime: sessionMeta.recordingStartTime || 0 });
      return false;

    case 'ADD_NOTE': {
      const note = {
        text: message.text || '',
        timestamp: Date.now(),
        duration: 0,
        segments: [],
      };
      sessionTranscripts.push(note);
      touchLastActive();
      persistTranscripts().then(() => {
        broadcastToTabs({ type: 'SESSION_DATA_UPDATED' });
        sendResponse({ success: true, transcript: note });
      });
      return true;
    }

    case 'GET_TRANSCRIPTS':
      sendResponse({ success: true, transcripts: sessionTranscripts });
      return false;

    case 'UPDATE_TRANSCRIPT': {
      const ti = message.index;
      if (ti >= 0 && ti < sessionTranscripts.length && message.text !== undefined) {
        sessionTranscripts[ti].text = message.text;
        persistTranscripts();
        touchLastActive();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Invalid index' });
      }
      return false;
    }

    case 'DELETE_TRANSCRIPT': {
      const di = message.index;
      if (di >= 0 && di < sessionTranscripts.length) {
        sessionTranscripts.splice(di, 1);
        persistTranscripts();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Invalid index' });
      }
      return false;
    }

    // ── Notion ──
    case 'NOTION_SEARCH_PAGES':
      notionSearchPages(message.query)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'NOTION_PUSH':
      notionPush(message.pageId, message.markdown, message.title)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'NOTION_CREATE_PAGE':
      notionCreatePage(message.parentId, message.title, message.markdown)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    // ── Session History ──
    case 'SAVE_SESSION':
      saveSession(message.name, message.markdown)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_SESSIONS':
      getSessions()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'DELETE_SESSION':
      deleteSession(message.id)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'LOAD_SESSION':
      loadSession(message.id)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'NEW_SESSION':
      sessionScreenshots.length = 0;
      sessionTranscripts = [];
      sessionMeta = { name: 'Untitled Session', markdown: '', hasDoc: false };
      clearDB();
      sendResponse({ success: true });
      return false;

    case 'GET_SESSION_META':
      sendResponse({ success: true, meta: sessionMeta });
      return false;

    case 'UPDATE_SESSION_META':
      if (message.meta) {
        Object.assign(sessionMeta, message.meta);
        persistMeta();
      }
      sendResponse({ success: true });
      return false;

    default:
      sendResponse({ status: 'unknown_message_type' });
      return false;
  }
});

// ── Keyboard shortcuts ──
chrome.commands.onCommand.addListener((command) => {
  if (command === 'take-screenshot') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        captureScreenshot().then((dataUrl) => {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'SCREENSHOT_TAKEN', dataUrl, timestamp: Date.now(), url: tabs[0].url,
          });
        });
      }
    });
  } else if (command === 'toggle-recording') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_RECORDING' });
      }
    });
  }
});

// ── Screenshot capture ──
async function captureScreenshot() {
  return await chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 });
}

// ── Transcription via Groq Whisper ──
async function transcribeAudio(audioDataUrl, duration, recordingStartTime) {
  const result = await chrome.storage.local.get('settings');
  const groqKey = result.settings?.groqKey;
  if (!groqKey) {
    return { success: false, error: 'Groq API key not set. Add it in extension settings.' };
  }

  const response = await fetch(audioDataUrl);
  const audioBlob = await response.blob();

  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json');
  formData.append('language', 'en');

  const apiResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${groqKey}` },
    body: formData,
  });

  if (!apiResp.ok) {
    const errText = await apiResp.text();
    return { success: false, error: `Groq API error: ${apiResp.status} — ${errText}` };
  }

  const data = await apiResp.json();
  const entry = {
    text: data.text || '',
    timestamp: recordingStartTime || Date.now(),
    duration,
    segments: data.segments || [],
  };
  sessionTranscripts.push(entry);
  await persistTranscripts();
  touchLastActive();
  broadcastToTabs({ type: 'SESSION_DATA_UPDATED' });

  return { success: true, transcript: entry, index: sessionTranscripts.length - 1 };
}

// ── Broadcast to all tabs ──
function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    });
  });
}

// ── Keep SW alive during long operations ──
function keepAlive() {
  const interval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000); // ping every 20s to prevent idle
  return () => clearInterval(interval);
}

// ── AI Doc Generation ──
async function generateDoc() {
  if (sessionTranscripts.length === 0 && sessionScreenshots.length === 0) {
    return { success: false, error: 'Nothing to generate — add notes or screenshots first' };
  }
  const stopKeepAlive = keepAlive();
  const result = await chrome.storage.local.get('settings');
  const settings = result.settings || {};
  const apiKey = settings.openrouterKey;
  if (!apiKey) {
    stopKeepAlive();
    return { success: false, error: 'OpenRouter API key not set. Add it in extension settings.' };
  }

  const model = settings.model || 'google/gemini-2.0-flash-001';
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage();

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  try {
    const apiResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'chrome-extension://thelazypm',
        'X-Title': 'The Lazy PM',
      },
      body: JSON.stringify({ model, messages, max_tokens: 4096 }),
    });

    if (!apiResp.ok) {
      const errText = await apiResp.text();
      stopKeepAlive();
      return { success: false, error: `OpenRouter error: ${apiResp.status} — ${errText}` };
    }

    const data = await apiResp.json();
    let markdown = data.choices?.[0]?.message?.content || '';
    if (!markdown) {
      stopKeepAlive();
      return { success: false, error: 'AI returned empty response' };
    }

    // Append footer
    markdown = markdown.trimEnd() + '\n\n---\n*lazily generated by The Lazy PM*';

    stopKeepAlive();
    return { success: true, markdown };
  } catch (err) {
    stopKeepAlive();
    return { success: false, error: err.message || 'Network error' };
  }
}

function buildSystemPrompt() {
  const hasTranscript = sessionTranscripts.length > 0;
  const tuning = hasTranscript
    ? 'Transcript is the primary source of truth.'
    : 'Only screenshots are available — be conservative, flag gaps with [NEEDS INPUT].';

  return `You are a senior product manager AI. You receive raw session data from a browser recording session.

Your job: read the session content and decide the best document format yourself. Match the complexity of your output to the complexity of the input.

- If the session is a quick note or simple feedback → produce a short, clean summary. A few bullet points may be enough.
- If the session describes a bug → produce a concise bug report (steps to reproduce, expected vs actual, severity).
- If the session is a feature discussion → produce a lightweight PRD with only the sections that have substance.
- If it's a meeting or sync → produce meeting notes with decisions and action items.
- If it's design feedback with screenshots → organize feedback by screen/component with SS-n references.

## Rules
- Be minimal. Do NOT pad the document with empty sections or boilerplate. If a section has no content from the session, omit it entirely.
- Don't invent details — say [NEEDS INPUT] when something is unclear.
- IMPORTANT: Place screenshot references using exactly this format: [📷 SS-1], [📷 SS-2], etc. Place them inline in the document at the position where they provide visual context, based on their timestamp relative to the transcript. Every screenshot from the session MUST appear at least once in the output.
- If tasks are mentioned, just have them as bullet points what needs to be done.
- Bug fixes → P0, Features → P1, Polish → P2 (only if priorities are relevant).
- ${tuning}
- Crisp language, Markdown only.`;
}

function buildUserMessage() {
  const parts = [];

  // Session metadata
  const totalDuration = sessionTranscripts.reduce((s, t) => s + (t.duration || 0), 0);
  const urls = [...new Set(sessionScreenshots.map((s) => s.url).filter(Boolean))];
  parts.push(`## Recording Session
Duration: ${totalDuration}s | URLs visited: ${urls.join(', ') || 'N/A'} | Screenshots: ${sessionScreenshots.length}`);

  // Build unified timeline — interleave transcripts and screenshots by timestamp
  const timeline = [];

  sessionTranscripts.forEach((tr) => {
    if (tr.segments && tr.segments.length > 0) {
      // Use Whisper's timestamped segments for fine-grained interleaving
      tr.segments.forEach((seg) => {
        timeline.push({
          timestamp: tr.timestamp + (seg.start * 1000),
          type: 'transcript',
          text: seg.text.trim(),
        });
      });
    } else {
      // Fallback: one block
      timeline.push({ timestamp: tr.timestamp, type: 'transcript', text: tr.text });
    }
  });

  sessionScreenshots.forEach((ss, i) => {
    let shortUrl = 'N/A';
    try {
      if (ss.url) {
        const u = new URL(ss.url);
        shortUrl = u.hostname + u.pathname.slice(0, 40);
      }
    } catch (e) {
      shortUrl = ss.url?.slice(0, 50) || 'N/A';
    }
    timeline.push({
      timestamp: ss.timestamp,
      type: 'screenshot',
      index: i + 1,
      url: shortUrl,
    });
  });

  // Sort by timestamp
  timeline.sort((a, b) => a.timestamp - b.timestamp);

  if (timeline.length > 0) {
    parts.push('## Session Timeline');
    timeline.forEach((item) => {
      const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (item.type === 'transcript') {
        const dur = item.duration ? ` (${item.duration}s)` : '';
        parts.push(`[${time}]${dur} 🎙️: ${item.text}`);
      } else {
        parts.push(`[${time}] 📷 SS-${item.index} (${item.url})`);
      }
    });
  }

  parts.push(`---
Convert this session into a clean, actionable document.
Place screenshot references (e.g. [📷 SS-1]) inline at the relevant position in the document where they provide visual context.`);

  return parts.join('\n\n');
}

// ── Refine existing doc ──
async function refineDoc(currentMarkdown, refinement) {
  const result = await chrome.storage.local.get('settings');
  const settings = result.settings || {};
  const apiKey = settings.openrouterKey;
  if (!apiKey) {
    return { success: false, error: 'OpenRouter API key not set.' };
  }

  const model = settings.model || 'google/gemini-2.0-flash-001';

  const messages = [
    {
      role: 'system',
      content: `You are a document editor AI. The user has a generated document and wants to refine it. Apply the requested changes while preserving the overall structure and any screenshot references ([📷 SS-n]). Output the full updated document in Markdown.`,
    },
    {
      role: 'user',
      content: `Here is the current document:\n\n${currentMarkdown}\n\n---\n\nPlease apply this change: ${refinement}`,
    },
  ];

  const apiResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'chrome-extension://thelazypm',
      'X-Title': 'The Lazy PM',
    },
    body: JSON.stringify({ model, messages, max_tokens: 4096 }),
  });

  if (!apiResp.ok) {
    const errBody = await apiResp.text();
    return { success: false, error: `OpenRouter error: ${apiResp.status} — ${errBody}` };
  }

  const data = await apiResp.json();
  const markdown = data.choices?.[0]?.message?.content || '';
  if (!markdown) {
    return { success: false, error: 'AI returned empty response' };
  }

  return { success: true, markdown };
}

// ── ZIP generation ──
async function generateZip() {
  const zip = new JSZip();
  sessionScreenshots.forEach((ss, i) => {
    const data = (ss.annotatedUrl || ss.dataUrl).split(',')[1];
    zip.file(`lazypm-ss-${i + 1}.png`, data, { base64: true });
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  // Convert blob to data URL to pass via message
  const reader = new FileReader();
  return new Promise((resolve) => {
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// ── Notion Integration ──
async function getNotionToken() {
  const result = await chrome.storage.local.get('settings');
  return result.settings?.notionToken;
}

async function notionSearchPages(query) {
  const token = await getNotionToken();
  if (!token) return { success: false, error: 'Notion token not set. Add it in extension settings.' };

  const resp = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: query || '',
      filter: { value: 'page', property: 'object' },
      page_size: 10,
    }),
  });

  if (!resp.ok) {
    return { success: false, error: `Notion error: ${resp.status}` };
  }

  const data = await resp.json();
  const pages = (data.results || []).map((p) => ({
    id: p.id,
    title: p.properties?.title?.title?.[0]?.plain_text
      || p.properties?.Name?.title?.[0]?.plain_text
      || 'Untitled',
    icon: p.icon?.emoji || '📄',
  }));

  return { success: true, pages };
}

async function notionPush(pageId, markdown, _title) {
  const token = await getNotionToken();
  if (!token) return { success: false, error: 'Notion token not set.' };

  // Upload screenshots and get file_upload IDs
  const fileUploadIds = await uploadScreenshotsToNotion(token);
  const blocks = markdownToNotionBlocks(markdown, fileUploadIds);

  await appendNotionBlocks(token, pageId, blocks);

  const cleanId = pageId.replace(/-/g, '');
  return { success: true, url: `https://notion.so/${cleanId}` };
}

async function notionCreatePage(parentId, title, markdown) {
  const stopKeepAlive = keepAlive(); // keep SW alive during multi-step upload
  const token = await getNotionToken();
  if (!token) { stopKeepAlive(); return { success: false, error: 'Notion token not set.' }; }

  // Try to upload screenshots (may fail on free plans or older integrations)
  let fileUploadIds = {};
  try {
    fileUploadIds = await uploadScreenshotsToNotion(token);
  } catch (e) {
    console.warn('[TheLazyPM] Screenshot upload to Notion failed, continuing without images:', e);
  }

  const blocks = markdownToNotionBlocks(markdown, fileUploadIds);

  const resp = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentId },
      properties: { title: { title: [{ text: { content: title || 'Untitled' } }] } },
      children: blocks.slice(0, 100),
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    stopKeepAlive();
    return { success: false, error: `Notion create error: ${resp.status} — ${errText}` };
  }

  const data = await resp.json();
  const pageId = data.id;
  if (blocks.length > 100) {
    await appendNotionBlocks(token, pageId, blocks.slice(100));
  }

  stopKeepAlive();
  const cleanId = pageId.replace(/-/g, '');
  return { success: true, url: data.url || `https://notion.so/${cleanId}`, pageId };
}

// Upload screenshots to Notion via File Upload API (private, stays in workspace)
// Returns { 1: fileUploadId, 2: fileUploadId, ... }
async function uploadScreenshotsToNotion(token) {
  const fileUploadIds = {};
  let uploaded = 0;
  const total = sessionScreenshots.length;
  const NOTION_VER = '2026-03-11';

  for (let i = 0; i < total; i++) {
    const ss = sessionScreenshots[i];
    const dataUrl = ss.annotatedUrl || ss.dataUrl;
    if (!dataUrl) continue;

    try {
      // Step 1: Create file upload object
      const createResp = await fetch('https://api.notion.com/v1/file_uploads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': NOTION_VER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'single_part',
          filename: `screenshot-ss-${i + 1}.png`,
          content_type: 'image/png',
        }),
      });

      if (!createResp.ok) {
        const errText = await createResp.text();
        console.warn(`[TheLazyPM] Notion file upload create failed for SS-${i + 1}: ${createResp.status} — ${errText}`);
        continue;
      }

      const createData = await createResp.json();
      const fileUploadId = createData.id;

      // Step 2: Send file content
      const blobResp = await fetch(dataUrl);
      const blob = await blobResp.blob();

      const formData = new FormData();
      formData.append('file', blob, `screenshot-ss-${i + 1}.png`);

      const sendResp = await fetch(`https://api.notion.com/v1/file_uploads/${fileUploadId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': NOTION_VER,
        },
        body: formData,
      });

      if (sendResp.ok) {
        fileUploadIds[i + 1] = fileUploadId;
        uploaded++;
        console.log(`[TheLazyPM] Uploaded SS-${i + 1} to Notion`);
      } else {
        const errText = await sendResp.text();
        console.warn(`[TheLazyPM] Notion file send failed for SS-${i + 1}: ${sendResp.status} — ${errText}`);
      }

      // Small delay between uploads to avoid Notion rate limits
      if (i < total - 1) await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.warn(`[TheLazyPM] Failed to upload SS-${i + 1}:`, e.message);
    }
  }

  if (total > 0) {
    console.log(`[TheLazyPM] Uploaded ${uploaded}/${total} screenshots to Notion`);
  }
  return fileUploadIds;
}

async function appendNotionBlocks(token, pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 100) {
    const batch = blocks.slice(i, i + 100);
    const resp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2026-03-11',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ children: batch }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Notion append error: ${resp.status} — ${errText}`);
    }
  }
}

function markdownToNotionBlocks(md, fileUploadIds) {
  const blocks = [];
  const lines = md.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) continue;

    // Headings
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) { blocks.push(notionBlock('heading_3', h3[1])); continue; }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) { blocks.push(notionBlock('heading_2', h2[1])); continue; }
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) { blocks.push(notionBlock('heading_1', h1[1])); continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { blocks.push({ object: 'block', type: 'divider', divider: {} }); continue; }

    // Bullet list
    const bullet = line.match(/^[\-\*]\s+(.+)/);
    if (bullet) {
      // Check if bullet contains a screenshot reference
      addLineWithInlineImages(blocks, 'bulleted_list_item', bullet[1], fileUploadIds);
      continue;
    }

    // Checkbox
    const check = line.match(/^-\s+\[([ x])\]\s+(.+)/i);
    if (check) {
      blocks.push({
        object: 'block', type: 'to_do',
        to_do: { rich_text: parseRichText(check[2]), checked: check[1].toLowerCase() === 'x' },
      });
      continue;
    }

    // Blockquote
    const bq = line.match(/^>\s+(.+)/);
    if (bq) { blocks.push(notionBlock('quote', bq[1])); continue; }

    // Table row
    if (line.trim().startsWith('|')) {
      const cells = line.split('|').filter(Boolean).map((c) => c.trim());
      if (!cells.every((c) => /^[\-:]+$/.test(c))) {
        blocks.push(notionBlock('paragraph', cells.join(' | ')));
      }
      continue;
    }

    // Default: paragraph — check for screenshot references inline
    addLineWithInlineImages(blocks, 'paragraph', line, fileUploadIds);
  }

  return blocks;
}

// Split a line on [📷 SS-n] references, emit text blocks + image blocks
function addLineWithInlineImages(blocks, blockType, text, fileUploadIds) {
  const ssPattern = /\[📷\s*SS-(\d+)\]/g;
  let match;
  let lastIdx = 0;
  let hasImages = false;

  while ((match = ssPattern.exec(text)) !== null) {
    const ssNum = parseInt(match[1]);
    const fileId = fileUploadIds?.[ssNum];

    // Text before the screenshot reference
    const before = text.slice(lastIdx, match.index).trim();
    if (before) {
      blocks.push(notionBlock(blockType, before));
    }

    // Image block (Notion file upload) or fallback callout
    if (fileId) {
      blocks.push({
        object: 'block',
        type: 'image',
        image: { type: 'file_upload', file_upload: { id: fileId } },
      });
    } else {
      blocks.push(notionBlock('callout', `📷 SS-${ssNum}`, '📷'));
    }

    lastIdx = ssPattern.lastIndex;
    hasImages = true;
  }

  if (!hasImages) {
    // No screenshot references — plain block
    blocks.push(notionBlock(blockType, text));
  } else {
    // Remaining text after last screenshot
    const after = text.slice(lastIdx).trim();
    if (after) {
      blocks.push(notionBlock(blockType, after));
    }
  }
}

function notionBlock(type, text, emoji) {
  const block = { object: 'block', type };
  if (type === 'callout') {
    block.callout = { rich_text: parseRichText(text), icon: { type: 'emoji', emoji: emoji || '💡' } };
  } else {
    block[type] = { rich_text: parseRichText(text) };
  }
  return block;
}

function parseRichText(text) {
  const parts = [];
  // Simple: split on bold markers
  const regex = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', text: { content: text.slice(last, match.index) } });
    }
    parts.push({ type: 'text', text: { content: match[1] }, annotations: { bold: true } });
    last = regex.lastIndex;
  }
  if (last < text.length) {
    parts.push({ type: 'text', text: { content: text.slice(last) } });
  }
  if (parts.length === 0) {
    parts.push({ type: 'text', text: { content: text } });
  }
  return parts;
}

// ── Session History ──
async function saveSession(name, markdown) {
  const result = await chrome.storage.local.get('sessionHistory');
  const history = result.sessionHistory || [];

  const session = {
    id: Date.now().toString(),
    name: name || 'Untitled Session',
    createdAt: Date.now(),
    markdown: markdown || '',
    transcriptCount: sessionTranscripts.length,
    screenshotCount: sessionScreenshots.length,
    urls: [...new Set(sessionScreenshots.map((s) => s.url).filter(Boolean))],
    transcripts: sessionTranscripts.map((t) => ({ text: t.text, timestamp: t.timestamp, duration: t.duration })),
    // Screenshot data stored in IndexedDB (too large for chrome.storage.local)
  };

  if (sessionScreenshots.length > 0) {
    await persistSessionScreenshots(session.id, sessionScreenshots);
  }

  history.unshift(session);
  // FIFO — keep max 20, clean up evicted sessions' screenshots
  if (history.length > 20) {
    const evicted = history.splice(20);
    for (const old of evicted) {
      await deleteSessionScreenshots(old.id);
    }
  }

  await chrome.storage.local.set({ sessionHistory: history });
  return { success: true, id: session.id };
}

async function getSessions() {
  const result = await chrome.storage.local.get('sessionHistory');
  return { success: true, sessions: result.sessionHistory || [] };
}

async function deleteSession(id) {
  const result = await chrome.storage.local.get('sessionHistory');
  const history = (result.sessionHistory || []).filter((s) => s.id !== id);
  await chrome.storage.local.set({ sessionHistory: history });
  await deleteSessionScreenshots(id);

  // If the deleted session is currently active, clear it
  const wasActive = sessionMeta.loadedId === id;
  if (wasActive) {
    sessionScreenshots.length = 0;
    sessionTranscripts = [];
    sessionMeta = { name: 'Untitled Session', markdown: '', hasDoc: false };
    clearDB();
    broadcastToTabs({ type: 'SESSION_CLEARED' });
  }
  return { success: true, wasActive };
}

async function loadSession(id) {
  const result = await chrome.storage.local.get('sessionHistory');
  const session = (result.sessionHistory || []).find((s) => s.id === id);
  if (!session) return { success: false, error: 'Session not found' };

  // Restore transcripts into service worker state
  sessionTranscripts = (session.transcripts || []).map((t) => ({
    text: t.text, timestamp: t.timestamp, duration: t.duration, segments: [],
  }));

  // Restore screenshots from IndexedDB
  const restoredScreenshots = await getSessionScreenshots(id);
  sessionScreenshots.length = 0;
  restoredScreenshots.forEach((ss) => sessionScreenshots.push(ss));

  sessionMeta = {
    name: session.name || 'Untitled Session',
    markdown: session.markdown || '',
    hasDoc: !!session.markdown,
    loadedId: id,
  };
  persistTranscripts();
  persistScreenshots();
  persistMeta();

  return { success: true, session };
}

console.log('[TheLazyPM] Service worker initialized');
