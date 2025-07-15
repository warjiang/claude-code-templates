[![npm version](https://img.shields.io/npm/v/claude-code-templates.svg)](https://www.npmjs.com/package/claude-code-templates)
[![npm downloads](https://img.shields.io/npm/dt/claude-code-templates.svg)](https://www.npmjs.com/package/claude-code-templates)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open Source](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://opensource.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/davila7/claude-code-templates/blob/main/CONTRIBUTING.md)
[![GitHub stars](https://img.shields.io/github/stars/davila7/claude-code-templates.svg?style=social&label=Star)](https://github.com/davila7/claude-code-templates)

# Claude Code Templates

**CLI tool for configuring and monitoring Claude Code** - Quick setup for any project with framework-specific commands and real-time monitoring dashboard. Open source and runs locally.

## 📋 Quick Start

```bash
# Run the tool (no installation required!)
npx claude-code-templates@latest
```

## Core Features

### 📊 Real-time Analytics Dashboard
Monitor and optimize your Claude Code agents with our comprehensive analytics dashboard:
- **Live Session Tracking**: See active conversations and their status in real-time
- **Real-time State Detection**: "Claude Code working...", "User typing...", "Awaiting user input..."
- **Usage Statistics**: Total sessions, tokens, and project activity with interactive charts
- **Conversation History**: Complete session logs with export capabilities (CSV/JSON)
- **Browser Notifications**: Get notified when Claude is waiting for your input
- **Performance Monitoring**: Track Claude Code agent performance and optimization opportunities
- **Web Interface**: Clean, terminal-style dashboard at `http://localhost:3333`

### 📋 Smart Project Setup
Intelligent project configuration with framework-specific commands:
- **Auto-Detection**: Automatically detect your project type and suggest optimal configurations
- **Quick Setup**: Framework-specific commands for testing, linting, building, debugging, and deployment
- **Optimized Workflows**: Pre-configured commands tailored to your development stack
- **Best Practices**: Industry-standard configurations and development patterns

## What Gets Installed

### Core Files
- **`CLAUDE.md`** - Main configuration file with language-specific best practices
- **`.claude/settings.json`** - Automation hooks and Claude Code settings
- **`.claude/commands/`** - Custom commands for common development tasks
- **`.mcp.json`** - Model Context Protocol server configurations

## Supported Languages & Frameworks

| Language | Frameworks | Status | Commands | Hooks | MCP |
|----------|------------|---------|----------|--------|-----|
| **JavaScript/TypeScript** | React, Vue, Angular, Node.js | ✅ Ready | 7+ | 9+ | 4+ |
| **Python** | Django, Flask, FastAPI | ✅ Ready | 5+ | 8+ | 4+ |
| **Common** | Universal | ✅ Ready | 2+ | 1+ | 4+ |
| **Go** | Gin, Echo, Fiber | 🚧 Coming Soon | - | - | - |
| **Rust** | Axum, Warp, Actix | 🚧 Coming Soon | - | - | - |

## Usage Examples

### Interactive Setup (Recommended)
```bash
cd my-react-app
npx claude-code-templates
# Choose between Analytics Dashboard or Project Setup
```

### Analytics Dashboard
```bash
# Launch real-time analytics dashboard
npx claude-code-templates --analytics
```

### Framework-Specific Quick Setup
```bash
# React + TypeScript project
npx claude-code-templates --language javascript-typescript --framework react --yes

# Python + Django project
npx claude-code-templates --language python --framework django --yes
```

### Analysis Tools
```bash
# Analyze existing commands 
npx claude-code-templates --commands-stats

# Analyze automation hooks
npx claude-code-templates --hooks-stats

# Analyze MCP server configurations 
npx claude-code-templates --mcps-stats
```

### Alternative Commands
All these commands work exactly the same way:

```bash
npx claude-code-templates    # ✅ Recommended (package name)
npx cct                      # ⚡ Super short (3 letters)
npx claude-setup             # Setup-style command
npx create-claude-config     # Create-style command
```

## CLI Options

| Option | Description | Example |
|--------|-------------|---------|
| `-l, --language` | Specify programming language | `--language python` |
| `-f, --framework` | Specify framework | `--framework react` |
| `-d, --directory` | Target directory | `--directory /path/to/project` |
| `-y, --yes` | Skip prompts and use defaults | `--yes` |
| `--dry-run` | Show what would be installed | `--dry-run` |
| `--analytics` | Launch real-time analytics dashboard | `--analytics` |
| `--commands-stats` | Analyze existing commands | `--commands-stats` |
| `--hooks-stats` | Analyze automation hooks | `--hooks-stats` |
| `--mcps-stats` | Analyze MCP server configurations | `--mcps-stats` |
| `--help` | Show help information | `--help` |

## 🏗️ Modular Architecture

The analytics dashboard is built with a modern, scalable modular architecture designed for performance and maintainability.

### Backend Architecture

#### Core Modules
- **`StateCalculator`** - Advanced conversation state detection with real-time analysis
- **`ProcessDetector`** - Running process detection and conversation linking
- **`ConversationAnalyzer`** - Message parsing, token counting, and conversation analysis
- **`FileWatcher`** - Real-time file system monitoring with efficient change detection
- **`DataCache`** - Multi-level caching system with smart invalidation strategies

#### Data Layer
- **`DataCache`** - Intelligent caching with file content, parsed data, and computation result caching
- **Performance Monitoring** - Request tracking, memory monitoring, and system health metrics

#### Notification System
- **`WebSocketServer`** - Real-time WebSocket communication with client management
- **`NotificationManager`** - Event-driven notification system with subscription management
- **Real-time Updates** - Live conversation state changes and data refresh notifications

#### Performance & Monitoring
- **`PerformanceMonitor`** - Comprehensive performance tracking and system health monitoring
- **Express Middleware** - Request timing, error tracking, and API performance metrics
- **WebSocket Monitoring** - Connection tracking, message metrics, and client health monitoring

### Frontend Architecture

#### Modular Components
- **`Dashboard`** - Main orchestration component with state management integration
- **`ConversationTable`** - Interactive conversation display with real-time status updates
- **`Charts`** - Dynamic data visualization with Chart.js integration
- **`StateService`** - Reactive state management with subscriber patterns
- **`DataService`** - API communication with intelligent caching and real-time integration
- **`WebSocketService`** - Real-time communication with automatic reconnection

#### Real-time Features
- **Live State Detection** - Real-time conversation status: "Claude working...", "User typing...", "Awaiting input..."
- **Auto-refresh** - Smart polling with WebSocket fallback for seamless data updates
- **Browser Notifications** - Desktop notifications for important state changes
- **Responsive Design** - Mobile-friendly interface with real-time data synchronization

### Performance Optimizations

#### Caching Strategy
- **File Content Cache** - Reduces disk I/O with timestamp-based invalidation
- **Parsed Data Cache** - Stores analyzed conversation data with dependency tracking
- **API Response Cache** - Client-side caching with TTL and smart refresh
- **Computation Cache** - Caches expensive calculations with automatic invalidation

#### Real-time Efficiency
- **WebSocket Integration** - Eliminates polling overhead for live updates
- **Smart Refresh** - Only updates changed data with differential loading
- **Process Detection** - Efficient system process monitoring without performance impact
- **Memory Management** - Automatic cleanup of old metrics and cached data

### Testing Framework

#### Comprehensive Test Suite
- **Unit Tests** - Individual module testing with 80%+ coverage requirement
- **Integration Tests** - End-to-end system testing with real data scenarios
- **Performance Tests** - Load testing and performance regression detection
- **WebSocket Tests** - Real-time communication testing with mock clients

#### Test Coverage
- **Backend Modules**: StateCalculator, DataCache, WebSocketServer, PerformanceMonitor
- **Frontend Services**: DataService, StateService, WebSocketService  
- **Integration Testing**: Complete analytics system with real conversation data
- **Performance Testing**: Concurrent operations, memory usage, and response times

### Development Benefits

#### Scalability
- **Modular Design** - Easy to extend with new features and integrations
- **Dependency Injection** - Loose coupling for flexible testing and development
- **Event-driven Architecture** - Scalable notification system for future enhancements

#### Maintainability  
- **Separation of Concerns** - Clear boundaries between data, business logic, and presentation
- **Comprehensive Logging** - Detailed performance and error tracking for debugging
- **Type Safety** - Consistent error handling and data validation throughout

#### Performance
- **Multi-level Caching** - Optimized data access patterns with intelligent invalidation
- **Real-time Updates** - WebSocket-based communication eliminates polling overhead
- **Memory Optimization** - Automatic cleanup and configurable memory thresholds
- **Request Monitoring** - Complete visibility into system performance and bottlenecks

## Safety Features

- **Automatic Backups**: Existing files are backed up before changes
- **Confirmation Required**: Always asks before making changes (unless `--yes` flag)
- **Dry Run Mode**: Preview installation with `--dry-run`
- **Cancel Anytime**: Press Ctrl+C or answer 'No' to cancel

## What Makes This Special?

### Before (Manual Setup)
- Hours of configuration research
- Manual CLAUDE.md creation
- Framework-specific command setup
- Automation hook configuration
- MCP server integration

### After (With Templates)
```bash
npx claude-code-templates --language javascript-typescript --framework react --yes
# ✅ Done in 30 seconds!
```

## 🤝 Contributing

We welcome contributions from the open source community! 

**See our [GitHub repository](https://github.com/davila7/claude-code-templates) for detailed guidelines**

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

- **🐛 Issues**: [Report bugs or request features](https://github.com/davila7/claude-code-templates/issues)
- **💬 Discussions**: [Join community discussions](https://github.com/davila7/claude-code-templates/discussions)
- **📖 Documentation**: [Claude Code Official Docs](https://docs.anthropic.com/en/docs/claude-code)

---

**⭐ Found this useful? Give us a star on [GitHub](https://github.com/davila7/claude-code-templates) to support the project!**