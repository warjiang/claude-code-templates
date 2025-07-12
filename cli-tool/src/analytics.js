const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const chokidar = require('chokidar');
const open = require('open');
const os = require('os');

class ClaudeAnalytics {
  constructor() {
    this.app = express();
    this.port = 3333;
    this.data = {
      conversations: [],
      summary: {},
      activeProjects: [],
      realtimeStats: {
        totalConversations: 0,
        totalTokens: 0,
        activeProjects: 0,
        lastActivity: null,
      },
    };
    this.watchers = [];
  }

  async initialize() {
    const homeDir = os.homedir();
    this.claudeDir = path.join(homeDir, '.claude');
    this.claudeDesktopDir = path.join(homeDir, 'Library', 'Application Support', 'Claude');

    // Check if Claude directories exist
    if (!(await fs.pathExists(this.claudeDir))) {
      throw new Error(`Claude Code directory not found at ${this.claudeDir}`);
    }

    await this.loadInitialData();
    this.setupFileWatchers();
    this.setupWebServer();
  }

  async loadInitialData() {
    console.log(chalk.yellow('📊 Analyzing Claude Code data...'));

    try {
      // Load conversation files
      const conversations = await this.loadConversations();
      this.data.conversations = conversations;

      // Load active projects
      const projects = await this.loadActiveProjects();
      this.data.activeProjects = projects;

      // NEW: Detect active Claude processes and enrich data
      await this.enrichWithRunningProcesses();

      // Calculate summary statistics
      this.data.summary = this.calculateSummary(conversations, projects);

      // Update realtime stats
      this.updateRealtimeStats();

      console.log(chalk.green('✅ Data analysis complete'));
      console.log(chalk.gray(`Found ${conversations.length} conversations across ${projects.length} projects`));

    } catch (error) {
      console.error(chalk.red('Error loading Claude data:'), error.message);
      throw error;
    }
  }

