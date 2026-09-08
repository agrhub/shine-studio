// Shine Flow Worker — Content Script for flow.google.com
console.log('[ShineFlowWorker] 🚀 Content script injected on flow.google.com');

// ── Inpage Interceptor Bridge (Runs in MAIN world for network interception) ───

function ensureInpageInjected() {
  if (document.querySelector('script[data-shine-flow-inpage]')) return;
  try {
    const s = document.createElement('script');
    s.setAttribute('data-shine-flow-inpage', 'true');
    s.src = chrome.runtime.getURL('inpage.js');
    (document.head || document.documentElement).appendChild(s);
    console.log('[ShineFlowWorker] Injected inpage.js network interceptor');
  } catch (err) {
    console.warn('[ShineFlowWorker] Notice injecting inpage script:', err);
  }
}
ensureInpageInjected();

// Automatically sync latest configurable DOM selector rules from Flow Worker
if (typeof window.syncDomRules === 'function') {
  window.syncDomRules();
}

// Active jobs awaiting network/generation completion
// jobId -> { job, resolve, reject, timer, startTime, opNames: Set() }
const activeJobs = new Map();
// opName -> jobId
const operationToJob = new Map();
// Cache of completed media objects received from network
const completedMediaCache = [];

window.addEventListener('message', (event) => {
  if (!event.data || event.data.source !== 'SHINE_FLOW_INPAGE') return;

  const { type, data } = event.data;

  // 1. Operations started event: Link operation names with pending jobs
  if (type === 'OPERATIONS_STARTED') {
    const { operations = [] } = data;
    console.log('[ShineFlowWorker] 📡 Received OPERATIONS_STARTED event:', operations);
    // Find oldest active job without assigned operations
    for (const op of operations) {
      if (op.name) {
        for (const [jobId, jobCtx] of activeJobs.entries()) {
          if (jobCtx.opNames.size === 0) {
            jobCtx.opNames.add(op.name);
            operationToJob.set(op.name, jobId);
            console.log(`[ShineFlowWorker] 🔗 Linked operation ${op.name} -> Job ${jobId}`);
            break;
          }
        }
      }
    }
  }

  // 2. Media completed event: Instant resolution from Google API response!
  if (type === 'MEDIA_COMPLETED') {
    const { opName, mediaUrl, aspectRatio, type: mediaType } = data;

    if (isUploadedReference(mediaUrl)) {
      console.log(`[ShineFlowWorker] ⏭️ Ignored uploaded reference in MEDIA_COMPLETED: ${mediaUrl}`);
      return;
    }

    console.log(`[ShineFlowWorker] ⚡ Received MEDIA_COMPLETED from network: ${mediaType} (${aspectRatio}) -> ${mediaUrl}`);

    completedMediaCache.push({ opName, mediaUrl, aspectRatio, mediaType, timestamp: Date.now() });
    if (completedMediaCache.length > 50) completedMediaCache.shift();

    // Check if we have an active job matched by operation name
    let matchedJobId = opName ? operationToJob.get(opName) : null;

    // Fallback: ONLY if opName matches an active job's opNames OR if media timestamp is strictly after submitTimestamp
    if (!matchedJobId) {
      for (const [jobId, jobCtx] of activeJobs.entries()) {
        if (jobCtx.job.type === mediaType && jobCtx.submitTimestamp) {
          const isFresh = data.timestamp ? data.timestamp >= jobCtx.submitTimestamp : true;
          const isNotOld = !jobCtx.existingMedia?.has(mediaUrl) && !jobCtx.existingMedia?.has(normalizeMediaUrl(mediaUrl));
          if (isFresh && isNotOld && (jobCtx.opNames.size === 0 || (opName && jobCtx.opNames.has(opName)))) {
            matchedJobId = jobId;
            break;
          }
        }
      }
    }

    if (matchedJobId && activeJobs.has(matchedJobId)) {
      const jobCtx = activeJobs.get(matchedJobId);

      // Verify not uploaded reference, not existing media, and not from before submission
      if (isUploadedReference(mediaUrl)) {
        console.log(`[ShineFlowWorker] ⏭️ Ignored reference URL in active job resolution: ${mediaUrl}`);
        return;
      }
      if (jobCtx.existingMedia && (jobCtx.existingMedia.has(mediaUrl) || jobCtx.existingMedia.has(normalizeMediaUrl(mediaUrl)))) {
        console.log(`[ShineFlowWorker] ⏭️ Ignored existing media URL in active job resolution: ${mediaUrl}`);
        return;
      }

      activeJobs.delete(matchedJobId);
      if (jobCtx.timer) clearTimeout(jobCtx.timer);

      console.log(`[ShineFlowWorker] 🎉 SUCCESS: Resolved job ${matchedJobId} instantly via network interception!`);
      if (jobCtx.job.type === 'image') {
        urlToBase64(mediaUrl).then(b64Res => {
          const base64Data = b64Res && b64Res.base64 ? `data:${b64Res.type || 'image/png'};base64,${b64Res.base64}` : undefined;
          jobCtx.resolve({
            jobId: matchedJobId,
            status: 'SUCCESS',
            mediaUrl,
            base64Data,
            mimeType: b64Res?.type || 'image/png',
            model: jobCtx.job.model,
          });
        }).catch(() => {
          jobCtx.resolve({
            jobId: matchedJobId,
            status: 'SUCCESS',
            mediaUrl,
            model: jobCtx.job.model,
          });
        });
      } else {
        jobCtx.resolve({
          jobId: matchedJobId,
          status: 'SUCCESS',
          mediaUrl,
          model: jobCtx.job.model,
        });
      }
    }
  }

  // 3. API Error or Quota detection
  if (type === 'API_ERROR') {
    console.warn('[ShineFlowWorker] ⚠️ Received API_ERROR from network:', data);
    if (data.error && data.error.includes('QUOTA')) {
      chrome.runtime.sendMessage({
        type: 'CREDIT_UPDATE',
        credits: 0,
        isQuotaExceeded: true,
      }).catch(() => {});
    }
  }

  // 4. Credits Interception from Network Response
  if (type === 'CREDITS_INTERCEPTED' && typeof data?.credits === 'number' && !isNaN(data.credits)) {
    window.__SHINE_FLOW_NETWORK_CREDITS = data.credits;
    window.__SHINE_FLOW_NETWORK_CREDITS_TIME = Date.now();
    console.log(`[ShineFlowWorker] 💰 Content script received intercepted network credits: ${data.credits}`);
    chrome.runtime.sendMessage({
      type: 'CREDIT_UPDATE',
      credits: data.credits,
      isQuotaExceeded: data.credits <= 0,
    }).catch(() => {});
  }
});

// ── DOM Helpers ───────────────────────────────────────────────────────────────

function isVisible(el) {
  if (!el) return false;
  try {
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch (_) {
    return false;
  }
}

function robustClick(el) {
  if (!el) return false;
  try {
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    if (typeof el.click === 'function') {
      el.click();
    } else {
      el.dispatchEvent(new MouseEvent('click', opts));
    }
    return true;
  } catch (err) {
    try {
      el.click?.();
      return true;
    } catch (_) {
      return false;
    }
  }
}

// ── 1. Ensure a Fresh Dedicated Project for this Job ─────────────────────────
// Creates a brand-new Google Flow project named "ShineJob_<jobId>" so the
// drawer starts empty — no interference from other jobs or previous sessions.

async function ensureFreshProjectForJob(projectTitle) {
  // 1. If already inside an existing project, stay in it! (Avoid reloading SPA or hanging on dashboard)
  if (window.location.href.includes('/project/')) {
    console.log(`[ShineFlowWorker] ⚡ Already inside active project: ${window.location.href}`);
    const projectId = (window.location.href.match(/\/project\/([a-zA-Z0-9_-]+)/) || [])[1];
    if (projectId) {
      chrome.runtime.sendMessage({
        type: 'REPORT_PROJECT',
        projectId,
        projectUrl: window.location.href,
      }).catch(() => {});
    }
    return true;
  }

  // 2. If on dashboard, enter or create a project quickly
  console.log('[ShineFlowWorker] 🏠 On dashboard, opening a project...');
  await new Promise(r => setTimeout(r, 600));

  // Find and click New Project button / card via rule engine
  const newProjectBtn = window.DomRuleEngine?.query('dashboard.newProjectButton')
    || document.querySelector('button.create-project-card, .create-project-card, .new-project-card, a[href*="/project/new"], button:has(mat-icon.flow-icon-l)')
    || Array.from(document.querySelectorAll('button, div[role="button"]')).find(b => {
      const icon = b.querySelector('mat-icon');
      return icon && (icon.textContent || '').trim() === 'add';
    });

  if (newProjectBtn && isVisible(newProjectBtn)) {
    console.log('[ShineFlowWorker] ➕ Clicking "+ New Project" button/card...');
    newProjectBtn.click();
    await new Promise(r => setTimeout(r, 800));
  }

  // If URL did not change to /project/, click the first available project card from dashboard grid
  if (!window.location.href.includes('/project/')) {
    const projectCards = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('dashboard.projectCard') : Array.from(document.querySelectorAll(
      'a[href*="/project/"], .project-card, div[role="button"]'
    ))).filter(isVisible);

    const validCard = projectCards.find(c => {
      const href = c.getAttribute('href') || '';
      return href.includes('/project/') || c.querySelector('a[href*="/project/"]');
    }) || projectCards[0];

    if (validCard) {
      console.log('[ShineFlowWorker] 📂 Opening available project card from dashboard...');
      validCard.click();
    }
  }

  // Wait for project to open (up to 8 seconds max, fast exit as soon as URL matches)
  for (let i = 0; i < 16; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (window.location.href.includes('/project/')) {
      await new Promise(r => setTimeout(r, 1200)); // wait for Angular SPA
      const projectId = (window.location.href.match(/\/project\/([a-zA-Z0-9_-]+)/) || [])[1];
      if (projectId) {
        console.log(`[ShineFlowWorker] ✅ Project opened: ${projectId}`);
        chrome.runtime.sendMessage({
          type: 'REPORT_PROJECT',
          projectId,
          projectUrl: window.location.href,
        }).catch(() => {});
      }
      return true;
    }
  }

  return window.location.href.includes('/project/');
}

// ── 1b. Delete a project by ID (called for evicted old projects) ──────────────
async function deleteFlowProject(projectId) {
  if (!projectId) return;
  console.log(`[ShineFlowWorker] 🗑️ Attempting to delete project: ${projectId}`);

  const projectUrl = `https://flow.google.com/project/${projectId}`;
  // Navigate to the project
  window.location.href = projectUrl;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 600));
    if (window.location.href.includes(projectId)) break;
  }
  await new Promise(r => setTimeout(r, 2000));

  // Find the "Delete" option in context menu via rule engine
  const menuButtons = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('dashboard.projectDeleteButton') : Array.from(document.querySelectorAll('[role="menuitem"], button'))).filter(isVisible);
  const deleteBtn = menuButtons.find(b => {
    const icon = b.querySelector('mat-icon');
    return icon && (icon.textContent || '').trim() === 'delete';
  }) || menuButtons[menuButtons.length - 1];

  if (deleteBtn) {
    deleteBtn.click();
    await new Promise(r => setTimeout(r, 800));
    // Confirm deletion dialog action button
    const confirmBtn = window.DomRuleEngine?.query('dashboard.confirmDeleteDialog')
      || document.querySelector('mat-dialog-container button.mat-primary, mat-dialog-actions button:last-of-type, .mat-mdc-dialog-actions button:last-of-type');
    if (confirmBtn && isVisible(confirmBtn)) {
      confirmBtn.click();
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`[ShineFlowWorker] ✅ Deleted project: ${projectId}`);
  } else {
    console.warn(`[ShineFlowWorker] ⚠️ Could not find delete button for project ${projectId}`);
  }
}


// ── 2. Switch Category Tab (Videos / Images) ──────────────────────────────────

async function ensureCategoryTab(type = 'video') {
  if (findPromptInput()) return;

  const ruleKey = type === 'video' ? 'navigation.categoryTabVideo' : 'navigation.categoryTabImage';
  const navBtn = window.DomRuleEngine?.query(ruleKey);
  if (navBtn && isVisible(navBtn)) {
    navBtn.click();
    await new Promise(r => setTimeout(r, 800));
    return;
  }

  const navItems = Array.from(document.querySelectorAll('nav a, nav button, [role="tab"]')).filter(isVisible);
  if (navItems.length === 0) return;

  const targetIcon = type === 'video' ? 'videocam' : 'image';
  const matched = navItems.find(item => {
    const icon = item.querySelector('mat-icon');
    return icon && (icon.textContent || '').trim() === targetIcon;
  });

  const targetItem = matched || (type === 'video' ? navItems[1] : navItems[0]);
  if (targetItem) {
    targetItem.click();
    await new Promise(r => setTimeout(r, 800));
  }
}

function findAgentModeChip() {
  const fromRule = window.DomRuleEngine?.query('agentModeChip.chip');
  if (fromRule && isVisible(fromRule)) return fromRule;

  const byClass = document.querySelector('flow-agent-mode-toggle-chip button, button.agent-mode-chip, .agent-mode-chip');
  if (byClass && isVisible(byClass)) return byClass;

  const promptBox = document.querySelector('flow-creative-agent-prompt-box, flow-base-prompt-box, .prompt-box-content, .prompt-box, .base-prompt-box') || document;
  return promptBox.querySelector('flow-agent-mode-toggle-chip button, button.agent-mode-chip, .agent-mode-chip');
}

function isAgentModeActive() {
  // 1. Check if agent panel on the right sidebar is open
  const agentPanel = document.querySelector('flow-agent-panel, .agent-panel, flow-creative-agent-panel');
  if (agentPanel && isVisible(agentPanel)) return true;

  // 2. Check container element class
  const toggleChip = document.querySelector('flow-agent-mode-toggle-chip');
  if (toggleChip && toggleChip.classList.contains('checked')) return true;

  // 3. Check chip button class, aria-pressed, and glow outlines
  const chipBtn = document.querySelector('button.agent-mode-chip, .agent-mode-chip, flow-agent-mode-toggle-chip button');
  if (chipBtn) {
    if (chipBtn.classList.contains('agent-mode-chip-checked')) return true;
    if (chipBtn.getAttribute('aria-pressed') === 'true') return true;
    if (chipBtn.querySelector('.glow-fill, .glow-outline')) return true;
  }

  // 4. Check prompt box wrapper
  if (document.querySelector('flow-creative-agent-prompt-box')) return true;

  // 5. If standard settings trigger button exists and is NOT hidden, agent mode is definitely OFF
  const settingsBtn = document.querySelector('button.settings-trigger-button');
  if (settingsBtn && isVisible(settingsBtn) && !settingsBtn.hasAttribute('hidden')) {
    return false;
  }

  return false;
}

function getAgentModeState() {
  return isAgentModeActive();
}

async function closeAgentPanelAndDisableAgentMode() {
  console.log('[ShineFlowWorker] 🛑 Ensuring right sidebar & Agent Mode are CLOSED/DISABLED...');

  // 1. If right agent panel is visible, close it via its header close button
  const agentPanel = window.DomRuleEngine?.query('agentPanel.container') || document.querySelector('flow-agent-panel, .agent-panel, flow-creative-agent-panel');
  if (agentPanel && isVisible(agentPanel)) {
    const ruleCloseBtn = window.DomRuleEngine?.query('agentPanel.closeButton', agentPanel);
    if (ruleCloseBtn && isVisible(ruleCloseBtn)) {
      console.log('[ShineFlowWorker] ✕ Closing agent panel via rule close button...');
      robustClick(ruleCloseBtn);
      await new Promise(r => setTimeout(r, 400));
    } else {
      const headerCloseBtn = agentPanel.querySelector('.agent-panel-header .header-right button:last-of-type, .agent-panel-header .header-right button, button:has(mat-icon)');
      if (headerCloseBtn) {
        console.log('[ShineFlowWorker] ✕ Closing agent panel via header button...');
        robustClick(headerCloseBtn);
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  // 2. Check if Agent Mode is active on prompt bar
  if (!isAgentModeActive()) {
    console.log('[ShineFlowWorker] ✅ Agent Mode is ALREADY OFF. No toggle needed.');
  } else {
    console.log('[ShineFlowWorker] 🔄 Agent Mode is ACTIVE. Turning it OFF to restore Standard Canvas mode...');

    // First attempt: robust click on the chip button
    const chip = findAgentModeChip() || document.querySelector('flow-agent-mode-toggle-chip button, button.agent-mode-chip');
    if (chip) {
      console.log('[ShineFlowWorker] 🖱️ Clicking Agent Mode chip...');
      robustClick(chip);

      // Poll up to 2 seconds for Agent Mode to deactivate
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!isAgentModeActive()) break;
      }
    }

    // Second attempt: if still active, try clicking the label or container element
    if (isAgentModeActive()) {
      const label = document.querySelector('.agent-mode-chip-label') ||
        document.querySelector('flow-agent-mode-toggle-chip .agent-mode-chip-label');
      const container = document.querySelector('flow-agent-mode-toggle-chip');

      if (label) {
        console.log('[ShineFlowWorker] 🔄 Retrying click on agent-mode-chip-label...');
        robustClick(label);
      } else if (container) {
        console.log('[ShineFlowWorker] 🔄 Retrying click on flow-agent-mode-toggle-chip container...');
        robustClick(container);
      }

      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!isAgentModeActive()) break;
      }
    }

    if (!isAgentModeActive()) {
      console.log('[ShineFlowWorker] ✅ Agent Mode successfully turned OFF (Standard Canvas mode restored).');
    } else {
      console.warn('[ShineFlowWorker] ⚠️ Agent Mode still appears active after turn-off attempts.');
    }
  }

  // 3. Dismiss any open backdrops or floating dialogs
  const backdrops = Array.from(document.querySelectorAll('.cdk-overlay-backdrop')).filter(isVisible);
  for (const bd of backdrops) {
    robustClick(bd);
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
}

