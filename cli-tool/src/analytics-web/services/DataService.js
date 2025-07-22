/**
 * DataService - Handles API communication and data caching
 * Part of the modular frontend architecture
 */
class DataService {
  constructor(webSocketService = null) {
    this.cache = new Map();
    this.eventListeners = new Set();
    this.baseURL = '';
    this.lastFetch = {};
    this.webSocketService = webSocketService;
    this.realTimeEnabled = false;
    
    // Setup WebSocket integration if available
    if (this.webSocketService) {
      this.setupWebSocketIntegration();
    }
  }

  /**
   * Add event listener for data changes
   * @param {Function} callback - Callback function to call on data changes
   */
  addEventListener(callback) {
    this.eventListeners.add(callback);
  }

  /**
   * Remove event listener
   * @param {Function} callback - Callback function to remove
   */
  removeEventListener(callback) {
    this.eventListeners.delete(callback);
  }

  /**
   * Notify all listeners of data changes
   * @param {string} type - Type of data that changed
   * @param {*} data - New data
   */
  notifyListeners(type, data) {
    this.eventListeners.forEach(callback => {
      try {
        callback(type, data);
      } catch (error) {
        console.error('Error in DataService listener:', error);
      }
    });
  }

  /**
   * Generic fetch with caching support
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<*>} Response data
   */
  async cachedFetch(endpoint, options = {}) {
    const cacheKey = `${endpoint}_${JSON.stringify(options)}`;
    const now = Date.now();
    const cacheDuration = options.cacheDuration || 30000; // 30 seconds default

    // Check if we have cached data that's still valid
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (now - cached.timestamp < cacheDuration) {
        return cached.data;
      }
    }

    try {
      const response = await fetch(this.baseURL + endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Cache the response
      this.cache.set(cacheKey, {
        data,
        timestamp: now
      });

      return data;
    } catch (error) {
      console.warn(`Server not available for ${endpoint}:`, error.message);
      
      // Return cached data if available, even if stale
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey).data;
      }
      
