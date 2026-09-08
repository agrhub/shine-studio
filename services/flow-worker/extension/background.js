// Shine Flow Worker & Flow Agent — Background Service Worker
let currentServerWsUrl = 'ws://localhost:8088/ws';
let currentServerHttpUrl = 'http://localhost:8088';

async function resolveServerUrls() {
  const data = await chrome.storage.local.get(['serverWsUrl']);
  if (data.serverWsUrl) {
    currentServerWsUrl = data.serverWsUrl;
  }
  currentServerHttpUrl = currentServerWsUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/ws\/?$/, '');
}

let ws = null;
let isConnected = false;
let isWorkerEnabled = true;
const activeRunningJobs = new Set();
const MAX_CONCURRENT_JOBS = 3;
let currentAccountId = 'flow_user_default';
let currentAccountLabel = '';
let reconnectTimer = null;
let currentCredits = null;
let currentPaygateTier = 'STANDARD';
let lastTokenCapturedAt = null;

// Multi-task tracking & Metrics
const activeTasks = new Map(); // jobId -> task
let taskHistory = [];
let requestLog = [];
let metrics = {
  total: 0,
  success: 0,
  failed: 0,
};

// ── Startup & Setup ──────────────────────────────────────────────────────────

async function init() {
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log('[ShineFlowWorker] Side panel click behavior enabled.');
    } catch (e) {
      console.warn('[ShineFlowWorker] Notice configuring sidePanel:', e.message);
    }
  }

  const stored = await chrome.storage.local.get([
    'serverWsUrl',
    'customAccountId',
    'accountLabel',
    'metrics',
    'taskHistory',
    'requestLog',
    'isWorkerEnabled',
    'credits',
    'lastTokenCapturedAt',
  ]);

  if (stored.isWorkerEnabled !== undefined) isWorkerEnabled = stored.isWorkerEnabled;
  if (stored.metrics) Object.assign(metrics, stored.metrics);
  if (Array.isArray(stored.taskHistory)) taskHistory = stored.taskHistory;
  if (Array.isArray(stored.requestLog)) requestLog = stored.requestLog;
  if (stored.lastTokenCapturedAt) lastTokenCapturedAt = stored.lastTokenCapturedAt;

  await resolveServerUrls();
  await detectAccountId();
  await loadAccountCredits();
  connectWebSocket();
}

async function loadAccountCredits() {
  if (!currentAccountId) return;
  const credKey = `credits_${currentAccountId}`;
  const stored = await chrome.storage.local.get([credKey, 'credits']);
  if (stored[credKey] !== undefined) {
    currentCredits = stored[credKey];
  } else if (stored.credits !== undefined) {
    currentCredits = stored.credits;
  }
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);

function saveState() {
  const toSave = {
    metrics,
    taskHistory: taskHistory.slice(0, 50),
    requestLog: requestLog.slice(0, 100),
    isWorkerEnabled,
    credits: currentCredits,
    lastTokenCapturedAt,
  };
  if (currentAccountId) {
    toSave[`credits_${currentAccountId}`] = currentCredits;
  }
  chrome.storage.local.set(toSave).catch(() => {});
}