async function ensureAgentMode(desiredState) {
  if (typeof desiredState !== 'boolean') return;
  const current = isAgentModeActive();
  if (current === desiredState) return;

  if (desiredState === false) {
    await closeAgentPanelAndDisableAgentMode();
  } else {
    const chip = findAgentModeChip() || document.querySelector('flow-agent-mode-toggle-chip button, button.agent-mode-chip');
    if (chip) {
      console.log('[ShineFlowWorker] 🔄 Turning ON Agent Mode...');
      robustClick(chip);
      await new Promise(r => setTimeout(r, 400));
    }
  }
}

// ── 3. Find Prompt Input Box ──────────────────────────────────────────────────

function findPromptInput() {
  const fromRule = window.DomRuleEngine?.query('promptInput.editor');
  if (fromRule && isVisible(fromRule)) return fromRule;

  // Prioritize standard floating prompt box on canvas
  const primary = document.querySelector('.prompt-box-content .ProseMirror, flow-base-prompt-box .ProseMirror, flow-rich-text-editor .ProseMirror, .ProseMirror[contenteditable="true"]');
  if (primary && isVisible(primary)) return primary;

  // Fallback to agent panel only if canvas prompt box not found
  const agentPanel = window.DomRuleEngine?.query('agentPanel.container') || document.querySelector('flow-agent-panel');
  if (agentPanel && isVisible(agentPanel)) {
    const agentInput = agentPanel.querySelector('.ProseMirror, flow-rich-text-editor, [contenteditable="true"]');
    if (agentInput && isVisible(agentInput)) return agentInput;
  }

  const candidates = Array.from(document.querySelectorAll(
    'textarea, div[contenteditable="true"], [role="textbox"], .ProseMirror, input[type="text"], input:not([type])'
  )).filter(isVisible);

  const promptCandidates = candidates.filter(el => {
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const dataPlaceholder = (el.getAttribute('data-placeholder') || '').toLowerCase();
    const combined = `${placeholder} ${ariaLabel} ${name} ${title} ${dataPlaceholder}`;

    if (/search|filter|email|password|login/i.test(combined)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.top < 60 && rect.width < 350) return false;
    return true;
  });

  if (promptCandidates.length > 0) {
    promptCandidates.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    return promptCandidates[0];
  }
  return null;
}

function dismissAllOverlays() {
  try {
    // 1. Clear any accidental text selection (quét khối) across the entire window
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();

    // 2. Click any backdrop if open
    const backdrops = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('overlays.backdrop') : Array.from(document.querySelectorAll('.cdk-overlay-backdrop, .flow-account-panel-overlay'))).filter(isVisible);
    for (const b of backdrops) {
      robustClick(b);
    }

    // 2.5 Ensure any Add Menu / Upload drawer is dismissed
    try { closeAddMenuDrawer(); } catch (_) {}

    // 3. Click specific close buttons on account panels or dialogs (NEVER match all buttons indiscriminately)
    const closeBtns = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('overlays.closeButton') : Array.from(document.querySelectorAll(
      'button[aria-label*="close" i], button[aria-label*="đóng" i], button.close-btn, flow-account-panel button[aria-label*="close" i], flow-account-panel button[aria-label*="đóng" i], flow-account-panel .close-btn, flow-account-panel button:has(mat-icon), flow-account-panel button:has(svg), flow-account-panel header button'
    ))).filter(isVisible);
    for (const btn of closeBtns) {
      robustClick(btn);
    }

    // 4. If account panel is still open, click avatar button to toggle it closed
    const accountPanel = document.querySelector('flow-account-panel, .flow-account-panel-overlay');
    if (accountPanel && isVisible(accountPanel)) {
      const avatarBtn = window.DomRuleEngine?.query('accountCredits.avatarButton')
        || document.querySelector('.header-user-button, flow-header-user-icon [role="button"], flow-header-user-icon button, flow-header-user-icon');
      if (avatarBtn) robustClick(avatarBtn);
    }

    // 5. If settings overlay is open, dismiss it
    const settingsOverlay = document.querySelector('flow-prompt-box-settings, .settings-content-overlay');
    if (settingsOverlay && isVisible(settingsOverlay)) {
      const triggerBtn = findSettingsTriggerButton();
      if (triggerBtn) {
        triggerBtn.click();
      } else {
        const outsideTarget = document.querySelector('.prompt-box-content, flow-base-prompt-box, .base-prompt-box');
        if (outsideTarget) outsideTarget.click();
      }
    }

    // 6. Dispatch Escape key to dismiss any remaining popups ONLY if an overlay is actually open
    const hasVisibleOverlay = document.querySelector('.cdk-overlay-pane:not(:empty), mat-dialog-container, flow-account-panel');
    if (hasVisibleOverlay && isVisible(hasVisibleOverlay)) {
      const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true, composed: true });
      if (document.activeElement && !document.activeElement.closest('flow-base-prompt-box, .prosemirror-editor, [contenteditable]')) {
        document.activeElement.dispatchEvent(escEvt);
      }
      document.dispatchEvent(escEvt);
    }

    // 7. Guarantee no active text selection remains
    const selAfter = window.getSelection();
    if (selAfter && (!document.activeElement || !document.activeElement.closest('flow-base-prompt-box, .prosemirror-editor, [contenteditable]'))) {
      selAfter.removeAllRanges();
    }
  } catch (_) {}
}

// ── 4. Set Prompt Text ────────────────────────────────────────────────────────

