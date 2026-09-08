/**
 * Google Flow DOM Element Inspector & Rule Synchronizer
 * Allows interactive inspection, hierarchy calculation (root > child > element),
 * visual previewing, testing, and 1-click synchronization to the Flow Worker server.
 */

(function () {
  if (window.__flowInspectorLoaded) return;
  window.__flowInspectorLoaded = true;

  // ── Element Catalog with Visual Illustrations & Descriptions ───────────────
  const ELEMENT_CATALOG = [
    {
      category: 'Mode Switch & Common Controls',
      items: [
        {
          key: 'settingsTrigger.button',
          name: 'Settings Trigger Button',
          desc: 'Pill button at bottom-right of prompt bar (opens settings popover)',
          icon: 'tune',
          defaultSelector: 'button.settings-trigger-button:not([hidden]), flow-base-prompt-box button.settings-trigger-button, .settings-summary'
        },
        {
          key: 'settingsToggles.mode.image',
          name: 'Mode: Image',
          desc: 'Toggle button "Image" (image icon) in settings popover',
          icon: 'image',
          badge: 'Image',
          defaultSelector: 'icon:image, flow-prompt-box-settings flow-toggles:first-of-type mat-button-toggle:nth-of-type(1) button'
        },
        {
          key: 'settingsToggles.mode.video',
          name: 'Mode: Video',
          desc: 'Toggle button "Video" (videocam icon) in settings popover',
          icon: 'videocam',
          badge: 'Video',
          defaultSelector: 'icon:videocam, flow-prompt-box-settings flow-toggles:first-of-type mat-button-toggle:nth-of-type(2) button'
        },
        {
          key: 'agentModeChip.chip',
          name: 'Agent Mode Chip',
          desc: 'Toggle chip for Creative Agent in the prompt bar',
          icon: 'smart_toy',
          badge: 'Agent',
          defaultSelector: 'flow-agent-mode-toggle-chip button.agent-mode-chip, button.agent-mode-chip'
        }
      ]
    },
    {
      category: 'Image Mode Settings (Pop-over)',
      items: [
        {
          key: 'imageSettings.aspectRatio.options.16:9',
          name: 'Image Ratio 16:9',
          desc: 'Widescreen 16:9 ratio in image settings',
          icon: 'crop_16_9',
          badge: '16:9',
          defaultSelector: 'icon:crop_16_9, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(1) button'
        },
        {
          key: 'imageSettings.aspectRatio.options.4:3',
          name: 'Image Ratio 4:3',
          desc: 'Standard 4:3 ratio in image settings',
          icon: 'crop_landscape',
          badge: '4:3',
          defaultSelector: 'icon:crop_landscape, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(2) button'
        },
        {
          key: 'imageSettings.aspectRatio.options.1:1',
          name: 'Image Ratio 1:1',
          desc: 'Square 1:1 ratio in image settings',
          icon: 'crop_square',
          badge: '1:1',
          defaultSelector: 'icon:crop_square, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(3) button'
        },
        {
          key: 'imageSettings.aspectRatio.options.3:4',
          name: 'Image Ratio 3:4',
          desc: 'Portrait 3:4 ratio in image settings',
          icon: 'crop_portrait',
          badge: '3:4',
          defaultSelector: 'icon:crop_portrait, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(4) button'
        },
        {
          key: 'imageSettings.aspectRatio.options.9:16',
          name: 'Image Ratio 9:16',
          desc: 'Vertical 9:16 portrait ratio in image settings',
          icon: 'crop_9_16',
          badge: '9:16',
          defaultSelector: 'icon:crop_9_16, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(5) button'
        },
        {
          key: 'imageSettings.modelDropdown.button',
          name: 'Image Model Selector',
          desc: 'Dropdown button displaying active Image model (e.g. Nano Banana Pro)',
          icon: 'category',
          badge: 'Model',
          defaultSelector: 'button:has(.model-select-trigger-content), flow-prompt-box-settings button.mat-mdc-menu-trigger, .model-select-trigger-content'
        },
        {
          key: 'imageSettings.count.options.x1',
          name: 'Image Outputs x1',
          desc: 'Generate 1 image per job (toggle group 3, button #1)',
          icon: 'filter_1',
          badge: 'x1',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(1) button'
        },
        {
          key: 'imageSettings.count.options.x2',
          name: 'Image Outputs x2',
          desc: 'Generate 2 images per job (toggle group 3, button #2)',
          icon: 'filter_1',
          badge: 'x2',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(2) button'
        },
        {
          key: 'imageSettings.count.options.x3',
          name: 'Image Outputs x3',
          desc: 'Generate 3 images per job (toggle group 3, button #3)',
          icon: 'filter_1',
          badge: 'x3',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(3) button'
        },
        {
          key: 'imageSettings.count.options.x4',
          name: 'Image Outputs x4',
          desc: 'Generate 4 images per job (toggle group 3, button #4)',
          icon: 'filter_1',
          badge: 'x4',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(4) button'
        },
        {
          key: 'imageSettings.creditCost',
          name: 'Image Credit Cost Label',
          desc: 'Footer indicator displaying credits required for generation',
          icon: 'paid',
          defaultSelector: 'flow-credit-cost-label, .settings-credit-cost, a.credit-cost-link'
        }
      ]
    },
    {
      category: 'Video Mode Settings (Pop-over)',
      items: [
        {
          key: 'videoSettings.videoType.frames',
          name: 'Video Sub-mode: Frames',
          desc: 'Toggle to Frames mode (Start/End frames interpolation)',
          icon: 'crop_free',
          badge: 'Frames',
          defaultSelector: 'icon:crop_free, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(1) button'
        },
        {
          key: 'videoSettings.videoType.ingredients',
          name: 'Video Sub-mode: Ingredients',
          desc: 'Toggle to Ingredients/Assets mode',
          icon: 'chrome_extension',
          badge: 'Assets',
          defaultSelector: 'icon:chrome_extension, flow-prompt-box-settings flow-toggles:nth-of-type(2) mat-button-toggle:nth-of-type(2) button'
        },
        {
          key: 'videoSettings.aspectRatio.options.16:9',
          name: 'Video Ratio 16:9',
          desc: 'Landscape 16:9 ratio in video settings',
          icon: 'crop_16_9',
          badge: '16:9',
          defaultSelector: 'icon:crop_16_9, flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(1) button'
        },
        {
          key: 'videoSettings.aspectRatio.options.9:16',
          name: 'Video Ratio 9:16',
          desc: 'Vertical 9:16 portrait ratio in video settings',
          icon: 'crop_9_16',
          badge: '9:16',
          defaultSelector: 'icon:crop_9_16, flow-prompt-box-settings flow-toggles:nth-of-type(3) mat-button-toggle:nth-of-type(2) button'
        },
        {
          key: 'videoSettings.modelDropdown.button',
          name: 'Video Model Selector',
          desc: 'Dropdown button displaying active Video model (e.g. Omni 1.1 Flash / Veo)',
          icon: 'category',
          badge: 'Model',
          defaultSelector: 'button:has(.model-select-trigger-content), flow-prompt-box-settings button.mat-mdc-menu-trigger, .model-select-trigger-content'
        },
        {
          key: 'videoSettings.resolution.options.360p',
          name: 'Resolution 360p',
          desc: 'Toggle 360p video quality (toggle group 4, button #1)',
          icon: 'sd',
          badge: '360p',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(4) mat-button-toggle:nth-of-type(1) button'
        },
        {
          key: 'videoSettings.resolution.options.720p',
          name: 'Resolution 720p',
          desc: 'Toggle 720p video quality (toggle group 4, button #2)',
          icon: 'hd',
          badge: '720p',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(4) mat-button-toggle:nth-of-type(2) button'
        },
        {
          key: 'videoSettings.duration.options.4s',
          name: 'Duration 4s',
          desc: 'Toggle 4-second duration (toggle group 5, button #1)',
          icon: 'timer',
          badge: '4s',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(1) button'
        },
        {
          key: 'videoSettings.duration.options.6s',
          name: 'Duration 6s',
          desc: 'Toggle 6-second duration (toggle group 5, button #2)',
          icon: 'timer',
          badge: '6s',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(2) button'
        },
        {
          key: 'videoSettings.duration.options.8s',
          name: 'Duration 8s',
          desc: 'Toggle 8-second duration (toggle group 5, button #3)',
          icon: 'timer',
          badge: '8s',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(3) button'
        },
        {
          key: 'videoSettings.duration.options.10s',
          name: 'Duration 10s',
          desc: 'Toggle 10-second duration (toggle group 5, button #4)',
          icon: 'timer',
          badge: '10s',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(5) mat-button-toggle:nth-of-type(4) button'
        },
        {
          key: 'videoSettings.count.options.x1',
          name: 'Video Outputs x1',
          desc: 'Toggle x1 video output multiplier (toggle group 6, button #1)',
          icon: 'filter_1',
          badge: 'x1',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(6) mat-button-toggle:nth-of-type(1) button, flow-prompt-box-settings flow-toggles:last-of-type mat-button-toggle:nth-of-type(1) button'
        },
        {
          key: 'videoSettings.count.options.x2',
          name: 'Video Outputs x2',
          desc: 'Toggle x2 video output multiplier (toggle group 6, button #2)',
          icon: 'filter_1',
          badge: 'x2',
          defaultSelector: 'flow-prompt-box-settings flow-toggles:nth-of-type(6) mat-button-toggle:nth-of-type(2) button, flow-prompt-box-settings flow-toggles:last-of-type mat-button-toggle:nth-of-type(2) button'
        },
        {
          key: 'videoSettings.creditCost',
          name: 'Video Credit Cost Label',
          desc: 'Footer indicator displaying credits required for video generation',
          icon: 'paid',
          defaultSelector: 'flow-credit-cost-label, .settings-credit-cost, a.credit-cost-link'
        }
      ]
    },
    {
      category: 'Model Menu Overlay',
      items: [
        {
          key: 'modelDropdown.menuPanel',
          name: 'Model Menu Panel',
          desc: 'Popup menu container showing list of available AI models',
          icon: 'category',
          defaultSelector: '.mat-mdc-menu-panel, [role="menu"]'
        },
        {
          key: 'modelDropdown.menuItem',
          name: 'Model Menu Item',
          desc: 'Individual model option item in the dropdown menu',
          icon: 'arrow_forward',
          defaultSelector: '.mat-mdc-menu-panel [role="menuitem"], button.mat-mdc-menu-item, mat-list-item'
        }
      ]
    },
    {
      category: 'Account & Credits Check',
      items: [
        {
          key: 'accountCredits.avatarButton',
          name: 'Account Avatar Button',
          desc: 'Top header profile/avatar icon to open account info and check credits',
          icon: 'account_circle',
          badge: 'Profile',
          defaultSelector: '.header-user-button, flow-header-user-icon [role="button"], flow-header-user-icon button, flow-header-user-icon'
        },
        {
          key: 'accountCredits.panel',
          name: 'Account Slide-out Panel',
          desc: 'Overlay drawer displaying user account details, quota, and credits',
          icon: 'account_circle',
          defaultSelector: 'flow-account-panel, .flow-account-panel-overlay'
        },
        {
          key: 'accountCredits.creditsCount',
          name: 'Credit Balance Text',
          desc: 'Element showing remaining Google Flow credits (e.g. "38 Google Flow credits")',
          icon: 'paid',
          badge: 'Credits',
          defaultSelector: 'span.credits-count, .credits-count, .credits-link .credits-count, a.credits-link span'
        },
        {
          key: 'accountCredits.closeButton',
          name: 'Close Account Panel Button',
          desc: 'Button to close the account slide-out drawer',
          icon: 'close',
          defaultSelector: 'flow-account-panel button[aria-label="Close account panel"], flow-account-panel .close-btn, flow-account-panel button:has(mat-icon)'
        }
      ]
    },
    {
      category: 'Video Frames (Frame Mode)',
      items: [
        {
          key: 'framesWidget.startSlot',
          name: 'Start Frame Slot',
          desc: 'First image frame slot on the ingredient bar',
          icon: 'crop_portrait',
          badge: 'Start',
          defaultSelector: '.prompt-ingredient-bar .frame-trigger:first-of-type button, flow-ingredient-bar .frame-trigger:first-of-type button'
        },
        {
          key: 'framesWidget.endSlot',
          name: 'End Frame Slot',
          desc: 'Second image frame slot on the ingredient bar',
          icon: 'crop_portrait',
          badge: 'End',
          defaultSelector: '.prompt-ingredient-bar .frame-trigger:last-of-type button, flow-ingredient-bar .frame-trigger:last-of-type button'
        },
        {
          key: 'framesWidget.swapButton',
          name: 'Swap Frames Button',
          desc: 'Arrow button to swap Start and End frames',
          icon: 'swap_horiz',
          defaultSelector: 'icon:swap_horiz, flow-ingredient-bar button:has(mat-icon)'
        }
      ]
    },
    {
      category: 'Media & Uploads (Add Menu)',
      items: [
        {
          key: 'addMenu.trigger',
          name: 'Add Ingredient Button (+)',
          desc: 'Plus button on the left of prompt input to open media drawer',
          icon: 'add',
          badge: '+',
          defaultSelector: 'flow-base-prompt-box button.add-menu-trigger, button.add-menu-trigger'
        },
        {
          key: 'addMenu.uploadsTab',
          name: 'Uploads Tab',
          desc: '"Uploads" item in the left menu of the media drawer',
          icon: 'drive_folder_upload',
          badge: 'Uploads',
          defaultSelector: 'icon:drive_folder_upload, flow-add-menu-side-nav mat-list-item:last-of-type'
        },
        {
          key: 'addMenu.uploadButton',
          name: 'Upload Content Button',
          desc: 'Footer button in drawer menu to upload local files',
          icon: 'upload',
          badge: 'Upload',
          defaultSelector: 'button.sidebar-upload-btn, .sidebar-footer button, icon:upload'
        },
        {
          key: 'addMenu.addToPromptButton',
          name: 'Add to Prompt Button',
          desc: 'Confirmation button in detail pane to attach selected media to prompt',
          icon: 'playlist_add',
          badge: 'Add',
          defaultSelector: 'flow-add-menu-detail-pane button.detail-add-to-prompt-btn, button.detail-add-to-prompt-btn'
        }
      ]
    },
    {
      category: 'Prompt & Generate',
      items: [
        {
          key: 'promptInput.editor',
          name: 'Prompt Editor Input',
          desc: 'ProseMirror contenteditable editor for prompt text',
          icon: 'edit_note',
          defaultSelector: 'flow-rich-text-editor.prompt-input .ProseMirror, flow-base-prompt-box .ProseMirror'
        },
        {
          key: 'generateButton.button',
          name: 'Generate Button',
          desc: 'Submit arrow button to generate image or video',
          icon: 'arrow_forward',
          badge: 'Submit',
          defaultSelector: 'flow-generate-icon-button button.generate-icon-button, button.generate-icon-button, icon:arrow_forward'
        }
      ]
    },
    {
      category: 'Dashboard & Navigation',
      items: [
        {
          key: 'dashboard.newProjectButton',
          name: 'New Project Button',
          desc: 'Button or card to create a new project on Flow dashboard',
          icon: 'add',
          badge: 'Project',
          defaultSelector: 'button.create-project-card, .create-project-card, .new-project-card, a[href*="/project/new"], button:has(mat-icon.flow-icon-l)'
        },
        {
          key: 'dashboard.projectCard',
          name: 'Project Card',
          desc: 'Existing project link or card on dashboard grid',
          icon: 'folder',
          badge: 'Card',
          defaultSelector: 'a[href*="/project/"], .project-card, div[role="button"]'
        },
        {
          key: 'navigation.categoryTabImage',
          name: 'Left Nav: Image Tab',
          desc: 'Sidebar icon or tab to switch into Image mode',
          icon: 'image',
          badge: 'Nav Image',
          defaultSelector: 'icon:image, nav a, nav button, [role="tab"]'
        },
        {
          key: 'navigation.categoryTabVideo',
          name: 'Left Nav: Video Tab',
          desc: 'Sidebar icon or tab to switch into Video mode',
          icon: 'videocam',
          badge: 'Nav Video',
          defaultSelector: 'icon:videocam, nav a, nav button, [role="tab"]'
        },
        {
          key: 'dashboard.projectDeleteButton',
          name: 'Project Delete Button',
          desc: 'Delete option in project context menu',
          icon: 'delete',
          badge: 'Delete',
          defaultSelector: '[role="menuitem"], button'
        },
        {
          key: 'dashboard.confirmDeleteDialog',
          name: 'Confirm Delete Button',
          desc: 'Confirmation button in delete project dialog',
          icon: 'delete',
          badge: 'Confirm',
          defaultSelector: 'mat-dialog-container button.mat-primary, mat-dialog-actions button:last-of-type, .mat-mdc-dialog-actions button:last-of-type'
        }
      ]
    },
    {
      category: 'Overlays & Dialogs',
      items: [
        {
          key: 'overlays.backdrop',
          name: 'Overlay Backdrop',
          desc: 'Dark backdrop behind modal popovers and panels',
          icon: 'close',
          badge: 'Backdrop',
          defaultSelector: '.cdk-overlay-backdrop, .flow-account-panel-overlay'
        },
        {
          key: 'overlays.closeButton',
          name: 'Overlay Close Button',
          desc: 'Close button (✕) on slide-out drawers, account panels and dialogs',
          icon: 'close',
          badge: 'Close',
          defaultSelector: 'button[aria-label*="close" i], button[aria-label*="đóng" i], button.close-btn, flow-account-panel button, [aria-label*="Đóng"]'
        },
        {
          key: 'overlays.dialog',
          name: 'Dialog Container',
          desc: 'Modal dialog container for alerts and confirmations',
          icon: 'category',
          defaultSelector: 'mat-dialog-container, .cdk-overlay-pane [role="dialog"]'
        },
        {
          key: 'overlays.dialogConfirmButton',
          name: 'Dialog Confirm Button',
          desc: 'Action button inside modal dialogs (e.g. credit approval, accept)',
          icon: 'arrow_forward',
          defaultSelector: 'mat-dialog-actions button, .mat-mdc-dialog-actions button, button'
        }
      ]
    },
    {
      category: 'Uploads & File Management',
      items: [
        {
          key: 'upload.fileInput',
          name: 'Upload File Input',
          desc: 'Hidden or visible HTML input[type=file] for uploading reference images',
          icon: 'upload',
          badge: 'File Input',
          defaultSelector: 'input[type="file"]'
        },
        {
          key: 'upload.drawer',
          name: 'Media Picker Drawer',
          desc: 'Slide-out drawer container for browsing and selecting uploaded media',
          icon: 'drive_folder_upload',
          badge: 'Drawer',
          defaultSelector: 'flow-add-menu-popover-content, .add-menu-popover-container, flow-add-menu-detail-pane, .cdk-overlay-pane'
        },
        {
          key: 'upload.drawerCloseButton',
          name: 'Close Drawer Button',
          desc: 'Close button on media picker drawer',
          icon: 'close',
          defaultSelector: 'flow-add-menu-popover-content button[aria-label*="đóng" i], button[aria-label*="đóng" i], button[aria-label*="close" i], button.close-button, [aria-label*="Hủy" i], [aria-label*="Cancel" i]'
        },
        {
          key: 'upload.progressSpinner',
          name: 'Upload Progress Spinner',
          desc: 'Loading spinner or progress bar indicating file is uploading/processing',
          icon: 'sync',
          badge: 'Spinner',
          defaultSelector: 'flow-media-upload mat-spinner, flow-media-upload mat-progress-spinner, flow-media-upload [role="progressbar"], flow-add-menu-asset-list mat-spinner, flow-add-menu-asset-list mat-progress-spinner, flow-add-menu-asset-list [role="progressbar"], .asset-list-viewport mat-spinner, .asset-list-viewport mat-progress-spinner, [class*="upload-progress"], [class*="spinner"]'
        },
        {
          key: 'upload.searchInput',
          name: 'Media Search Box',
          desc: 'Search filter input inside media picker drawer',
          icon: 'search',
          defaultSelector: '.search-header input.search-input, input.search-input, input[placeholder*="Tìm kiếm" i]'
        },
        {
          key: 'upload.ingredientChips',
          name: 'Ingredient Chips in Prompt',
          desc: 'Attached image chips / pills inside the prompt box',
          icon: 'playlist_add',
          badge: 'Chips',
          defaultSelector: 'flow-image-ingredient-chip, [class*="ingredient-chip"], [class*="ingredient"]'
        },
        {
          key: 'upload.dropTargets',
          name: 'Prompt Drop Target',
          desc: 'Drop target container for Drag & Drop files into prompt box',
          icon: 'edit_note',
          defaultSelector: '.prosemirror-editor, .ProseMirror, flow-base-prompt-box, [aria-label*="bắt đầu" i], div[class*="start-frame"], .prompt-box, flow-agent-panel, flow-agent-panel .ProseMirror, [class*="drop-media"]'
        }
      ]
    },
    {
      category: 'Generated Media Output',
      items: [
        {
          key: 'mediaOutput.canvasImage',
          name: 'Center Canvas Image (/edit/)',
          desc: 'Main generated image displayed on center canvas in /edit/ view',
          icon: 'image',
          badge: 'Canvas',
          defaultSelector: 'flow-media-view img, flow-canvas img, .canvas-container img, flow-editor img, [class*="canvas"] img, [class*="media"] img'
        },
        {
          key: 'mediaOutput.galleryImage',
          name: 'Gallery Tile Image',
          desc: 'Newly generated image tile on project canvas or gallery grid',
          icon: 'image',
          badge: 'Gallery',
          defaultSelector: 'flow-a2ui-image-option img, img.image-thumbnail, a2ui-surface img, flow-image-tile img, [data-testid*="image"] img'
        },
        {
          key: 'mediaOutput.generatedVideo',
          name: 'Generated Video Element',
          desc: 'Video player or download link for completed video generation',
          icon: 'videocam',
          badge: 'Video Out',
          defaultSelector: 'video, flow-video-tile video, [class*="video"] video, a[href*=".mp4"], a[href*="/video/"]'
        }
      ]
    }
  ];

  // SVG Icon Map for High Quality Illustration
  const SVG_ICONS = {
    tune: '<svg viewBox="0 0 24 24"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>',
    videocam: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
    image: '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
    smart_toy: '<svg viewBox="0 0 24 24"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zm-2 10H6V7h12v12zm-9-6c-.83 0-1.5-.67-1.5-1.5S8.17 10 9 10s1.5.67 1.5 1.5S9.83 13 9 13zm6 0c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13zm-8 3h10v2H7v-2z"/></svg>',
    crop_portrait: '<svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7V5h10v14z"/></svg>',
    swap_horiz: '<svg viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>',
    crop_free: '<svg viewBox="0 0 24 24"><path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/></svg>',
    chrome_extension: '<svg viewBox="0 0 24 24"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/></svg>',
    crop_9_16: '<svg viewBox="0 0 24 24"><path d="M16 3H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H8V5h8v14z"/></svg>',
    crop_16_9: '<svg viewBox="0 0 24 24"><path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z"/></svg>',
    crop_landscape: '<svg viewBox="0 0 24 24"><path d="M19 5H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 12H5V7h14v10z"/></svg>',
    crop_square: '<svg viewBox="0 0 24 24"><path d="M18 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H6V6h12v12z"/></svg>',
    hd: '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 12H9.5v-2h-2v2H6V9h1.5v2.5h2V9H11v6zm7-1c0 .55-.45 1-1 1h-4V9h4c.55 0 1 .45 1 1v4zm-1.5-.5v-3h-2v3h2z"/></svg>',
    sd: '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 9H7V9.5h3v-1H6V12h3v1.5H6V15h4v-3zm7 2c0 .55-.45 1-1 1h-4V9h4c.55 0 1 .45 1 1v4zm-1.5-.5v-3h-2v3h2z"/></svg>',
    timer: '<svg viewBox="0 0 24 24"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>',
    filter_1: '<svg viewBox="0 0 24 24"><path d="M3 5H1v16c0 1.1.9 2 2 2h16v-2H3V5zm11 10h2V5h-4v2h2v8zm7-14H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 16H7V3h14v14z"/></svg>',
    add: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    drive_folder_upload: '<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10zm-8-3l3-3h-2v-3h-2v3H9l3 3z"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>',
    playlist_add: '<svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>',
    edit_note: '<svg viewBox="0 0 24 24"><path d="M3 10h11v2H3v-2zm0-2h11V6H3v2zm0 8h7v-2H3v2zm15.01-3.13l.71-.71c.39-.39 1.02-.39 1.41 0l.71.71c.39.39.39 1.02 0 1.41l-.71.71-2.12-2.12zm-.71.71l-5.3 5.3V21h2.12l5.3-5.3-2.12-2.12z"/></svg>',
    arrow_forward: '<svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>',
    account_circle: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>',
    paid: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-1c-1.1 0-2-.9-2-2h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1-2-.9-2-2 .9-2 2-2V7h2v1c1.1 0 2 .9 2 2h-2c0-.55-.45-1-1-1s-1 .45-1 1 .45 1 1 1 2 .9 2 2-.9 2-2 2v1z"/></svg>',
    category: '<svg viewBox="0 0 24 24"><path d="M12 2l-5.5 9h11zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm-11 0c-2.49 0-4.5 2.01-4.5 4.5S4.01 22 6.5 22s4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    arrow_drop_down: '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
    delete: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
    sync: '<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>'
  };

  // ── State ──────────────────────────────────────────────────────────────────
  let activeInspectingItemKey = null;
  let hoveredElement = null;
  let isSidebarOpen = false;
  let currentRules = {};

  // ── Initialize Inspector UI ────────────────────────────────────────────────
  function initInspector() {
    createLauncherButton();
    createOverlayElements();
    createSidebar();
    loadCurrentRules();
  }

  // ── 1. Create Launcher Floating Pill ───────────────────────────────────────
  function createLauncherButton() {
    if (document.getElementById('flow-inspector-launcher')) return;
    const launcher = document.createElement('div');
    launcher.id = 'flow-inspector-launcher';
    launcher.innerHTML = `
      <div class="fi-launcher-icon">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
      </div>
      <span>Flow Inspector</span>
    `;
    launcher.addEventListener('click', toggleSidebar);
    document.body.appendChild(launcher);
  }

  // ── 2. Create Overlay Highlighters & Top Floating Inspect Banner ───────────
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  async function openSettingsPopover() {
    let settingsPanel = document.querySelector('flow-prompt-box-settings, .cdk-overlay-pane flow-prompt-box-settings');
    if (!settingsPanel || !isVisible(settingsPanel)) {
      const trigger = document.querySelector(
        'button.settings-trigger-button:not([hidden]), flow-base-prompt-box button.settings-trigger-button, .settings-summary, button:has(.settings-summary)'
      );
      if (trigger) {
        trigger.click();
        await new Promise(r => setTimeout(r, 350));
      }
    }
  }

  async function ensureModeSelected(mode = 'image') {
    await openSettingsPopover();
    let settingsPanel = document.querySelector('flow-prompt-box-settings, .cdk-overlay-pane flow-prompt-box-settings');
    if (!settingsPanel) return;
    const modeToggles = Array.from(settingsPanel.querySelectorAll('flow-toggles:first-of-type mat-button-toggle'));
    if (!modeToggles.length) return;
    const targetToggle = mode === 'image' ? modeToggles[0] : modeToggles[1];
    if (targetToggle) {
      const btn = targetToggle.querySelector('button') || targetToggle;
      const isChecked = targetToggle.classList.contains('mat-button-toggle-checked') || btn.getAttribute('aria-checked') === 'true';
      if (!isChecked) {
        btn.click();
        await new Promise(r => setTimeout(r, 250));
      }
    }
  }

  async function openAccountPanel() {
    let panel = document.querySelector('flow-account-panel');
    if (!panel || !isVisible(panel)) {
      const avatarBtn = document.querySelector('.header-user-button, flow-header-user-icon [role="button"], flow-header-user-icon button, flow-header-user-icon');
      if (avatarBtn) {
        avatarBtn.click();
        await new Promise(r => setTimeout(r, 450));
      }
    }
  }

  async function openModelDropdown() {
    await openSettingsPopover();
    let menu = document.querySelector('.mat-mdc-menu-panel, [role="menu"]');
    if (!menu || !isVisible(menu)) {
      const trigger = document.querySelector('button:has(.model-select-trigger-content), flow-prompt-box-settings button.mat-mdc-menu-trigger, .model-select-trigger-content');
      if (trigger) {
        trigger.click();
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  async function openAddMenuDrawer() {
    let drawer = document.querySelector('flow-add-menu-popover-content, .add-menu-popover-container');
    if (!drawer || !isVisible(drawer)) {
      const trigger = document.querySelector('flow-add-menu button.add-menu-trigger, button.add-menu-trigger');
      if (trigger) {
        trigger.click();
        await new Promise(r => setTimeout(r, 350));
      }
    }
  }

  async function ensurePopoverOpenForItem(itemKey) {
    const reopenBtn = document.getElementById('fi-btn-reopen-popover');
    if (itemKey.startsWith('imageSettings.')) {
      if (reopenBtn) {
        reopenBtn.style.display = 'inline-flex';
        reopenBtn.textContent = '🖼️ Switch to Image Settings';
        reopenBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await ensureModeSelected('image');
        };
      }
      await ensureModeSelected('image');
    } else if (itemKey.startsWith('videoSettings.')) {
      if (reopenBtn) {
        reopenBtn.style.display = 'inline-flex';
        reopenBtn.textContent = '🎬 Switch to Video Settings';
        reopenBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await ensureModeSelected('video');
        };
      }
      await ensureModeSelected('video');
    } else if (itemKey.startsWith('settingsToggles.mode.') || itemKey.startsWith('settingsTrigger.')) {
      if (reopenBtn) {
        reopenBtn.style.display = 'inline-flex';
        reopenBtn.textContent = '⚙️ Re-open Settings';
        reopenBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await openSettingsPopover();
        };
      }
      await openSettingsPopover();
    } else if (itemKey.startsWith('modelDropdown.')) {
      if (reopenBtn) {
        reopenBtn.style.display = 'inline-flex';
        reopenBtn.textContent = '🤖 Open Model Menu';
        reopenBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await openModelDropdown();
        };
      }
      await openModelDropdown();
    } else if (itemKey.startsWith('accountCredits.') && itemKey !== 'accountCredits.avatarButton') {
      if (reopenBtn) {
        reopenBtn.style.display = 'inline-flex';
        reopenBtn.textContent = '👤 Open Account Panel';
        reopenBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await openAccountPanel();
        };
      }
      await openAccountPanel();
    } else if (itemKey.startsWith('addMenu.') && itemKey !== 'addMenu.trigger') {
      if (reopenBtn) {
        reopenBtn.style.display = 'inline-flex';
        reopenBtn.textContent = '➕ Re-open Add Menu';
        reopenBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await openAddMenuDrawer();
        };
      }
      await openAddMenuDrawer();
    } else {
      if (reopenBtn) reopenBtn.style.display = 'none';
    }
  }

  function createOverlayElements() {
    if (!document.getElementById('flow-inspector-overlay-box')) {
      const box = document.createElement('div');
      box.id = 'flow-inspector-overlay-box';
      box.style.display = 'none';
      document.body.appendChild(box);
    }
    if (!document.getElementById('flow-inspector-tooltip')) {
      const tooltip = document.createElement('div');
      tooltip.id = 'flow-inspector-tooltip';
      tooltip.style.display = 'none';
      document.body.appendChild(tooltip);
    }
    if (!document.getElementById('fi-inspect-banner')) {
      const banner = document.createElement('div');
      banner.id = 'fi-inspect-banner';
      banner.className = 'fi-inspect-banner';
      banner.innerHTML = `
        <div class="fi-inspect-banner-content">
          <span class="fi-inspect-badge-dot"></span>
          <span>🎯 Inspecting: <b id="fi-inspecting-item-name" style="color:#ff5e82">...</b> <span class="fi-inspect-hint">(Hold Shift to click/navigate, Click element to select)</span></span>
        </div>
        <button class="fi-inspect-banner-btn" id="fi-btn-reopen-popover" style="display:none;"></button>
        <button class="fi-inspect-banner-cancel" id="fi-btn-cancel-inspect">Cancel</button>
      `;
      document.body.appendChild(banner);
      document.getElementById('fi-btn-cancel-inspect').addEventListener('click', cancelInspectionMode);

      ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(evt => {
        banner.addEventListener(evt, e => e.stopPropagation());
      });
    }
  }

  // ── 3. Create Sidebar Panel ────────────────────────────────────────────────
  function createSidebar() {
    if (document.getElementById('flow-inspector-sidebar')) return;
    const sidebar = document.createElement('div');
    sidebar.id = 'flow-inspector-sidebar';
    sidebar.className = 'fi-hidden';

    sidebar.innerHTML = `
      <div class="fi-header">
        <div class="fi-title-box">
          <span class="fi-title">Flow DOM Inspector</span>
          <span class="fi-version-badge" id="fi-rules-version">v5</span>
        </div>
        <div class="fi-header-actions">
          <button class="fi-icon-btn" id="fi-btn-collapse" title="Collapse right sidebar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </button>
          <button class="fi-icon-btn" id="fi-btn-refresh" title="Sync rules from Worker">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </button>
          <button class="fi-icon-btn" id="fi-btn-close" title="Close Inspector">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>

      <div class="fi-search-box">
        <input type="text" class="fi-search-input" id="fi-search-input" placeholder="🔍 Search element to inspect...">
      </div>

      <div class="fi-body" id="fi-catalog-body">
        <!-- Elements will be rendered here dynamically -->
      </div>

      <div class="fi-footer">
        <div class="fi-footer-buttons">
          <button class="fi-btn fi-btn-sync" id="fi-btn-sync-worker">
            <span>🔄 Sync to Worker</span>
          </button>
          <button class="fi-btn fi-btn-reset" id="fi-btn-reset-rules">
            <span>↩️ Reset Default</span>
          </button>
        </div>
        <div class="fi-status-bar">
          <span id="fi-status-msg">Ready to inspect and test</span>
          <span id="fi-status-time"></span>
        </div>
      </div>
    `;

    document.body.appendChild(sidebar);

    // Stop propagation on sidebar so clicking buttons inside doesn't trigger outside-click dismiss of Google Flow overlays
    ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(evt => {
      sidebar.addEventListener(evt, (e) => {
        e.stopPropagation();
      });
    });

    // Event listeners
    document.getElementById('fi-btn-close').addEventListener('click', toggleSidebar);
    document.getElementById('fi-btn-collapse').addEventListener('click', toggleSidebar);
    document.getElementById('fi-btn-refresh').addEventListener('click', loadCurrentRules);
    document.getElementById('fi-btn-sync-worker').addEventListener('click', syncRulesToWorker);
    document.getElementById('fi-btn-reset-rules').addEventListener('click', resetRulesToDefaults);
    document.getElementById('fi-search-input').addEventListener('input', filterCatalogItems);
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('flow-inspector-sidebar');
    const launcher = document.getElementById('flow-inspector-launcher');
    if (!sidebar) return;
    isSidebarOpen = !isSidebarOpen;
    if (isSidebarOpen) {
      sidebar.classList.remove('fi-hidden');
      sidebar.classList.remove('fi-inspecting-mode');
      if (launcher) launcher.classList.add('fi-hidden-launcher');
      loadCurrentRules();
    } else {
      sidebar.classList.add('fi-hidden');
      sidebar.classList.remove('fi-inspecting-mode');
      if (launcher) launcher.classList.remove('fi-hidden-launcher');
      cancelInspectionMode();
    }
  }

  // ── 4. Render Catalog Elements ─────────────────────────────────────────────
  function renderCatalog(filterText = '') {
    const body = document.getElementById('fi-catalog-body');
    if (!body) return;
    body.innerHTML = '';

    const cleanFilter = filterText.toLowerCase().trim();

    ELEMENT_CATALOG.forEach(section => {
      const filteredItems = section.items.filter(item => {
        if (!cleanFilter) return true;
        return (
          item.name.toLowerCase().includes(cleanFilter) ||
          item.desc.toLowerCase().includes(cleanFilter) ||
          item.key.toLowerCase().includes(cleanFilter)
        );
      });

      if (filteredItems.length === 0) return;

      const secEl = document.createElement('div');
      secEl.className = 'fi-section';
      secEl.innerHTML = `<div class="fi-section-title">${section.category} (${filteredItems.length})</div>`;

      filteredItems.forEach(item => {
        const currentVal = getRuleValue(item.key) || item.defaultSelector;
        const iconSvg = SVG_ICONS[item.icon] || SVG_ICONS.tune;

        const card = document.createElement('div');
        card.className = 'fi-item-card';
        card.id = `fi-card-${item.key.replace(/[^a-zA-Z0-9]/g, '-')}`;

        card.innerHTML = `
          <div class="fi-item-header">
            <div class="fi-item-illustration" title="${item.name}">
              ${iconSvg}
              ${item.badge ? `<span class="fi-pill-badge">${item.badge}</span>` : ''}
            </div>
            <div class="fi-item-info">
              <div class="fi-item-name">${item.name}</div>
              <div class="fi-item-key">${item.key}</div>
              <div class="fi-item-desc">${item.desc}</div>
            </div>
          </div>

          <div class="fi-item-input-row">
            <input type="text" class="fi-selector-input" id="fi-input-${item.key.replace(/[^a-zA-Z0-9]/g, '-')}" value="${escapeHtml(currentVal)}">
            <button class="fi-btn fi-btn-inspect" data-key="${item.key}" data-name="${item.name}" title="Point and extract class/tag">
              <span>🎯 Inspect</span>
            </button>
            <button class="fi-btn fi-btn-test" data-key="${item.key}" title="Test selector on page">
              <span>👁️ Test</span>
            </button>
          </div>
        `;

        // Bind events
        card.querySelector('.fi-btn-inspect').addEventListener('click', () => {
          startInspectionMode(item.key, item.name);
        });

        card.querySelector('.fi-btn-test').addEventListener('click', async () => {
          const input = card.querySelector('.fi-selector-input');
          await ensurePopoverOpenForItem(item.key);
          setTimeout(() => {
            testSelector(input.value.trim(), item.name);
          }, 200);
        });

        card.querySelector('.fi-selector-input').addEventListener('change', (e) => {
          setRuleValue(item.key, e.target.value.trim());
        });

        secEl.appendChild(card);
      });

      body.appendChild(secEl);
    });
  }

  function filterCatalogItems(e) {
    renderCatalog(e.target.value);
  }

  // ── 5. Helper: Rule Dot-Notation Getter/Setter ──────────────────────────────
  function getRuleValue(keyPath) {
    if (!currentRules || !currentRules.rules) return '';
    const parts = keyPath.split('.');
    let cur = currentRules.rules;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') return '';
      cur = cur[p];
    }
    return typeof cur === 'string' ? cur : '';
  }

  function setRuleValue(keyPath, val) {
    if (!currentRules) currentRules = { version: 5, rules: {} };
    if (!currentRules.rules) currentRules.rules = {};
    const parts = keyPath.split('.');
    let cur = currentRules.rules;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = val;
    updateStatusMsg(`Updated rule [${keyPath}] (not synced)`);
  }

  // ── 6. Structural Hierarchy Selector Generator (root > child > element) ─────
  function generateFlowSelector(target) {
    if (!target || !(target instanceof HTMLElement)) return '';

    // If target is inside inspector UI, ignore
    if (target.closest('#flow-inspector-sidebar, #flow-inspector-launcher')) return '';

    // Direct semantic checks for specialized widgets
    if (target.closest('.model-select-trigger-content, button:has(.model-select-trigger-content)')) {
      return 'button:has(.model-select-trigger-content), flow-prompt-box-settings button.mat-mdc-menu-trigger, .model-select-trigger-content';
    }
    if (target.closest('.credits-count, span.credits-count')) {
      return 'span.credits-count, .credits-count, .credits-link .credits-count';
    }
    if (target.closest('.header-user-button, flow-header-user-icon')) {
      return '.header-user-button, flow-header-user-icon [role="button"], flow-header-user-icon';
    }
    if (target.closest('flow-credit-cost-label, .settings-credit-cost')) {
      return 'flow-credit-cost-label, .settings-credit-cost, a.credit-cost-link';
    }

    // If element contains a material icon, check icon ligature
    const matIcon = target.querySelector('mat-icon') || (target.tagName.toLowerCase() === 'mat-icon' ? target : null);
    const iconName = matIcon ? (matIcon.textContent || '').trim() : '';

    // Find closest recognized Flow Root Container
    const rootCandidates = [
      'flow-prompt-box-settings',
      'flow-base-prompt-box',
      'flow-ingredient-bar',
      'flow-add-menu-side-nav',
      'flow-add-menu-detail-pane',
      'flow-agent-panel',
      'flow-account-panel',
      'flow-header-user-icon',
      '.mat-mdc-menu-panel',
      '.cdk-overlay-pane'
    ];

    let root = null;
    let rootSelector = '';
    for (const cand of rootCandidates) {
      const found = target.closest(cand);
      if (found) {
        root = found;
        rootSelector = cand;
        break;
      }
    }

    // Step 1: Special case for Material Button Toggles
    const toggle = target.closest('mat-button-toggle');
    if (toggle) {
      const group = toggle.closest('flow-toggles, mat-button-toggle-group');
      if (group) {
        const allGroups = root ? Array.from(root.querySelectorAll('flow-toggles')) : [];
        const groupIdx = allGroups.indexOf(group);
        const groupSelector = groupIdx >= 0 ? `flow-toggles:nth-of-type(${groupIdx + 1})` : 'flow-toggles';

        const togglesInGroup = Array.from(group.querySelectorAll('mat-button-toggle'));
        const toggleIdx = togglesInGroup.indexOf(toggle);
        const toggleSelector = `mat-button-toggle:nth-of-type(${toggleIdx + 1}) button`;

        const structuralPath = rootSelector ? `${rootSelector} ${groupSelector} ${toggleSelector}` : `${groupSelector} ${toggleSelector}`;

        if (iconName && iconName.length > 2) {
          return `icon:${iconName}, ${structuralPath}`;
        }
        return structuralPath;
      }
    }

    // Step 2: Semantic class names on target or its direct parent button
    const btn = target.closest('button');
    if (btn) {
      const meaningfulClasses = Array.from(btn.classList).filter(c =>
        !c.startsWith('ng-') &&
        !c.startsWith('mat-') &&
        !c.startsWith('mdc-') &&
        !c.includes('ripple') &&
        !c.includes('focus')
      );

      if (meaningfulClasses.length > 0) {
        const classSel = `button.${meaningfulClasses[0]}`;
        const finalPath = rootSelector ? `${rootSelector} ${classSel}` : classSel;
        if (iconName && iconName.length > 2) {
          return `${finalPath}, icon:${iconName}`;
        }
        return finalPath;
      }
    }

    // Step 3: Compute clean structural hierarchy path (root > child > element)
    const pathParts = [];
    let curr = target;

    while (curr && curr !== root && curr !== document.body) {
      const tag = curr.tagName.toLowerCase();
      // Skip generic layout spans/divs without classes
      if (tag === 'span' && !curr.className) {
        curr = curr.parentElement;
        continue;
      }

      // Check meaningful semantic class
      const validClass = Array.from(curr.classList || []).find(c =>
        c.includes('trigger') ||
        c.includes('slot') ||
        c.includes('chip') ||
        c.includes('editor') ||
        c.includes('item') ||
        c.includes('btn')
      );

      let part = tag;
      if (validClass) {
        part += `.${validClass}`;
      } else if (curr.parentElement) {
        // Positional nth-of-type if siblings of same tag exist
        const siblings = Array.from(curr.parentElement.children).filter(el => el.tagName.toLowerCase() === tag);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(curr) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }

      pathParts.unshift(part);
      curr = curr.parentElement;
      if (pathParts.length >= 3) break; // Keep path concise
    }

    if (rootSelector) {
      pathParts.unshift(rootSelector);
    }

    const computedPath = pathParts.join(' ');
    if (iconName && iconName.length > 2) {
      return `icon:${iconName}, ${computedPath}`;
    }
    return computedPath || target.tagName.toLowerCase();
  }

  // ── 7. Interactive Inspection Mode ──────────────────────────────────────────
  async function startInspectionMode(itemKey, itemName) {
    activeInspectingItemKey = itemKey;
    const banner = document.getElementById('fi-inspect-banner');
    const nameEl = document.getElementById('fi-inspecting-item-name');
    if (banner && nameEl) {
      nameEl.textContent = itemName;
      banner.classList.add('fi-active');
    }

    // Auto-open target popover/drawer if inspecting sub-elements!
    await ensurePopoverOpenForItem(itemKey);

    // Auto-minimize right sidebar during inspect so 100% of Google Flow UI is selectable!
    const sidebar = document.getElementById('flow-inspector-sidebar');
    if (sidebar) {
      sidebar.classList.add('fi-inspecting-mode');
    }

    // Highlight card in sidebar
    document.querySelectorAll('.fi-item-card').forEach(c => c.classList.remove('fi-inspecting'));
    const card = document.getElementById(`fi-card-${itemKey.replace(/[^a-zA-Z0-9]/g, '-')}`);
    if (card) card.classList.add('fi-inspecting');

    document.addEventListener('mousemove', onInspectMouseMove, true);
    document.addEventListener('click', onInspectClick, true);
    updateStatusMsg(`Inspecting [${itemName}]... Click on the element in Google Flow.`);
  }

  function cancelInspectionMode() {
    activeInspectingItemKey = null;
    const banner = document.getElementById('fi-inspect-banner');
    if (banner) banner.classList.remove('fi-active');

    // Restore right sidebar view
    const sidebar = document.getElementById('flow-inspector-sidebar');
    if (sidebar) {
      sidebar.classList.remove('fi-inspecting-mode');
    }

    const overlay = document.getElementById('flow-inspector-overlay-box');
    const tooltip = document.getElementById('flow-inspector-tooltip');
    if (overlay) overlay.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';

    document.querySelectorAll('.fi-item-card').forEach(c => c.classList.remove('fi-inspecting'));
    document.removeEventListener('mousemove', onInspectMouseMove, true);
    document.removeEventListener('click', onInspectClick, true);
  }

  function onInspectMouseMove(e) {
    if (!activeInspectingItemKey) return;
    const target = e.target;
    // If holding Shift, user is in pass-through interaction mode (e.g. clicking to open menus/popovers)
    if (e.shiftKey || !target || target.closest('#fi-inspect-banner, #flow-inspector-sidebar, #flow-inspector-launcher')) {
      const overlay = document.getElementById('flow-inspector-overlay-box');
      const tooltip = document.getElementById('flow-inspector-tooltip');
      if (overlay) overlay.style.display = 'none';
      if (tooltip) tooltip.style.display = 'none';
      return;
    }

    hoveredElement = target;
    const rect = target.getBoundingClientRect();
    const overlay = document.getElementById('flow-inspector-overlay-box');
    const tooltip = document.getElementById('flow-inspector-tooltip');

    if (overlay) {
      overlay.style.display = 'block';
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    }

    if (tooltip) {
      const selectorPreview = generateFlowSelector(target);
      tooltip.style.display = 'block';
      tooltip.style.top = `${rect.top}px`;
      tooltip.style.left = `${rect.left}px`;
      tooltip.textContent = selectorPreview;
    }
  }

  function onInspectClick(e) {
    if (!activeInspectingItemKey) return;
    const target = e.target;
    if (target.closest('#fi-inspect-banner, #flow-inspector-sidebar, #flow-inspector-launcher')) return;

    // Hold Shift to allow normal clicks (open menus, switch sub-tabs, etc.) without picking element!
    if (e.shiftKey) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const selector = generateFlowSelector(target);
    if (!selector) return;

    const inspectedKey = activeInspectingItemKey;

    // Assign to active item
    setRuleValue(inspectedKey, selector);
    const inputId = `fi-input-${inspectedKey.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const input = document.getElementById(inputId);
    if (input) {
      input.value = selector;
      input.style.borderColor = '#10b981';
      setTimeout(() => { input.style.borderColor = ''; }, 1000);
    }

    updateStatusMsg(`✅ Assigned selector for [${inspectedKey}]!`);
    cancelInspectionMode();

    // Scroll card into view in restored sidebar
    setTimeout(() => {
      const card = document.getElementById(`fi-card-${inspectedKey.replace(/[^a-zA-Z0-9]/g, '-')}`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }

  // ── 8. Test Selector & Highlight ────────────────────────────────────────────
  function testSelector(selectorStr, itemName) {
    // Clear existing highlights
    document.querySelectorAll('.fi-test-highlight').forEach(el => el.classList.remove('fi-test-highlight'));

    if (!selectorStr) {
      updateStatusMsg(`⚠️ Selector for [${itemName}] is empty.`);
      return;
    }

    const matched = window.DomRuleEngine ? window.DomRuleEngine.queryAll(selectorStr) : Array.from(document.querySelectorAll(selectorStr));

    if (!matched || matched.length === 0) {
      updateStatusMsg(`❌ No elements matched selector: ${selectorStr}`);
      return;
    }

    matched.forEach(el => el.classList.add('fi-test-highlight'));
    matched[0].scrollIntoView({ behavior: 'smooth', block: 'center' });

    updateStatusMsg(`🎯 Matched ${matched.length} element(s) for [${itemName}]! (Highlighting in green)`);

    // Auto clear after 4 seconds
    setTimeout(() => {
      document.querySelectorAll('.fi-test-highlight').forEach(el => el.classList.remove('fi-test-highlight'));
    }, 4000);
  }

  // ── 9. Rule Synchronization to Worker ───────────────────────────────────────
  async function loadCurrentRules() {
    updateStatusMsg('⏳ Syncing rules from Worker...');
    try {
      const res = await fetch('http://127.0.0.1:8088/v1/rules/dom-selectors');
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          currentRules = json.data;
          const verEl = document.getElementById('fi-rules-version');
          if (verEl) verEl.textContent = `v${currentRules.version || 5}`;
          renderCatalog();
          updateStatusMsg(`✅ Loaded rules version v${currentRules.version}`);
          return;
        }
      }
    } catch (_) {}

    // Fallback to local rule engine
    if (window.DomRuleEngine) {
      currentRules = {
        version: window.DomRuleEngine.rulesVersion || 5,
        rules: window.DomRuleEngine.rules || {}
      };
      const verEl = document.getElementById('fi-rules-version');
      if (verEl) verEl.textContent = `v${currentRules.version}`;
      renderCatalog();
      updateStatusMsg(`✅ Loaded rules from local cache (v${currentRules.version})`);
    }
  }

  async function syncRulesToWorker() {
    const btn = document.getElementById('fi-btn-sync-worker');
    if (btn) btn.disabled = true;
    updateStatusMsg('⏳ Saving and syncing rules to Flow Worker...');

    try {
      // Gather latest input values from UI
      ELEMENT_CATALOG.forEach(section => {
        section.items.forEach(item => {
          const inputId = `fi-input-${item.key.replace(/[^a-zA-Z0-9]/g, '-')}`;
          const input = document.getElementById(inputId);
          if (input && input.value.trim()) {
            setRuleValue(item.key, input.value.trim());
          }
        });
      });

      const res = await fetch('http://127.0.0.1:8088/v1/rules/dom-selectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentRules)
      });

      if (!res.ok) {
        throw new Error(`Worker returned status ${res.status}`);
      }

      const json = await res.json();
      currentRules = json.data;

      // Update inpage DomRuleEngine
      if (window.DomRuleEngine && currentRules.rules) {
        window.DomRuleEngine.rules = currentRules.rules;
        window.DomRuleEngine.rulesVersion = currentRules.version;
      }

      const verEl = document.getElementById('fi-rules-version');
      if (verEl) verEl.textContent = `v${currentRules.version}`;

      updateStatusMsg(`🎉 Synced successfully to Worker! v${currentRules.version} is now available for all workers.`);
    } catch (err) {
      updateStatusMsg(`❌ Worker sync error: ${err.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function resetRulesToDefaults() {
    if (!confirm('Are you sure you want to reset all selectors to system defaults?')) return;
    updateStatusMsg('⏳ Restoring default rules...');
    try {
      const res = await fetch('http://127.0.0.1:8088/v1/rules/dom-selectors/reset', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        currentRules = json.data;
        if (window.DomRuleEngine && currentRules.rules) {
          window.DomRuleEngine.rules = currentRules.rules;
          window.DomRuleEngine.rulesVersion = currentRules.version;
        }
        const verEl = document.getElementById('fi-rules-version');
        if (verEl) verEl.textContent = `v${currentRules.version}`;
        renderCatalog();
        updateStatusMsg(`✅ Reset to default rules v${currentRules.version}`);
      }
    } catch (err) {
      updateStatusMsg(`❌ Reset error: ${err.message}`);
    }
  }

  function updateStatusMsg(msg) {
    const statusEl = document.getElementById('fi-status-msg');
    const timeEl = document.getElementById('fi-status-time');
    if (statusEl) statusEl.textContent = msg;
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Global Listener for Messages from Extension Popup ───────────────────────
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.type === 'TOGGLE_FLOW_INSPECTOR') {
      toggleSidebar();
      sendResponse({ success: true, isOpen: isSidebarOpen });
      return true;
    }
    if (req.type === 'SYNC_DOM_RULES') {
      loadCurrentRules().then(() => sendResponse({ success: true, version: currentRules?.version }));
      return true;
    }
  });

  // Self-init when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInspector);
  } else {
    initInspector();
  }
})();
