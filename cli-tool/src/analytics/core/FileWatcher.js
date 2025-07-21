const chalk = require('chalk');
const chokidar = require('chokidar');
const path = require('path');

/**
 * FileWatcher - Handles file system watching and automatic data refresh
 * Extracted from monolithic analytics.js for better maintainability
 */
class FileWatcher {
  constructor() {
    this.watchers = [];
    this.intervals = [];
    this.isActive = false;
  }

  /**
   * Setup file watchers for real-time updates
   * @param {string} claudeDir - Path to Claude directory
   * @param {Function} dataRefreshCallback - Callback to refresh data
   * @param {Function} processRefreshCallback - Callback to refresh process data
   * @param {Object} dataCache - DataCache instance for invalidation
   */
  setupFileWatchers(claudeDir, dataRefreshCallback, processRefreshCallback, dataCache = null, conversationChangeCallback = null) {
    console.log(chalk.blue('👀 Setting up file watchers for real-time updates...'));

    this.claudeDir = claudeDir;
    this.dataRefreshCallback = dataRefreshCallback;
    this.processRefreshCallback = processRefreshCallback;
    this.dataCache = dataCache;
    this.conversationChangeCallback = conversationChangeCallback;

    this.setupConversationWatcher();
    this.setupProjectWatcher();
    this.setupPeriodicRefresh();
    
    this.isActive = true;
  }

  /**
   * Setup watcher for conversation files (.jsonl)
   */
  setupConversationWatcher() {
    const conversationWatcher = chokidar.watch([
      path.join(this.claudeDir, '**/*.jsonl')
    ], {
      persistent: true,
      ignoreInitial: true,
    });

    conversationWatcher.on('change', async (filePath) => {
      console.log(chalk.yellow(`🔄 Conversation file changed: ${filePath}`));
      
      // Extract conversation ID from file path
      const conversationId = this.extractConversationId(filePath);
      
      // Invalidate cache for the changed file
      if (this.dataCache && filePath) {
        this.dataCache.invalidateFile(filePath);
      }
      
      // Notify specific conversation change if callback exists
      if (this.conversationChangeCallback && conversationId) {
        console.log(chalk.blue(`📨 Notifying conversation change: ${conversationId}`));
        await this.conversationChangeCallback(conversationId, filePath);
      }
      
      await this.triggerDataRefresh();
      console.log(chalk.green('✅ Data updated'));
    });

    conversationWatcher.on('add', async () => {
      console.log(chalk.yellow('📝 New conversation file detected...'));
      await this.triggerDataRefresh();
      console.log(chalk.green('✅ Data updated'));
    });

    this.watchers.push(conversationWatcher);
  }

  /**
   * Setup watcher for project directories
   */
  setupProjectWatcher() {
    const projectWatcher = chokidar.watch(this.claudeDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 2, // Increased depth to catch subdirectories
    });

    projectWatcher.on('addDir', async () => {
      console.log(chalk.yellow('📁 New project directory detected...'));
      await this.triggerDataRefresh();
      console.log(chalk.green('✅ Data updated'));
    });

    projectWatcher.on('change', async () => {
      console.log(chalk.yellow('📁 Project directory changed...'));
      await this.triggerDataRefresh();
      console.log(chalk.green('✅ Data updated'));
    });