async function setPromptText(inputEl, text) {
  // Clear any global document text selection first to prevent visual page highlights
  try {
    const sel = window.getSelection();
    if (sel && (!document.activeElement || !document.activeElement.closest('flow-base-prompt-box, .prosemirror-editor, [contenteditable]'))) {
      sel.removeAllRanges();
    }
  } catch (_) {}

  inputEl.focus();

  if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
    inputEl.value = text;
    inputEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    return;
  }

  // 1. Primary: Delegate to Main-world inpage interceptor (Direct ProseMirror View & un-sanitized DataTransfer)
  try {
    window.postMessage({
      source: 'SHINE_FLOW_CONTENT',
      type: 'SET_PROMPT_TEXT',
      prompt: text,
    }, '*');
  } catch (_) {}

  // Wait a moment for main-world ProseMirror transaction to apply
  await new Promise(r => setTimeout(r, 300));

  // 2. Secondary: If main world did not populate, use scoped insertText
  if (!inputEl.textContent?.includes(text.slice(0, 15))) {
    try {
      inputEl.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(inputEl);
        sel.addRange(range);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, text);
      }
    } catch (_) {}
  }

  // 3. Fallback: DOM structure replacement if still not matching
  if (!inputEl.textContent?.trim()) {
    inputEl.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = text;
    inputEl.appendChild(p);
  }

  // 4. Dispatch standard input events for Angular reactive change detection
  try {
    inputEl.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
  } catch (_) {}
  inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
  inputEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

  // 5. Collapse selection to end of editor without destroying focus
  try {
    const sel = window.getSelection();
    if (sel && inputEl) {
      const range = document.createRange();
      range.selectNodeContents(inputEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch (_) {}
}

// ── 5. Configure Settings Overlay (Type, SubMode, Ratio, Model, Resolution, Duration, Count) ──

function findSettingsTriggerButton() {
  const fromRule = window.DomRuleEngine?.query('settingsTrigger.button');
  if (fromRule && isVisible(fromRule) && !fromRule.hasAttribute('hidden')) return fromRule;

  const known = document.querySelector(
    'button.settings-trigger-button:not([hidden]), flow-base-prompt-box button.settings-trigger-button, .base-prompt-box button.settings-trigger-button, button.settings-trigger-button'
  );
  if (known && isVisible(known) && !known.hasAttribute('hidden')) return known.closest('button') || known;

  const promptBox = document.querySelector('flow-base-prompt-box, .prompt-box-content, .prompt-box, .base-prompt-box') || document;
  const summaryBtn = promptBox.querySelector('button:has(.settings-summary), button:has([settingstriggercontent])');
  if (summaryBtn && isVisible(summaryBtn)) return summaryBtn;

  return null;
}

function findActiveSettingsOverlayPane() {
  const overlayFromRule = window.DomRuleEngine?.query('settingsOverlay.container');
  if (overlayFromRule && isVisible(overlayFromRule)) return overlayFromRule.closest('.cdk-overlay-pane') || overlayFromRule;

  const direct = document.querySelector('flow-prompt-box-settings');
  if (direct && isVisible(direct)) return direct.closest('.cdk-overlay-pane') || direct;

  const container = document.querySelector('.cdk-overlay-container') || document;
  const panes = Array.from(container.querySelectorAll('.cdk-overlay-pane, [role="dialog"]')).filter(isVisible);

  // Match pane that specifically contains setting controls via class or tag
  const matched = panes.reverse().find(p => p.querySelector('flow-prompt-box-settings, flow-toggles, .settings-content'));
  return matched || panes[panes.length - 1] || null;
}

function getClickableElements(pane) {
  if (!pane) return [];
  return Array.from(
    pane.querySelectorAll(
      'button, mat-button-toggle, .mat-mdc-button-toggle-button, [role="button"], [role="tab"], [role="radio"], [class*="toggle"], [class*="pill"], [class*="chip"], span, div'
    )
  ).filter(isVisible);
}

async function ensureSettingsConfigured(job, isRetry = false) {
  const isVideo = job.type === 'video';
  const isTargetPortrait = job.aspectRatio === '9:16' || (job.model && job.model.includes('portrait')) || !job.aspectRatio;
  const isTargetLandscape = job.aspectRatio === '16:9' || (job.model && job.model.includes('landscape'));
  const isTargetSquare = job.aspectRatio === '1:1' || (job.model && job.model.includes('square'));
  const targetRatio = isTargetPortrait ? '9:16' : isTargetLandscape ? '16:9' : isTargetSquare ? '1:1' : '9:16';
  const targetDuration = Number(job.duration) || 8;
  const targetResolution = job.resolution || '720p';

  // Sub-mode for video: 'frames' (Khung hình: start/end frame) requires EXPLICIT start/end images
  // Using isFramesMode too broadly was causing false positives + Start Frame slot not found errors
  const isFramesMode = Boolean(
    job.imageStart || job.startFrame || job.start_frame_url ||
    job.imageEnd || job.endFrame || job.end_frame_url ||
    job.mode === 'interpolation' || job.mode === 'i2v'
    // NOTE: Do NOT include generic `images[]` or `referenceImages[]` here - those should use Ingredients mode
  );

  console.log(`[ShineFlowWorker] ⚙️ Configuring Settings: Type=${job.type}, SubMode=${isFramesMode ? 'Khung hình' : 'Thành phần'}, Ratio=${targetRatio}, Model=${job.model}, Res=${targetResolution}, Duration=${targetDuration}s`);

  // Always ensure right sidebar is closed & Agent mode is turned OFF so standard settings trigger button is visible!
  await closeAgentPanelAndDisableAgentMode();
  await new Promise(r => setTimeout(r, 400));

  // Locate settings trigger button in floating prompt bar
  let triggerBtn = findSettingsTriggerButton();
  if (!triggerBtn) {
    for (let r = 0; r < 6; r++) {
      if (isAgentModeActive()) {
        await closeAgentPanelAndDisableAgentMode();
      }
      await new Promise(res => setTimeout(res, 500));
      triggerBtn = findSettingsTriggerButton();
      if (triggerBtn) break;
    }
  }

  if (!triggerBtn) {
    console.warn('[ShineFlowWorker] ⚠️ Settings trigger button not found, continuing with defaults.');
    return;
  }

  // Open settings overlay if not already open
  let overlayPane = findActiveSettingsOverlayPane();
  if (!overlayPane) {
    console.log('[ShineFlowWorker] Clicking settings trigger button to open settings...');
    triggerBtn.click();
    await new Promise(r => setTimeout(r, 600));

    overlayPane = findActiveSettingsOverlayPane();
    if (!overlayPane) {
      for (let r = 0; r < 6; r++) {
        await new Promise(res => setTimeout(res, 300));
        overlayPane = findActiveSettingsOverlayPane();
        if (overlayPane) break;
      }
    }
  }

  if (!overlayPane) {
    console.warn('[ShineFlowWorker] ⚠️ Settings overlay pane not found after clicking trigger.');
    return;
  }

  // ── Step 1: Switch Generation Type (Image vs Video) ──
  overlayPane = findActiveSettingsOverlayPane() || overlayPane;

  let imageToggleBtn = window.DomRuleEngine?.query('settingsToggles.mode.image', overlayPane);
  let videoToggleBtn = window.DomRuleEngine?.query('settingsToggles.mode.video', overlayPane);

  if (!imageToggleBtn || !videoToggleBtn) {
    const allToggles = Array.from(overlayPane.querySelectorAll('mat-button-toggle, button, [role="button"], [role="radio"]')).filter(isVisible);
    if (!imageToggleBtn) {
      imageToggleBtn = allToggles.find(t => {
        const txt = (t.textContent || '').trim().toLowerCase();
        const icon = t.querySelector('mat-icon')?.textContent?.trim().toLowerCase() || '';
        return (txt.includes('hình ảnh') || txt.includes('image') || icon === 'image') && !txt.includes('video');
      });
    }
    if (!videoToggleBtn) {
      videoToggleBtn = allToggles.find(t => {
        const txt = (t.textContent || '').trim().toLowerCase();
        const icon = t.querySelector('mat-icon')?.textContent?.trim().toLowerCase() || '';
        return (txt.includes('video') && !txt.includes('google')) || icon === 'videocam';
      });
    }
  }

  const modeToggleBtn = isVideo ? videoToggleBtn : imageToggleBtn;

  if (modeToggleBtn) {
    const parentToggle = modeToggleBtn.closest('mat-button-toggle') || modeToggleBtn;
    const btn = modeToggleBtn.tagName === 'BUTTON' ? modeToggleBtn : (modeToggleBtn.querySelector('button') || modeToggleBtn);
    const isAlreadyChecked = parentToggle.classList.contains('mat-button-toggle-checked') ||
      btn.getAttribute('aria-checked') === 'true' ||
      btn.getAttribute('aria-pressed') === 'true';

    if (!isAlreadyChecked) {
      console.log(`[ShineFlowWorker] 🎬 Switching mode to "${isVideo ? 'Video' : 'Image'}"...`);
      btn.click();
      await new Promise(r => setTimeout(r, 350));
      if (!parentToggle.classList.contains('mat-button-toggle-checked')) {
        parentToggle.click();
        await new Promise(r => setTimeout(r, 350));
      }
    }
  }

  // ── Step 2: For Video, Switch Sub-Mode (Frames vs Ingredients) ──
  if (isVideo) {
    overlayPane = findActiveSettingsOverlayPane() || overlayPane;
    // Submode is the 2nd flow-toggles in video settings
    const subModeGroup = overlayPane.querySelector('flow-toggles:nth-of-type(2)');
    if (subModeGroup) {
      const toggles = Array.from(subModeGroup.querySelectorAll('mat-button-toggle'));
      // Index 0 is Frames (crop_free), Index 1 is Ingredients (chrome_extension)
      const subModeToggleBtn = isFramesMode ? (toggles[0] || toggles.find(t => t.querySelector('mat-icon')?.textContent?.trim() === 'crop_free'))
                                            : (toggles[1] || toggles.find(t => t.querySelector('mat-icon')?.textContent?.trim() === 'chrome_extension'));
      if (subModeToggleBtn) {
        const btn = subModeToggleBtn.querySelector('button') || subModeToggleBtn;
        const isAlreadyChecked = subModeToggleBtn.classList.contains('mat-button-toggle-checked') || btn.getAttribute('aria-checked') === 'true';
        if (!isAlreadyChecked) {
          console.log(`[ShineFlowWorker] 🎞️ Switching Video Sub-Mode to ${isFramesMode ? 'Frames' : 'Ingredients'}...`);
          btn.click();
          await new Promise(r => setTimeout(r, 350));
          if (!subModeToggleBtn.classList.contains('mat-button-toggle-checked')) {
            subModeToggleBtn.click();
            await new Promise(r => setTimeout(r, 350));
          }
        }
      }
    }
  }

  // ── Step 3: Switch Aspect Ratio (Image: 5 options; Video: 2 options) ──
  overlayPane = findActiveSettingsOverlayPane() || overlayPane;
  if (!isVideo) {
    // Image Mode: flow-toggles:nth-of-type(2) has 5 options [16:9, 4:3, 1:1, 3:4, 9:16]
    const ratioBtn = window.DomRuleEngine?.query(`imageSettings.aspectRatio.options.${targetRatio}`, overlayPane);
    if (ratioBtn && isVisible(ratioBtn)) {
      console.log(`[ShineFlowWorker] 📐 Selecting Image Aspect Ratio "${targetRatio}" via rule...`);
      ratioBtn.click();
      await new Promise(r => setTimeout(r, 250));
    } else {
      const ratioGroup = overlayPane.querySelector('flow-toggles:nth-of-type(2), .mat-button-toggle-group.content-layout-column');
      if (ratioGroup) {
        const ratioToggles = Array.from(ratioGroup.querySelectorAll('mat-button-toggle'));
        const ratioIndexMap = { '16:9': 0, '4:3': 1, '1:1': 2, '3:4': 3, '9:16': 4 };
        const targetIdx = ratioIndexMap[targetRatio] !== undefined ? ratioIndexMap[targetRatio] : 4;
        const targetToggle = ratioToggles[targetIdx] || ratioToggles[0];
        if (targetToggle) {
          const btn = targetToggle.querySelector('button') || targetToggle;
          btn.click();
          await new Promise(r => setTimeout(r, 250));
        }
      }
    }
  } else {
    // Video Mode: flow-toggles:nth-of-type(3) has 2 options [16:9, 9:16]
    const ratioBtn = window.DomRuleEngine?.query(`videoSettings.aspectRatio.options.${targetRatio}`, overlayPane);
    if (ratioBtn && isVisible(ratioBtn)) {
      console.log(`[ShineFlowWorker] 📐 Selecting Video Aspect Ratio "${targetRatio}" via rule...`);
      ratioBtn.click();
      await new Promise(r => setTimeout(r, 250));
    } else {
      const ratioGroup = overlayPane.querySelector('flow-toggles:nth-of-type(3)');
      if (ratioGroup) {
        const ratioToggles = Array.from(ratioGroup.querySelectorAll('mat-button-toggle'));
        // In video mode: index 0 is 16:9, index 1 is 9:16
        const targetIdx = targetRatio === '16:9' ? 0 : 1;
        const targetToggle = ratioToggles[targetIdx] || ratioToggles[1];
        if (targetToggle) {
          const btn = targetToggle.querySelector('button') || targetToggle;
          btn.click();
          await new Promise(r => setTimeout(r, 250));
        }
      }
    }
  }

  // ── Step 4: Switch Model (Dropdown selection - Image & Video modes) ──
  overlayPane = findActiveSettingsOverlayPane() || overlayPane;
  const modelDropdownBtn = window.DomRuleEngine?.query(isVideo ? 'videoSettings.modelDropdown.button' : 'imageSettings.modelDropdown.button', overlayPane)
    || overlayPane.querySelector('button:has(.model-select-trigger-content), flow-prompt-box-settings button.mat-mdc-menu-trigger, .model-select-trigger-content');
  if (modelDropdownBtn && job.model) {
    const currentTriggerText = (modelDropdownBtn.textContent || '').toLowerCase();
    const targetModelClean = job.model.toLowerCase();
    if (!currentTriggerText.includes(targetModelClean)) {
      console.log(`[ShineFlowWorker] 🤖 Opening Model dropdown for target model: ${job.model}...`);
      modelDropdownBtn.click();
      await new Promise(r => setTimeout(r, 450));

      const menuPanels = Array.from(document.querySelectorAll('.mat-mdc-menu-panel, [role="menu"]')).filter(isVisible);
      const activeMenu = menuPanels[menuPanels.length - 1];
      if (activeMenu) {
        const menuItems = Array.from(activeMenu.querySelectorAll('[role="menuitem"], button.mat-mdc-menu-item')).filter(isVisible);
        const matchedItem = menuItems.find(it => it.textContent.toLowerCase().includes(targetModelClean)) || menuItems[0];
        if (matchedItem) {
          matchedItem.click();
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }
  }

  // ── Step 5: For Video, Switch Resolution (360p vs 720p) ──
  if (isVideo) {
    overlayPane = findActiveSettingsOverlayPane() || overlayPane;
    const resGroup = overlayPane.querySelector('flow-toggles:nth-of-type(4)');
    if (resGroup) {
      const resToggles = Array.from(resGroup.querySelectorAll('mat-button-toggle'));
      const targetToggle = targetResolution.toLowerCase() === '360p' ? resToggles[0] : resToggles[1];
      if (targetToggle) {
        const btn = targetToggle.querySelector('button') || targetToggle;
        const isAlreadyChecked = targetToggle.classList.contains('mat-button-toggle-checked') || btn.getAttribute('aria-checked') === 'true';
        if (!isAlreadyChecked) {
          console.log(`[ShineFlowWorker] 📺 Selecting Resolution "${targetResolution}"...`);
          btn.click();
          await new Promise(r => setTimeout(r, 250));
        }
      }
    }
  }

  // ── Step 6: For Video, Switch Duration (4s, 6s, 8s, 10s) ──
  if (isVideo) {
    overlayPane = findActiveSettingsOverlayPane() || overlayPane;
    const durGroup = overlayPane.querySelector('flow-toggles:nth-of-type(5)');
    const flowDur = targetDuration <= 4 ? 4 : targetDuration <= 6 ? 6 : targetDuration <= 8 ? 8 : 10;
    if (durGroup) {
      const toggles = Array.from(durGroup.querySelectorAll('mat-button-toggle'));
      const durIndexMap = { 4: 0, 6: 1, 8: 2, 10: 3 };
      const targetIdx = durIndexMap[flowDur] !== undefined ? durIndexMap[flowDur] : 2;
      const targetToggle = toggles[targetIdx];
      if (targetToggle) {
        const btn = targetToggle.querySelector('button') || targetToggle;
        const isAlreadyChecked = targetToggle.classList.contains('mat-button-toggle-checked') || btn.getAttribute('aria-checked') === 'true';
        if (!isAlreadyChecked) {
          console.log(`[ShineFlowWorker] ⏱️ Configuring Video Duration to ${flowDur}s...`);
          btn.click();
          await new Promise(r => setTimeout(r, 250));
        }
      }
    }
  }

  // ── Step 7: Switch Outputs Count (x1, x2, x3, x4) ──
  overlayPane = findActiveSettingsOverlayPane() || overlayPane;
  const targetCount = job.n ? `x${job.n}` : 'x1';
  let countToggleBtn = window.DomRuleEngine?.query(isVideo ? `videoSettings.count.options.${targetCount}` : `imageSettings.count.options.${targetCount}`, overlayPane);

  if (!countToggleBtn) {
    const countGroup = overlayPane?.querySelector('flow-toggles:last-of-type');
    if (countGroup) {
      const countIndexMap = { 'x1': 0, 'x2': 1, 'x3': 2, 'x4': 3 };
      const targetIdx = countIndexMap[targetCount] !== undefined ? countIndexMap[targetCount] : 0;
      const matToggles = Array.from(countGroup.querySelectorAll('mat-button-toggle'));
      const targetToggleEl = matToggles[targetIdx];
      if (targetToggleEl) {
        countToggleBtn = targetToggleEl.querySelector('button') || targetToggleEl;
      }
    }
  }

  if (countToggleBtn && isVisible(countToggleBtn)) {
    const parentToggle = countToggleBtn.closest('mat-button-toggle') || countToggleBtn;
    const isAlreadyChecked = parentToggle.classList.contains('mat-button-toggle-checked') || countToggleBtn.getAttribute('aria-checked') === 'true';
    if (!isAlreadyChecked) {
      console.log(`[ShineFlowWorker] 🔢 Selecting Count ${targetCount}...`);
      const mouseSeq = (el) => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();
      };
      mouseSeq(countToggleBtn);
      if (countToggleBtn !== parentToggle) mouseSeq(parentToggle);
      await new Promise(r => setTimeout(r, 250));
    }
  }

  // ── Step 8: Cleanly Close Settings Overlay ──
  await new Promise(r => setTimeout(r, 300));
  for (let c = 0; c < 4; c++) {
    const activeOverlay = findActiveSettingsOverlayPane();
    if (!activeOverlay) break;

    // Attempt 1: Click trigger button once
    if (c === 0) {
      triggerBtn = findSettingsTriggerButton();
      if (triggerBtn && isVisible(triggerBtn)) {
        triggerBtn.click();
        await new Promise(r => setTimeout(r, 350));
        if (!findActiveSettingsOverlayPane()) break;
      }
    }

    // Attempt 2: Click outside on prompt box or canvas
    const outsideTarget = document.querySelector('.prompt-box-content, flow-base-prompt-box, .base-prompt-box');
    if (outsideTarget) {
      outsideTarget.click();
      await new Promise(r => setTimeout(r, 300));
      if (!findActiveSettingsOverlayPane()) break;
    }

    // Attempt 3: Backdrop
    const backdrop = document.querySelector('.cdk-overlay-backdrop');
    if (backdrop && isVisible(backdrop)) {
      robustClick(backdrop);
      await new Promise(r => setTimeout(r, 300));
      if (!findActiveSettingsOverlayPane()) break;
    }

    // Attempt 4: Escape key
    const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true, composed: true });
    if (document.activeElement) document.activeElement.dispatchEvent(escEvt);
    document.dispatchEvent(escEvt);
    window.dispatchEvent(escEvt);
    await new Promise(r => setTimeout(r, 300));
  }

  // Clear any accidental text selection
  try {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  } catch (_) {}

  // Extra delay to let ingredient-bar / frame-trigger slots animate into DOM
  await new Promise(r => setTimeout(r, 400));
}

// ── 6. Reference Images & Start/End Frame Attachment ──────────────────────────

function countPromptChips() {
  const chips = document.querySelectorAll(
    'flow-base-prompt-box flow-image-ingredient-chip, ' +
    'flow-base-prompt-box [class*="ingredient-chip"], ' +
    'flow-base-prompt-box [class*="chip"], ' +
    'flow-base-prompt-box [class*="pill"], ' +
    'flow-base-prompt-box img:not([class*="avatar"])'
  );
  return chips.length;
}

function isDrawerOpen() {
  const drawerEls = Array.from(document.querySelectorAll(
    'flow-add-menu-popover-content, .add-menu-popover-container, flow-add-menu-detail-pane, .flow-add-menu-popover, .cdk-overlay-pane:has(flow-add-menu-popover-content), .cdk-overlay-pane:has(flow-add-menu-detail-pane)'
  ));
  return drawerEls.some(el => isVisible(el));
}

async function closeAddMenuDrawer() {
  try {
    // 1. Unfocus any active element inside the drawer/inputs
    if (document.activeElement) {
      try { document.activeElement.blur(); } catch (_) {}
    }

    // 2. Clear any text selection
    try {
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    } catch (_) {}

    if (!isDrawerOpen()) return;

    // 2.5 Action 0: If inside flow-add-menu-detail-pane, close or go back from it first
    const detailPanes = Array.from(document.querySelectorAll('flow-add-menu-detail-pane')).filter(isVisible);
    for (const dp of detailPanes) {
      const dismissBtn = Array.from(dp.querySelectorAll('button')).find(b => {
        const icon = b.querySelector('mat-icon, .google-symbols')?.textContent?.trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return icon === 'close' || icon === 'arrow_back' || icon === 'chevron_left' || aria.includes('close') || aria.includes('đóng') || aria.includes('back') || aria.includes('quay lại');
      });
      if (dismissBtn) {
        robustClick(dismissBtn);
      }
    }
    await new Promise(r => setTimeout(r, 120));
    if (!isDrawerOpen()) return;

    // 3. Action 1: Dispatch full Escape key events to document, window, and body
    const dispatchEsc = () => {
      const escOpts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true, composed: true };
      window.dispatchEvent(new KeyboardEvent('keydown', escOpts));
      document.dispatchEvent(new KeyboardEvent('keydown', escOpts));
      document.body?.dispatchEvent(new KeyboardEvent('keydown', escOpts));
      window.dispatchEvent(new KeyboardEvent('keyup', escOpts));
      document.dispatchEvent(new KeyboardEvent('keyup', escOpts));
    };

    dispatchEsc();
    await new Promise(r => setTimeout(r, 120));
    if (!isDrawerOpen()) return;

    // 4. Action 2: Click backdrop elements
    const backdrops = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('overlays.backdrop') : Array.from(document.querySelectorAll(
      '.cdk-overlay-backdrop, .flow-account-panel-overlay, .cdk-overlay-transparent-backdrop'
    ))).filter(isVisible);
    for (const b of backdrops) {
      robustClick(b);
    }
    await new Promise(r => setTimeout(r, 120));
    if (!isDrawerOpen()) return;

    // 5. Action 3: Click explicit close/cancel buttons
    const closeButtons = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('upload.drawerCloseButton') : Array.from(document.querySelectorAll(
      'flow-add-menu-popover-content button[aria-label*="đóng" i], button[aria-label*="đóng" i], button[aria-label*="close" i], button.close-button, [aria-label*="Hủy" i], [aria-label*="Cancel" i]'
    ))).filter(isVisible);
    for (const btn of closeButtons) {
      robustClick(btn);
    }
    await new Promise(r => setTimeout(r, 120));
    if (!isDrawerOpen()) return;

    // 6. Action 4: Click outside point on canvas/background (e.g. 30, 30)
    const outsideEl = document.elementFromPoint(30, 30) || document.body;
    if (outsideEl) {
      const opts = { clientX: 30, clientY: 30, bubbles: true, cancelable: true, view: window };
      outsideEl.dispatchEvent(new PointerEvent('pointerdown', opts));
      outsideEl.dispatchEvent(new MouseEvent('mousedown', opts));
      outsideEl.dispatchEvent(new PointerEvent('pointerup', opts));
      outsideEl.dispatchEvent(new MouseEvent('mouseup', opts));
      outsideEl.dispatchEvent(new MouseEvent('click', opts));
    }
    await new Promise(r => setTimeout(r, 150));
    if (!isDrawerOpen()) return;

    // 7. Action 5: Toggle add menu trigger ONLY if aria-expanded is true
    const addMenuBtn = window.DomRuleEngine?.query('addMenu.trigger') || document.querySelector('flow-add-menu button, button.add-menu-trigger');
    if (addMenuBtn && addMenuBtn.getAttribute('aria-expanded') === 'true') {
      robustClick(addMenuBtn);
      await new Promise(r => setTimeout(r, 150));
    }

    dispatchEsc();

    // 8. Action 6: Force dismiss lingering drawer overlays if still open
    if (isDrawerOpen()) {
      const lingeringOverlays = Array.from(document.querySelectorAll(
        '.cdk-overlay-pane:has(flow-add-menu-popover-content), .cdk-overlay-pane:has(flow-add-menu-detail-pane), flow-add-menu-popover-content, flow-add-menu-detail-pane, .cdk-overlay-backdrop'
      ));
      for (const el of lingeringOverlays) {
        try {
          el.style.display = 'none';
        } catch (_) {}
      }
    }
  } catch (_) {}
}

function normalizeMediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch (_) {
    return url.split('?')[0].split('#')[0];
  }
}

async function urlToBase64(url) {
  if (!url) return { base64: '', type: 'image/png' };
  if (url.startsWith('data:')) {
    const arr = url.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    return { base64: arr[1], type: mime };
  } else {
    let fetchUrl = url;
    if (url.startsWith('/')) {
      fetchUrl = `http://127.0.0.1:3001${url}`;
    }
    try {
      let res = await fetch(fetchUrl);
      if (!res.ok && url.startsWith('/')) {
        res = await fetch(`http://localhost:3000${url}`);
      }
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const full = reader.result;
          const arr = full.split(',');
          resolve({ base64: arr[1], type: blob.type || 'image/png' });
        };
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[ShineFlowWorker] urlToBase64 fetch notice:', e.message);
      return { base64: '', type: 'image/png' };
    }
  }
}

