/**
 * Builder Header Component for Prototype
 * Reusable JavaScript component for the prototype HTML
 */
class BuilderHeader {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    this.config = {
      appName: options.appName || 'Flow Builder',
      flowName: options.flowName || 'Flow Name',
      showPageType: options.showPageType || false,
      pageType: options.pageType || 'Flow',
      showHelp: options.showHelp !== false,
      onBack: options.onBack || null,
      onFlowSelect: options.onFlowSelect || null,
      onHelp: options.onHelp || null,
      onToolbox: options.onToolbox || null,
      onErrors: options.onErrors || null,
      onMultiSelect: options.onMultiSelect || null,
      onUndo: options.onUndo || null,
      onRedo: options.onRedo || null,
      onCanvasSettings: options.onCanvasSettings || null,
      onZoomIn: options.onZoomIn || null,
      onZoomOut: options.onZoomOut || null,
      onZoomFit: options.onZoomFit || null,
      onSaveAsNewVersion: options.onSaveAsNewVersion || null,
      onSave: options.onSave || null,
      onActivate: options.onActivate || null,
      toolboxOpen: options.toolboxOpen || false,
      errorsOpen: options.errorsOpen || false,
      layoutMode: options.layoutMode || 'auto-layout', // 'auto-layout' or 'free-form'
      onLayoutChange: options.onLayoutChange || null,
      saveButtonDisabled: options.saveButtonDisabled !== undefined ? options.saveButtonDisabled : true, // Default to disabled
      lastSavedDate: options.lastSavedDate || null, // Last saved date (Date object or null)
      status: options.status || 'Inactive' // Status badge text (default: 'Inactive')
    };
    
    // Bind the click handler so we can remove it later
    this.clickHandler = this.handleClick.bind(this);
    
    // ResizeObserver for detecting toolbar width changes
    this.resizeObserver = null;
    
    // Cache for memoized date formatting
    this._cachedFormattedDate = null;
    this._cachedDateTimestamp = null;
    
    // Throttle overlap detection to improve performance
    this._overlapDetectionPending = false;
    
