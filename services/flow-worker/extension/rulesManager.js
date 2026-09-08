// Shine Flow Worker — DOM Selector Rules Manager & Dynamic Sync Engine
console.log('[ShineFlowWorker] 📜 RulesManager initialized');

const DEFAULT_DOM_RULES = {
  version: 6,
  updatedAt: "2026-09-07T08:30:00.000Z",
  rules: {
    agentPanel: {
      container: "flow-agent-panel, .agent-panel, flow-creative-agent-panel",
      closeButton: "flow-agent-panel .header-right button:last-of-type, flow-agent-panel .header-right button, icon:close"
    },
    agentModeChip: {
      chip: "flow-agent-mode-toggle-chip button.agent-mode-chip, button.agent-mode-chip, flow-agent-mode-toggle-chip button",
      checkedClass: "agent-mode-chip-checked",
      checkedContainer: "flow-agent-mode-toggle-chip.checked",
      label: ".agent-mode-chip-label"
    },
    promptInput: {
      editor: "flow-rich-text-editor.prompt-input .ProseMirror, flow-base-prompt-box .ProseMirror, .prompt-box-content .ProseMirror, .ProseMirror[contenteditable=\"true\"]",
      container: "flow-rich-text-editor.prompt-input, flow-base-prompt-box, .prompt-box-content"
    },
    settingsTrigger: {
      button: "button.settings-trigger-button, flow-base-prompt-box button.settings-trigger-button, .settings-summary, [settingstriggercontent]",
      summary: ".settings-summary, [settingstriggercontent]"
    },
    settingsOverlay: {
      container: "flow-prompt-box-settings, .settings-content-overlay, .cdk-overlay-pane:has(flow-prompt-box-settings)",
      backdrop: ".cdk-overlay-backdrop"
    },
    settingsToggles: {
      mode: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(1), flow-prompt-box-settings flow-toggles.variant-emphasized:first-of-type, flow-toggles:first-of-type",
        image: "icon:image, flow-prompt-box-settings flow-toggles:first-of-type mat-button-toggle:nth-of-type(1) button, mat-button-toggle:first-of-type button",
        video: "icon:videocam, flow-prompt-box-settings flow-toggles:first-of-type mat-button-toggle:nth-of-type(2) button, mat-button-toggle:nth-of-type(2) button"
      },
      videoType: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(2), flow-toggles:nth-of-type(2)",
        frames: "icon:crop_free, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(1) button, mat-button-toggle:nth-of-type(1) button",
        ingredients: "icon:chrome_extension, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(2) button, mat-button-toggle:nth-of-type(2) button"
      },
      aspectRatio: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(3), .mat-button-toggle-group.content-layout-column",
        options: {
          "16:9": "icon:crop_16_9, mat-button-toggle:nth-of-type(1) button",
          "4:3": "icon:crop_landscape, mat-button-toggle:nth-of-type(2) button",
          "1:1": "icon:crop_square, mat-button-toggle:nth-of-type(3) button",
          "3:4": "icon:crop_portrait, mat-button-toggle:nth-of-type(4) button",
          "9:16": "icon:crop_9_16, mat-button-toggle:nth-of-type(5) button"
        }
      },
      modelDropdown: {
        button: "button:has(.model-select-trigger-content), flow-prompt-box-settings button.mat-mdc-menu-trigger, .model-select-trigger-content",
        menuPanel: ".mat-mdc-menu-panel, [role=\"menu\"]",
        menuItem: ".mat-mdc-menu-panel [role=\"menuitem\"], button.mat-mdc-menu-item, mat-list-item"
      },
      resolution: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(4), flow-toggles:nth-of-type(4)",
        options: {
          "360p": "flow-prompt-box-settings flow-toggles:nth-of-type(4) mat-button-toggle:nth-of-type(1) button, mat-button-toggle:nth-of-type(1) button",
          "720p": "flow-prompt-box-settings flow-toggles:nth-of-type(4) mat-button-toggle:nth-of-type(2) button, mat-button-toggle:nth-of-type(2) button"
        }
      },
      duration: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(5), flow-toggles:nth-of-type(5)",
        options: {
          "4s": "flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(1) button, mat-button-toggle:nth-of-type(1) button",
          "6s": "flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(2) button, mat-button-toggle:nth-of-type(2) button",
          "8s": "flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(3) button, mat-button-toggle:nth-of-type(3) button",
          "10s": "flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(4) button, mat-button-toggle:nth-of-type(4) button"
        }
      },
      count: {
        group: "flow-prompt-box-settings flow-toggles:last-of-type, flow-toggles:last-of-type",
        options: {
          "x1": "mat-button-toggle:nth-of-type(1) button",
          "x2": "mat-button-toggle:nth-of-type(2) button",
          "x3": "mat-button-toggle:nth-of-type(3) button",
          "x4": "mat-button-toggle:nth-of-type(4) button"
        }
      }
    },
    imageSettings: {
      aspectRatio: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(2)",
        options: {
          "16:9": "icon:crop_16_9, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(1) button",
          "4:3": "icon:crop_landscape, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(2) button",
          "1:1": "icon:crop_square, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(3) button",
          "3:4": "icon:crop_portrait, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(4) button",
          "9:16": "icon:crop_9_16, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(5) button"
        }
      },
      modelDropdown: {
        button: "button:has(.model-select-trigger-content), flow-prompt-box-settings button.mat-mdc-menu-trigger, .model-select-trigger-content"
      },
      count: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(3), flow-prompt-box-settings flow-toggles:last-of-type",
        options: {
          "x1": "flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(1) button",
          "x2": "flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(2) button",
          "x3": "flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(3) button",
          "x4": "flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(4) button"
        }
      },
      creditCost: "flow-credit-cost-label, .settings-credit-cost, a.credit-cost-link"
    },
    videoSettings: {
      videoType: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(2)",
        frames: "icon:crop_free, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(1) button",
        ingredients: "icon:chrome_extension, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(2) button"
      },
      aspectRatio: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(3)",
        options: {
          "16:9": "icon:crop_16_9, flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(1) button",
          "9:16": "icon:crop_9_16, flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(2) button"
        }
      },
      modelDropdown: {
        button: "button:has(.model-select-trigger-content), flow-prompt-box-settings button.mat-mdc-menu-trigger, .model-select-trigger-content"
      },
      resolution: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(4)",
        options: {
          "360p": "flow-prompt-box-settings flow-toggles:nth-of-type(4) mat-button-toggle:nth-of-type(1) button",
          "720p": "flow-prompt-box-settings flow-toggles:nth-of-type(4) mat-button-toggle:nth-of-type(2) button"
        }
      },
      duration: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(5)",
        options: {
          "4s": "flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(1) button",
          "6s": "flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(2) button",
          "8s": "flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(3) button",
          "10s": "flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(4) button"
        }
      },
      count: {
        group: "flow-prompt-box-settings flow-toggles:nth-of-type(6), flow-prompt-box-settings flow-toggles:last-of-type",
        options: {
          "x1": "flow-prompt-box-settings flow-toggles:nth-of-type(6) mat-button-toggle:nth-of-type(1) button",
          "x2": "flow-prompt-box-settings flow-toggles:nth-of-type(6) mat-button-toggle:nth-of-type(2) button",
          "x3": "flow-prompt-box-settings flow-toggles:nth-of-type(6) mat-button-toggle:nth-of-type(3) button",
          "x4": "flow-prompt-box-settings flow-toggles:nth-of-type(6) mat-button-toggle:nth-of-type(4) button"
        }
      },
      creditCost: "flow-credit-cost-label, .settings-credit-cost, a.credit-cost-link"
    },
    modelDropdown: {
      button: "button:has(.model-select-trigger-content), flow-prompt-box-settings button.mat-mdc-menu-trigger, .model-select-trigger-content",
      menuPanel: ".mat-mdc-menu-panel, [role=\"menu\"]",
      menuItem: ".mat-mdc-menu-panel [role=\"menuitem\"], button.mat-mdc-menu-item, mat-list-item"
    },
    accountCredits: {
      avatarButton: ".header-user-button, flow-header-user-icon [role=\"button\"], flow-header-user-icon button, flow-header-user-icon",
      panel: "flow-account-panel, .flow-account-panel-overlay",
      creditsCount: "span.credits-count, .credits-count, .credits-link .credits-count, a.credits-link span",
      closeButton: "flow-account-panel button[aria-label*=\"close\" i], flow-account-panel button[aria-label*=\"đóng\" i], flow-account-panel .close-btn, flow-account-panel button:has(mat-icon), flow-account-panel button:has(svg), flow-account-panel header button"
    },
    headerTools: {
      buttonGroup: "div.tools-button-group, [tools-button-group]",
      addMediaButton: "button[mattooltip*=\"nghe nhìn\" i], button[aria-label*=\"nghe nhìn\" i], button[mattooltip*=\"media\" i], button[aria-label*=\"media\" i], .tools-button-group button:first-child",
      uploadMenuItem: "flow-menu-item[xapfileselectortrigger] button, .mat-mdc-menu-panel button:has(mat-icon)"
    },
    framesWidget: {
      container: "flow-ingredient-bar.prompt-ingredient-bar, flow-ingredient-bar, .prompt-ingredient-bar",
      startSlot: ".prompt-ingredient-bar .frame-trigger:first-of-type button, flow-ingredient-bar .frame-trigger:first-of-type button, .frame-trigger:first-of-type button",
      endSlot: ".prompt-ingredient-bar .frame-trigger:last-of-type button, flow-ingredient-bar .frame-trigger:last-of-type button, .frame-trigger:last-of-type button",
      swapButton: "icon:swap_horiz, flow-ingredient-bar button:has(mat-icon)"
    },
    frameChooser: {
      modal: ".cdk-overlay-pane:has(input[placeholder*=\"Tìm kiếm\" i]), .cdk-overlay-pane:has([class*=\"search\"]), mat-dialog-container:has(input[placeholder*=\"Tìm kiếm\" i])",
      searchInput: "input[placeholder*=\"Tìm kiếm thành phần\" i], input[placeholder*=\"Search\" i]",
      assetItem: "button.asset-item, button:has(img), flow-image-tile, flow-media-tile, [role=\"option\"]"
    },
    addMenu: {
      trigger: "flow-add-menu button.add-menu-trigger, button.add-menu-trigger",
      popover: "flow-add-menu-popover-content, .add-menu-popover-container",
      uploadsTab: "text:Tệp tải lên, text:Uploads, icon:drive_folder_upload, flow-add-menu-side-nav mat-list-item:last-of-type, .side-nav-list mat-list-item:last-of-type",
      uploadButton: "text:Tải nội dung, button.sidebar-upload-btn, .sidebar-footer button, icon:upload",
      assetList: "flow-add-menu-asset-list cdk-virtual-scroll-viewport, .asset-list-viewport",
      assetItem: "button.asset-item, .asset-item",
      detailPane: "flow-add-menu-detail-pane",
      addToPromptButton: "text:Thêm vào câu lệnh, text:Add to prompt, button.detail-add-to-prompt-btn, flow-add-menu-detail-pane .bottom-actions button, flow-add-menu-detail-pane button:last-of-type"
    },
    generateButton: {
      button: "flow-generate-icon-button button.generate-icon-button, button.generate-icon-button, icon:arrow_forward, button[type=\"submit\"].generate-icon-button"
    },
    dashboard: {
      newProjectButton: "button.create-project-card, .create-project-card, .new-project-card, a[href*=\"/project/new\"], button:has(mat-icon.flow-icon-l)",
      projectCard: "a[href*=\"/project/\"], .project-card, div[role=\"button\"]",
      projectDeleteButton: "[role=\"menuitem\"], button",
      confirmDeleteDialog: "mat-dialog-container button.mat-primary, mat-dialog-actions button:last-of-type, .mat-mdc-dialog-actions button:last-of-type"
    },
    navigation: {
      categoryTabImage: "icon:image, nav a, nav button, [role=\"tab\"]",
      categoryTabVideo: "icon:videocam, nav a, nav button, [role=\"tab\"]"
    },
    overlays: {
      backdrop: ".cdk-overlay-backdrop, .flow-account-panel-overlay",
      closeButton: "button[aria-label*=\"close\" i], button[aria-label*=\"đóng\" i], button.close-btn, flow-account-panel button, [aria-label*=\"Đóng\"]",
      dialog: "mat-dialog-container, .cdk-overlay-pane [role=\"dialog\"]",
      dialogConfirmButton: "mat-dialog-actions button, .mat-mdc-dialog-actions button, button"
    },
    upload: {
      fileInput: "input[type=\"file\"]",
      searchInput: ".search-header input.search-input, input.search-input, input[placeholder*=\"Tìm kiếm\" i]",
      progressSpinner: "flow-media-upload mat-spinner, flow-media-upload mat-progress-spinner, flow-media-upload [role=\"progressbar\"], flow-add-menu-asset-list mat-spinner, flow-add-menu-asset-list mat-progress-spinner, flow-add-menu-asset-list [role=\"progressbar\"], .asset-list-viewport mat-spinner, .asset-list-viewport mat-progress-spinner, [class*=\"upload-progress\"], [class*=\"spinner\"]",
      drawer: "flow-add-menu-popover-content, .add-menu-popover-container, flow-add-menu-detail-pane, .cdk-overlay-pane",
      drawerCloseButton: "flow-add-menu-popover-content button[aria-label*=\"đóng\" i], button[aria-label*=\"đóng\" i], button[aria-label*=\"close\" i], button.close-button, [aria-label*=\"Hủy\" i], [aria-label*=\"Cancel\" i]",
      ingredientChips: "flow-image-ingredient-chip, [class*=\"ingredient-chip\"], [class*=\"ingredient\"]",
      dropTargets: ".prosemirror-editor, .ProseMirror, flow-base-prompt-box, [aria-label*=\"bắt đầu\" i], div[class*=\"start-frame\"], .prompt-box, flow-agent-panel, flow-agent-panel .ProseMirror, [class*=\"drop-media\"]"
    },
    mediaOutput: {
      canvasImage: "flow-media-view img, flow-canvas img, .canvas-container img, flow-editor img, [class*=\"canvas\"] img, [class*=\"media\"] img",
      galleryImage: "flow-a2ui-image-option img, img.image-thumbnail, a2ui-surface img, flow-image-tile img, [data-testid*=\"image\"] img",
      generatedVideo: "video, flow-video-tile video, [class*=\"video\"] video, a[href*=\".mp4\"], a[href*=\"/video/\"]"
    }
  }
};