async function urlToFile(url, filename = 'frame.png') {
  if (!url) return new File([], filename, { type: 'image/png' });
  if (url.startsWith('data:')) {
    const arr = url.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } else {
    let fetchUrl = url;
    if (url.startsWith('/')) {
      fetchUrl = `http://127.0.0.1:3001${url}`;
    }
    try {
      let res = await fetch(fetchUrl);
      if (!res.ok && url.startsWith('/')) {
        res = await fetch(`http://localhost:3000${url}`);
      }
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type || 'image/png' });
    } catch (_) {
      return new File([], filename, { type: 'image/png' });
    }
  }
}

function findUploadButton() {
  const fromRule = window.DomRuleEngine?.query('addMenu.uploadButton');
  if (fromRule && isVisible(fromRule)) return fromRule;

  const specific = document.querySelector(
    'button.sidebar-upload-btn, .sidebar-footer button, flow-add-menu-side-nav .sidebar-footer button'
  );
  if (specific && isVisible(specific)) return specific;

  // Fallback by icon ligature
  const byIcon = Array.from(document.querySelectorAll('flow-add-menu-popover-content button, .add-menu-popover-container button')).find(
    b => b.querySelector('mat-icon')?.textContent?.trim() === 'upload'
  );
  return byIcon || null;
}

function findAddToPromptButton() {
  // 1. Text-based search on any visible button (matches "Thêm vào câu lệnh" in Vietnamese and "Add to prompt" in English)
  const allButtons = Array.from(document.querySelectorAll('flow-add-menu-detail-pane button, flow-add-menu-detail-pane [role="button"], button, div[role="button"], a[role="button"]')).filter(isVisible);
  const byText = allButtons.find(b => {
    const text = (b.textContent || '').trim();
    return /Thêm vào câu lệnh|Add to prompt/i.test(text);
  });
  if (byText) return byText;

  // 2. Query from DomRuleEngine rule
  const fromRule = window.DomRuleEngine?.query('addMenu.addToPromptButton');
  if (fromRule && isVisible(fromRule)) return fromRule;

  // 3. Specific selectors in detail pane or overlay
  const specific = document.querySelector([
    'flow-add-menu-detail-pane button.detail-add-to-prompt-btn',
    'button.detail-add-to-prompt-btn',
    'flow-add-menu-detail-pane .bottom-actions button',
    'flow-add-menu-detail-pane button:last-of-type',
    '[class*="detail"] button:last-of-type',
    '.cdk-overlay-pane [class*="detail"] button:has(span)',
    '.cdk-overlay-pane button.flow-button-primary',
  ].join(', '));
  if (specific && isVisible(specific)) return specific;

  return null;
}

async function switchToUploadsTab() {
  const overlayPane = window.DomRuleEngine?.query('upload.drawer') || document.querySelector('.cdk-overlay-pane, [role="dialog"], flow-add-menu-popover-content, .add-menu-popover-container');
  if (!overlayPane) return false;

  // 1. Match by text "Tệp tải lên" (Vietnamese) or "Uploads" (English)
  const candidates = Array.from(overlayPane.querySelectorAll('mat-list-item, [role="listitem"], [role="tab"], button, [class*="nav-item"], .side-nav-item, div, span')).filter(isVisible);
  const byText = candidates.find(el => {
    const t = (el.textContent || '').trim();
    return t === 'Tệp tải lên' || t === 'Uploads' || (/Tệp tải lên|Uploads/i.test(t) && !/đang tải/i.test(t));
  });
  if (byText) {
    const clickable = byText.closest('mat-list-item, [role="listitem"], [role="tab"], button, [class*="nav-item"]') || byText;
    robustClick(clickable);
    await new Promise(r => setTimeout(r, 400));
    return true;
  }

  const fromRule = window.DomRuleEngine?.query('addMenu.uploadsTab', overlayPane);
  if (fromRule && isVisible(fromRule)) {
    robustClick(fromRule);
    await new Promise(r => setTimeout(r, 400));
    return true;
  }

  // 2. Uploads tab fallback by icon or last list item
  const uploadsTab = overlayPane.querySelector('flow-add-menu-side-nav mat-nav-list mat-list-item:last-of-type, .side-nav-list mat-list-item:last-of-type') ||
                     Array.from(overlayPane.querySelectorAll('mat-list-item')).find(el => el.querySelector('mat-icon')?.textContent?.trim() === 'drive_folder_upload');
  if (uploadsTab) {
    robustClick(uploadsTab);
    await new Promise(r => setTimeout(r, 400));
    return true;
  }
  return false;
}

async function filterDrawerBySearch(keyword) {
  try {
    const searchInput = window.DomRuleEngine?.query('upload.searchInput')
      || document.querySelector('.search-header input.search-input, input.search-input, input[placeholder*="Tìm kiếm" i]');
    if (!searchInput) return;
    searchInput.focus();
    searchInput.value = keyword;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
  } catch (_) {}
}

async function waitForUploadsToFinish(minCount = 1, timeoutMs = 25000) {
  console.log(`[ShineFlowWorker] ⏳ Waiting for ${minCount} upload(s) to finish loading completely...`);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // 1. Check if drawer has any active loading spinners or progress bars
    const spinners = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('upload.progressSpinner') : Array.from(document.querySelectorAll(
      'flow-media-upload mat-spinner, flow-media-upload mat-progress-spinner, flow-media-upload [role="progressbar"], flow-add-menu-asset-list mat-spinner, flow-add-menu-asset-list mat-progress-spinner, flow-add-menu-asset-list [role="progressbar"], .asset-list-viewport mat-spinner, .asset-list-viewport mat-progress-spinner, [class*="upload-progress"], [class*="spinner"]'
    ))).filter(isVisible);

    // 2. Check ready items (thumbnail loaded, not disabled, no spinner)
    const items = getDrawerAssetItems();
    const readyItems = items.filter(it => {
      const hasSpinner = Boolean(it.querySelector('mat-spinner, mat-progress-spinner, [role="progressbar"], [class*="loading"], [class*="spinner"]'));
      const isDisabled = it.disabled || it.getAttribute('aria-disabled') === 'true' || it.classList.contains('mat-mdc-button-disabled');
      const img = it.querySelector('img');
      const hasValidImg = img && img.getAttribute('src') && !img.getAttribute('src').startsWith('data:image/svg');
      return !hasSpinner && !isDisabled && hasValidImg;
    });

    if (spinners.length === 0 && readyItems.length >= minCount) {
      console.log(`[ShineFlowWorker] ✅ All ${readyItems.length} upload(s) finished loading! (No spinners, images rendered)`);
      await new Promise(r => setTimeout(r, 600));
      return true;
    }

    await new Promise(r => setTimeout(r, 700));
  }

  console.warn(`[ShineFlowWorker] ⚠️ Upload wait reached timeout (${timeoutMs}ms). Proceeding with best-effort selection.`);
  return false;
}

function getDrawerAssetItems() {
  const selectors = [
    'flow-add-menu-asset-list button.asset-item',
    'cdk-virtual-scroll-viewport button.asset-item',
    'flow-add-menu-asset-list [role="option"]',
    'flow-add-menu-asset-list .asset-item',
    'flow-add-menu-asset-list button',
    '.cdk-overlay-pane flow-add-menu-asset-list button',
  ];
  for (const s of selectors) {
    const list = Array.from(document.querySelectorAll(s)).filter(isVisible);
    if (list.length > 0) return list;
  }
  return [];
}


const uploadedReferenceUrls = new Set();

function isUploadedReference(url) {
  if (!url || typeof url !== 'string') return false;
  if (uploadedReferenceUrls.has(url)) return true;
  for (const up of uploadedReferenceUrls) {
    if (up && up.length > 8 && (url === up || url.includes(up) || up.includes(url))) return true;
  }
  if (/ref_start_frame|ref_wardrobe|ref_location|ref_prop|ref_character|ref_current/i.test(url)) {
    return true;
  }
  return false;
}

function getUploadedListRows() {
  const items = getDrawerAssetItems();
  if (items.length > 0) return items;

  const overlayPane = document.querySelector('.cdk-overlay-pane, [role="dialog"], flow-add-menu-popover-content');
  if (!overlayPane) return [];

  return Array.from(overlayPane.querySelectorAll(
    'button.asset-item, flow-add-menu-asset-item, .asset-item-container button, [role="option"]'
  )).filter(isVisible);
}

function getFilenameFromUrl(url, fallbackIndex = 1) {
  if (!url || typeof url !== 'string') return `ref_image_${fallbackIndex}.png`;
  if (url.startsWith('data:')) return `ref_image_${fallbackIndex}.png`;
  try {
    const clean = url.split('?')[0].split('#')[0];
    const filename = clean.substring(clean.lastIndexOf('/') + 1);
    if (filename && filename.length > 2 && filename.includes('.')) {
      return decodeURIComponent(filename);
    }
  } catch (_) {}
  return `ref_image_${fallbackIndex}.png`;
}

function findAddMenuButton() {
  const fromRule = window.DomRuleEngine?.query('addMenu.trigger');
  if (fromRule && isVisible(fromRule)) return fromRule;

  const primary = document.querySelector('flow-base-prompt-box button.add-menu-trigger, button.add-menu-trigger, flow-add-menu button');
  if (primary && isVisible(primary)) return primary;

  // If agent panel is open, locate the add button inside it
  const agentPanel = document.querySelector('flow-agent-panel');
  if (agentPanel && isVisible(agentPanel)) {
    const plusBtn = agentPanel.querySelector('button.add-menu-trigger, flow-add-menu button') ||
                    Array.from(agentPanel.querySelectorAll('button')).find(b => b.querySelector('mat-icon')?.textContent?.trim() === 'add');
    if (plusBtn) return plusBtn;
  }

  return null;
}

function findHeaderAddMediaButton() {
  const fromRule = window.DomRuleEngine?.query('headerTools.addMediaButton');
  if (fromRule && isVisible(fromRule)) return fromRule;

  const specific = document.querySelector(
    'button[mattooltip="Thêm nội dung nghe nhìn"], ' +
    'button[aria-label="Trình đơn thêm nội dung nghe nhìn"], ' +
    '.tools-button-group button[mattooltip*="nghe nhìn" i], ' +
    '.tools-button-group button[aria-label*="nghe nhìn" i], ' +
    '[tools-button-group] button[mattooltip*="nghe nhìn" i], ' +
    '[tools-button-group] button[aria-label*="nghe nhìn" i], ' +
    'button[mattooltip*="media" i], ' +
    'button[aria-label*="media" i]'
  );
  if (specific && isVisible(specific)) return specific;

  const toolsGroup = document.querySelector('.tools-button-group, [tools-button-group]');
  if (toolsGroup) {
    const buttons = Array.from(toolsGroup.querySelectorAll('button')).filter(isVisible);
    const addBtn = buttons.find(b => {
      const icon = b.querySelector('mat-icon, .google-symbols')?.textContent?.trim();
      return icon === 'add';
    }) || buttons[0];
    if (addBtn) return addBtn;
  }

  const header = document.querySelector('header, .flow-header, [role="banner"]');
  if (header) {
    const headerAdd = Array.from(header.querySelectorAll('button')).filter(isVisible).find(b => {
      const icon = b.querySelector('mat-icon, .google-symbols')?.textContent?.trim();
      return icon === 'add' && !b.closest('flow-base-prompt-box');
    });
    if (headerAdd) return headerAdd;
  }

  return null;
}

function findHeaderUploadMenuItem() {
  const menuPanels = Array.from(document.querySelectorAll('.mat-mdc-menu-panel, [role="menu"]')).filter(isVisible);
  for (const panel of menuPanels) {
    const fromRule = window.DomRuleEngine?.query('headerTools.uploadMenuItem', panel);
    if (fromRule && isVisible(fromRule)) return fromRule;

    const triggerItem = panel.querySelector('flow-menu-item[xapfileselectortrigger] button, [xapfileselectortrigger] button, flow-menu-item[xapfileselectortrigger]');
    if (triggerItem && isVisible(triggerItem)) {
      return triggerItem.querySelector('button') || triggerItem;
    }

    const items = Array.from(panel.querySelectorAll('button[mat-menu-item], [role="menuitem"], button')).filter(isVisible);
    for (const item of items) {
      const icon = item.querySelector('mat-icon, .google-symbols')?.textContent?.trim().toLowerCase();
      const txt = (item.textContent || '').trim().toLowerCase();
      if (icon === 'upload' || txt.includes('tải lên') || txt.includes('upload')) {
        return item;
      }
    }
  }
  return null;
}

function findFrameChooserModal() {
  const fromRule = window.DomRuleEngine?.query('frameChooser.modal');
  if (fromRule && isVisible(fromRule)) return fromRule;

  const dialogs = Array.from(document.querySelectorAll(
    '.cdk-overlay-pane, mat-dialog-container, [role="dialog"], flow-frame-picker, flow-asset-picker-dialog, flow-dialog'
  )).filter(isVisible);

  return dialogs.find(d => {
    const text = (d.textContent || '').toLowerCase();
    const hasSearchInput = Boolean(d.querySelector('input[placeholder*="thành phần" i], input[placeholder*="search" i], input[placeholder*="tìm kiếm" i]'));
    return text.includes('chọn một hình ảnh khung') ||
           text.includes('choose a frame') ||
           hasSearchInput;
  }) || null;
}

function getFrameChooserAssetItems(modal) {
  if (!modal) return [];

  const candidateSelectors = [
    'button.asset-item',
    'button:has(img)',
    'flow-image-tile button',
    'flow-media-tile button',
    'flow-image-tile',
    'flow-media-tile',
    '[role="option"]',
    '[role="gridcell"]',
    'flow-a2ui-image-option',
    '.asset-item',
    '.media-card',
    'cdk-virtual-scroll-viewport button',
    '.asset-list-viewport button',
    'mat-grid-tile button',
    '.grid-item button',
    '.grid-item'
  ];

  for (const s of candidateSelectors) {
    const list = Array.from(modal.querySelectorAll(s)).filter(isVisible);
    if (list.length > 0) return list;
  }

  // Fallback: any visible non-icon img in modal
  const imgs = Array.from(modal.querySelectorAll('img')).filter(img => {
    if (!isVisible(img)) return false;
    const src = img.src || img.getAttribute('src') || '';
    return isValidImageUrl(src) && !img.closest('button.close-btn, [aria-label*="đóng" i], [aria-label*="close" i]');
  });

  return imgs.map(img => img.closest('button, [role="button"], [role="option"]') || img);
}

function pickFrameCandidate(assetItems, targetType = 'start', isDual = false) {
  if (!assetItems || assetItems.length === 0) return null;
  if (assetItems.length === 1) return assetItems[0];

  const nameKeyword = targetType === 'start' ? 'start' : 'end';
  for (const item of assetItems) {
    const text = (item.textContent || '').toLowerCase();
    const title = (item.getAttribute('title') || item.getAttribute('aria-label') || '').toLowerCase();
    const imgSrc = (item.querySelector('img')?.src || '').toLowerCase();
    if (text.includes(nameKeyword) || title.includes(nameKeyword) || imgSrc.includes(nameKeyword)) {
      return item;
    }
  }

  // Positional fallback for Google Flow's "Gần đây" (Recent - reverse chronological sort)
  // End frame was uploaded 2nd (most recent) -> index 0
  // Start frame was uploaded 1st -> index 1
  if (isDual && assetItems.length >= 2) {
    return targetType === 'start' ? assetItems[1] : assetItems[0];
  }

  return assetItems[0];
}

function clickModalConfirmButton(modal) {
  if (!modal) return;
  const buttons = Array.from(modal.querySelectorAll(
    'button.mat-primary, button[type="submit"], mat-dialog-actions button, .mat-mdc-dialog-actions button, button.confirm-button, button'
  )).filter(isVisible);

  for (const b of buttons) {
    if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
    const txt = (b.textContent || '').trim().toLowerCase();
    if (txt === 'chọn' || txt === 'select' || txt === 'xác nhận' || txt === 'confirm' || txt === 'thêm' || txt === 'add') {
      console.log(`[ShineFlowWorker] 🎯 Clicking modal confirm button: "${txt}"`);
      robustClick(b);
      return;
    }
  }
}