  async loadConversations() {
    const conversations = [];

    try {
      // Search for .jsonl files recursively in all subdirectories
      const findJsonlFiles = async (dir) => {
        const files = [];
        const items = await fs.readdir(dir);

        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stats = await fs.stat(itemPath);

          if (stats.isDirectory()) {
            // Recursively search subdirectories
            const subFiles = await findJsonlFiles(itemPath);
            files.push(...subFiles);
          } else if (item.endsWith('.jsonl')) {
            files.push(itemPath);
          }
        }

        return files;
      };

      const jsonlFiles = await findJsonlFiles(this.claudeDir);
      console.log(chalk.blue(`Found ${jsonlFiles.length} conversation files`));

      for (const filePath of jsonlFiles) {
        const stats = await fs.stat(filePath);
        const filename = path.basename(filePath);

        try {
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.trim().split('\n').filter(line => line.trim());
          const messages = lines.map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          }).filter(Boolean);

          // Extract project name from path
          const projectFromPath = this.extractProjectFromPath(filePath);

          // Parse messages to get their content for status determination
          const parsedMessages = lines.map(line => {
            try {
              const item = JSON.parse(line);
              if (item.message && item.message.role) {
                return {
                  role: item.message.role,
                  timestamp: new Date(item.timestamp),
                  content: item.message.content,
                  model: item.message.model || null,
                  usage: item.message.usage || null,
                };
              }
            } catch {}
            return null;
          }).filter(Boolean);

          // Calculate real token usage and extract model info
          const tokenUsage = this.calculateRealTokenUsage(parsedMessages);
          const modelInfo = this.extractModelInfo(parsedMessages);

          const conversation = {
            id: filename.replace('.jsonl', ''),
            filename: filename,
            filePath: filePath,
            messageCount: parsedMessages.length,
            fileSize: stats.size,
            lastModified: stats.mtime,
            created: stats.birthtime,
            tokens: tokenUsage.total > 0 ? tokenUsage.total : this.estimateTokens(content),
            tokenUsage: tokenUsage,
            modelInfo: modelInfo,
            project: projectFromPath || this.extractProjectFromConversation(parsedMessages),
            status: this.determineConversationStatus(parsedMessages, stats.mtime),
            conversationState: this.determineConversationState(parsedMessages, stats.mtime),
            statusSquares: this.generateStatusSquares(parsedMessages),
          };

          conversations.push(conversation);
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Could not parse ${filename}:`, error.message));
        }
      }

      return conversations.sort((a, b) => b.lastModified - a.lastModified);
    } catch (error) {
      console.error(chalk.red('Error loading conversations:'), error.message);
      return [];
    }
  }

  async loadActiveProjects() {
    const projects = [];

    try {
      const files = await fs.readdir(this.claudeDir);

      for (const file of files) {
        const filePath = path.join(this.claudeDir, file);
        const stats = await fs.stat(filePath);

        if (stats.isDirectory() && !file.startsWith('.')) {
          const projectPath = filePath;
          const todoFiles = await this.findTodoFiles(projectPath);

          const project = {
            name: file,
            path: projectPath,
            lastActivity: stats.mtime,
            todoFiles: todoFiles.length,
            status: this.determineProjectStatus(stats.mtime),
          };

          projects.push(project);
        }
      }

      return projects.sort((a, b) => b.lastActivity - a.lastActivity);
    } catch (error) {
      console.error(chalk.red('Error loading projects:'), error.message);
      return [];
    }
  }

  async findTodoFiles(projectPath) {
    try {
      const files = await fs.readdir(projectPath);
      return files.filter(file => file.includes('todo') || file.includes('TODO'));
    } catch {
      return [];
    }
  }

  estimateTokens(text) {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  calculateRealTokenUsage(parsedMessages) {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalCacheReadTokens = 0;
    let messagesWithUsage = 0;

    parsedMessages.forEach(message => {
      if (message.usage) {
        totalInputTokens += message.usage.input_tokens || 0;
        totalOutputTokens += message.usage.output_tokens || 0;
        totalCacheCreationTokens += message.usage.cache_creation_input_tokens || 0;
        totalCacheReadTokens += message.usage.cache_read_input_tokens || 0;
        messagesWithUsage++;
      }
    });

    return {
      total: totalInputTokens + totalOutputTokens,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheCreationTokens: totalCacheCreationTokens,
      cacheReadTokens: totalCacheReadTokens,
      messagesWithUsage: messagesWithUsage,
      totalMessages: parsedMessages.length,
    };
  }

  extractModelInfo(parsedMessages) {
    const models = new Set();
    const serviceTiers = new Set();
    let lastModel = null;
    let lastServiceTier = null;

    parsedMessages.forEach(message => {
      if (message.model) {
        models.add(message.model);
        lastModel = message.model;
      }
      if (message.usage && message.usage.service_tier) {
        serviceTiers.add(message.usage.service_tier);
        lastServiceTier = message.usage.service_tier;
      }
    });

    return {
      models: Array.from(models),
      primaryModel: lastModel || models.values().next().value || 'Unknown',
      serviceTiers: Array.from(serviceTiers),
      currentServiceTier: lastServiceTier || serviceTiers.values().next().value || 'Unknown',
      hasMultipleModels: models.size > 1,
    };
  }

  extractProjectFromPath(filePath) {
    // Extract project name from file path like:
    // /Users/user/.claude/projects/-Users-user-Projects-MyProject/conversation.jsonl
    const pathParts = filePath.split('/');
    const projectIndex = pathParts.findIndex(part => part === 'projects');

    if (projectIndex !== -1 && projectIndex + 1 < pathParts.length) {
      const projectDir = pathParts[projectIndex + 1];
      // Clean up the project directory name
      const cleanName = projectDir
        .replace(/^-/, '')
        .replace(/-/g, '/')
        .split('/')
        .pop() || 'Unknown';

      return cleanName;
    }

    return null;
  }

  // NEW: Function to detect active Claude processes
  async detectRunningClaudeProcesses() {
    const { exec } = require('child_process');
    
    return new Promise((resolve) => {
      // Search for processes containing 'claude' but exclude our own analytics process and system processes
      exec('ps aux | grep -i claude | grep -v grep | grep -v analytics | grep -v "/Applications/Claude.app" | grep -v "npm start"', (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        
        const processes = stdout.split('\n')
          .filter(line => line.trim())
          .filter(line => {
            // Only include actual Claude CLI processes, not system processes
            const fullCommand = line.split(/\s+/).slice(10).join(' ');
            return fullCommand.includes('claude') && 
                   !fullCommand.includes('chrome_crashpad_handler') &&
                   !fullCommand.includes('create-claude-config') &&
                   !fullCommand.includes('node bin/') &&
                   fullCommand.trim() === 'claude'; // Only the basic claude command
          })
          .map(line => {
            const parts = line.split(/\s+/);
            const fullCommand = parts.slice(10).join(' ');
            
            // Extract useful information from command
            const cwdMatch = fullCommand.match(/--cwd[=\s]+([^\s]+)/);
            const workingDir = cwdMatch ? cwdMatch[1] : 'unknown';
            
            return {
              pid: parts[1],
              command: fullCommand,
              workingDir: workingDir,
              startTime: new Date(), // For now we use current time
              status: 'running',
              user: parts[0]
            };
          });
        
        resolve(processes);
      });
    });
  }

  // NEW: Enrich existing conversations with process information
  async enrichWithRunningProcesses() {
    try {
      const runningProcesses = await this.detectRunningClaudeProcesses();
      
      // Add active process information to each conversation
      for (const conversation of this.data.conversations) {
        // Look for active process for this project
        const matchingProcess = runningProcesses.find(process => 
          process.workingDir.includes(conversation.project) ||
          process.command.includes(conversation.project)
        );
        
        if (matchingProcess) {
          // ENRICH without changing existing logic
          conversation.runningProcess = {
            pid: matchingProcess.pid,
            startTime: matchingProcess.startTime,
            workingDir: matchingProcess.workingDir,
            hasActiveCommand: true
          };
          
          // Only change status if not already marked as active by existing logic
          if (conversation.status !== 'active') {
            conversation.status = 'active';
            conversation.statusReason = 'running_process';
          }
          
          // Recalculate conversation state with process information
          const conversationFile = path.join(this.claudeDir, conversation.fileName);
          try {
            const content = await fs.readFile(conversationFile, 'utf8');
            const parsedMessages = content.split('\n')
              .filter(line => line.trim())
              .map(line => JSON.parse(line));
            
            const stats = await fs.stat(conversationFile);
            conversation.conversationState = this.determineConversationState(
              parsedMessages, 
              stats.mtime, 
              conversation.runningProcess
            );
          } catch (error) {
            // If we can't read the file, keep the existing state
          }
        } else {
          conversation.runningProcess = null;
        }
      }
      
      // Disable orphan process detection to reduce noise
      this.data.orphanProcesses = [];
      
      console.log(chalk.blue(`🔍 Found ${runningProcesses.length} running Claude processes`));
      
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not detect running processes'), error.message);
    }
  }

  extractProjectFromConversation(messages) {
    // Try to extract project information from conversation
    for (const message of messages.slice(0, 5)) {
      if (message.content && typeof message.content === 'string') {
        const pathMatch = message.content.match(/\/([^\/\s]+)$/);
        if (pathMatch) {
          return pathMatch[1];
        }
      }
    }
    return 'Unknown';
  }

  determineConversationStatus(messages, lastModified) {
    const now = new Date();
    const timeDiff = now - lastModified;
    const minutesAgo = timeDiff / (1000 * 60);

    if (messages.length === 0) {
      return minutesAgo < 5 ? 'active' : 'inactive';
    }

    // Sort messages by timestamp to get the actual conversation flow
    const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const lastMessage = sortedMessages[sortedMessages.length - 1];
    const lastMessageTime = new Date(lastMessage.timestamp);
    const lastMessageMinutesAgo = (now - lastMessageTime) / (1000 * 60);

    // More balanced logic - active conversations and recent activity
    if (lastMessage.role === 'user' && lastMessageMinutesAgo < 3) {
      return 'active';
    } else if (lastMessage.role === 'assistant' && lastMessageMinutesAgo < 5) {
      return 'active';
    }

    // Use file modification time for recent activity
    if (minutesAgo < 5) return 'active';
    if (minutesAgo < 30) return 'recent';
    return 'inactive';
  }

  determineConversationState(messages, lastModified, runningProcess = null) {
    const now = new Date();
    const timeDiff = now - lastModified;
    const minutesAgo = timeDiff / (1000 * 60);

    // If there's an active process, use simpler and more responsive logic
    if (runningProcess && runningProcess.hasActiveCommand) {
      const fileTimeDiff = (now - lastModified) / 1000; // seconds
      
      // Check conversation flow first for immediate response
      if (messages.length > 0) {
        const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const lastMessage = sortedMessages[sortedMessages.length - 1];
        
        if (lastMessage.role === 'user') {
          // User sent message, Claude should be working (prioritize this)
          return 'Claude Code working...';
        } else if (lastMessage.role === 'assistant') {
          // Claude responded, check if file activity indicates continued work
          if (fileTimeDiff < 15) {
            return 'Claude Code working...';
          }
          // Otherwise user should be typing or thinking
          return 'User typing...';
        }
      }
      
      // Very recent file activity = Claude working (fallback)
      if (fileTimeDiff < 15) {
        return 'Claude Code working...';
      }
      
      // Default for active process
      return 'Awaiting user input...';
    }

    if (messages.length === 0) {
      return minutesAgo < 5 ? 'Waiting for input...' : 'Idle';
    }

    // Sort messages by timestamp to get the actual conversation flow
    const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const lastMessage = sortedMessages[sortedMessages.length - 1];
    const lastMessageTime = new Date(lastMessage.timestamp);
    const lastMessageMinutesAgo = (now - lastMessageTime) / (1000 * 60);

    // Detailed conversation state logic
    if (lastMessage.role === 'user') {
      // User sent last message
      if (lastMessageMinutesAgo < 0.5) {
        return 'Claude Code working...';
      } else if (lastMessageMinutesAgo < 3) {
        return 'Awaiting response...';
      } else {
        return 'User typing...';
      }
    } else if (lastMessage.role === 'assistant') {
      // Assistant sent last message
      if (lastMessageMinutesAgo < 2) {
        return 'Awaiting user input...';
      } else if (lastMessageMinutesAgo < 5) {
        return 'User may be typing...';
      }
    }

    // Fallback states
    if (minutesAgo < 5) return 'Recently active';
    if (minutesAgo < 60) return 'Idle';
    return 'Inactive';
  }

  generateStatusSquares(messages) {
    if (!messages || messages.length === 0) {
      return [];
    }

    // Sort messages by timestamp and take last 10 for status squares
    const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const recentMessages = sortedMessages.slice(-10);

    return recentMessages.map((message, index) => {
      const messageNum = sortedMessages.length - recentMessages.length + index + 1;

      // Determine status based on message content and role
      if (message.role === 'user') {
        return {
          type: 'pending',
          tooltip: `Message #${messageNum}: User input`,
        };
      } else if (message.role === 'assistant') {
        // Check if the message contains tool usage or errors
        const content = message.content || '';

        if (typeof content === 'string') {
          if (content.includes('[Tool:') || content.includes('tool_use')) {
            return {
              type: 'tool',
              tooltip: `Message #${messageNum}: Tool execution`,
            };
          } else if (content.includes('error') || content.includes('Error') || content.includes('failed')) {
            return {
              type: 'error',
              tooltip: `Message #${messageNum}: Error in response`,
            };
          } else {
            return {
              type: 'success',
              tooltip: `Message #${messageNum}: Successful response`,
            };
          }
        } else if (Array.isArray(content)) {
          // Check for tool_use blocks in array content
          const hasToolUse = content.some(block => block.type === 'tool_use');
          const hasError = content.some(block =>
            block.type === 'text' && (block.text ?.includes('error') || block.text ?.includes('Error'))
          );

          if (hasError) {
            return {
              type: 'error',
              tooltip: `Message #${messageNum}: Error in response`,
            };
          } else if (hasToolUse) {
            return {
              type: 'tool',
              tooltip: `Message #${messageNum}: Tool execution`,
            };
          } else {
            return {
              type: 'success',
              tooltip: `Message #${messageNum}: Successful response`,
            };
          }
        }
      }

      return {
        type: 'pending',
        tooltip: `Message #${messageNum}: Unknown status`,
      };
    });
  }

  determineProjectStatus(lastActivity) {
    const now = new Date();
    const timeDiff = now - lastActivity;
    const hoursAgo = timeDiff / (1000 * 60 * 60);

    if (hoursAgo < 1) return 'active';
    if (hoursAgo < 24) return 'recent';
    return 'inactive';
  }

  calculateSummary(conversations, projects) {
    const totalTokens = conversations.reduce((sum, conv) => sum + conv.tokens, 0);
    const totalConversations = conversations.length;
    const activeConversations = conversations.filter(c => c.status === 'active').length;
    const activeProjects = projects.filter(p => p.status === 'active').length;

    const avgTokensPerConversation = totalConversations > 0 ? Math.round(totalTokens / totalConversations) : 0;
    const totalFileSize = conversations.reduce((sum, conv) => sum + conv.fileSize, 0);

    // Calculate real Claude sessions (5-hour periods)
    const claudeSessions = this.calculateClaudeSessions(conversations);

    return {
      totalConversations,
      totalTokens,
      activeConversations,
      activeProjects,
      avgTokensPerConversation,
      totalFileSize: this.formatBytes(totalFileSize),
      lastActivity: conversations.length > 0 ? conversations[0].lastModified : null,
      claudeSessions,
    };
  }

  calculateClaudeSessions(conversations) {
    // Collect all message timestamps across all conversations
    const allMessages = [];

    conversations.forEach(conv => {
      // Parse the conversation file to get message timestamps
      try {
        const fs = require('fs-extra');
        const content = fs.readFileSync(conv.filePath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        lines.forEach(line => {
          try {
            const item = JSON.parse(line);
            if (item.timestamp && item.message && item.message.role === 'user') {
              // Only count user messages as session starters
              allMessages.push({
                timestamp: new Date(item.timestamp),
                conversationId: conv.id,
              });
            }
          } catch {}
        });
      } catch {}
    });

    if (allMessages.length === 0) return {
      total: 0,
      currentMonth: 0,
      thisWeek: 0
    };

    // Sort messages by timestamp
    allMessages.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate sessions (5-hour periods)
    const sessions = [];
    let currentSession = null;

    allMessages.forEach(message => {
      if (!currentSession) {
        // Start first session
        currentSession = {
          start: message.timestamp,
          end: new Date(message.timestamp.getTime() + 5 * 60 * 60 * 1000), // +5 hours
          messageCount: 1,
          conversations: new Set([message.conversationId]),
        };
      } else if (message.timestamp <= currentSession.end) {
        // Message is within current session
        currentSession.messageCount++;
        currentSession.conversations.add(message.conversationId);
        // Update session end if this message extends beyond current session
        const potentialEnd = new Date(message.timestamp.getTime() + 5 * 60 * 60 * 1000);
        if (potentialEnd > currentSession.end) {
          currentSession.end = potentialEnd;
        }
      } else {
        // Message is outside current session, start new session
        sessions.push(currentSession);
        currentSession = {
          start: message.timestamp,
          end: new Date(message.timestamp.getTime() + 5 * 60 * 60 * 1000),
          messageCount: 1,
          conversations: new Set([message.conversationId]),
        };
      }
    });

    // Add the last session
    if (currentSession) {
      sessions.push(currentSession);
    }

    // Calculate statistics
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const currentMonthSessions = sessions.filter(s => s.start >= currentMonth).length;
    const thisWeekSessions = sessions.filter(s => s.start >= thisWeek).length;

    return {
      total: sessions.length,
      currentMonth: currentMonthSessions,
      thisWeek: thisWeekSessions,
      sessions: sessions.map(s => ({
        start: s.start,
        end: s.end,
        messageCount: s.messageCount,
        conversationCount: s.conversations.size,
        duration: Math.round((s.end - s.start) / (1000 * 60 * 60) * 10) / 10, // hours with 1 decimal
      })),
    };
  }

  updateRealtimeStats() {
    this.data.realtimeStats = {
      totalConversations: this.data.conversations.length,
      totalTokens: this.data.conversations.reduce((sum, conv) => sum + conv.tokens, 0),
      activeProjects: this.data.activeProjects.filter(p => p.status === 'active').length,
      lastActivity: this.data.summary.lastActivity,
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  setupFileWatchers() {
    console.log(chalk.blue('👀 Setting up file watchers for real-time updates...'));

    // Watch conversation files recursively in all subdirectories
    const conversationWatcher = chokidar.watch([
      path.join(this.claudeDir, '**/*.jsonl')
    ], {
      persistent: true,
      ignoreInitial: true,
    });

    conversationWatcher.on('change', async () => {
      console.log(chalk.yellow('🔄 Conversation file changed, updating data...'));
      await this.loadInitialData();
      console.log(chalk.green('✅ Data updated'));
    });

    conversationWatcher.on('add', async () => {
      console.log(chalk.yellow('📝 New conversation file detected...'));
      await this.loadInitialData();
      console.log(chalk.green('✅ Data updated'));
    });

    this.watchers.push(conversationWatcher);

    // Watch project directories
    const projectWatcher = chokidar.watch(this.claudeDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 2, // Increased depth to catch subdirectories
    });

    projectWatcher.on('addDir', async () => {
      console.log(chalk.yellow('📁 New project directory detected...'));
      await this.loadInitialData();
      console.log(chalk.green('✅ Data updated'));
    });

    projectWatcher.on('change', async () => {
      console.log(chalk.yellow('📁 Project directory changed...'));
      await this.loadInitialData();
      console.log(chalk.green('✅ Data updated'));
    });

    this.watchers.push(projectWatcher);

    // Also set up periodic refresh to catch any missed changes
    setInterval(async () => {
      console.log(chalk.blue('⏱️  Periodic data refresh...'));
      await this.loadInitialData();
    }, 30000); // Every 30 seconds
    
    // NEW: More frequent updates for active processes (every 10 seconds)
    setInterval(async () => {
      await this.enrichWithRunningProcesses();
    }, 10000);
  }

  setupWebServer() {
    // Serve static files (we'll create the dashboard HTML)
    this.app.use(express.static(path.join(__dirname, 'analytics-web')));

    // API endpoints
    this.app.get('/api/data', async (req, res) => {
      // Add timestamp to verify data freshness
      const dataWithTimestamp = {
        ...this.data,
        timestamp: new Date().toISOString(),
        lastUpdate: new Date().toLocaleString(),
      };
      res.json(dataWithTimestamp);
    });

    this.app.get('/api/realtime', async (req, res) => {
      const realtimeWithTimestamp = {
        ...this.data.realtimeStats,
        timestamp: new Date().toISOString(),
        lastUpdate: new Date().toLocaleString(),
      };
      res.json(realtimeWithTimestamp);
    });

    // Force refresh endpoint
    this.app.get('/api/refresh', async (req, res) => {
      console.log(chalk.blue('🔄 Manual refresh requested...'));
      await this.loadInitialData();
      res.json({
        success: true,
        message: 'Data refreshed',
        timestamp: new Date().toISOString(),
      });
    });

    // Session detail endpoint
    this.app.get('/api/session/:sessionId', async (req, res) => {
      const sessionId = req.params.sessionId;

      try {
        const session = this.data.conversations.find(conv => conv.id === sessionId);
        if (!session) {
          return res.status(404).json({
            error: 'Session not found'
          });
        }

        // Read the actual conversation file
        const content = await fs.readFile(session.filePath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        const rawMessages = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(Boolean);

        // Extract actual messages from Claude Code format
        const messages = rawMessages.map(item => {
          if (item.message && item.message.role) {
            let content = '';

            if (typeof item.message.content === 'string') {
              content = item.message.content;
            } else if (Array.isArray(item.message.content)) {
              content = item.message.content
                .map(block => {
                  if (block.type === 'text') return block.text;
                  if (block.type === 'tool_use') return `[Tool: ${block.name}]`;
                  if (block.type === 'tool_result') return '[Tool Result]';
                  return block.content || '';
                })
                .join('\n');
            } else if (item.message.content && item.message.content.length) {
              content = item.message.content[0].text || '';
            }

            return {
              role: item.message.role,
              content: content || 'No content',
              timestamp: item.timestamp,
              type: item.type,
            };
          }
          return null;
        }).filter(Boolean);

        res.json({
          session: session,
          messages: messages,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        console.error(chalk.red('Error loading session details:'), error.message);
        res.status(500).json({
          error: 'Failed to load session details'
        });
      }
    });

    // Main dashboard route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'analytics-web', 'index.html'));
    });
  }

  async startServer() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(chalk.green(`🚀 Analytics dashboard started at http://localhost:${this.port}`));
        resolve();
      });
    });
  }

  async openBrowser() {
    try {
      await open(`http://localhost:${this.port}`);
      console.log(chalk.blue('🌐 Opening browser...'));
    } catch (error) {
      console.log(chalk.yellow('Could not open browser automatically. Please visit:'));
      console.log(chalk.cyan(`http://localhost:${this.port}`));
    }
  }

  stop() {
    // Clean up watchers
    this.watchers.forEach(watcher => watcher.close());

    // Stop server
    if (this.server) {
      this.server.close();
    }

    console.log(chalk.yellow('Analytics dashboard stopped'));
  }
}