let activeDomRules = JSON.parse(JSON.stringify(DEFAULT_DOM_RULES));

// Load cached rules from chrome.storage if present
try {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['SHINE_DOM_RULES'], (res) => {
      if (res && res.SHINE_DOM_RULES && res.SHINE_DOM_RULES.rules) {
        activeDomRules = res.SHINE_DOM_RULES;
        console.log(`[ShineFlowWorker] 📦 Loaded cached DOM rules (version ${activeDomRules.version})`);
      }
    });
  }
} catch (_) {}

/**
 * Sync latest rules dynamically from Flow Worker server
 */
async function syncDomRules(serverUrl = 'http://localhost:8088') {
  try {
    const res = await fetch(`${serverUrl}/v1/rules/dom-selectors`, { method: 'GET' });
    if (!res.ok) return;
    const json = await res.json();
    if (json && json.code === 200 && json.data && json.data.rules) {
      activeDomRules = json.data;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 'SHINE_DOM_RULES': activeDomRules });
      }
      console.log(`[ShineFlowWorker] 🔄 Successfully synced DOM selector rules from ${serverUrl} (v${activeDomRules.version})`);
    }
  } catch (err) {
    console.log('[ShineFlowWorker] ℹ️ Worker server rules endpoint offline, using local rules:', err.message);
  }
}