async function waitForProjectUploadsToFinish(minCount = 1, timeoutMs = 25000) {
  console.log(`[ShineFlowWorker] ⏳ Waiting for ${minCount} project upload(s) to finish loading completely...`);
  const startTime = Date.now();

  await new Promise(r => setTimeout(r, 1500));

  while (Date.now() - startTime < timeoutMs) {
    const spinners = Array.from(document.querySelectorAll(
      'mat-spinner, mat-progress-spinner, [role="progressbar"], flow-media-upload mat-spinner, .asset-list-viewport mat-spinner, [class*="upload-progress"], [class*="spinner"]'
    )).filter(isVisible);

    const toasts = Array.from(document.querySelectorAll('.mat-mdc-snack-bar-container, simple-snack-bar, flow-toast')).filter(isVisible);
    const hasUploadingToast = toasts.some(t => /đang tải lên|uploading/i.test(t.textContent || ''));

    const elapsed = Date.now() - startTime;
    if (spinners.length === 0 && !hasUploadingToast && elapsed >= 2500) {
      console.log(`[ShineFlowWorker] ✅ Project upload finished (no spinners/uploading toasts, elapsed: ${Math.round(elapsed / 1000)}s)`);
      await new Promise(r => setTimeout(r, 600));
      return true;
    }

    await new Promise(r => setTimeout(r, 600));
  }

  console.warn(`[ShineFlowWorker] ⚠️ Upload wait reached timeout (${timeoutMs}ms). Proceeding.`);
  return false;
}

