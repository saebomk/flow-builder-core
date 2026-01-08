# Flow Builder Core

Core components for Salesforce Flow Builder UI: Builder Header, Flow Canvas, and Flow Panels.

## Components

- **BuilderHeader** - Header and toolbar component for the flow builder
- **FlowCanvas** - Canvas component that displays flow elements as connected nodes
- **FlowPanel** - Side panel component that can open on left or right side of the canvas

## Architecture

```
flow-builder
  ├── flow-builder-header
  ├── flow-builder-toolbar
  └── flow-canvas
      ├── flow-panel (left)
      ├── flow-element-container
      └── flow-panel (right)
```

## Development Guidelines

- **Use SLDS 1 Components**: When developing new features or components, primarily use Salesforce Lightning Design System (SLDS) version 1 components or follow the established SLDS 1 patterns in the codebase for consistency with the Salesforce UI framework.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Open `http://localhost:8080` in your browser

## Usage

### BuilderHeader

```javascript
const builderHeader = new BuilderHeader('#builder-header-container', {
  appName: 'Flow Builder',
  flowName: 'My Flow',
  buildMode: 'build', // or 'test'
  onToolbox: () => { /* handle toolbox click */ },
  onModeToggle: (mode) => { /* handle mode toggle */ }
});
```

### FlowCanvas

```javascript
const flowCanvas = new FlowCanvas('#flow-canvas-container', {
  nodes: [
    {
      id: 'start',
      type: 'start',
      title: 'Record-Triggered Flow',
      subtitle: 'Start',
      icon: 'play',
      iconBg: '#0176d3'
    }
  ],
  onNodeSelected: (nodeId) => { /* handle node selection */ }
});
```

### FlowPanel

```javascript
const flowPanel = new FlowPanel('#flow-panel-container', {
  position: 'right', // or 'left'
  title: 'Element Properties',
  onClose: () => { /* handle close */ }
});

flowPanel.open('right', 'Element Properties', '<div>Content</div>');
```