function addLog(entry) {
  const item = {
    id: entry.id || `log_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    time: entry.time || new Date().toISOString(),
    type: entry.type || 'INFO',
    status: entry.status || 'OK',
    prompt: entry.prompt,
    details: entry.details || '',
    error: entry.error,
  };
  requestLog.unshift(item);
  if (requestLog.length > 100) requestLog.pop();
  saveState();
  chrome.runtime.sendMessage({ type: 'LOG_UPDATE', log: requestLog }).catch(() => {});
}

function getStatusPayload() {
  return {
    isConnected,
    isWorkerEnabled,
    accountId: currentAccountId,
    accountLabel: currentAccountLabel || currentAccountId,
    serverUrl: currentServerHttpUrl,
    serverWsUrl: currentServerWsUrl,
    metrics,
    activeTasks: Array.from(activeTasks.values()).map(t => ({
      ...t,
      elapsedSeconds: Math.floor((Date.now() - (t.startTime || Date.now())) / 1000),
    })),
    taskHistory: taskHistory.slice(0, 30),
    credits: currentCredits,
    userPaygateTier: currentPaygateTier,
    tokenAge: lastTokenCapturedAt ? Date.now() - lastTokenCapturedAt : null,
    runningCount: activeRunningJobs.size,
    maxConcurrency: MAX_CONCURRENT_JOBS,
  };
}

function broadcastStatus() {
  const payload = getStatusPayload();
  chrome.runtime.sendMessage({
    type: 'STATUS_PUSH',
    ...payload,
  }).catch(() => {});
}

// ── Tab & Status Sync ────────────────────────────────────────────────────────

async function getOpenFlowTabs() {
  try {
    const allTabs = await chrome.tabs.query({});
    return allTabs.filter(t => {
      const u = (t.url || t.pendingUrl || '').toLowerCase();
      return u.includes('flow.google.com') || u.includes('labs.google/fx/tools/flow') || u.includes('labs.google/fx');
    });
  } catch (err) {
    console.warn('[ShineFlowWorker] Error querying open tabs:', err);
    return [];
  }
}

async function syncFlowTabStatus() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const flowTabs = await getOpenFlowTabs();
  const hasFlowTab = flowTabs.length > 0;
  const isBusy = activeRunningJobs.size >= MAX_CONCURRENT_JOBS;
  // As long as the extension is connected via WebSocket and worker is enabled,
  // it is READY (or BUSY). The extension automatically opens flow tabs on-demand when jobs arrive.
  let status = isWorkerEnabled ? (isBusy ? 'BUSY' : 'READY') : 'OFFLINE';

  let projectId = undefined;
  let projectUrl = undefined;
  if (hasFlowTab) {
    const projectTab = flowTabs.find(t => t.url && t.url.includes('/project/'));
    if (projectTab && projectTab.url) {
      projectUrl = projectTab.url;
      projectId = extractProjectId(projectTab.url);
    }
  }

  ws.send(JSON.stringify({
    type: 'TAB_STATUS',
    accountId: currentAccountId,
    hasFlowTab,
    status,
    projectId,
    projectUrl,
    credits: currentCredits !== null ? currentCredits : undefined,
  }));
}

// ── Cookie & Account Extraction ───────────────────────────────────────────────

async function getFlowCookies() {
  try {
    const flowCookies = await chrome.cookies.getAll({ domain: 'flow.google.com' });
    const labsCookies = await chrome.cookies.getAll({ domain: 'labs.google' });
    const googleCookies = await chrome.cookies.getAll({ domain: 'google.com' });
    const all = [...flowCookies, ...labsCookies, ...googleCookies];

    const seen = new Set();
    const unique = [];
    for (const c of all) {
      const key = `${c.domain}:${c.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    }
    return unique;
  } catch (err) {
    console.warn('[ShineFlowWorker] Could not get cookies:', err.message);
    return [];
  }
}

async function detectAccountId() {
  const data = await chrome.storage.local.get(['customAccountId', 'accountLabel']);
  if (data.accountLabel) currentAccountLabel = data.accountLabel.trim();
  if (data.customAccountId && data.customAccountId.trim()) {
    currentAccountId = data.customAccountId.trim();
    return currentAccountId;
  }

  const cookies = await getFlowCookies();
  const sapisid = cookies.find(c => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');
  if (sapisid && sapisid.value) {
    lastTokenCapturedAt = Date.now();
    const hash = Math.abs(sapisid.value.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0));
    currentAccountId = `google_acc_${hash.toString(16).slice(0, 8)}`;
  }
  return currentAccountId;
}