async function uploadViaTopHeader(filesToUpload, dt) {
  console.log(`[ShineFlowWorker] 📤 Attempting upload of ${filesToUpload.length} file(s) via Top Header Bar...`);

  // 1. Send pending files to inpage interceptor
  window.postMessage({
    source: 'SHINE_FLOW_CONTENT',
    type: 'SET_PENDING_FILES',
    files: filesToUpload,
  }, '*');
  await new Promise(r => setTimeout(r, 200));

  // 2. Find header add media button
  const headerAddBtn = findHeaderAddMediaButton();
  if (!headerAddBtn) {
    console.warn('[ShineFlowWorker] ⚠️ Top Header Add Media button not found.');
    return false;
  }

  // 3. Click header add button to open menu
  console.log('[ShineFlowWorker] 🖱️ Clicking Top Header Add Media button...');
  robustClick(headerAddBtn);
  await new Promise(r => setTimeout(r, 400));

  // Wait up to 2.5s for menu panel to appear
  let uploadMenuItem = findHeaderUploadMenuItem();
  if (!uploadMenuItem) {
    for (let r = 0; r < 10; r++) {
      await new Promise(res => setTimeout(res, 250));
      uploadMenuItem = findHeaderUploadMenuItem();
      if (uploadMenuItem) break;
    }
  }

  if (!uploadMenuItem) {
    console.warn('[ShineFlowWorker] ⚠️ "Tải lên" menu item not found in Header menu.');
    dismissAllOverlays();
    return false;
  }

  // 4. Click the "Tải lên" menu item
  console.log('[ShineFlowWorker] 🚀 Clicking "Tải lên" menu item in header menu...');
  uploadMenuItem.click();
  await new Promise(r => setTimeout(r, 400));

  // 5. Assign dt.files to any input[type="file"] in DOM
  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  for (const fi of fileInputs) {
    try {
      fi.multiple = true;
      fi.files = dt.files;
      fi.dispatchEvent(new Event('change', { bubbles: true }));
      fi.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {}
  }

  // 6. Wait for project uploads to finish
  await waitForProjectUploadsToFinish(filesToUpload.length, 25000);

  // 7. Cleanly dismiss any open header menu panel or backdrop
  dismissAllOverlays();
  await new Promise(r => setTimeout(r, 300));

  return true;
}

function collectJobImages(job) {
  const candidateImages = [
    job.imageStart,
    job.startFrame,
    job.start_frame_url,
    job.imageEnd,
    job.endFrame,
    job.end_frame_url,
    ...(Array.isArray(job.images) ? job.images : []),
    ...(Array.isArray(job.referenceImages) ? job.referenceImages : []),
    ...(Array.isArray(job.imageInputs) ? job.imageInputs : []),
    ...(Array.isArray(job.characterReferences) ? job.characterReferences : []),
    ...(Array.isArray(job.namedReferences) ? job.namedReferences : []),
  ].filter(Boolean);

  const namedList = [];
  const seenUrls = new Set();
  const jobShortId = (job.jobId || 'ref').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'job';

  for (let i = 0; i < candidateImages.length; i++) {
    const item = candidateImages[i];
    const rawUrl = typeof item === 'string' ? item : item?.url;
    if (!rawUrl || seenUrls.has(rawUrl)) continue;
    seenUrls.add(rawUrl);

    let defaultName = `ref_${jobShortId}_${i + 1}.png`;
    if (item === job.imageStart || item === job.startFrame || item === job.start_frame_url) {
      defaultName = 'start_frame.png';
    } else if (item === job.imageEnd || item === job.endFrame || item === job.end_frame_url) {
      defaultName = 'end_frame.png';
    }

    const name = (typeof item === 'object' && item.name) ? item.name : defaultName;
    const mimeType = (typeof item === 'object' && item.mimeType) ? item.mimeType : 'image/png';
    const base64 = typeof item === 'object' ? item.base64 : undefined;

    namedList.push({ name, url: rawUrl, mimeType, base64 });
  }

  return namedList;
}

async function uploadJobMediaUpfront(job) {
  const namedList = collectJobImages(job);
  if (namedList.length === 0) {
    return;
  }

  console.log(`[ShineFlowWorker] 🚀 Upfront Media Upload: Preparing ${namedList.length} image(s) for job ${job.jobId}...`);

  const filesToUpload = [];
  const dt = new DataTransfer();

  // If start & end frames are present, guarantee start is added first, end is added second
  for (let i = 0; i < namedList.length; i++) {
    const item = namedList[i];
    const fileObj = await urlToFile(item.url, item.name);
    let b64 = item.base64;
    let mime = item.mimeType || 'image/png';
    if (!b64) {
      const fileData = await urlToBase64(item.url);
      b64 = fileData.base64;
      mime = fileData.type || mime;
    }

    filesToUpload.push({
      name: item.name,
      type: mime,
      base64: b64,
    });
    dt.items.add(fileObj);
    uploadedReferenceUrls.add(item.url);
    if (b64) uploadedReferenceUrls.add(b64.slice(0, 80));
  }

  // Inform inpage interceptor of pending files
  window.postMessage({
    source: 'SHINE_FLOW_CONTENT',
    type: 'SET_PENDING_FILES',
    files: filesToUpload,
  }, '*');

  // Primary: Upload via Top Header Bar
  const successHeader = await uploadViaTopHeader(filesToUpload, dt);
  if (successHeader) {
    console.log('[ShineFlowWorker] ✅ Upfront upload via Top Header Bar succeeded.');
    return;
  }

  // Fallback: Upload via Prompt Box Add Menu Button (before mode switch)
  console.log('[ShineFlowWorker] 🔄 Trying fallback upfront upload via Prompt Box add menu...');
  const addMenuBtn = findAddMenuButton();
  if (addMenuBtn) {
    robustClick(addMenuBtn);
    await new Promise(r => setTimeout(r, 600));

    const uploadBtn = findUploadButton();
    if (uploadBtn) {
      uploadBtn.click();
      await new Promise(r => setTimeout(r, 800));
    }

    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    for (const fi of fileInputs) {
      try {
        fi.multiple = true;
        fi.files = dt.files;
        fi.dispatchEvent(new Event('change', { bubbles: true }));
        fi.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
    }

    await switchToUploadsTab();
    await waitForUploadsToFinish(filesToUpload.length, 25000);
    closeAddMenuDrawer();
  }
}

function findFrameSlots() {
  // Sample HTML: flow-ingredient-bar > .ingredient-bar-container > .frame-trigger > button.empty-chip
  // First .frame-trigger = Start frame ("Bắt đầu"), last .frame-trigger = End frame ("Kết thúc")
  const frameTriggerDivs = Array.from(document.querySelectorAll(
    'flow-ingredient-bar .frame-trigger, ' +
    '.prompt-ingredient-bar .frame-trigger, ' +
    '.ingredient-bar-container .frame-trigger'
  )).filter(el => isVisible(el) || el.offsetParent !== null);

  // Get the clickable button inside each .frame-trigger (could be .empty-chip or any button)
  function getSlotButton(triggerDiv) {
    if (!triggerDiv) return null;
    return triggerDiv.querySelector('button.empty-chip, button') || triggerDiv;
  }

  const startSlotBtn = getSlotButton(frameTriggerDivs[0]) ||
                       window.DomRuleEngine?.query('framesWidget.startSlot') || null;
  const endSlotBtn = (frameTriggerDivs.length > 1 ? getSlotButton(frameTriggerDivs[frameTriggerDivs.length - 1]) : null) ||
                     window.DomRuleEngine?.query('framesWidget.endSlot') || null;

  return { startSlot: startSlotBtn, endSlot: endSlotBtn };
}

function findCenterListItems() {
  return getUploadedListRows();
}

async function attachReferenceImagesAndFrames(job) {
  // 1. Collect all candidate image items
  const candidateImages = [
    ...(Array.isArray(job.images) ? job.images : []),
    ...(Array.isArray(job.referenceImages) ? job.referenceImages : []),
    ...(Array.isArray(job.imageInputs) ? job.imageInputs : []),
    ...(Array.isArray(job.characterReferences) ? job.characterReferences : []),
    ...(Array.isArray(job.namedReferences) ? job.namedReferences : []),
    job.imageStart,
    job.imageEnd,
  ].filter(Boolean);

  const namedList = [];
  const seenUrls = new Set();
  const jobShortId = (job.jobId || 'ref').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'job';

  for (let i = 0; i < candidateImages.length; i++) {
    const item = candidateImages[i];
    const rawUrl = typeof item === 'string' ? item : item?.url;
    if (!rawUrl || seenUrls.has(rawUrl)) continue;
    seenUrls.add(rawUrl);

    // Worker auto-generates distinct, unique names for each reference
    const name = (typeof item === 'object' && item.name) ? item.name : `ref_${jobShortId}_${i + 1}.png`;
    const mimeType = (typeof item === 'object' && item.mimeType) ? item.mimeType : 'image/png';
    const base64 = typeof item === 'object' ? item.base64 : undefined;

    namedList.push({
      name,
      url: rawUrl,
      mimeType,
      base64,
    });
  }

  // Always start by ensuring any existing drawer is dismissed
  closeAddMenuDrawer();
  await new Promise(r => setTimeout(r, 250));

  if (namedList.length === 0) return;

  // Sub-mode for video: 'frames' (Khung hình) requires EXPLICIT imageStart/imageEnd
  // DO NOT include generic images[] here - that causes false Frames mode and "Start Frame slot not found" errors
  const isFramesMode = Boolean(
    job.imageStart || job.startFrame || job.start_frame_url ||
    job.imageEnd || job.endFrame || job.end_frame_url ||
    job.mode === 'interpolation' || job.mode === 'i2v' ||
    document.querySelector('flow-ingredient-bar .frame-trigger, .frame-trigger')
  );

  if (isFramesMode) {
    console.log('[ShineFlowWorker] 🎞️ Attaching Start/End Frames in "Khung hình" mode...');
    const startImg = job.imageStart || job.startFrame || job.start_frame_url || namedList[0]?.url;
    const endImg = job.imageEnd || job.endFrame || job.end_frame_url || (namedList.length > 1 ? namedList[1]?.url : undefined);

    if (!startImg) {
      console.warn('[ShineFlowWorker] ⚠️ No start image found for frames mode, continuing with defaults.');
      return;
    }

    // 1. Find Start slot button
    let { startSlot, endSlot } = findFrameSlots();
    if (!startSlot) {
      console.log('[ShineFlowWorker] ⏳ Waiting for Start frame slot in prompt box...');
      for (let retry = 0; retry < 12; retry++) {
        await new Promise(r => setTimeout(r, 350));
        ({ startSlot, endSlot } = findFrameSlots());
        if (startSlot) break;
      }
    }

    if (!startSlot) {
      throw new Error('[ShineFlowWorker] ❌ Could not find Start Frame slot in Google Flow prompt box.');
    }

    // 2. Open "Chọn một hình ảnh khung" modal by clicking Start slot
    console.log('[ShineFlowWorker] 🎬 Clicking Start Frame slot to open Frame Chooser modal...');
    robustClick(startSlot);
    await new Promise(r => setTimeout(r, 600));

    let frameModal = findFrameChooserModal();
    if (!frameModal) {
      for (let r = 0; r < 8; r++) {
        await new Promise(res => setTimeout(res, 300));
        frameModal = findFrameChooserModal();
        if (frameModal) break;
      }
    }

    if (!frameModal) {
      console.log('[ShineFlowWorker] 🔄 Retrying click on Start Frame slot...');
      robustClick(startSlot);
      await new Promise(r => setTimeout(r, 800));
      frameModal = findFrameChooserModal();
    }

    // Safety fallback: if modal is empty (0 assets), run emergency upfront upload and retry!
    if (frameModal) {
      let assetItems = getFrameChooserAssetItems(frameModal);
      if (assetItems.length === 0) {
        console.warn('[ShineFlowWorker] ⚠️ Frame Chooser modal opened but has 0 assets. Running emergency upfront upload...');
        dismissAllOverlays();
        await uploadJobMediaUpfront(job);
        await new Promise(r => setTimeout(r, 800));
        ({ startSlot, endSlot } = findFrameSlots());
        if (startSlot) robustClick(startSlot);
        await new Promise(r => setTimeout(r, 800));
        frameModal = findFrameChooserModal();
      }
    }

    // 3. Select Start Frame candidate from the modal
    if (frameModal) {
      console.log('[ShineFlowWorker] 🎯 Selecting Start Frame from Frame Chooser modal...');
      let assetItems = getFrameChooserAssetItems(frameModal);
      if (assetItems.length === 0) {
        for (let r = 0; r < 10; r++) {
          await new Promise(res => setTimeout(res, 350));
          assetItems = getFrameChooserAssetItems(frameModal);
          if (assetItems.length > 0) break;
        }
      }

      const startCandidate = pickFrameCandidate(assetItems, 'start', Boolean(endImg));
      if (startCandidate) {
        console.log('[ShineFlowWorker] 🎯 Clicking Start Frame candidate:', startCandidate);
        robustClick(startCandidate);
        await new Promise(r => setTimeout(r, 450));

        clickModalConfirmButton(frameModal);
        await new Promise(r => setTimeout(r, 450));
      } else {
        console.warn('[ShineFlowWorker] ⚠️ No asset item found in Frame Chooser modal for Start Frame.');
      }
    }

    // Wait for modal to close and start slot to be filled
    for (let wait = 0; wait < 15; wait++) {
      await new Promise(r => setTimeout(r, 300));
      ({ startSlot, endSlot } = findFrameSlots());
      const isStartEmpty = !startSlot || startSlot.classList.contains('empty-chip') || !startSlot.querySelector('img');
      if (!isStartEmpty) {
        console.log('[ShineFlowWorker] ✅ Start Frame successfully attached!');
        break;
      }
    }

    // Dismiss any leftover modal
    dismissAllOverlays();
    await new Promise(r => setTimeout(r, 300));

    // 4. Attach End Frame (if provided)
    if (endImg) {
      console.log('[ShineFlowWorker] 🎬 Attaching End Frame...');
      ({ startSlot, endSlot } = findFrameSlots());

      if (!endSlot) {
        for (let r = 0; r < 8; r++) {
          await new Promise(res => setTimeout(res, 300));
          ({ startSlot, endSlot } = findFrameSlots());
          if (endSlot) break;
        }
      }

      if (endSlot) {
        console.log('[ShineFlowWorker] 🎬 Clicking End Frame slot to open Frame Chooser modal...');
        robustClick(endSlot);
        await new Promise(r => setTimeout(r, 600));

        let endModal = findFrameChooserModal();
        if (!endModal) {
          for (let r = 0; r < 8; r++) {
            await new Promise(res => setTimeout(res, 300));
            endModal = findFrameChooserModal();
            if (endModal) break;
          }
        }

        if (endModal) {
          console.log('[ShineFlowWorker] 🎯 Selecting End Frame from Frame Chooser modal...');
          let endAssetItems = getFrameChooserAssetItems(endModal);
          if (endAssetItems.length === 0) {
            for (let r = 0; r < 10; r++) {
              await new Promise(res => setTimeout(res, 350));
              endAssetItems = getFrameChooserAssetItems(endModal);
              if (endAssetItems.length > 0) break;
            }
          }

          const endCandidate = pickFrameCandidate(endAssetItems, 'end', true);
          if (endCandidate) {
            console.log('[ShineFlowWorker] 🎯 Clicking End Frame candidate:', endCandidate);
            robustClick(endCandidate);
            await new Promise(r => setTimeout(r, 450));

            clickModalConfirmButton(endModal);
            await new Promise(r => setTimeout(r, 450));
          } else {
            console.warn('[ShineFlowWorker] ⚠️ No asset item found in Frame Chooser modal for End Frame.');
          }
        }

        // Wait for end slot to update
        for (let wait = 0; wait < 15; wait++) {
          await new Promise(r => setTimeout(r, 300));
          ({ startSlot, endSlot } = findFrameSlots());
          const isEndEmpty = !endSlot || endSlot.classList.contains('empty-chip') || !endSlot.querySelector('img');
          if (!isEndEmpty) {
            console.log('[ShineFlowWorker] ✅ End Frame successfully attached!');
            break;
          }
        }

        dismissAllOverlays();
      }
    }

    // 5. Verify Frame Attachment before continuing
    ({ startSlot, endSlot } = findFrameSlots());
    const finalStartEmpty = !startSlot || startSlot.classList.contains('empty-chip') || !startSlot.querySelector('img');
    if (finalStartEmpty) {
      throw new Error('[ShineFlowWorker] ❌ Failed to attach Start Frame! Start slot is still empty. Halting generation.');
    }

    console.log('[ShineFlowWorker] 🎉 Frames attachment completed successfully.');
    return;
  }

  console.log(`[ShineFlowWorker] 🖼️ Uploading & Attaching ${namedList.length} Reference Image(s): ${namedList.map(n => n.name).join(', ')}`);

  try {
    const filesPayload = [];
    const dt = new DataTransfer();
    const uploadedFileNames = [];

    for (let i = 0; i < namedList.length; i++) {
      const item = namedList[i];
      const imgUrl = item.url;
      const name = item.name;
      uploadedFileNames.push(name);

      uploadedReferenceUrls.add(imgUrl);

      let b64 = item.base64;
      let mime = item.mimeType || 'image/png';

      if (!b64) {
        const fileData = await urlToBase64(imgUrl);
        b64 = fileData.base64;
        mime = fileData.type || mime;
      }

      if (b64) {
        uploadedReferenceUrls.add(b64.slice(0, 80));
      }

      filesPayload.push({
        name,
        type: mime,
        base64: b64,
      });

      const fileObj = await urlToFile(imgUrl, name);
      dt.items.add(fileObj);
    }

    // Post ALL pending files to inpage interceptor
    window.postMessage({
      source: 'SHINE_FLOW_CONTENT',
      type: 'SET_PENDING_FILES',
      files: filesPayload,
    }, '*');

    // 2. Open the "Thêm thành phần" (+) drawer to upload images into Flow
    const addMenuBtn = findAddMenuButton();
    if (addMenuBtn && isVisible(addMenuBtn)) {
      console.log('[ShineFlowWorker] Opening Add Ingredient drawer...');
      addMenuBtn.click();
      await new Promise(r => setTimeout(r, 600));

      // Find and click the "Tải nội dung ..." (Upload content...) button
      const uploadBtn = findUploadButton();
      if (uploadBtn) {
        console.log('[ShineFlowWorker] 📤 Clicking "Tải nội dung ..." button to trigger upload of all reference images...');
        uploadBtn.click();
        await new Promise(r => setTimeout(r, 1200));
      }

      // Also directly inject into any file input that might be present
      const fileInputs = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('upload.fileInput') : Array.from(document.querySelectorAll('input[type="file"]')));
      for (const fi of fileInputs) {
        try {
          fi.files = dt.files;
          fi.dispatchEvent(new Event('change', { bubbles: true }));
          fi.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) {}
      }

      // 3. Switch to "Tệp tải lên" (Uploads) tab first to view uploaded media
      await switchToUploadsTab();
      await new Promise(r => setTimeout(r, 600));

      // Wait for all uploads to finish loading (no spinners, thumbnails loaded)
      await waitForUploadsToFinish(uploadedFileNames.length, 25000);

      // 4. Select all uploaded items sequentially (re-opening drawer if it auto-closes)
      console.log(`[ShineFlowWorker] ⏳ Attaching all ${uploadedFileNames.length} reference items from drawer...`);
      let attachedCount = 0;
      const usedTitles = new Set();
      const usedIndices = new Set();

      for (let i = 0; i < uploadedFileNames.length; i++) {
        const fileName = uploadedFileNames[i];
        const baseName = fileName.replace(/\.[^/.]+$/, "");
        console.log(`[ShineFlowWorker] 🎯 Attaching item ${i + 1}/${uploadedFileNames.length}: ${fileName}`);

        // Ensure drawer is open and NOT stuck on a detail pane
        const existingDetailPane = document.querySelector('flow-add-menu-detail-pane');
        if (existingDetailPane && isVisible(existingDetailPane)) {
          console.log(`[ShineFlowWorker] ↩️ Detail pane is still open, returning to asset list...`);
          const backOrCloseBtn = Array.from(existingDetailPane.querySelectorAll('button')).find(b => {
            const icon = b.querySelector('mat-icon, .google-symbols')?.textContent?.trim().toLowerCase();
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            return icon === 'arrow_back' || icon === 'chevron_left' || icon === 'close' || aria.includes('quay lại') || aria.includes('back') || aria.includes('close');
          });
          if (backOrCloseBtn) {
            robustClick(backOrCloseBtn);
            await new Promise(r => setTimeout(r, 400));
          } else {
            await closeAddMenuDrawer();
            await new Promise(r => setTimeout(r, 350));
          }
        }

        let overlay = window.DomRuleEngine?.query('upload.drawer') || document.querySelector('.cdk-overlay-pane, .add-menu-popover-container, flow-add-menu-popover-content');
        if (!overlay || !isVisible(overlay)) {
          console.log(`[ShineFlowWorker] 🔄 Opening Add Menu drawer for item ${i + 1}...`);
          const addBtn = findAddMenuButton();
          if (addBtn && isVisible(addBtn)) {
            addBtn.click();
            await new Promise(r => setTimeout(r, 600));
          }
          await switchToUploadsTab();
          await new Promise(r => setTimeout(r, 400));
        } else {
          await switchToUploadsTab();
        }

        let candidate = null;
        let candidateIndex = -1;
        let items = getDrawerAssetItems();

        // 1. First priority: match candidate by uploaded filename, base name, or prefix
        for (let idx = 0; idx < items.length; idx++) {
          if (usedIndices.has(idx)) continue;
          const it = items[idx];
          const hasSpinner = Boolean(it.querySelector('mat-spinner, mat-progress-spinner, [role="progressbar"], [class*="loading"]'));
          if (hasSpinner) continue;

          const itTitle = (it.querySelector('.asset-title')?.textContent || it.textContent || '').trim().toLowerCase();
          const targetLower = fileName.toLowerCase();
          const baseLower = baseName.toLowerCase();
          const prefixLower = baseLower.slice(0, 8);

          if (itTitle && (itTitle.includes(targetLower) || itTitle.includes(baseLower) || (prefixLower.length >= 4 && itTitle.includes(prefixLower)))) {
            candidate = it;
            candidateIndex = idx;
            console.log(`[ShineFlowWorker] 🎯 Matched candidate by title "${itTitle}" for "${fileName}" (index ${idx})`);
            break;
          }
        }

        // 2. Second priority: fallback to next available unused non-loading item
        if (!candidate) {
          for (let idx = 0; idx < items.length; idx++) {
            const it = items[idx];
            const hasSpinner = Boolean(it.querySelector('mat-spinner, mat-progress-spinner, [role="progressbar"], [class*="loading"]'));
            if (!hasSpinner && !usedIndices.has(idx)) {
              candidate = it;
              candidateIndex = idx;
              break;
            }
          }
        }

        if (candidate) {
          usedIndices.add(candidateIndex);
          const candTitle = (candidate.querySelector('.asset-title')?.textContent || '').trim();
          if (candTitle) usedTitles.add(candTitle);

          // Track candidate image URL as an uploaded reference
          const candImg = candidate.querySelector('img');
          const candSrc = candImg?.src || candImg?.currentSrc || candImg?.getAttribute('src');
          if (candSrc) {
            uploadedReferenceUrls.add(candSrc);
            const normCand = normalizeMediaUrl(candSrc);
            if (normCand) uploadedReferenceUrls.add(normCand);
          }

          console.log(`[ShineFlowWorker] 👆 Clicking asset item ${i + 1}: ${candTitle || fileName}`);
          robustClick(candidate);
          await new Promise(r => setTimeout(r, 600));

          // Wait until "Thêm vào câu lệnh" button is enabled and ready
          let addToPromptBtn = findAddToPromptButton();
          for (let retryBtn = 0; retryBtn < 10; retryBtn++) {
            if (addToPromptBtn && isVisible(addToPromptBtn) && !addToPromptBtn.disabled && !addToPromptBtn.classList.contains('mat-mdc-button-disabled')) {
              break;
            }
            await new Promise(r => setTimeout(r, 350));
            addToPromptBtn = findAddToPromptButton();
          }

          if (addToPromptBtn && !addToPromptBtn.disabled) {
            const chipsBefore = countPromptChips();
            console.log(`[ShineFlowWorker] ➕ Clicking "Thêm vào câu lệnh" for item ${i + 1} (chips before: ${chipsBefore})...`);
            robustClick(addToPromptBtn);

            // Wait for ingredient chip count to increase in prompt box
            let attached = false;
            for (let wait = 0; wait < 15; wait++) {
              await new Promise(r => setTimeout(r, 200));
              const chipsNow = countPromptChips();
              if (chipsNow > chipsBefore) {
                attached = true;
                break;
              }
            }

            if (!attached) {
              console.log(`[ShineFlowWorker] 🔄 Retrying click on "Thêm vào câu lệnh"...`);
              const retryBtn = findAddToPromptButton();
              if (retryBtn) robustClick(retryBtn);
              for (let wait = 0; wait < 10; wait++) {
                await new Promise(r => setTimeout(r, 200));
                if (countPromptChips() > chipsBefore) {
                  attached = true;
                  break;
                }
              }
            }
            attachedCount++;
            console.log(`[ShineFlowWorker] ✅ Item ${i + 1} attached! (Total attached: ${attachedCount}/${uploadedFileNames.length})`);
            await new Promise(r => setTimeout(r, 400));

            // Track any newly created chips in prompt box
            document.querySelectorAll('flow-image-ingredient-chip img, [class*="ingredient"] img, [class*="chip"] img, flow-base-prompt-box img').forEach(img => {
              const chipSrc = img.src || img.currentSrc || img.getAttribute('src');
              if (chipSrc) {
                uploadedReferenceUrls.add(chipSrc);
                const normChip = normalizeMediaUrl(chipSrc);
                if (normChip) uploadedReferenceUrls.add(normChip);
              }
            });

            // If there are more items to attach, navigate back from detail pane to list
            if (i < uploadedFileNames.length - 1) {
              const curDetailPane = document.querySelector('flow-add-menu-detail-pane');
              if (curDetailPane && isVisible(curDetailPane)) {
                console.log(`[ShineFlowWorker] ↩️ Navigating back to asset list for next item...`);
                const backOrCloseBtn = Array.from(curDetailPane.querySelectorAll('button')).find(b => {
                  const icon = b.querySelector('mat-icon, .google-symbols')?.textContent?.trim().toLowerCase();
                  const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                  return icon === 'arrow_back' || icon === 'chevron_left' || icon === 'close' || aria.includes('quay lại') || aria.includes('back') || aria.includes('close');
                });
                if (backOrCloseBtn) {
                  robustClick(backOrCloseBtn);
                  await new Promise(r => setTimeout(r, 400));
                } else {
                  await closeAddMenuDrawer();
                  await new Promise(r => setTimeout(r, 400));
                }
              }
            } else {
              // Final item attached: close drawer immediately
              await closeAddMenuDrawer();
              await new Promise(r => setTimeout(r, 400));
            }
          } else {
            console.warn(`[ShineFlowWorker] ⚠️ "Thêm vào câu lệnh" button not ready or disabled for item ${i + 1}`);
          }
        } else {
          console.warn(`[ShineFlowWorker] ⚠️ Could not find candidate element for item ${i + 1} (${fileName}) in Uploads tab`);
        }
      }

      if (attachedCount > 0) {
        console.log(`[ShineFlowWorker] 🎯 Successfully attached ${attachedCount}/${uploadedFileNames.length} image reference(s) into prompt!`);
      } else {
        console.log('[ShineFlowWorker] ℹ️ Drawer did not attach any items. Closing popover to inject directly into prompt box...');
      }

      // Always close drawer immediately and loop-verify so it never remains stuck
      await closeAddMenuDrawer();
      await new Promise(r => setTimeout(r, 350));
      for (let c = 0; c < 10; c++) {
        if (!isDrawerOpen()) break;
        console.log('[ShineFlowWorker] 🔄 Drawer still detected after attachment, re-closing...');
        await closeAddMenuDrawer();
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // 5. Fallback & Direct Injection: DragDrop and Paste directly onto prompt box if drawer had 0 attachments
    const promptInput = findPromptInput();
    const dropTargets = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('upload.dropTargets') : Array.from(document.querySelectorAll(
      '.prosemirror-editor, .ProseMirror, flow-base-prompt-box, [aria-label*="bắt đầu" i], div[class*="start-frame"], .prompt-box, flow-agent-panel, flow-agent-panel .ProseMirror, [class*="drop-media"]'
    ))).filter(isVisible);

    const target = dropTargets[0] || promptInput;
    const currentPills = window.DomRuleEngine ? window.DomRuleEngine.queryAll('upload.ingredientChips') : document.querySelectorAll(
      'flow-base-prompt-box [class*="chip"], flow-base-prompt-box [class*="pill"], flow-base-prompt-box img, flow-image-ingredient-chip, flow-agent-panel [class*="chip"], flow-agent-panel [class*="pill"], flow-agent-panel flow-image-ingredient-chip'
    );

    if (currentPills.length === 0 && target && dt.files.length > 0) {
      console.log('[ShineFlowWorker] 📦 Injecting files directly onto prompt box (Drop & Paste)...');
      try {
        const enterEvt = new DragEvent('dragenter', { bubbles: true, cancelable: true });
        Object.defineProperty(enterEvt, 'dataTransfer', { value: dt, writable: false });
        target.dispatchEvent(enterEvt);

        const overEvt = new DragEvent('dragover', { bubbles: true, cancelable: true });
        Object.defineProperty(overEvt, 'dataTransfer', { value: dt, writable: false });
        target.dispatchEvent(overEvt);

        const dropEvt = new DragEvent('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(dropEvt, 'dataTransfer', { value: dt, writable: false });
        target.dispatchEvent(dropEvt);

        const pasteEvt = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(pasteEvt, 'clipboardData', { value: dt, writable: false });
        target.dispatchEvent(pasteEvt);
      } catch (e) {
        console.warn('[ShineFlowWorker] Notice on direct prompt drop/paste:', e);
      }
      await new Promise(r => setTimeout(r, 800));
    }
  } catch (err) {
    console.warn('[ShineFlowWorker] Notice attaching image frames:', err.message);
  } finally {
    closeAddMenuDrawer();
  }
}

// ── 7. Submit Prompt (Click Generate Button + Enter Key) ───────────────────────

function findGenerateButton(promptInput) {
  const promptBox = promptInput?.closest('flow-base-prompt-box, flow-creative-agent-prompt-box, .prompt-box-content, .prompt-box, .base-prompt-box')
    || document.querySelector('flow-base-prompt-box, flow-creative-agent-prompt-box, .prompt-box-content, .prompt-box, .base-prompt-box')
    || document;

  // 1. Direct custom element
  const customEl = promptBox.querySelector(
    'flow-generate-icon-button button, button.generate-icon-button, button.flow-generate-icon-button, button[type="submit"], [data-testid*="generate"], button:has([data-icon*="arrow"]), button:has([data-icon*="send"])'
  );
  if (customEl && isVisible(customEl)) return customEl;

  // 2. Button with arrow or send icon (mat-icon, svg, or symbol)
  const buttons = Array.from(promptBox.querySelectorAll('button')).filter(isVisible);
  const byIcon = buttons.find(b => {
    const matIcon = b.querySelector('mat-icon, .google-symbols, .material-symbols-outlined, svg');
    const iconTxt = (matIcon?.textContent || '').trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    const title = (b.getAttribute('title') || '').toLowerCase();
    return ['arrow_forward', 'send', 'east', 'arrow_right', 'play_arrow', 'arrow_right_alt'].includes(iconTxt) ||
      /tạo|generate|gửi|send|submit/i.test(aria) ||
      /tạo|generate|gửi|send|submit/i.test(title);
  });
  if (byIcon) return byIcon;

  // 3. DomRuleEngine query
  const fromRule = window.DomRuleEngine?.query('generateButton.button', promptBox);
  if (fromRule && isVisible(fromRule)) return fromRule;

  // 4. In agent panel if active
  const agentPanel = document.querySelector('flow-agent-panel');
  if (agentPanel && isVisible(agentPanel)) {
    const agentBtn = agentPanel.querySelector('flow-generate-icon-button button, button.generate-icon-button') ||
                     Array.from(agentPanel.querySelectorAll('button')).find(b => {
                       const icon = b.querySelector('mat-icon, svg')?.textContent?.trim();
                       return ['arrow_forward', 'send', 'east'].includes(icon);
                     });
    if (agentBtn) return agentBtn;
  }

  // 5. Positional fallback: the generate button is ALWAYS the rightmost button in the prompt box!
  if (buttons.length > 0) {
    const sorted = buttons.slice().sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
    return sorted[0];
  }

  return null;
}

async function submitPromptAction(inputEl) {
  // 1. Trigger main-world click via inpage interceptor (native Angular Zone.js & ripple)
  try {
    window.postMessage({
      source: 'SHINE_FLOW_CONTENT',
      type: 'TRIGGER_GENERATE_CLICK',
    }, '*');
  } catch (_) {}

  await new Promise(r => setTimeout(r, 250));

  let btn = findGenerateButton(inputEl);

  // 2. Wait up to 3s for Angular / ProseMirror reactive form binding if button is initially disabled
  if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
    console.log('[ShineFlowWorker] ⏳ Waiting for generate button to activate...');
    for (let w = 0; w < 12; w++) {
      // Re-trigger input & change to nudge Angular change detection
      inputEl.focus();
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      btn = findGenerateButton(inputEl);
      if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') break;
    }
  }

  // 3. Force-remove disabled attribute if still disabled as a fail-safe
  if (btn && (btn.disabled || btn.getAttribute('aria-disabled') === 'true')) {
    console.log('[ShineFlowWorker] ⚠️ Force-enabling generate button attributes...');
    try {
      btn.removeAttribute('disabled');
      btn.removeAttribute('aria-disabled');
      btn.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'is-disabled');
    } catch (_) {}
  }

  let clicked = false;
  if (btn) {
    console.log('[ShineFlowWorker] 🚀 Clicking submit/generate button in content script...', btn);
    const mouseOpts = { bubbles: true, cancelable: true, view: window };
    try { btn.dispatchEvent(new PointerEvent('pointerdown', mouseOpts)); } catch (_) {}
    try { btn.dispatchEvent(new MouseEvent('mousedown', mouseOpts)); } catch (_) {}
    try { btn.dispatchEvent(new PointerEvent('pointerup', mouseOpts)); } catch (_) {}
    try { btn.dispatchEvent(new MouseEvent('mouseup', mouseOpts)); } catch (_) {}
    robustClick(btn);
    const parentIconBtn = btn.closest('flow-generate-icon-button');
    if (parentIconBtn && parentIconBtn !== btn) {
      try { parentIconBtn.dispatchEvent(new MouseEvent('click', mouseOpts)); } catch (_) {}
      try { robustClick(parentIconBtn); } catch (_) {}
    }
    clicked = true;
  } else {
    console.warn('[ShineFlowWorker] ⚠️ Submit button not found. Trying fallback key events...');
  }

  await new Promise(r => setTimeout(r, 400));

  // 4. Keyboard fallback: Enter and Ctrl+Enter
  const currentText = (inputEl.value || inputEl.innerText || inputEl.textContent || '').trim();
  if (currentText.length > 0) {
    console.log('[ShineFlowWorker] ⌨️ Dispatching Enter & Ctrl+Enter keyboard submission...');
    inputEl.focus();

    const enterEvt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true });
    inputEl.dispatchEvent(enterEvt);

    const ctrlEnterEvt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, ctrlKey: true, bubbles: true, cancelable: true, composed: true });
    inputEl.dispatchEvent(ctrlEnterEvt);
  }
}

