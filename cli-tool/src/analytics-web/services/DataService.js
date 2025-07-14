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
      console.error(`Error fetching ${endpoint}:`, error);
      
      // Return cached data if available, even if stale
      if (this.cache.has(cacheKey)) {
        console.warn('Using stale cached data due to fetch error');
        return this.cache.get(cacheKey).data;
      }
      
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
   * Get session data for detailed analysis
   * @returns {Promise<Object>} Session data
   */
  async getSessionData() {
    return await this.cachedFetch('/api/session/data');
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
    console.log('DataService cache cleared');
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
    if (!this.webSocketService) return;
    
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
    
    // Listen for connection status
    this.webSocketService.on('connected', () => {
      console.log('✅ WebSocket connected - enabling real-time updates');
      this.realTimeEnabled = true;
      this.subscribeToChannels();
    });
    
    this.webSocketService.on('disconnected', () => {
      console.log('❌ WebSocket disconnected - falling back to polling');
      this.realTimeEnabled = false;
      this.startFallbackPolling();
    });
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
      this.startPeriodicRefresh(10000); // More frequent polling as fallback
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