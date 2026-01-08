/**
 * Flow Canvas Component
 * Displays flow elements as nodes connected with lines
 */
class FlowCanvas {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!this.container) {
      console.error('FlowCanvas: Container not found', container);
    }
    
    this.config = {
      nodes: options.nodes || this.getDefaultNodes(),
      onNodeClick: options.onNodeClick || null,
      onNodeAdd: options.onNodeAdd || null,
      onConnectorClick: options.onConnectorClick || null,
      onNodeSelected: options.onNodeSelected || null,
      onNodeCopy: options.onNodeCopy || null, // Callback when node is copied
      onNodeCut: options.onNodeCut || null, // Callback when node is cut
      selectedNodeId: null,
      buildMode: options.buildMode || 'build',
      isTestFlowOrScenarioView: options.isTestFlowOrScenarioView || (() => false), // Function to check if in test flow/scenario view
      onOutputsChange: options.onOutputsChange || null, // Callback when outputs change
      onChange: options.onChange || null, // Callback when any changes are made (for Build mode Save button)
      enableSelectiveTesting: options.enableSelectiveTesting === true // Enable selective testing feature (start/end point selection)
    };
    
    // Store outputs for each node (keyed by nodeId)
    this.outputs = {};
    
    // Track execution path for connector lines
    this.executionPath = []; // Array of connector indices that were executed (legacy support)
    
    // Track multiple path highlights for test scenarios
    // Structure: { [scenarioId]: { status: 'passed'|'failed'|'error'|'not-run', connectors: [indices] } }
    this.pathHighlights = {};
    
    // Store active tab state for element configuration panel (in test mode)
    // This allows preserving tab selection when switching between elements
    this.activeTab = null; // 'properties' or 'outputs'
    
    // Track test start and end points
    this.testStartPoint = null; // Node ID for test start point (only one allowed)
    this.testEndPoint = null; // Node ID for test end point (only one allowed)
    
    // Zoom state
    this.zoomLevel = 1; // Current zoom level (1 = 100%)
    this.isZoomManuallyChanged = false; // Track if user manually zoomed (changes fit button to reset)
    this.minZoom = 0.25; // Minimum zoom level (25%)
    this.maxZoom = 3; // Maximum zoom level (300%)
    this.zoomFactor = 1.05; // Zoom factor (5% per step for symmetric zoom in/out)
    
    // Performance optimization: Cache DOM queries and prevent duplicate listeners
    this.cachedQueries = {};
    this.eventListenersAttached = false;
    this.renderDebounceTimeout = null;
    this.outputsInputDebounce = {}; // Debounce timers for output input handlers
    
    // Initialize flags for legend position updates
    this._legendUpdateDisabled = false;
    this._panelOpening = false;
    this._panelOpeningTimeout = null;
    this._observerCallbackPending = false;
    
    if (this.container) {
      this.render();
      this.attachEventListeners();
    } else {
      console.error('FlowCanvas: Cannot render - container is missing');
    }
  }
  
  getDefaultNodes() {
    return [
      {
        id: 'start',
        type: 'start',
        title: 'Record-Triggered Flow',
        subtitle: 'Start',
        icon: 'play',
        iconBg: '#0B827C', // SLDS Teal 60
      },
      {
        id: 'create-task',
        type: 'create',
        title: 'Create Task',
        subtitle: 'Create Records',
        icon: 'record_create',
        iconBg: '#ff538a'
      },
      {
        id: 'update-case',
        type: 'update',
        title: 'Update Case to Escalated',
        subtitle: 'Update Records',
        icon: 'record_update',
        iconBg: '#ff538a'
      },
      {
        id: 'send-email',
        type: 'action',
        title: 'Send Email to User',
        subtitle: 'Action',
        icon: 'custom_notification',
        iconBg: '#032d60'
      },
      {
        id: 'end',
        type: 'end',
        title: 'End',
        subtitle: '',
        icon: 'stop',
        iconBg: '#ea001e'
      }
    ];
  }
  
  render() {
    const modeClass = this.config.buildMode === 'test' ? 'test-mode' : 'build-mode';
    
    // Performance: Cache DOM queries
    let wrapper = this.cachedQueries.wrapper || this.container.querySelector('.flow-canvas-wrapper');
    let canvasContent = this.cachedQueries.canvasContent || this.container.querySelector('#flow-canvas-content');
    
    // Update cache
    if (wrapper && !this.cachedQueries.wrapper) {
      this.cachedQueries.wrapper = wrapper;
    }
    if (canvasContent && !this.cachedQueries.canvasContent) {
      this.cachedQueries.canvasContent = canvasContent;
    }
    
    if (!wrapper) {
      // First render - create full structure
      this.container.innerHTML = `
        <div class="flow-canvas-wrapper ${modeClass}">
          <div id="flow-panel-left-container" class="flow-panel-container"></div>
          <div class="flow-canvas-main">
            <div class="flow-canvas-content" id="flow-canvas-content">
              ${this.renderNodes()}
            </div>
            <div class="flow-canvas-zoom-controls" id="flow-canvas-zoom-controls">
              <div class="slds-button-group">
                <button class="slds-button slds-button_icon slds-button_icon-border" title="Zoom Out" data-action="zoom-out" id="canvas-zoom-out-button">
                  <svg class="slds-button__icon" aria-hidden="true">
                    <use href="#dash"></use>
                  </svg>
                  <span class="slds-assistive-text">Zoom Out</span>
                </button>
                <button class="slds-button slds-button_icon slds-button_icon-border" title="Fit to Canvas" data-action="zoom-fit" id="canvas-zoom-fit-button">
                  <svg class="slds-button__icon" aria-hidden="true">
                    <use href="#contract_alt"></use>
                  </svg>
                  <span class="slds-assistive-text">Fit to Canvas</span>
                </button>
                <button class="slds-button slds-button_icon slds-button_icon-border" title="Zoom In" data-action="zoom-in" id="canvas-zoom-in-button">
                  <svg class="slds-button__icon" aria-hidden="true">
                    <use href="#add"></use>
                  </svg>
                  <span class="slds-assistive-text">Zoom In</span>
                </button>
              </div>
            </div>
          </div>
          <div id="flow-panel-right-container" class="flow-panel-container"></div>
          <div id="run-loading-overlay" style="display: none;">
            <div class="run-loading-content">
              <div class="slds-spinner_container">
                <div class="slds-spinner slds-spinner_large slds-spinner_brand" role="status">
                  <span class="slds-assistive-text">Loading</span>
                  <div class="slds-spinner__dot-a"></div>
                  <div class="slds-spinner__dot-b"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
    // Update existing structure - preserve panel containers (never recreate them)
    // Only update the wrapper class and canvas content
    wrapper.className = `flow-canvas-wrapper ${modeClass}`;
    if (canvasContent) {
      // Update only the canvas content, preserving panels
      canvasContent.innerHTML = this.renderNodes();
      // Restore execution path styling after re-render
      this.updateConnectorStyles();
    } else {
        // Canvas content doesn't exist, create it without touching panel containers
        const canvasMain = wrapper.querySelector('.flow-canvas-main');
        if (canvasMain) {
          const existingZoomControls = canvasMain.querySelector('.flow-canvas-zoom-controls');
          canvasMain.innerHTML = `
            <div class="flow-canvas-content" id="flow-canvas-content">
              ${this.renderNodes()}
            </div>
            <div class="flow-canvas-zoom-controls" id="flow-canvas-zoom-controls">
              <div class="slds-button-group">
                <button class="slds-button slds-button_icon slds-button_icon-border" title="Zoom Out" data-action="zoom-out" id="canvas-zoom-out-button">
                  <svg class="slds-button__icon" aria-hidden="true">
                    <use href="#minus"></use>
                  </svg>
                  <span class="slds-assistive-text">Zoom Out</span>
                </button>
                <button class="slds-button slds-button_icon slds-button_icon-border" title="Fit to Canvas" data-action="zoom-fit" id="canvas-zoom-fit-button">
                  <svg class="slds-button__icon" aria-hidden="true">
                    <use href="#contract_alt"></use>
                  </svg>
                  <span class="slds-assistive-text">Fit to Canvas</span>
                </button>
                <button class="slds-button slds-button_icon slds-button_icon-border" title="Zoom In" data-action="zoom-in" id="canvas-zoom-in-button">
                  <svg class="slds-button__icon" aria-hidden="true">
                    <use href="#add"></use>
                  </svg>
                  <span class="slds-assistive-text">Zoom In</span>
                </button>
              </div>
            </div>
          `;
        }
      }
      
      // Ensure loading overlay exists (preserve if already there, create if not)
      let overlay = wrapper.querySelector('#run-loading-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'run-loading-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
          <div class="run-loading-content">
            <div class="slds-spinner_container">
              <div class="slds-spinner slds-spinner_large slds-spinner_brand" role="status">
                <span class="slds-assistive-text">Loading</span>
                <div class="slds-spinner__dot-a"></div>
                <div class="slds-spinner__dot-b"></div>
              </div>
            </div>
          </div>
        `;
        wrapper.appendChild(overlay);
      }
    }
    
    // Ensure zoom controls exist and are positioned correctly
    this.attachZoomListeners();
    this.updateZoomControlsPosition();
    this.updateZoomButtonState();
    
    // Update legend position after render (but only if not disabled)
    // Skip if panel is currently opening to avoid interference
    if (!this._legendUpdateDisabled) {
      this.updateLegendPosition();
    }
    
    // Reapply current zoom level to ensure consistency across mode switches
    // This ensures zoom works the same way in both build and test mode
    if (this.zoomLevel !== undefined) {
      this.applyZoom(this.zoomLevel);
    }
  }
  
  renderNodes() {
    let html = '<div class="flow-nodes-container">';
    
    this.config.nodes.forEach((node, index) => {
      const isLast = index === this.config.nodes.length - 1;
      const isSelected = this.config.selectedNodeId === node.id;
      
      html += this.renderNode(node, isSelected);
      
      if (!isLast) {
        html += this.renderConnector(index);
      }
    });
    
    html += '</div>';
    return html;
  }
  
  renderNode(node, isSelected) {
    const selectedClass = isSelected ? 'selected' : '';
    const iconClass = this.getIconClass(node.icon);
    
    // In Build mode, hide all badges
    const isBuildMode = this.config.buildMode === 'build';
    
    // Check if in test flow/scenario view
    // IMPORTANT: This is called during render, so it reflects the CURRENT state of currentTestView
    const isTestFlowOrScenarioView = typeof this.config.isTestFlowOrScenarioView === 'function' 
      ? this.config.isTestFlowOrScenarioView() 
      : false;
    
    // Check if this node is outside the test scope (before start or after latest end point)
    const nodeIndex = this.config.nodes.findIndex(n => n.id === node.id);
    const startIndex = this.testStartPoint ? this.config.nodes.findIndex(n => n.id === this.testStartPoint) : -1;
    
    // Check if node is after the end point (node is out of scope if it's after the end point)
    const endIndex = this.testEndPoint ? this.config.nodes.findIndex(n => n.id === this.testEndPoint) : -1;
    
    // Gray out elements before start point (if start point is set)
    const isBeforeStart = startIndex >= 0 && nodeIndex < startIndex;
    // Gray out elements after end point (if end point is set)
    const isAfterEnd = endIndex >= 0 && nodeIndex > endIndex;
    const isOutOfScope = isBeforeStart || isAfterEnd;
    // Apply out-of-scope class in test mode (even if not in Test Flow/Test Scenario view, for selective testing)
    const outOfScopeClass = (!isBuildMode && isOutOfScope) ? 'flow-node-out-of-scope' : '';
    
    
    // Check if this node is a test start or end point
    const isTestStartPoint = this.testStartPoint === node.id;
    const isTestEndPoint = this.testEndPoint === node.id;
    
    // Check if mock outputs are enabled for this node
    const nodeOutputs = this.outputs[node.id] || {};
    const mockOutputsEnabled = nodeOutputs.mockOutputs === true;
    const mockOutputsBadge = mockOutputsEnabled ? '<div class="flow-node-badge">Output Mocked</div>' : '';
    
    // Combine existing badge with mock outputs badge (only in Test mode)
    // Note: Test Start and Test End badges are shown on the connector, not on the element card
    const badges = [];
    if (!isBuildMode) {
      if (node.badge) {
        badges.push(`<div class="flow-node-badge">${node.badge}</div>`);
      }
      if (mockOutputsEnabled) {
        badges.push('<div class="flow-node-badge">Output Mocked</div>');
      }
    }
    const badgesHtml = badges.join('');
    
    // Add three-dot menu button - different options for Build vs Test mode
    let menuItems = '';
    if (isBuildMode) {
      // Build mode menu items
      menuItems = `
        <li class="slds-dropdown__item" role="presentation">
          <a href="javascript:void(0);" role="menuitem" data-action="copy-element" data-node-id="${node.id}">
            <span class="slds-truncate" title="Copy Element">Copy Element</span>
          </a>
        </li>
        <li class="slds-dropdown__item" role="presentation">
          <a href="javascript:void(0);" role="menuitem" data-action="cut-element" data-node-id="${node.id}">
            <span class="slds-truncate" title="Cut Element">Cut Element</span>
          </a>
        </li>
        <li class="slds-dropdown__item" role="presentation">
          <a href="javascript:void(0);" role="menuitem" data-action="delete-element" data-node-id="${node.id}">
            <span class="slds-truncate" title="Delete Element">Delete Element</span>
          </a>
        </li>
      `;
    } else {
      // Test mode menu items - show "Set Start Point Before" and "Set an End Point After"
      // Show these menu items when selective testing is enabled
      // For selective testing feature
      const enableSelectiveTesting = this.config.enableSelectiveTesting === true;
      
      // Show menu items when selective testing is enabled
      if (enableSelectiveTesting) {
        // Show context-aware menu items based on current start/end point status
        const startPointAction = isTestStartPoint ? 'remove-start-point' : 'set-start-point';
        const startPointLabel = isTestStartPoint ? 'Remove Start Point Before' : 'Set Start Point Before';
        const endPointAction = isTestEndPoint ? 'remove-end-point' : 'set-end-point';
        const endPointLabel = isTestEndPoint ? 'Remove End Point After' : 'Set an End Point After';
        
        // Check if current node is right before the end point or the End element - if so, disable "Set an End Point After"
        const currentNodeIndex = this.config.nodes.findIndex(n => n.id === node.id);
        const endPointIndex = this.testEndPoint ? this.config.nodes.findIndex(n => n.id === this.testEndPoint) : -1;
        const nextNode = currentNodeIndex >= 0 && currentNodeIndex < this.config.nodes.length - 1 
          ? this.config.nodes[currentNodeIndex + 1] 
          : null;
        // Check if next node is the End element (type === 'end') or if current node is right before the test end point
        const isRightBeforeEndElement = !isTestEndPoint && nextNode && nextNode.type === 'end';
        const isRightBeforeEndPoint = !isTestEndPoint && this.testEndPoint && currentNodeIndex >= 0 && endPointIndex >= 0 && currentNodeIndex + 1 === endPointIndex;
        const endPointDisabled = (isRightBeforeEndElement || isRightBeforeEndPoint) ? 'aria-disabled="true" class="slds-is-disabled"' : '';
        
        menuItems = `
          <li class="slds-dropdown__item" role="presentation">
            <a href="javascript:void(0);" role="menuitem" data-action="${startPointAction}" data-node-id="${node.id}">
              <span class="slds-truncate" title="${startPointLabel}">${startPointLabel}</span>
            </a>
          </li>
          <li class="slds-dropdown__item" role="presentation">
            <a href="javascript:void(0);" role="menuitem" data-action="${endPointAction}" data-node-id="${node.id}" ${endPointDisabled}>
              <span class="slds-truncate" title="${endPointLabel}">${endPointLabel}</span>
            </a>
          </li>
        `;
      }
    }
    
    // Show menu in Build mode or Test mode
    // In test mode, always show menu button (menu items will only appear in Test Flow or Test Scenario Detail view when selective testing is enabled)
    const isTestMode = this.config.buildMode === 'test';
    // isTestFlowOrScenarioView already declared above, reuse it
    const hasMenuItems = menuItems.trim().length > 0;
    // Show menu button if: (Build mode with menu items) OR (Test mode)
    const menuButton = (isBuildMode && hasMenuItems) || isTestMode ? `
      <div class="flow-node-menu-trigger">
        <button class="slds-button slds-button_icon slds-button_icon-default slds-button_icon-medium" type="button" title="More Actions" data-node-menu="${node.id}" aria-haspopup="true">
          <svg class="slds-button__icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5"/>
            <circle cx="8" cy="8" r="1.5"/>
            <circle cx="8" cy="13" r="1.5"/>
          </svg>
          <span class="slds-assistive-text">More Actions</span>
        </button>
        <div class="slds-dropdown slds-dropdown_right slds-dropdown_length-5 flow-node-menu-dropdown" style="display: none;">
          <ul class="slds-dropdown__list" role="menu">
            ${menuItems}
          </ul>
        </div>
      </div>
    ` : '';
    
    return `
      <div class="flow-node ${selectedClass} ${outOfScopeClass}" data-node-id="${node.id}">
        <div class="flow-node-card">
          <div class="flow-node-header">
            <div class="flow-node-icon" style="background-color: ${node.iconBg}">
              ${this.getIconSVG(node.icon)}
            </div>
            <div class="flow-node-text">
              <div class="flow-node-title">${node.title}</div>
              ${node.subtitle ? `<div class="flow-node-subtitle">${node.subtitle}</div>` : ''}
            </div>
            ${menuButton}
          </div>
          ${badgesHtml ? `<div class="flow-node-badges">${badgesHtml}</div>` : ''}
        </div>
      </div>
    `;
  }
  
  renderConnector(index) {
    // Check if this connector is part of the execution path
    const isExecuted = this.executionPath.includes(index);
    const executedClass = isExecuted ? 'flow-connector-line-executed' : '';
    
    // Check if this connector should show start or end badge
    // Connector at index i is below node i and above node i+1
    // Start badge: show on connector above the start point node (connector i where node i+1 is start point)
    // End badge: show on connector below the end point node (connector i where node i is end point)
    const nodeAfterConnector = this.config.nodes[index + 1];
    const nodeBeforeConnector = this.config.nodes[index];
    const isStartPoint = nodeAfterConnector && this.testStartPoint === nodeAfterConnector.id;
    const isEndPoint = nodeBeforeConnector && this.testEndPoint === nodeBeforeConnector.id;
    
    let badgeHtml = '';
    let hasBadge = false;
    let badgeType = null;
    if (isStartPoint) {
      hasBadge = true;
      badgeType = 'start';
      badgeHtml = `
        <div class="flow-connector-badge flow-connector-badge-start" data-badge-type="start" title="Double-click to remove">
          <svg class="slds-icon slds-icon_xx-small" aria-hidden="true">
            <use href="#play"></use>
          </svg>
          <span>Test Start</span>
        </div>
      `;
    } else if (isEndPoint) {
      hasBadge = true;
      badgeType = 'end';
      badgeHtml = `
        <div class="flow-connector-badge flow-connector-badge-end" data-badge-type="end" title="Double-click to remove">
          <svg class="slds-icon slds-icon_xx-small" aria-hidden="true">
            <use href="#stop"></use>
          </svg>
          <span>Test End</span>
        </div>
      `;
    }
    
    // Add class to make connector 2x longer if it has a badge
    const badgeClass = hasBadge ? 'flow-connector-with-badge' : '';
    
    // When there's a badge, split the line into two parts: above and below
    if (hasBadge) {
      return `
        <div class="flow-connector ${badgeClass}" data-connector-index="${index}" data-badge-type="${badgeType}">
          <div class="flow-connector-line flow-connector-line-above"></div>
          ${badgeHtml}
          <div class="flow-connector-line flow-connector-line-below"></div>
          <button class="flow-connector-button" title="Add Element">
            ${this.getIconSVG('add')}
          </button>
        </div>
      `;
    } else {
      return `
        <div class="flow-connector ${badgeClass}" data-connector-index="${index}">
          <div class="flow-connector-line ${executedClass}"></div>
          <button class="flow-connector-button" title="Add Element">
            ${this.getIconSVG('add')}
          </button>
          ${badgeHtml}
        </div>
      `;
    }
  }
  
  setExecutionPath(connectorIndices) {
    // Set which connectors are part of the execution path
    // Only apply success color when there are actual run results (connectorIndices provided)
    let executionPath = connectorIndices || [];
    
    // Only automatically add connectors below Start/above End if we have run results
    // (i.e., connectorIndices is provided and not empty)
    if (connectorIndices && connectorIndices.length > 0) {
      // Find Start and End badge positions
      const connectors = this.container.querySelectorAll('.flow-connector');
      let startConnectorIndex = -1;
      let endConnectorIndex = -1;
      
      connectors.forEach((connector, index) => {
        const badgeType = connector.dataset.badgeType;
        if (badgeType === 'start') {
          startConnectorIndex = index;
        } else if (badgeType === 'end') {
          endConnectorIndex = index;
        }
      });
      
      // Add connectors between Start and End badges to execution path
      // If both Start and End are set, only include connectors between them
      if (startConnectorIndex >= 0) {
        // Determine the upper bound: if End is set, stop before End; otherwise include all after Start
        const upperBound = endConnectorIndex >= 0 ? endConnectorIndex : connectors.length;
        for (let i = startConnectorIndex + 1; i < upperBound; i++) {
          // Don't include connector with End badge - it should be default color
          if (i !== endConnectorIndex && !executionPath.includes(i)) {
            executionPath.push(i);
          }
        }
      }
      
      // Add all connectors above End badge to execution path (if End is set but Start is not)
      // (but exclude the End badge connector itself)
      if (endConnectorIndex >= 0 && startConnectorIndex < 0) {
        for (let i = 0; i < endConnectorIndex; i++) {
          // Don't include connector with End badge - it should be default color
          if (i !== endConnectorIndex && !executionPath.includes(i)) {
            executionPath.push(i);
          }
        }
      }
      
      // Remove End badge connector from execution path (it should be default color)
      // Only its line-above should be success, not the connector itself
      if (endConnectorIndex >= 0) {
        executionPath = executionPath.filter(index => index !== endConnectorIndex);
      }
      
      // Remove any connectors that are after the End badge connector
      // Connectors after End should never be marked as executed
      if (endConnectorIndex >= 0) {
        executionPath = executionPath.filter(index => index < endConnectorIndex);
      }
    }
    
    this.executionPath = executionPath;
    // Re-render connectors to show execution path
    this.updateConnectorStyles();
  }
  
  updateConnectorStyles() {
    // Check if we have legacy execution path (for backward compatibility)
    const hasLegacyPath = this.executionPath && this.executionPath.length > 0;
    
    // Check if we have path highlights from test scenarios
    const hasPathHighlights = Object.keys(this.pathHighlights).length > 0;
    
    // Find Start and End badge positions first
    const connectors = this.container.querySelectorAll('.flow-connector');
    let startConnectorIndex = -1;
    let endConnectorIndex = -1;
    
    connectors.forEach((connector, index) => {
      const badgeType = connector.dataset.badgeType;
      if (badgeType === 'start') {
        startConnectorIndex = index;
      } else if (badgeType === 'end') {
        endConnectorIndex = index;
      }
    });
    
    // Build map of connector indices to their path highlight statuses
    // For overlapping paths, we track all statuses that apply to a connector
    const connectorStatusMap = {};
    
    if (hasPathHighlights) {
      Object.entries(this.pathHighlights).forEach(([scenarioId, highlight]) => {
        highlight.connectors.forEach(connectorIndex => {
          if (!connectorStatusMap[connectorIndex]) {
            connectorStatusMap[connectorIndex] = [];
          }
          connectorStatusMap[connectorIndex].push(highlight.status);
        });
      });
    }
    
    // Update connector line styles based on execution path and path highlights
    connectors.forEach((connector, index) => {
      const badgeType = connector.dataset.badgeType;
      
      // Connectors after End badge should never be marked as executed
      const isAfterEnd = endConnectorIndex >= 0 && index > endConnectorIndex;
      const isLegacyExecuted = !isAfterEnd && hasLegacyPath && this.executionPath.includes(index);
      
      // Get path highlight statuses for this connector
      const pathStatuses = connectorStatusMap[index] || [];
      
      if (badgeType) {
        // For connectors with badges, update both lines separately
        const lineAbove = connector.querySelector('.flow-connector-line-above');
        const lineBelow = connector.querySelector('.flow-connector-line-below');
        
        if (badgeType === 'start') {
          // Start badge: line below within this connector
          if (lineBelow) {
            this.applyPathHighlightStyles(lineBelow, pathStatuses, isLegacyExecuted && hasLegacyPath);
          }
          // Line above Start badge is never executed
          if (lineAbove) {
            this.clearPathHighlightStyles(lineAbove);
          }
        } else if (badgeType === 'end') {
          // End badge: line above within this connector
          if (lineAbove) {
            this.applyPathHighlightStyles(lineAbove, pathStatuses, isLegacyExecuted && hasLegacyPath);
          }
          // Line below End badge is never executed
          if (lineBelow) {
            this.clearPathHighlightStyles(lineBelow);
          }
        }
      } else {
        // For connectors without badges, update the single line
        const line = connector.querySelector('.flow-connector-line:not(.flow-connector-line-above):not(.flow-connector-line-below)');
        if (line) {
          if (isAfterEnd) {
            this.clearPathHighlightStyles(line);
          } else {
            this.applyPathHighlightStyles(line, pathStatuses, isLegacyExecuted && hasLegacyPath);
          }
        }
      }
    });
    
    // Always call renderLegend - it will handle showing/hiding based on test mode
    this.renderLegend();
  }
  
  // Apply path highlight styles to a connector line
  applyPathHighlightStyles(lineElement, pathStatuses, hasLegacyExecuted) {
    // Clear all path highlight classes first
    this.clearPathHighlightStyles(lineElement);
    
    // If we have path highlights, use those (prioritize over legacy)
    if (pathStatuses.length > 0) {
      // Remove duplicates and sort for consistent rendering
      const uniqueStatuses = [...new Set(pathStatuses)];
      
      // For overlapping paths, we'll render multiple colored segments
      // If all statuses are the same, use a single line with that status
      if (uniqueStatuses.length === 1) {
        const status = uniqueStatuses[0];
        lineElement.classList.add(`flow-connector-line-${status}`);
      } else {
        // Multiple different statuses - use multi-segment rendering
        // Store all statuses - we'll render them as separate colored segments
        lineElement.classList.add('flow-connector-line-multi');
        uniqueStatuses.forEach((status) => {
          lineElement.classList.add(`flow-connector-line-${status}`);
        });
        // Store the statuses as data attribute for CSS styling (sorted for consistency)
        lineElement.dataset.pathStatuses = uniqueStatuses.sort().join(',');
        
        // Create separate line segments for each status using pseudo-elements
        // We'll render them as overlapping segments offset by a few pixels
        uniqueStatuses.forEach((status, idx) => {
          if (idx > 0) {
            // For additional statuses, create a pseudo-element overlay
            // This is handled via CSS using the data-path-statuses attribute
          }
        });
      }
    } else if (hasLegacyExecuted) {
      // Legacy execution path (green for success)
      lineElement.classList.add('flow-connector-line-executed');
    }
  }
  
  // Clear all path highlight styles from a connector line
  clearPathHighlightStyles(lineElement) {
    if (!lineElement) return;
    
    // Remove all path highlight classes
    lineElement.classList.remove('flow-connector-line-executed');
    lineElement.classList.remove('flow-connector-line-passed');
    lineElement.classList.remove('flow-connector-line-failed');
    lineElement.classList.remove('flow-connector-line-error');
    lineElement.classList.remove('flow-connector-line-not-run');
    lineElement.classList.remove('flow-connector-line-multi');
    
    // Remove data attribute
    if (lineElement.dataset.pathStatuses) {
      delete lineElement.dataset.pathStatuses;
    }
  }
  
  // Render the path highlight legend
  renderLegend(skipContentQuery = false) {
    // Only render legend in test mode
    if (this.config.buildMode !== 'test') {
      // Remove legend if it exists and we're not in test mode
      const canvasMain = this.container?.querySelector('.flow-canvas-main');
      if (canvasMain) {
        const existingLegend = canvasMain.querySelector('.path-highlight-legend');
        if (existingLegend) {
          existingLegend.remove();
        }
      }
      return;
    }
    
    const canvasMain = this.container?.querySelector('.flow-canvas-main');
    
    if (!canvasMain) return;
    
    // Check if Test Scenarios list view is active (left panel contains test scenario list)
    // Skip this query if skipContentQuery is true (during panel opening to avoid interference)
    const leftPanel = this.container?.querySelector('#flow-panel-left-container');
    let hasTestScenarioList = false;
    let shouldShowLegend = false;
    
    if (!skipContentQuery && leftPanel) {
      hasTestScenarioList = leftPanel.querySelector('.test-scenario-list') !== null;
      // Only show legend if Test Scenarios list view is active
      shouldShowLegend = hasTestScenarioList;
    } else if (skipContentQuery && leftPanel) {
      // During panel opening, check window.testScenarioPanel to determine if it's Test Scenarios list view
      // This avoids querying panel content while still determining the view
      if (typeof window !== 'undefined' && window.testScenarioPanel) {
        const currentView = window.testScenarioPanel.config?.view;
        // Only show legend if in 'list' view (Test Scenarios list view), not 'testflow' or 'testscenario'
        shouldShowLegend = currentView === 'list';
      } else {
        // Can't determine view, don't show legend yet
        // It will be verified later by ensureLegendRendered()
        shouldShowLegend = false;
      }
    } else if (!leftPanel || !leftPanel.classList.contains('flow-panel-open')) {
      // Panel is closed - check if we're in Test Scenarios view (not Test Flow view)
      // Try to determine from window.testScenarioPanel if available
      if (typeof window !== 'undefined' && window.testScenarioPanel) {
        const currentView = window.testScenarioPanel.config?.view;
        // Only show legend if in 'list' view (Test Scenarios list view), not 'testflow' or 'testscenario'
        shouldShowLegend = currentView === 'list';
      } else {
        // Can't determine view, don't show legend
        shouldShowLegend = false;
      }
    }
    
    if (!shouldShowLegend) {
      // Remove legend if it exists and we shouldn't show it
      const existingLegend = canvasMain.querySelector('.path-highlight-legend');
      if (existingLegend) {
        existingLegend.remove();
      }
      return;
    }
    
    // Check if legend already exists (don't recreate if it does)
    let legend = canvasMain.querySelector('.path-highlight-legend');
    const isPanelOpen = leftPanel && leftPanel.classList.contains('flow-panel-open');
    const panelWidth = isPanelOpen ? (leftPanel.offsetWidth || 400) : 0;
    
    if (!legend) {
      // Create legend if it doesn't exist
      legend = document.createElement('div');
      legend.className = 'path-highlight-legend';
      legend.innerHTML = `
        <div class="path-highlight-legend-header">Path Highlight</div>
        <div class="path-highlight-legend-items">
          <div class="path-highlight-legend-item">
            <div class="path-highlight-legend-line path-highlight-legend-not-run"></div>
            <span class="path-highlight-legend-label">Not Run</span>
          </div>
          <div class="path-highlight-legend-item">
            <div class="path-highlight-legend-line path-highlight-legend-passed"></div>
            <span class="path-highlight-legend-label">Completed / Pass</span>
          </div>
          <div class="path-highlight-legend-item">
            <div class="path-highlight-legend-line path-highlight-legend-failed"></div>
            <span class="path-highlight-legend-label">Error / Fail</span>
          </div>
        </div>
      `;
      canvasMain.appendChild(legend);
      
      // If panel is already open, set position immediately without animation
      if (isPanelOpen && panelWidth > 0) {
        // Disable transition temporarily to avoid animation from left edge
        legend.classList.add('no-transition');
        legend.style.left = `${24 + panelWidth}px`;
        // Re-enable transition after a brief moment for future updates
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (legend) {
              legend.classList.remove('no-transition');
            }
          });
        });
      } else {
        // Panel is closed, position at default 24px
        legend.style.left = '24px';
      }
    } else {
      // Legend already exists - update position based on panel state
      // If panel is already open, set position immediately to avoid animation from left edge
      if (isPanelOpen && panelWidth > 0) {
        // Disable transition temporarily to avoid animation
        legend.classList.add('no-transition');
        legend.style.left = `${24 + panelWidth}px`;
        // Re-enable transition after a brief moment for future updates
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (legend) {
              legend.classList.remove('no-transition');
            }
          });
        });
      } else if (skipContentQuery) {
        // skipContentQuery is true and panel is closed
        legend.style.left = '24px';
      } else {
        // Panel might be opening/closing, use normal update with animation
        this.updateLegendPosition();
      }
    }
  }
  
  clearExecutionPath() {
    this.executionPath = [];
    this.pathHighlights = {};
    this.updateConnectorStyles();
  }
  
  // Set path highlights for multiple test scenarios
  setPathHighlights(scenarioHighlights) {
    // scenarioHighlights: Array of { scenarioId, status: 'passed'|'failed'|'error'|'not-run', connectors: [indices] }
    this.pathHighlights = {};
    
    scenarioHighlights.forEach(({ scenarioId, status, connectors }) => {
      if (scenarioId && connectors && connectors.length > 0) {
        // Respect start/end points if set
        const connectorsArray = this.filterConnectorsByTestScope(connectors);
        this.pathHighlights[scenarioId] = {
          status: status || 'not-run',
          connectors: connectorsArray
        };
      }
    });
    
    this.updateConnectorStyles();
    this.renderLegend();
  }
  
  // Filter connector indices by test scope (respecting start/end points)
  filterConnectorsByTestScope(connectorIndices) {
    const allConnectors = this.container.querySelectorAll('.flow-connector');
    let startConnectorIndex = -1;
    let endConnectorIndex = -1;
    
    allConnectors.forEach((connector, index) => {
      const badgeType = connector.dataset.badgeType;
      if (badgeType === 'start') {
        startConnectorIndex = index;
      } else if (badgeType === 'end') {
        endConnectorIndex = index;
      }
    });
    
    let filtered = [...connectorIndices];
    
    // Remove connectors before start point
    if (startConnectorIndex >= 0) {
      filtered = filtered.filter(index => index >= startConnectorIndex);
    }
    
    // Remove connectors after end point (but keep the end connector itself - its line-above should be highlighted)
    if (endConnectorIndex >= 0) {
      filtered = filtered.filter(index => index <= endConnectorIndex);
    }
    
    return filtered;
  }
  
  // Clear path highlights for specific scenarios (or all if no IDs provided)
  clearPathHighlights(scenarioIds = null) {
    if (scenarioIds === null) {
      this.pathHighlights = {};
    } else {
      scenarioIds.forEach(id => {
        delete this.pathHighlights[id];
      });
    }
    this.updateConnectorStyles();
    this.renderLegend();
  }
  
  getNodePropertiesContent(nodeId) {
    const selectedNode = this.config.nodes.find(n => n.id === nodeId);
    
    if (!selectedNode) {
      return '<div class="flow-sidebar-empty"><p>Select an element to configure</p></div>';
    }
    
    // Escape HTML to prevent XSS issues
    const escapeHtml = (text) => {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };
    
    const titleValue = escapeHtml(selectedNode.title);
    const nodeIdAttr = escapeHtml(selectedNode.id);
    // Show Outputs tab only in element configuration panel (right panel) when in Test Flow or Test Scenario Detail view
    // Note: This method (getNodePropertiesContent) is only called for the right panel, so Outputs tab will never appear in left panel
    const isTestFlowOrScenarioView = typeof this.config.isTestFlowOrScenarioView === 'function' 
      ? this.config.isTestFlowOrScenarioView() 
      : false;
    
    // In Test Mode, preserve the active tab state when switching between elements
    // If user was on Outputs tab, keep Outputs tab active; if on Properties tab, keep Properties tab active
    // Default to Outputs tab in test mode if no tab has been selected yet
    let activeTabName = null;
    if (isTestFlowOrScenarioView) {
      // Use stored active tab if available, otherwise default to 'outputs'
      activeTabName = this.activeTab || 'outputs';
    } else {
      // In build mode, always default to Properties tab
      activeTabName = 'properties';
    }
    
    const propertiesTabActive = activeTabName === 'properties' ? 'slds-is-active' : '';
    const outputsTabActive = activeTabName === 'outputs' ? 'slds-is-active' : '';
    const propertiesContentDisplay = activeTabName === 'properties' ? '' : 'display: none;';
    const outputsContentDisplay = activeTabName === 'outputs' ? '' : 'display: none;';
    const outputsTab = isTestFlowOrScenarioView 
      ? `
        <li class="slds-tabs_default__item ${outputsTabActive}" title="Outputs" role="presentation">
          <a class="slds-tabs_default__link flow-node-properties-tab" href="javascript:void(0);" role="tab" tabindex="${outputsTabActive ? '0' : '-1'}" aria-selected="${outputsTabActive ? 'true' : 'false'}" aria-controls="tab-outputs-${nodeIdAttr}" id="tab-outputs-${nodeIdAttr}__item" data-tab="outputs">Outputs</a>
        </li>
      `
      : '';
    
    // Determine if fields should be read-only based on build mode
    const isTestMode = this.config.buildMode === 'test';
    const readonlyAttr = isTestMode ? 'readonly' : '';
    const disabledAttr = isTestMode ? 'disabled' : '';
    
    return `
      <div class="flow-sidebar-content">
        <div class="slds-tabs_default">
          <ul class="slds-tabs_default__nav" role="tablist">
            <li class="slds-tabs_default__item ${propertiesTabActive}" title="Properties" role="presentation">
              <a class="slds-tabs_default__link flow-node-properties-tab" href="javascript:void(0);" role="tab" tabindex="${propertiesTabActive ? '0' : '-1'}" aria-selected="${propertiesTabActive ? 'true' : 'false'}" aria-controls="tab-properties-${nodeIdAttr}" id="tab-properties-${nodeIdAttr}__item" data-tab="properties">Properties</a>
            </li>
            ${outputsTab}
          </ul>
          <div id="tab-properties-${nodeIdAttr}" class="slds-tabs_default__content" role="tabpanel" aria-labelledby="tab-properties-${nodeIdAttr}__item" style="${propertiesContentDisplay}">
            <div class="slds-form-element">
              <label class="slds-form-element__label" for="node-title-${nodeIdAttr}">
                <span class="slds-form-element__label-text">Label</span>
              </label>
              <div class="slds-form-element__control">
                <input type="text" 
                       id="node-title-${nodeIdAttr}"
                       class="slds-input" 
                       value="${titleValue}" 
                       data-property="title"
                       ${readonlyAttr} />
              </div>
            </div>
          </div>
          ${isTestFlowOrScenarioView ? `
          <div id="tab-outputs-${nodeIdAttr}" class="slds-tabs_default__content" role="tabpanel" aria-labelledby="tab-outputs-${nodeIdAttr}__item" style="${outputsContentDisplay}">
            ${this.renderOutputsTab(selectedNode)}
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  renderOutputsTab(node) {
    // Outputs tab content - shows available outputs from the element
    // Load saved outputs if available
    const nodeOutputs = this.outputs[node.id] || {};
    const mockOutputsEnabled = nodeOutputs.mockOutputs !== undefined ? nodeOutputs.mockOutputs : false;
    const viewMode = nodeOutputs.viewMode || 'resource'; // 'resource' or 'code'
    const outputsValue = nodeOutputs.value || '';
    const isOverridden = nodeOutputs.overridden || false;
    
    // Resource view fields
    const resourceFields = [
      { id: 'text', label: 'Text', value: nodeOutputs.text || '' },
      { id: 'record', label: 'Record', value: nodeOutputs.record || '' },
      { id: 'recordCollection', label: 'RecordCollection', value: nodeOutputs.recordCollection || '' },
      { id: 'httpCalloutResponse', label: 'HTTPCalloutResponse', value: nodeOutputs.httpCalloutResponse || '' }
    ];
    
    const resourceViewSelected = viewMode === 'resource' ? 'slds-is-selected' : '';
    const codeViewSelected = viewMode === 'code' ? 'slds-is-selected' : '';
    
    return `
      <div class="flow-node-outputs">
        <div class="flow-node-outputs-content">
          <!-- Mock Outputs Toggle and View Mode Buttons -->
          <div class="slds-grid slds-grid_align-spread slds-m-bottom_medium">
            <div class="slds-form-element">
              <div class="slds-form-element__control">
                <label class="slds-checkbox_toggle slds-grid" for="mock-outputs-${node.id}">
                  <span class="slds-form-element__label slds-m-bottom_none">Mock Outputs</span>
                  <input type="checkbox" 
                         name="mock-outputs-${node.id}" 
                         id="mock-outputs-${node.id}"
                         class="slds-assistive-text"
                         data-node-outputs-toggle="${node.id}"
                         ${mockOutputsEnabled ? 'checked' : ''} />
                  <span class="slds-checkbox_faux_container" aria-live="assertive">
                    <span class="slds-checkbox_faux"></span>
                    <span class="slds-checkbox_on">Enabled</span>
                    <span class="slds-checkbox_off">Disabled</span>
                  </span>
                </label>
              </div>
            </div>
            <div class="slds-button-group" role="group">
              <button class="slds-button slds-button_icon slds-button_icon-border slds-button_first ${resourceViewSelected}" 
                      title="Resource View" 
                      data-node-outputs-view="${node.id}"
                      data-view-mode="resource"
                      aria-pressed="${viewMode === 'resource' ? 'true' : 'false'}">
                <svg class="slds-button__icon slds-button__icon-small" aria-hidden="true">
                  <use href="#variable"></use>
                </svg>
                <span class="slds-assistive-text">Resource View</span>
              </button>
              <button class="slds-button slds-button_icon slds-button_icon-border slds-button_last ${codeViewSelected}" 
                      title="Code View" 
                      data-node-outputs-view="${node.id}"
                      data-view-mode="code"
                      aria-pressed="${viewMode === 'code' ? 'true' : 'false'}">
                <svg class="slds-button__icon slds-button__icon-small" aria-hidden="true">
                  <use href="#apex"></use>
                </svg>
                <span class="slds-assistive-text">Code View</span>
              </button>
            </div>
          </div>
          
          ${isOverridden ? `
          <div class="slds-scoped-notification slds-scoped-notification_light slds-m-bottom_medium" role="status">
            <div class="slds-media">
              <div class="slds-media__body">
                <h2 class="slds-text-heading_small">Overridden with the last test run</h2>
              </div>
            </div>
          </div>
          ` : ''}
          
          ${viewMode === 'resource' ? `
          <!-- Resource View -->
          <div class="flow-outputs-resource-view">
            ${resourceFields.map(field => `
              <div class="slds-form-element slds-m-bottom_small">
                <label class="slds-form-element__label" for="output-${field.id}-${node.id}">
                  <span class="slds-form-element__label-text">${field.label}</span>
                </label>
                <div class="slds-form-element__control">
                  <input type="text" 
                         id="output-${field.id}-${node.id}" 
                         class="slds-input" 
                         data-node-outputs-field="${node.id}"
                         data-field-name="${field.id}"
                         value="${field.value}"
                         placeholder="Enter ${field.label}..."
                         ${!mockOutputsEnabled ? 'disabled' : ''} />
                </div>
              </div>
            `).join('')}
          </div>
          ` : `
          <!-- Code View -->
          <div class="flow-outputs-code-view">
            <div class="slds-form-element">
              <div class="slds-form-element__control">
                <textarea id="node-outputs-code-${node.id}" 
                          class="slds-textarea" 
                          rows="12" 
                          placeholder="Enter code..."
                          data-node-outputs-code="${node.id}"
                          ${!mockOutputsEnabled ? 'disabled' : ''}>${outputsValue}</textarea>
              </div>
            </div>
          </div>
          `}
        </div>
      </div>
    `;
  }
  
  updateNodeOutputs(nodeId, outputsData) {
    if (!nodeId) return;
    this.outputs[nodeId] = outputsData;
    // Notify parent about outputs change
    if (this.config.onOutputsChange) {
      this.config.onOutputsChange(nodeId, outputsData);
    }
  }
  
  getNodeOutputs(nodeId) {
    return this.outputs[nodeId] || null;
  }
  
  getAllOutputs() {
    return this.outputs;
  }
  
  setOutputs(outputs) {
    this.outputs = outputs || {};
    // Performance: Batch node display updates using requestAnimationFrame
    if (this.config.nodes && this.config.nodes.length > 0) {
      if (this.renderDebounceTimeout) {
        cancelAnimationFrame(this.renderDebounceTimeout);
      }
      this.renderDebounceTimeout = requestAnimationFrame(() => {
        this.config.nodes.forEach(node => {
          this.updateNodeDisplay(node.id);
        });
      });
    }
  }
  
  refreshPanel() {
    // Refresh the panel content if a node is selected and panel is open
    // Only update the right panel (element configuration panel), never the left panel
    if (this.config.selectedNodeId) {
      const content = this.getNodePropertiesContent(this.config.selectedNodeId);
      // Performance: Cache panel queries
      let rightPanelContainer = this.cachedQueries.rightPanelContainer;
      if (!rightPanelContainer) {
        rightPanelContainer = document.querySelector('#flow-panel-right-container');
        if (rightPanelContainer) {
          this.cachedQueries.rightPanelContainer = rightPanelContainer;
        }
      }
      const panelBody = rightPanelContainer ? rightPanelContainer.querySelector('.flow-panel-body') : null;
      if (panelBody) {
        panelBody.innerHTML = content;
        // Re-attach tab listeners
        this.attachTabListeners();
      }
    }
  }
  
  attachTabListeners() {
    // Attach listeners for tab switching (this is called after panel content is updated)
    // Only attach listeners in the right panel (element configuration panel)
    // Performance: Use cached query
    const rightPanelContainer = this.cachedQueries.rightPanelContainer || document.querySelector('#flow-panel-right-container');
    if (rightPanelContainer && !this.cachedQueries.rightPanelContainer) {
      this.cachedQueries.rightPanelContainer = rightPanelContainer;
    }
    if (!rightPanelContainer) return;
    const tabLinks = rightPanelContainer.querySelectorAll('.flow-node-properties-tab');
    tabLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = link.dataset.tab;
        this.switchPropertiesTab(tabName);
      });
    });
  }
  
  getIconClass(icon) {
    const iconMap = {
      'play': 'utility:play',
      'stop': 'utility:stop',
      'record_create': 'standard:record_create',
      'record_update': 'standard:record_update',
      'custom_notification': 'standard:custom_notification'
    };
    return iconMap[icon] || icon;
  }
  
  getIconSVG(icon) {
    // Use SLDS icon references
    const iconMap = {
      'play': '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#play"></use></svg>',
      'stop': '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#stop"></use></svg>',
      'record_create': '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#record_create"></use></svg>',
      'record_update': '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#record_update"></use></svg>',
      'custom_notification': '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#custom_notification"></use></svg>',
      'add': '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#add"></use></svg>',
      'variable': '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#variable"></use></svg>',
      'apex': '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#apex"></use></svg>',
      'info': '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#info"></use></svg>'
    };
    return iconMap[icon] || '<svg class="slds-icon slds-icon_default" aria-hidden="true"><use href="#' + icon + '"></use></svg>';
  }
  
  attachEventListeners() {
    // Note: Event listeners use event delegation, so they don't need to be re-attached
    // Only attach once to avoid duplicates
    if (this.eventListenersAttached) {
      return;
    }
    this.eventListenersAttached = true;
    
    // Node click handlers
    this.container.addEventListener('click', (e) => {
      // Handle node menu button clicks FIRST (before node click handler)
      // This prevents the node click from firing when clicking the menu button
      const menuButton = e.target.closest('[data-node-menu]');
      if (menuButton) {
        // Prevent double-toggling if we're already processing a toggle
        if (this._dropdownToggleInProgress) {
          return;
        }
        
        e.stopPropagation();
        e.preventDefault();
        e.stopImmediatePropagation(); // Prevent other click handlers from firing
        const nodeId = menuButton.dataset.nodeMenu;
        
        // Set flag to prevent double-toggling
        this._dropdownToggleInProgress = true;
        // Find the dropdown - it's a sibling of the button within the trigger container
        const triggerContainer = menuButton.closest('.flow-node-menu-trigger');
        const dropdown = triggerContainer ? triggerContainer.querySelector('.flow-node-menu-dropdown') : menuButton.nextElementSibling;
        if (dropdown && dropdown.classList.contains('flow-node-menu-dropdown')) {
          // Find the parent flow-node
          const flowNode = menuButton.closest('.flow-node');
          
          // Check if dropdown has menu items
          const list = dropdown.querySelector('.slds-dropdown__list');
          const hasItems = list && list.children.length > 0;
          
          // Check what the view state is
          const isTestFlowOrScenarioView = typeof this.config.isTestFlowOrScenarioView === 'function' 
            ? this.config.isTestFlowOrScenarioView() 
            : false;
          const enableSelectiveTesting = this.config.enableSelectiveTesting === true;
          const isBuildMode = this.config.buildMode === 'build';
          
          // Performance: Cache menu state to avoid unnecessary regeneration
          // Only refresh if menu is empty or if we're in test mode with selective testing enabled
          // In build mode, only populate if empty (menu items don't change)
          // Include testEndPoint in cache key so menu updates when end point changes
          const menuCacheKey = `menu-${nodeId}-${this.config.buildMode}-${isTestFlowOrScenarioView}-${this.testEndPoint || 'none'}`;
          const cachedMenuState = this.cachedQueries[menuCacheKey];
          const shouldRefreshMenu = !hasItems || 
            (this.config.buildMode === 'test' && enableSelectiveTesting && !cachedMenuState);
          
          if (shouldRefreshMenu) {
            // Dynamically populate menu items
            if (list) {
              if (isBuildMode) {
                // Build mode menu items
                list.innerHTML = `
                  <li class="slds-dropdown__item" role="presentation">
                    <a href="javascript:void(0);" role="menuitem" data-action="copy-element" data-node-id="${nodeId}">
                      <span class="slds-truncate" title="Copy Element">Copy Element</span>
                    </a>
                  </li>
                  <li class="slds-dropdown__item" role="presentation">
                    <a href="javascript:void(0);" role="menuitem" data-action="cut-element" data-node-id="${nodeId}">
                      <span class="slds-truncate" title="Cut Element">Cut Element</span>
                    </a>
                  </li>
                  <li class="slds-dropdown__item" role="presentation">
                    <a href="javascript:void(0);" role="menuitem" data-action="delete-element" data-node-id="${nodeId}">
                      <span class="slds-truncate" title="Delete Element">Delete Element</span>
                    </a>
                  </li>
                `;
              } else if (this.config.buildMode === 'test' && enableSelectiveTesting) {
                // Test mode menu items - show context-aware options based on current start/end point status
                const isTestStartPoint = this.testStartPoint === nodeId;
                const isTestEndPoint = this.testEndPoint === nodeId;
                const startPointAction = isTestStartPoint ? 'remove-start-point' : 'set-start-point';
                const startPointLabel = isTestStartPoint ? 'Remove Start Point Before' : 'Set Start Point Before';
                const endPointAction = isTestEndPoint ? 'remove-end-point' : 'set-end-point';
                const endPointLabel = isTestEndPoint ? 'Remove End Point After' : 'Set an End Point After';
                
                // Check if current node is right before the end point or the End element - if so, disable "Set an End Point After"
                const currentNodeIndex = this.config.nodes.findIndex(n => n.id === nodeId);
                const endPointIndex = this.testEndPoint ? this.config.nodes.findIndex(n => n.id === this.testEndPoint) : -1;
                const nextNode = currentNodeIndex >= 0 && currentNodeIndex < this.config.nodes.length - 1 
                  ? this.config.nodes[currentNodeIndex + 1] 
                  : null;
                // Check if next node is the End element (type === 'end') or if current node is right before the test end point
                const isRightBeforeEndElement = !isTestEndPoint && nextNode && nextNode.type === 'end';
                const isRightBeforeEndPoint = !isTestEndPoint && this.testEndPoint && currentNodeIndex >= 0 && endPointIndex >= 0 && currentNodeIndex + 1 === endPointIndex;
                const endPointDisabled = (isRightBeforeEndElement || isRightBeforeEndPoint) ? 'aria-disabled="true" class="slds-is-disabled"' : '';
                
                list.innerHTML = `
                  <li class="slds-dropdown__item" role="presentation">
                    <a href="javascript:void(0);" role="menuitem" data-action="${startPointAction}" data-node-id="${nodeId}">
                      <span class="slds-truncate" title="${startPointLabel}">${startPointLabel}</span>
                    </a>
                  </li>
                  <li class="slds-dropdown__item" role="presentation">
                    <a href="javascript:void(0);" role="menuitem" data-action="${endPointAction}" data-node-id="${nodeId}" ${endPointDisabled}>
                      <span class="slds-truncate" title="${endPointLabel}">${endPointLabel}</span>
                    </a>
                  </li>
                `;
                // Cache menu state
                this.cachedQueries[menuCacheKey] = true;
              } else {
                console.warn('FlowCanvas: Dropdown has no menu items', {
                  nodeId,
                  buildMode: this.config.buildMode,
                  isTestFlowOrScenarioView,
                  enableSelectiveTesting,
                  listHTML: list ? list.innerHTML : 'no list',
                  hasCallback: typeof this.config.isTestFlowOrScenarioView === 'function'
                });
              }
            }
          }
          
          // Verify menu items exist before opening dropdown
          const finalList = dropdown.querySelector('.slds-dropdown__list');
          const hasMenuItems = finalList && finalList.children.length > 0;
          
          if (!hasMenuItems) {
            console.warn('FlowCanvas: Cannot open dropdown - no menu items', {
              nodeId,
              buildMode: this.config.buildMode,
              enableSelectiveTesting,
              isTestFlowOrScenarioView
            });
            return; // Don't open dropdown if there are no menu items
          }
          
          // Close all other dropdowns first and remove their z-index boost
          document.querySelectorAll('.flow-node-menu-dropdown').forEach(dd => {
            if (dd !== dropdown) {
              dd.style.display = 'none';
              const otherFlowNode = dd.closest('.flow-node');
              if (otherFlowNode) {
                otherFlowNode.classList.remove('dropdown-open');
              }
            }
          });
          
          // Toggle this dropdown
          // Check if dropdown is currently visible by checking the inline style (most reliable)
          // The inline style is what we control, so check that first
          const inlineDisplay = dropdown.style.display;
          const isCurrentlyVisible = inlineDisplay === 'block';
          
          // Toggle: if currently visible, hide it; if hidden, show it
          const willBeVisible = !isCurrentlyVisible;
          
          // Always set display explicitly to ensure it's visible/hidden
          dropdown.style.display = willBeVisible ? 'block' : 'none';
          
          // If opening, also ensure visibility and opacity are set (CSS will handle this via [style*="block"] selector)
          if (willBeVisible) {
            // Use requestAnimationFrame to ensure the dropdown is rendered before checking position
            requestAnimationFrame(() => {
              // Force a reflow to ensure the dropdown is positioned correctly
              void dropdown.offsetHeight;
            });
          }
          
          // Add/remove class to flow-node to boost its z-index when dropdown is open
          if (flowNode) {
            if (willBeVisible) {
              flowNode.classList.add('dropdown-open');
            } else {
              flowNode.classList.remove('dropdown-open');
            }
          }
          
          // Clear the toggle flag after a short delay to allow the dropdown to render
          setTimeout(() => {
            this._dropdownToggleInProgress = false;
          }, 100);
        } else {
          console.warn('FlowCanvas: Dropdown not found', {
            nodeId,
            triggerContainer: !!triggerContainer,
            dropdown: !!dropdown
          });
          this._dropdownToggleInProgress = false;
        }
        return;
      }
      
      // Handle menu item clicks FIRST (before other handlers)
      // This ensures menu item actions are handled even if they're inside a dropdown
      // Check for clicks on menu items (could be on the link or the span inside)
      const menuItem = e.target.closest('[data-action]') || 
                       (e.target.closest('.slds-dropdown__item') && e.target.closest('.slds-dropdown__item').querySelector('[data-action]'));
      
      if (menuItem && menuItem.dataset.nodeId && menuItem.dataset.action) {
        e.preventDefault();
        e.stopPropagation();
        const action = menuItem.dataset.action;
        const nodeId = menuItem.dataset.nodeId;
        
        // Close dropdown
        const dropdown = menuItem.closest('.flow-node-menu-dropdown');
        if (dropdown) {
          dropdown.style.display = 'none';
          // Remove dropdown-open class from parent node
          const flowNode = menuItem.closest('.flow-node');
          if (flowNode) {
            flowNode.classList.remove('dropdown-open');
          }
        }
        
        // Handle Test mode actions
        if (action === 'set-start-point') {
          this.setTestStartPoint(nodeId);
          return;
        } else if (action === 'remove-start-point') {
          this.removeTestStartPoint();
          return;
        } else if (action === 'set-end-point') {
          // Check if this node is right above the End element - if so, don't set the End point
          // "Set an End Point After" sets the end point to the current node (end badge appears on connector below it)
          // If current node is right before the end point node, we shouldn't allow setting end point to current node
          // Also check if the menu item was disabled (additional safety check)
          const menuItem = e.target.closest('[data-action="set-end-point"]');
          if (menuItem && (menuItem.classList.contains('slds-is-disabled') || menuItem.getAttribute('aria-disabled') === 'true')) {
            return; // Menu item is disabled, don't proceed
          }
          
          // Check if current node is right before the End element or the end point node
          const currentNodeIndex = this.config.nodes.findIndex(n => n.id === nodeId);
          
          if (currentNodeIndex >= 0 && currentNodeIndex < this.config.nodes.length - 1) {
            const nextNode = this.config.nodes[currentNodeIndex + 1];
            
            // Check if the next node is the End element (type === 'end')
            if (nextNode && nextNode.type === 'end') {
              return; // Don't set the end point if the next element is the End element
            }
            
            // Also check if the next node is the current test end point
            if (this.testEndPoint) {
              const endPointIndex = this.config.nodes.findIndex(n => n.id === this.testEndPoint);
              if (endPointIndex >= 0 && currentNodeIndex + 1 === endPointIndex) {
                return; // Don't set the end point if current element is right above the End element
              }
            }
          }
          this.setTestEndPoint(nodeId);
          return;
        } else if (action === 'remove-end-point') {
          this.removeTestEndPoint(nodeId);
          return;
        }
        
        // Handle Build mode actions
        if (action === 'copy-element') {
          this.config.onNodeCopy?.(nodeId);
          return;
        } else if (action === 'cut-element') {
          this.config.onNodeCut?.(nodeId);
          return;
        } else if (action === 'delete-element') {
          if (confirm('Are you sure you want to delete this element?')) {
            this.removeNode(nodeId);
          }
          return;
        }
        
        return; // Don't process further if we handled the menu item
      }
      
      // Also check if clicking on the menu trigger container or dropdown (but not menu items, which are handled above)
      if (e.target.closest('.flow-node-menu-trigger') || 
          (e.target.closest('.flow-node-menu-dropdown') && !e.target.closest('[data-action]'))) {
        return;
      }
      
      // Node click handlers
      const nodeElement = e.target.closest('.flow-node');
      if (nodeElement) {
        const nodeId = nodeElement.dataset.nodeId;
        this.selectNode(nodeId);
        this.config.onNodeClick?.(nodeId);
        return;
      }
      
      // Connector button click
      const connectorButton = e.target.closest('.flow-connector-button');
      if (connectorButton) {
        const connector = e.target.closest('.flow-connector');
        const index = parseInt(connector.dataset.connectorIndex);
        this.config.onConnectorClick?.(index);
        return;
      }
      
      // Property input changes (delegated from panel)
      const input = e.target.closest('[data-property]');
      if (input) {
        if (input.tagName === 'INPUT' || input.tagName === 'SELECT') {
          const property = input.dataset.property;
          const value = input.value;
          if (this.config.selectedNodeId) {
            this.updateNodeProperty(this.config.selectedNodeId, property, value);
          }
        }
      }
      
      // Handle tab clicks
      const tabButton = e.target.closest('.flow-node-properties-tab');
      if (tabButton) {
        e.preventDefault();
        const tabName = tabButton.dataset.tab;
        this.switchPropertiesTab(tabName);
        return;
      }
      
      // Close dropdowns when clicking outside
      if (!e.target.closest('.flow-node-menu-trigger') && !e.target.closest('.flow-node-menu-dropdown')) {
        document.querySelectorAll('.flow-node-menu-dropdown').forEach(dd => {
          dd.style.display = 'none';
        });
      }
      
      // Deselect node if clicking outside nodes, connectors, panels, and other UI elements
      // This should run after all specific handlers have been checked
      const isClickOnNode = e.target.closest('.flow-node');
      const isClickOnConnector = e.target.closest('.flow-connector');
      const isClickOnPanel = e.target.closest('.flow-panel-container') || e.target.closest('.flow-panel');
      const isClickOnHeader = e.target.closest('#builder-header-container');
      const isClickOnModal = e.target.closest('[id*="modal"]') || e.target.closest('.slds-modal');
      const isClickOnDropdown = e.target.closest('.flow-node-menu-dropdown');
      const isClickOnMenuTrigger = e.target.closest('.flow-node-menu-trigger');
      
      if (!isClickOnNode && !isClickOnConnector && !isClickOnPanel && !isClickOnHeader && !isClickOnModal && !isClickOnDropdown && !isClickOnMenuTrigger) {
        // Click is outside UI elements, deselect node
        this.deselectNode();
      }
    });
    
    // Listen for outputs changes (textarea, inputs, toggle, view mode)
    // Performance: Debounce input handlers to avoid excessive updates
    document.addEventListener('input', (e) => {
      // Code view textarea
      const outputsTextarea = e.target.closest('[data-node-outputs-code]');
      if (outputsTextarea) {
        const nodeId = outputsTextarea.dataset.nodeOutputsCode;
        const value = outputsTextarea.value;
        if (nodeId) {
          // Debounce updates
          if (this.outputsInputDebounce[nodeId]) {
            clearTimeout(this.outputsInputDebounce[nodeId]);
          }
          this.outputsInputDebounce[nodeId] = setTimeout(() => {
            // Cache node existence check
            const cacheKey = `node-exists-${nodeId}`;
            let nodeExists = this.cachedQueries[cacheKey];
            if (nodeExists === undefined) {
              nodeExists = !!this.container.querySelector(`[data-node-id="${nodeId}"]`);
              this.cachedQueries[cacheKey] = nodeExists;
            }
            if (nodeExists) {
              const currentOutputs = this.outputs[nodeId] || {};
              this.updateNodeOutputs(nodeId, { ...currentOutputs, value: value });
            }
          }, 300); // 300ms debounce for textarea
        }
        return;
      }
      
      // Resource view input fields
      const outputsField = e.target.closest('[data-node-outputs-field]');
      if (outputsField) {
        const nodeId = outputsField.dataset.nodeOutputsField;
        const fieldName = outputsField.dataset.fieldName;
        const value = outputsField.value;
        if (nodeId) {
          // Debounce updates
          const debounceKey = `${nodeId}-${fieldName}`;
          if (this.outputsInputDebounce[debounceKey]) {
            clearTimeout(this.outputsInputDebounce[debounceKey]);
          }
          this.outputsInputDebounce[debounceKey] = setTimeout(() => {
            // Cache node existence check
            const cacheKey = `node-exists-${nodeId}`;
            let nodeExists = this.cachedQueries[cacheKey];
            if (nodeExists === undefined) {
              nodeExists = !!this.container.querySelector(`[data-node-id="${nodeId}"]`);
              this.cachedQueries[cacheKey] = nodeExists;
            }
            if (nodeExists) {
              const currentOutputs = this.outputs[nodeId] || {};
              this.updateNodeOutputs(nodeId, { ...currentOutputs, [fieldName]: value });
            }
          }, 200); // 200ms debounce for input fields
        }
        return;
      }
    });
    
    // Listen for checkbox toggle changes
    document.addEventListener('change', (e) => {
      const toggleCheckbox = e.target.closest('[data-node-outputs-toggle]');
      if (toggleCheckbox) {
        const nodeId = toggleCheckbox.dataset.nodeOutputsToggle;
        const checked = toggleCheckbox.checked;
        if (nodeId && this.container.querySelector(`[data-node-id="${nodeId}"]`)) {
          const currentOutputs = this.outputs[nodeId] || {};
          // Update outputs: set mockOutputs to true if checked, remove it if unchecked
          const updatedOutputs = { ...currentOutputs };
          if (checked) {
            updatedOutputs.mockOutputs = true;
          } else {
            delete updatedOutputs.mockOutputs;
          }
          this.updateNodeOutputs(nodeId, updatedOutputs);
          
          // Enable/disable inputs immediately when toggle changes
          if (this.config.selectedNodeId === nodeId) {
            // Find the right panel container to scope our selectors
            const rightPanelContainer = document.querySelector('#flow-panel-right-container');
            if (rightPanelContainer) {
              // Update resource view inputs
              const resourceInputs = rightPanelContainer.querySelectorAll(`[data-node-outputs-field="${nodeId}"]`);
              resourceInputs.forEach(input => {
                input.disabled = !checked;
              });
              
              // Update code view textarea
              const codeTextarea = rightPanelContainer.querySelector(`[data-node-outputs-code="${nodeId}"]`);
              if (codeTextarea) {
                codeTextarea.disabled = !checked;
              }
            }
            
            // Refresh the panel to ensure everything is in sync
            this.refreshPanel();
          }
          
          // Update the node display to show/hide the "Output Mocked" badge
          this.updateNodeDisplay(nodeId);
        }
        return;
      }
    });
    
    // Listen for view mode button clicks
    // Note: View mode buttons should always be enabled, regardless of Mock Outputs state
    // Users can switch between resource view and code view in both enabled and disabled states
    // Use document.addEventListener for event delegation since buttons are in dynamically generated panel content
    document.addEventListener('click', (e) => {
      // Handle clicks on the button or any of its children (SVG, use elements, etc.)
      const viewButton = e.target.closest('[data-node-outputs-view]');
      if (viewButton && !viewButton.disabled) {
        e.preventDefault();
        e.stopPropagation();
        const nodeId = viewButton.dataset.nodeOutputsView;
        const viewMode = viewButton.dataset.viewMode;
        
        if (nodeId && viewMode && (viewMode === 'resource' || viewMode === 'code')) {
          // Verify the node exists
          if (this.container && this.container.querySelector(`[data-node-id="${nodeId}"]`)) {
            const currentOutputs = this.outputs[nodeId] || {};
            // Update the view mode
            const updatedOutputs = { ...currentOutputs, viewMode: viewMode };
            this.updateNodeOutputs(nodeId, updatedOutputs);
            
            // Refresh the panel to show the new view
            // The refreshPanel() will regenerate content with correct disabled state for inputs
            // based on mockOutputs value, while view mode buttons remain enabled
            if (this.config.selectedNodeId === nodeId) {
              this.refreshPanel();
            }
          }
        }
        return;
      }
    });
    
    // Listen for zoom control button clicks
    this.container.addEventListener('click', (e) => {
      const zoomButton = e.target.closest('[data-action^="zoom-"]');
      if (zoomButton) {
        e.preventDefault();
        e.stopPropagation();
        const action = zoomButton.dataset.action;
        switch (action) {
          case 'zoom-in':
            this.zoomIn();
            break;
          case 'zoom-out':
            this.zoomOut();
            break;
          case 'zoom-fit':
            this.zoomFit();
            break;
        }
        return;
      }
    });
    
    // Listen for property changes from the panel (event delegation)
    document.addEventListener('change', (e) => {
      const input = e.target.closest('[data-property]');
      if (input && this.container.contains(input) || 
          (this.container.querySelector('.flow-canvas-wrapper') && 
           document.querySelector('#flow-panel-container')?.contains(input))) {
        if (input.tagName === 'INPUT' || input.tagName === 'SELECT') {
          const property = input.dataset.property;
          const value = input.value;
          if (this.config.selectedNodeId) {
            this.updateNodeProperty(this.config.selectedNodeId, property, value);
          }
        }
      }
    });
    
    // Handle double-click on start/end point badges to remove them
    this.container.addEventListener('dblclick', (e) => {
      const badge = e.target.closest('.flow-connector-badge[data-badge-type]');
      if (badge) {
        e.preventDefault();
        e.stopPropagation();
        const badgeType = badge.dataset.badgeType;
        
        if (badgeType === 'start') {
          this.removeTestStartPoint();
        } else if (badgeType === 'end') {
          this.removeTestEndPoint();
        }
      }
    });
  }
  
  switchPropertiesTab(tabName) {
    // Store the active tab state (for preserving tab selection when switching elements in test mode)
    this.activeTab = tabName;
    
    // Find the right panel body container (element configuration panel only)
    // Outputs tab should only exist in the right panel, never in the left panel
    const rightPanelContainer = document.querySelector('#flow-panel-right-container');
    const panelBody = rightPanelContainer ? rightPanelContainer.querySelector('.flow-panel-body') : null;
    if (!panelBody) return;
    
    const tabItems = panelBody.querySelectorAll('.slds-tabs_default__item');
    const tabLinks = panelBody.querySelectorAll('.slds-tabs_default__link');
    const tabPanels = panelBody.querySelectorAll('.slds-tabs_default__content');
    
    // Remove active class from all tabs and hide all panels
    tabItems.forEach(item => {
      item.classList.remove('slds-is-active');
    });
    tabLinks.forEach(link => {
      link.setAttribute('tabindex', '-1');
      link.setAttribute('aria-selected', 'false');
    });
    
    // Add active class to selected tab and show its content
    const selectedLink = panelBody.querySelector(`[data-tab="${tabName}"]`);
    const selectedPanel = panelBody.querySelector(`[id^="tab-${tabName}"]`);
    
    // Hide all panels except the selected one - this preserves content
    tabPanels.forEach(panel => {
      const panelId = panel.getAttribute('id') || '';
      if (panelId.startsWith(`tab-${tabName}`)) {
        // Show the selected panel
        panel.style.display = 'block';
      } else {
        // Hide other panels
        panel.style.display = 'none';
      }
    });
    
    if (selectedLink) {
      const parentItem = selectedLink.closest('.slds-tabs_default__item');
      if (parentItem) {
        parentItem.classList.add('slds-is-active');
      }
      selectedLink.setAttribute('tabindex', '0');
      selectedLink.setAttribute('aria-selected', 'true');
      selectedLink.focus();
    }
    
    // Ensure selected panel is visible (in case it had inline style="display: none;")
    if (selectedPanel) {
      selectedPanel.style.display = 'block';
    }
  }
  
  selectNode(nodeId) {
    this.config.selectedNodeId = nodeId;
    this.updateSelection();
    this.notifyNodeSelected(nodeId);
  }
  
  deselectNode() {
    this.config.selectedNodeId = null;
    this.updateSelection();
  }
  
  updateSelection() {
    const nodes = this.container.querySelectorAll('.flow-node');
    nodes.forEach(node => {
      if (node.dataset.nodeId === this.config.selectedNodeId) {
        node.classList.add('selected');
      } else {
        node.classList.remove('selected');
      }
    });
  }
  
  notifyNodeSelected(nodeId) {
    // This will be handled by the parent component that manages the panel
    if (this.config.onNodeSelected) {
      this.config.onNodeSelected(nodeId);
    }
  }
  
  updateNodeProperty(nodeId, property, value) {
    const node = this.config.nodes.find(n => n.id === nodeId);
    if (node) {
      node[property] = value;
      // Re-render the node
      this.updateNodeDisplay(nodeId);
      // Notify of change (for Build mode Save button)
      if (this.config.onChange && this.config.buildMode === 'build') {
        this.config.onChange();
      }
    }
  }
  
  updateNodeDisplay(nodeId) {
    const node = this.config.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Performance: Cache query if not already cached
    const cacheKey = `node-${nodeId}`;
    let nodeElement = this.cachedQueries[cacheKey];
    
    if (!nodeElement) {
      // Find the node element - try multiple selectors to ensure we find it in all views
      // First try in the canvas content area (most common case)
      nodeElement = document.querySelector(`#flow-canvas-content [data-node-id="${nodeId}"]`);
      // If not found, try in the container directly
      if (!nodeElement) {
        nodeElement = this.container.querySelector(`[data-node-id="${nodeId}"]`);
      }
      // If still not found, try document-wide (for edge cases)
      if (!nodeElement) {
        nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
      }
      // Cache the result
      if (nodeElement) {
        this.cachedQueries[cacheKey] = nodeElement;
      }
    }
    
    if (nodeElement && nodeElement.classList.contains('flow-node')) {
      const isSelected = this.config.selectedNodeId === nodeId;
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.renderNode(node, isSelected);
      const newCard = tempDiv.querySelector('.flow-node-card');
      const oldCard = nodeElement.querySelector('.flow-node-card');
      if (newCard && oldCard) {
        // Replace the card to update the badge (Output Mocked badge will be shown/hidden based on mockOutputs)
        oldCard.replaceWith(newCard);
        // Invalidate cache since DOM changed
        delete this.cachedQueries[cacheKey];
      }
    }
  }
  
  updateAllNodeDisplays() {
    // Update all nodes to reflect start/end point changes (badges, etc.)
    // Use requestAnimationFrame to batch DOM updates
    if (this.renderDebounceTimeout) {
      cancelAnimationFrame(this.renderDebounceTimeout);
    }
    
    this.renderDebounceTimeout = requestAnimationFrame(() => {
      this.config.nodes.forEach(node => {
        this.updateNodeDisplay(node.id);
      });
    });
  }
  
  addNode(node, index) {
    this.config.nodes.splice(index + 1, 0, node);
    // Performance: Only re-render canvas content, not entire structure
    this.renderNodesOnly();
    // Notify of change (for Build mode Save button)
    if (this.config.onChange && this.config.buildMode === 'build') {
      this.config.onChange();
    }
  }
  
  removeNode(nodeId) {
    this.config.nodes = this.config.nodes.filter(n => n.id !== nodeId);
    if (this.config.selectedNodeId === nodeId) {
      this.config.selectedNodeId = null;
    }
    // Performance: Only re-render canvas content, not entire structure
    this.renderNodesOnly();
    // Notify of change (for Build mode Save button)
    if (this.config.onChange && this.config.buildMode === 'build') {
      this.config.onChange();
    }
  }
  
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    // Only re-render if necessary (e.g., mode change)
    if (newConfig.buildMode !== undefined) {
      this.render();
    }
  }
  
  setBuildMode(mode) {
    this.config.buildMode = mode;
    // Clear execution path when switching to build mode
    if (mode === 'build') {
      this.clearExecutionPath();
    }
    // Performance: Only re-render if mode actually changed
    this.render();
    
    // Ensure connector styles are updated immediately after mode switch
    // Use requestAnimationFrame to ensure DOM is ready and force immediate repaint
    requestAnimationFrame(() => {
      this.updateConnectorStyles();
      // Force a reflow to ensure the browser repaints immediately
      if (this.container) {
        void this.container.offsetHeight;
      }
      // Always call renderLegend after mode switch - it will remove legend if not in test mode
      this.renderLegend();
    });
    
    // If a node is selected and panel is open, refresh the panel content to show/hide Outputs tab
    if (this.config.selectedNodeId) {
      // Trigger update through the onNodeSelected callback
      this.notifyNodeSelected(this.config.selectedNodeId);
    }
  }
  
  updateTestViewState() {
    // Clear execution path if not in test flow or test scenario view
    const isTestView = typeof this.config.isTestFlowOrScenarioView === 'function' 
      ? this.config.isTestFlowOrScenarioView() 
      : false;
    
    if (!isTestView) {
      this.clearExecutionPath();
    }
    
    // Performance: Only update node displays instead of full re-render
    // This updates menu items when view state changes
    this.updateAllNodeDisplays();
    
    // Refresh panel content when test view state changes to show/hide Outputs tab
    if (this.config.selectedNodeId) {
      this.notifyNodeSelected(this.config.selectedNodeId);
    }
  }
  
  renderNodesOnly() {
    // Performance: Only re-render the nodes container, not the entire canvas structure
    const canvasContent = this.cachedQueries.canvasContent || this.container.querySelector('#flow-canvas-content');
    if (canvasContent) {
      canvasContent.innerHTML = this.renderNodes();
      // Clear node-related caches since DOM changed
      Object.keys(this.cachedQueries).forEach(key => {
        if (key.startsWith('node-') || key.startsWith('node-exists-')) {
          delete this.cachedQueries[key];
        }
      });
      // Restore execution path styling after re-render (preserves success color lines if execution path exists)
      this.updateConnectorStyles();
    } else {
      // Fallback to full render if canvas content doesn't exist
      this.render();
    }
  }
  
  invalidateCache() {
    // Clear all cached queries when major DOM changes occur
    this.cachedQueries = {};
  }
  
  setTestStartPoint(nodeId) {
    // Check if we're in Run Result tab - if so, switch to Setup and clear execution path
    this.handleStartEndPointChange();
    
    // If there's already a start point, it moves to the new node (only one start point allowed)
    this.testStartPoint = nodeId;
    // Performance: Invalidate menu cache since start point affects menu items
    this.invalidateMenuCache();
    // Performance: Re-render nodes and connectors (badges are on connectors)
    // Use renderNodesOnly to avoid full re-render but still update connectors
    this.renderNodesOnly();
    // Ensure connector styles are updated after re-render (removes execution path highlights)
    this.updateConnectorStyles();
  }
  
  setTestEndPoint(nodeId) {
    // Check if we're in Run Result tab - if so, switch to Setup and clear execution path
    this.handleStartEndPointChange();
    
    // If there's already an end point, it moves to the new node (only one end point allowed)
    this.testEndPoint = nodeId;
    // Performance: Invalidate menu cache since end point affects menu items
    // Also invalidate all menu caches to ensure disabled states are updated
    this.invalidateMenuCache();
    // Clear all menu caches to force re-render with updated disabled states
    Object.keys(this.cachedQueries).forEach(key => {
      if (key.startsWith('menu-')) {
        delete this.cachedQueries[key];
      }
    });
    // Performance: Re-render nodes and connectors (badges are on connectors)
    // Use renderNodesOnly to avoid full re-render but still update connectors
    this.renderNodesOnly();
    // Ensure connector styles are updated after re-render (removes execution path highlights)
    this.updateConnectorStyles();
  }
  
  invalidateMenuCache() {
    // Clear menu cache when start/end points change (affects menu items)
    Object.keys(this.cachedQueries).forEach(key => {
      if (key.startsWith('menu-')) {
        delete this.cachedQueries[key];
      }
    });
  }
  
  handleStartEndPointChange() {
    // Always clear execution path when start/end points change
    // This removes path highlights and resets lines to default neutral color and thickness
    this.clearExecutionPath();
    
    // Check if we're currently in Run Result tab
    const rundetailsTab = document.querySelector('#tab-rundetails__item');
    const isInRunResult = rundetailsTab && rundetailsTab.classList.contains('slds-is-active');
    
    if (isInRunResult) {
      // Switch to Setup tab when in Run Result view
      // Try to use TestScenarioPanel's switchTab method if available
      if (typeof window !== 'undefined' && window.testScenarioPanel && typeof window.testScenarioPanel.switchTab === 'function') {
        window.testScenarioPanel.switchTab('setup');
      } else {
        // Fallback: click the Setup tab directly
        const setupTab = document.querySelector('#tab-setup__item');
        if (setupTab) {
          setupTab.click();
        }
      }
    }
  }
  
  removeTestStartPoint() {
    // Check if we're in Run Result tab - if so, switch to Setup and clear execution path
    this.handleStartEndPointChange();
    
    // Remove the start point
    this.testStartPoint = null;
    // Performance: Re-render nodes and connectors (badges are on connectors)
    this.renderNodesOnly();
    // Ensure connector styles are updated after re-render (removes execution path highlights)
    this.updateConnectorStyles();
  }
  
  removeTestEndPoint(nodeId) {
    // Check if we're in Run Result tab - if so, switch to Setup and clear execution path
    this.handleStartEndPointChange();
    
    // Remove the end point (only one allowed, so just clear it)
    this.testEndPoint = null;
    // Performance: Re-render nodes and connectors (badges are on connectors)
    this.renderNodesOnly();
    // Ensure connector styles are updated after re-render (removes execution path highlights)
    this.updateConnectorStyles();
  }
  
  clearTestStartPoint() {
    this.testStartPoint = null;
    // Performance: Re-render nodes and connectors (badges are on connectors)
    this.renderNodesOnly();
  }
  
  clearTestEndPoint() {
    // Clear the end point
    this.testEndPoint = null;
    // Performance: Re-render nodes and connectors (badges are on connectors)
    this.renderNodesOnly();
  }
  
  clearAllTestEndPoints() {
    // Clear the end point (only one allowed)
    this.testEndPoint = null;
    this.render();
    this.attachEventListeners();
  }
  
  getTestScope() {
    // Return array of node IDs that are within the test scope
    // If no start or end points are set, all nodes are in scope
    if (!this.testStartPoint && !this.testEndPoint) {
      return this.config.nodes.map(n => n.id);
    }
    
    // Find start index (default to 0 if no start point)
    const startIndex = this.testStartPoint ? this.config.nodes.findIndex(n => n.id === this.testStartPoint) : 0;
    
    // Find the end point index (nodes from start to the end point are in scope)
    const endIndex = this.testEndPoint ? this.config.nodes.findIndex(n => n.id === this.testEndPoint) : this.config.nodes.length - 1;
    
    return this.config.nodes.slice(startIndex, endIndex + 1).map(n => n.id);
  }
  
  // Zoom methods
  getCanvasContent() {
    return this.container?.querySelector('#flow-canvas-content');
  }
  
  applyZoom(zoomLevel) {
    const content = this.getCanvasContent();
    const canvasMain = this.container?.querySelector('.flow-canvas-main');
    const wrapper = this.container?.querySelector('.flow-canvas-wrapper');
    if (content && canvasMain) {
      const previousZoom = this.zoomLevel;
      this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, zoomLevel));
      content.style.transform = `scale(${this.zoomLevel})`;
      content.style.transformOrigin = 'center center';
      
      // Also scale the background dots (both size and spacing) from the same focal point
      if (wrapper && wrapper.classList.contains('build-mode')) {
        const baseBackgroundSize = 32;
        const baseDotSize = 1;
        const scaledSize = baseBackgroundSize * this.zoomLevel;
        const scaledDotSize = baseDotSize * this.zoomLevel;
        canvasMain.style.backgroundSize = `${scaledSize}px ${scaledSize}px`;
        // Update the dot size in the radial gradient
        canvasMain.style.backgroundImage = `radial-gradient(circle, #A0A0A0 ${scaledDotSize}px, transparent ${scaledDotSize}px)`;
        // Ensure background is positioned from center to maintain same focal point
        canvasMain.style.backgroundPosition = 'center center';
        canvasMain.style.backgroundRepeat = 'repeat';
      } else if (wrapper && wrapper.classList.contains('test-mode')) {
        // In test mode, explicitly clear background image and size to prevent dots from appearing
        canvasMain.style.backgroundImage = 'none';
        canvasMain.style.backgroundSize = '';
        canvasMain.style.backgroundPosition = '';
        canvasMain.style.backgroundRepeat = '';
      }
    }
    this.updateZoomButtonState();
  }
  
  zoomIn() {
    this.isZoomManuallyChanged = true;
    this.applyZoom(this.zoomLevel * this.zoomFactor);
  }
  
  zoomOut() {
    this.isZoomManuallyChanged = true;
    this.applyZoom(this.zoomLevel / this.zoomFactor);
  }
  
  zoomFit() {
    if (this.isZoomManuallyChanged) {
      // Reset zoom to 1
      this.isZoomManuallyChanged = false;
      this.applyZoom(1);
    } else {
      // Fit to canvas (calculate optimal zoom to fit all content)
      const content = this.getCanvasContent();
      const wrapper = this.container?.querySelector('.flow-canvas-main');
      if (content && wrapper) {
        const contentRect = content.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        
        // Calculate zoom to fit content in viewport (with some padding)
        const scaleX = (wrapperRect.width - 96) / contentRect.width; // 96px padding (48px * 2)
        const scaleY = (wrapperRect.height - 96) / contentRect.height;
        const fitZoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
        
        this.isZoomManuallyChanged = false;
        this.applyZoom(Math.max(this.minZoom, fitZoom));
      }
    }
  }
  
  updateZoomButtonState() {
    // Update the fit/reset zoom button based on zoom state
    const fitButton = document.getElementById('canvas-zoom-fit-button');
    const zoomInButton = document.getElementById('canvas-zoom-in-button');
    
    if (fitButton) {
      const icon = fitButton.querySelector('svg use');
      const assistiveText = fitButton.querySelector('.slds-assistive-text');
      
      if (this.isZoomManuallyChanged) {
        // Show "Reset Zoom" (expand_alt icon) when user manually zoomed
        if (icon) {
          icon.setAttribute('href', '#expand_alt');
        }
        if (assistiveText) {
          assistiveText.textContent = 'Reset Zoom';
        }
        fitButton.title = 'Reset Zoom';
      } else {
        // Show "Fit to Canvas" (contract_alt icon) when not manually changed
        if (icon) {
          icon.setAttribute('href', '#contract_alt');
        }
        if (assistiveText) {
          assistiveText.textContent = 'Fit to Canvas';
        }
        fitButton.title = 'Fit to Canvas';
      }
    }
    
    // Disable zoom in at default size (zoom level 1) or above
    if (zoomInButton) {
      if (this.zoomLevel >= 1) {
        zoomInButton.disabled = true;
      } else {
        zoomInButton.disabled = false;
      }
    }
  }
  
  updateZoomControlsPosition() {
    // Update zoom controls position based on left panel width
    const zoomControls = this.container?.querySelector('.flow-canvas-zoom-controls');
    const leftPanel = this.container?.querySelector('#flow-panel-left-container');
    
    if (zoomControls && leftPanel) {
      const panelWidth = leftPanel.classList.contains('flow-panel-open') 
        ? leftPanel.offsetWidth || 400 
        : 0;
      // Position: 24px margin + panel width (when open)
      zoomControls.style.left = `${24 + panelWidth}px`;
    }
  }
  
  updateLegendPosition() {
    // Only update legend position in test mode
    if (this.config.buildMode !== 'test') {
      // Remove legend if it exists and we're not in test mode
      const legend = this.container?.querySelector('.path-highlight-legend');
      if (legend) {
        legend.remove();
      }
      return;
    }
    
    // Update legend position based on left panel width
    // IMPORTANT: This method should NEVER query panel content to avoid interfering with event listeners
    
    // CRITICAL: Don't update if legend updates are disabled (during panel opening)
    // Exit immediately without ANY DOM queries
    if (this._legendUpdateDisabled) {
      return; // Skip update entirely during critical period - no DOM queries at all
    }
    
    // Use requestAnimationFrame to ensure DOM is ready and make it fully async
    requestAnimationFrame(() => {
      // Check flag again after async operation
      if (this._legendUpdateDisabled) {
        return; // Still disabled, skip
      }
      
      // Double-check we're still in test mode
      if (this.config.buildMode !== 'test') {
        const legend = this.container?.querySelector('.path-highlight-legend');
        if (legend) {
          legend.remove();
        }
        return;
      }
      
      const leftPanel = this.container?.querySelector('#flow-panel-left-container');
      
      if (!leftPanel) return;
      
      // Check flag one more time before doing any operations
      if (this._legendUpdateDisabled) {
        return;
      }
      
      const legend = this.container?.querySelector('.path-highlight-legend');
      
      // Only update position if legend already exists
      // Never query panel content here to avoid interference
      if (legend && !this._legendUpdateDisabled) {
        const isPanelOpen = leftPanel.classList.contains('flow-panel-open');
        
        // Position correctly based on panel state to avoid overlap
        if (isPanelOpen) {
          // Panel is open: push legend to avoid overlap (like zoom controls)
          const panelWidth = leftPanel.offsetWidth || 400;
          // Position: 24px margin + panel width
          legend.style.left = `${24 + panelWidth}px`;
        } else {
          // Panel is closed: keep legend at 24px
          legend.style.left = '24px';
        }
      }
    });
  }
  
  // Separate method to ensure legend is rendered when Test Scenarios list view is active
  // This should only be called AFTER panel is fully rendered and event listeners are attached
  ensureLegendRendered() {
    // Only call this after panel is fully rendered and event listeners are attached
    if (this.config.buildMode !== 'test') return;
    
    // Don't query panel content while legend updates are disabled (during panel opening)
    if (this._legendUpdateDisabled) {
      // Legend updates disabled - don't query panel content
      // Will be handled when updates are re-enabled
      return;
    }
    
    setTimeout(() => {
      // Check flag again after async operation
      if (this._legendUpdateDisabled) {
        return;
      }
      
      const leftPanel = this.container?.querySelector('#flow-panel-left-container');
      if (!leftPanel) return;
      
      // Only check/test scenario list if panel is open and stable
      const isPanelOpen = leftPanel.classList.contains('flow-panel-open');
      if (!isPanelOpen) return; // Don't query panel content if panel is closed
      
      // Check if Test Scenarios list view is active (only if panel is open)
      const hasTestScenarioList = leftPanel.querySelector('.test-scenario-list') !== null;
      const legend = this.container?.querySelector('.path-highlight-legend');
      
      // If Test Scenarios list view is active and legend doesn't exist, render it
      if (hasTestScenarioList && !legend) {
        this.renderLegend();
      } else if (legend) {
        // Update legend position after panel is open
        this.updateLegendPosition();
      }
    }, 500); // Delay to ensure everything is complete
  }
  
  attachZoomListeners() {
    const canvasMain = this.container?.querySelector('.flow-canvas-main');
    if (canvasMain && !this.zoomWheelListener) {
      this.zoomWheelListener = (e) => {
        e.preventDefault();
        if (e.deltaY > 0) {
          // Scroll down = zoom out
          this.isZoomManuallyChanged = true;
          this.applyZoom(this.zoomLevel / this.zoomFactor);
        } else {
          // Scroll up = zoom in
          this.isZoomManuallyChanged = true;
          this.applyZoom(this.zoomLevel * this.zoomFactor);
        }
      };
      canvasMain.addEventListener('wheel', this.zoomWheelListener, { passive: false });
    }
    
    // Observe left panel for open/close changes to update zoom controls position
    const leftPanel = this.container?.querySelector('#flow-panel-left-container');
    if (leftPanel && !this.zoomPositionObserver) {
      // Store references to track state
      this._panelOpeningTimeout = null;
      this._panelOpening = false;
      this._panelOpeningTime = 0;
      this._legendUpdateDisabled = false; // Flag to disable legend updates during panel opening
      this._observerCallbackPending = false; // Flag to prevent multiple callbacks from running
      
      this.zoomPositionObserver = new MutationObserver((mutations) => {
        // CRITICAL: Make entire callback asynchronous and debounced
        // Prevent multiple callbacks from running simultaneously
        if (this._observerCallbackPending || this._legendUpdateDisabled) {
          return; // Skip if callback is already pending or updates are disabled
        }
        
        this._observerCallbackPending = true;
        
        // Use setTimeout to push execution to next event loop cycle
        // This ensures the callback doesn't interfere with synchronous operations
        setTimeout(() => {
          this._observerCallbackPending = false;
          
          // Check if updates are still disabled (might have changed during async operation)
          if (this._legendUpdateDisabled) {
            return;
          }
          
          // Always update zoom controls position (safe - doesn't query panel content)
          this.updateZoomControlsPosition();
          
          // Check panel state
          const isPanelOpening = leftPanel.classList.contains('flow-panel-open');
          const wasOpening = this._panelOpening;
          this._panelOpening = isPanelOpening;
          
          // CRITICAL: If panel just started opening, render legend immediately with correct position
          if (isPanelOpening && !wasOpening) {
            // Panel just started opening - mark flag immediately
            this._panelOpeningTime = Date.now();
            this._legendUpdateDisabled = true;
            
            // Clear any pending timeout
            if (this._panelOpeningTimeout) {
              clearTimeout(this._panelOpeningTimeout);
            }
            
            // Render and position legend immediately when panel opens (no delay)
            // Pass skipContentQuery=true to avoid querying panel content during opening
            // renderLegend will check window.testScenarioPanel to determine if it's Test Scenarios list view
            if (this.config.buildMode === 'test') {
              // Render legend immediately - it will check if it's Test Scenarios list view
              this.renderLegend(true);
            }
            
            // Re-enable legend updates after a delay to ensure event listeners are attached
            this._panelOpeningTimeout = setTimeout(() => {
              // Double-check flag is still disabled (safety check)
              if (this._legendUpdateDisabled && leftPanel.classList.contains('flow-panel-open')) {
                this._legendUpdateDisabled = false;
                // Update legend position after re-enabling (may need to query panel content now)
                setTimeout(() => {
                  this.updateLegendPosition();
                  this.ensureLegendRendered();
                }, 100);
              }
              this._panelOpeningTimeout = null;
            }, 4000); // Delay to ensure event listeners are attached, but legend is already shown
            
            // Exit after immediate legend render
            return;
          }
          
          // If panel is closing, re-enable legend updates and update position
          if (!isPanelOpening && wasOpening) {
            // Panel closing - clear any pending timeout and re-enable immediately
            if (this._panelOpeningTimeout) {
              clearTimeout(this._panelOpeningTimeout);
              this._panelOpeningTimeout = null;
            }
            
            // Re-enable legend updates immediately when panel closes
            this._legendUpdateDisabled = false;
            
            // Update legend position after panel closes
            setTimeout(() => {
              this.updateLegendPosition();
            }, 100);
            return;
          }
          
          // Normal operation - verify legend should be shown and update position if not disabled
          // This check is redundant but added for safety
          if (!this._legendUpdateDisabled) {
            // Re-render legend to verify it should be shown (checks for test scenarios list view)
            this.renderLegend();
          }
        }, 0); // Push to next event loop cycle
      });
      
      this.zoomPositionObserver.observe(leftPanel, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: false
      });
      
      // Add ResizeObserver to watch for width changes during panel resize
      // This ensures zoom controls and legend move in real-time with no delay
      if (typeof ResizeObserver !== 'undefined' && !this.panelResizeObserver) {
        let resizeTimeout = null;
        
        this.panelResizeObserver = new ResizeObserver(() => {
          const isResizing = leftPanel.classList.contains('resizing');
          const zoomControls = this.container?.querySelector('.flow-canvas-zoom-controls');
          const legend = this.container?.querySelector('.path-highlight-legend');
          
          // Add/remove no-transition class based on resizing state
          if (isResizing) {
            if (zoomControls) {
              zoomControls.classList.add('no-transition');
            }
            if (legend) {
              legend.classList.add('no-transition');
            }
          } else {
            // Use timeout to remove class after resize completes (smooth transition when done)
            if (resizeTimeout) {
              clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(() => {
              if (zoomControls) {
                zoomControls.classList.remove('no-transition');
              }
              if (legend) {
                legend.classList.remove('no-transition');
              }
            }, 50); // Small delay to ensure resize is complete
          }
          
          // Update positions immediately during resize (no delays)
          this.updateZoomControlsPosition();
          
          // Update legend position in test mode (even if disabled, to handle panel opening)
          if (this.config.buildMode === 'test') {
            if (legend && leftPanel) {
              const isPanelOpen = leftPanel.classList.contains('flow-panel-open');
              if (isPanelOpen) {
                const panelWidth = leftPanel.offsetWidth || 400;
                legend.style.left = `${24 + panelWidth}px`;
              } else {
                legend.style.left = '24px';
              }
            }
          } else if (legend) {
            // Remove legend if we're not in test mode
            legend.remove();
          }
        });
        
        this.panelResizeObserver.observe(leftPanel);
      }
    }
  }
}

// Export for use in prototype
if (typeof window !== 'undefined') {
  window.FlowCanvas = FlowCanvas;
}