// ── 8. Format Prompt Text ─────────────────────────────────────────────────────

function formatFlowPrompt(job) {
  let prompt = (job.prompt || '').trim();
  const isLandscape = job.aspectRatio === '16:9' || (job.model && job.model.includes('landscape'));
  const isSquare = job.aspectRatio === '1:1' || (job.model && job.model.includes('square'));
  const ratioText = isLandscape ? 'horizontal widescreen 16:9' : isSquare ? 'square 1:1' : 'vertical portrait 9:16';

  if (job.type === 'video') {
    const hasVideo = /\b(video|animate|animation|moving video|cinematic video|motion)\b/i.test(prompt);
    if (!hasVideo) {
      prompt = `Generate a ${ratioText} video of: ${prompt}`;
    } else {
      prompt = `Generate a ${ratioText} video: ${prompt}`;
    }
  } else {
    const hasImage = /\b(image|picture|photo|illustration|drawing)\b/i.test(prompt);
    if (!hasImage) {
      prompt = `Generate a ${ratioText} image of: ${prompt}`;
    } else {
      prompt = `Generate a ${ratioText} image: ${prompt}`;
    }
  }
  return prompt;
}

// ── 9. Wait for Media Resolution (Network-First + Active DOM Scanner) ─────────

function getExistingMediaSources() {
  const sources = new Set();
  document.querySelectorAll('video, img, a[href*=".mp4"]').forEach(el => {
    const src = el.getAttribute('src') || el.currentSrc || el.getAttribute('data-src') || el.getAttribute('href');
    if (src) {
      sources.add(src);
      const norm = normalizeMediaUrl(src);
      if (norm) sources.add(norm);
    }
  });
  return sources;
}

function isValidImageUrl(src) {
  if (!src || typeof src !== 'string') return false;
  if (src.startsWith('data:image/svg') || src.includes('profile') || src.includes('avatar') || src.includes('icon') || src.includes('favicon') || src.endsWith('.svg')) return false;
  return (
    src.includes('googleusercontent.com') ||
    src.includes('flow.google.com/asb') ||
    src.includes('flow-content.google') ||
    src.startsWith('blob:') ||
    /\.(png|jpe?g|webp)(\?.*)?$/i.test(src)
  );
}

function isValidVideoUrl(src) {
  if (!src || typeof src !== 'string') return false;
  if (src.startsWith('data:image/')) return false;
  return (
    src.includes('video-downloads.googleusercontent.com') ||
    src.includes('/video/') ||
    src.includes('.mp4') ||
    src.includes('flow.google.com/asb') ||
    src.startsWith('blob:')
  );
}

function findNewlyGeneratedImage(existingMedia, submitTimestamp) {
  // 1. If on /edit/<assetId> view (Google Flow auto-navigates here upon generation completion)
  if (window.location.href.includes('/edit/')) {
    const mainImages = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('mediaOutput.canvasImage') : Array.from(document.querySelectorAll(
      'flow-media-view img, flow-canvas img, .canvas-container img, flow-editor img, [class*="canvas"] img, [class*="media"] img, img'
    ))).filter(img => {
      if (!isVisible(img)) return false;
      // Must not be a reference thumbnail, ingredient chip, toolbar button, or avatar
      if (img.closest('header, nav, button, [class*="avatar"], [class*="profile"], flow-image-ingredient-chip, [class*="reference"], [class*="ingredient"], flow-add-menu, flow-base-prompt-box, .prompt-box-content')) return false;
      const rect = img.getBoundingClientRect();
      return rect.width >= 180 && rect.height >= 180;
    });

    if (mainImages.length > 0) {
      mainImages.sort((a, b) => {
        const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
        const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
        return areaB - areaA;
      });

      for (const best of mainImages) {
        const src = best.getAttribute('src') || best.currentSrc || best.getAttribute('data-src');
        const normSrc = normalizeMediaUrl(src);
        const isOld = existingMedia.has(src) || (normSrc && existingMedia.has(normSrc));
        if (src && isValidImageUrl(src) && !isUploadedReference(src) && !isOld) {
          if (best.complete && best.naturalWidth > 50) {
            console.log(`[ShineFlowWorker] 🎯 Captured center canvas generated image on /edit/ page:`, src);
            return src;
          }
        }
      }
    }
  }

  // 2. Project Gallery View: Top-left card (index 0) is Google Flow's newest generation ("ảnh mới tạo")!
  // Find all gallery images by collecting visible <img> elements in the main content area
  const galleryImages = Array.from(document.querySelectorAll('img')).filter(img => {
    if (!isVisible(img)) return false;
    // Exclude header, nav, drawer, sidebar, prompt box, avatars, buttons, ingredient chips
    if (img.closest('header, nav, button, .cdk-overlay-pane, [class*="avatar"], [class*="profile"], flow-add-menu, [class*="reference"], [class*="ingredient"], flow-base-prompt-box, .prompt-box-content, [class*="sidebar"]')) {
      return false;
    }
    const rect = img.getBoundingClientRect();
    // Gallery card images have substantial size (not tiny icons)
    if (rect.width < 70 || rect.height < 70) return false;
    // Must be in the main content area
    if (rect.top < 60) return false;

    const src = img.getAttribute('src') || img.currentSrc || img.getAttribute('data-src');
    return Boolean(src && isValidImageUrl(src) && !isUploadedReference(src));
  });

  if (galleryImages.length > 0) {
    // Sort all gallery images by visual screen position: TOP-TO-BOTTOM, then LEFT-TO-RIGHT
    galleryImages.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      if (Math.abs(rectA.top - rectB.top) > 35) {
        return rectA.top - rectB.top;
      }
      return rectA.left - rectB.left;
    });

    // Check gallery images from newest (top-left) forward for any TRULY NEW image
    for (const img of galleryImages) {
      const src = img.getAttribute('src') || img.currentSrc || img.getAttribute('data-src');
      const normSrc = normalizeMediaUrl(src);

      // Verify it is not an old pre-existing image from before submission
      const isOld = existingMedia.has(src) || (normSrc && existingMedia.has(normSrc));
      if (!isOld) {
        // Ensure image has finished rendering and is not 0x0 or broken
        if (img.complete && img.naturalWidth > 50 && img.naturalHeight > 50) {
          console.log(`[ShineFlowWorker] 🎯 Selected newest top-left gallery image (ảnh mới tạo):`, src);
          return src;
        }
      }
    }

    // NOTE: NEVER FALLBACK TO AN OLD IMAGE!
    // If all images matched existingMedia, it means the new image is still generating on Google Flow.
  }

  // 3. Fallback scan: pick only a non-old, non-reference image
  const allImages = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('mediaOutput.galleryImage') : Array.from(document.querySelectorAll(
    'flow-a2ui-image-option img, img.image-thumbnail, a2ui-surface img, flow-image-tile img, [data-testid*="image"] img'
  ))).filter(isVisible);

  for (const img of allImages) {
    if (img.closest('header, nav, button, .cdk-overlay-pane, [class*="avatar"], [class*="profile"], flow-add-menu, [class*="reference"]')) continue;
    const src = img.getAttribute('src') || img.currentSrc || img.getAttribute('data-src');
    const norm = normalizeMediaUrl(src);
    const isOld = existingMedia.has(src) || (norm && existingMedia.has(norm));
    if (src && isValidImageUrl(src) && !isUploadedReference(src) && !isOld) {
      if (img.complete && img.naturalWidth > 50 && img.naturalHeight > 50) {
        return src;
      }
    }
  }

  return null;
}

function waitForJobCompletion(job, existingMedia = new Set(), timeoutMs = 180000, submitTimestamp = Date.now()) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // Check if media was already received by interceptor (latest first, at least 6s after submit)
    const recent = completedMediaCache.slice().reverse().find(m => 
      m.timestamp >= submitTimestamp + 6000 && 
      !isUploadedReference(m.mediaUrl) && 
      !existingMedia.has(m.mediaUrl) && 
      !existingMedia.has(normalizeMediaUrl(m.mediaUrl)) &&
      (m.mediaType === job.type || !m.mediaType)
    );
    if (recent) {
      console.log(`[ShineFlowWorker] ⚡ Fast-path resolved job ${job.jobId} from recent cache:`, recent.mediaUrl);
      if (job.type === 'image') {
        urlToBase64(recent.mediaUrl).then(b64Res => {
          const base64Data = b64Res && b64Res.base64 ? `data:${b64Res.type || 'image/png'};base64,${b64Res.base64}` : undefined;
          resolve({
            jobId: job.jobId,
            status: 'SUCCESS',
            mediaUrl: recent.mediaUrl,
            base64Data,
            mimeType: b64Res?.type || 'image/png',
            model: job.model,
          });
        }).catch(() => {
          resolve({
            jobId: job.jobId,
            status: 'SUCCESS',
            mediaUrl: recent.mediaUrl,
            model: job.model,
          });
        });
      } else {
        return resolve({
          jobId: job.jobId,
          status: 'SUCCESS',
          mediaUrl: recent.mediaUrl,
          model: job.model,
        });
      }
      return;
    }

    const timer = setTimeout(() => {
      activeJobs.delete(job.jobId);
      clearInterval(fallbackInterval);
      reject(new Error(`Timeout waiting for generated ${job.type} after ${timeoutMs / 1000}s.`));
    }, timeoutMs);

    // Register into activeJobs map so inpage message handler can resolve it instantly
    activeJobs.set(job.jobId, {
      job,
      resolve,
      reject,
      timer,
      startTime,
      submitTimestamp,
      existingMedia,
      opNames: new Set(),
    });

    // Fallback interval: Actively scan DOM every 800ms for generated images and videos
    const fallbackInterval = setInterval(() => {
      if (!activeJobs.has(job.jobId)) {
        clearInterval(fallbackInterval);
        return;
      }

      const elapsed = Date.now() - submitTimestamp;

      // Google Flow AI generation takes at least 8-20 seconds.
      // Wait at least 6 seconds for images, and 12 seconds for videos before scanning DOM
      // to avoid premature completion or capturing old media elements!
      if (job.type === 'image' && elapsed < 6000) {
        return;
      }
      if (job.type === 'video' && elapsed < 12000) {
        return;
      }

      // 1. Scan for newly rendered IMAGE elements (prioritizing /edit center image and first gallery tile)
      if (job.type === 'image') {
        const matchedSrc = findNewlyGeneratedImage(existingMedia, submitTimestamp);
        if (matchedSrc) {
          console.log(`[ShineFlowWorker] 🎉 CAPTURED GENERATED IMAGE FROM DOM (${Math.round(elapsed / 1000)}s after submit):`, matchedSrc);
          clearInterval(fallbackInterval);
          clearTimeout(timer);
          activeJobs.delete(job.jobId);
          urlToBase64(matchedSrc).then(b64Res => {
            const base64Data = b64Res && b64Res.base64 ? `data:${b64Res.type || 'image/png'};base64,${b64Res.base64}` : undefined;
            resolve({
              jobId: job.jobId,
              status: 'SUCCESS',
              mediaUrl: matchedSrc,
              base64Data,
              mimeType: b64Res?.type || 'image/png',
              model: job.model,
            });
          }).catch(() => {
            resolve({
              jobId: job.jobId,
              status: 'SUCCESS',
              mediaUrl: matchedSrc,
              model: job.model,
            });
          });
          return;
        }
      }

      // 2. Scan for newly rendered VIDEO elements
      if (job.type === 'video') {
        const currentVideos = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('mediaOutput.generatedVideo') : Array.from(document.querySelectorAll(
          'video, flow-video-tile video, [class*="video"] video, a[href*=".mp4"], a[href*="/video/"]'
        ))).filter(isVisible);

        for (const v of currentVideos) {
          const src = v.currentSrc || v.getAttribute('src') || v.getAttribute('href');
          const norm = normalizeMediaUrl(src);
          if (src && isValidVideoUrl(src) && !existingMedia.has(src) && (!norm || !existingMedia.has(norm)) && !isUploadedReference(src)) {
            console.log(`[ShineFlowWorker] 🎉 CAPTURED GENERATED VIDEO FROM DOM (${Math.round(elapsed / 1000)}s after submit):`, src);
            clearInterval(fallbackInterval);
            clearTimeout(timer);
            activeJobs.delete(job.jobId);
            return resolve({
              jobId: job.jobId,
              status: 'SUCCESS',
              mediaUrl: src,
              model: job.model,
            });
          }
        }
      }

      // 3. Check for Credit Approval buttons (Angular Material dialog action button)
      const dialog = window.DomRuleEngine?.query('overlays.dialog') || document.querySelector('mat-dialog-container, .cdk-overlay-pane [role="dialog"]');
      if (dialog && isVisible(dialog)) {
        const dialogBtns = (window.DomRuleEngine ? window.DomRuleEngine.queryAll('overlays.dialogConfirmButton', dialog) : Array.from(dialog.querySelectorAll('mat-dialog-actions button, .mat-mdc-dialog-actions button, button'))).filter(isVisible);
        const confirmBtn = dialogBtns[dialogBtns.length - 1];
        if (confirmBtn && !confirmBtn.disabled) {
          confirmBtn.click();
        }
      }

      // 4. Check for Out-of-Credits Banner
      const pageText = document.body ? (document.body.innerText || '') : '';
      if (pageText.includes("out of Google Flow credits")) {
        clearInterval(fallbackInterval);
        clearTimeout(timer);
        activeJobs.delete(job.jobId);
        chrome.runtime.sendMessage({ type: 'CREDIT_UPDATE', credits: 0, isQuotaExceeded: true }).catch(() => {});
        return reject(new Error('QUOTA_EXCEEDED: You are out of Google Flow credits on this account.'));
      }
    }, 800);
  });
}

