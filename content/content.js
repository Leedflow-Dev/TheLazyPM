// The Lazy PM — Content Script (Phase 3: Screenshots + Annotation + Download)

(function () {
  'use strict';

  // ── State ──
  let hostEl = null;
  let shadowRoot = null;
  let screenshots = [];
  let transcripts = [];
  let isRecording = false;
  let recordingTimerInterval = null;
  let sessionName = 'Untitled Session';
  let sessionSaved = false;

  // ── Safe messaging (handles extension context invalidation) ──
  function safeSendMessage(message, callback) {
    try {
      if (!chrome.runtime?.id) {
        removeWidget();
        return;
      }
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[TheLazyPM]', chrome.runtime.lastError.message);
          if (callback) callback(null);
          return;
        }
        if (callback) callback(resp);
      });
    } catch (e) {
      console.warn('[TheLazyPM] Context invalidated, cleaning up');
      removeWidget();
    }
  }

  // ── SVG Icons ──
  const ICONS = {
    camera: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    undo: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    highlight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    rect: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>',
    text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    mic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    micOff: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
    notion: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.56 2.35c-.42-.326-.98-.7-2.055-.607L3.48 2.96c-.466.046-.56.28-.373.466l1.352 1.782zm.793 3.358v13.928c0 .746.373 1.026 1.213.98l14.523-.84c.84-.046.933-.56.933-1.166V6.63c0-.606-.233-.933-.746-.886l-15.177.886c-.56.047-.746.327-.746.933zm14.337.42c.093.42 0 .84-.42.886l-.7.14v10.264c-.606.327-1.166.514-1.633.514-.746 0-.933-.233-1.493-.933l-4.573-7.186v6.953l1.446.327s0 .84-1.166.84l-3.22.187c-.093-.187 0-.653.326-.746l.84-.233V9.854L7.821 9.76c-.093-.42.14-1.026.793-1.073l3.453-.233 4.76 7.28V9.06l-1.213-.14c-.093-.513.28-.886.746-.933l3.22-.187z"/></svg>',
    save: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    sparkle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    expand: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  };

  // ── CSS ──
  const WIDGET_CSS = `
    :host {
      all: initial;
      display: block !important;
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      font-family: Inter, -apple-system, system-ui, sans-serif;
      color: #1a1a2e;
      line-height: 1.4;
      pointer-events: none !important;
    }

    /* ── FAB ── */
    .lpm-fab {
      width: 44px; height: 44px; border-radius: 50%;
      background: #e6e6e6; border: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: transform 200ms ease, box-shadow 200ms ease;
      pointer-events: auto;
    }
    .lpm-fab:hover { transform: scale(1.1); box-shadow: 0 4px 14px rgba(0,0,0,0.2); }
    .lpm-fab:active { transform: scale(0.95); }
    .lpm-fab-icon { width: 38px; height: 38px; user-select: none; pointer-events: none; }

    /* ── Panel ── */
    .lpm-panel {
      width: 340px; height: 520px; position: relative;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.10);
      display: none; flex-direction: column; overflow: hidden;
      transform-origin: bottom right;
      pointer-events: auto;
    }
    .lpm-panel.lpm-visible {
      display: flex; animation: lpm-slide-up 250ms ease forwards;
    }
    @keyframes lpm-slide-up {
      from { opacity: 0; transform: translateY(12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ── Header ── */
    .lpm-header-logo { width: 28px; height: 28px; flex-shrink: 0; margin-right: 4px; }
    .lpm-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid #f0f0f0;
      flex: 0 0 auto;
    }
    .lpm-panel-title { font-size: 13px; font-weight: 600; color: #1a1a2e; }
    .lpm-header-actions { display: flex; gap: 4px; align-items: center; }
    .lpm-icon-btn {
      width: 28px; height: 28px; border-radius: 6px; border: none;
      background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #6b7280; transition: background 150ms ease, color 150ms ease;
    }
    .lpm-icon-btn:hover { background: #f3f4f6; color: #1a1a2e; }
    .lpm-icon-btn.lpm-primary { background: #3b82f6; color: #fff; }
    .lpm-icon-btn.lpm-primary:hover { background: #2563eb; }

    /* ── Body ── */
    .lpm-panel-body { flex: 1 1 0px; overflow-y: auto; padding: 12px 16px; min-height: 0; }
    .lpm-empty-state { text-align: center; color: #9ca3af; font-size: 12px; padding: 40px 0; }
    .lpm-empty-state svg { opacity: 0.3; margin-bottom: 8px; }

    /* ── Screenshot Grid ── */
    .lpm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .lpm-thumb {
      position: relative; border-radius: 8px; overflow: hidden;
      border: 1px solid #e5e7eb; cursor: pointer; aspect-ratio: 16/10;
      transition: box-shadow 150ms ease;
    }
    .lpm-thumb:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .lpm-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .lpm-thumb-overlay {
      position: absolute; inset: 0;
      display: flex; align-items: flex-end; justify-content: flex-end;
      padding: 4px; opacity: 0; transition: opacity 150ms ease;
    }
    .lpm-thumb:hover .lpm-thumb-overlay { opacity: 1; background: rgba(0,0,0,0.05); }
    .lpm-thumb-actions { display: flex; gap: 2px; }
    .lpm-thumb-btn {
      width: 22px; height: 22px; border-radius: 4px; border: none;
      background: rgba(255,255,255,0.9); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #6b7280; font-size: 10px; backdrop-filter: blur(4px);
      transition: background 150ms ease, color 150ms ease;
    }
    .lpm-thumb-btn:hover { background: #fff; color: #1a1a2e; }
    .lpm-thumb-btn.lpm-del:hover { color: #ef4444; }
    .lpm-thumb-idx {
      position: absolute; top: 4px; left: 4px;
      background: rgba(0,0,0,0.5); color: #fff;
      font-size: 9px; font-weight: 600;
      padding: 1px 5px; border-radius: 4px; backdrop-filter: blur(4px);
    }

    /* ── Footer ── */
    .lpm-panel-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px; border-top: 1px solid #f0f0f0; flex: 0 0 auto;
    }
    .lpm-footer-info { font-size: 11px; color: #9ca3af; }
    .lpm-btn-sm {
      padding: 5px 12px; font-size: 11px; font-weight: 500; font-family: inherit;
      border-radius: 6px; border: none; cursor: pointer; transition: background 150ms ease;
    }
    .lpm-btn-ghost { background: transparent; color: #6b7280; }
    .lpm-btn-ghost:hover { background: #f3f4f6; color: #1a1a2e; }

    /* ── Region Selector Overlay ── */
    .lpm-region-overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      cursor: crosshair; user-select: none;
      pointer-events: auto;
    }
    .lpm-region-overlay canvas { display: block; width: 100%; height: 100%; }
    .lpm-region-hint {
      position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.7); color: #fff; padding: 8px 16px;
      border-radius: 8px; font-size: 13px; font-weight: 500;
      backdrop-filter: blur(4px); pointer-events: none;
    }

    /* ── Annotator Overlay ── */
    .lpm-annotator-overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,0.7); display: flex;
      align-items: center; justify-content: center; backdrop-filter: blur(2px);
      pointer-events: auto;
    }
    .lpm-annotator-wrap {
      position: relative; max-width: 90vw; max-height: 85vh;
      border-radius: 8px; overflow: hidden; box-shadow: 0 16px 48px rgba(0,0,0,0.3);
    }
    .lpm-annotator-canvas { display: block; cursor: crosshair; }
    .lpm-ann-toolbar {
      position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 4px; padding: 6px 8px;
      background: rgba(255,255,255,0.95); border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15); backdrop-filter: blur(8px);
    }
    .lpm-ann-btn {
      width: 30px; height: 30px; border-radius: 6px; border: none;
      background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #6b7280; transition: background 150ms ease, color 150ms ease;
    }
    .lpm-ann-btn:hover { background: #f3f4f6; color: #1a1a2e; }
    .lpm-ann-btn.active { background: #3b82f6; color: #fff; }
    .lpm-ann-sep { width: 1px; background: #e5e7eb; margin: 4px 2px; }
    .lpm-ann-color {
      width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent;
      cursor: pointer; transition: border-color 150ms ease, transform 150ms ease;
    }
    .lpm-ann-color:hover { transform: scale(1.15); }
    .lpm-ann-color.active { border-color: #1a1a2e; }
    .lpm-ann-colors { display: flex; gap: 4px; align-items: center; }
    .lpm-ann-btn.lpm-save { background: #22c55e; color: #fff; }
    .lpm-ann-btn.lpm-save:hover { background: #16a34a; }
    .lpm-ann-btn.lpm-cancel { background: transparent; color: #ef4444; }
    .lpm-ann-btn.lpm-cancel:hover { background: #fef2f2; }
    .lpm-text-input {
      position: absolute; background: rgba(255,255,255,0.9);
      border: 1px solid currentColor; border-radius: 4px;
      font-family: Inter, -apple-system, system-ui, sans-serif;
      font-size: 14px; font-weight: 500; outline: none;
      min-width: 80px; padding: 3px 6px; z-index: 10;
    }

    /* ── Recording State ── */
    .lpm-recording-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 16px; background: #fef2f2;
      border-bottom: 1px solid #fecaca; flex: 0 0 auto;
    }
    .lpm-rec-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #ef4444;
      animation: lpm-pulse 1.2s ease-in-out infinite;
    }
    @keyframes lpm-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }
    .lpm-rec-timer { font-size: 12px; font-weight: 600; color: #ef4444; font-variant-numeric: tabular-nums; }
    .lpm-rec-stop {
      margin-left: auto; padding: 4px 10px;
      font-size: 11px; font-weight: 500; font-family: inherit;
      background: #ef4444; color: #fff; border: none; border-radius: 5px;
      cursor: pointer; display: flex; align-items: center; gap: 4px;
      transition: background 150ms ease;
    }
    .lpm-rec-stop:hover { background: #dc2626; }
    .lpm-icon-btn.lpm-recording { background: #ef4444; color: #fff; animation: lpm-pulse 1.2s ease-in-out infinite; }
    .lpm-icon-btn.lpm-recording:hover { background: #dc2626; }

    /* ── Transcripts ── */
    .lpm-transcripts { margin-top: 12px; }
    .lpm-transcript-card {
      background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 8px;
      padding: 10px 12px; margin-bottom: 8px; position: relative;
    }
    .lpm-transcript-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 6px;
    }
    .lpm-transcript-meta {
      font-size: 10px; color: #9ca3af; font-weight: 500;
    }
    .lpm-transcript-actions { display: flex; gap: 2px; }
    .lpm-transcript-text {
      font-size: 12px; color: #1a1a2e; line-height: 1.5;
      border: 1px solid transparent; background: transparent;
      width: 100%; box-sizing: border-box;
      resize: vertical; min-height: 40px; font-family: inherit;
      outline: none; padding: 4px 0;
    }
    .lpm-transcript-text:focus {
      background: #fff; padding: 6px 8px; border-radius: 4px;
      border: 1px solid #3b82f6;
    }
    .lpm-section-label {
      font-size: 10px; font-weight: 600; color: #9ca3af;
      text-transform: uppercase; letter-spacing: 0.5px;
      margin-bottom: 8px; margin-top: 4px;
    }
    .lpm-transcribing {
      display: flex; align-items: center; gap: 8px;
      padding: 12px; color: #6b7280; font-size: 12px;
    }
    .lpm-spinner {
      width: 14px; height: 14px; border: 2px solid #e5e7eb;
      border-top-color: #3b82f6; border-radius: 50%;
      animation: lpm-spin 0.6s linear infinite;
    }
    @keyframes lpm-spin {
      to { transform: rotate(360deg); }
    }

    /* ── Doc Review View ── */
    .lpm-doc-view {
      display: flex; flex-direction: column;
      flex: 1 1 0px; min-height: 0; overflow: hidden;
    }
    .lpm-doc-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; border-bottom: 1px solid #f0f0f0; flex: 0 0 auto;
    }
    .lpm-doc-header-left { display: flex; align-items: center; gap: 8px; }
    .lpm-doc-title { font-size: 12px; font-weight: 600; color: #1a1a2e; }
    .lpm-doc-body {
      flex: 1 1 0px; min-height: 0;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .lpm-doc-content {
      font-size: 12px; line-height: 1.6; color: #1a1a2e;
      width: 100%; flex: 1 1 0px; min-height: 0;
      border: none; background: transparent;
      font-family: inherit; resize: none; outline: none;
      box-sizing: border-box; display: block;
      padding: 12px 16px; overflow-y: auto;
    }
    .lpm-doc-actions {
      display: flex; gap: 4px; padding: 10px 16px;
      border-top: 1px solid #f0f0f0; flex: 0 0 auto;
    }
    .lpm-doc-btn {
      padding: 6px 12px; font-size: 11px; font-weight: 500;
      font-family: inherit; border-radius: 6px; border: none;
      cursor: pointer; display: flex; align-items: center; gap: 4px;
      transition: background 150ms ease;
    }
    .lpm-doc-btn-primary { background: #3b82f6; color: #fff; }
    .lpm-doc-btn-primary:hover { background: #2563eb; }
    .lpm-doc-btn-ghost { background: #f3f4f6; color: #6b7280; }
    .lpm-doc-btn-ghost:hover { background: #e5e7eb; color: #1a1a2e; }
    .lpm-doc-btn-success { background: #22c55e; color: #fff; }
    .lpm-doc-btn-success:hover { background: #16a34a; }
    .lpm-note-bar {
      padding: 6px 16px; border-top: 1px solid #f0f0f0; flex: 0 0 auto;
      display: flex; gap: 4px; align-items: center;
    }
    .lpm-note-input {
      flex: 1; padding: 5px 8px; font-size: 11px; font-family: inherit;
      border: 1px solid #e5e7eb; border-radius: 6px; resize: none;
      outline: none; color: #1a1a2e; background: #fff; height: 28px;
    }
    .lpm-note-input:focus { border-color: #3b82f6; }
    .lpm-note-input::placeholder { color: #9ca3af; }
    .lpm-note-btn {
      width: 28px; height: 28px; padding: 0; font-size: 11px;
      font-family: inherit; border-radius: 6px; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background 150ms ease; flex-shrink: 0;
    }
    .lpm-note-btn-add { background: #3b82f6; color: #fff; }
    .lpm-note-btn-add:hover { background: #2563eb; }
    .lpm-note-btn-expand { background: #f3f4f6; color: #6b7280; }
    .lpm-note-btn-expand:hover { background: #e5e7eb; color: #1a1a2e; }
    .lpm-note-overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,0.5); display: flex;
      align-items: center; justify-content: center;
      pointer-events: auto;
    }
    .lpm-note-modal {
      width: 400px; background: #fff; border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.2); overflow: hidden;
      display: flex; flex-direction: column; max-height: 80vh;
    }
    .lpm-note-modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
    }
    .lpm-note-modal-title { font-size: 13px; font-weight: 600; color: #1a1a2e; }
    .lpm-note-modal-body { padding: 12px 16px; flex: 1; overflow: hidden; display: flex; flex-direction: column; }
    .lpm-note-modal-textarea {
      width: 100%; flex: 1; min-height: 200px; padding: 10px 12px; font-size: 13px;
      font-family: 'SF Mono', Monaco, Consolas, monospace; line-height: 1.5;
      border: 1px solid #e5e7eb; border-radius: 8px; outline: none;
      color: #1a1a2e; background: #f8f9fa; resize: none; box-sizing: border-box;
    }
    .lpm-note-modal-textarea:focus { border-color: #3b82f6; background: #fff; }
    .lpm-note-modal-textarea::placeholder { color: #9ca3af; }
    .lpm-note-modal-hint {
      font-size: 10px; color: #9ca3af; margin-top: 6px;
    }
    .lpm-note-modal-footer {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 10px 16px; border-top: 1px solid #e5e7eb;
    }
    .lpm-note-modal-btn {
      padding: 6px 16px; font-size: 12px; font-weight: 600; font-family: inherit;
      border-radius: 6px; border: none; cursor: pointer; transition: background 150ms ease;
    }
    .lpm-note-modal-cancel { background: #f3f4f6; color: #6b7280; }
    .lpm-note-modal-cancel:hover { background: #e5e7eb; color: #1a1a2e; }
    .lpm-note-modal-save { background: #3b82f6; color: #fff; }
    .lpm-note-modal-save:hover { background: #2563eb; }
    .lpm-generate-bar {
      padding: 10px 16px; border-top: 1px solid #f0f0f0; flex: 0 0 auto;
    }
    .lpm-generate-row {
      display: flex; gap: 8px; align-items: center;
    }
    .lpm-generate-btn {
      flex: 1; padding: 8px; font-size: 12px; font-weight: 600;
      font-family: inherit; border-radius: 8px; border: none;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: #fff;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: opacity 150ms ease;
    }
    .lpm-generate-btn:hover { opacity: 0.9; }
    .lpm-generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .lpm-skip-ai {
      display: flex; align-items: center; gap: 4px; font-size: 10px;
      color: #6b7280; white-space: nowrap; cursor: pointer; user-select: none;
    }
    .lpm-skip-ai input { width: 14px; height: 14px; cursor: pointer; accent-color: #8b5cf6; }
    .lpm-generating {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 16px; color: #6b7280; font-size: 12px;
    }
    .lpm-toast {
      position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
      background: #1a1a2e; color: #fff; padding: 6px 14px;
      border-radius: 6px; font-size: 11px; font-weight: 500;
      opacity: 0; transition: opacity 200ms ease; pointer-events: none;
      z-index: 50;
    }
    .lpm-toast.lpm-toast-show { opacity: 1; }
    .lpm-notion-link {
      padding: 6px 16px; background: #f0fdf4; border-bottom: 1px solid #bbf7d0;
      font-size: 11px; flex: 0 0 auto;
      display: flex; align-items: center; gap: 6px;
    }
    .lpm-notion-link a {
      color: #3b82f6; text-decoration: none; font-weight: 500;
    }
    .lpm-notion-link a:hover { text-decoration: underline; }
    .lpm-doc-footer-note {
      text-align: center; font-size: 9px; color: #c4c4c4;
      padding: 4px 16px 8px; font-style: italic;
    }

    /* ── Session Name ── */
    .lpm-session-name {
      font-size: 13px; font-weight: 600; color: #1a1a2e;
      border: none; background: transparent; outline: none;
      padding: 0; width: 140px; font-family: inherit;
      border-bottom: 1px dashed transparent;
      transition: border-color 150ms ease;
    }
    .lpm-session-name:hover { border-bottom-color: #d1d5db; }
    .lpm-session-name:focus { border-bottom-color: #3b82f6; }

    /* ── Refine Prompt ── */
    .lpm-refine-bar {
      display: flex; gap: 6px; padding: 8px 16px;
      border-top: 1px solid #f0f0f0; flex: 0 0 auto;
      align-items: center;
    }
    .lpm-refine-input {
      flex: 1; padding: 7px 10px; font-size: 11px; font-family: inherit;
      border: 1px solid #e5e7eb; border-radius: 6px; outline: none;
      color: #1a1a2e; background: #f8f9fa; box-sizing: border-box;
    }
    .lpm-refine-input:focus { border-color: #3b82f6; background: #fff; }
    .lpm-refine-input::placeholder { color: #9ca3af; }
    .lpm-refine-send {
      padding: 7px 12px; font-size: 11px; font-weight: 500;
      font-family: inherit; border-radius: 6px; border: none;
      background: #8b5cf6; color: #fff; cursor: pointer;
      display: flex; align-items: center; gap: 4px;
      transition: background 150ms ease; white-space: nowrap;
      flex-shrink: 0;
    }
    .lpm-refine-send:hover { background: #7c3aed; }

    /* ── Editor Refine ── */
    .lpm-editor-refine {
      display: flex; gap: 6px; padding: 8px 20px;
      border-top: 1px solid #f0f0f0; flex-shrink: 0;
    }
    .lpm-editor-refine-input {
      flex: 1; padding: 8px 12px; font-size: 12px; font-family: inherit;
      border: 1px solid #e5e7eb; border-radius: 6px; outline: none;
      color: #1a1a2e; background: #f8f9fa; box-sizing: border-box;
    }
    .lpm-editor-refine-input:focus { border-color: #3b82f6; background: #fff; }
    .lpm-editor-refine-input::placeholder { color: #9ca3af; }

    /* ── Notion Push Modal ── */
    .lpm-notion-overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,0.5); display: flex;
      align-items: center; justify-content: center;
      pointer-events: auto;
    }
    .lpm-notion-modal {
      width: 340px; background: #fff; border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.2); overflow: hidden;
    }
    .lpm-notion-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px; border-bottom: 1px solid #e5e7eb;
    }
    .lpm-notion-title { font-size: 14px; font-weight: 600; color: #1a1a2e; }
    .lpm-notion-body { padding: 12px 16px; max-height: 300px; overflow-y: auto; }
    .lpm-notion-search {
      width: 100%; padding: 8px 12px; font-size: 13px; font-family: inherit;
      border: 1px solid #e5e7eb; border-radius: 8px; outline: none;
      box-sizing: border-box; margin-bottom: 8px;
    }
    .lpm-notion-search:focus { border-color: #3b82f6; }
    .lpm-notion-page {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 6px; cursor: pointer;
      transition: background 150ms ease;
    }
    .lpm-notion-page:hover { background: #f3f4f6; }
    .lpm-notion-page-icon { font-size: 16px; }
    .lpm-notion-page-name { font-size: 13px; color: #1a1a2e; }
    .lpm-notion-empty { text-align: center; color: #9ca3af; font-size: 12px; padding: 20px 0; }
    .lpm-notion-pushing {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 20px; color: #6b7280; font-size: 12px;
    }

    /* ── Session Bar ── */
    .lpm-session-bar {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 16px; border-top: 1px solid #f0f0f0; flex: 0 0 auto;
    }
    .lpm-session-btn {
      padding: 4px 8px; font-size: 10px; font-weight: 500;
      font-family: inherit; border-radius: 4px; border: none;
      cursor: pointer; display: flex; align-items: center; gap: 3px;
      transition: background 150ms ease;
    }
    .lpm-session-btn-save { background: #22c55e; color: #fff; }
    .lpm-session-btn-save:hover { background: #16a34a; }
    .lpm-session-btn-new { background: #f3f4f6; color: #6b7280; }
    .lpm-session-btn-new:hover { background: #e5e7eb; color: #1a1a2e; }

    /* ── Screenshot Legend ── */
    .lpm-ss-legend {
      display: flex; gap: 8px; overflow-x: auto;
      padding: 8px 16px; flex: 0 0 auto;
      border-top: 1px solid #f0f0f0;
    }
    .lpm-ss-legend-card {
      flex-shrink: 0; width: 80px; cursor: pointer;
      border-radius: 6px; overflow: hidden;
      border: 1px solid #e5e7eb;
      transition: box-shadow 150ms ease;
    }
    .lpm-ss-legend-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .lpm-ss-legend-card img {
      width: 100%; height: 48px; object-fit: cover; display: block;
    }
    /* ── Full-screen Editor Overlay ── */
    .lpm-editor-overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(3px);
      pointer-events: auto;
    }
    .lpm-editor-modal {
      width: 90vw; max-width: 800px; height: 85vh; max-height: 85vh;
      background: #fff; border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.2);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .lpm-editor-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
    }
    .lpm-editor-header-left { display: flex; align-items: center; gap: 10px; }
    .lpm-editor-title { font-size: 15px; font-weight: 600; color: #1a1a2e; }
    .lpm-editor-body {
      flex: 1 1 0px; overflow-y: auto; padding: 20px 24px;
      min-height: 0;
    }
    .lpm-editor-textarea {
      width: 100%; min-height: 100%; border: none; background: transparent;
      font-size: 13px; line-height: 1.7; color: #1a1a2e;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      resize: none; outline: none; box-sizing: border-box;
    }
    .lpm-editor-textarea:focus {
      background: #fafafa; border-radius: 6px; padding: 12px;
    }
    .lpm-editor-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 20px; border-top: 1px solid #e5e7eb; flex-shrink: 0;
    }
    .lpm-editor-actions { display: flex; gap: 6px; }
    .lpm-editor-legend {
      display: flex; gap: 6px; overflow-x: auto; flex: 1; margin-right: 12px;
    }
    .lpm-editor-legend-card {
      flex-shrink: 0; width: 64px; cursor: pointer;
      border-radius: 4px; overflow: hidden;
      border: 1px solid #e5e7eb;
      transition: box-shadow 150ms ease;
    }
    .lpm-editor-tabs { display: flex; gap: 2px; }
    .lpm-editor-tab {
      padding: 5px 14px; font-size: 12px; font-weight: 500;
      font-family: inherit; border: none; border-radius: 6px;
      background: transparent; color: #9ca3af; cursor: pointer;
      transition: background 150ms ease, color 150ms ease;
    }
    .lpm-editor-tab:hover { background: #f3f4f6; color: #6b7280; }
    .lpm-editor-tab.active { background: #3b82f6; color: #fff; }
    .lpm-editor-source { color: #6b7280; font-size: 12px; }

    /* ── Preview Rendering ── */
    .lpm-preview-content {
      font-size: 13px; line-height: 1.7; color: #1a1a2e;
    }
    .lpm-preview-content h1 { font-size: 20px; font-weight: 700; margin: 16px 0 8px; color: #1a1a2e; }
    .lpm-preview-content h2 { font-size: 16px; font-weight: 600; margin: 14px 0 6px; color: #1a1a2e; }
    .lpm-preview-content h3 { font-size: 14px; font-weight: 600; margin: 12px 0 4px; color: #1a1a2e; }
    .lpm-preview-content h4, .lpm-preview-content h5, .lpm-preview-content h6 {
      font-size: 13px; font-weight: 600; margin: 10px 0 4px; color: #6b7280;
    }
    .lpm-preview-content p { margin: 6px 0; }
    .lpm-preview-content ul { padding-left: 20px; margin: 6px 0; }
    .lpm-preview-content li { margin: 3px 0; }
    .lpm-preview-content code {
      background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
      font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px;
    }
    .lpm-preview-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
    .lpm-preview-content strong { font-weight: 600; }
    .lpm-preview-content table {
      width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px;
    }
    .lpm-preview-content td {
      border: 1px solid #e5e7eb; padding: 6px 8px;
    }
    .lpm-preview-content tr:first-child td { font-weight: 600; background: #f8f9fa; }
    .lpm-preview-ss {
      display: inline-block; margin: 8px 0; border-radius: 8px;
      overflow: hidden; border: 1px solid #e5e7eb;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      max-width: 100%;
    }
    .lpm-preview-ss img {
      display: block; max-width: 100%; max-height: 300px;
      object-fit: contain;
    }
    .lpm-preview-ss-label {
      display: block; text-align: center;
      font-size: 10px; font-weight: 500; color: #6b7280;
      padding: 4px 8px; background: #f8f9fa;
    }
    .lpm-editor-legend-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .lpm-editor-legend-card img {
      width: 100%; height: 36px; object-fit: cover; display: block;
    }
    .lpm-editor-legend-label {
      display: block; text-align: center;
      font-size: 8px; font-weight: 600; color: #6b7280;
      padding: 1px 0; background: #f8f9fa;
    }

    .lpm-ss-legend-label {
      display: block; text-align: center;
      font-size: 9px; font-weight: 600; color: #6b7280;
      padding: 2px 0; background: #f8f9fa;
    }

    .lpm-hidden { display: none !important; }
  `;

  // ── Widget HTML ──
  const WIDGET_HTML = `
    <div class="lpm-fab"><img class="lpm-fab-icon" src="${chrome.runtime.getURL('icons/icon128.png')}" alt="TheLazyPM"></div>
    <div class="lpm-panel">
      <div class="lpm-panel-header">
        <img class="lpm-header-logo" src="${chrome.runtime.getURL('icons/sloth.png')}" alt="">
        <input class="lpm-session-name" id="lpm-session-name" value="Untitled Session" title="Click to rename session">
        <div class="lpm-header-actions">
          <button class="lpm-icon-btn" id="lpm-mic" title="Start recording">${ICONS.mic}</button>
          <button class="lpm-icon-btn lpm-primary" id="lpm-capture" title="Take screenshot">${ICONS.camera}</button>
          <button class="lpm-icon-btn" id="lpm-close" title="Collapse">${ICONS.close}</button>
        </div>
      </div>
      <div class="lpm-recording-bar lpm-hidden" id="lpm-rec-bar">
        <div class="lpm-rec-dot"></div>
        <span class="lpm-rec-timer" id="lpm-rec-timer">00:00</span>
        <span class="lpm-rec-label lpm-hidden" id="lpm-rec-label" style="font-size:10px;color:#ef4444;margin-left:4px;">recording on another tab</span>
        <button class="lpm-rec-stop" id="lpm-rec-stop" title="Stop recording">${ICONS.stop} Stop</button>
      </div>
      <div class="lpm-transcribing lpm-hidden" id="lpm-transcribing">
        <div class="lpm-spinner"></div>
        <span>Transcribing...</span>
      </div>
      <div class="lpm-panel-body" id="lpm-body">
        <div class="lpm-empty-state" id="lpm-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <p>Record voice or take screenshots</p>
        </div>
        <div id="lpm-content-area" class="lpm-hidden">
          <div id="lpm-transcripts-section" class="lpm-hidden">
            <div class="lpm-section-label">Transcripts</div>
            <div class="lpm-transcripts" id="lpm-transcripts"></div>
          </div>
          <div id="lpm-screenshots-section" class="lpm-hidden">
            <div class="lpm-section-label">Screenshots</div>
            <div class="lpm-grid" id="lpm-grid"></div>
          </div>
        </div>
      </div>
      <div class="lpm-note-bar" id="lpm-note-bar">
        <textarea class="lpm-note-input" id="lpm-note-input" rows="1" placeholder="Add a note..."></textarea>
        <button class="lpm-note-btn lpm-note-btn-expand" id="lpm-note-expand" title="Expand editor">${ICONS.expand}</button>
        <button class="lpm-note-btn lpm-note-btn-add" id="lpm-note-add" title="Add note">${ICONS.plus}</button>
      </div>
      <div class="lpm-generate-bar lpm-hidden" id="lpm-generate-bar">
        <div class="lpm-generate-row">
          <button class="lpm-generate-btn" id="lpm-generate" title="Generate document from session">${ICONS.sparkle} Generate Document</button>
          <label class="lpm-skip-ai" title="Skip AI formatting — use raw notes"><input type="checkbox" id="lpm-skip-ai"> Skip AI</label>
        </div>
      </div>
      <div class="lpm-generating lpm-hidden" id="lpm-generating">
        <div class="lpm-spinner"></div>
        <span>Generating document...</span>
      </div>
      <div class="lpm-panel-footer lpm-hidden" id="lpm-footer">
        <span class="lpm-footer-info" id="lpm-count"></span>
        <button class="lpm-btn-sm lpm-btn-ghost" id="lpm-download-zip" title="Download all as ZIP">${ICONS.download} ZIP</button>
      </div>
      <div class="lpm-session-bar" id="lpm-session-bar">
        <button class="lpm-session-btn lpm-session-btn-save" id="lpm-save-session" title="Save session">${ICONS.save} Save</button>
        <button class="lpm-session-btn lpm-session-btn-new" id="lpm-new-session" title="Start new session">${ICONS.plus} New</button>
      </div>
      <!-- Doc Review View (hidden by default, replaces main body) -->
      <div class="lpm-doc-view lpm-hidden" id="lpm-doc-view">
        <div class="lpm-doc-header">
          <div class="lpm-doc-header-left">
            <img class="lpm-header-logo" src="${chrome.runtime.getURL('icons/sloth.png')}" alt="">
            <button class="lpm-icon-btn" id="lpm-doc-back" title="Back">${ICONS.back}</button>
            <span class="lpm-doc-title">Generated Document</span>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="lpm-icon-btn" id="lpm-doc-regenerate" title="Regenerate from scratch">${ICONS.refresh}</button>
            <button class="lpm-icon-btn" id="lpm-doc-expand" title="Expand editor">${ICONS.expand}</button>
            <button class="lpm-icon-btn" id="lpm-doc-close" title="Collapse">${ICONS.close}</button>
          </div>
        </div>
        <div class="lpm-notion-link lpm-hidden" id="lpm-notion-link"></div>
        <div class="lpm-doc-body">
          <textarea class="lpm-doc-content" id="lpm-doc-content"></textarea>
        </div>
        <div class="lpm-refine-bar">
          <input class="lpm-refine-input" id="lpm-refine-input" placeholder="Refine: e.g. make it shorter, add more detail..." />
          <button class="lpm-refine-send" id="lpm-refine-send" title="Refine document with instructions">${ICONS.sparkle} Refine</button>
        </div>
        <div class="lpm-doc-actions">
          <button class="lpm-doc-btn lpm-doc-btn-primary" id="lpm-doc-copy" title="Copy markdown to clipboard">${ICONS.copy} Copy</button>
          <button class="lpm-doc-btn lpm-doc-btn-ghost" id="lpm-doc-download" title="Download as .md file">${ICONS.download} .md</button>
          <button class="lpm-doc-btn lpm-doc-btn-ghost" id="lpm-doc-notion" title="Push to Notion">${ICONS.notion} Notion</button>
          <span style="flex:1;"></span>
          <button class="lpm-doc-btn lpm-doc-btn-ghost" id="lpm-doc-save" title="Save session">${ICONS.save}</button>
          <button class="lpm-doc-btn lpm-doc-btn-ghost" id="lpm-doc-new" title="New session">${ICONS.plus}</button>
        </div>
      </div>
      <div class="lpm-toast" id="lpm-toast"></div>
    </div>
  `;

  // ═══════════════════════════════════════════
  //  WIDGET INJECT / REMOVE
  // ═══════════════════════════════════════════

  function injectWidget() {
    if (hostEl) return;
    hostEl = document.createElement('the-lazy-pm');
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = WIDGET_CSS;
    shadowRoot.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = WIDGET_HTML;
    while (wrapper.firstChild) shadowRoot.appendChild(wrapper.firstChild);

    document.body.appendChild(hostEl);
    bindWidgetEvents();

    // Restore state from service worker
    safeSendMessage({ type: 'GET_SCREENSHOTS' }, (resp) => {
      if (resp?.success && resp.screenshots.length > 0) {
        screenshots = resp.screenshots;
        renderGrid();
      }
    });
    safeSendMessage({ type: 'GET_TRANSCRIPTS' }, (resp) => {
      if (resp?.success && resp.transcripts.length > 0) {
        transcripts = resp.transcripts;
        renderTranscripts();
      }
    });
    // Restore session meta (name, markdown, hasDoc)
    safeSendMessage({ type: 'GET_SESSION_META' }, (resp) => {
      if (resp?.success && resp.meta) {
        sessionName = resp.meta.name || 'Untitled Session';
        generatedMarkdown = resp.meta.markdown || '';
        hasGeneratedDoc = resp.meta.hasDoc || false;
        const nameInput = shadowRoot?.getElementById('lpm-session-name');
        if (nameInput) nameInput.value = sessionName;
        updateContentVisibility();

        // If recording is active on another tab, show the indicator
        // (but only if WE don't have a local mediaRecorder running)
        if (resp.meta.isRecording && !mediaRecorder) {
          setRecordingUI(true, resp.meta.recordingStartTime, false);
          showToast('Recording in progress — keep talking on the other tab');
        }

        // Notify user if continuing a stale session (>30 min idle)
        const hasContent = transcripts.length > 0 || screenshots.length > 0 || resp.meta.hasDoc;
        const lastActive = resp.meta.lastActiveAt || 0;
        if (hasContent && lastActive && (Date.now() - lastActive) > 30 * 60 * 1000) {
          showToast(`Continuing: ${sessionName}`);
        }
      }
    });

    console.log('[TheLazyPM] Widget injected');
  }

  function removeWidget() {
    if (hostEl) { hostEl.remove(); hostEl = null; shadowRoot = null; }
  }

  function bindWidgetEvents() {
    const fab = shadowRoot.querySelector('.lpm-fab');
    const panel = shadowRoot.querySelector('.lpm-panel');
    const closeBtn = shadowRoot.getElementById('lpm-close');
    const captureBtn = shadowRoot.getElementById('lpm-capture');
    const downloadZipBtn = shadowRoot.getElementById('lpm-download-zip');
    const micBtn = shadowRoot.getElementById('lpm-mic');
    const recStopBtn = shadowRoot.getElementById('lpm-rec-stop');

    fab.addEventListener('click', () => { fab.classList.add('lpm-hidden'); panel.classList.add('lpm-visible'); });
    closeBtn.addEventListener('click', () => { panel.classList.remove('lpm-visible'); fab.classList.remove('lpm-hidden'); });

    // Prevent wheel events from leaking to the host page (fixes scroll on Figma etc.)
    panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    const generateBtn = shadowRoot.getElementById('lpm-generate');
    const docBackBtn = shadowRoot.getElementById('lpm-doc-back');
    const docCloseBtn = shadowRoot.getElementById('lpm-doc-close');
    const docCopyBtn = shadowRoot.getElementById('lpm-doc-copy');
    const docDownloadBtn = shadowRoot.getElementById('lpm-doc-download');
    const docRegenerateBtn = shadowRoot.getElementById('lpm-doc-regenerate');
    const docExpandBtn = shadowRoot.getElementById('lpm-doc-expand');
    const sessionNameInput = shadowRoot.getElementById('lpm-session-name');
    const refineInput = shadowRoot.getElementById('lpm-refine-input');
    const refineSendBtn = shadowRoot.getElementById('lpm-refine-send');

    captureBtn.addEventListener('click', startRegionCapture);
    downloadZipBtn.addEventListener('click', downloadAllZip);
    micBtn.addEventListener('click', toggleRecording);
    recStopBtn.addEventListener('click', stopRecording);
    // generateBtn click is set dynamically in updateContentVisibility()
    docBackBtn.addEventListener('click', showSessionView);
    docCloseBtn.addEventListener('click', () => { panel.classList.remove('lpm-visible'); fab.classList.remove('lpm-hidden'); showSessionView(); });
    docCopyBtn.addEventListener('click', copyDocMarkdown);
    docDownloadBtn.addEventListener('click', downloadDocMarkdown);
    docRegenerateBtn.addEventListener('click', generateDoc);
    docExpandBtn.addEventListener('click', openFullScreenEditor);
    sessionNameInput.addEventListener('blur', () => {
      sessionName = sessionNameInput.value.trim() || 'Untitled Session';
      sessionNameInput.value = sessionName;
      safeSendMessage({ type: 'UPDATE_SESSION_META', meta: { name: sessionName } });
    });
    sessionNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sessionNameInput.blur(); });
    refineSendBtn.addEventListener('click', () => refineDoc(refineInput.value));
    refineInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') refineDoc(refineInput.value); });

    // Notion push
    shadowRoot.getElementById('lpm-doc-notion').addEventListener('click', openNotionPush);
    shadowRoot.getElementById('lpm-doc-save').addEventListener('click', saveCurrentSession);
    shadowRoot.getElementById('lpm-doc-new').addEventListener('click', startNewSession);

    // Note input
    const noteInput = shadowRoot.getElementById('lpm-note-input');
    const noteAddBtn = shadowRoot.getElementById('lpm-note-add');
    const noteExpandBtn = shadowRoot.getElementById('lpm-note-expand');
    function submitNote(text) {
      const trimmed = text.trim();
      if (!trimmed) return;
      safeSendMessage({ type: 'ADD_NOTE', text: trimmed }, (resp) => {
        if (resp?.success && resp.transcript) {
          transcripts.push(resp.transcript);
          invalidateDoc();
          renderTranscripts();
        }
      });
    }
    noteAddBtn.addEventListener('click', () => { submitNote(noteInput.value); noteInput.value = ''; });
    noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitNote(noteInput.value); noteInput.value = ''; }
    });
    noteExpandBtn.addEventListener('click', openNoteModal);

    // Session management (session view)
    shadowRoot.getElementById('lpm-save-session').addEventListener('click', saveCurrentSession);
    shadowRoot.getElementById('lpm-new-session').addEventListener('click', startNewSession);
  }

  // ═══════════════════════════════════════════
  //  REGION SCREENSHOT CAPTURE
  // ═══════════════════════════════════════════

  function startRegionCapture() {
    // First, hide the widget so it doesn't appear in screenshot
    if (hostEl) hostEl.style.display = 'none';

    // Small delay to let the widget disappear from render
    setTimeout(() => {
      safeSendMessage({ type: 'CAPTURE_SCREENSHOT' }, (resp) => {
        if (hostEl) hostEl.style.display = '';
        if (!resp?.success) {
          console.error('[TheLazyPM] Screenshot failed:', resp?.error);
          return;
        }
        showRegionSelector(resp.dataUrl);
      });
    }, 50);
  }

  function showRegionSelector(fullDataUrl) {
    const img = new Image();
    img.onload = () => {
      const overlay = document.createElement('div');
      overlay.className = 'lpm-region-overlay';

      const canvas = document.createElement('canvas');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      // Draw the screenshot scaled to viewport
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Dim it
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      overlay.appendChild(canvas);

      const hint = document.createElement('div');
      hint.className = 'lpm-region-hint';
      hint.textContent = 'Drag to select region · Esc to cancel';
      overlay.appendChild(hint);

      shadowRoot.appendChild(overlay);

      let dragging = false;
      let startX, startY;

      function drawPreview(sx, sy, ex, ey) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Full screenshot dimmed
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Clear the selected region (show bright)
        const x = Math.min(sx, ex), y = Math.min(sy, ey);
        const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
        if (w > 2 && h > 2) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, w, h);
          ctx.clip();
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          ctx.restore();
          // Border
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        }
      }

      canvas.addEventListener('mousedown', (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
      });

      canvas.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        drawPreview(startX, startY, e.clientX, e.clientY);
      });

      canvas.addEventListener('mouseup', (e) => {
        if (!dragging) return;
        dragging = false;
        const x = Math.min(startX, e.clientX);
        const y = Math.min(startY, e.clientY);
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);

        overlay.remove();

        if (w < 10 || h < 10) return; // too small, ignore

        // Crop from the full-res image
        const scaleX = img.naturalWidth / window.innerWidth;
        const scaleY = img.naturalHeight / window.innerHeight;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = Math.round(w * scaleX);
        cropCanvas.height = Math.round(h * scaleY);
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(
          img,
          Math.round(x * scaleX), Math.round(y * scaleY),
          cropCanvas.width, cropCanvas.height,
          0, 0, cropCanvas.width, cropCanvas.height
        );
        const croppedUrl = cropCanvas.toDataURL('image/png');
        addScreenshot(croppedUrl, Date.now(), location.href, true);
      });

      // Esc to cancel
      function onKey(e) {
        if (e.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', onKey);
        }
      }
      document.addEventListener('keydown', onKey);
    };
    img.src = fullDataUrl;
  }

  // ═══════════════════════════════════════════
  //  SCREENSHOT MANAGEMENT (synced to service worker)
  // ═══════════════════════════════════════════

  function addScreenshot(dataUrl, timestamp, url, autoAnnotate) {
    safeSendMessage({
      type: 'ADD_SCREENSHOT', dataUrl, timestamp, url,
    }, (resp) => {
      if (resp?.success) {
        screenshots.push({ dataUrl, timestamp, url, annotatedUrl: null });
        invalidateDoc();
        renderGrid();
        if (autoAnnotate) {
          openAnnotator(screenshots.length - 1);
        }
      }
    });
  }

  function deleteScreenshot(idx) {
    safeSendMessage({ type: 'DELETE_SCREENSHOT', index: idx }, (resp) => {
      if (resp?.success) {
        screenshots.splice(idx, 1);
        invalidateDoc();
        renderGrid();
      }
    });
  }

  function updateScreenshotAnnotation(idx, annotatedUrl) {
    safeSendMessage({
      type: 'UPDATE_SCREENSHOT', index: idx, annotatedUrl,
    }, (resp) => {
      if (resp?.success) {
        screenshots[idx].annotatedUrl = annotatedUrl;
        renderGrid();
      }
    });
  }

  // ═══════════════════════════════════════════
  //  RENDER GRID
  // ═══════════════════════════════════════════

  function updateContentVisibility() {
    if (!shadowRoot) return;
    const empty = shadowRoot.getElementById('lpm-empty');
    const contentArea = shadowRoot.getElementById('lpm-content-area');
    const footer = shadowRoot.getElementById('lpm-footer');
    const count = shadowRoot.getElementById('lpm-count');
    const ssSection = shadowRoot.getElementById('lpm-screenshots-section');
    const trSection = shadowRoot.getElementById('lpm-transcripts-section');
    const generateBar = shadowRoot.getElementById('lpm-generate-bar');

    const hasContent = screenshots.length > 0 || transcripts.length > 0;
    empty.classList.toggle('lpm-hidden', hasContent);
    contentArea.classList.toggle('lpm-hidden', !hasContent);
    ssSection.classList.toggle('lpm-hidden', screenshots.length === 0);
    trSection.classList.toggle('lpm-hidden', transcripts.length === 0);
    generateBar.classList.toggle('lpm-hidden', !hasContent);

    // Update generate button text if doc already exists
    const genBtn = shadowRoot.getElementById('lpm-generate');
    if (genBtn && hasGeneratedDoc) {
      genBtn.innerHTML = `${ICONS.sparkle} View Document`;
      genBtn.onclick = () => showDocView(generatedMarkdown);
    } else if (genBtn) {
      genBtn.innerHTML = `${ICONS.sparkle} Generate Document`;
      genBtn.onclick = generateDoc;
    }

    if (screenshots.length > 0) {
      footer.classList.remove('lpm-hidden');
      const parts = [];
      if (screenshots.length > 0) parts.push(`${screenshots.length} screenshot${screenshots.length > 1 ? 's' : ''}`);
      if (transcripts.length > 0) parts.push(`${transcripts.length} transcript${transcripts.length > 1 ? 's' : ''}`);
      count.textContent = parts.join(' · ');
    } else {
      footer.classList.add('lpm-hidden');
    }
  }

  function renderGrid() {
    if (!shadowRoot) return;
    const grid = shadowRoot.getElementById('lpm-grid');

    updateContentVisibility();

    grid.innerHTML = '';
    screenshots.forEach((ss, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'lpm-thumb';
      thumb.innerHTML = `
        <img src="${ss.annotatedUrl || ss.dataUrl}" alt="SS-${i + 1}">
        <span class="lpm-thumb-idx">SS-${i + 1}</span>
        <div class="lpm-thumb-overlay">
          <div class="lpm-thumb-actions">
            <button class="lpm-thumb-btn lpm-edit" title="Annotate">${ICONS.highlight}</button>
            <button class="lpm-thumb-btn" title="Download">${ICONS.download}</button>
            <button class="lpm-thumb-btn lpm-del" title="Delete">${ICONS.trash}</button>
          </div>
        </div>
      `;
      thumb.querySelector('img').addEventListener('click', () => openAnnotator(i));
      thumb.querySelector('.lpm-edit').addEventListener('click', (e) => { e.stopPropagation(); openAnnotator(i); });
      thumb.querySelector('.lpm-del').addEventListener('click', (e) => { e.stopPropagation(); deleteScreenshot(i); });
      thumb.querySelector('[title="Download"]').addEventListener('click', (e) => { e.stopPropagation(); downloadSingle(i); });
      grid.appendChild(thumb);
    });
  }

  // ═══════════════════════════════════════════
  //  DOWNLOADS
  // ═══════════════════════════════════════════

  function downloadSingle(idx) {
    const ss = screenshots[idx];
    const a = document.createElement('a');
    a.href = ss.annotatedUrl || ss.dataUrl;
    a.download = `lazypm-ss-${idx + 1}.png`;
    a.click();
  }

  async function downloadAllZip() {
    // ZIP generation happens in the service worker (no CSP restrictions there)
    safeSendMessage({ type: 'GENERATE_ZIP' }, (resp) => {
      if (resp?.success && resp.zipDataUrl) {
        const a = document.createElement('a');
        a.href = resp.zipDataUrl;
        a.download = 'lazypm-screenshots.zip';
        a.click();
      } else {
        console.error('[TheLazyPM] ZIP generation failed:', resp?.error);
      }
    });
  }

  // ═══════════════════════════════════════════
  //  ANNOTATOR
  // ═══════════════════════════════════════════

  let annCanvas, annCtx, annOverlay, annHistory, annTool, annColor, annDrawing, annStart;
  let annTextInput = null;
  const ANN_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];

  function openAnnotator(idx) {
    const ss = screenshots[idx];
    const img = new Image();
    img.onload = () => createAnnotatorUI(img, idx);
    img.src = ss.annotatedUrl || ss.dataUrl;
  }

  function createAnnotatorUI(img, idx) {
    annTool = 'highlight';
    annColor = ANN_COLORS[0];
    annHistory = [];
    annDrawing = false;

    const maxW = window.innerWidth * 0.88;
    const maxH = window.innerHeight * 0.82;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    annOverlay = document.createElement('div');
    annOverlay.className = 'lpm-annotator-overlay';

    const wrap = document.createElement('div');
    wrap.className = 'lpm-annotator-wrap';

    annCanvas = document.createElement('canvas');
    annCanvas.className = 'lpm-annotator-canvas';
    annCanvas.width = img.naturalWidth;
    annCanvas.height = img.naturalHeight;
    annCanvas.style.width = w + 'px';
    annCanvas.style.height = h + 'px';
    annCtx = annCanvas.getContext('2d', { willReadFrequently: true });
    annCtx.drawImage(img, 0, 0);
    annHistory.push(annCtx.getImageData(0, 0, annCanvas.width, annCanvas.height));

    wrap.appendChild(annCanvas);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'lpm-ann-toolbar';
    toolbar.innerHTML = `
      <button class="lpm-ann-btn active" data-tool="highlight" title="Highlight">${ICONS.highlight}</button>
      <button class="lpm-ann-btn" data-tool="rect" title="Rectangle">${ICONS.rect}</button>
      <button class="lpm-ann-btn" data-tool="arrow" title="Arrow + Comment">${ICONS.arrow}</button>
      <button class="lpm-ann-btn" data-tool="text" title="Text">${ICONS.text}</button>
      <div class="lpm-ann-sep"></div>
      <div class="lpm-ann-colors">
        ${ANN_COLORS.map((c, i) => `<div class="lpm-ann-color${i === 0 ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
      </div>
      <div class="lpm-ann-sep"></div>
      <button class="lpm-ann-btn" data-action="undo" title="Undo">${ICONS.undo}</button>
      <div class="lpm-ann-sep"></div>
      <button class="lpm-ann-btn lpm-save" data-action="save" title="Save">${ICONS.check}</button>
      <button class="lpm-ann-btn lpm-cancel" data-action="cancel" title="Cancel">${ICONS.close}</button>
    `;
    wrap.appendChild(toolbar);
    annOverlay.appendChild(wrap);
    shadowRoot.appendChild(annOverlay);

    // Tool selection
    toolbar.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('[data-tool]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        annTool = btn.dataset.tool;
        annCanvas.style.cursor = annTool === 'text' ? 'text' : 'crosshair';
      });
    });
    toolbar.querySelectorAll('.lpm-ann-color').forEach((el) => {
      el.addEventListener('click', () => {
        toolbar.querySelectorAll('.lpm-ann-color').forEach((c) => c.classList.remove('active'));
        el.classList.add('active');
        annColor = el.dataset.color;
      });
    });
    toolbar.querySelector('[data-action="undo"]').addEventListener('click', annUndo);
    toolbar.querySelector('[data-action="save"]').addEventListener('click', () => annSave(idx));
    toolbar.querySelector('[data-action="cancel"]').addEventListener('click', annClose);

    annCanvas.addEventListener('mousedown', annMouseDown);
    annCanvas.addEventListener('mousemove', annMouseMove);
    annCanvas.addEventListener('mouseup', annMouseUp);
    annCanvas.addEventListener('click', annClick);

    annOverlay.addEventListener('mousedown', (e) => {
      if (e.target === annOverlay) annClose();
    });
  }

  function getCanvasPos(e) {
    const rect = annCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (annCanvas.width / rect.width),
      y: (e.clientY - rect.top) * (annCanvas.height / rect.height),
    };
  }

  function annMouseDown(e) {
    if (annTool === 'text') return;
    annDrawing = true;
    annStart = getCanvasPos(e);
    if (annTool === 'highlight') {
      annCtx.beginPath();
      annCtx.moveTo(annStart.x, annStart.y);
    }
  }

  function annMouseMove(e) {
    if (!annDrawing) return;
    const pos = getCanvasPos(e);

    if (annTool === 'highlight') {
      annCtx.strokeStyle = annColor;
      annCtx.lineWidth = Math.max(2, annCanvas.width * 0.003);
      annCtx.lineCap = 'round';
      annCtx.lineJoin = 'round';
      annCtx.globalAlpha = 0.6;
      annCtx.lineTo(pos.x, pos.y);
      annCtx.stroke();
      annCtx.globalAlpha = 1;
    } else if (annTool === 'rect') {
      if (annHistory.length > 0) annCtx.putImageData(annHistory[annHistory.length - 1], 0, 0);
      annCtx.strokeStyle = annColor;
      annCtx.lineWidth = Math.max(2, annCanvas.width * 0.003);
      annCtx.strokeRect(annStart.x, annStart.y, pos.x - annStart.x, pos.y - annStart.y);
    } else if (annTool === 'arrow') {
      if (annHistory.length > 0) annCtx.putImageData(annHistory[annHistory.length - 1], 0, 0);
      drawArrow(annCtx, annStart.x, annStart.y, pos.x, pos.y, annColor);
    }
  }

  function annMouseUp(e) {
    if (!annDrawing) return;
    annDrawing = false;
    const pos = getCanvasPos(e);

    if (annTool === 'rect') {
      if (annHistory.length > 0) annCtx.putImageData(annHistory[annHistory.length - 1], 0, 0);
      annCtx.strokeStyle = annColor;
      annCtx.lineWidth = Math.max(2, annCanvas.width * 0.003);
      annCtx.strokeRect(annStart.x, annStart.y, pos.x - annStart.x, pos.y - annStart.y);
      annHistory.push(annCtx.getImageData(0, 0, annCanvas.width, annCanvas.height));
    } else if (annTool === 'highlight') {
      annHistory.push(annCtx.getImageData(0, 0, annCanvas.width, annCanvas.height));
    } else if (annTool === 'arrow') {
      // Draw final arrow, then prompt for text
      if (annHistory.length > 0) annCtx.putImageData(annHistory[annHistory.length - 1], 0, 0);
      drawArrow(annCtx, annStart.x, annStart.y, pos.x, pos.y, annColor);
      // Show text input at the arrow tip
      showArrowTextInput(pos, annColor);
    }
  }

  function drawArrow(ctx, fromX, fromY, toX, toY, color) {
    const lw = Math.max(2, annCanvas.width * 0.003);
    const headLen = Math.max(12, annCanvas.width * 0.015);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';

    // Line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function showArrowTextInput(pos, color) {
    if (annTextInput) commitTextInput();

    const rect = annCanvas.getBoundingClientRect();
    const scaleX = rect.width / annCanvas.width;
    const scaleY = rect.height / annCanvas.height;
    const wrapRect = annOverlay.querySelector('.lpm-annotator-wrap').getBoundingClientRect();

    annTextInput = document.createElement('input');
    annTextInput.type = 'text';
    annTextInput.className = 'lpm-text-input';
    annTextInput.placeholder = 'Add comment...';
    annTextInput.style.left = (rect.left - wrapRect.left + pos.x * scaleX + 8) + 'px';
    annTextInput.style.top = (rect.top - wrapRect.top + pos.y * scaleY - 14) + 'px';
    annTextInput.style.position = 'absolute';
    annTextInput.style.color = color;
    annTextInput.style.borderColor = color;
    annTextInput._canvasPos = pos;
    annTextInput._color = color;
    annTextInput._isArrow = true;

    annOverlay.querySelector('.lpm-annotator-wrap').appendChild(annTextInput);
    annTextInput.focus();

    annTextInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') commitTextInput();
      if (ev.key === 'Escape') {
        // Cancel: undo the arrow
        annTextInput.remove();
        annTextInput = null;
          }
    });
  }

  function annClick(e) {
    if (annTool !== 'text') return;
    const pos = getCanvasPos(e);
    if (annTextInput) commitTextInput();

    const rect = annCanvas.getBoundingClientRect();
    const scaleX = rect.width / annCanvas.width;
    const scaleY = rect.height / annCanvas.height;
    const wrapRect = annOverlay.querySelector('.lpm-annotator-wrap').getBoundingClientRect();

    annTextInput = document.createElement('input');
    annTextInput.type = 'text';
    annTextInput.className = 'lpm-text-input';
    annTextInput.style.left = (rect.left - wrapRect.left + pos.x * scaleX) + 'px';
    annTextInput.style.top = (rect.top - wrapRect.top + pos.y * scaleY) + 'px';
    annTextInput.style.position = 'absolute';
    annTextInput.style.color = annColor;
    annTextInput.style.borderColor = annColor;
    annTextInput._canvasPos = pos;
    annTextInput._color = annColor;
    annTextInput._isArrow = false;

    annOverlay.querySelector('.lpm-annotator-wrap').appendChild(annTextInput);
    annTextInput.focus();

    annTextInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') commitTextInput();
      if (ev.key === 'Escape') { annTextInput.remove(); annTextInput = null; }
    });
  }

  function commitTextInput() {
    if (!annTextInput) return;
    const text = annTextInput.value.trim();
    const pos = annTextInput._canvasPos;
    const color = annTextInput._color;
    const isArrow = annTextInput._isArrow;

    annTextInput.remove();
    annTextInput = null;

    if (isArrow) {
      if (text) {
        const fontSize = Math.max(10, annCanvas.width * 0.009);
        annCtx.font = `500 ${fontSize}px Inter, -apple-system, system-ui, sans-serif`;

        const metrics = annCtx.measureText(text);
        const tx = pos.x + fontSize * 0.4;
        const ty = pos.y + fontSize * 0.2;
        const pad = 3;
        annCtx.fillStyle = 'rgba(255,255,255,0.85)';
        annCtx.beginPath();
        annCtx.roundRect(tx - pad, ty - fontSize - pad, metrics.width + pad * 2, fontSize + pad * 2, 2);
        annCtx.fill();
        annCtx.fillStyle = color;
        annCtx.fillText(text, tx, ty);
      }
        annHistory.push(annCtx.getImageData(0, 0, annCanvas.width, annCanvas.height));
    } else if (text) {
      const fontSize = Math.max(14, annCanvas.width * 0.016);
      annCtx.font = `600 ${fontSize}px Inter, -apple-system, system-ui, sans-serif`;
      annCtx.fillStyle = color;
      annCtx.fillText(text, pos.x, pos.y + fontSize);
      annHistory.push(annCtx.getImageData(0, 0, annCanvas.width, annCanvas.height));
    }
  }

  function annUndo() {
    if (annHistory.length <= 1) return;
    annHistory.pop();
    annCtx.putImageData(annHistory[annHistory.length - 1], 0, 0);
  }

  function annSave(idx) {
    if (annTextInput) commitTextInput();
    const annotatedUrl = annCanvas.toDataURL('image/png');
    updateScreenshotAnnotation(idx, annotatedUrl);
    annClose();
  }

  function annClose() {
    if (annTextInput) { annTextInput.remove(); annTextInput = null; }
    if (annOverlay) { annOverlay.remove(); annOverlay = null; }
  }

  // ═══════════════════════════════════════════
  //  VOICE RECORDING (runs in content script for mic permission)
  // ═══════════════════════════════════════════

  let mediaRecorder = null;
  let audioChunks = [];
  let recordingStartTime = 0;

  function toggleRecording() {
    if (isRecording) {
      stopRecording(); // works locally or cross-tab
    } else {
      startRecording();
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.start(1000);
      recordingStartTime = Date.now();
      setRecordingUI(true, recordingStartTime, true);
      // Track in service worker so other pages know
      safeSendMessage({ type: 'UPDATE_SESSION_META', meta: { isRecording: true, recordingStartTime } });
    } catch (err) {
      console.error('[TheLazyPM] Mic access denied:', err.message);
    }
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      // No local recorder — ask the tab that has it to stop
      safeSendMessage({ type: 'STOP_RECORDING_REQUEST' });
      setRecordingUI(false);
      showToast('Stopping recording...');
      return;
    }

    const transcribingEl = shadowRoot?.getElementById('lpm-transcribing');
    setRecordingUI(false);
    if (transcribingEl) transcribingEl.classList.remove('lpm-hidden');

    // Mark as not recording immediately
    safeSendMessage({ type: 'UPDATE_SESSION_META', meta: { isRecording: false } });

    const duration = Math.round((Date.now() - recordingStartTime) / 1000);
    const startTime = recordingStartTime;

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      mediaRecorder = null;
      audioChunks = [];

      const reader = new FileReader();
      reader.onloadend = () => {
        const transcribeTimeout = setTimeout(() => {
          if (transcribingEl) transcribingEl.classList.add('lpm-hidden');
          showToast('Transcription failed — try again');
        }, 30000);

        safeSendMessage({
          type: 'TRANSCRIBE_AUDIO',
          audioData: reader.result,
          duration,
          recordingStartTime: startTime,
        }, (resp) => {
          clearTimeout(transcribeTimeout);
          if (transcribingEl) transcribingEl.classList.add('lpm-hidden');
          if (resp?.success && resp.transcript) {
            transcripts.push(resp.transcript);
            invalidateDoc();
            renderTranscripts();
          }
        });
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.stop();
  }

  function setRecordingUI(recording, startTime, isLocal) {
    if (!shadowRoot) return;
    isRecording = recording;
    const micBtn = shadowRoot.getElementById('lpm-mic');
    const recBar = shadowRoot.getElementById('lpm-rec-bar');
    const timerEl = shadowRoot.getElementById('lpm-rec-timer');
    const stopBtn = shadowRoot.getElementById('lpm-rec-stop');
    const remoteLabel = shadowRoot.getElementById('lpm-rec-label');

    if (recording) {
      micBtn.classList.add('lpm-recording');
      micBtn.innerHTML = ICONS.micOff;
      recBar.classList.remove('lpm-hidden');

      stopBtn.classList.remove('lpm-hidden');
      if (isLocal === false) {
        micBtn.title = 'Recording on another tab';
        remoteLabel.classList.remove('lpm-hidden');
      } else {
        micBtn.title = 'Stop recording';
        remoteLabel.classList.add('lpm-hidden');
      }

      // Timer
      if (recordingTimerInterval) clearInterval(recordingTimerInterval);
      const start = startTime || Date.now();
      function updateTimer() {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        timerEl.textContent = `${m}:${s}`;
      }
      updateTimer();
      recordingTimerInterval = setInterval(updateTimer, 1000);
    } else {
      micBtn.classList.remove('lpm-recording');
      micBtn.innerHTML = ICONS.mic;
      micBtn.title = 'Start recording';
      recBar.classList.add('lpm-hidden');
      stopBtn.classList.add('lpm-hidden');
      remoteLabel.classList.add('lpm-hidden');
      if (recordingTimerInterval) {
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
      }
    }
  }

  // ═══════════════════════════════════════════
  //  TRANSCRIPTS
  // ═══════════════════════════════════════════

  function renderTranscripts() {
    if (!shadowRoot) return;
    const container = shadowRoot.getElementById('lpm-transcripts');
    container.innerHTML = '';

    updateContentVisibility();

    transcripts.forEach((tr, i) => {
      const card = document.createElement('div');
      card.className = 'lpm-transcript-card';

      const durStr = tr.duration ? `${Math.floor(tr.duration / 60)}m ${tr.duration % 60}s` : '';
      const timeStr = new Date(tr.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      card.innerHTML = `
        <div class="lpm-transcript-header">
          <span class="lpm-transcript-meta">${timeStr}${durStr ? ' · ' + durStr : ''}</span>
          <div class="lpm-transcript-actions">
            <button class="lpm-thumb-btn lpm-del" title="Delete">${ICONS.trash}</button>
          </div>
        </div>
        <textarea class="lpm-transcript-text" rows="3">${tr.text}</textarea>
      `;

      const textarea = card.querySelector('.lpm-transcript-text');
      textarea.addEventListener('blur', () => {
        if (transcripts[i].text !== textarea.value) {
          transcripts[i].text = textarea.value;
          safeSendMessage({ type: 'UPDATE_TRANSCRIPT', index: i, text: textarea.value });
          invalidateDoc();
        }
      });

      card.querySelector('.lpm-del').addEventListener('click', () => {
        safeSendMessage({ type: 'DELETE_TRANSCRIPT', index: i }, (resp) => {
          if (resp?.success) {
            transcripts.splice(i, 1);
            invalidateDoc();
            renderTranscripts();
          }
        });
      });

      container.appendChild(card);
    });
  }

  // ═══════════════════════════════════════════
  //  AI DOC GENERATION + REVIEW
  // ═══════════════════════════════════════════

  let generatedMarkdown = '';
  let hasGeneratedDoc = false;

  function invalidateDoc() {
    if (!hasGeneratedDoc) return;
    hasGeneratedDoc = false;
    generatedMarkdown = '';
    syncMeta();
    updateContentVisibility();
  }

  function syncMeta() {
    safeSendMessage({
      type: 'UPDATE_SESSION_META',
      meta: { name: sessionName, markdown: generatedMarkdown, hasDoc: hasGeneratedDoc },
    });
  }

  function showLoadingState() {
    if (!shadowRoot) return;
    // Hide everything, show spinner
    shadowRoot.getElementById('lpm-doc-view')?.classList.add('lpm-hidden');
    shadowRoot.getElementById('lpm-body')?.classList.add('lpm-hidden');
    shadowRoot.getElementById('lpm-footer')?.classList.add('lpm-hidden');
    shadowRoot.getElementById('lpm-generate-bar')?.classList.add('lpm-hidden');
    shadowRoot.getElementById('lpm-note-bar')?.classList.add('lpm-hidden');
    shadowRoot.getElementById('lpm-session-bar')?.classList.add('lpm-hidden');
    shadowRoot.querySelector('.lpm-panel-header')?.classList.add('lpm-hidden');
    shadowRoot.getElementById('lpm-generating')?.classList.remove('lpm-hidden');
  }

  function hideLoadingState() {
    if (!shadowRoot) return;
    shadowRoot.getElementById('lpm-generating')?.classList.add('lpm-hidden');
  }

  function buildLocalDoc() {
    const parts = [];
    parts.push(`# ${sessionName}\n`);

    // Interleave transcripts and screenshots by timestamp
    const timeline = [];
    transcripts.forEach((tr) => {
      timeline.push({ timestamp: tr.timestamp, type: 'transcript', text: tr.text, duration: tr.duration });
    });
    screenshots.forEach((ss, i) => {
      timeline.push({ timestamp: ss.timestamp, type: 'screenshot', index: i + 1, url: ss.url || '' });
    });
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    timeline.forEach((item) => {
      if (item.type === 'transcript') {
        parts.push(`${item.text}\n`);
      } else {
        parts.push(`[📷 SS-${item.index}]\n`);
      }
    });

    parts.push('\n---\n*lazily generated by The Lazy PM*');
    return parts.join('\n');
  }

  function generateDoc() {
    if (!shadowRoot) return;

    // Check skip-AI toggle
    const skipAI = shadowRoot.getElementById('lpm-skip-ai')?.checked;

    // Nothing to generate?
    if (transcripts.length === 0 && screenshots.length === 0) {
      showToast('Nothing to generate — add notes or screenshots first');
      return;
    }

    if (skipAI) {
      generatedMarkdown = buildLocalDoc();
      hasGeneratedDoc = true;
      syncMeta();
      showDocView(generatedMarkdown);
      return;
    }

    showLoadingState();

    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        hideLoadingState();
        showSessionView();
        showToast('Generation timed out — try again');
      }
    }, 60000); // 60s timeout

    safeSendMessage({ type: 'GENERATE_DOC' }, (resp) => {
      if (responded) return;
      responded = true;
      clearTimeout(timeout);
      hideLoadingState();
      if (chrome.runtime.lastError) {
        showSessionView();
        showToast('Connection lost — try again');
        return;
      }
      if (resp?.success && resp.markdown) {
        generatedMarkdown = resp.markdown;
        hasGeneratedDoc = true;
        // Auto-extract title from first heading if untitled/blank
        if (!sessionName || sessionName === 'Untitled Session') {
          const titleMatch = generatedMarkdown.match(/^#+ (.+)/m);
          if (titleMatch) {
            sessionName = titleMatch[1].replace(/[*_`]/g, '').trim();
            const nameInput = shadowRoot?.getElementById('lpm-session-name');
            if (nameInput) nameInput.value = sessionName;
          }
        }
        syncMeta();
        showDocView(generatedMarkdown);
      } else {
        showSessionView();
        console.error('[TheLazyPM] Doc generation failed:', resp?.error);
        showToast(resp?.error || 'Generation failed');
      }
    });
  }

  function refineDoc(prompt) {
    if (!prompt || !prompt.trim()) return;
    if (!shadowRoot) return;

    const docContent = shadowRoot.getElementById('lpm-doc-content');
    if (docContent) generatedMarkdown = docContent.value;

    const refineInput = shadowRoot.getElementById('lpm-refine-input');
    showLoadingState();

    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        hideLoadingState();
        showDocView(generatedMarkdown);
        showToast('Refinement timed out — try again');
      }
    }, 60000);

    safeSendMessage({
      type: 'REFINE_DOC',
      currentMarkdown: generatedMarkdown,
      refinement: prompt.trim(),
    }, (resp) => {
      if (responded) return;
      responded = true;
      clearTimeout(timeout);
      hideLoadingState();
      if (chrome.runtime.lastError) {
        showDocView(generatedMarkdown);
        showToast('Connection lost — try again');
        return;
      }
      if (resp?.success && resp.markdown) {
        generatedMarkdown = resp.markdown;
        syncMeta();
        showDocView(generatedMarkdown);
        if (refineInput) refineInput.value = '';
      } else {
        showDocView(generatedMarkdown);
        console.error('[TheLazyPM] Refine failed:', resp?.error);
        showToast(resp?.error || 'Refinement failed');
      }
    });
  }

  function showDocView(markdown) {
    if (!shadowRoot) return;
    const body = shadowRoot.getElementById('lpm-body');
    const footer = shadowRoot.getElementById('lpm-footer');
    const generateBar = shadowRoot.getElementById('lpm-generate-bar');
    const recBar = shadowRoot.getElementById('lpm-rec-bar');
    const sessionBar = shadowRoot.getElementById('lpm-session-bar');
    const header = shadowRoot.querySelector('.lpm-panel-header');
    const docView = shadowRoot.getElementById('lpm-doc-view');
    const docContent = shadowRoot.getElementById('lpm-doc-content');

    // Hide session view elements
    body.classList.add('lpm-hidden');
    footer.classList.add('lpm-hidden');
    generateBar.classList.add('lpm-hidden');
    recBar.classList.add('lpm-hidden');
    sessionBar.classList.add('lpm-hidden');
    header.classList.add('lpm-hidden');
    shadowRoot.getElementById('lpm-note-bar')?.classList.add('lpm-hidden');
    shadowRoot.getElementById('lpm-generating')?.classList.add('lpm-hidden');

    // Show doc view
    docView.classList.remove('lpm-hidden');
    docContent.value = markdown;

    // Sync edits back
    docContent.oninput = () => {
      generatedMarkdown = docContent.value;
      // Debounced sync — don't persist on every keystroke
      clearTimeout(docContent._syncTimer);
      docContent._syncTimer = setTimeout(syncMeta, 2000);
    };

    // Render screenshot legend strip
    renderScreenshotLegend();
  }

  function renderScreenshotLegend() {
    if (!shadowRoot) return;
    // Remove any existing legend
    const existing = shadowRoot.getElementById('lpm-ss-legend');
    if (existing) existing.remove();

    if (screenshots.length === 0) return;

    const legend = document.createElement('div');
    legend.id = 'lpm-ss-legend';
    legend.className = 'lpm-ss-legend';

    screenshots.forEach((ss, i) => {
      const card = document.createElement('div');
      card.className = 'lpm-ss-legend-card';
      card.innerHTML = `
        <img src="${ss.annotatedUrl || ss.dataUrl}" alt="SS-${i + 1}">
        <span class="lpm-ss-legend-label">SS-${i + 1}</span>
      `;
      card.addEventListener('click', () => openAnnotator(i));
      legend.appendChild(card);
    });

    // Append to doc view (not doc body) so it stays fixed at bottom
    const docView = shadowRoot.getElementById('lpm-doc-view');
    const docActions = shadowRoot.querySelector('.lpm-refine-bar');
    if (docActions) {
      docView.insertBefore(legend, docActions);
    } else {
      docView.appendChild(legend);
    }
  }

  function showSessionView() {
    if (!shadowRoot) return;
    shadowRoot.getElementById('lpm-doc-view')?.classList.add('lpm-hidden');
    shadowRoot.getElementById('lpm-generating')?.classList.add('lpm-hidden');
    shadowRoot.querySelector('.lpm-panel-header')?.classList.remove('lpm-hidden');
    shadowRoot.getElementById('lpm-body')?.classList.remove('lpm-hidden');
    shadowRoot.getElementById('lpm-note-bar')?.classList.remove('lpm-hidden');
    shadowRoot.getElementById('lpm-session-bar')?.classList.remove('lpm-hidden');
    updateContentVisibility();
  }

  function copyDocMarkdown() {
    if (!shadowRoot) return;
    const docContent = shadowRoot.getElementById('lpm-doc-content');
    navigator.clipboard.writeText(docContent.value).then(() => {
      showToast('Copied to clipboard');
    });
  }

  function downloadDocMarkdown() {
    if (!shadowRoot) return;
    const docContent = shadowRoot.getElementById('lpm-doc-content');
    const blob = new Blob([docContent.value], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lazypm-document.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  function showToast(message) {
    if (!shadowRoot) return;
    const toast = shadowRoot.getElementById('lpm-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('lpm-toast-show');
    setTimeout(() => toast.classList.remove('lpm-toast-show'), 2000);
  }

  // ═══════════════════════════════════════════
  //  NOTION PUSH
  // ═══════════════════════════════════════════

  let notionOverlay = null;

  function openNotionPush() {
    if (notionOverlay || !shadowRoot) return;

    notionOverlay = document.createElement('div');
    notionOverlay.className = 'lpm-notion-overlay';
    notionOverlay.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    notionOverlay.innerHTML = `
      <div class="lpm-notion-modal">
        <div class="lpm-notion-header">
          <span class="lpm-notion-title">Push to Notion</span>
          <button class="lpm-icon-btn" id="lpm-notion-close">${ICONS.close}</button>
        </div>
        <div class="lpm-notion-body" id="lpm-notion-body">
          <div id="lpm-notion-default"></div>
          <input class="lpm-notion-search" id="lpm-notion-search" placeholder="Search a parent page..." autofocus>
          <p style="font-size:10px;color:#9ca3af;margin:0 0 8px;">Select a parent page — a new sub-page "<strong>${escapeHtml(sessionName)}</strong>" will be created inside it.</p>
          <div id="lpm-notion-results">
            <div class="lpm-notion-empty">Searching...</div>
          </div>
        </div>
      </div>
    `;

    shadowRoot.appendChild(notionOverlay);

    // Show last used page as quick-select
    const defaultDiv = notionOverlay.querySelector('#lpm-notion-default');
    chrome.storage.local.get('lastNotionPage', (result) => {
      const last = result.lastNotionPage;
      if (last?.id && last?.title) {
        const el = document.createElement('div');
        el.className = 'lpm-notion-page';
        el.style.background = '#f0f9ff';
        el.style.border = '1px solid #bae6fd';
        el.style.borderRadius = '6px';
        el.style.marginBottom = '8px';
        el.innerHTML = '';
        const pin = document.createElement('span');
        pin.textContent = '📌';
        pin.style.fontSize = '14px';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'lpm-notion-page-name';
        nameSpan.textContent = last.title;
        el.appendChild(pin);
        el.appendChild(nameSpan);
        el.addEventListener('click', () => createNotionSubPage(last.id, last.title));
        defaultDiv.appendChild(el);
      }
    });

    const searchInput = notionOverlay.querySelector('#lpm-notion-search');
    const resultsDiv = notionOverlay.querySelector('#lpm-notion-results');
    let debounceTimer = null;

    function searchPages() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = searchInput.value.trim();
        resultsDiv.innerHTML = '<div class="lpm-notion-empty">Searching...</div>';
        safeSendMessage({ type: 'NOTION_SEARCH_PAGES', query }, (resp) => {
          if (resp?.success && resp.pages.length > 0) {
            resultsDiv.innerHTML = '';
            resp.pages.forEach((page) => {
              const el = document.createElement('div');
              el.className = 'lpm-notion-page';
              const iconSpan = document.createElement('span');
              iconSpan.className = 'lpm-notion-page-icon';
              iconSpan.textContent = page.icon;
              const nameSpan = document.createElement('span');
              nameSpan.className = 'lpm-notion-page-name';
              nameSpan.textContent = page.title;
              el.appendChild(iconSpan);
              el.appendChild(nameSpan);
              el.addEventListener('click', () => createNotionSubPage(page.id, page.title));
              resultsDiv.appendChild(el);
            });
          } else if (resp?.error) {
            resultsDiv.innerHTML = `<div class="lpm-notion-empty">${escapeHtml(resp.error)}</div>`;
          } else {
            resultsDiv.innerHTML = '<div class="lpm-notion-empty">No pages found</div>';
          }
        });
      }, 300);
    }

    searchInput.addEventListener('input', searchPages);
    // Trigger initial search
    searchPages();

    notionOverlay.querySelector('#lpm-notion-close').addEventListener('click', closeNotionPush);
    notionOverlay.addEventListener('mousedown', (e) => {
      if (e.target === notionOverlay) closeNotionPush();
    });
  }

  function createNotionSubPage(parentId, parentTitle) {
    if (!notionOverlay) return;
    const body = notionOverlay.querySelector('#lpm-notion-body');
    const hasScreenshots = screenshots.length > 0;
    body.innerHTML = `<div class="lpm-notion-pushing"><div class="lpm-spinner"></div><span>${hasScreenshots ? 'Uploading screenshots & creating page...' : 'Creating page...'}</span></div>`;

    safeSendMessage({
      type: 'NOTION_CREATE_PAGE',
      parentId,
      title: sessionName,
      markdown: generatedMarkdown,
    }, (resp) => {
      if (resp?.success && resp.url) {
        body.innerHTML = `
          <div style="text-align:center;padding:20px 0;">
            <div style="font-size:24px;margin-bottom:8px;">✅</div>
            <p style="font-size:13px;font-weight:500;color:#1a1a2e;margin:0 0 4px;">Page created in "${escapeHtml(parentTitle)}"</p>
            <a href="${resp.url}" target="_blank" rel="noopener"
              style="font-size:12px;color:#3b82f6;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
              Open in Notion →
            </a>
          </div>
        `;
        // Show persistent link in doc view
        showNotionLink(resp.url);
        // Remember this page as default for next time
        chrome.storage.local.set({ lastNotionPage: { id: parentId, title: parentTitle } });
      } else {
        body.innerHTML = `<div class="lpm-notion-empty" style="color:#ef4444">${escapeHtml(resp?.error || 'Failed to create page')}</div>`;
      }
    });
  }

  function showNotionLink(url) {
    if (!shadowRoot) return;
    const linkBar = shadowRoot.getElementById('lpm-notion-link');
    if (!linkBar) return;
    linkBar.classList.remove('lpm-hidden');
    linkBar.innerHTML = `✅ <a href="${url}" target="_blank" rel="noopener">Open in Notion →</a>`;
  }

  function closeNotionPush() {
    if (notionOverlay) { notionOverlay.remove(); notionOverlay = null; }
  }

  // ═══════════════════════════════════════════
  //  NOTE MODAL
  // ═══════════════════════════════════════════

  let noteOverlay = null;

  function openNoteModal() {
    if (noteOverlay) return;
    noteOverlay = document.createElement('div');
    noteOverlay.className = 'lpm-note-overlay';
    noteOverlay.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    // Carry over any text from the inline input
    const inlineInput = shadowRoot?.getElementById('lpm-note-input');
    const existingText = inlineInput?.value || '';

    noteOverlay.innerHTML = `
      <div class="lpm-note-modal">
        <div class="lpm-note-modal-header">
          <span class="lpm-note-modal-title">Add Note</span>
          <button class="lpm-icon-btn" id="lpm-note-modal-close" title="Close">${ICONS.close}</button>
        </div>
        <div class="lpm-note-modal-body">
          <textarea class="lpm-note-modal-textarea" id="lpm-note-modal-text" placeholder="Write your note in markdown...">${existingText}</textarea>
          <div class="lpm-note-modal-hint">Markdown supported. This will be added as a transcript entry.</div>
        </div>
        <div class="lpm-note-modal-footer">
          <button class="lpm-note-modal-btn lpm-note-modal-cancel" id="lpm-note-modal-cancel">Cancel</button>
          <button class="lpm-note-modal-btn lpm-note-modal-save" id="lpm-note-modal-save">Add Note</button>
        </div>
      </div>
    `;

    shadowRoot.appendChild(noteOverlay);

    const textarea = noteOverlay.querySelector('#lpm-note-modal-text');
    textarea.focus();
    // Move cursor to end
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

    noteOverlay.querySelector('#lpm-note-modal-close').addEventListener('click', closeNoteModal);
    noteOverlay.querySelector('#lpm-note-modal-cancel').addEventListener('click', closeNoteModal);
    noteOverlay.querySelector('#lpm-note-modal-save').addEventListener('click', () => {
      const text = textarea.value.trim();
      if (text) {
        safeSendMessage({ type: 'ADD_NOTE', text }, (resp) => {
          if (resp?.success && resp.transcript) {
            transcripts.push(resp.transcript);
            invalidateDoc();
            renderTranscripts();
          }
        });
        if (inlineInput) inlineInput.value = '';
      }
      closeNoteModal();
    });
    noteOverlay.addEventListener('click', (e) => {
      if (e.target === noteOverlay) closeNoteModal();
    });
  }

  function closeNoteModal() {
    if (noteOverlay) { noteOverlay.remove(); noteOverlay = null; }
  }

  // ═══════════════════════════════════════════
  //  SESSION MANAGEMENT
  // ═══════════════════════════════════════════

  function saveCurrentSession() {
    safeSendMessage({
      type: 'SAVE_SESSION',
      name: sessionName,
      markdown: generatedMarkdown,
    }, (resp) => {
      if (resp?.success) {
        sessionSaved = true;
        showToast('Session saved');
      } else {
        showToast(resp?.error || 'Save failed');
      }
    });
  }

  function startNewSession() {
    // Save current first if there's content and not already saved
    const hasContent = screenshots.length > 0 || transcripts.length > 0;
    if (hasContent && !sessionSaved) {
      safeSendMessage({
        type: 'SAVE_SESSION', name: sessionName, markdown: generatedMarkdown,
      });
    }

    // Reset state
    safeSendMessage({ type: 'NEW_SESSION' }, () => {
      screenshots = [];
      transcripts = [];
      generatedMarkdown = '';
      hasGeneratedDoc = false;
      sessionSaved = false;
      sessionName = 'Untitled Session';

      if (shadowRoot) {
        const nameInput = shadowRoot.getElementById('lpm-session-name');
        if (nameInput) nameInput.value = sessionName;
        showSessionView();
        renderGrid();
        renderTranscripts();
      }
      showToast('New session started');
    });
  }

  // ═══════════════════════════════════════════
  //  MARKDOWN PREVIEW RENDERER
  // ═══════════════════════════════════════════

  function renderMarkdownWithScreenshots(md) {
    // Simple markdown to HTML (headings, bold, italic, lists, code, hr)
    let html = escapeHtml(md);

    // Headings
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Horizontal rule
    html = html.replace(/^---+$/gm, '<hr>');

    // Unordered lists
    html = html.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

    // Checkboxes
    html = html.replace(/\[ \]/g, '☐');
    html = html.replace(/\[x\]/gi, '☑');

    // Tables (basic)
    html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map((c) => c.trim());
      if (cells.every((c) => /^[\-:]+$/.test(c))) return ''; // separator row
      const tag = 'td';
      return '<tr>' + cells.map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    });
    html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (match) => `<table>${match}</table>`);

    // Screenshot placeholders → inline images
    // Match patterns: [📷 SS-1], [📷 SS-2], SS-1, SS-2, etc.
    html = html.replace(/\[📷\s*SS-(\d+)\]|(?<!\w)SS-(\d+)(?!\w)/g, (match, n1, n2) => {
      const idx = parseInt(n1 || n2) - 1;
      if (idx >= 0 && idx < screenshots.length) {
        const ss = screenshots[idx];
        const src = ss.annotatedUrl || ss.dataUrl;
        return `<div class="lpm-preview-ss">
          <img src="${src}" alt="SS-${idx + 1}">
          <span class="lpm-preview-ss-label">📷 SS-${idx + 1}</span>
        </div>`;
      }
      return match;
    });

    // Paragraphs — wrap remaining lines
    html = html.replace(/^(?!<[hluot\-]|<hr|<div|<table|<tr)(.+)$/gm, '<p>$1</p>');

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');

    return html;
  }

  // ═══════════════════════════════════════════
  //  FULL-SCREEN MARKDOWN EDITOR
  // ═══════════════════════════════════════════

  let editorOverlay = null;

  function openFullScreenEditor() {
    if (editorOverlay) return;
    if (!shadowRoot) return;

    // Sync current content from small editor
    const smallContent = shadowRoot.getElementById('lpm-doc-content');
    if (smallContent) generatedMarkdown = smallContent.value;

    editorOverlay = document.createElement('div');
    editorOverlay.className = 'lpm-editor-overlay';
    editorOverlay.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    // Build screenshot legend HTML
    let legendHTML = '';
    if (screenshots.length > 0) {
      legendHTML = screenshots.map((ss, i) =>
        `<div class="lpm-editor-legend-card" data-ss-idx="${i}">
          <img src="${ss.annotatedUrl || ss.dataUrl}" alt="SS-${i + 1}">
          <span class="lpm-editor-legend-label">SS-${i + 1}</span>
        </div>`
      ).join('');
    }

    // Build raw transcript text for source tab
    const rawTranscript = transcripts.map((tr, i) => {
      const time = new Date(tr.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dur = tr.duration ? ` (${tr.duration}s)` : '';
      return `[${time}]${dur}: ${tr.text}`;
    }).join('\n\n') || 'No transcripts recorded.';

    editorOverlay.innerHTML = `
      <div class="lpm-editor-modal">
        <div class="lpm-editor-header">
          <div class="lpm-editor-header-left">
            <div class="lpm-editor-tabs">
              <button class="lpm-editor-tab active" data-tab="doc">Edit</button>
              <button class="lpm-editor-tab" data-tab="preview">Preview</button>
              <button class="lpm-editor-tab" data-tab="source">Source</button>
            </div>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="lpm-doc-btn lpm-doc-btn-primary" id="lpm-editor-save" title="Save changes and close editor">${ICONS.check} Save & Close</button>
            <button class="lpm-icon-btn" id="lpm-editor-close" title="Close">${ICONS.close}</button>
          </div>
        </div>
        <div class="lpm-editor-body" id="lpm-editor-tab-doc">
          <textarea class="lpm-editor-textarea" id="lpm-editor-textarea">${escapeHtml(generatedMarkdown)}</textarea>
        </div>
        <div class="lpm-editor-body lpm-hidden" id="lpm-editor-tab-preview">
          <div class="lpm-preview-content" id="lpm-preview-content"></div>
        </div>
        <div class="lpm-editor-body lpm-hidden" id="lpm-editor-tab-source">
          <textarea class="lpm-editor-textarea lpm-editor-source" id="lpm-editor-source">${escapeHtml(rawTranscript)}</textarea>
        </div>
        <div class="lpm-editor-refine">
          <input class="lpm-editor-refine-input" id="lpm-editor-refine" placeholder="Refine: e.g. make it shorter, add acceptance criteria..." />
          <button class="lpm-refine-send" id="lpm-editor-refine-send" title="Refine document with instructions">${ICONS.sparkle} Refine</button>
        </div>
        <div class="lpm-editor-footer">
          <div class="lpm-editor-legend">${legendHTML}</div>
          <div class="lpm-editor-actions">
            <button class="lpm-doc-btn lpm-doc-btn-primary" id="lpm-editor-copy" title="Copy to clipboard">${ICONS.copy} Copy</button>
            <button class="lpm-doc-btn lpm-doc-btn-ghost" id="lpm-editor-download" title="Download as .md file">${ICONS.download} Download</button>
            <button class="lpm-doc-btn lpm-doc-btn-ghost" id="lpm-editor-notion" title="Push to Notion">${ICONS.notion} Notion</button>
            <button class="lpm-doc-btn lpm-doc-btn-ghost" id="lpm-editor-regenerate" title="Regenerate from scratch">${ICONS.refresh} Regenerate</button>
          </div>
        </div>
      </div>
    `;

    shadowRoot.appendChild(editorOverlay);

    const textarea = editorOverlay.querySelector('#lpm-editor-textarea');
    textarea.focus();

    // Events
    editorOverlay.querySelector('#lpm-editor-close').addEventListener('click', closeFullScreenEditor);
    editorOverlay.querySelector('#lpm-editor-save').addEventListener('click', () => {
      generatedMarkdown = textarea.value;
      // Sync back to small editor
      const small = shadowRoot.getElementById('lpm-doc-content');
      if (small) {
        small.value = generatedMarkdown;
      }
      closeFullScreenEditor();
    });
    editorOverlay.querySelector('#lpm-editor-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(textarea.value);
      showToast('Copied to clipboard');
    });
    editorOverlay.querySelector('#lpm-editor-download').addEventListener('click', () => {
      const blob = new Blob([textarea.value], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'lazypm-document.md'; a.click();
      URL.revokeObjectURL(url);
    });
    editorOverlay.querySelector('#lpm-editor-notion').addEventListener('click', () => {
      generatedMarkdown = textarea.value;
      closeFullScreenEditor();
      openNotionPush();
    });
    editorOverlay.querySelector('#lpm-editor-regenerate').addEventListener('click', () => {
      closeFullScreenEditor();
      generateDoc();
    });

    // Refine in full-screen editor
    const editorRefineInput = editorOverlay.querySelector('#lpm-editor-refine');
    editorOverlay.querySelector('#lpm-editor-refine-send').addEventListener('click', () => {
      const prompt = editorRefineInput.value.trim();
      if (!prompt) return;
      // Save current edits first
      generatedMarkdown = textarea.value;
      closeFullScreenEditor();
      refineDoc(prompt);
    });
    editorRefineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const prompt = editorRefineInput.value.trim();
        if (!prompt) return;
        generatedMarkdown = textarea.value;
        closeFullScreenEditor();
        refineDoc(prompt);
      }
    });

    // Tab switching
    editorOverlay.querySelectorAll('.lpm-editor-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        editorOverlay.querySelectorAll('.lpm-editor-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        editorOverlay.querySelector('#lpm-editor-tab-doc').classList.toggle('lpm-hidden', tabName !== 'doc');
        editorOverlay.querySelector('#lpm-editor-tab-preview').classList.toggle('lpm-hidden', tabName !== 'preview');
        editorOverlay.querySelector('#lpm-editor-tab-source').classList.toggle('lpm-hidden', tabName !== 'source');

        // Render preview when switching to preview tab
        if (tabName === 'preview') {
          const currentMd = editorOverlay.querySelector('#lpm-editor-textarea').value;
          const previewEl = editorOverlay.querySelector('#lpm-preview-content');
          previewEl.innerHTML = renderMarkdownWithScreenshots(currentMd);
        }
      });
    });

    // Sync source edits back to transcripts
    const sourceTextarea = editorOverlay.querySelector('#lpm-editor-source');
    sourceTextarea.addEventListener('blur', () => {
      // Update transcripts from edited source (simple: store the full edited text as first transcript)
      if (transcripts.length > 0) {
        const lines = sourceTextarea.value.split('\n\n').filter(Boolean);
        lines.forEach((line, i) => {
          if (transcripts[i]) {
            const textMatch = line.match(/:\s*(.*)/);
            if (textMatch) transcripts[i].text = textMatch[1];
          }
        });
      }
    });

    // Screenshot legend clicks
    editorOverlay.querySelectorAll('.lpm-editor-legend-card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.ssIdx);
        const ref = `[📷 SS-${idx + 1}]`;
        const pos = textarea.selectionStart;
        textarea.value = textarea.value.slice(0, pos) + ref + textarea.value.slice(pos);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = pos + ref.length;
      });
    });

    // Close on backdrop
    editorOverlay.addEventListener('mousedown', (e) => {
      if (e.target === editorOverlay) closeFullScreenEditor();
    });
  }

  function closeFullScreenEditor() {
    if (editorOverlay) {
      // Sync content before closing
      const textarea = editorOverlay.querySelector('#lpm-editor-textarea');
      if (textarea) generatedMarkdown = textarea.value;
      editorOverlay.remove();
      editorOverlay = null;
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ═══════════════════════════════════════════
  //  VISIBILITY CONTROL
  // ═══════════════════════════════════════════

  function checkVisibility() {
    try {
      if (!chrome.runtime?.id) return;
      chrome.storage.local.get('settings', (result) => {
        if (chrome.runtime.lastError) return;
        const enabled = result.settings?.widgetEnabled === true;
        if (enabled) injectWidget(); else removeWidget();
      });
    } catch (e) {
      console.warn('[TheLazyPM] Cannot check visibility — context invalidated');
    }
  }

  try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      const enabled = changes.settings.newValue?.widgetEnabled === true;
      if (enabled) injectWidget(); else removeWidget();
    }
  });

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SCREENSHOT_TAKEN' && message.dataUrl) {
      addScreenshot(message.dataUrl, message.timestamp, message.url);
    } else if (message.type === 'SESSION_DATA_UPDATED') {
      // Another tab added/removed data — refresh our view
      safeSendMessage({ type: 'GET_SCREENSHOTS' }, (resp) => {
        if (resp?.success) {
          screenshots = resp.screenshots;
          renderGrid();
        }
      });
      safeSendMessage({ type: 'GET_TRANSCRIPTS' }, (resp) => {
        if (resp?.success) {
          transcripts = resp.transcripts;
          renderTranscripts();
        }
      });
    } else if (message.type === 'STOP_RECORDING_REQUEST') {
      // Another tab wants us to stop — only act if we have the recorder
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
      }
    } else if (message.type === 'TOGGLE_RECORDING') {
      toggleRecording();
    } else if (message.type === 'SESSION_LOADED' && message.session) {
      // Restore session from history
      const s = message.session;
      sessionName = s.name || 'Untitled Session';
      generatedMarkdown = s.markdown || '';
      hasGeneratedDoc = !!s.markdown;
      transcripts = (s.transcripts || []).map((t) => ({ text: t.text, timestamp: t.timestamp, duration: t.duration }));

      // Render transcripts and session view immediately
      if (shadowRoot) {
        const nameInput = shadowRoot.getElementById('lpm-session-name');
        if (nameInput) nameInput.value = sessionName;
        showSessionView();
        renderTranscripts();
      }

      // Fetch restored screenshots separately
      safeSendMessage({ type: 'GET_SCREENSHOTS' }, (resp) => {
        screenshots = (resp?.success && resp.screenshots) ? resp.screenshots : [];
        renderGrid();
        if (hasGeneratedDoc) {
          showDocView(generatedMarkdown);
        }
      });
    } else if (message.type === 'SESSION_CLEARED') {
      // Active session was deleted — reset widget
      screenshots = [];
      transcripts = [];
      generatedMarkdown = '';
      hasGeneratedDoc = false;
      sessionSaved = false;
      sessionName = 'Untitled Session';
      if (shadowRoot) {
        const nameInput = shadowRoot.getElementById('lpm-session-name');
        if (nameInput) nameInput.value = sessionName;
        showSessionView();
        renderTranscripts();
        renderGrid();
      }
    }
  });
  } catch (e) {
    console.warn('[TheLazyPM] Failed to register listeners — context may be invalidated');
  }

  // Sync pending edits on page unload
  window.addEventListener('beforeunload', () => {
    if (generatedMarkdown) syncMeta();
  });

  if (document.body) checkVisibility();
  else document.addEventListener('DOMContentLoaded', checkVisibility);

  console.log('[TheLazyPM] Content script loaded');
})();