function extractProjectId(url) {
  if (!url) return undefined;
  const match = url.match(/\/project\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : undefined;
}

// ── WebSocket Connection ──────────────────────────────────────────────────────

async function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  await resolveServerUrls();
  await detectAccountId();
  console.log(`[ShineFlowWorker] Connecting to ${currentServerWsUrl} as ${currentAccountId}...`);

  try {
    ws = new WebSocket(currentServerWsUrl);

    ws.onopen = async () => {
      isConnected = true;
      console.log('[ShineFlowWorker] 🟢 Connected to Flow Worker Server!');
      const cookies = await getFlowCookies();
      const flowTabs = await getOpenFlowTabs();
      const hasFlowTab = flowTabs.length > 0;
      const status = (!isWorkerEnabled) ? 'OFFLINE' : 'READY';

      let projectId = undefined;
      let projectUrl = undefined;
      const projectTab = flowTabs.find(t => t.url && t.url.includes('/project/'));
      if (projectTab && projectTab.url) {
        projectUrl = projectTab.url;
        projectId = extractProjectId(projectTab.url);
      }

      const data = await chrome.storage.local.get(['accountLabel']);
      const label = data.accountLabel && data.accountLabel.trim() ? data.accountLabel.trim() : `Chrome Worker (${currentAccountId})`;
      currentAccountLabel = label;

      ws.send(JSON.stringify({
        type: 'REGISTER',
        accountId: currentAccountId,
        label,
        cookies,
        projectId,
        projectUrl,
        hasFlowTab,
        status,
        credits: currentCredits !== null ? currentCredits : undefined,
      }));

      addLog({
        type: 'CONNECT',
        status: 'OK',
        details: `Connected to worker server (${currentAccountId})`,
      });
      broadcastStatus();
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'REGISTERED') {
          console.log(`[ShineFlowWorker] 🟢 Worker registered with server: ${msg.message}`);
          if (typeof msg.credits === 'number' && !isNaN(msg.credits)) {
            currentCredits = msg.credits;
            if (msg.userPaygateTier) currentPaygateTier = msg.userPaygateTier;
            saveState();
            broadcastStatus();
          }
        } else if (msg.type === 'EXECUTE_JOB') {
          handleJobDispatch(msg.job);
        } else if (msg.type === 'DELETE_PROJECT') {
          // Background project cleanup — tell any available Flow tab to delete the old project
          console.log(`[ShineFlowWorker] 🗑️ Received DELETE_PROJECT for: ${msg.projectId}`);
          const flowTabs = await getOpenFlowTabs();
          const anyTab = flowTabs[0];
          if (anyTab?.id) {
            try {
              await sendMessageWithRetry(anyTab.id, {
                type: 'DELETE_FLOW_PROJECT',
                projectId: msg.projectId,
              }, 2);
            } catch (_) {
              console.warn(`[ShineFlowWorker] Could not delete project ${msg.projectId} via tab`);
            }
          }
        } else if (msg.type === 'PING') {
          const flowTabs = await getOpenFlowTabs();
          const hasFlowTab = flowTabs.length > 0;
          const isBusy = activeRunningJobs.size >= MAX_CONCURRENT_JOBS;
          const status = (!isWorkerEnabled) ? 'OFFLINE' : (isBusy ? 'BUSY' : 'READY');
          ws.send(JSON.stringify({
            type: 'HEARTBEAT',
            accountId: currentAccountId,
            status,
            hasFlowTab,
            credits: currentCredits !== null ? currentCredits : undefined,
          }));
        } else if (msg.type === 'CHECK_CREDITS') {
          handleCheckCredits(msg);
        }
      } catch (err) {
        console.error('[ShineFlowWorker] Error handling WS message:', err);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      console.warn('[ShineFlowWorker] 🔴 WebSocket disconnected. Reconnecting in 5s...');
      broadcastStatus();
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[ShineFlowWorker] WebSocket error:', err);
    };
  } catch (err) {
    console.error('[ShineFlowWorker] Connection error:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectWebSocket, 5000);
}

// ── Tab Management & Script Injection ────────────────────────────────────────

async function getTargetWindowId() {
  try {
    const lastWin = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
    if (lastWin && lastWin.id && lastWin.id !== chrome.windows.WINDOW_ID_NONE) {
      return lastWin.id;
    }
  } catch (_) {}

  try {
    const allWindows = await chrome.windows.getAll({ windowTypes: ['normal'] }).catch(() => []);
    if (allWindows && allWindows.length > 0) {
      const normalWin = allWindows.find(w => w.state !== 'minimized') || allWindows[0];
      if (normalWin && normalWin.id) return normalWin.id;
    }
  } catch (_) {}

  return undefined;
}

async function createFlowTabSafe({ url = 'https://flow.google.com', active = false } = {}) {
  const targetWindowId = await getTargetWindowId();
  if (targetWindowId !== undefined) {
    try {
      return await chrome.tabs.create({ windowId: targetWindowId, url, active });
    } catch (err) {
      console.warn('[ShineFlowWorker] tabs.create with windowId failed:', err.message);
    }
  }

  // Fallback: If no normal window exists or tabs.create threw "No current window", create a new window
  try {
    const newWin = await chrome.windows.create({ url, focused: active });
    if (newWin.tabs && newWin.tabs.length > 0) {
      return newWin.tabs[0];
    }
    const createdTabs = await chrome.tabs.query({ url: '*://flow.google.com/*' });
    return createdTabs[0];
  } catch (err) {
    console.error('[ShineFlowWorker] Failed to create window for Flow tab:', err);
    throw err;
  }
}

async function findOrCreateFlowTab() {
  try {
    const allFlowTabs = await chrome.tabs.query({ url: '*://flow.google.com/*' });
    if (allFlowTabs && allFlowTabs.length > 0) {
      const projectTab = allFlowTabs.find(t => t.url && t.url.includes('/project/'));
      if (projectTab) return projectTab;
      const activeTab = allFlowTabs.find(t => t.active);
      if (activeTab) return activeTab;
      return allFlowTabs[0];
    }
  } catch (err) {
    console.warn('[ShineFlowWorker] Error querying Flow tabs:', err);
  }

  console.log('[ShineFlowWorker] No active Flow tab found. Opening flow.google.com...');
  const newTab = await createFlowTabSafe({ url: 'https://flow.google.com', active: true });

  await new Promise((resolve) => {
    const listener = (tabId, info) => {
      if (tabId === newTab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 3500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 15000);
  });

  return newTab;
}

async function sendMessageWithRetry(tabId, message, maxRetries = 6) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (err) {
      const isConnectionError = err.message && (
        err.message.includes('Receiving end does not exist') ||
        err.message.includes('Could not establish connection')
      );

      if (isConnectionError && attempt < maxRetries) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['inpage.js'],
            world: 'MAIN',
          });
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js'],
          });
        } catch (_) {}
        await new Promise(r => setTimeout(r, 600));
      } else {
        throw err;
      }
    }
  }
}