// ── 10. Message Listener from Background Worker ───────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE_DOM_JOB') {
    handleDomJob(message.job)
      .then(result => sendResponse(result))
      .catch(err => {
        // Only trigger account credits check if error specifically indicates quota exhaustion
        if (/quota|credit|out of/i.test(err?.message || '')) {
          fetchCreditsFromUI().catch(() => {});
        }
        sendResponse({ status: 'FAILED', error: err.message, jobId: message.job?.jobId });
      });
    return true; // async
  }

  if (message.type === 'DELETE_FLOW_PROJECT') {
    deleteFlowProject(message.projectId)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }

  if (message.type === 'FETCH_CREDITS_NOW') {
    fetchCreditsFromUI()
      .then(res => {
        const credits = typeof res === 'number' ? res : (res?.credits !== undefined ? res.credits : undefined);
        const isQuotaExceeded = typeof res === 'object' ? Boolean(res?.isQuotaExceeded) : (credits === 0);
        sendResponse({ ok: true, credits, isQuotaExceeded });
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }

  if (message.type === 'PING_PAGE') {
    const input = findPromptInput();
    sendResponse({ ok: true, url: window.location.href, hasInput: Boolean(input) });
    return false;
  }
});

async function handleDomJob(job) {
  console.log(`[ShineFlowWorker] 🎬 Starting generation job ${job.jobId} (${job.type})`);

  // Step -1: Ensure latest DOM selector rules are synced from Flow Worker
  if (typeof window.syncDomRules === 'function') {
    try {
      await window.syncDomRules();
    } catch (_) {}
  }

  // Step 0: Ensure any open agent sidebar, dialogs, drawers, popovers or selections are closed
  dismissAllOverlays();
  await closeAddMenuDrawer();
  await closeAgentPanelAndDisableAgentMode();
  await new Promise(r => setTimeout(r, 300));

  // Step 1: Create a fresh dedicated project for this job (clean drawer = no stale assets)
  const projectTitle = job.jobProjectTitle || `ShineJob_${job.jobId}`;
  const inProject = await ensureFreshProjectForJob(projectTitle);
  if (!inProject) {
    throw new Error('Could not create or navigate to a Google Flow project.');
  }

  // Step 2: ALWAYS ensure right sidebar is closed & Agent Mode is OFF (Standard Canvas Mode)
  await closeAgentPanelAndDisableAgentMode();
  await ensureCategoryTab(job.type);
  await new Promise(r => setTimeout(r, 400));

  // Step 2.5: ALWAYS upload images first! (Before switching mode, while header & prompt upload triggers are available)
  await uploadJobMediaUpfront(job);
  dismissAllOverlays();
  await closeAddMenuDrawer();
  await new Promise(r => setTimeout(r, 400));

  // Step 3: Configure settings: Video vs Image, Frames vs Ingredients, Ratio, Model, Resolution, Duration, x1
  await ensureSettingsConfigured(job);
  dismissAllOverlays();
  await closeAddMenuDrawer();
  await new Promise(r => setTimeout(r, 400));

  // Step 4: Attach start-end frames or reference images according to configured mode
  await attachReferenceImagesAndFrames(job);
  await closeAddMenuDrawer();
  await new Promise(r => setTimeout(r, 400));

  // Ensure drawer is completely dismissed before typing and submitting prompt!
  for (let waitClose = 0; waitClose < 10; waitClose++) {
    const openDrawer = document.querySelector('flow-add-menu-popover-content, .add-menu-popover-container, flow-add-menu-detail-pane, .cdk-overlay-pane:has(flow-add-menu-popover-content), .cdk-overlay-pane:has(flow-add-menu-detail-pane)');
    if (!openDrawer || !isVisible(openDrawer)) break;
    console.log('[ShineFlowWorker] 🔄 Ensuring Add Menu drawer is closed before prompt submission...');
    await closeAddMenuDrawer();
    await new Promise(r => setTimeout(r, 350));
  }

  // Step 5: Find prompt input
  let input = findPromptInput();
  if (!input) {
    for (let retry = 0; retry < 6; retry++) {
      await new Promise(r => setTimeout(r, 600));
      input = findPromptInput();
      if (input) break;
    }
  }

  if (!input) {
    throw new Error('Could not find Google Flow prompt input editor. Please ensure a project is open at flow.google.com.');
  }

  // Step 6: Fill prompt text
  const formattedPrompt = job.agentPrompt || formatFlowPrompt(job);
  console.log(`[ShineFlowWorker] Submitting prompt: "${formattedPrompt}"`);
  await setPromptText(input, formattedPrompt);
  await new Promise(r => setTimeout(r, 600));

  // Step 6.5: HARD SAFETY GUARD - Ensure required frames or references are attached!
  const isFramesModeJob = Boolean(
    job.imageStart || job.startFrame || job.start_frame_url ||
    job.imageEnd || job.endFrame || job.end_frame_url ||
    job.mode === 'interpolation' || job.mode === 'i2v' ||
    (job.type === 'video' && !job.characterReferences?.length && !job.namedReferences?.length && (
      (Array.isArray(job.images) && job.images.length > 0) ||
      (Array.isArray(job.referenceImages) && job.referenceImages.length > 0)
    ) && job.mode !== 'r2v') ||
    document.querySelector('.frame-trigger')
  );

  if (isFramesModeJob && (job.imageStart || job.startFrame || job.start_frame_url || (Array.isArray(job.images) && job.images.length > 0) || (Array.isArray(job.referenceImages) && job.referenceImages.length > 0))) {
    const { startSlot } = findFrameSlots();
    const isStartEmpty = !startSlot || startSlot.classList.contains('empty-chip') || !startSlot.querySelector('img');
    if (isStartEmpty) {
      throw new Error('[ShineFlowWorker] 🛑 Premature generation blocked! Start frame is not attached in the prompt box.');
    }
  }

  // Snapshot existing media before submission
  const existingMedia = getExistingMediaSources();

  // Step 7: Submit prompt (Send)
  await submitPromptAction(input);
  const submitTimestamp = Date.now();

  // Step 8: Wait for media completion (Dual Engine: Network stream + Active DOM scanner!)
  const timeoutMs = job.timeoutMs || (job.type === 'video' ? 180000 : 90000);
  const result = await waitForJobCompletion(job, existingMedia, timeoutMs, submitTimestamp);

  console.log(`[ShineFlowWorker] 🎉 Completed job ${job.jobId}:`, result.mediaUrl);

  // Step 9: Read and report credits after job completes
  fetchCreditsFromUI().catch(() => {});

  return result;
}

// ── Credit & Project Auto-Sync ────────────────────────────────────────────────

/**
 * Opens the Google Flow account panel, reads the displayed credit count,
 * then closes the panel. This is the most reliable way to get the current
 * credit count since credits are not shown directly on the main page.
 *
 * Selectors from sample HTML:
 *   - Avatar button: .header-user-button (inside flow-header-user-icon)
 *   - Panel overlay: flow-account-panel / .flow-account-panel-overlay
 *   - Credit text:   span.credits-count  (e.g. "38 Google Flow credits")
 *   - Close button:  flow-account-panel button[aria-label="Close account panel"]
 */
function parseCreditNumber(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return undefined;
  // Match number that may contain thousand separators (e.g. "1.050", "1,050", "1 050", "38")
  const match = rawStr.match(/(\d+(?:[.,\s]\d+)*)/);
  if (!match) return undefined;
  const cleanDigits = match[1].replace(/[.,\s]/g, '');
  if (!cleanDigits) return undefined;
  const num = parseInt(cleanDigits, 10);
  return isNaN(num) ? undefined : num;
}

async function fetchCreditsFromUI() {
  try {
    // 1. Check if panel is already open (strictly match account panel, never settings or cost overlays)
    let panel = window.DomRuleEngine?.query('accountCredits.panel')
      || document.querySelector('flow-account-panel, .flow-account-panel-overlay, [class*="account-panel"], .cdk-overlay-pane:has(flow-account-panel)');
    let panelAlreadyOpen = panel && isVisible(panel);

    if (!panelAlreadyOpen) {
      // Find avatar button to open the account panel
      let avatarBtn = window.DomRuleEngine?.query('accountCredits.avatarButton')
        || document.querySelector('.header-user-button, flow-header-user-icon [role="button"], flow-header-user-icon button, flow-header-user-icon');
      
      // Wait up to 10s if avatar button is not immediately in DOM
      if (!avatarBtn) {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500));
          avatarBtn = window.DomRuleEngine?.query('accountCredits.avatarButton')
            || document.querySelector('.header-user-button, flow-header-user-icon [role="button"], flow-header-user-icon button, flow-header-user-icon');
          if (avatarBtn) break;
        }
      }

      if (!avatarBtn) {
        console.warn('[ShineFlowWorker] fetchCreditsFromUI: Avatar button not found');
        return { credits: undefined, isQuotaExceeded: false, error: 'Avatar button not found' };
      }
      robustClick(avatarBtn);
    }

    // 2. Poll for the credit number to actually render inside the panel (up to 12s)
    let credits = undefined;
    let isOutOfCredits = false;
    let candidateZeroCount = 0;
    const pollStart = Date.now();
    const MAX_WAIT_MS = 14000;

    // Fast-path: Check if network interceptor captured verified credits recently (last 60s)
    if (window.__SHINE_FLOW_NETWORK_CREDITS !== undefined && (Date.now() - (window.__SHINE_FLOW_NETWORK_CREDITS_TIME || 0) < 60000)) {
      credits = window.__SHINE_FLOW_NETWORK_CREDITS;
      console.log(`[ShineFlowWorker] 💰 Reusing recent network-intercepted credits: ${credits}`);
    }

    while (Date.now() - pollStart < MAX_WAIT_MS && credits === undefined) {
      panel = window.DomRuleEngine?.query('accountCredits.panel')
        || document.querySelector('flow-account-panel, .flow-account-panel-overlay, [class*="account-panel"], .cdk-overlay-pane:has(flow-account-panel)');

      if (panel && isVisible(panel)) {
        let foundNumber = undefined;

        // A. Check dedicated selector inside account panel (ignore any cost elements)
        const creditsEl = window.DomRuleEngine?.query('accountCredits.creditsCount', panel)
          || panel.querySelector('span.credits-count, .credits-count, .credits-link .credits-count, a.credits-link span, [class*="credit-count"]');
        
        if (creditsEl && !creditsEl.closest('flow-credit-cost-label, .settings-credit-cost, .credit-cost-link')) {
          const text = (creditsEl.textContent || '').trim();
          foundNumber = parseCreditNumber(text);
        }

        // B. Scan child elements in panel for credit text (ignoring cost labels)
        if (foundNumber === undefined) {
          const allElements = Array.from(panel.querySelectorAll('*')).filter(
            el => !el.closest('flow-credit-cost-label, .settings-credit-cost, .credit-cost-link')
          );
          for (const el of allElements) {
            if (el.children.length > 2) continue;
            const text = (el.textContent || '').trim();
            const match = text.match(/(\d+(?:[.,\s]\d+)*)\s*(?:Google Flow credits|credits|tín dụng Google Flow|tín dụng)/i);
            if (match) {
              foundNumber = parseCreditNumber(match[1]);
              if (foundNumber !== undefined) break;
            }
          }
        }

        // C. Scan panel innerText if still not found
        if (foundNumber === undefined) {
          const panelText = panel.innerText || '';
          const match = panelText.match(/(\d+(?:[.,\s]\d+)*)\s*(?:Google Flow credits|credits|tín dụng Google Flow|tín dụng)/i);
          if (match) {
            foundNumber = parseCreditNumber(match[1]);
          }
        }

        // D. Anti-Flapping / Angular Template 0-Placeholder Guard:
        // When Google Flow opens the popover, the initial HTML template binds to
        // placeholder "0 credits" before the asynchronous profile API resolves the real balance (e.g. 490 credits).
        // If foundNumber > 0: accept immediately and break!
        // If foundNumber === 0: require an explicit "out of credits" banner, NEVER assume zero!
        if (foundNumber !== undefined) {
          if (foundNumber > 0) {
            credits = foundNumber;
            console.log(`[ShineFlowWorker] 💰 Verified non-zero credits from panel: ${credits}`);
            break;
          } else {
            // foundNumber === 0
            candidateZeroCount++;
            const panelText = panel.innerText || '';
            const isExplicitOutOfCredits = /out of Google Flow credits|hết tín dụng|0 credits remaining|no credits left/i.test(panelText);
            if (isExplicitOutOfCredits) {
              credits = 0;
              isOutOfCredits = true;
              console.warn(`[ShineFlowWorker] 🛑 Confirmed 0 credits with explicit quota banner: "${panelText.slice(0, 100)}"`);
              break;
            } else if (candidateZeroCount >= 20) {
              // Timed out with 0 placeholder without explicit banner: Do NOT assume 0!
              console.warn(`[ShineFlowWorker] ⚠️ Read 0 without quota banner across 20 checks. Profile API may still be loading. Preserving balance.`);
              credits = undefined;
              break;
            }
            console.log(`[ShineFlowWorker] ⏳ Read candidate 0 credits (check #${candidateZeroCount}/20), waiting for Angular to finish async loading...`);
          }
        }
      }

      await new Promise(r => setTimeout(r, 350));
    }

    if (credits !== undefined) {
      isOutOfCredits = credits <= 0;
      console.log(`[ShineFlowWorker] 💰 Successfully verified account credits: ${credits}`);
      // Send verified credit update to background
      chrome.runtime.sendMessage({
        type: 'CREDIT_UPDATE',
        credits,
        isQuotaExceeded: isOutOfCredits,
      }).catch(() => {});
    } else {
      console.warn('[ShineFlowWorker] ⚠️ fetchCreditsFromUI: Credit number did not render inside panel within timeout. Preserving current state.');
    }

    // 3. Close account panel if we opened it
    if (!panelAlreadyOpen) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const currentPanel = document.querySelector('flow-account-panel, .flow-account-panel-overlay');
        if (!currentPanel || !isVisible(currentPanel)) break;

        const closeBtn = window.DomRuleEngine?.query('accountCredits.closeButton', currentPanel)
          || currentPanel.querySelector('button[aria-label*="close" i], button[aria-label*="đóng" i], .close-btn, button:has(svg), button:has(mat-icon)');
        if (closeBtn && attempt === 0) {
          robustClick(closeBtn);
          await new Promise(r => setTimeout(r, 350));
          if (!isVisible(currentPanel)) break;
        }

        const avatarBtn = window.DomRuleEngine?.query('accountCredits.avatarButton')
          || document.querySelector('.header-user-button, flow-header-user-icon [role="button"], flow-header-user-icon button, flow-header-user-icon');
        if (avatarBtn) {
          robustClick(avatarBtn);
          await new Promise(r => setTimeout(r, 350));
          if (!isVisible(currentPanel)) break;
        }

        const backdrop = document.querySelector('.flow-account-panel-overlay, .cdk-overlay-backdrop');
        if (backdrop && isVisible(backdrop)) {
          robustClick(backdrop);
        } else {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }

    try {
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    } catch (_) {}

    return { credits, isQuotaExceeded: isOutOfCredits };
  } catch (err) {
    console.warn('[ShineFlowWorker] fetchCreditsFromUI error:', err.message);
    return { credits: undefined, error: err.message };
  }
}

function reportCreditAndProject() {
  try {
    // If the account panel is already open by the user, read credits directly without clicking
    const panel = document.querySelector('flow-account-panel, .flow-account-panel-overlay, [class*="account-panel"], .cdk-overlay-pane, div[role="dialog"]');
    if (panel && isVisible(panel)) {
      const text = panel.innerText || '';
      const match = text.match(/(\d+(?:[.,\s]\d+)*)\s*(?:Google Flow credits|credits|tín dụng Google Flow|tín dụng)/i);
      if (match) {
        const credits = parseCreditNumber(match[1]);
        if (credits !== undefined) {
          chrome.runtime.sendMessage({
            type: 'CREDIT_UPDATE',
            credits,
            isQuotaExceeded: credits <= 0,
          }).catch(() => {});
        }
      }
    }

    const urlMatch = window.location.href.match(/\/project\/([a-zA-Z0-9_-]+)/);
    if (urlMatch && urlMatch[1]) {
      chrome.runtime.sendMessage({
        type: 'SYNC_PROJECT',
        projectId: urlMatch[1],
        projectUrl: window.location.href,
      }).catch(() => {});
    }
  } catch (_) {}
}

setInterval(reportCreditAndProject, 10000);
setTimeout(reportCreditAndProject, 2500);

