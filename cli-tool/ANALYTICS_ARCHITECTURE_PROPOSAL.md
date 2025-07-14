# Analytics Dashboard - Proposed Modular Architecture

## Current Problems

### Backend (`analytics.js` - 3000+ lines):
- **Monolithic file**: Everything in one class
- **Mixed responsibilities**: Data processing, API routes, file watching, process detection
- **Hard to maintain**: Adding features requires editing the same massive file
- **No separation of concerns**: UI logic mixed with business logic

### Frontend (`analytics-web/index.html` - 2000+ lines):
- **Everything in HTML**: JavaScript, CSS, and HTML all mixed
- **No modularity**: All functions in global scope
- **Difficult testing**: Can't unit test individual components
- **Performance issues**: Loads all code at once

## Proposed Modular Architecture

### Backend Structure

```
src/analytics/
├── server/
│   ├── AnalyticsServer.js           # Main Express server
│   ├── routes/                      # API route modules
│   │   ├── index.js                 # Route aggregator
│   │   ├── dataRoutes.js           # /api/data endpoints
│   │   ├── stateRoutes.js          # /api/conversation-state
│   │   ├── sessionRoutes.js        # /api/session/* endpoints
│   │   └── chartRoutes.js          # /api/charts endpoints
│   └── middleware/
│       ├── cors.js                 # CORS handling
│       └── errorHandler.js         # Error middleware
├── core/
│   ├── ConversationAnalyzer.js     # Core data analysis
│   ├── ProcessDetector.js          # Claude process detection
│   ├── StateCalculator.js          # Conversation state logic
│   └── FileWatcher.js              # File system watching
├── data/
│   ├── ConversationLoader.js       # Load .jsonl files
│   ├── DataCache.js                # Caching layer
│   └── DataValidator.js            # Data validation
├── notifications/
│   ├── NotificationManager.js      # Browser notifications
│   └── WebSocketServer.js          # Real-time updates
└── utils/
    ├── debounce.js                 # Utility functions
    ├── logger.js                   # Logging utilities
    └── pathUtils.js                # Path manipulation
```

### Frontend Structure

```
src/analytics-web/
├── index.html                      # Main HTML (minimal)
├── assets/
│   ├── css/
│   │   ├── main.css               # Main styles
│   │   ├── dashboard.css          # Dashboard-specific
│   │   ├── charts.css             # Chart styling
│   │   └── components.css         # Component styles
│   └── js/
│       ├── main.js                # App initialization
│       ├── config.js              # Configuration
│       └── utils/
│           ├── api.js             # API communication
│           ├── dom.js             # DOM utilities
│           └── formatting.js      # Data formatting
├── components/
│   ├── Dashboard.js               # Main dashboard component
│   ├── ConversationTable.js      # Sessions table
│   ├── SessionDetail.js          # Session detail view
│   ├── Charts.js                  # Chart components
│   ├── Statistics.js             # Stats display
│   └── NotificationButton.js     # Notification controls
├── services/
│   ├── DataService.js             # Data fetching service
│   ├── StateService.js            # State management
│   ├── ChartService.js            # Chart management
│   └── WebSocketService.js       # Real-time updates
└── stores/
    ├── ConversationStore.js       # Conversation data
    ├── StateStore.js              # UI state
    └── SettingsStore.js           # User preferences
```

## Implementation Plan

### Phase 1: Backend Modularization

#### 1.1 Extract Core Classes
```javascript
// src/analytics/core/ConversationAnalyzer.js
class ConversationAnalyzer {
  constructor(claudeDir) {
    this.claudeDir = claudeDir;
    this.dataCache = new DataCache();
  }
  
  async analyzeConversations() {
    // Extract from current loadInitialData()
  }
  
  async updateConversation(filePath) {
    // Incremental updates
  }
}

// src/analytics/core/StateCalculator.js
class StateCalculator {
  determineConversationState(messages, lastModified, runningProcess) {
    // Extract current state logic
  }
  
  quickStateCalculation(conversation, runningProcesses) {
    // Extract quick state logic
  }
}
```

#### 1.2 Separate API Routes
```javascript
// src/analytics/routes/stateRoutes.js
const express = require('express');
const router = express.Router();

router.get('/conversation-state', async (req, res) => {
  // Extract from current /api/conversation-state
});

module.exports = router;

// src/analytics/routes/index.js
const dataRoutes = require('./dataRoutes');
const stateRoutes = require('./stateRoutes');

module.exports = (app) => {
  app.use('/api', dataRoutes);
  app.use('/api', stateRoutes);
};
```

#### 1.3 Main Server Orchestration
```javascript
// src/analytics/server/AnalyticsServer.js
class AnalyticsServer {
  constructor() {
    this.app = express();
    this.analyzer = new ConversationAnalyzer();
    this.stateCalculator = new StateCalculator();
    this.processDetector = new ProcessDetector();
  }
  
  async initialize() {
    await this.setupMiddleware();
    await this.setupRoutes();
    await this.setupWebSockets();
    await this.startServer();
  }
}
```

### Phase 2: Frontend Modularization