// ── Check Credits Trigger (Auto-Open Tab & Sync) ──────────────────────────────

async function handleCheckCredits(msg = {}) {
  const requestId = msg.requestId;
  console.log(`[ShineFlowWorker] 💳 Received CHECK_CREDITS trigger (req: ${requestId || 'none'})`);

  let targetTab = null;
  let tempTabCreated = false;

  try {
    // 1. Check if an active or background Flow tab is already open
    const flowTabs = await getOpenFlowTabs();
    if (flowTabs.length > 0) {
      targetTab = flowTabs.find(t => t.url && t.url.includes('/project/')) || flowTabs[0];
    }

    // 2. If no tab is open, automatically open a background tab
    if (!targetTab) {
      console.log('[ShineFlowWorker] 🪟 No Flow tab currently open. Spawning background tab to check credits...');
      const newTab = await createFlowTabSafe({ url: 'https://flow.google.com', active: false });
      targetTab = newTab;
      tempTabCreated = true;

      // Wait for tab navigation and Angular SPA initialization
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === newTab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(resolve, 3500); // Give Angular time to mount header & avatar
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(resolve, 15000); // Safety timeout
      });
    }

    if (!targetTab || !targetTab.id) {
      throw new Error('Failed to find or open Flow tab for credit check');
    }

    // 3. Send message to content script
    console.log(`[ShineFlowWorker] 🔍 Triggering credit read in tab ${targetTab.id}...`);
    const resp = await sendMessageWithRetry(targetTab.id, { type: 'FETCH_CREDITS_NOW' }, 5);
    let credits = resp?.credits;
    let isQuotaExceeded = Boolean(resp?.isQuotaExceeded);

    if (credits !== undefined && typeof credits === 'number' && !isNaN(credits)) {
      currentCredits = credits;
      isQuotaExceeded = credits <= 0;
      saveState();
      console.log(`[ShineFlowWorker] 💰 Credit sync completed: ${currentCredits} credits (QuotaExceeded: ${isQuotaExceeded})`);

      // Send verified CREDIT_UPDATE over WebSocket to worker server
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'CREDIT_UPDATE',
          accountId: currentAccountId,
          credits: currentCredits,
          isQuotaExceeded,
          requestId,
        }));
      }

      broadcastStatus();
      return { ok: true, credits: currentCredits, isQuotaExceeded };
    } else {
      console.warn(`[ShineFlowWorker] ⚠️ Credit read did not resolve a valid number for ${currentAccountId}. Preserving previous value.`);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'CREDIT_UPDATE',
          accountId: currentAccountId,
          error: resp?.error || 'CREDIT_READ_NOT_READY',
          requestId,
        }));
      }
      broadcastStatus();
      return { ok: false, error: resp?.error || 'CREDIT_READ_NOT_READY' };
    }
  } catch (err) {
    console.error('[ShineFlowWorker] Error executing credit sync:', err.message);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'CREDIT_UPDATE',
        accountId: currentAccountId,
        error: err.message,
        requestId,
      }));
    }
    return { ok: false, error: err.message };
  } finally {
    // 5. If we opened a temporary background tab purely for credit check, close it with a small grace period
    if (tempTabCreated && targetTab?.id) {
      await new Promise(r => setTimeout(r, 800));
      console.log(`[ShineFlowWorker] 🧹 Auto-closing temporary credit check tab ${targetTab.id}`);
      try {
        await chrome.tabs.remove(targetTab.id);
      } catch (_) {}
    }
    syncFlowTabStatus();
  }
}