async function runAnalytics(options = {}) {
  console.log(chalk.blue('📊 Starting Claude Code Analytics Dashboard...'));

  const analytics = new ClaudeAnalytics();

  try {
    await analytics.initialize();

    // Create web dashboard files
    await createWebDashboard();

    await analytics.startServer();
    await analytics.openBrowser();

    console.log(chalk.green('✅ Analytics dashboard is running!'));
    console.log(chalk.gray('Press Ctrl+C to stop the server'));

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Shutting down analytics dashboard...'));
      analytics.stop();
      process.exit(0);
    });

    // Keep the process running
    await new Promise(() => {});

  } catch (error) {
    console.error(chalk.red('❌ Failed to start analytics dashboard:'), error.message);
    process.exit(1);
  }
}

async function createWebDashboard() {
  const webDir = path.join(__dirname, 'analytics-web');
  await fs.ensureDir(webDir);

  // Create the HTML dashboard
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Code Analytics - Terminal</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            background: #0d1117;
            color: #c9d1d9;
            min-height: 100vh;
            line-height: 1.4;
        }
        
        .terminal {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .terminal-header {
            border-bottom: 1px solid #30363d;
            padding-bottom: 20px;
            margin-bottom: 20px;
            position: relative;
        }
        
        .terminal-title {
            color: #d57455;
            font-size: 1.25rem;
            font-weight: normal;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #3fb950;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        
        .terminal-subtitle {
            color: #7d8590;
            font-size: 0.875rem;
            margin-top: 4px;
        }
        
        .github-star-btn {
            position: absolute;
            top: 0;
            right: 0;
            background: #21262d;
            border: 1px solid #30363d;
            color: #c9d1d9;
            padding: 8px 12px;
            border-radius: 6px;
            text-decoration: none;
            font-family: inherit;
            font-size: 0.875rem;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
            cursor: pointer;
        }
        
        .github-star-btn:hover {
            border-color: #d57455;
            background: #30363d;
            color: #d57455;
            text-decoration: none;
        }
        
        .github-star-btn .star-icon {
            font-size: 0.75rem;
        }
        
        .stats-bar {
            display: flex;
            gap: 40px;
            margin: 20px 0;
            flex-wrap: wrap;
        }
        
        .stat {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .stat-label {
            color: #7d8590;
            font-size: 0.875rem;
        }
        
        .stat-value {
            color: #d57455;
            font-weight: bold;
        }
        
        .stat-sublabel {
            color: #7d8590;
            font-size: 0.75rem;
            display: block;
            margin-top: 2px;
        }
        
        .chart-controls {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin: 20px 0;
            padding: 12px 0;
            border-top: 1px solid #21262d;
            border-bottom: 1px solid #21262d;
        }
        
        .chart-controls-left {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        
        .chart-controls-right {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .date-control {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .date-label {
            color: #7d8590;
            font-size: 0.875rem;
        }
        
        .date-input {
            background: #21262d;
            border: 1px solid #30363d;
            color: #c9d1d9;
            padding: 6px 12px;
            border-radius: 4px;
            font-family: inherit;
            font-size: 0.875rem;
            cursor: pointer;
        }
        
        .date-input:focus {
            outline: none;
            border-color: #d57455;
        }
        
        .refresh-btn {
            background: none;
            border: 1px solid #30363d;
            color: #7d8590;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
            font-size: 0.875rem;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .refresh-btn:hover {
            border-color: #d57455;
            color: #d57455;
        }
        
        .refresh-btn.loading {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .charts-container {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 30px;
            margin: 20px 0 30px 0;
        }
        
        .chart-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 20px;
            position: relative;
        }
        
        .chart-title {
            color: #d57455;
            font-size: 0.875rem;
            text-transform: uppercase;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .chart-canvas {
            width: 100% !important;
            height: 200px !important;
        }
        
        .filter-bar {
            display: flex;
            align-items: center;
            gap: 16px;
            margin: 20px 0;
            padding: 12px 0;
            border-top: 1px solid #21262d;
            border-bottom: 1px solid #21262d;
        }
        
        .filter-label {
            color: #7d8590;
            font-size: 0.875rem;
        }
        
        .filter-buttons {
            display: flex;
            gap: 8px;
        }
        
        .filter-btn {
            background: none;
            border: 1px solid #30363d;
            color: #7d8590;
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
            font-size: 0.875rem;
            transition: all 0.2s ease;
        }
        
        .filter-btn:hover {
            border-color: #d57455;
            color: #d57455;
        }
        
        .filter-btn.active {
            background: #d57455;
            border-color: #d57455;
            color: #0d1117;
        }
        
        .sessions-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .sessions-table th {
            text-align: left;
            padding: 8px 12px;
            color: #7d8590;
            font-size: 0.875rem;
            font-weight: normal;
            border-bottom: 1px solid #30363d;
        }
        
        .sessions-table td {
            padding: 8px 12px;
            font-size: 0.875rem;
            border-bottom: 1px solid #21262d;
        }
        
        .sessions-table tr:hover {
            background: #161b22;
        }
        
        .session-id {
            color: #d57455;
            font-family: monospace;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .process-indicator {
            display: inline-block;
            width: 6px;
            height: 6px;
            background: #3fb950;
            border-radius: 50%;
            animation: pulse 2s infinite;
            cursor: help;
        }
        
        .process-indicator.orphan {
            background: #f85149;
        }
        
        .session-id-container {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .session-project {
            color: #c9d1d9;
        }
        
        .session-model {
            color: #a5d6ff;
            font-size: 0.8rem;
            max-width: 150px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .session-messages {
            color: #7d8590;
        }
        
        .session-tokens {
            color: #f85149;
        }
        
        .session-time {
            color: #7d8590;
            font-size: 0.8rem;
        }
        
        .status-active {
            color: #3fb950;
            font-weight: bold;
        }
        
        .status-recent {
            color: #d29922;
        }
        
        .status-inactive {
            color: #7d8590;
        }
        
        .conversation-state {
            color: #d57455;
            font-style: italic;
            font-size: 0.8rem;
        }
        
        .conversation-state.working {
            animation: working-pulse 1.5s infinite;
        }
        
        .conversation-state.typing {
            animation: typing-pulse 1.5s infinite;
        }
        
        @keyframes working-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        
        @keyframes typing-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        
        .status-squares {
            display: flex;
            gap: 2px;
            align-items: center;
            flex-wrap: wrap;
            margin: 0;
            padding: 0;
        }
        
        .status-square {
            width: 10px !important;
            height: 10px !important;
            min-width: 10px !important;
            min-height: 10px !important;
            max-width: 10px !important;
            max-height: 10px !important;
            border-radius: 2px;
            cursor: help;
            position: relative;
            flex-shrink: 0;
            box-sizing: border-box;
        }
        
        .status-square.success {
            background: #d57455;
        }
        
        .status-square.tool {
            background: #f97316;
        }
        
        .status-square.error {
            background: #dc2626;
        }
        
        .status-square.pending {
            background: #6b7280;
        }
        
        /* Additional specificity to override any table styling */
        .sessions-table .status-squares .status-square {
            width: 10px !important;
            height: 10px !important;
            min-width: 10px !important;
            min-height: 10px !important;
            max-width: 10px !important;
            max-height: 10px !important;
            display: inline-block !important;
            font-size: 0 !important;
            line-height: 0 !important;
            border: none !important;
            outline: none !important;
            vertical-align: top !important;
        }
        
        .status-square:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: #1c1c1c;
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            white-space: nowrap;
            z-index: 1000;
            margin-bottom: 4px;
            border: 1px solid #30363d;
        }
        
        .status-square:hover::before {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 4px solid transparent;
            border-top-color: #30363d;
            z-index: 1000;
        }
        
        .loading, #error {
            text-align: center;
            padding: 40px;
            color: #7d8590;
        }
        
        #error {
            color: #f85149;
        }
        
        .no-sessions {
            text-align: center;
            padding: 40px;
            color: #7d8590;
            font-style: italic;
        }
        
        .session-detail {
            display: none;
            margin-top: 20px;
        }
        
        .session-detail.active {
            display: block;
        }
        
        .detail-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid #30363d;
            margin-bottom: 20px;
        }
        
        .detail-title {
            color: #d57455;
            font-size: 1.1rem;
        }
        
        .detail-actions {
            display: flex;
            gap: 12px;
            align-items: center;
        }
        
        .export-format-select {
            background: #21262d;
            border: 1px solid #30363d;
            color: #c9d1d9;
            padding: 6px 12px;
            border-radius: 4px;
            font-family: inherit;
            font-size: 0.875rem;
            cursor: pointer;
        }
        
        .export-format-select:focus {
            outline: none;
            border-color: #d57455;
        }
        
        .export-format-select option {
            background: #21262d;
            color: #c9d1d9;
        }
        
        .btn {
            background: none;
            border: 1px solid #30363d;
            color: #7d8590;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
            font-size: 0.875rem;
            transition: all 0.2s ease;
        }
        
        .btn:hover {
            border-color: #d57455;
            color: #d57455;
        }
        
        .btn-primary {
            background: #d57455;
            border-color: #d57455;
            color: #0d1117;
        }
        
        .btn-primary:hover {
            background: #e8956f;
            border-color: #e8956f;
        }
        
        .session-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .info-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .info-label {
            color: #7d8590;
            font-size: 0.75rem;
            text-transform: uppercase;
        }
        
        .info-value {
            color: #c9d1d9;
            font-size: 0.875rem;
        }

        .info-value.model {
            color: #a5d6ff;
            font-weight: bold;
        }
        
        .search-input {
            width: 100%;
            background: #21262d;
            border: 1px solid #30363d;
            color: #c9d1d9;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: inherit;
            font-size: 0.875rem;
            margin-bottom: 16px;
        }
        
        .search-input:focus {
            outline: none;
            border-color: #d57455;
        }
        
        .conversation-history {
            border: 1px solid #30363d;
            border-radius: 6px;
            max-height: 600px;
            overflow-y: auto;
        }
        
        .message {
            padding: 16px;
            border-bottom: 1px solid #21262d;
            position: relative;
        }
        
        .message:last-child {
            border-bottom: none;
        }
        
        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .message-role {
            color: #58a6ff;
            font-size: 0.875rem;
            font-weight: bold;
        }
        
        .message-role.user {
            color: #3fb950;
        }
        
        .message-role.assistant {
            color: #d57455;
        }
        
        .message-time {
            color: #7d8590;
            font-size: 0.75rem;
        }
        
        .message-content {
            color: #c9d1d9;
            font-size: 0.875rem;
            line-height: 1.5;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .message-type-indicator {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 8px;
            height: 8px;
            border-radius: 2px;
            cursor: help;
        }
        
        .message-type-indicator.success {
            background: #d57455;
        }
        
        .message-type-indicator.tool {
            background: #f97316;
        }
        
        .message-type-indicator.error {
            background: #dc2626;
        }
        
        .message-type-indicator.pending {
            background: #6b7280;
        }
        
        .message-type-indicator:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            top: 100%;
            right: 0;
            background: #1c1c1c;
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            white-space: nowrap;
            z-index: 1000;
            margin-top: 4px;
            border: 1px solid #30363d;
        }
        
        .back-btn {
            margin-bottom: 20px;
        }
        
        @media (max-width: 768px) {
            .stats-bar {
                gap: 20px;
            }
            
            .chart-controls {
                flex-direction: column;
                gap: 12px;
                align-items: stretch;
            }
            
            .chart-controls-left {
                flex-direction: column;
                gap: 12px;
            }
            
            .chart-controls-right {
                justify-content: center;
            }
            
            .charts-container {
                grid-template-columns: 1fr;
                gap: 20px;
                margin: 20px 0;
            }
            
            .chart-card {
                padding: 16px;
            }
            
            .chart-canvas {
                height: 180px !important;
            }
            
            .filter-bar {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
            }
            
            .sessions-table {
                font-size: 0.8rem;
            }
            
            .sessions-table th,
            .sessions-table td {
                padding: 6px 8px;
            }
            
            .github-star-btn {
                position: relative;
                margin-top: 12px;
                align-self: flex-start;
            }
            
            .terminal-header {
                display: flex;
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="terminal-header">
            <div class="terminal-title">
                <span class="status-dot"></span>
                claude-code-analytics
            </div>
            <div class="terminal-subtitle">real-time monitoring dashboard</div>
            <div class="terminal-subtitle" id="lastUpdate"></div>
            
            <a href="https://github.com/davila7/claude-code-templates" target="_blank" class="github-star-btn" title="Give us a star on GitHub to support the project!">
                <span class="star-icon">⭐</span>
                <span>Star on GitHub</span>
            </a>
        </div>
        
        <div id="loading" class="loading">
            loading claude code data...
        </div>
        
        <div id="error" class="error" style="display: none;">
            error: failed to load claude code data
        </div>
        
        <div id="dashboard" style="display: none;">
            <div class="stats-bar">
                <div class="stat">
                    <span class="stat-label">conversations:</span>
                    <span class="stat-value" id="totalConversations">0</span>
                </div>
                <div class="stat">
                    <span class="stat-label">claude sessions:</span>
                    <span class="stat-value" id="claudeSessions">0</span>
                    <span class="stat-sublabel" id="claudeSessionsDetail"></span>
                </div>
                <div class="stat">
                    <span class="stat-label">tokens:</span>
                    <span class="stat-value" id="totalTokens">0</span>
                </div>
                <div class="stat">
                    <span class="stat-label">projects:</span>
                    <span class="stat-value" id="activeProjects">0</span>
                </div>
                <div class="stat">
                    <span class="stat-label">storage:</span>
                    <span class="stat-value" id="dataSize">0</span>
                </div>
            </div>
            
            <div class="chart-controls">
                <div class="chart-controls-left">
                    <div class="date-control">
                        <span class="date-label">from:</span>
                        <input type="date" id="dateFrom" class="date-input">
                    </div>
                    <div class="date-control">
                        <span class="date-label">to:</span>
                        <input type="date" id="dateTo" class="date-input">
                    </div>
                </div>
                <div class="chart-controls-right">
                    <button class="refresh-btn" onclick="toggleNotifications()" id="notificationBtn">
                        enable notifications
                    </button>
                    <button class="refresh-btn" onclick="refreshCharts()" id="refreshBtn">
                        refresh charts
                    </button>
                </div>
            </div>
            
            <div class="charts-container">
                <div class="chart-card">
                    <div class="chart-title">
                        📊 token usage over time
                    </div>
                    <canvas id="tokenChart" class="chart-canvas"></canvas>
                </div>
                
                <div class="chart-card">
                    <div class="chart-title">
                        🎯 project activity distribution
                    </div>
                    <canvas id="projectChart" class="chart-canvas"></canvas>
                </div>
            </div>
            
            <div class="filter-bar">
                <span class="filter-label">filter conversations:</span>
                <div class="filter-buttons">
                    <button class="filter-btn active" data-filter="active">active</button>
                    <button class="filter-btn" data-filter="recent">recent</button>
                    <button class="filter-btn" data-filter="inactive">inactive</button>
                    <button class="filter-btn" data-filter="all">all</button>
                </div>
            </div>
            
            <table class="sessions-table">
                <thead>
                    <tr>
                        <th>conversation id</th>
                        <th>project</th>
                        <th>model</th>
                        <th>messages</th>
                        <th>tokens</th>
                        <th>last activity</th>
                        <th>conversation state</th>
                        <th>status</th>
                    </tr>
                </thead>
                <tbody id="sessionsTable">
                    <!-- Sessions will be loaded here -->
                </tbody>
            </table>
            
            <div id="noSessions" class="no-sessions" style="display: none;">
                no conversations found for current filter
            </div>
            
            <div id="sessionDetail" class="session-detail">
                <button class="btn back-btn" onclick="showSessionsList()">← back to conversations</button>
                
                <div class="detail-header">
                    <div class="detail-title" id="detailTitle">conversation details</div>
                    <div class="detail-actions">
                        <select id="exportFormat" class="export-format-select">
                            <option value="csv">CSV</option>
                            <option value="json">JSON</option>
                        </select>
                        <button class="btn" onclick="exportSession()">export</button>
                        <button class="btn btn-primary" onclick="refreshSessionDetail()">refresh</button>
                    </div>
                </div>
                
                <div class="session-info" id="sessionInfo">
                    <!-- Session info will be loaded here -->
                </div>
                
                <div>
                    <h3 style="color: #7d8590; margin-bottom: 16px; font-size: 0.875rem; text-transform: uppercase;">conversation history</h3>
                    <input type="text" id="conversationSearch" class="search-input" placeholder="Search messages...">
                    <div class="conversation-history" id="conversationHistory">
                        <!-- Conversation history will be loaded here -->
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let allConversations = [];
        let currentFilter = 'active';
        let currentSession = null;
        let tokenChart = null;
        let projectChart = null;
        let allData = null;
        let notificationsEnabled = false;
        let previousConversationStates = new Map();
        
        async function loadData() {
            try {
                const response = await fetch('/api/data');
                const data = await response.json();
                
                console.log('Data loaded:', data.timestamp);
                
                document.getElementById('loading').style.display = 'none';
                document.getElementById('dashboard').style.display = 'block';
                
                // Update timestamp
                document.getElementById('lastUpdate').textContent = \`last update: \${data.lastUpdate}\`;
                
                updateStats(data.summary);
                allConversations = data.conversations;
                allData = data; // Store data globally for access
                window.allData = data; // Keep for backward compatibility
                
                // Initialize date inputs on first load
                if (!document.getElementById('dateFrom').value) {
                    initializeDateInputs();
                }
                
                updateCharts(data);
                updateSessionsTable();
                
                // Check for conversation state changes and send notifications
                checkForNotifications(data.conversations);
                
            } catch (error) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('error').style.display = 'block';
                console.error('Failed to load data:', error);
            }
        }
        
        // Function to only update conversation data without refreshing charts
        async function loadConversationData() {
            try {
                const response = await fetch('/api/data');
                const data = await response.json();
                
                
                // Update timestamp
                document.getElementById('lastUpdate').textContent = \`last update: \${data.lastUpdate}\`;
                
                updateStats(data.summary);
                allConversations = data.conversations;
                allData = data; // Store data globally for access
                window.allData = data; // Keep for backward compatibility
                
                // Only update sessions table, not charts
                updateSessionsTable();
                
                // Check for conversation state changes and send notifications
                checkForNotifications(data.conversations);
                
            } catch (error) {
                console.error('Failed to refresh conversation data:', error);
            }
        }
        
        // Notification functions
        async function requestNotificationPermission() {
            if (!('Notification' in window)) {
                console.log('This browser does not support notifications');
                return false;
            }
            
            if (Notification.permission === 'granted') {
                notificationsEnabled = true;
                return true;
            }
            
            if (Notification.permission !== 'denied') {
                const permission = await Notification.requestPermission();
                notificationsEnabled = permission === 'granted';
                return notificationsEnabled;
            }
            
            return false;
        }
        
        function sendNotification(title, body, conversationId) {
            if (!notificationsEnabled) return;
            
            const notification = new Notification(title, {
                body: body,
                icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNCIgZmlsbD0iIzIxMjYyZCIvPgo8cGF0aCBkPSJNOCA4aDE2djE2SDh6IiBmaWxsPSIjZDU3NDU1Ii8+CjwvZGJnPgo=',
                badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjgiIGZpbGw9IiNkNTc0NTUiLz4KPC9zdmc+',
                tag: conversationId,
                requireInteraction: true
            });
            
            notification.onclick = function() {
                window.focus();
                this.close();
                // Focus on the conversation if possible
                if (conversationId) {
                    showSessionDetail(conversationId);
                }
            };
            
            // Auto close after 10 seconds
            setTimeout(() => {
                notification.close();
            }, 10000);
        }
        
        function checkForNotifications(conversations) {
            if (!notificationsEnabled) return;
            
            conversations.forEach(conv => {
                const currentState = conv.conversationState;
                const prevState = previousConversationStates.get(conv.id);
                
                // Check if conversation state changed to "Awaiting user input..."
                if (prevState && prevState !== currentState) {
                    if (currentState === 'Awaiting user input...' || 
                        currentState === 'User may be typing...' ||
                        currentState === 'Awaiting response...') {
                        
                        const title = 'Claude is waiting for you!';
                        const body = \`Project: \${conv.project} - Claude needs your input\`;
                        
                        sendNotification(title, body, conv.id);
                    }
                }
                
                // Update previous state
                previousConversationStates.set(conv.id, currentState);
            });
        }
        
        async function toggleNotifications() {
            const btn = document.getElementById('notificationBtn');
            
            if (!notificationsEnabled) {
                const granted = await requestNotificationPermission();
                if (granted) {
                    btn.textContent = 'notifications on';
                    btn.style.borderColor = '#3fb950';
                    btn.style.color = '#3fb950';
                    
                    // Send a test notification
                    sendNotification(
                        'Notifications enabled!', 
                        'You will now receive alerts when Claude is waiting for your input.',
                        null
                    );
                } else {
                    btn.textContent = 'notifications denied';
                    btn.style.borderColor = '#f85149';
                    btn.style.color = '#f85149';
                }
            } else {
                // Disable notifications
                notificationsEnabled = false;
                btn.textContent = 'enable notifications';
                btn.style.borderColor = '#30363d';
                btn.style.color = '#7d8590';
            }
        }
        
        function updateStats(summary) {
            document.getElementById('totalConversations').textContent = summary.totalConversations.toLocaleString();
            document.getElementById('totalTokens').textContent = summary.totalTokens.toLocaleString();
            document.getElementById('activeProjects').textContent = summary.activeProjects;
            document.getElementById('dataSize').textContent = summary.totalFileSize;
            
            // Update Claude sessions
            if (summary.claudeSessions) {
                document.getElementById('claudeSessions').textContent = summary.claudeSessions.total.toLocaleString();
                document.getElementById('claudeSessionsDetail').textContent = 
                    \`this month: \${summary.claudeSessions.currentMonth} • this week: \${summary.claudeSessions.thisWeek}\`;
            }
        }
        
        function initializeDateInputs() {
            const today = new Date();
            const sevenDaysAgo = new Date(today);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            document.getElementById('dateFrom').value = sevenDaysAgo.toISOString().split('T')[0];
            document.getElementById('dateTo').value = today.toISOString().split('T')[0];
        }
        
        function getDateRange() {
            const fromDate = new Date(document.getElementById('dateFrom').value);
            const toDate = new Date(document.getElementById('dateTo').value);
            toDate.setHours(23, 59, 59, 999); // Include the entire end date
            
            return { fromDate, toDate };
        }
        
        function filterConversationsByDate(conversations) {
            const { fromDate, toDate } = getDateRange();
            
            return conversations.filter(conv => {
                const convDate = new Date(conv.lastModified);
                return convDate >= fromDate && convDate <= toDate;
            });
        }
        
        function updateCharts(data) {
            // Wait for Chart.js to load before creating charts
            if (typeof Chart === 'undefined') {
                console.log('Chart.js not loaded yet, retrying in 100ms...');
                setTimeout(() => updateCharts(data), 100);
                return;
            }
            
            // Use ALL conversations but filter chart display by date range
            // This maintains the original behavior
            
            // Update Token Usage Over Time Chart
            updateTokenChart(data.conversations);
            
            // Update Project Activity Distribution Chart  
            updateProjectChart(data.conversations);
        }
        
        async function refreshCharts() {
            const refreshBtn = document.getElementById('refreshBtn');
            refreshBtn.classList.add('loading');
            refreshBtn.textContent = '🔄 refreshing...';
            
            try {
                // Use existing data but re-filter and update charts
                if (allData) {
                    updateCharts(allData);
                }
            } catch (error) {
                console.error('Error refreshing charts:', error);
            } finally {
                refreshBtn.classList.remove('loading');
                refreshBtn.textContent = 'refresh charts';
            }
        }
        
        function updateTokenChart(conversations) {
            // Check if Chart.js is available
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js not available for updateTokenChart');
                return;
            }
            
            // Prepare data for selected date range
            const { fromDate, toDate } = getDateRange();
            const dateRange = [];
            
            const currentDate = new Date(fromDate);
            while (currentDate <= toDate) {
                dateRange.push({
                    date: currentDate.toISOString().split('T')[0],
                    label: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    tokens: 0
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // Aggregate tokens by day
            conversations.forEach(conv => {
                const convDate = new Date(conv.lastModified).toISOString().split('T')[0];
                const dayData = dateRange.find(day => day.date === convDate);
                if (dayData) {
                    dayData.tokens += conv.tokens;
                }
            });
            
            const ctx = document.getElementById('tokenChart').getContext('2d');
            
            if (tokenChart) {
                tokenChart.destroy();
            }
            
            tokenChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dateRange.map(day => day.label),
                    datasets: [{
                        label: 'Tokens',
                        data: dateRange.map(day => day.tokens),
                        borderColor: '#d57455',
                        backgroundColor: 'rgba(213, 116, 85, 0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: '#d57455',
                        pointBorderColor: '#d57455',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: '#161b22',
                            titleColor: '#d57455',
                            bodyColor: '#c9d1d9',
                            borderColor: '#30363d',
                            borderWidth: 1,
                            titleFont: {
                                family: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                size: 12
                            },
                            bodyFont: {
                                family: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                size: 11
                            },
                            callbacks: {
                                title: function(context) {
                                    return context[0].label;
                                },
                                label: function(context) {
                                    return \`Tokens: \${context.parsed.y.toLocaleString()}\`;
                                }
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    hover: {
                        animationDuration: 200
                    },
                    scales: {
                        x: {
                            grid: {
                                color: '#30363d',
                                borderColor: '#30363d'
                            },
                            ticks: {
                                color: '#7d8590',
                                font: {
                                    family: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                    size: 11
                                }
                            }
                        },
                        y: {
                            grid: {
                                color: '#30363d',
                                borderColor: '#30363d'
                            },
                            ticks: {
                                color: '#7d8590',
                                font: {
                                    family: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                    size: 11
                                },
                                callback: function(value) {
                                    return value.toLocaleString();
                                }
                            }
                        }
                    }
                }
            });
        }
        
        function updateProjectChart(conversations) {
            // Check if Chart.js is available
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js not available for updateProjectChart');
                return;
            }
            
            // Aggregate data by project
            const projectData = {};
            
            conversations.forEach(conv => {
                if (!projectData[conv.project]) {
                    projectData[conv.project] = 0;
                }
                projectData[conv.project] += conv.tokens;
            });
            
            // Get top 5 projects and group others
            const sortedProjects = Object.entries(projectData)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5);
            
            const othersTotal = Object.entries(projectData)
                .slice(5)
                .reduce((sum, [,tokens]) => sum + tokens, 0);
            
            if (othersTotal > 0) {
                sortedProjects.push(['others', othersTotal]);
            }
            
            // Terminal-style colors
            const colors = [
                '#d57455', // Orange
                '#3fb950', // Green
                '#a5d6ff', // Blue
                '#f97316', // Orange variant
                '#c9d1d9', // Light gray
                '#7d8590'  // Gray
            ];
            
            const ctx = document.getElementById('projectChart').getContext('2d');
            
            if (projectChart) {
                projectChart.destroy();
            }
            
            projectChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: sortedProjects.map(([project]) => project),
                    datasets: [{
                        data: sortedProjects.map(([,tokens]) => tokens),
                        backgroundColor: colors.slice(0, sortedProjects.length),
                        borderColor: '#161b22',
                        borderWidth: 2,
                        hoverBorderWidth: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#7d8590',
                                font: {
                                    family: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                    size: 10
                                },
                                padding: 15,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        },
                        tooltip: {
                            backgroundColor: '#161b22',
                            titleColor: '#d57455',
                            bodyColor: '#c9d1d9',
                            borderColor: '#30363d',
                            borderWidth: 1,
                            titleFont: {
                                family: 'Monaco, Menlo, Ubuntu Mono, monospace'
                            },
                            bodyFont: {
                                family: 'Monaco, Menlo, Ubuntu Mono, monospace'
                            },
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((sum, value) => sum + value, 0);
                                    const percentage = ((context.parsed / total) * 100).toFixed(1);
                                    return \`\${context.label}: \${context.parsed.toLocaleString()} tokens (\${percentage}%)\`;
                                }
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        }
        
        function updateSessionsTable() {
            const tableBody = document.getElementById('sessionsTable');
            const noSessionsDiv = document.getElementById('noSessions');
            
            // Filter conversations based on current filter
            let filteredConversations = allConversations;
            if (currentFilter !== 'all') {
                filteredConversations = allConversations.filter(conv => conv.status === currentFilter);
            }
            
            if (filteredConversations.length === 0) {
                tableBody.innerHTML = '';
                noSessionsDiv.style.display = 'block';
                return;
            }
            
            noSessionsDiv.style.display = 'none';
            
            tableBody.innerHTML = filteredConversations.map(conv => \`
                <tr onclick="showSessionDetail('\${conv.id}')" style="cursor: pointer;">
                    <td>
                        <div class="session-id-container">
                            <div class="session-id">
                                \${conv.id.substring(0, 8)}...
                                \${conv.runningProcess ? \`<span class="process-indicator" title="Active claude process (PID: \${conv.runningProcess.pid})"></span>\` : ''}
                            </div>
                            <div class="status-squares">
                                \${generateStatusSquaresHTML(conv.statusSquares || [])}
                            </div>
                        </div>
                    </td>
                    <td class="session-project">\${conv.project}</td>
                    <td class="session-model" title="\${conv.modelInfo ? conv.modelInfo.primaryModel + ' (' + conv.modelInfo.currentServiceTier + ')' : 'N/A'}">\${conv.modelInfo ? conv.modelInfo.primaryModel : 'N/A'}</td>
                    <td class="session-messages">\${conv.messageCount}</td>
                    <td class="session-tokens">\${conv.tokens.toLocaleString()}</td>
                    <td class="session-time">\${formatTime(conv.lastModified)}</td>
                    <td class="conversation-state \${getStateClass(conv.conversationState)}">\${conv.conversationState}</td>
                    <td class="status-\${conv.status}">\${conv.status}</td>
                </tr>
            \`).join('');
            
            // NEW: Add orphan processes (active claude commands without conversation)
            if (window.allData && window.allData.orphanProcesses && window.allData.orphanProcesses.length > 0) {
                const orphanRows = window.allData.orphanProcesses.map(process => \`
                    <tr style="background: rgba(248, 81, 73, 0.1); cursor: default;">
                        <td>
                            <div class="session-id-container">
                                <div class="session-id">
                                    orphan-\${process.pid}
                                    <span class="process-indicator orphan" title="Orphan claude process (PID: \${process.pid})"></span>
                                </div>
                            </div>
                        </td>
                        <td class="session-project">\${process.workingDir}</td>
                        <td class="session-model">Unknown</td>
                        <td class="session-messages">-</td>
                        <td class="session-tokens">-</td>
                        <td class="session-time">Running</td>
                        <td class="conversation-state">Active process</td>
                        <td class="status-active">orphan</td>
                    </tr>
                \`).join('');
                
                if (currentFilter === 'active' || currentFilter === 'all') {
                    tableBody.innerHTML += orphanRows;
                }
            }
        }
        
        function formatTime(date) {
            const now = new Date();
            const diff = now - new Date(date);
            const minutes = Math.floor(diff / (1000 * 60));
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (minutes < 1) return 'now';
            if (minutes < 60) return \`\${minutes}m ago\`;
            if (hours < 24) return \`\${hours}h ago\`;
            return \`\${days}d ago\`;
        }
        
        function formatMessageTime(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
        }
        
        function getStateClass(conversationState) {
            if (conversationState.includes('working') || conversationState.includes('Working')) {
                return 'working';
            }
            if (conversationState.includes('typing') || conversationState.includes('Typing')) {
                return 'typing';
            }
            return '';
        }
        
        function generateStatusSquaresHTML(statusSquares) {
            if (!statusSquares || statusSquares.length === 0) {
                return '';
            }
            
            return statusSquares.map(square => 
                \`<div class="status-square \${square.type}" data-tooltip="\${square.tooltip}"></div>\`
            ).join('');
        }
        
        function getMessageType(message) {
            if (message.role === 'user') {
                return {
                    type: 'pending',
                    tooltip: 'User input'
                };
            } else if (message.role === 'assistant') {
                const content = message.content || '';
                
                if (typeof content === 'string') {
                    if (content.includes('[Tool:') || content.includes('tool_use')) {
                        return {
                            type: 'tool',
                            tooltip: 'Tool execution'
                        };
                    } else if (content.includes('error') || content.includes('Error') || content.includes('failed')) {
                        return {
                            type: 'error',
                            tooltip: 'Error in response'
                        };
                    } else {
                        return {
                            type: 'success',
                            tooltip: 'Successful response'
                        };
                    }
                }
            }
            
            return {
                type: 'success',
                tooltip: 'Message'
            };
        }
        
        // Filter button handlers
        document.addEventListener('DOMContentLoaded', function() {
            const filterButtons = document.querySelectorAll('.filter-btn');
            
            filterButtons.forEach(button => {
                button.addEventListener('click', function() {
                    // Remove active class from all buttons
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    
                    // Add active class to clicked button
                    this.classList.add('active');
                    
                    // Update current filter
                    currentFilter = this.dataset.filter;
                    
                    // Update table
                    updateSessionsTable();
                });
            });
        });
        
        // Session detail functions
        async function showSessionDetail(sessionId) {
            currentSession = allConversations.find(conv => conv.id === sessionId);
            if (!currentSession) return;
            
            // Hide sessions list and show detail
            document.querySelector('.filter-bar').style.display = 'none';
            document.querySelector('.sessions-table').style.display = 'none';
            document.getElementById('noSessions').style.display = 'none';
            document.getElementById('sessionDetail').classList.add('active');
            
            // Update title
            document.getElementById('detailTitle').textContent = \`conversation: \${sessionId.substring(0, 8)}...\`;
            
            // Load session info
            updateSessionInfo(currentSession);
            
            // Load conversation history
            await loadConversationHistory(currentSession);
        }
        
        function showSessionsList() {
            document.getElementById('sessionDetail').classList.remove('active');
            document.querySelector('.filter-bar').style.display = 'flex';
            document.querySelector('.sessions-table').style.display = 'table';
            updateSessionsTable();
            currentSession = null;
        }
        
        function updateSessionInfo(session) {
            const container = document.getElementById('sessionInfo');
            
            container.innerHTML = \`
                <div class="info-item">
                    <div class="info-label">conversation id</div>
                    <div class="info-value">\${session.id}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">project</div>
                    <div class="info-value">\${session.project}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">messages</div>
                    <div class="info-value">\${session.messageCount}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">total tokens</div>
                    <div class="info-value">\${session.tokens.toLocaleString()}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">model</div>
                    <div class="info-value model">\${session.modelInfo ? session.modelInfo.primaryModel : 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">service tier</div>
                    <div class="info-value">\${session.modelInfo ? session.modelInfo.currentServiceTier : 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">token details</div>
                    <div class="info-value">\${session.tokenUsage ? session.tokenUsage.inputTokens.toLocaleString() + ' in / ' + session.tokenUsage.outputTokens.toLocaleString() + ' out' : 'N/A'}</div>
                </div>
                \${session.tokenUsage && (session.tokenUsage.cacheCreationTokens > 0 || session.tokenUsage.cacheReadTokens > 0) ? 
                    \`<div class="info-item">
                        <div class="info-label">cache tokens</div>
                        <div class="info-value">\${session.tokenUsage.cacheCreationTokens.toLocaleString()} created / \${session.tokenUsage.cacheReadTokens.toLocaleString()} read</div>
                    </div>\` : ''
                }
                <div class="info-item">
                    <div class="info-label">file size</div>
                    <div class="info-value">\${formatBytes(session.fileSize)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">created</div>
                    <div class="info-value">\${new Date(session.created).toLocaleString()}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">last modified</div>
                    <div class="info-value">\${new Date(session.lastModified).toLocaleString()}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">conversation state</div>
                    <div class="info-value conversation-state \${getStateClass(session.conversationState)}">\${session.conversationState}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">status</div>
                    <div class="info-value status-\${session.status}">\${session.status}</div>
                </div>
            \`;
        }
        
        async function loadConversationHistory(session) {
            try {
                const response = await fetch(\`/api/session/\${session.id}\`);
                const sessionData = await response.json();
                
                const container = document.getElementById('conversationHistory');
                const searchInput = document.getElementById('conversationSearch');
                
                if (!sessionData.messages || sessionData.messages.length === 0) {
                    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #7d8590;">no messages found</div>';
                    searchInput.style.display = 'none';
                    return;
                }
                searchInput.style.display = 'block';

                const renderMessages = (filter = '') => {
                    const lowerCaseFilter = filter.toLowerCase();
                    const filteredMessages = sessionData.messages.filter(m => 
                        (m.content || '').toLowerCase().includes(lowerCaseFilter)
                    );

                    if (filteredMessages.length === 0) {
                        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #7d8590;">No messages match your search.</div>';
                        return;
                    }

                    const reversedMessages = filteredMessages.slice().reverse();

                    container.innerHTML = reversedMessages.map((message, index) => {
                        const messageType = getMessageType(message);
                        const messageNum = filteredMessages.length - index;
                        return \`
                            <div class="message">
                                <div class="message-type-indicator \${messageType.type}" data-tooltip="\${messageType.tooltip}"></div>
                                <div class="message-header">
                                    <div class="message-role \${message.role}">\${message.role}</div>
                                    <div class="message-time">
                                        #\${messageNum} • \${message.timestamp ? formatMessageTime(message.timestamp) : 'unknown time'}
                                    </div>
                                </div>
                                <div class="message-content">\${truncateContent(message.content || 'no content')}</div>
                            </div>
                        \`;
                    }).join('');
                }

                renderMessages();

                searchInput.addEventListener('input', () => {
                    renderMessages(searchInput.value);
                });
                
            } catch (error) {
                document.getElementById('conversationHistory').innerHTML = 
                    '<div style="padding: 20px; text-align: center; color: #f85149;">error loading conversation history</div>';
                console.error('Failed to load conversation history:', error);
            }
        }
        
        function truncateContent(content, maxLength = 1000) {
            if (typeof content !== 'string') return 'no content';
            if (!content.trim()) return 'empty message';
            if (content.length <= maxLength) return content;
            return content.substring(0, maxLength) + '\\n\\n[... message truncated ...]';
        }
        
        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        function exportSession() {
            if (!currentSession) return;
            
            const format = document.getElementById('exportFormat').value;
            
            // Fetch conversation history and export
            fetch(\`/api/session/\${currentSession.id}\`)
                .then(response => response.json())
                .then(sessionData => {
                    if (format === 'csv') {
                        exportSessionAsCSV(sessionData);
                    } else if (format === 'json') {
                        exportSessionAsJSON(sessionData);
                    }
                })
                .catch(error => {
                    console.error(\`Failed to export \${format.toUpperCase()}:\`, error);
                    alert(\`Failed to export \${format.toUpperCase()}. Please try again.\`);
                });
        }
        
        function exportSessionAsCSV(sessionData) {
            // Create CSV content
            let csvContent = 'Conversation ID,Project,Message Count,Tokens,File Size,Created,Last Modified,Conversation State,Status\\n';
            csvContent += \`"\${currentSession.id}","\${currentSession.project}",\${currentSession.messageCount},\${currentSession.tokens},\${currentSession.fileSize},"\${new Date(currentSession.created).toISOString()}","\${new Date(currentSession.lastModified).toISOString()}","\${currentSession.conversationState}","\${currentSession.status}"\\n\\n\`;
            
            csvContent += 'Message #,Role,Timestamp,Content\\n';
            
            // Add conversation history
            if (sessionData.messages) {
                sessionData.messages.forEach((message, index) => {
                    const content = (message.content || 'no content').replace(/"/g, '""');
                    const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : 'unknown';
                    csvContent += \`\${index + 1},"\${message.role}","\${timestamp}","\${content}"\\n\`;
                });
            }
            
            // Download CSV
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            downloadFile(blob, \`claude-conversation-\${currentSession.id.substring(0, 8)}.csv\`);
        }
        
        function exportSessionAsJSON(sessionData) {
            // Create comprehensive JSON export
            const exportData = {
                conversation: {
                    id: currentSession.id,
                    filename: currentSession.filename,
                    project: currentSession.project,
                    messageCount: currentSession.messageCount,
                    tokens: currentSession.tokens,
                    fileSize: currentSession.fileSize,
                    created: currentSession.created,
                    lastModified: currentSession.lastModified,
                    conversationState: currentSession.conversationState,
                    status: currentSession.status
                },
                messages: sessionData.messages || [],
                metadata: {
                    exportedAt: new Date().toISOString(),
                    exportFormat: 'json',
                    toolVersion: '1.5.7'
                }
            };
            
            // Download JSON
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
            downloadFile(blob, \`claude-conversation-\${currentSession.id.substring(0, 8)}.json\`);
        }
        
        function downloadFile(blob, filename) {
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
        
        function refreshSessionDetail() {
            if (currentSession) {
                loadConversationHistory(currentSession);
            }
        }
        
        // Manual refresh function
        async function forceRefresh() {
            try {
                const response = await fetch('/api/refresh');
                const result = await response.json();
                console.log('Manual refresh:', result);
                await loadData();
            } catch (error) {
                console.error('Failed to refresh:', error);
            }
        }
        
        // Wait for DOM and Chart.js to load
        document.addEventListener('DOMContentLoaded', function() {
            // Check if Chart.js is loaded
            function initWhenReady() {
                if (typeof Chart !== 'undefined') {
                    console.log('Chart.js loaded successfully');
                    loadData();
                    
                    // Automatic refresh for conversation data every 500ms for near real-time updates
                    setInterval(() => {
                        loadConversationData();
                    }, 500);
                    
                    // Additional fast refresh for critical state changes
                    let fastRefreshCount = 0;
                    const fastRefreshInterval = setInterval(() => {
                        loadConversationData();
                        fastRefreshCount++;
                        
                        // Stop fast refresh after 30 seconds (60 * 250ms)
                        if (fastRefreshCount > 120) {
                            clearInterval(fastRefreshInterval);
                        }
                    }, 250);
                } else {
                    console.log('Waiting for Chart.js to load...');
                    setTimeout(initWhenReady, 100);
                }
            }
            
            initWhenReady();
            
            // Add event listeners for date inputs
            document.getElementById('dateFrom').addEventListener('change', refreshCharts);
            document.getElementById('dateTo').addEventListener('change', refreshCharts);
            
            // Initialize notification button state
            updateNotificationButtonState();
        });
        
        function updateNotificationButtonState() {
            const btn = document.getElementById('notificationBtn');
            if (!btn) return;
            
            if (Notification.permission === 'granted') {
                notificationsEnabled = true;
                btn.textContent = 'notifications on';
                btn.style.borderColor = '#3fb950';
                btn.style.color = '#3fb950';
            } else if (Notification.permission === 'denied') {
                btn.textContent = 'notifications denied';
                btn.style.borderColor = '#f85149';
                btn.style.color = '#f85149';
            }
        }
        
        // Add keyboard shortcut for refresh (F5 or Ctrl+R)
        document.addEventListener('keydown', function(e) {
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                forceRefresh();
            }
        });
    </script>
</body>
</html>`;

  await fs.writeFile(path.join(webDir, 'index.html'), htmlContent);
}

module.exports = {
  runAnalytics
};