/**
 * Universal Rule-Driven DOM Query Engine (Language-Independent)
 */
const DomRuleEngine = {
  getRules() {
    return activeDomRules.rules || DEFAULT_DOM_RULES.rules;
  },

  getRule(dotPath) {
    const parts = dotPath.split('.');
    let cur = this.getRules();
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') {
        cur = null;
        break;
      }
      cur = cur[p];
    }
    if (cur) return cur;

    // Fallback aliases across imageSettings / videoSettings / settingsToggles
    if (dotPath.startsWith('settingsToggles.')) {
      const subPath = dotPath.substring('settingsToggles.'.length);
      const videoRule = this.getRule(`videoSettings.${subPath}`);
      if (videoRule) return videoRule;
      const imageRule = this.getRule(`imageSettings.${subPath}`);
      if (imageRule) return imageRule;
    } else if (dotPath.startsWith('videoSettings.')) {
      const subPath = dotPath.substring('videoSettings.'.length);
      const toggleRule = this.getRule(`settingsToggles.${subPath}`);
      if (toggleRule) return toggleRule;
    } else if (dotPath.startsWith('imageSettings.')) {
      const subPath = dotPath.substring('imageSettings.'.length);
      const toggleRule = this.getRule(`settingsToggles.${subPath}`);
      if (toggleRule) return toggleRule;
    }
    return null;
  },

  isVisible(el) {
    if (!el) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch (_) {
      return false;
    }
  },

  /**
   * Query single visible element using a rule path or direct CSS selector
   */
  query(selectorOrRuleKey, context = document) {
    const elements = this.queryAll(selectorOrRuleKey, context);
    return elements.length > 0 ? elements[0] : null;
  },

  /**
   * Query all visible elements matching rule path or selector.
   * Supports:
   * - standard CSS selectors (e.g. `button.settings-trigger-button`)
   * - `icon:<name>` (e.g. `icon:videocam` matches Material Icon ligature name)
   * - `text:<val>` (e.g. `text:720p` matches digits/values universally)
   */
  queryAll(selectorOrRuleKey, context = document) {
    let rawSelector = this.getRule(selectorOrRuleKey);
    if (!rawSelector || typeof rawSelector !== 'string') {
      rawSelector = selectorOrRuleKey;
    }

    if (!rawSelector || typeof rawSelector !== 'string') return [];

    const root = context || document;
    const parts = rawSelector.split(',').map(s => s.trim()).filter(Boolean);
    const results = [];
    const seen = new Set();

    for (const part of parts) {
      try {
        if (part.startsWith('icon:')) {
          const iconName = part.slice(5).trim();
          const icons = Array.from(root.querySelectorAll('mat-icon')).filter(el => this.isVisible(el));
          for (const ic of icons) {
            if ((ic.textContent || '').trim() === iconName) {
              const btn = ic.closest('button, [role="button"], [role="radio"], [role="tab"], mat-list-item, mat-button-toggle') || ic;
              if (this.isVisible(btn) && !seen.has(btn)) {
                seen.add(btn);
                results.push(btn);
              }
            }
          }
        } else if (part.startsWith('text:')) {
          const targetText = part.slice(5).trim().toLowerCase();
          const candidates = Array.from(root.querySelectorAll('button, [role="button"], mat-list-item, [role="tab"], [role="option"], [role="listitem"], a, span, div')).filter(el => this.isVisible(el));
          for (const cand of candidates) {
            const text = (cand.textContent || '').trim().toLowerCase();
            if (text === targetText || (text.includes(targetText) && cand.matches('button, [role="button"], mat-list-item, [role="tab"], [role="option"], [role="listitem"], a'))) {
              const btn = cand.closest('button, [role="button"], mat-list-item, [role="tab"], [role="option"], [role="listitem"], a') || cand;
              if (this.isVisible(btn) && !seen.has(btn)) {
                seen.add(btn);
                results.push(btn);
              }
            }
          }
        } else {
          // Standard CSS selector (tag name, class name, attributes)
          const matched = Array.from(root.querySelectorAll(part)).filter(el => this.isVisible(el));
          for (const m of matched) {
            if (!seen.has(m)) {
              seen.add(m);
              results.push(m);
            }
          }
        }
      } catch (err) {
        // Ignore individual invalid selector syntax and continue to next fallback
      }
    }

    return results;
  },

  /**
   * Find toggle button within a toggle group by category and target option.
   * Priority:
   * 1. Check rule defined at `settingsToggles.<category>.<optionKey>` or `.options.<optionKey>`
   * 2. Search inside the toggle group by Material Icon ligature
   * 3. Search inside the toggle group by numerical text/keyword
   * 4. Positional fallback (index 0, 1, 2...)
   */
  findToggleOption(groupCategory, optionKey, context = document) {
    const groupRuleKey = `settingsToggles.${groupCategory}.group`;
    const group = this.query(groupRuleKey, context);
    const searchRoot = group || context || document;

    // 1. Check rule for this specific option key
    const directRule = this.getRule(`settingsToggles.${groupCategory}.options.${optionKey}`) ||
                       this.getRule(`settingsToggles.${groupCategory}.${optionKey}`);
    if (directRule) {
      const match = this.query(directRule, searchRoot);
      if (match) return match.closest('button') || match;
    }

    // 2. Search all clickable toggles in the group
    const toggles = Array.from(
      searchRoot.querySelectorAll('mat-button-toggle button, mat-button-toggle, button, [role="radio"]')
    ).filter(el => this.isVisible(el));

    const clean = String(optionKey || '').trim().toLowerCase();

    // 3. Try match by icon name (Material Icon ligature)
    const iconMatch = toggles.find(btn => {
      const icon = (btn.querySelector('mat-icon')?.textContent || '').trim().toLowerCase();
      return icon === clean;
    });
    if (iconMatch) return iconMatch.closest('button') || iconMatch;

    // 4. Positional index mapping (100% deterministic, independent of language)
    const indexMaps = {
      mode: { image: 0, video: 1 },
      videoType: { frames: 0, ingredients: 1 },
      aspectRatio: { '16:9': 0, '4:3': 1, '1:1': 2, '3:4': 3, '9:16': 4 },
      resolution: { '360p': 0, '720p': 1 },
      duration: { '4': 0, '4s': 0, '6': 1, '6s': 1, '8': 2, '8s': 2, '10': 3, '10s': 3 },
      count: { 'x1': 0, '1': 0, 'x2': 1, '2': 1, 'x3': 2, '3': 2, 'x4': 3, '4': 3 }
    };

    const categoryMap = indexMaps[groupCategory];
    if (categoryMap && categoryMap[clean] !== undefined) {
      const targetIdx = categoryMap[clean];
      if (toggles[targetIdx]) {
        return toggles[targetIdx].closest('button') || toggles[targetIdx];
      }
    }

    return null;
  }
};

// Export globally for content script
window.DomRuleEngine = DomRuleEngine;
window.syncDomRules = syncDomRules;