// ── Multi-Task Parallel Execution ────────────────────────────────────────────

async function handleJobDispatch(job) {
  const jobId = job.jobId;
  const jobType = (job.type || 'image').toUpperCase();
  const startTime = Date.now();

  console.log(`[ShineFlowWorker] 🚀 Starting job ${jobId} (${jobType}) [Active: ${activeRunningJobs.size + 1}/${MAX_CONCURRENT_JOBS}]`);
  activeRunningJobs.add(jobId);

  const taskRecord = {
    jobId,
    type: jobType,
    model: job.model || (jobType === 'VIDEO' ? 'veo_3_1_fast' : 'Nano Banana 2'),
    aspectRatio: job.aspectRatio || '9:16',
    prompt: job.prompt || '',
    status: 'RUNNING',
    startTime,
    referenceImages: job.referenceImages || [],
  };
  activeTasks.set(jobId, taskRecord);
  metrics.total = (metrics.total || 0) + 1;
  saveState();
  syncFlowTabStatus();
  broadcastStatus();

  addLog({
    type: `GEN_${jobType}`,
    status: 'RUNNING',
    prompt: job.prompt,
    details: `Task ${jobId} dispatched to Flow tab`,
  });

  if (currentCredits !== null && currentCredits <= 0) {
    const errorMsg = 'QUOTA_EXCEEDED: This account has 0 credits remaining.';
    console.warn(`[ShineFlowWorker] 🛑 Fast rejection for ${jobId}: ${errorMsg}`);
    activeRunningJobs.delete(jobId);
    activeTasks.delete(jobId);
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'JOB_RESULT',
        jobId,
        status: 'FAILED',
        error: errorMsg,
      }));
      ws.send(JSON.stringify({
        type: 'CREDIT_UPDATE',
        accountId: currentAccountId,
        credits: 0,
        isQuotaExceeded: true,
      }));
    }
    return;
  }

  let finalStatus = 'FAILED';
  let mediaUrl = undefined;
  let errorMsg = undefined;
  let targetTabId = undefined;
  let isCreatedTab = false;

  try {
    // ── Tab Selection: ALWAYS open a dedicated, isolated background tab for each job ──
    // Never reuse or hijack the user's active Flow tabs!
    console.log(`[ShineFlowWorker] 🪟 Spawning dedicated isolated background tab for job ${jobId} (project: ${job.jobProjectTitle || jobId})`);
    const newTab = await createFlowTabSafe({ url: 'https://flow.google.com', active: false });
    targetTabId = newTab.id;
    isCreatedTab = true;

    // Wait for tab to fully load and Angular to initialize
    await new Promise((resolve) => {
      const listener = (tabId, info) => {
        if (tabId === targetTabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 2500); // extra wait for Angular SPA to boot
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(resolve, 15000);
    });

    // Inject content scripts in case they weren't auto-injected
    try {
      await chrome.scripting.executeScript({ target: { tabId: targetTabId }, files: ['inpage.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId: targetTabId }, files: ['content.js'] });
    } catch (_) {}

    // Check for session expiry
    const tabInfo = await chrome.tabs.get(targetTabId);
    if (tabInfo?.url && (tabInfo.url.includes('accounts.google.com') || tabInfo.url.includes('signin'))) {
      if (ws && isConnected) {
        ws.send(JSON.stringify({ type: 'SESSION_EXPIRED', accountId: currentAccountId, reason: 'Google sign-in required.' }));
      }
      throw new Error('Google Flow session expired. Please sign into Google.');
    }

    const response = await sendMessageWithRetry(targetTabId, {
      type: 'EXECUTE_DOM_JOB',
      job,
    });

    finalStatus = response?.status || 'FAILED';
    mediaUrl = response?.mediaUrl;
    const base64Data = response?.base64Data;
    const mimeType = response?.mimeType;
    errorMsg = response?.error;

    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'JOB_RESULT',
        jobId,
        status: finalStatus,
        mediaUrl,
        base64Data,
        mimeType,
        error: errorMsg,
      }));
    }
  } catch (err) {
    console.error(`[ShineFlowWorker] Job ${jobId} execution error:`, err.message);
    finalStatus = 'FAILED';
    errorMsg = err.message;
    if (ws && isConnected) {
      ws.send(JSON.stringify({ type: 'JOB_RESULT', jobId, status: 'FAILED', error: err.message }));
    }
  } finally {
    // Close the tab ONLY if we created a dedicated new tab for this job!
    // NEVER close the user's existing Flow tab!
    if (isCreatedTab && targetTabId !== undefined) {
      try { await chrome.tabs.remove(targetTabId); } catch (_) {}
    }

    activeRunningJobs.delete(jobId);
    activeTasks.delete(jobId);

    const completedRecord = {
      ...taskRecord,
      status: finalStatus,
      mediaUrl,
      base64Data,
      mimeType,
      error: errorMsg,
      completedAt: Date.now(),
      durationMs: Date.now() - startTime,
    };

    if (finalStatus === 'SUCCESS') {
      metrics.success = (metrics.success || 0) + 1;
      if (currentCredits !== null && currentCredits > 0) {
        currentCredits = Math.max(0, currentCredits - (jobType === 'VIDEO' ? 10 : 1));
      }
    } else {
      metrics.failed = (metrics.failed || 0) + 1;
    }

    taskHistory.unshift(completedRecord);
    if (taskHistory.length > 50) taskHistory.pop();

    addLog({
      type: `GEN_${jobType}`,
      status: finalStatus,
      prompt: job.prompt,
      details: finalStatus === 'SUCCESS' ? `Success in ${Math.round((Date.now() - startTime) / 1000)}s` : `Failed: ${errorMsg}`,
      error: errorMsg,
    });

    saveState();
    syncFlowTabStatus();
    broadcastStatus();
  }
}