      // No fallback data - throw error if server unavailable
      throw error;
    }
  }


  /**
   * Get conversations data
   * @returns {Promise<Object>} Conversations data
   */
  async getConversations() {
    return await this.cachedFetch('/api/data');
  }

  /**
   * Get paginated conversations
   * @param {number} page - Page number (0-based)
   * @param {number} limit - Number of conversations per page
   * @returns {Promise<Object>} Paginated conversations data
   */
  async getConversationsPaginated(page = 0, limit = 10) {
    const cacheDuration = this.realTimeEnabled ? 30000 : 5000;
    return await this.cachedFetch(`/api/conversations?page=${page}&limit=${limit}`, {
      cacheDuration
    });
  }

  /**
   * Get conversation states for real-time updates
   * @returns {Promise<Object>} Conversation states
   */
  async getConversationStates() {
    const cacheDuration = this.realTimeEnabled ? 30000 : 5000; // Longer cache with real-time
    return await this.cachedFetch('/api/conversation-state', {
      cacheDuration
    });
  }

  /**
   * Get chart data for visualizations
   * @returns {Promise<Object>} Chart data
   */
  async getChartData() {
    return await this.cachedFetch('/api/charts');
  }

  /**
   * Get session data for Max plan usage tracking
   * @returns {Promise<Object>} Session data including timer and usage info
   */
  async getSessionData() {
    const cacheDuration = this.realTimeEnabled ? 30000 : 5000; // 30s with real-time, 5s without
    return await this.cachedFetch('/api/session/data', { cacheDuration });
  }

  /**
   * Get project statistics
   * @returns {Promise<Object>} Project statistics
   */
  async getProjectStats() {
    return await this.cachedFetch('/api/session/projects');
  }

  /**
   * Get system health information
   * @returns {Promise<Object>} System health data
   */
  async getSystemHealth() {
    return await this.cachedFetch('/api/system/health');
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Clear specific cache entry
   * @param {string} endpoint - Endpoint to clear from cache
   */
  clearCacheEntry(endpoint) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(endpoint)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Setup WebSocket integration for real-time updates
   */
  setupWebSocketIntegration() {
    if (!this.webSocketService) {
      console.log('⚠️ No WebSocket service available - starting polling immediately');
      this.startFallbackPolling();
      return;
    }
    
    console.log('🔌 Setting up WebSocket integration for DataService');
    
    // Listen for data refresh events
    this.webSocketService.on('data_refresh', (data) => {
      console.log('📊 Real-time data refresh received');
      this.handleRealTimeDataRefresh(data);
    });
    
    // Listen for conversation state changes
    this.webSocketService.on('conversation_state_change', (data) => {
      console.log('🔄 Real-time conversation state change');
      this.handleRealTimeStateChange(data);
    });
    
    // Listen for new messages
    this.webSocketService.on('new_message', (data) => {
      console.log('📨 Real-time new message received:', data);
      this.handleNewMessage(data);
    });
    
    // Listen for connection status
    this.webSocketService.on('connected', () => {
      console.log('✅ WebSocket connected - enabling real-time updates');
      this.realTimeEnabled = true;
      this.subscribeToChannels();
      this.stopFallbackPolling(); // Stop polling when WebSocket connects
    });
    
    this.webSocketService.on('disconnected', () => {
      console.log('❌ WebSocket disconnected - falling back to polling');
      this.realTimeEnabled = false;
      this.startFallbackPolling();
    });
    
    // Start polling immediately as fallback, stop if WebSocket connects successfully
    setTimeout(() => {
      if (!this.realTimeEnabled) {
        console.log('⚠️ WebSocket not connected after timeout - starting fallback polling');
        this.startFallbackPolling();
      }
    }, 1000); // Give WebSocket 1 second to connect
  }
  
  /**
   * Subscribe to WebSocket channels
   */
  async subscribeToChannels() {
    if (!this.webSocketService || !this.realTimeEnabled) return;
    
    try {
      await this.webSocketService.subscribe('data_updates');
      await this.webSocketService.subscribe('conversation_updates');
      await this.webSocketService.subscribe('system_updates');
      console.log('📡 Subscribed to real-time channels');
    } catch (error) {
      console.error('Error subscribing to channels:', error);
    }
  }
  
  /**
   * Handle real-time data refresh
   * @param {Object} data - Fresh data from server
   */
  handleRealTimeDataRefresh(data) {
    // Clear relevant cache entries
    this.clearCacheEntry('/api/data');
    this.clearCacheEntry('/api/conversation-state');
    
    // Notify listeners
    this.notifyListeners('data_refresh', data);
  }
  
  /**
   * Handle real-time conversation state change
   * @param {Object} data - State change data
   */
  handleRealTimeStateChange(data) {
    // Clear conversation state cache
    this.clearCacheEntry('/api/conversation-state');
    
    // Notify listeners
    this.notifyListeners('conversation_state_change', data);
  }
  
  /**
   * Handle real-time new message
   * @param {Object} data - New message data
   */
  handleNewMessage(data) {
    console.log('📨 DataService: Processing new message for conversation', data.conversationId);
    console.log('🔧 DataService: Raw message data:', {
      conversationId: data.conversationId,
      messageRole: data.message?.role,
      messageContent: data.message?.content,
      messageContentType: Array.isArray(data.message?.content) ? 'array' : typeof data.message?.content,
      contentBlocks: Array.isArray(data.message?.content) ? data.message.content.map(b => ({ type: b.type, hasData: !!b.data })) : 'not array',
      hasToolResults: !!data.message?.toolResults,
      toolResultsCount: data.message?.toolResults?.length || 0,
      metadata: data.metadata
    });
    
    // Clear relevant cache entries for the affected conversation
    this.clearCacheEntry(`/api/conversations/${data.conversationId}/messages`);
    
    // Notify listeners about the new message
    this.notifyListeners('new_message', {
      conversationId: data.conversationId,
      message: data.message,
      metadata: data.metadata
    });
    
    console.log('📨 DataService: New message processed and listeners notified for conversation', data.conversationId);
  }
  
  /**
   * Start periodic data refresh (fallback when WebSocket unavailable)
   * @param {number} interval - Refresh interval in milliseconds
   */
  startPeriodicRefresh(interval = 30000) {
    // Don't start polling if real-time is enabled
    if (this.realTimeEnabled) {
      console.log('⚡ Real-time updates enabled - skipping periodic refresh');
      return;
    }
    
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    console.log('📅 Starting periodic refresh (fallback mode)');
    this.refreshInterval = setInterval(async () => {
      try {
        // Only refresh if real-time is not available
        if (!this.realTimeEnabled) {
          const [conversations, states] = await Promise.all([
            this.getConversations(),
            this.getConversationStates()
          ]);

          // Notify listeners of fresh data
          this.notifyListeners('conversations', conversations);
          this.notifyListeners('states', states);
        }
      } catch (error) {
        console.error('Error during periodic refresh:', error);
      }
    }, interval);
  }
  
  /**
   * Start fallback polling when WebSocket disconnects
   */
  startFallbackPolling() {
    if (!this.refreshInterval) {
      console.log('🔄 Starting fallback polling due to WebSocket disconnect');
      this.startPeriodicRefresh(5000); // Very frequent polling as fallback (5 seconds)
    }
  }
  
  /**
   * Stop fallback polling when WebSocket reconnects
   */
  stopFallbackPolling() {
    if (this.refreshInterval) {
      console.log('🛑 Stopping fallback polling - WebSocket reconnected');
      this.stopPeriodicRefresh();
    }
  }

  /**
   * Stop periodic refresh
   */
  stopPeriodicRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Request real-time data refresh
   */
  async requestRefresh() {
    if (this.webSocketService && this.realTimeEnabled) {
      console.log('🔄 Requesting refresh via WebSocket');
      try {
        await this.webSocketService.requestRefresh();
        return true;
      } catch (error) {
        console.error('Error requesting WebSocket refresh:', error);
      }
    }
    
    // Fallback to cache clearing
    console.log('🔄 Falling back to cache clear for refresh');
    this.clearCache();
    return false;
  }
  
  /**
   * Clear server-side cache via API
   * @param {string} type - Cache type to clear ('all', 'conversations', or undefined for all)
   * @returns {Promise<boolean>} Success status
   */
  async clearServerCache(type = 'all') {
    try {
      console.log(`🗑️ Clearing server cache: ${type}`);
      const response = await fetch('/api/cache/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Server cache cleared:', result.message);
        
        // Also clear local cache
        this.clearCache();
        return true;
      } else {
        console.error('❌ Failed to clear server cache:', response.statusText);
        return false;
      }
    } catch (error) {
      console.error('❌ Error clearing server cache:', error);
      return false;
    }
  }

  /**
   * Set WebSocket service (for late initialization)
   * @param {WebSocketService} webSocketService - WebSocket service instance
   */
  setWebSocketService(webSocketService) {
    this.webSocketService = webSocketService;
    this.setupWebSocketIntegration();
  }
  
  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      listeners: this.eventListeners.size,
      realTimeEnabled: this.realTimeEnabled,
      webSocketConnected: this.webSocketService ? this.webSocketService.getStatus().isConnected : false
    };
  }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataService;
}