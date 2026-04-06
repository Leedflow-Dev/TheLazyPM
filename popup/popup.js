// The Lazy PM — Popup Settings

function getFormValues() {
  return {
    widgetEnabled: document.getElementById('widget-enabled').checked,
    openrouterKey: document.getElementById('openrouter-key').value,
    groqKey: document.getElementById('groq-key').value,
    notionToken: document.getElementById('notion-token').value,
    model: document.getElementById('model-select').value,
  };
}

function setFormValues(data) {
  document.getElementById('widget-enabled').checked = data.widgetEnabled === true;
  if (data.openrouterKey) document.getElementById('openrouter-key').value = data.openrouterKey;
  if (data.groqKey) document.getElementById('groq-key').value = data.groqKey;
  if (data.notionToken) document.getElementById('notion-token').value = data.notionToken;
  if (data.model) document.getElementById('model-select').value = data.model;
}

function showStatus(message, isError) {
  const el = document.getElementById('status-msg');
  el.textContent = message;
  el.style.color = isError ? '#ef4444' : '#22c55e';
  setTimeout(() => { el.textContent = ''; }, 2000);
}

// Load settings + history on popup open
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('settings', (result) => {
    if (result.settings) setFormValues(result.settings);
  });
  loadHistory();
});

// Save settings
document.getElementById('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const settings = getFormValues();
  chrome.storage.local.set({ settings }, () => {
    if (chrome.runtime.lastError) {
      showStatus('Error saving settings', true);
    } else {
      showStatus('Settings saved');
    }
  });
});

// Widget toggle — immediate
document.getElementById('widget-enabled').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  chrome.storage.local.get('settings', (result) => {
    const settings = result.settings || {};
    settings.widgetEnabled = enabled;
    chrome.storage.local.set({ settings });
  });
});

// ── Session History ──
function loadHistory() {
  chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }, (resp) => {
    const list = document.getElementById('history-list');
    if (!resp?.success || !resp.sessions.length) {
      list.innerHTML = '<p class="history-empty">No saved sessions yet</p>';
      return;
    }

    list.innerHTML = '';
    resp.sessions.forEach((session) => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const date = new Date(session.createdAt);
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const meta = [
        `${dateStr} ${timeStr}`,
        session.transcriptCount ? `${session.transcriptCount} transcript${session.transcriptCount > 1 ? 's' : ''}` : null,
        session.screenshotCount ? `${session.screenshotCount} screenshot${session.screenshotCount > 1 ? 's' : ''}` : null,
      ].filter(Boolean).join(' · ');

      item.innerHTML = `
        <div class="history-info">
          <div class="history-name">${session.name}</div>
          <div class="history-meta">${meta}</div>
        </div>
        <div class="history-actions">
          <button class="history-btn history-btn-load" data-id="${session.id}">Load</button>
          <button class="history-btn history-btn-delete" data-id="${session.id}">✕</button>
        </div>
      `;

      item.querySelector('.history-btn-load').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'LOAD_SESSION', id: session.id }, (resp) => {
          if (resp?.success) {
            showStatus(`Loaded: ${session.name}`);
            // Notify active tab to refresh widget
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  type: 'SESSION_LOADED',
                  session: resp.session,
                });
              }
            });
          } else {
            showStatus(resp?.error || 'Load failed', true);
          }
        });
      });

      item.querySelector('.history-btn-delete').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'DELETE_SESSION', id: session.id }, (resp) => {
          if (resp?.success) {
            loadHistory();
            if (resp.wasActive) {
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                  chrome.tabs.sendMessage(tabs[0].id, { type: 'SESSION_CLEARED' });
                }
              });
            }
          }
        });
      });

      list.appendChild(item);
    });
  });
}