#### 2.1 Component-Based Architecture
```javascript
// src/analytics-web/components/Dashboard.js
class Dashboard {
  constructor(container) {
    this.container = container;
    this.dataService = new DataService();
    this.stateService = new StateService();
  }
  
  async initialize() {
    await this.render();
    await this.bindEvents();
    await this.startDataFlow();
  }
  
  render() {
    this.container.innerHTML = this.getTemplate();
  }
}

// src/analytics-web/components/ConversationTable.js
class ConversationTable {
  constructor(container, dataService) {
    this.container = container;
    this.dataService = dataService;
  }
  
  async updateConversationState(id, newState) {
    // Ultra-fast state updates
  }
}
```

#### 2.2 Service Layer
```javascript
// src/analytics-web/services/DataService.js
class DataService {
  constructor() {
    this.cache = new Map();
    this.wsService = new WebSocketService();
  }
  
  async getConversations() {
    return this.cachedFetch('/api/data');
  }
  
  async getConversationStates() {
    return fetch('/api/conversation-state');
  }
}

// src/analytics-web/services/StateService.js
class StateService {
  constructor() {
    this.subscribers = new Set();
  }
  
  subscribe(callback) {
    this.subscribers.add(callback);
  }
  
  notifyStateChange(conversationId, newState) {
    this.subscribers.forEach(cb => cb(conversationId, newState));
  }
}
```

#### 2.3 Main Application Bootstrap
```javascript
// src/analytics-web/assets/js/main.js
class AnalyticsDashboard {
  constructor() {
    this.dashboard = null;
    this.services = {
      data: new DataService(),
      state: new StateService(),
      chart: new ChartService()
    };
  }
  
  async initialize() {
    await this.loadDependencies();
    await this.initializeServices();
    await this.renderDashboard();
  }
}

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  const app = new AnalyticsDashboard();
  await app.initialize();
});
```

### Phase 3: Build System & Bundling

#### 3.1 Development Setup
```json
// package.json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "nodemon src/analytics/server/AnalyticsServer.js",
    "dev:frontend": "webpack serve --mode development",
    "build": "webpack --mode production",
    "test": "jest",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "webpack": "^5.0.0",
    "webpack-cli": "^5.0.0",
    "webpack-dev-server": "^4.0.0",
    "babel-loader": "^9.0.0",
    "css-loader": "^6.0.0",
    "html-webpack-plugin": "^5.0.0"
  }
}
```

#### 3.2 Webpack Configuration
```javascript
// webpack.config.js
module.exports = {
  entry: './src/analytics-web/assets/js/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'analytics.bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'babel-loader'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/analytics-web/index.html'
    })
  ]
};
```

## Migration Strategy

### Step 1: Extract Backend Modules (Week 1)
1. Create new directory structure
2. Extract `ConversationAnalyzer` class
3. Extract `StateCalculator` class  
4. Extract API routes
5. Update main `AnalyticsServer` to use modules

### Step 2: Frontend Componentization (Week 2)
1. Create component classes
2. Extract service layer
3. Implement state management
4. Add build system

### Step 3: WebSocket Integration (Week 3)
1. Implement WebSocket server
2. Create WebSocket client service
3. Replace polling with real-time updates
4. Add fallback mechanisms

### Step 4: Testing & Optimization (Week 4)
1. Add unit tests for components
2. Add integration tests
3. Performance optimization
4. Documentation updates

## Benefits of New Architecture

### Scalability
- **Easy to add features**: Each new feature gets its own module
- **Team collaboration**: Multiple developers can work on different modules
- **Code reusability**: Components can be reused across features

### Maintainability
- **Single responsibility**: Each class has one clear purpose
- **Easy debugging**: Issues isolated to specific modules
- **Clear dependencies**: Explicit imports/exports

### Performance
- **Code splitting**: Load only needed components
- **Caching**: Smart caching at service level
- **Bundle optimization**: Webpack optimizations

### Developer Experience
- **Hot reloading**: Fast development iterations
- **Type safety**: Can add TypeScript easily
- **Testing**: Unit test individual components
- **Linting**: Consistent code quality

## File Size Comparison

### Before:
- `analytics.js`: 3000+ lines
- `index.html`: 2000+ lines
- **Total**: 5000+ lines in 2 files

### After:
- **Backend**: ~20 files, 100-200 lines each
- **Frontend**: ~15 files, 50-150 lines each
- **Total**: Same functionality, much better organized

## Implementation Priority

### Immediate (This sprint):
- [ ] Extract `StateCalculator` class
- [ ] Create `/api/conversation-state` route module
- [ ] Basic component structure for frontend

### Short-term (Next sprint):
- [ ] Complete backend modularization
- [ ] Component-based frontend
- [ ] Build system setup

### Long-term (Future sprints):
- [ ] WebSocket implementation
- [ ] Testing framework
- [ ] Performance monitoring
- [ ] Plugin architecture for extensions

## Conclusion

This modular architecture will:
1. **Solve current pain points**: Large files, mixed responsibilities
2. **Enable future growth**: Easy to add new features
3. **Improve developer experience**: Better tooling, debugging, testing
4. **Maintain performance**: Smart caching and bundling
5. **Support team scaling**: Multiple developers can contribute

The migration can be done incrementally without breaking existing functionality, ensuring a smooth transition to a more maintainable codebase.