// ── Keep Alive Alarm ─────────────────────────────────────────────────────────

chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    connectWebSocket();
  }
});

// Periodic elapsed ticker for running tasks to push UI updates
setInterval(() => {
  if (activeTasks.size > 0) {
    broadcastStatus();
  }
}, 1000);

init();

// ── Popup / UI Messages ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === 'GET_STATUS') {
    sendResponse(getStatusPayload());
    return false;
  }

  if (req.type === 'TOGGLE_WORKER') {
    isWorkerEnabled = !isWorkerEnabled;
    chrome.storage.local.set({ isWorkerEnabled });
    syncFlowTabStatus();
    broadcastStatus();
    sendResponse({ ok: true, isWorkerEnabled });
    return false;
  }

  if (req.type === 'OPEN_FLOW_TAB') {
    findOrCreateFlowTab().then(tab => {
      if (tab?.id) {
        chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId) chrome.windows.update(tab.windowId, { focused: true });
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (req.type === 'CHECK_CREDITS' || req.type === 'SYNC_CREDITS') {
    handleCheckCredits(req)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (req.type === 'REFRESH_TOKEN') {
    getFlowCookies().then(cookies => {
      const sapisid = cookies.find(c => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');
      if (sapisid) lastTokenCapturedAt = Date.now();
      saveState();
      syncFlowTabStatus();
      broadcastStatus();
      sendResponse({ ok: true, tokenCapturedAt: lastTokenCapturedAt });
    });
    return true;
  }

  if (req.type === 'UPDATE_CONFIG') {
    const { serverWsUrl, customAccountId, accountLabel } = req;
    const toStore = {};
    if (serverWsUrl) toStore.serverWsUrl = serverWsUrl;
    if (customAccountId !== undefined) toStore.customAccountId = customAccountId.trim();
    if (accountLabel !== undefined) toStore.accountLabel = accountLabel.trim();

    chrome.storage.local.set(toStore).then(async () => {
      await resolveServerUrls();
      await detectAccountId();
      if (ws) {
        try { ws.close(); } catch (_) {}
        ws = null;
      }
      isConnected = false;
      connectWebSocket();
      broadcastStatus();
      sendResponse({ ok: true, accountId: currentAccountId });
    });
    return true;
  }

  if (req.type === 'GENERATE_NEW_ACCOUNT_ID') {
    const randomHex = Math.random().toString(16).slice(2, 10);
    const newId = `google_acc_${randomHex}`;
    chrome.storage.local.set({ customAccountId: newId }).then(async () => {
      currentAccountId = newId;
      if (ws) {
        try { ws.close(); } catch (_) {}
        ws = null;
      }
      isConnected = false;
      connectWebSocket();
      broadcastStatus();
      sendResponse({ ok: true, accountId: newId });
    });
    return true;
  }

  if (req.type === 'SYNC_COOKIES') {
    const targetAccountId = req.accountId || currentAccountId;
    const targetLabel = req.label || currentAccountLabel;
    getFlowCookies().then(cookies => {
      fetch(`${currentServerHttpUrl}/v1/accounts/sync-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: targetAccountId,
          label: targetLabel,
          cookies,
        }),
      })
        .then(res => res.json())
        .then(data => {
          lastTokenCapturedAt = Date.now();
          saveState();
          syncFlowTabStatus();
          broadcastStatus();
          sendResponse({ ok: true, data });
        })
        .catch(err => sendResponse({ ok: false, error: err.message }));
    });
    return true;
  }

  if (req.type === 'CLEAR_HISTORY') {
    taskHistory = [];
    metrics = { total: 0, success: 0, failed: 0 };
    saveState();
    broadcastStatus();
    sendResponse({ ok: true });
    return false;
  }

  if (req.type === 'CLEAR_LOGS') {
    requestLog = [];
    saveState();
    chrome.runtime.sendMessage({ type: 'LOG_UPDATE', log: [] }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (req.type === 'CREDIT_UPDATE') {
    currentCredits = req.credits;
    if (req.userPaygateTier) currentPaygateTier = req.userPaygateTier;
    saveState();
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'CREDIT_UPDATE',
        accountId: currentAccountId,
        credits: req.credits,
        isQuotaExceeded: req.isQuotaExceeded,
        userPaygateTier: req.userPaygateTier,
      }));
    }
    broadcastStatus();
    return false;
  }

  if (req.type === 'SYNC_PROJECT' || req.type === 'REPORT_PROJECT') {
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'SYNC_PROJECT',
        accountId: currentAccountId,
        projectId: req.projectId,
        projectUrl: req.projectUrl,
      }));
    }
    return false;
  }
});

// Auto-sync Flow tab presence and active project URL
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url && (tab.url.includes('flow.google.com') || tab.url.includes('labs.google/fx/tools/flow'))) {
    syncFlowTabStatus();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const isFlow = tab.url && (tab.url.includes('flow.google.com') || tab.url.includes('labs.google/fx/tools/flow'));
  if (isFlow) {
    syncFlowTabStatus();
    if (changeInfo.status === 'complete') {
      const projectId = extractProjectId(tab.url);
      if (projectId && ws && isConnected) {
        ws.send(JSON.stringify({
          type: 'SYNC_PROJECT',
          accountId: currentAccountId,
          projectId,
          projectUrl: tab.url,
        }));
      }
    }
  }
});

chrome.tabs.onRemoved.addListener(() => {
  setTimeout(syncFlowTabStatus, 600);
});
