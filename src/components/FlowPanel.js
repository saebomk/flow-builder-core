/**
 * Flow Panel Component
 * Side panel that can open on left or right side of the canvas
 */
class FlowPanel {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!this.container) {
      console.error('FlowPanel: Container not found', container);
    }
    
    this.config = {
      position: options.position || 'right', // 'left' or 'right'
      title: options.title || 'Panel',
      icon: options.icon || null, // Icon name (e.g., 'record_create', 'record_update')
      iconBg: options.iconBg || null, // Icon background color (e.g., '#ff538a')
      isOpen: false,
      onClose: options.onClose || null,
      onBack: options.onBack || null,
      content: options.content || ''
    };
    
    // Add open class to container when panel is open
    if (this.container) {
      this.container.classList.add('flow-panel-container');
    } else {
      console.error('FlowPanel constructor: Container is null/undefined');
    }
    
    this.render();
    this.attachEventListeners();
  }
  
  getIconForTitle(title) {
    // Determine icon based on title if not explicitly set
    if (this.config.icon) {
      return this.config.icon;
    }
    
    const titleLower = (title || '').toLowerCase();
    if (titleLower.includes('create')) {
      return 'record_create';
    } else if (titleLower.includes('update')) {
      return 'record_update';
    } else if (titleLower.includes('start') || titleLower.includes('trigger')) {
      return 'play';
    } else if (titleLower.includes('end')) {
      return 'stop';
    } else if (titleLower.includes('action')) {
      return 'custom_notification';
    }
    // Default icon
    return 'add';
  }
  
  getIconBgForIcon(icon) {
    // Determine icon background color based on icon name if not explicitly set
    if (this.config.iconBg) {
      // Check if this is a start node - CSS overrides start nodes to teal
      const titleLower = (this.config.title || '').toLowerCase();
      if (titleLower.includes('start') || titleLower.includes('trigger') || titleLower.includes('record-triggered')) {
        return '#0B827C'; // Teal for start nodes (matches CSS override)
      }
      return this.config.iconBg;
    }
    
    const iconMap = {
      'record_create': '#ff538a',
      'record_update': '#ff538a',
      'play': '#0B827C', // Teal for start nodes (matches CSS override in FlowCanvas.css)
      'stop': '#ea001e',
      'custom_notification': '#032d60',
      'add': '#0176d3',
      'variable': '#0176d3',
      'apex': '#0176d3'
    };
    
    return iconMap[icon] || '#0176d3'; // Default blue
  }
  
  render() {
    const positionClass = this.config.position === 'left' ? 'flow-panel-left' : 'flow-panel-right';
    
    // Ensure container exists
    if (!this.container) {
      console.error('FlowPanel: Container is missing in render()');
      return;
    }
    
    // Clear container
    this.container.innerHTML = '';
    
    // Only render if open
    if (this.config.isOpen) {
      const backButton = this.config.onBack ? `
        <button class="slds-button slds-button_icon" title="Back" aria-label="Back" type="button">
          <svg class="slds-button__icon" aria-hidden="true">
            <use href="#back"></use>
          </svg>
          <span class="slds-assistive-text">Back</span>
        </button>
      ` : '';
      
      const content = this.config.content || '';
      const iconName = this.getIconForTitle(this.config.title);
      const iconBg = this.getIconBgForIcon(iconName);
      
      const dragHandlePosition = this.config.position === 'left' ? 'right' : 'left';
      
      this.container.innerHTML = `
        <div class="flow-panel ${positionClass}">
          <div class="flow-panel-drag-handle flow-panel-drag-handle-${dragHandlePosition}" data-panel-position="${this.config.position}">
            <svg class="slds-icon slds-icon_small" aria-hidden="true">
              <use href="#drag_and_drop"></use>
            </svg>
          </div>
          <div class="flow-panel-header">
            ${backButton}
            ${this.config.position === 'right' ? `
            <div class="flow-panel-title-icon" style="background-color: ${iconBg}">
              <svg class="slds-icon" aria-hidden="true">
                <use href="#${iconName}"></use>
              </svg>
            </div>
            ` : ''}
            <h3 class="flow-panel-title">${this.config.title}</h3>
            <button class="slds-button slds-button_icon" title="Close" aria-label="Close panel" type="button">
              <svg class="slds-icon slds-icon_small" aria-hidden="true">
                <use href="#close_x"></use>
              </svg>
              <span class="slds-assistive-text">Close</span>
            </button>
          </div>
          <div class="flow-panel-body">
            ${content}
          </div>
        </div>
      `;
    }
  }
  
  attachEventListeners() {
    const closeButton = this.container.querySelector('.slds-button_icon[aria-label="Close panel"]');
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        this.config.onClose?.();
      });
    }
    
    const backButton = this.container.querySelector('.slds-button_icon[aria-label="Back"]');
    if (backButton) {
      backButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.config.onBack?.();
      });
    }
    
    // Attach drag handle listener
    const dragHandle = this.container.querySelector('.flow-panel-drag-handle');
    if (dragHandle) {
      this.attachDragListener(dragHandle);
    }
  }
  
  attachDragListener(dragHandle) {
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    const minWidth = 400;
    const gapBetweenPanels = 100;
    
    const handleMouseDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = this.container.offsetWidth;
      
      // Disable transition while dragging for this panel
      this.container.classList.add('resizing');
      
      // Also disable transition for the other panel if it exists
      const otherPanelContainer = this.config.position === 'left' 
        ? document.querySelector('#flow-panel-right-container')
        : document.querySelector('#flow-panel-left-container');
      if (otherPanelContainer) {
        otherPanelContainer.classList.add('resizing');
      }
      
      // Prevent text selection
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      
      e.preventDefault();
    };
    
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      // Calculate max width dynamically based on current window size
      let maxWidth = window.innerWidth * 0.8;
      
      // Check if the other panel is open and adjust max width to maintain gap
      const otherPanelContainer = this.config.position === 'left' 
        ? document.querySelector('#flow-panel-right-container')
        : document.querySelector('#flow-panel-left-container');
      
      const deltaX = this.config.position === 'left' 
        ? e.clientX - startX  // Left panel: drag right increases width
        : startX - e.clientX;  // Right panel: drag left increases width
      
      let newWidth = startWidth + deltaX;
      
      // Apply min/max constraints
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      // Check for overlap with other panel and enforce gap, allowing other panel to shrink
      if (otherPanelContainer && otherPanelContainer.classList.contains('flow-panel-open')) {
        const thisPanelRect = this.container.getBoundingClientRect();
        const otherPanelRect = otherPanelContainer.getBoundingClientRect();
        const otherPanelCurrentWidth = otherPanelContainer.offsetWidth;
        const otherPanelMinWidth = 400; // Same as minWidth constant
        
        if (this.config.position === 'left') {
          // Left panel: right edge should not exceed (other panel left - gap)
          const thisPanelRight = thisPanelRect.left + newWidth;
          const maxRightEdgeWithGap = otherPanelRect.left - gapBetweenPanels;
          
          if (thisPanelRight > maxRightEdgeWithGap) {
            // Calculate how much the other panel needs to shrink
            const overlap = thisPanelRight - maxRightEdgeWithGap;
            const otherPanelNewWidth = otherPanelCurrentWidth - overlap;
            
            if (otherPanelNewWidth >= otherPanelMinWidth) {
              // Other panel can shrink, so allow this panel to grow
              // The other panel will be resized to maintain gap
              otherPanelContainer.style.width = `${otherPanelNewWidth}px`;
              otherPanelContainer.setAttribute('data-panel-width', otherPanelNewWidth);
            } else {
              // Other panel is at min width, stop this panel from growing
              const maxAllowedRight = otherPanelRect.left - gapBetweenPanels;
              // But we need to account for the other panel being at min width
              const otherPanelAtMinLeft = window.innerWidth - otherPanelMinWidth;
              const maxAllowedRightWithMinOther = otherPanelAtMinLeft - gapBetweenPanels;
              newWidth = Math.min(newWidth, maxAllowedRightWithMinOther - thisPanelRect.left);
            }
          }
        } else {
          // Right panel: left edge should not go past (other panel right + gap)
          const otherPanelRight = otherPanelRect.left + otherPanelRect.width;
          const minLeftEdgeWithGap = otherPanelRight + gapBetweenPanels;
          const thisPanelLeft = window.innerWidth - newWidth;
          
          if (thisPanelLeft < minLeftEdgeWithGap) {
            // Calculate how much the other panel needs to shrink
            const overlap = minLeftEdgeWithGap - thisPanelLeft;
            const otherPanelNewWidth = otherPanelCurrentWidth - overlap;
            
            if (otherPanelNewWidth >= otherPanelMinWidth) {
              // Other panel can shrink, so allow this panel to grow
              // The other panel will be resized to maintain gap
              otherPanelContainer.style.width = `${otherPanelNewWidth}px`;
              otherPanelContainer.setAttribute('data-panel-width', otherPanelNewWidth);
            } else {
              // Other panel is at min width, stop this panel from growing
              const otherPanelAtMinRight = otherPanelRect.left + otherPanelMinWidth;
              const minAllowedLeft = otherPanelAtMinRight + gapBetweenPanels;
              const maxAllowedWidth = window.innerWidth - minAllowedLeft;
              newWidth = Math.min(newWidth, maxAllowedWidth);
            }
          }
        }
      }
      
      // Ensure we still respect min width after gap constraint
      newWidth = Math.max(minWidth, newWidth);
      
      // Apply new width
      this.container.style.width = `${newWidth}px`;
    };
    
    const handleMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      
      // Re-enable transition for this panel
      this.container.classList.remove('resizing');
      
      // Re-enable transition for the other panel if it exists
      const otherPanelContainer = this.config.position === 'left' 
        ? document.querySelector('#flow-panel-right-container')
        : document.querySelector('#flow-panel-left-container');
      if (otherPanelContainer) {
        otherPanelContainer.classList.remove('resizing');
        
        // Store the other panel's width for persistence
        const otherPanelFinalWidth = otherPanelContainer.offsetWidth;
        otherPanelContainer.setAttribute('data-panel-width', otherPanelFinalWidth);
      }
      
      // Restore text selection
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      // Store the width for persistence
      const finalWidth = this.container.offsetWidth;
      this.container.setAttribute('data-panel-width', finalWidth);
    };
    
    dragHandle.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Store cleanup function
    this.cleanupDragListeners = () => {
      dragHandle.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }
  
  open(position, title, content, onBack, icon, iconBg) {
    if (position) this.config.position = position;
    if (title) this.config.title = title;
    if (content !== undefined) this.config.content = content;
    if (onBack !== undefined) this.config.onBack = onBack;
    if (icon !== undefined) this.config.icon = icon;
    if (iconBg !== undefined) this.config.iconBg = iconBg;
    
    this.config.isOpen = true;
    
    // Ensure container exists and is valid - if it's a string, try to find it again
    if (!this.container || typeof this.container === 'string') {
      const selector = typeof this.container === 'string' ? this.container : '#flow-panel-left-container';
      this.container = document.querySelector(selector);
    }
    
    if (!this.container) {
      console.error('Panel container is missing - cannot open panel');
      console.error('Available containers:', {
        left: document.querySelector('#flow-panel-left-container'),
        right: document.querySelector('#flow-panel-right-container')
      });
      return;
    }
    
    // Ensure container has the base class
    if (!this.container.classList.contains('flow-panel-container')) {
      this.container.classList.add('flow-panel-container');
    }
    
    this.render();
    this.attachEventListeners();
    
    // Add open class to container to expand it
    this.container.classList.add('flow-panel-open');
    
    // Restore saved width if available, otherwise use default
    const savedWidth = this.container.getAttribute('data-panel-width');
    if (savedWidth) {
      this.container.style.width = `${savedWidth}px`;
    } else {
      // Set default width
      this.container.style.width = '400px';
      this.container.setAttribute('data-panel-width', '400');
    }
    
    // Force a reflow to ensure the width transition works
    void this.container.offsetWidth;
  }
  
  close() {
    this.config.isOpen = false;
    
    // Ensure container exists
    if (!this.container) {
      console.error('Panel container is missing');
      return;
    }
    
    // Clean up drag listeners if they exist
    if (this.cleanupDragListeners) {
      this.cleanupDragListeners();
      this.cleanupDragListeners = null;
    }
    
    // Remove open class from container to collapse it first
    this.container.classList.remove('flow-panel-open');
    
    // Then render (which clears innerHTML)
    this.render();
  }
  
  setContent(content) {
    this.config.content = content;
    const body = this.container.querySelector('.flow-panel-body');
    if (body) {
      // Save scroll position before updating content
      const savedScrollTop = body.scrollTop;
      body.innerHTML = content;
      // Restore scroll position immediately after setting content
      if (savedScrollTop > 0) {
        body.scrollTop = savedScrollTop;
        // Also restore in next frame to ensure it sticks
        requestAnimationFrame(() => {
          body.scrollTop = savedScrollTop;
        });
      }
    }
  }
  
  setTitle(title) {
    this.config.title = title;
    const titleEl = this.container.querySelector('.flow-panel-title');
    if (titleEl) {
      titleEl.textContent = title;
    }
    // Update icon when title changes (only for right panels)
    if (this.config.position === 'right') {
      const iconContainer = this.container.querySelector('.flow-panel-title-icon');
      if (iconContainer) {
        const iconName = this.getIconForTitle(title);
        const iconBg = this.getIconBgForIcon(iconName);
        iconContainer.style.backgroundColor = iconBg;
        const iconEl = iconContainer.querySelector('svg use');
        if (iconEl) {
          iconEl.setAttribute('href', `#${iconName}`);
        }
      }
    }
  }
  
  setIcon(icon) {
    this.config.icon = icon;
    // Only update icon for right panels
    if (this.config.position === 'right') {
      const iconContainer = this.container.querySelector('.flow-panel-title-icon');
      if (iconContainer) {
        const iconBg = this.getIconBgForIcon(icon);
        iconContainer.style.backgroundColor = iconBg;
        const iconEl = iconContainer.querySelector('svg use');
        if (iconEl) {
          iconEl.setAttribute('href', `#${icon}`);
        }
      }
    }
  }
  
  setIconBg(iconBg) {
    this.config.iconBg = iconBg;
    // Only update icon background for right panels
    if (this.config.position === 'right') {
      const iconContainer = this.container.querySelector('.flow-panel-title-icon');
      if (iconContainer) {
        iconContainer.style.backgroundColor = iconBg;
      }
    }
  }
  
  setOnBack(onBack) {
    this.config.onBack = onBack;
    // Re-render to show/hide back button, preserving content
    if (this.config.isOpen) {
      // Get current content from DOM in case it was set via setContent
      const body = this.container.querySelector('.flow-panel-body');
      const currentContent = body ? body.innerHTML : this.config.content;
      this.config.content = currentContent;
      this.render();
      this.attachEventListeners();
    }
  }
  
  isOpen() {
    return this.config.isOpen;
  }
  
  getPosition() {
    return this.config.position;
  }
  
  updateContent(content) {
    this.setContent(content);
  }
}

// Export for use in prototype
if (typeof window !== 'undefined') {
  window.FlowPanel = FlowPanel;
}

