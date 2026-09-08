// Shine Flow Agent — Popup & Side Panel UI Controller
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const headerToken = document.getElementById('header-token');
  const valDevice = document.getElementById('val-device');
  const valCredits = document.getElementById('val-credits');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const workerToggle = document.getElementById('worker-toggle');

  const metricTotal = document.getElementById('metric-total');
  const metricRunning = document.getElementById('metric-running');
  const metricSuccess = document.getElementById('metric-success');
  const metricFailed = document.getElementById('metric-failed');

  const activeTasksList = document.getElementById('active-tasks-list');
  const activeTasksCount = document.getElementById('active-tasks-count');
  const historyTasksList = document.getElementById('history-tasks-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  // Create form elements
  const inputPrompt = document.getElementById('input-prompt');
  const inputType = document.getElementById('input-type');
  const inputModel = document.getElementById('input-model');
  const inputAspect = document.getElementById('input-aspect');
  const inputDuration = document.getElementById('input-duration');
  const fieldDuration = document.getElementById('field-duration');
  const btnGenerate = document.getElementById('btn-generate');
  const genResultContainer = document.getElementById('gen-result-container');

  // Media & Logs
  const mediaGrid = document.getElementById('media-grid');
  const btnRefreshMedia = document.getElementById('btn-refresh-media');
  const btnDeleteAllMedia = document.getElementById('btn-delete-all-media');
  const logsList = document.getElementById('logs-list');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  // Settings
  const inputAccountId = document.getElementById('input-account-id');
  const inputAccountLabel = document.getElementById('input-account-label');
  const inputServerWs = document.getElementById('input-server-ws');
  const btnNewId = document.getElementById('btn-new-id');
  const btnAutoDetect = document.getElementById('btn-auto-detect');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnSyncCookies = document.getElementById('btn-sync-cookies');

  // Bottom buttons
  const btnOpenFlow = document.getElementById('btn-open-flow');
  const btnRefreshToken = document.getElementById('btn-refresh-token');
  const toast = document.getElementById('toast');

  let currentServerHttpUrl = 'http://localhost:8088';
  let isWorkerEnabled = true;

  // ── Toast Helper ───────────────────────────────────────────────────────────
  let toastTimer = null;
  function showToast(msg, type = 'success') {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = `show ${type}`;
    toastTimer = setTimeout(() => {
      toast.className = '';
    }, 2800);
  }

  // ── Tabs Navigation ────────────────────────────────────────────────────────
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const activePanel = document.getElementById(`panel-${target}`);
      if (activePanel) activePanel.classList.add('active');

      if (target === 'media') loadMedia();
    });
  });

  // ── Status & Rendering ─────────────────────────────────────────────────────
  function updateUI(data) {
    if (!data) return;

    if (data.serverUrl) currentServerHttpUrl = data.serverUrl;
    isWorkerEnabled = data.isWorkerEnabled !== false;

    // Header values
    const deviceId = (data.accountId || '—').replace(/^google_acc_/, '');
    valDevice.textContent = deviceId;
    valCredits.textContent = data.credits !== null && data.credits !== undefined ? data.credits : '—';

    if (data.tokenAge !== null && data.tokenAge !== undefined) {
      const minutes = Math.floor(data.tokenAge / 60000);
      headerToken.textContent = `Token ${minutes}m`;
    } else {
      headerToken.textContent = data.isConnected ? 'Token Active' : 'No token';
    }

    // Toggle switch
    workerToggle.textContent = isWorkerEnabled ? 'ON' : 'OFF';
    workerToggle.className = `toggle-switch ${isWorkerEnabled ? 'on' : ''}`;

    // Connection & Status
    const runningJobsCount = (data.activeTasks || []).length;
    if (!data.isConnected) {
      statusDot.className = 'status-dot offline';
      statusText.textContent = 'Disconnected';
      statusText.style.color = 'var(--red)';
    } else if (!isWorkerEnabled) {
      statusDot.className = 'status-dot';
      statusText.textContent = 'Worker Paused (OFF)';
      statusText.style.color = 'var(--muted)';
    } else if (runningJobsCount > 0) {
      statusDot.className = 'status-dot busy';
      statusText.textContent = `Generating (${runningJobsCount} parallel)...`;
      statusText.style.color = 'var(--yellow)';
    } else {
      statusDot.className = 'status-dot online';
      statusText.textContent = 'Connected (Ready)';
      statusText.style.color = 'var(--green)';
    }

    // Tab badge for running tasks
    const tasksTabBtn = document.querySelector('[data-tab="tasks"]');
    if (tasksTabBtn) {
      tasksTabBtn.classList.toggle('has-running', runningJobsCount > 0);
    }

    // Metrics
    const metrics = data.metrics || { total: 0, success: 0, failed: 0 };
    metricTotal.textContent = metrics.total || 0;
    metricRunning.textContent = runningJobsCount;
    metricSuccess.textContent = metrics.success || 0;
    metricFailed.textContent = metrics.failed || 0;

    // Active Parallel Tasks
    renderActiveTasks(data.activeTasks || []);

    // Recent History
    renderHistoryTasks(data.taskHistory || []);

    // Settings inputs (only fill if user is not currently typing)
    if (document.activeElement !== inputAccountId && data.accountId) {
      inputAccountId.value = data.customAccountId || data.accountId;
    }
    if (document.activeElement !== inputAccountLabel && data.accountLabel) {
      inputAccountLabel.value = data.accountLabel;
    }
    if (document.activeElement !== inputServerWs && data.serverWsUrl) {
      inputServerWs.value = data.serverWsUrl;
    }
  }

  function renderActiveTasks(tasks) {
    activeTasksCount.textContent = `${tasks.length} active`;
    if (!tasks || tasks.length === 0) {
      activeTasksList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚡</div>
          <div>No tasks running. Ready for parallel jobs.</div>
        </div>`;
      return;
    }

    activeTasksList.innerHTML = tasks.map(task => {
      const typeClass = task.type === 'VIDEO' ? 'badge-video' : 'badge-image';
      const prompt = escapeHtml(task.prompt || 'Untitled Generation');
      const seconds = task.elapsedSeconds !== undefined ? `${task.elapsedSeconds}s` : '0s';

      return `
        <div class="task-card running">
          <div class="task-header">
            <div class="task-meta-left">
              <span class="badge ${typeClass}">${task.type || 'IMAGE'}</span>
              <span class="task-id">#${escapeHtml(String(task.jobId).slice(-6))}</span>
              <span class="badge badge-running">● RUNNING</span>
            </div>
            <span class="task-timer">⏱ ${seconds}</span>
          </div>
          <div class="task-prompt" title="${prompt}">"${prompt}"</div>
          <div class="task-footer">
            <div class="task-spec">
              <span>${escapeHtml(task.model || 'Standard')}</span>
              <span>·</span>
              <span>${escapeHtml(task.aspectRatio || '9:16')}</span>
            </div>
            <span style="color:var(--yellow); font-weight:700;">In Progress...</span>
          </div>
        </div>`;
    }).join('');
  }

  function renderHistoryTasks(history) {
    if (!history || history.length === 0) {
      historyTasksList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div>No completed tasks yet.</div>
        </div>`;
      return;
    }

    historyTasksList.innerHTML = history.slice(0, 10).map(task => {
      const isOk = task.status === 'SUCCESS';
      const statusClass = isOk ? 'success' : 'failed';
      const badgeClass = isOk ? 'badge-success' : 'badge-failed';
      const statusText = isOk ? '✓ SUCCESS' : '✕ FAILED';
      const typeClass = task.type === 'VIDEO' ? 'badge-video' : 'badge-image';
      const prompt = escapeHtml(task.prompt || 'Untitled Task');
      const duration = task.durationMs ? `${(task.durationMs / 1000).toFixed(1)}s` : '';

      let mediaPreview = '';
      if (isOk && task.mediaUrl) {
        if (task.type === 'VIDEO') {
          mediaPreview = `<video src="${task.mediaUrl}" controls class="task-thumb" preload="metadata"></video>`;
        } else {
          mediaPreview = `<a href="${task.mediaUrl}" target="_blank"><img src="${task.mediaUrl}" class="task-thumb" loading="lazy" alt="${prompt}" /></a>`;
        }
      }

      const errorRow = task.error
        ? `<div style="color:var(--red); font-size:9px; margin-top:4px; font-family:var(--mono);">${escapeHtml(task.error)}</div>`
        : '';

      return `
        <div class="task-card ${statusClass}">
          <div class="task-header">
            <div class="task-meta-left">
              <span class="badge ${typeClass}">${task.type || 'IMAGE'}</span>
              <span class="task-id">#${escapeHtml(String(task.jobId).slice(-6))}</span>
              <span class="badge ${badgeClass}">${statusText}</span>
            </div>
            <span class="task-timer">${duration}</span>
          </div>
          <div class="task-prompt" title="${prompt}">"${prompt}"</div>
          ${errorRow}
          ${mediaPreview}
          <div class="task-footer" style="margin-top:6px;">
            <div class="task-spec">
              <span>${escapeHtml(task.model || 'Standard')}</span>
              <span>·</span>
              <span>${escapeHtml(task.aspectRatio || '9:16')}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Create Tab Controls ────────────────────────────────────────────────────
  const typeBtns = document.querySelectorAll('.type-btn');
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const isVideo = btn.dataset.type === 'video';
      inputType.value = isVideo ? 'video' : 'image';

      // Update model options
      if (isVideo) {
        inputModel.innerHTML = `
          <option value="veo_3_1_fast">Veo 3.1 Fast</option>
          <option value="veo_3_1_quality">Veo 3.1 Quality</option>
        `;
        fieldDuration.style.display = 'block';
      } else {
        inputModel.innerHTML = `
          <option value="Nano Banana 2">Nano Banana 2</option>
          <option value="Nano Banana Pro">Nano Banana Pro</option>
          <option value="Nano Banana Lite">Nano Banana Lite</option>
        `;
        fieldDuration.style.display = 'none';
      }
    });
  });

  // Quick Generate Button
  btnGenerate.addEventListener('click', async () => {
    const prompt = inputPrompt.value.trim();
    if (!prompt) {
      showToast('Please enter a prompt', 'error');
      inputPrompt.focus();
      return;
    }

    const type = inputType.value;
    const model = inputModel.value;
    const aspectRatio = inputAspect.value;
    const duration = Number(inputDuration.value || 8);

    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Dispatching to Flow...';
    genResultContainer.innerHTML = '<div style="color:var(--text-dim); font-size:11px;">Enqueuing task...</div>';

    try {
      const endpoint = type === 'video' ? '/v1/videos/generations' : '/v1/images/generations';
      const payload = type === 'video'
        ? { prompt, model, aspectRatio, duration, async: false }
        : { prompt, model, aspectRatio };

      const resp = await fetch(`${currentServerHttpUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await resp.json();
      if (!resp.ok) {
        throw new Error(resData?.error?.message || resData?.message || `HTTP ${resp.status}`);
      }

      const mediaUrl = resData.data?.[0]?.url || resData.mediaUrl || resData.data?.mediaUrl;
      if (mediaUrl) {
        showToast('Generation complete!', 'success');
        const previewEl = type === 'video'
          ? `<video src="${mediaUrl}" controls style="width:100%; border-radius:8px; margin-top:8px;"></video>`
          : `<img src="${mediaUrl}" style="width:100%; border-radius:8px; margin-top:8px;" alt="Result" />`;

        genResultContainer.innerHTML = `
          <div style="background:#fff; border:1px solid var(--border); border-radius:8px; padding:8px;">
            <div style="font-weight:700; font-size:11px; color:var(--green);">✓ Generated Successfully</div>
            ${previewEl}
            <div style="margin-top:6px; text-align:right;">
              <a href="${mediaUrl}" target="_blank" style="color:var(--accent); font-weight:800; font-size:10px; text-decoration:none;">Open Full Size ↗</a>
            </div>
          </div>`;
      } else {
        genResultContainer.innerHTML = '<div style="color:var(--green); font-size:11px;">Job finished. Check Flow tab for results.</div>';
      }

      // Switch to Tasks tab to view progress/history
      loadMedia();
    } catch (err) {
      showToast(`Generation failed: ${err.message}`, 'error');
      genResultContainer.innerHTML = `<div style="color:var(--red); font-size:11px;">Error: ${escapeHtml(err.message)}</div>`;
    } finally {
      btnGenerate.disabled = false;
      btnGenerate.textContent = 'Generate with Flow';
    }
  });

  // ── Media Library ──────────────────────────────────────────────────────────
  async function loadMedia() {
    mediaGrid.innerHTML = '<div class="empty-state">Loading media from server...</div>';
    try {
      const resp = await fetch(`${currentServerHttpUrl}/v1/history`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const items = Array.isArray(data.history) ? data.history : (data.data || []);

      if (items.length === 0) {
        mediaGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🖼</div>
            <div>No generated media found in history.</div>
          </div>`;
        return;
      }

      mediaGrid.innerHTML = items.map(item => {
        const url = escapeHtml(item.url || '');
        const prompt = escapeHtml(item.prompt || 'Generated Asset');
        const dateStr = item.timestamp ? new Date(item.timestamp * 1000).toLocaleString() : '';

        const mediaPreview = item.type === 'video'
          ? `<video src="${url}" controls preload="metadata" class="media-preview"></video>`
          : `<img src="${url}" alt="${prompt}" class="media-preview" loading="lazy" />`;

        return `
          <div class="media-item">
            ${mediaPreview}
            <div class="media-footer">
              <div class="media-info">
                <div class="media-prompt" title="${prompt}">${prompt}</div>
                <div class="media-time">${dateStr}</div>
              </div>
              <a href="${url}" target="_blank" class="media-link">View ↗</a>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      mediaGrid.innerHTML = `<div class="empty-state" style="color:var(--red);">Could not load media: ${escapeHtml(err.message)}</div>`;
    }
  }

  btnRefreshMedia.addEventListener('click', loadMedia);

  btnDeleteAllMedia.addEventListener('click', async () => {
    if (!confirm('Clear all media and generation history?')) return;
    try {
      await fetch(`${currentServerHttpUrl}/v1/history`, { method: 'DELETE' });
      showToast('Media history cleared', 'success');
      loadMedia();
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  });

  // ── Logs Tab ───────────────────────────────────────────────────────────────
  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      logsList.innerHTML = '<div class="empty-state">No request logs recorded yet.</div>';
      return;
    }

    logsList.innerHTML = logs.map(entry => {
      const time = entry.time ? new Date(entry.time).toLocaleTimeString() : '—';
      const isOk = entry.status === 'OK' || entry.status === 'SUCCESS';
      const badgeClass = isOk ? 'badge-success' : 'badge-failed';
      const details = escapeHtml(entry.details || entry.error || '');

      return `
        <div class="log-entry">
          <div class="log-row">
            <span class="log-time">${time}</span>
            <span class="badge ${badgeClass}">${escapeHtml(entry.type || 'LOG')}</span>
            <span class="log-type">${escapeHtml(entry.prompt || entry.details || '')}</span>
          </div>
          ${details ? `<div class="log-detail">${details}</div>` : ''}
        </div>`;
    }).join('');

    // Toggle details on click
    logsList.querySelectorAll('.log-entry').forEach(el => {
      el.addEventListener('click', () => el.classList.toggle('open'));
    });
  }

  btnClearLogs.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, () => {
      renderLogs([]);
      showToast('Logs cleared');
    });
  });

  // ── Settings Handlers ──────────────────────────────────────────────────────
  btnNewId.addEventListener('click', () => {
    const randomHex = Math.random().toString(16).slice(2, 8);
    const newId = `google_acc_${randomHex}`;
    inputAccountId.value = newId;
    if (!inputAccountLabel.value) {
      inputAccountLabel.value = `Profile ${randomHex.toUpperCase()}`;
    }
    showToast(`Generated ID: ${newId}. Click Save to activate!`);
  });

  btnAutoDetect.addEventListener('click', () => {
    inputAccountId.value = '';
    showToast('Auto-detect mode set. Click Save & Reconnect!');
  });

  btnSaveSettings.addEventListener('click', () => {
    const serverWsUrl = inputServerWs.value.trim() || 'ws://localhost:8088/ws';
    const customAccountId = inputAccountId.value.trim();
    const accountLabel = inputAccountLabel.value.trim();

    btnSaveSettings.disabled = true;
    btnSaveSettings.textContent = 'Saving...';

    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      serverWsUrl,
      customAccountId,
      accountLabel,
    }, (res) => {
      btnSaveSettings.disabled = false;
      btnSaveSettings.textContent = 'Save & Reconnect';
      showToast('Settings saved & reconnecting!');
      fetchStatus();
    });
  });

  btnSyncCookies.addEventListener('click', () => {
    btnSyncCookies.disabled = true;
    btnSyncCookies.textContent = 'Syncing...';

    chrome.runtime.sendMessage({
      type: 'SYNC_COOKIES',
      accountId: inputAccountId.value.trim() || undefined,
      label: inputAccountLabel.value.trim() || undefined,
    }, (res) => {
      btnSyncCookies.disabled = false;
      btnSyncCookies.textContent = 'Sync Cookies';
      if (res && res.ok) {
        showToast('Google session cookies synced to server!');
        fetchStatus();
      } else {
        showToast(`Sync failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    });
  });

  // ── Worker Toggle & Bottom Actions ─────────────────────────────────────────
  workerToggle.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_WORKER' }, (res) => {
      if (res) {
        isWorkerEnabled = res.isWorkerEnabled;
        workerToggle.textContent = isWorkerEnabled ? 'ON' : 'OFF';
        workerToggle.className = `toggle-switch ${isWorkerEnabled ? 'on' : ''}`;
        showToast(`Worker ${isWorkerEnabled ? 'Enabled' : 'Paused'}`);
        fetchStatus();
      }
    });
  });

  clearHistoryBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
      renderHistoryTasks([]);
      metricTotal.textContent = '0';
      metricSuccess.textContent = '0';
      metricFailed.textContent = '0';
      showToast('History cleared');
    });
  });

  btnOpenFlow.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_FLOW_TAB' });
  });

  btnRefreshToken.addEventListener('click', () => {
    btnRefreshToken.disabled = true;
    btnRefreshToken.textContent = 'Refreshing...';
    chrome.runtime.sendMessage({ type: 'REFRESH_TOKEN' }, () => {
      btnRefreshToken.disabled = false;
      btnRefreshToken.textContent = 'Refresh Token';
      showToast('Token refreshed');
      fetchStatus();
    });
  });

  // ── Manual Credit Sync on Agent ───────────────────────────────────────────
  const badgeCredits = document.getElementById('badge-credits');
  const btnSyncCreditsBottom = document.getElementById('btn-sync-credits-bottom');
  const iconSyncCredits = document.getElementById('icon-sync-credits');

  async function triggerManualCreditSync() {
    if (badgeCredits) badgeCredits.classList.add('syncing');
    if (iconSyncCredits) iconSyncCredits.classList.add('spinning');
    if (btnSyncCreditsBottom) {
      btnSyncCreditsBottom.disabled = true;
      btnSyncCreditsBottom.innerHTML = '<span>⏳ Syncing...</span>';
    }
    showToast('⏳ Syncing credits from Flow...', 'info');

    chrome.runtime.sendMessage({ type: 'CHECK_CREDITS' }, (resp) => {
      if (btnSyncCreditsBottom) {
        btnSyncCreditsBottom.disabled = false;
        btnSyncCreditsBottom.innerHTML = '<span>🔄 Sync Credit</span>';
      }
      setTimeout(() => {
        if (badgeCredits) badgeCredits.classList.remove('syncing');
        if (iconSyncCredits) iconSyncCredits.classList.remove('spinning');
      }, 1000);

      if (chrome.runtime.lastError) {
        showToast(`❌ ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (resp && resp.ok) {
        const credits = resp.credits !== undefined ? resp.credits : '—';
        if (valCredits) valCredits.textContent = credits;
        showToast(`✅ Credits synced: ${credits} credits`, 'success');
        fetchStatus();
      } else {
        showToast(`⚠️ ${resp?.error || 'Failed to sync credits'}`, 'error');
      }
    });
  }

  if (badgeCredits) {
    badgeCredits.addEventListener('click', triggerManualCreditSync);
  }
  if (btnSyncCreditsBottom) {
    btnSyncCreditsBottom.addEventListener('click', triggerManualCreditSync);
  }

  // ── DOM Rules & Inspector Tab Handlers ────────────────────────────────────
  const btnOpenInspector = document.getElementById('btn-open-inspector');
  const btnSyncRulesWorker = document.getElementById('btn-sync-rules-worker');
  const btnRefreshRules = document.getElementById('btn-refresh-rules');
  const btnResetRulesDefault = document.getElementById('btn-reset-rules-default');
  const btnRunTestSelector = document.getElementById('btn-run-test-selector');
  const inputTestSelector = document.getElementById('input-test-selector');
  const testSelectorResult = document.getElementById('test-selector-result');
  const popupRulesVersion = document.getElementById('popup-rules-version');

  async function getRulesFromWorker() {
    try {
      const res = await fetch(`${currentServerHttpUrl}/v1/rules/dom-selectors`);
      if (res.ok) {
        const json = await res.json();
        return json.data || null;
      }
    } catch (_) {}
    return null;
  }

  async function sendRulesToWorker(rules) {
    const res = await fetch(`${currentServerHttpUrl}/v1/rules/dom-selectors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rules),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data;
  }

  // Toggle inspector panel directly on Google Flow tab
  if (btnOpenInspector) {
    btnOpenInspector.addEventListener('click', async () => {
      // Find Flow tab
      chrome.tabs.query({ url: ['https://flow.google.com/*', 'https://labs.google/fx/*'] }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          showToast('Google Flow tab not found. Please open flow.google.com first.', 'error');
          return;
        }
        const flowTab = tabs[0];
        chrome.tabs.sendMessage(flowTab.id, { type: 'TOGGLE_FLOW_INSPECTOR' }, (res) => {
          if (chrome.runtime.lastError) {
            showToast('Cannot connect to Flow tab. Reload the page and try again.', 'error');
            return;
          }
          showToast(res?.isOpen ? '🎯 Inspector OPENED on Flow tab!' : '🔒 Inspector CLOSED.', 'success');
        });
        // Switch focus to the flow tab so user can inspect elements
        chrome.tabs.update(flowTab.id, { active: true });
      });
    });
  }

  // Sync rules from inspector on Flow tab to Worker server
  if (btnSyncRulesWorker) {
    btnSyncRulesWorker.addEventListener('click', async () => {
      btnSyncRulesWorker.disabled = true;
      btnSyncRulesWorker.textContent = '⏳ Syncing...';
      try {
        // Ask content script for current local rules first
        chrome.tabs.query({ url: ['https://flow.google.com/*', 'https://labs.google/fx/*'] }, async (tabs) => {
          // Trigger reload from worker and update popup badge
          const data = await getRulesFromWorker();
          if (data) {
            if (popupRulesVersion) popupRulesVersion.textContent = `v${data.version}`;
          }
          // Notify content script to also reload its rules
          if (tabs && tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'SYNC_DOM_RULES' }, () => {});
          }
          showToast(`✅ Synced rules v${data?.version || '?'} to Worker!`, 'success');
          btnSyncRulesWorker.disabled = false;
          btnSyncRulesWorker.textContent = '🔄 Sync to Worker';
        });
      } catch (err) {
        showToast(`❌ Error: ${err.message}`, 'error');
        btnSyncRulesWorker.disabled = false;
        btnSyncRulesWorker.textContent = '🔄 Sync to Worker';
      }
    });
  }

  // Pull rules from Worker and update version
  if (btnRefreshRules) {
    btnRefreshRules.addEventListener('click', async () => {
      btnRefreshRules.disabled = true;
      try {
        const data = await getRulesFromWorker();
        if (data) {
          if (popupRulesVersion) popupRulesVersion.textContent = `v${data.version}`;
          // Push to content script as well
          chrome.tabs.query({ url: ['https://flow.google.com/*', 'https://labs.google/fx/*'] }, (tabs) => {
            if (tabs && tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'SYNC_DOM_RULES' }, () => {});
            }
          });
          showToast(`✅ Rules v${data.version} downloaded!`, 'success');
        } else {
          showToast('Cannot connect to Worker.', 'error');
        }
      } catch (err) {
        showToast(`❌ ${err.message}`, 'error');
      } finally {
        btnRefreshRules.disabled = false;
      }
    });
  }

  // Reset to default rules
  if (btnResetRulesDefault) {
    btnResetRulesDefault.addEventListener('click', async () => {
      if (!confirm('Reset all rules to default?')) return;
      try {
        const res = await fetch(`${currentServerHttpUrl}/v1/rules/dom-selectors/reset`, { method: 'POST' });
        if (res.ok) {
          const json = await res.json();
          if (popupRulesVersion) popupRulesVersion.textContent = `v${json.data?.version || '?'}`;
          showToast('✅ Reset to default rules!', 'success');
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        showToast(`❌ ${err.message}`, 'error');
      }
    });
  }

  // Quick test selector via highlight on Flow tab
  if (btnRunTestSelector) {
    btnRunTestSelector.addEventListener('click', () => {
      const selector = inputTestSelector ? inputTestSelector.value.trim() : '';
      if (!selector) {
        if (testSelectorResult) testSelectorResult.textContent = '⚠️ Please enter a selector first.';
        return;
      }
      chrome.tabs.query({ url: ['https://flow.google.com/*', 'https://labs.google/fx/*'] }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          if (testSelectorResult) testSelectorResult.textContent = '❌ Flow tab not found.';
          return;
        }
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (sel) => {
            document.querySelectorAll('.fi-test-highlight').forEach(el => el.classList.remove('fi-test-highlight'));
            const matches = Array.from(document.querySelectorAll(sel));
            if (matches.length === 0) return { count: 0, error: 'No elements matched' };
            matches.forEach(el => el.classList.add('fi-test-highlight'));
            matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => document.querySelectorAll('.fi-test-highlight').forEach(el => el.classList.remove('fi-test-highlight')), 4000);
            return { count: matches.length };
          },
          args: [selector],
        }, (results) => {
          if (chrome.runtime.lastError) {
            if (testSelectorResult) testSelectorResult.textContent = `❌ ${chrome.runtime.lastError.message}`;
            return;
          }
          const result = results?.[0]?.result;
          if (testSelectorResult) {
            if (result?.count > 0) {
              testSelectorResult.textContent = `✅ Matched ${result.count} element(s)! (Highlighting for 4s)`;
              testSelectorResult.style.color = 'var(--green)';
            } else {
              testSelectorResult.textContent = `❌ ${result?.error || 'Not found'}`;
              testSelectorResult.style.color = 'var(--red)';
            }
          }
        });
        chrome.tabs.update(tabs[0].id, { active: true });
      });
    });
  }

  // Load rules version badge when Rules tab is opened
  tabButtons.forEach(btn => {
    if (btn.dataset.tab === 'rules') {
      btn.addEventListener('click', async () => {
        const data = await getRulesFromWorker();
        if (data && popupRulesVersion) {
          popupRulesVersion.textContent = `v${data.version}`;
        }
      });
    }
  });

  // ── Fetch Initial Status & Realtime Listeners ─────────────────────────────
  function fetchStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (data) => {
      if (chrome.runtime.lastError || !data) return;
      updateUI(data);
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'STATUS_PUSH') {
      updateUI(msg);
    } else if (msg.type === 'LOG_UPDATE' && Array.isArray(msg.log)) {
      renderLogs(msg.log);
    }
  });

  // Fetch initial state
  fetchStatus();
  chrome.storage.local.get(['requestLog'], (res) => {
    if (Array.isArray(res.requestLog)) renderLogs(res.requestLog);
  });

  // Poll status periodically (every 2.5s) to guarantee accurate connection
  setInterval(fetchStatus, 2500);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
