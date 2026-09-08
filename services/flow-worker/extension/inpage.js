// Shine Flow Worker — Inpage Interceptor (Runs in MAIN world)
// Intercepts Flow API requests/responses directly to extract operation names, job IDs, and completed media URLs without DOM scraping.

(function () {
  if (window.__SHINE_FLOW_INPAGE_INITIALIZED__) return;
  window.__SHINE_FLOW_INPAGE_INITIALIZED__ = true;

  console.log('[ShineFlowWorker:Inpage] 🚀 Main world network interceptor activated');

  // Helper: Post messages to content script (isolated world)
  function emitToExtension(type, data) {
    try {
      window.postMessage({
        source: 'SHINE_FLOW_INPAGE',
        type,
        data,
        timestamp: Date.now(),
      }, '*');
    } catch (err) {
      console.warn('[ShineFlowWorker:Inpage] Failed to emit postMessage:', err);
    }
  }

  // ── Main-World ProseMirror Editor & Prompt Injection ────────────────────────
  function findProseMirrorEditor() {
    return document.querySelector(
      '.prompt-box-content .ProseMirror, flow-base-prompt-box .ProseMirror, flow-rich-text-editor .ProseMirror, .ProseMirror[contenteditable="true"]'
    );
  }

  function getProseMirrorView(pmEl) {
    if (!pmEl) return null;
    let cur = pmEl;
    while (cur) {
      if (cur.pmViewDesc?.view) return cur.pmViewDesc.view;
      if (cur.pmViewDesc?.editorView) return cur.pmViewDesc.editorView;
      if (cur.editorView) return cur.editorView;
      cur = cur.parentElement;
    }
    const childWithDesc = pmEl.querySelector('*');
    if (childWithDesc?.pmViewDesc?.view) return childWithDesc.pmViewDesc.view;
    if (childWithDesc?.pmViewDesc?.editorView) return childWithDesc.pmViewDesc.editorView;
    return null;
  }

  function setProseMirrorPrompt(text) {
    const pmEl = findProseMirrorEditor();
    if (!pmEl) {
      console.warn('[ShineFlowWorker:Inpage] ⚠️ Could not find ProseMirror editor element');
      return false;
    }

    pmEl.focus();

    // 1. Primary: Direct ProseMirror EditorView inspection & transaction dispatch
    const view = getProseMirrorView(pmEl);
    let viewSuccess = false;
    if (view && typeof view.dispatch === 'function' && view.state) {
      try {
        console.log('[ShineFlowWorker:Inpage] 🎯 Direct ProseMirror view found! Dispatching transaction...');
        const tr = view.state.tr;
        const schema = view.state.schema;
        if (typeof tr.insertText === 'function') {
          tr.insertText(text, 0, view.state.doc.content.size);
        } else {
          const textNode = schema.text(text);
          const pNode = schema.nodes?.paragraph ? schema.nodes.paragraph.create(null, textNode) : textNode;
          tr.replaceWith(0, view.state.doc.content.size, pNode);
        }
        view.dispatch(tr);
        view.focus();
        viewSuccess = true;
      } catch (err) {
        console.warn('[ShineFlowWorker:Inpage] ProseMirror view dispatch failed, trying fallback:', err);
      }
    }

    // 2. Secondary: Main-world synthetic ClipboardEvent('paste') with DataTransfer
    if (!viewSuccess || !pmEl.textContent?.includes(text.slice(0, 15))) {
      try {
        pmEl.focus();
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(pmEl);
          sel.addRange(range);
        }
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEvt = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        pmEl.dispatchEvent(pasteEvt);
      } catch (err) {
        console.warn('[ShineFlowWorker:Inpage] Main world paste failed:', err);
      }
    }

    // 3. Tertiary: Main-world execCommand('insertText')
    if (!pmEl.textContent?.includes(text.slice(0, 15))) {
      try {
        pmEl.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      } catch (_) {}
    }

    // 4. Dispatch beforeinput & input events for Angular reactive forms
    try {
      pmEl.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      pmEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      pmEl.dispatchEvent(new Event('input', { bubbles: true }));
      pmEl.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}

    // Collapse selection to end without destroying focus
    try {
      const sel = window.getSelection();
      if (sel && pmEl) {
        const range = document.createRange();
        range.selectNodeContents(pmEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (_) {}

    return true;
  }

  function triggerGenerateClickInMain() {
    const promptBox = document.querySelector('flow-base-prompt-box, flow-creative-agent-prompt-box, .prompt-box-content, .prompt-box, .base-prompt-box') || document;
    let btn = promptBox.querySelector('flow-generate-icon-button button, button.generate-icon-button, button[type="submit"].generate-icon-button');

    if (!btn) {
      const buttons = Array.from(promptBox.querySelectorAll('button')).filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      btn = buttons.find(b => {
        const matIcon = b.querySelector('mat-icon, .google-symbols, svg');
        const iconTxt = (matIcon?.textContent || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return ['arrow_forward', 'send', 'east'].includes(iconTxt) || /tạo|generate|gửi/i.test(aria);
      });
      if (!btn && buttons.length > 0) {
        btn = buttons.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
      }
    }

    if (btn) {
      console.log('[ShineFlowWorker:Inpage] 🚀 Triggering generate button click in main world:', btn);
      try {
        btn.removeAttribute('disabled');
        btn.removeAttribute('aria-disabled');
        btn.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'is-disabled');
      } catch (_) {}

      const opts = { bubbles: true, cancelable: true, view: window };
      try { btn.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (_) {}
      try { btn.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (_) {}
      try { btn.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (_) {}
      try { btn.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (_) {}
      btn.click();

      const parentIconBtn = btn.closest('flow-generate-icon-button');
      if (parentIconBtn && parentIconBtn !== btn) {
        try { parentIconBtn.dispatchEvent(new MouseEvent('click', opts)); } catch (_) {}
        try { parentIconBtn.click?.(); } catch (_) {}
      }
      return true;
    }
    return false;
  }

  // ── Auto-Inject Pending Files into Native File Pickers ───────────────────────
  let pendingFilesToUpload = null;

  window.addEventListener('message', (event) => {
    if (event.data?.source === 'SHINE_FLOW_CONTENT') {
      if (event.data.type === 'SET_PROMPT_TEXT') {
        const res = setProseMirrorPrompt(event.data.prompt || '');
        emitToExtension('SET_PROMPT_RESULT', { success: res });
        return;
      }
      if (event.data.type === 'TRIGGER_GENERATE_CLICK') {
        const res = triggerGenerateClickInMain();
        emitToExtension('GENERATE_CLICK_RESULT', { success: res });
        return;
      }
      if (event.data.type === 'SET_PENDING_FILES' || event.data.type === 'SET_PENDING_FILE') {
        const filesList = Array.isArray(event.data.files) ? event.data.files : [event.data];
        const parsedFiles = [];
        for (const item of filesList) {
          if (!item?.base64) continue;
          try {
            const byteCharacters = atob(item.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const mime = item.type || 'image/png';
            const blob = new Blob([byteArray], { type: mime });
            parsedFiles.push(new File([blob], item.name || `upload_${parsedFiles.length + 1}.png`, { type: mime }));
          } catch (err) {
            console.warn('[ShineFlowWorker:Inpage] Failed to parse pending file:', err);
          }
        }
        if (parsedFiles.length > 0) {
          pendingFilesToUpload = parsedFiles;
          console.log(`[ShineFlowWorker:Inpage] 📥 Set ${parsedFiles.length} pending files for upload injection`);
        }
      }
    }
  });

  const originalInputClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file' && pendingFilesToUpload && pendingFilesToUpload.length > 0) {
      console.log('[ShineFlowWorker:Inpage] 🎯 Intercepted file input click! Injecting file without opening OS picker...');
      const dt = new DataTransfer();
      for (const f of pendingFilesToUpload) {
        dt.items.add(f);
      }
      this.files = dt.files;
      this.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      this.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      pendingFilesToUpload = null;
      return; // Prevent OS file picker from opening!
    }
    return originalInputClick.apply(this, arguments);
  };

  if (window.showOpenFilePicker) {
    const originalShowOpenFilePicker = window.showOpenFilePicker;
    window.showOpenFilePicker = async function (...args) {
      if (pendingFilesToUpload && pendingFilesToUpload.length > 0) {
        console.log(`[ShineFlowWorker:Inpage] 🎯 Intercepted window.showOpenFilePicker! Returning ${pendingFilesToUpload.length} pending file(s)...`);
        const files = [...pendingFilesToUpload];
        pendingFilesToUpload = null;
        return files.map(file => ({
          kind: 'file',
          name: file.name,
          getFile: async () => file,
        }));
      }
      return originalShowOpenFilePicker.apply(this, args);
    };
  }

  // Strict list of input/ingredient keys to NEVER extract generated media from
  const IGNORED_INPUT_KEYS = new Set([
    'metadata', 'ingredients', 'ingredient', 'imageingredients', 'inputimages', 
    'inputimage', 'referenceimages', 'references', 'reference', 'sourcemedia', 
    'sourceimage', 'request', 'requestbody', 'params', 'prompt', 'prompttext',
    'input', 'inputs', 'thumbnails'
  ]);

  // Recursive search for media URLs & completed operations in JSON objects
  function scanForCompletedMedia(obj, context = {}) {
    if (!obj || typeof obj !== 'object') return [];
    const results = [];

    // Check if current node represents an operation
    const isOperation = Boolean(obj.name && (typeof obj.name === 'string') && obj.name.includes('operations/'));
    const opName = isOperation ? obj.name : context.opName;

    // If this is an operation: it MUST be done and have a response!
    // An operation still in progress (done !== true and no response) CANNOT yield completed media!
    if (isOperation) {
      if (obj.done !== true && !obj.response) {
        return [];
      }
      // If operation is done and has a response, ONLY scan obj.response (STRICTLY ignore obj.metadata!)
      if (obj.response && typeof obj.response === 'object') {
        return scanForCompletedMedia(obj.response, { ...context, opName });
      }
    }

    // Direct check for Flow's video object
    if (obj.video || obj.mediaType === 'MEDIA_TYPE_VIDEO' || (obj.status && String(obj.status).includes('SUCCESS'))) {
      const vid = obj.video || obj;
      const mediaUrl = vid.fifeUrl || vid.downloadUrl || vid.uri || vid.playbackUri || vid.videoUri || vid.url;
      if (mediaUrl && isValidVideoUrl(mediaUrl)) {
        results.push({
          type: 'video',
          opName,
          mediaUrl,
          aspectRatio: vid.aspectRatio || obj.aspectRatio,
          raw: obj,
        });
      }
    }

    // Direct check for Flow's image array (e.g. response.images: [ ... ])
    // PRESERVE ORDER: images[0] is the FIRST generated image!
    if (Array.isArray(obj.images)) {
      for (const imgItem of obj.images) {
        if (!imgItem) continue;
        const mediaUrl = imgItem.fifeUrl || imgItem.downloadUrl || imgItem.uri || imgItem.imageUrl || imgItem.url;
        if (mediaUrl && isValidImageUrl(mediaUrl)) {
          results.push({
            type: 'image',
            opName,
            mediaUrl,
            aspectRatio: imgItem.aspectRatio || obj.aspectRatio,
            raw: imgItem,
          });
        }
      }
    }

    // Direct check for Flow's single image object
    if (obj.image || obj.mediaType === 'MEDIA_TYPE_IMAGE') {
      const img = obj.image || obj;
      const mediaUrl = img.fifeUrl || img.downloadUrl || img.uri || img.imageUrl || img.url;
      if (mediaUrl && isValidImageUrl(mediaUrl)) {
        results.push({
          type: 'image',
          opName,
          mediaUrl,
          aspectRatio: img.aspectRatio || obj.aspectRatio,
          raw: obj,
        });
      }
    }

    // Recurse down child keys, STRICTLY skipping input/ingredient keys
    const nextContext = { ...context, opName };
    for (const [key, val] of Object.entries(obj)) {
      if (!val || typeof val !== 'object') continue;
      const lowerKey = key.toLowerCase();
      if (IGNORED_INPUT_KEYS.has(lowerKey)) continue;

      results.push(...scanForCompletedMedia(val, nextContext));
    }

    return results;
  }

  function isValidVideoUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    if (url.startsWith('data:image/')) return false;
    return (
      url.includes('video-downloads.googleusercontent.com') ||
      url.includes('/video/') ||
      url.includes('.mp4') ||
      url.includes('flow.google.com/asb/api/projects/') ||
      url.includes('googlevideo.com') ||
      (url.includes('googleusercontent.com') && !url.includes('=s'))
    );
  }

  function isValidImageUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    if (url.startsWith('data:video/')) return false;
    return (
      url.includes('googleusercontent.com') ||
      url.includes('flow-content.google') ||
      /\.(png|jpe?g|webp)(\?.*)?$/i.test(url)
    );
  }

  // ── Hook window.fetch ───────────────────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
    const options = args[1] || (typeof args[0] === 'object' ? args[0] : {}) || {};
    const method = (options.method || 'GET').toUpperCase();

    // Check for Flow API requests
    const isFlowApi = Boolean(
      url.startsWith('/') ||
      url.includes('flow.google.com') ||
      url.includes('google.com') ||
      url.includes('labs.google') ||
      url.includes('/asb/') ||
      url.includes('/api/') ||
      url.includes('batch') ||
      url.includes('operations')
    );

    let requestBody = null;
    if (isFlowApi && options.body && typeof options.body === 'string') {
      try {
        requestBody = JSON.parse(options.body);
      } catch (_) {}
    }

    // Intercept outgoing generation trigger
    if (isFlowApi && (url.includes('batchAsyncGenerateVideo') || url.includes('batchGenerateImages') || url.includes('generate'))) {
      console.log(`[ShineFlowWorker:Inpage] 📤 Outgoing Generation Request: ${url}`, requestBody);
      emitToExtension('REQUEST_SENT', {
        url,
        method,
        body: requestBody,
      });
    }

    const response = await originalFetch.apply(this, args);

    if (isFlowApi) {
      try {
        const cloned = response.clone();
        cloned.json().then(json => {
          handleApiResponse(url, requestBody, json);
        }).catch(() => {});
      } catch (_) {}
    }

    return response;
  };

  // ── Hook XMLHttpRequest ────────────────────────────────────────────────────
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._shineUrl = typeof url === 'string' ? url : '';
    this._shineMethod = method;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this._shineUrl && (this._shineUrl.includes('/asb/api/') || this._shineUrl.includes('flow.google.com'))) {
      this.addEventListener('load', function () {
        try {
          if (this.responseType === '' || this.responseType === 'text') {
            const json = JSON.parse(this.responseText);
            let reqBody = null;
            if (typeof body === 'string') {
              try { reqBody = JSON.parse(body); } catch (_) {}
            }
            handleApiResponse(this._shineUrl, reqBody, json);
          }
        } catch (_) {}
      });
    }
    return originalSend.apply(this, arguments);
  };

  const knownActiveOperations = new Set();

  // ── Process intercepted API Responses ──────────────────────────────────────
  function handleApiResponse(url, requestBody, json) {
    if (!json || typeof json !== 'object') return;

    // STRICTLY IGNORE upload responses, project lists, and project gallery loads (these contain OLD past media!)
    if (
      url.includes('uploadImage') ||
      url.includes('/upload') ||
      url.includes('uploadMedia') ||
      url.includes('assets:list') ||
      url.includes('getProject') ||
      url.includes('listProjects') ||
      (url.includes('/projects/') && !url.includes('operations') && !url.includes('batchCheckAsync') && !url.includes('generate')) ||
      json.isUserUploaded === true ||
      json.media?.isUserUploaded === true
    ) {
      return;
    }

    // 0. Credits Network Interception
    const isCreditApi = url.includes('credit') || url.includes('wallet') || url.includes('billing') || url.includes('user') || url.includes('profile');
    if (isCreditApi || json.credits !== undefined || json.result?.data?.json?.credits !== undefined || json.userCredits !== undefined) {
      const netCredits = json.credits !== undefined 
        ? json.credits 
        : (json.result?.data?.json?.credits !== undefined 
          ? json.result.data.json.credits 
          : (json.userCredits !== undefined ? json.userCredits : undefined));

      if (typeof netCredits === 'number' && !isNaN(netCredits)) {
        console.log(`[ShineFlowWorker:Inpage] 💰 Intercepted verified CREDITS from network (${url}): ${netCredits}`);
        emitToExtension('CREDITS_INTERCEPTED', { credits: netCredits });
      }
    }

    // 1. Generation initiation response (capturing operation names)
    if (url.includes('batchAsyncGenerateVideo') || url.includes('batchGenerateImages') || url.includes('generate')) {
      const operations = json.operations || (json.name ? [json] : []);
      if (operations.length > 0) {
        for (const op of operations) {
          if (op.name) knownActiveOperations.add(op.name);
        }
        console.log(`[ShineFlowWorker:Inpage] ⚡ Intercepted Generation Started with ${operations.length} operation(s):`, operations);
        emitToExtension('OPERATIONS_STARTED', {
          url,
          requestBody,
          operations: operations.map(op => ({
            name: op.name,
            metadata: op.metadata || {},
          })),
        });
      }
      // CRITICAL: Return immediately! Initiation requests only contain input ingredients & done: false!
      return;
    }

    // 2. Status Polling / Completion response (capturing completed media URLs ONLY for active operations or poll endpoints)
    const isStatusPoll = url.includes('batchCheckAsync') || url.includes('operations') || url.includes('check');
    if (isStatusPoll || knownActiveOperations.size > 0) {
      const completedItems = scanForCompletedMedia(json);
      if (completedItems.length > 0) {
        // Deduplicate by mediaUrl while strictly preserving generation order
        const seen = new Set();
        let index = 0;
        for (const item of completedItems) {
          if (!seen.has(item.mediaUrl)) {
            // ONLY emit if opName matches a known active operation, or if it came from batchCheckAsync
            if (!item.opName || knownActiveOperations.has(item.opName) || url.includes('batchCheckAsync')) {
              seen.add(item.mediaUrl);
              const isFirst = index === 0;
              index++;
              console.log(`[ShineFlowWorker:Inpage] 🎉 Intercepted NEW COMPLETED media (first=${isFirst}): ${item.type} -> ${item.mediaUrl}`);
              emitToExtension('MEDIA_COMPLETED', {
                type: item.type,
                opName: item.opName,
                mediaUrl: item.mediaUrl,
                aspectRatio: item.aspectRatio,
                isFirst,
                raw: item.raw,
              });
            }
          }
        }
      }
    }

    // 3. Error / Quota Detection
    if (json.error || (json.status && json.status.includes('QUOTA'))) {
      console.warn('[ShineFlowWorker:Inpage] ⚠️ API error / quota issue detected:', json.error);
      emitToExtension('API_ERROR', {
        error: json.error?.message || json.status || 'Google Flow API returned error',
        code: json.error?.code,
      });
    }
  }

  console.log('[ShineFlowWorker:Inpage] ✅ Hook setup complete');
})();