    this.render();
    this.attachEventListeners();
    this.initializeOverlapDetection();
  }
  
  render() {
    // Get current page name from the HTML file
    const getCurrentPageName = () => {
      const path = window.location.pathname;
      const filename = path.split('/').pop() || 'index.html';
      // Remove .html extension and format
      const pageName = filename.replace('.html', '') || 'Home';
      // Capitalize first letter and replace hyphens with spaces
      return pageName.charAt(0).toUpperCase() + pageName.slice(1).replace(/-/g, ' ');
    };
    
    const currentPageName = getCurrentPageName();
    
    this.container.innerHTML = `
      <div class="slds-scoped-notification slds-scoped-notification_light" role="status">
        <div class="slds-media">
          <div class="slds-media__figure">
            <span class="slds-icon_container slds-icon-utility-info slds-current-color" title="Information">
              <svg class="slds-icon slds-icon_x-small" aria-hidden="true">
                <use href="#info"></use>
              </svg>
              <span class="slds-assistive-text">Information</span>
            </span>
          </div>
          <div class="slds-media__body" style="width: 100%; display: flex;">
            <p style="display: flex; align-items: center; margin: 0; width: 100%; justify-content: space-between;">
              <span style="height: 100%; text-align: left;">Flow Test Mode UX Prototype (Internal Only)</span>
              <span style="text-align: right; margin-left: auto;">
                Any feedback or questions? Share in <a href="https://salesforce.enterprise.slack.com/archives/C085BP04TDH" target="_blank" rel="noopener noreferrer" style="color: var(--slds-g-color-brand-base-50, #0176d3); text-decoration: none;">#automation-debug-test-collab</a>
              </span>
            </p>
          </div>
        </div>
      </div>
      <div class="slds-builder-header_container">
        <header class="slds-builder-header">
          ${this.renderHeader()}
        </header>
        ${this.renderToolbar()}
      </div>
    `;
  }
  
  renderHeader() {
    return `
      <div class="slds-builder-header__item">
        <a href="#" class="slds-builder-header__item-action" title="Back" data-action="back">
          <span class="slds-icon_container slds-icon-utility-back slds-current-color">
            <svg class="slds-icon slds-icon_x-small" aria-hidden="true">
              <use href="#back"></use>
            </svg>
            <span class="slds-assistive-text">Back</span>
          </span>
        </a>
      </div>
      <div class="slds-builder-header__item">
        <div class="slds-builder-header__item-label slds-media slds-media_center">
          <div class="slds-media__figure">
            <span class="slds-icon_container slds-icon-utility-builder slds-current-color">
              <svg class="slds-icon slds-icon_small" aria-hidden="true">
                <use href="#flow"></use>
              </svg>
            </span>
          </div>
          <div class="slds-media__body">${this.config.appName}</div>
        </div>
      </div>
      <nav class="slds-builder-header__item slds-builder-header__nav">
        <ul class="slds-builder-header__nav-list">
          <li class="slds-builder-header__nav-item slds-dropdown-trigger slds-dropdown-trigger_click">
            <button 
              class="slds-button slds-builder-header__item-action slds-media slds-media_center" 
              aria-haspopup="true" 
              aria-expanded="false" 
              title="Click to open menu"
              data-action="flowselect">
              <span class="slds-media__figure">
                <span class="slds-icon_container slds-icon-utility-page slds-current-color">
                  <svg class="slds-icon slds-icon_x-small" aria-hidden="true">
                    <use href="#page"></use>
                  </svg>
                </span>
              </span>
              <span class="slds-media__body">
                <span class="slds-truncate" title="Dropdown">
                  ${this.config.flowName}
                </span>
                <span class="slds-icon_container slds-icon-utility-chevrondown slds-current-color slds-m-left-small">
                  <svg class="slds-icon slds-icon_x-small" aria-hidden="true">
                    <use href="#down"></use>
                  </svg>
                </span>
              </span>
            </button>
          </li>
        </ul>
      </nav>
      ${this.config.showPageType ? `
        <div class="slds-builder-header__item slds-has-flexi-truncate">
          <h1 class="slds-builder-header__item-label">
            <span class="slds-truncate" title="Page Type">${this.config.pageType}</span>
          </h1>
        </div>
      ` : ''}
      ${this.config.showHelp ? `
        <div class="slds-builder-header__item slds-builder-header__utilities">
          <div class="slds-builder-header__utilities-item">
            <button class="slds-button slds-button_icon slds-button_icon-bare slds-button_icon-container-more slds-button_icon-inverse" title="Help" data-action="help" aria-haspopup="true">
              <svg class="slds-button__icon" aria-hidden="true">
                <use href="#help"></use>
              </svg>
              <svg class="slds-button__icon slds-button__icon-small" aria-hidden="true">
                <use href="#down"></use>
              </svg>
              <span class="slds-assistive-text">Help</span>
            </button>
          </div>
        </div>
      ` : ''}
    `;
  }
  
  renderToolbar() {
    return `
      <div class="slds-builder-toolbar" role="toolbar">
        <div class="builder-toolbar__left-group">
          <div class="slds-builder-toolbar__item-group builder-toolbar__panel-group" aria-label="Panel Actions">
            <button class="slds-button slds-button_icon slds-button_icon-border ${this.config.toolboxOpen ? 'slds-is-selected' : ''}" title="Toolbox" data-action="toolbox">
              <svg class="slds-button__icon" aria-hidden="true">
                <use href="#toggle_panel_left"></use>
              </svg>
              <span class="slds-assistive-text">Toolbox</span>
            </button>
            <button class="slds-button slds-button_icon slds-button_icon-border ${this.config.errorsOpen ? 'slds-is-selected' : ''}" title="Errors and Warnings" data-action="errors">
              <svg class="slds-button__icon" aria-hidden="true">
                <use href="#error"></use>
              </svg>
              <span class="slds-assistive-text">Errors and Warnings</span>
            </button>
          </div>
          <div class="slds-builder-toolbar__item-group builder-toolbar__canvas-group" aria-label="Canvas Actions">
          <button class="slds-button slds-button_icon slds-button_icon-border" title="Multi-Select" data-action="multiselect">
            <svg class="slds-button__icon" aria-hidden="true">
              <use href="#multi_select_checkbox"></use>
            </svg>
            <span class="slds-assistive-text">Select Elements</span>
          </button>
          <div class="slds-button-group">
            <button class="slds-button slds-button_icon slds-button_icon-border" title="Undo" tabindex="0" data-action="undo">
              <svg class="slds-button__icon" aria-hidden="true">
                <use href="#undo"></use>
              </svg>
              <span class="slds-assistive-text">Undo</span>
            </button>
            <button class="slds-button slds-button_icon slds-button_icon-border" title="Redo" tabindex="-1" data-action="redo">
              <svg class="slds-button__icon" aria-hidden="true">
                <use href="#redo"></use>
              </svg>
              <span class="slds-assistive-text">Redo</span>
            </button>
          </div>
          <button class="slds-button slds-button_icon slds-button_icon-border" title="Canvas Settings" data-action="canvassettings">
            <svg class="slds-button__icon" aria-hidden="true">
              <use href="#settings"></use>
            </svg>
            <span class="slds-assistive-text">Canvas Settings</span>
          </button>
          <div class="slds-form-element builder-toolbar__layout-select">
            <div class="slds-form-element__control">
              <div class="slds-select_container">
                <select class="slds-select" aria-label="Canvas Layout" data-action="layoutchange">
                  <option value="auto-layout" ${this.config.layoutMode === 'auto-layout' ? 'selected' : ''}>Auto-Layout</option>
                  <option value="free-form" ${this.config.layoutMode === 'free-form' ? 'selected' : ''}>Free-Form</option>
                </select>
              </div>
            </div>
          </div>
          </div>
        </div>
        <div class="slds-builder-toolbar__actions" aria-label="Document actions">
          <div class="builder-header-status-info" style="display: flex; align-items: center; gap: 0.75rem; margin-right: 4px;">
            <span class="slds-text-body_small slds-text-color_weak">Last saved on ${this.formatLastSavedDate(this.config.lastSavedDate || new Date())}</span>
            <span class="slds-badge">${this.config.status}</span>
          </div>
          <div class="slds-button-group" role="group">
            <button class="slds-button slds-button_neutral" data-action="saveasnewversion">Save as New Version</button>
            <div class="slds-dropdown-trigger slds-dropdown-trigger_click slds-button_last">
              <button class="slds-button slds-button_icon slds-button_icon-border-filled" aria-haspopup="true" aria-expanded="false" title="Show More">
                <svg class="slds-button__icon" aria-hidden="true">
                  <use href="#down"></use>
                </svg>
                <span class="slds-assistive-text">Show More</span>
              </button>
            </div>
          </div>
          <button class="slds-button slds-button_neutral" data-action="save" ${this.config.saveButtonDisabled ? 'disabled' : ''}>Save</button>
          <button class="slds-button slds-button_brand" data-action="activate">Activate</button>
        </div>
      </div>
    `;
  }
  
  formatLastSavedDate(date) {
    // Memoize date formatting to avoid redundant calculations
    const dateTimestamp = date ? (date instanceof Date ? date.getTime() : new Date(date).getTime()) : null;
    
    if (dateTimestamp && this._cachedDateTimestamp === dateTimestamp) {
      return this._cachedFormattedDate;
    }
    
    // Format date as mm/dd/yyyy, hh:mm AM
    const d = date instanceof Date ? date : new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const formattedHours = String(hours).padStart(2, '0');
    
    const formatted = `${month}/${day}/${year}, ${formattedHours}:${minutes} ${ampm}`;
    
    // Cache the result
    this._cachedFormattedDate = formatted;
    this._cachedDateTimestamp = dateTimestamp;
    
    return formatted;
  }
  
  handleClick(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    
    e.preventDefault();
    
    switch(action) {
      case 'back':
        this.config.onBack?.();
        break;
      case 'flowselect':
        this.config.onFlowSelect?.();
        break;
      case 'help':
        this.config.onHelp?.();
        break;
      case 'toolbox':
        // Toggle toolbox state - if it's open, close it; if closed, open it and close others
        const newToolboxState = !this.config.toolboxOpen;
        console.log('BuilderHeader: Toolbox clicked', { old: this.config.toolboxOpen, new: newToolboxState });
        this.config.toolboxOpen = newToolboxState;
        // Always close other panels (mutually exclusive)
        this.config.errorsOpen = false;
        // Update UI immediately - directly manipulate classes for immediate feedback
        this.updatePanelButtonStates();
        // Call callback
        if (this.config.onToolbox) {
          this.config.onToolbox(newToolboxState);
        }
        break;
      case 'errors':
        // Toggle errors state - if it's open, close it; if closed, open it and close others
        const newErrorsState = !this.config.errorsOpen;
        console.log('BuilderHeader: Errors clicked', { old: this.config.errorsOpen, new: newErrorsState });
        this.config.errorsOpen = newErrorsState;
        // Always close other panels (mutually exclusive)
        this.config.toolboxOpen = false;
        // Update UI immediately - directly manipulate classes for immediate feedback
        this.updatePanelButtonStates();
        // Call callback
        if (this.config.onErrors) {
          this.config.onErrors(newErrorsState);
        }
        break;
      case 'multiselect':
        this.config.onMultiSelect?.();
        break;
      case 'undo':
        this.config.onUndo?.();
        break;
      case 'redo':
        this.config.onRedo?.();
        break;
      case 'canvassettings':
        this.config.onCanvasSettings?.();
        break;
      case 'saveasnewversion':
        this.config.onSaveAsNewVersion?.();
        break;
      case 'save':
        this.config.onSave?.();
        break;
      case 'activate':
        this.config.onActivate?.();
        break;
      case 'layoutchange':
        // Layout mode select changed
        const select = e.target;
        if (select && select.tagName === 'SELECT') {
          this.config.layoutMode = select.value;
          this.config.onLayoutChange?.(select.value);
        }
        break;
    }
  }
  
  attachEventListeners() {
    // Ensure clickHandler is bound
    if (!this.clickHandler) {
      this.clickHandler = this.handleClick.bind(this);
    }
    // Remove existing listener if any
    this.container.removeEventListener('click', this.clickHandler);
    // Add the listener
    this.container.addEventListener('click', this.clickHandler);
    
    // Close dropdowns when clicking outside
    if (!this.outsideClickHandler) {
      this.outsideClickHandler = (e) => {
        if (!this.container.contains(e.target)) {
          this.container.querySelectorAll('.slds-dropdown-trigger').forEach(trigger => {
            trigger.classList.remove('slds-is-open');
            const button = trigger.querySelector('button');
            if (button) {
              button.setAttribute('aria-expanded', 'false');
            }
          });
        }
      };
    }
    document.removeEventListener('click', this.outsideClickHandler);
    document.addEventListener('click', this.outsideClickHandler);
  }
  
  updateConfig(newConfig) {
    const oldConfig = { ...this.config };
    
    // Check if any values actually changed
    let hasChanges = false;
    const changedKeys = [];
    for (const key in newConfig) {
      if (newConfig[key] !== oldConfig[key]) {
        hasChanges = true;
        changedKeys.push(key);
      }
    }
    
    // If no changes, skip re-render to prevent twitching
    if (!hasChanges) {
      return;
    }
    
    this.config = { ...this.config, ...newConfig };
    
    console.log('BuilderHeader: updateConfig called', { changedKeys, newConfig });
    
    // Clear cached date if lastSavedDate changed
    if (newConfig.lastSavedDate !== undefined) {
      this._cachedFormattedDate = null;
      this._cachedDateTimestamp = null;
    }
    
    // Check if only lastSavedDate changed - if so, update just the label without full re-render
    const onlyLastSavedDateChanged = changedKeys.length === 1 && 
                                      changedKeys[0] === 'lastSavedDate';
    
    // Check if only panel button states changed - if so, update just the buttons without full re-render
    const onlyPanelStatesChanged = changedKeys.every(key => 
      key === 'toolboxOpen' || key === 'errorsOpen'
    );
    
    if (onlyLastSavedDateChanged) {
      // Only update the "Last saved on" label without re-rendering the entire header
      this.updateLastSavedLabel();
    } else if (onlyPanelStatesChanged) {
      // Only update panel button states without full re-render
      console.log('BuilderHeader: Only panel states changed, updating buttons only');
      this.updatePanelButtonStates();
    } else {
      // Full re-render for other config changes
      console.log('BuilderHeader: Full re-render triggered');
      this.render();
      this.attachEventListeners();
      this.initializeOverlapDetection();
      // After re-render, ensure panel button states are correct
      this.updatePanelButtonStates();
    }
  }
  
  updateLastSavedLabel() {
    // Update only the "Last saved on" label element without re-rendering the entire header
    const statusInfo = this.container.querySelector('.builder-header-status-info');
    if (statusInfo) {
      const labelElement = statusInfo.querySelector('.slds-text-body_small.slds-text-color_weak');
      if (labelElement) {
        const formattedDate = this.formatLastSavedDate(this.config.lastSavedDate || new Date());
        labelElement.textContent = `Last saved on ${formattedDate}`;
      }
    }
  }
  
  setSaveButtonDisabled(disabled) {
    this.config.saveButtonDisabled = disabled;
    const saveButton = this.container.querySelector('[data-action="save"]');
    if (saveButton) {
      if (disabled) {
        saveButton.setAttribute('disabled', 'disabled');
      } else {
        saveButton.removeAttribute('disabled');
      }
    }
  }
  
  checkAndHideOverlappingButtons() {
    // Throttle overlap detection to avoid excessive calculations
    if (this._overlapDetectionPending) return;
    this._overlapDetectionPending = true;
    
    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      this._overlapDetectionPending = false;
      
      const toolbar = this.container.querySelector('.slds-builder-toolbar');
      if (!toolbar) return;
      
      const modeSwitch = toolbar.querySelector('.builder-toolbar__mode-switch');
      if (!modeSwitch) return;
      
      const leftGroup = toolbar.querySelector('.builder-toolbar__left-group');
      const actionsGroup = toolbar.querySelector('.slds-builder-toolbar__actions');
      
      // Get mode switch boundaries
      const modeSwitchRect = modeSwitch.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      
      // Calculate mode switch position relative to toolbar
      const modeSwitchLeft = modeSwitchRect.left - toolbarRect.left;
      const modeSwitchRight = modeSwitchRect.right - toolbarRect.left;
      
      // Check left group buttons - iterate through item groups
      if (leftGroup) {
        const leftButtons = Array.from(leftGroup.querySelectorAll('.slds-builder-toolbar__item-group'));
        
        // First, ensure all button groups are visible to get accurate measurements
        leftButtons.forEach((buttonGroup) => {
          buttonGroup.style.display = '';
        });
        
        // Force a reflow to ensure positions are calculated
        void toolbar.offsetHeight;
        
        // Now check overlaps and hide as needed
        leftButtons.forEach((buttonGroup) => {
          const buttonRect = buttonGroup.getBoundingClientRect();
          const buttonRight = buttonRect.right - toolbarRect.left;
          
          // If button group extends past the left edge of mode switch, hide it
          if (buttonRight > modeSwitchLeft) {
            buttonGroup.style.display = 'none';
          }
        });
      }
      
      // Check right actions group buttons - iterate through direct children
      if (actionsGroup) {
        // First, ensure all buttons are visible to get accurate measurements
        const actionButtons = Array.from(actionsGroup.children);
        actionButtons.forEach((button) => {
          button.style.display = '';
        });
        
        // Force a reflow to ensure positions are calculated
        void toolbar.offsetHeight;
        
        // Now check overlaps and hide as needed
        actionButtons.forEach((button) => {
          const buttonRect = button.getBoundingClientRect();
          const buttonLeft = buttonRect.left - toolbarRect.left;
          
          // If button extends past the right edge of mode switch, hide it
          if (buttonLeft < modeSwitchRight) {
            button.style.display = 'none';
          }
        });
      }
    });
  }
  
  initializeOverlapDetection() {
    // Clean up existing observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    const toolbar = this.container.querySelector('.slds-builder-toolbar');
    if (!toolbar) {
      // If toolbar doesn't exist yet, try again after a short delay
      setTimeout(() => this.initializeOverlapDetection(), 100);
      return;
    }
    
    // Initial check after a small delay to ensure DOM is fully rendered
    setTimeout(() => {
      this.checkAndHideOverlappingButtons();
    }, 0);
    
    // Set up ResizeObserver to watch for toolbar width changes
    this.resizeObserver = new ResizeObserver(() => {
      this.checkAndHideOverlappingButtons();
    });
    
    this.resizeObserver.observe(toolbar);
    
    // Also listen for window resize events as a fallback
    if (!this.windowResizeHandler) {
      this.windowResizeHandler = () => {
        this.checkAndHideOverlappingButtons();
      };
      window.addEventListener('resize', this.windowResizeHandler);
    }
  }
  
  updatePanelButtonStates() {
    // Update the selected state of panel buttons without full re-render
    // Find buttons within the toolbar to ensure we get the correct elements
    const toolbar = this.container.querySelector('.slds-builder-toolbar');
    if (!toolbar) {
      console.warn('BuilderHeader: Toolbar not found when updating panel button states');
      return;
    }
    
    const toolboxButton = toolbar.querySelector('[data-action="toolbox"]');
    const errorsButton = toolbar.querySelector('[data-action="errors"]');
    
    console.log('BuilderHeader: Updating panel button states', {
      toolboxOpen: this.config.toolboxOpen,
      errorsOpen: this.config.errorsOpen,
      buttons: {
        toolbox: !!toolboxButton,
        errors: !!errorsButton
      }
    });
    
    // Update toolbox button
    if (toolboxButton) {
      if (this.config.toolboxOpen) {
        toolboxButton.classList.add('slds-is-selected');
      } else {
        toolboxButton.classList.remove('slds-is-selected');
      }
    }
    
    // Update errors button
    if (errorsButton) {
      if (this.config.errorsOpen) {
        errorsButton.classList.add('slds-is-selected');
      } else {
        errorsButton.classList.remove('slds-is-selected');
      }
    }
  }
  
  destroy() {
    // Clean up observers and listeners
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    if (this.windowResizeHandler) {
      window.removeEventListener('resize', this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
    
    if (this.clickHandler) {
      this.container.removeEventListener('click', this.clickHandler);
    }
    
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
    }
  }
}

// Export for use in prototype
if (typeof window !== 'undefined') {
  window.BuilderHeader = BuilderHeader;
}