    this.watchers.push(projectWatcher);
  }

  /**
   * Setup periodic refresh intervals
   */
  setupPeriodicRefresh() {
    // Periodic refresh to catch any missed changes (reduced frequency)
    const dataRefreshInterval = setInterval(async () => {
      console.log(chalk.blue('⏱️  Periodic data refresh...'));
      await this.triggerDataRefresh();
    }, 120000); // Every 2 minutes (reduced from 30 seconds)

    this.intervals.push(dataRefreshInterval);

    // Process updates for active processes (reduced frequency)
    const processRefreshInterval = setInterval(async () => {
      if (this.processRefreshCallback) {
        await this.processRefreshCallback();
      }
    }, 30000); // Every 30 seconds (reduced from 10 seconds)

    this.intervals.push(processRefreshInterval);
  }

  /**
   * Extract conversation ID from file path
   * @param {string} filePath - Path to the conversation file
   * @returns {string|null} Conversation ID or null if not found
   */
  extractConversationId(filePath) {
    try {
      // Handle different path formats:
      // /Users/user/.claude/projects/PROJECT_NAME/conversation.jsonl -> PROJECT_NAME
      // /Users/user/.claude/CONVERSATION_ID.jsonl -> CONVERSATION_ID
      
      const pathParts = filePath.split(path.sep);
      const fileName = pathParts[pathParts.length - 1];
      
      if (fileName === 'conversation.jsonl') {
        // Project-based conversation
        const projectName = pathParts[pathParts.length - 2];
        return projectName;
      } else if (fileName.endsWith('.jsonl')) {
        // Direct conversation file
        return fileName.replace('.jsonl', '');
      }
      
      return null;
    } catch (error) {
      console.error(chalk.red('Error extracting conversation ID:'), error);
      return null;
    }
  }

  /**
   * Trigger data refresh with error handling
   */
  async triggerDataRefresh() {
    try {
      if (this.dataRefreshCallback) {
        await this.dataRefreshCallback();
      }
    } catch (error) {
      console.error(chalk.red('Error during data refresh:'), error.message);
    }
  }

  /**
   * Add a custom watcher
   * @param {Object} watcher - Chokidar watcher instance
   */
  addWatcher(watcher) {
    this.watchers.push(watcher);
  }

  /**
   * Add a custom interval
   * @param {number} intervalId - Interval ID from setInterval
   */
  addInterval(intervalId) {
    this.intervals.push(intervalId);
  }

  /**
   * Pause all watchers and intervals
   */
  pause() {
    console.log(chalk.yellow('⏸️  Pausing file watchers...'));
    
    // Pause watchers (they will still exist but not trigger events)
    this.watchers.forEach(watcher => {
      if (watcher.unwatch) {
        // Temporarily remove all watched paths
        const watchedPaths = watcher.getWatched();
        Object.keys(watchedPaths).forEach(dir => {
          watchedPaths[dir].forEach(file => {
            watcher.unwatch(path.join(dir, file));
          });
        });
      }
    });

    this.isActive = false;
  }

  /**
   * Resume all watchers
   */
  resume() {
    if (!this.isActive && this.claudeDir) {
      console.log(chalk.green('▶️  Resuming file watchers...'));
      
      // Clear existing watchers
      this.stop();
      
      // Restart watchers
      this.setupFileWatchers(
        this.claudeDir, 
        this.dataRefreshCallback, 
        this.processRefreshCallback
      );
    }
  }

  /**
   * Stop and cleanup all watchers and intervals
   */
  stop() {
    console.log(chalk.red('🛑 Stopping file watchers...'));

    // Close all watchers
    this.watchers.forEach(watcher => {
      try {
        watcher.close();
      } catch (error) {
        console.warn(chalk.yellow('Warning: Error closing watcher:'), error.message);
      }
    });

    // Clear all intervals
    this.intervals.forEach(intervalId => {
      clearInterval(intervalId);
    });

    // Reset arrays
    this.watchers = [];
    this.intervals = [];
    this.isActive = false;
  }

  /**
   * Get watcher status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isActive: this.isActive,
      watcherCount: this.watchers.length,
      intervalCount: this.intervals.length,
      watchedDir: this.claudeDir
    };
  }

  /**
   * Check if watchers are active
   * @returns {boolean} True if watchers are active
   */
  isWatching() {
    return this.isActive && this.watchers.length > 0;
  }

  /**
   * Get list of watched paths (for debugging)
   * @returns {Array} Array of watched paths
   */
  getWatchedPaths() {
    const watchedPaths = [];
    
    this.watchers.forEach(watcher => {
      if (watcher.getWatched) {
        const watched = watcher.getWatched();
        Object.keys(watched).forEach(dir => {
          watched[dir].forEach(file => {
            watchedPaths.push(path.join(dir, file));
          });
        });
      }
    });

    return watchedPaths;
  }

  /**
   * Set debounced refresh to avoid spam
   * @param {number} debounceMs - Debounce time in milliseconds
   */
  setDebounce(debounceMs = 200) {
    let debounceTimeout;
    const originalCallback = this.dataRefreshCallback;
    
    this.dataRefreshCallback = async (...args) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(async () => {
        if (originalCallback) {
          await originalCallback(...args);
        }
      }, debounceMs);
    };
  }

  /**
   * Force immediate refresh
   */
  async forceRefresh() {
    console.log(chalk.cyan('🔄 Force refreshing data...'));
    await this.triggerDataRefresh();
    if (this.processRefreshCallback) {
      await this.processRefreshCallback();
    }
  }
}

module.exports = FileWatcher;