/**
 * AgentsPage - Dedicated page for managing and viewing agent conversations
 * Handles conversation display, filtering, and detailed analysis
 */
class AgentsPage {
  constructor(container, services) {
    this.container = container;
    this.dataService = services.data;
    this.stateService = services.state;
    
    this.components = {};
    this.filters = {
      status: 'all',
      timeRange: '7d',
      search: ''
    };
    this.isInitialized = false;
    
    // Pagination state
    this.pagination = {
      currentPage: 0,
      limit: 10,
      hasMore: true,
      isLoading: false
    };
    
    // Loaded conversations cache
    this.loadedConversations = [];
    this.loadedMessages = new Map(); // Cache messages by conversation ID
    
    // Subscribe to state changes
    this.unsubscribe = this.stateService.subscribe(this.handleStateChange.bind(this));
  }

  /**
   * Initialize the agents page
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.stateService.setLoading(true);
      await this.render();
      await this.initializeComponents();
      await this.loadConversationsData();
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing agents page:', error);
      this.stateService.setError(error);
    } finally {
      this.stateService.setLoading(false);
    }
  }

  /**
   * Handle state changes from StateService (WebSocket updates)
   * @param {Object} state - New state
   * @param {string} action - Action that caused the change
   */
  handleStateChange(state, action) {
    switch (action) {
      case 'update_conversations':
        // Don't replace loaded conversations, just update states
        console.log('🔄 WebSocket: Conversation list updated');
        break;
      case 'update_conversation_states':
        this.updateConversationStates(state.conversationStates);
        break;
      case 'set_loading':
        this.updateLoadingState(state.isLoading);
        break;
      case 'set_error':
        this.updateErrorState(state.error);
        break;
      case 'conversation_state_change':
        this.handleConversationStateChange(state);
        break;
      case 'data_refresh':
        // On real-time data refresh, update conversation states but keep pagination
        console.log('🔄 WebSocket: Real-time data refresh');
        this.updateConversationStatesOnly();
        break;
    }
  }
  
  /**
   * Update only conversation states without affecting pagination
   */
  async updateConversationStatesOnly() {
    try {
      const statesData = await this.dataService.getConversationStates();
      const activeStates = statesData?.activeStates || {};
      
      // Update states in already loaded conversations
      this.updateConversationStateElements(activeStates);
      
    } catch (error) {
      console.error('Error updating conversation states:', error);
    }
  }
  
  /**
   * Update conversation state elements in the DOM
   * @param {Object} activeStates - Active conversation states
   */
  updateConversationStateElements(activeStates) {
    const conversationItems = this.container.querySelectorAll('.sidebar-conversation-item');
    
    conversationItems.forEach(item => {
      const conversationId = item.dataset.id;
      const state = activeStates[conversationId] || 'unknown';
      const stateClass = this.getStateClass(state);
      const stateLabel = this.getStateLabel(state);
      
      // Update status dot
      const statusDot = item.querySelector('.status-dot');
      if (statusDot) {
        statusDot.className = `status-dot ${stateClass}`;
      }
      
      // Update status badge
      const statusBadge = item.querySelector('.sidebar-conversation-badge');
      if (statusBadge) {
        statusBadge.className = `sidebar-conversation-badge ${stateClass}`;
        statusBadge.textContent = stateLabel;
      }
    });
  }

  /**
   * Render the agents page structure
   */
  async render() {
    this.container.innerHTML = `
      <div class="agents-page">
        <!-- Page Header -->
        <div class="page-header conversations-header">
          <div class="header-content">
            <div class="header-left">
              <div class="status-header">
                <span class="session-timer-status-dot active"></span>
                <h1 class="page-title">
                  Agent Conversations
                </h1>
              </div>
              <div class="page-subtitle">
                Monitor and analyze Claude agent interactions in real-time
              </div>
            </div>
          </div>
        </div>

        <!-- Filters Section -->
        <div class="conversations-filters">
          <div class="filters-row">
            <div class="filter-group">
              <label class="filter-label">Status:</label>
              <select class="filter-select" id="status-filter">
                <option value="all">All Conversations</option>
                <option value="active">Active</option>
                <option value="idle">Idle</option>
                <option value="waiting">Waiting for Input</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            
            <div class="filter-group">
              <label class="filter-label">Time Range:</label>
              <select class="filter-select" id="time-filter">
                <option value="1h">Last Hour</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d" selected>Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </div>
            
            <div class="filter-group search-group">
              <label class="filter-label">Search:</label>
              <div class="search-input-container">
                <input type="text" class="filter-input search-input" id="search-filter" placeholder="Search conversations, projects, or messages...">
                <button class="search-clear" id="clear-search" title="Clear search">×</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div class="loading-state" id="conversations-loading" style="display: none;">
          <div class="loading-spinner"></div>
          <span class="loading-text">Loading conversations...</span>
        </div>

        <!-- Error State -->
        <div class="error-state" id="conversations-error" style="display: none;">
          <div class="error-content">
            <span class="error-icon">⚠️</span>
            <span class="error-message"></span>
            <button class="error-retry" id="retry-load">Retry</button>
          </div>
        </div>

        <!-- Two Column Layout -->
        <div class="conversations-layout">
          <!-- Left Sidebar: Conversations List -->
          <div class="conversations-sidebar">
            <div class="sidebar-header">
              <h3>Conversations</h3>
              <span class="conversation-count" id="sidebar-count">0</span>
            </div>
            <div class="conversations-list" id="conversations-list">
              <!-- Conversation items will be rendered here -->
            </div>
            
            <!-- Load More Indicator -->
            <div class="load-more-indicator" id="load-more-indicator" style="display: none;">
              <div class="loading-spinner"></div>
              <span class="loading-text">Loading more conversations...</span>
            </div>
          </div>
          
          <!-- Right Panel: Messages Detail -->
          <div class="messages-panel">
            <div class="messages-header" id="messages-header">
              <div class="selected-conversation-info">
                <h3 id="selected-conversation-title">Select a conversation</h3>
                <div class="selected-conversation-meta" id="selected-conversation-meta"></div>
              </div>
              <div class="messages-actions">
                <button class="action-btn-small" id="export-conversation" title="Export conversation">
                  <span class="btn-icon-small">📁</span>
                  Export
                </button>
              </div>
            </div>
            
            <div class="messages-content" id="messages-content">
              <div class="no-conversation-selected">
                <div class="no-selection-icon">💬</div>
                <h4>No conversation selected</h4>
                <p>Choose a conversation from the sidebar to view its messages</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div class="empty-state" id="empty-state" style="display: none;">
          <div class="empty-content">
            <span class="empty-icon">💬</span>
            <h3>No conversations found</h3>
            <p>No agent conversations match your current filters.</p>
            <button class="empty-action" id="clear-filters">Clear Filters</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.setupInfiniteScroll();
  }

  /**
   * Initialize child components
   */
  async initializeComponents() {
    // Initialize ConversationTable for detailed view if available
    const tableContainer = this.container.querySelector('#conversations-table');
    if (tableContainer && typeof ConversationTable !== 'undefined') {
      try {
        this.components.conversationTable = new ConversationTable(
          tableContainer,
          this.dataService,
          this.stateService
        );
        await this.components.conversationTable.initialize();
      } catch (error) {
        console.warn('ConversationTable initialization failed:', error);
        // Show fallback content
        tableContainer.innerHTML = `
          <div class="conversation-table-placeholder">
            <p>Detailed table view not available</p>
          </div>
        `;
      }
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Filter controls
    const statusFilter = this.container.querySelector('#status-filter');
    statusFilter.addEventListener('change', (e) => this.updateFilter('status', e.target.value));

    const timeFilter = this.container.querySelector('#time-filter');
    timeFilter.addEventListener('change', (e) => this.updateFilter('timeRange', e.target.value));

    const searchInput = this.container.querySelector('#search-filter');
    searchInput.addEventListener('input', (e) => this.updateFilter('search', e.target.value));

    const clearSearch = this.container.querySelector('#clear-search');
    clearSearch.addEventListener('click', () => this.clearSearch());

    // Error retry
    const retryBtn = this.container.querySelector('#retry-load');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.loadConversationsData());
    }

    // Clear filters
    const clearFiltersBtn = this.container.querySelector('#clear-filters');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => this.clearAllFilters());
    }
  }
  
  /**
   * Setup infinite scroll for conversations list
   */
  setupInfiniteScroll() {
    const conversationsContainer = this.container.querySelector('#conversations-list');
    if (!conversationsContainer) return;
    
    conversationsContainer.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = conversationsContainer;
      const threshold = 100; // Load more when 100px from bottom
      
      if (scrollHeight - scrollTop - clientHeight < threshold) {
        this.loadMoreConversations();
      }
    });
  }
  
  /**
   * Update loading indicator
   * @param {boolean} isLoading - Whether to show loading indicator
   */
  updateLoadingIndicator(isLoading) {
    const loadingIndicator = this.container.querySelector('#load-more-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = isLoading ? 'flex' : 'none';
    }
  }

  /**
   * Load initial conversations data
   */
  async loadConversationsData() {
    try {
      // Reset pagination state
      this.pagination = {
        currentPage: 0,
        limit: 10,
        hasMore: true,
        isLoading: false
      };
      this.loadedConversations = [];
      
      // Load first page and states
      await this.loadMoreConversations();
      
    } catch (error) {
      console.error('Error loading conversations data:', error);
      this.stateService.setError('Failed to load conversations data');
    }
  }
  
  /**
   * Load more conversations (pagination)
   */
  async loadMoreConversations() {
    if (this.pagination.isLoading || !this.pagination.hasMore) {
      return;
    }
    
    try {
      this.pagination.isLoading = true;
      this.updateLoadingIndicator(true);
      
      const [conversationsData, statesData] = await Promise.all([
        this.dataService.getConversationsPaginated(this.pagination.currentPage, this.pagination.limit),
        this.dataService.getConversationStates()
      ]);
      
      // Update pagination info
      this.pagination.hasMore = conversationsData.pagination.hasMore;
      this.pagination.currentPage = conversationsData.pagination.page + 1;
      
      // Add new conversations to loaded list
      this.loadedConversations.push(...conversationsData.conversations);
      
      // Log summary for monitoring
      console.log(`📊 Loaded page ${conversationsData.pagination.page} with ${conversationsData.conversations.length} conversations`);
      console.log(`🔄 Total conversations: ${this.loadedConversations.length}/${conversationsData.pagination.totalCount}`);
      
      // Update state and render
      this.stateService.updateConversations(this.loadedConversations);
      this.stateService.updateConversationStates(statesData);
      
      // Extract activeStates from the response structure
      const activeStates = statesData?.activeStates || {};
      this.renderConversationsList(this.loadedConversations, activeStates);
      
    } catch (error) {
      console.error('Error loading more conversations:', error);
      this.stateService.setError('Failed to load more conversations');
    } finally {
      this.pagination.isLoading = false;
      this.updateLoadingIndicator(false);
    }
  }

  /**
   * Render conversations list
   * @param {Array} conversations - Conversations data
   * @param {Object} states - Conversation states
   */
  renderConversationsList(conversations, states) {
    const listContainer = this.container.querySelector('#conversations-list');
    const filteredConversations = this.filterConversations(conversations, states);
    
    this.updateResultsCount(filteredConversations.length);
    this.updateClearFiltersButton();
    
    if (filteredConversations.length === 0) {
      this.showEmptyState();
      return;
    }
    
    this.hideEmptyState();
    
    listContainer.innerHTML = filteredConversations.map(conv => {
      const state = states[conv.id] || 'unknown';
      const stateClass = this.getStateClass(state);
      const lastActivity = this.formatRelativeTime(new Date(conv.lastModified));
      const messageCount = conv.messageCount || 0;
      
      
      return `
        <div class="sidebar-conversation-item" data-id="${conv.id}">
          <div class="sidebar-conversation-header">
            <div class="sidebar-conversation-title">
              <span class="status-dot ${stateClass}"></span>
              <h4 class="sidebar-conversation-name">${conv.title || `Conv ${conv.id.slice(-8)}`}</h4>
            </div>
            <span class="sidebar-conversation-badge ${stateClass}">${this.getStateLabel(state)}</span>
          </div>
          
          <div class="sidebar-conversation-meta">
            <span class="sidebar-meta-item">
              <span class="sidebar-meta-icon">📁</span>
              ${this.truncateText(conv.project || 'Unknown', 15)}
            </span>
            <span class="sidebar-meta-item">
              <span class="sidebar-meta-icon">💬</span>
              ${messageCount}
            </span>
            <span class="sidebar-meta-item">
              <span class="sidebar-meta-icon">🕒</span>
              ${lastActivity}
            </span>
          </div>
          
          <div class="sidebar-conversation-preview">
            <p class="sidebar-preview-text">${this.truncateText(conv.lastMessage || 'No messages', 60)}</p>
          </div>
        </div>
      `;
    }).join('');
    
    // Bind card actions
    this.bindListActions();
  }

  /**
   * Bind list action events
   */
  bindListActions() {
    // Export conversation button
    const exportBtn = this.container.querySelector('#export-conversation');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (this.selectedConversationId) {
          this.exportSingleConversation(this.selectedConversationId);
        }
      });
    }

    // Click on sidebar conversation item to select and view
    const conversationItems = this.container.querySelectorAll('.sidebar-conversation-item');
    conversationItems.forEach(item => {
      item.addEventListener('click', () => {
        const conversationId = item.dataset.id;
        this.selectConversation(conversationId);
      });
    });
  }

  /**
   * Select and display a conversation
   * @param {string} conversationId - Conversation ID
   */
  async selectConversation(conversationId) {
    // Update selected conversation state
    this.selectedConversationId = conversationId;
    
    // Update UI to show selection
    this.updateSelectedConversation();
    
    // Load and display conversation messages
    await this.loadConversationMessages(conversationId);
  }
  
  /**
   * Update selected conversation in sidebar
   */
  updateSelectedConversation() {
    // Remove previous selection
    const previousSelected = this.container.querySelector('.sidebar-conversation-item.selected');
    if (previousSelected) {
      previousSelected.classList.remove('selected');
    }
    
    // Add selection to current item
    const currentItem = this.container.querySelector(`[data-id="${this.selectedConversationId}"]`);
    if (currentItem) {
      currentItem.classList.add('selected');
    }
    
    // Update header with conversation info
    const conversations = this.stateService.getStateProperty('conversations') || [];
    const conversation = conversations.find(conv => conv.id === this.selectedConversationId);
    
    if (conversation) {
      const titleElement = this.container.querySelector('#selected-conversation-title');
      const metaElement = this.container.querySelector('#selected-conversation-meta');
      
      if (titleElement) {
        titleElement.textContent = conversation.title || `Conversation ${conversation.id.slice(-8)}`;
      }
      
      if (metaElement) {
        const messageCount = conversation.messageCount || 0;
        const lastActivity = this.formatRelativeTime(new Date(conversation.lastModified));
        metaElement.innerHTML = `
          <span class="meta-item">
            <span class="meta-icon">📁</span>
            ${conversation.project || 'Unknown Project'}
          </span>
          <span class="meta-item">
            <span class="meta-icon">💬</span>
            ${messageCount} message${messageCount !== 1 ? 's' : ''}
          </span>
          <span class="meta-item">
            <span class="meta-icon">🕒</span>
            ${lastActivity}
          </span>
        `;
      }
    }
  }
  
  /**
   * Load and display conversation messages (with caching)
   * @param {string} conversationId - Conversation ID
   */
  async loadConversationMessages(conversationId) {
    const messagesContent = this.container.querySelector('#messages-content');
    if (!messagesContent) return;
    
    try {
      // Check if messages are already cached
      if (this.loadedMessages.has(conversationId)) {
        console.log(`📋 Using cached messages for conversation ${conversationId.slice(-8)}`);
        this.renderCachedMessages(this.loadedMessages.get(conversationId));
        return;
      }
      
      // Show loading state
      messagesContent.innerHTML = `
        <div class="messages-loading">
          <div class="loading-spinner"></div>
          <span>Loading messages...</span>
        </div>
      `;
      
      console.log(`📥 Loading messages for conversation ${conversationId.slice(-8)}`);
      
      // Fetch actual messages from the server
      const messagesData = await this.dataService.cachedFetch(`/api/conversations/${conversationId}/messages`);
      
      if (messagesData && messagesData.messages && messagesData.messages.length > 0) {
        // Cache the messages
        this.loadedMessages.set(conversationId, messagesData.messages);
        
        this.renderCachedMessages(messagesData.messages);
        
        console.log(`✅ Loaded ${messagesData.messages.length} messages for conversation ${conversationId.slice(-8)}`);
      } else {
        messagesContent.innerHTML = `
          <div class="no-messages-found">
            <div class="no-messages-icon">💭</div>
            <h4>No messages found</h4>
            <p>This conversation has no messages or they could not be loaded.</p>
          </div>
        `;
      }
      
    } catch (error) {
      console.error('Error loading messages:', error);
      messagesContent.innerHTML = `
        <div class="messages-error">
          <span class="error-icon">⚠️</span>
          <span>Failed to load messages</span>
          <button class="retry-messages" data-conversation-id="${conversationId}">Retry</button>
        </div>
      `;
      
      // Bind retry button event
      const retryBtn = messagesContent.querySelector('.retry-messages');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.loadConversationMessages(conversationId);
        });
      }
    }
  }
  
  /**
   * Render cached messages
   * @param {Array} messages - Array of messages
   */
  renderCachedMessages(messages) {
    const messagesContent = this.container.querySelector('#messages-content');
    if (!messagesContent) return;
    
    messagesContent.innerHTML = `
      <div class="messages-list">
        ${messages.map(msg => this.renderMessage(msg)).join('')}
      </div>
    `;
    
    // Scroll to bottom to show latest messages
    setTimeout(() => {
      messagesContent.scrollTop = messagesContent.scrollHeight;
    }, 100);
  }
  
  
  /**
   * Render a single message
   * @param {Object} message - Message object
   * @returns {string} HTML string
   */
  renderMessage(message) {
    const timestamp = this.formatRelativeTime(new Date(message.timestamp));
    const isUser = message.role === 'user';
    
    return `
      <div class="message ${isUser ? 'message-user' : 'message-assistant'}">
        <div class="message-header">
          <div class="message-role">
            <span class="role-icon">${isUser ? '👤' : '🤖'}</span>
            <span class="role-name">${isUser ? 'User' : 'Claude'}</span>
          </div>
          <div class="message-meta">
            <span class="message-timestamp">${timestamp}</span>
            ${message.usage ? `
              <span class="message-tokens">
                ${message.usage.input_tokens > 0 ? `📥 ${message.usage.input_tokens}` : ''}
                ${message.usage.output_tokens > 0 ? `📤 ${message.usage.output_tokens}` : ''}
              </span>
            ` : ''}
            ${message.model ? `
              <span class="message-model">
                🤖 ${message.model}
              </span>
            ` : ''}
          </div>
        </div>
        <div class="message-content">
          <div class="message-text">${this.formatMessageContent(message.content)}</div>
        </div>
      </div>
    `;
  }
  
  /**
   * Format message content (basic markdown-like formatting)
   * @param {string|Array} content - Message content
   * @returns {string} Formatted HTML
   */
  formatMessageContent(content) {
    let textContent = '';
    
    // Handle different content formats
    if (Array.isArray(content)) {
      // Assistant messages with content blocks
      textContent = content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
    } else if (typeof content === 'string') {
      // User messages with plain text
      textContent = content;
    } else {
      textContent = String(content || '');
    }
    
    // Basic code block formatting
    return textContent
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      .replace(/\n/g, '<br>');
  }

  /**
   * Format relative time
   * @param {Date} date - Date to format
   * @returns {string} Relative time string
   */
  formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  /**
   * Update clear filters button visibility
   */
  updateClearFiltersButton() {
    const clearBtn = this.container.querySelector('#clear-filters');
    const hasActiveFilters = this.filters.status !== 'all' || 
                           this.filters.timeRange !== '7d' || 
                           this.filters.search !== '';
    clearBtn.style.display = hasActiveFilters ? 'inline-block' : 'none';
  }

  /**
   * Handle list action
   * @param {string} action - Action type
   * @param {string} conversationId - Conversation ID
   */
  handleListAction(action, conversationId) {
    switch (action) {
      case 'view':
        this.viewConversation(conversationId);
        break;
    }
  }

  /**
   * Filter conversations based on current filters
   * @param {Array} conversations - All conversations
   * @param {Object} states - Conversation states
   * @returns {Array} Filtered conversations
   */
  filterConversations(conversations, states) {
    let filtered = conversations;
    
    // Filter by status
    if (this.filters.status !== 'all') {
      filtered = filtered.filter(conv => {
        const state = states[conv.id] || 'unknown';
        return state === this.filters.status;
      });
    }
    
    // Filter by time range
    const timeRange = this.getTimeRangeMs(this.filters.timeRange);
    if (timeRange > 0) {
      const cutoff = Date.now() - timeRange;
      filtered = filtered.filter(conv => {
        const lastModified = new Date(conv.lastModified).getTime();
        return lastModified >= cutoff;
      });
    }
    
    // Filter by search
    if (this.filters.search) {
      const searchLower = this.filters.search.toLowerCase();
      filtered = filtered.filter(conv => {
        return (conv.title || '').toLowerCase().includes(searchLower) ||
               (conv.project || '').toLowerCase().includes(searchLower) ||
               (conv.lastMessage || '').toLowerCase().includes(searchLower);
      });
    }
    
    return filtered;
  }

  /**
   * Get time range in milliseconds
   * @param {string} range - Time range string
   * @returns {number} Milliseconds
   */
  getTimeRangeMs(range) {
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    return ranges[range] || 0;
  }

  /**
   * Get state CSS class
   * @param {string} state - Conversation state
   * @returns {string} CSS class
   */
  getStateClass(state) {
    const stateClasses = {
      'active': 'status-active',
      'idle': 'status-idle',
      'waiting': 'status-waiting',
      'completed': 'status-completed',
      'unknown': 'status-unknown'
    };
    return stateClasses[state] || 'status-unknown';
  }

  /**
   * Get state label
   * @param {string} state - Conversation state
   * @returns {string} Human readable label
   */
  getStateLabel(state) {
    const stateLabels = {
      'active': 'Active',
      'idle': 'Idle',
      'waiting': 'Waiting',
      'completed': 'Completed',
      'unknown': 'Unknown'
    };
    return stateLabels[state] || 'Unknown';
  }

  /**
   * Truncate text to specified length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Update filter
   * @param {string} filterName - Filter name
   * @param {string} value - Filter value
   */
  updateFilter(filterName, value) {
    this.filters[filterName] = value;
    // When filters change, restart from beginning
    this.refreshFromBeginning();
  }

  /**
   * Clear search
   */
  clearSearch() {
    const searchInput = this.container.querySelector('#search-filter');
    searchInput.value = '';
    this.updateFilter('search', '');
  }

  /**
   * Clear all filters
   */
  clearAllFilters() {
    this.filters = {
      status: 'all',
      timeRange: '7d',
      search: ''
    };
    
    // Reset UI
    this.container.querySelector('#status-filter').value = 'all';
    this.container.querySelector('#time-filter').value = '7d';
    this.container.querySelector('#search-filter').value = '';
    
    // Restart from beginning when clearing filters
    this.refreshFromBeginning();
  }

  /**
   * Refresh conversations display
   */
  refreshConversationsDisplay() {
    const conversations = this.stateService.getStateProperty('conversations') || [];
    const statesData = this.stateService.getStateProperty('conversationStates') || {};
    // Extract activeStates from the stored state data
    const activeStates = statesData?.activeStates || {};
    this.renderConversationsList(conversations, activeStates);
  }
  
  /**
   * Refresh from beginning - resets pagination
   */
  async refreshFromBeginning() {
    // Clear cache
    this.loadedConversations = [];
    this.loadedMessages.clear();
    
    // Reset pagination
    this.pagination = {
      currentPage: 0,
      limit: 10,
      hasMore: true,
      isLoading: false
    };
    
    // Clear list and reload
    const listContainer = this.container.querySelector('#conversations-list');
    if (listContainer) {
      listContainer.innerHTML = '';
    }
    
    await this.loadConversationsData();
  }

  /**
   * Refresh conversations data
   */
  async refreshConversations() {
    const refreshBtn = this.container.querySelector('#refresh-conversations');
    refreshBtn.disabled = true;
    refreshBtn.querySelector('.btn-icon').style.animation = 'spin 1s linear infinite';

    try {
      this.dataService.clearCache();
      await this.loadConversationsData();
    } catch (error) {
      console.error('Error refreshing conversations:', error);
      this.stateService.setError('Failed to refresh conversations');
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.querySelector('.btn-icon').style.animation = '';
    }
  }

  /**
   * Update results count
   * @param {number} count - Number of results
   */
  updateResultsCount(count) {
    // Update main results count
    const resultsCount = this.container.querySelector('#results-count');
    if (resultsCount) {
      resultsCount.textContent = `${count} conversation${count !== 1 ? 's' : ''} found`;
    }
    
    // Update sidebar count
    const sidebarCount = this.container.querySelector('#sidebar-count');
    if (sidebarCount) {
      sidebarCount.textContent = count;
    }
  }

  /**
   * Show empty state
   */
  showEmptyState() {
    this.container.querySelector('#conversations-list').style.display = 'none';
    this.container.querySelector('#empty-state').style.display = 'flex';
  }

  /**
   * Hide empty state
   */
  hideEmptyState() {
    this.container.querySelector('#conversations-list').style.display = 'block';
    this.container.querySelector('#empty-state').style.display = 'none';
  }

  /**
   * Toggle between grid and table view
   * @param {string} view - View type ('grid' or 'table')
   */
  toggleView(view) {
    const toggleBtns = this.container.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    const gridSection = this.container.querySelector('#conversations-grid').parentNode;
    const tableSection = this.container.querySelector('.conversations-table-section');

    if (view === 'table') {
      gridSection.style.display = 'none';
      tableSection.style.display = 'block';
    } else {
      gridSection.style.display = 'block';
      tableSection.style.display = 'none';
    }
  }

  /**
   * View conversation details
   * @param {string} conversationId - Conversation ID
   */
  viewConversation(conversationId) {
    // This would open a detailed conversation view
    console.log('Viewing conversation:', conversationId);
    // Implementation would show conversation details modal or navigate to detail page
  }

  /**
   * Export single conversation
   * @param {string} conversationId - Conversation ID
   */
  exportSingleConversation(conversationId) {
    const conversations = this.stateService.getStateProperty('conversations') || [];
    const conversation = conversations.find(conv => conv.id === conversationId);
    
    if (conversation) {
      const dataStr = JSON.stringify(conversation, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `conversation-${conversationId}-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Export all conversations
   */
  exportConversations() {
    const conversations = this.stateService.getStateProperty('conversations') || [];
    const states = this.stateService.getStateProperty('conversationStates') || {};
    const filteredConversations = this.filterConversations(conversations, states);
    
    const dataStr = JSON.stringify({
      conversations: filteredConversations,
      states: states,
      exportDate: new Date().toISOString(),
      filters: this.filters
    }, null, 2);
    
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `claude-conversations-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Update conversations display
   * @param {Array} conversations - Conversations data
   */
  updateConversationsDisplay(conversations) {
    const statesData = this.stateService.getStateProperty('conversationStates') || {};
    const activeStates = statesData?.activeStates || {};
    this.renderConversationsList(conversations, activeStates);
  }

  /**
   * Update conversation states
   * @param {Object} statesData - Conversation states data
   */
  updateConversationStates(statesData) {
    const conversations = this.stateService.getStateProperty('conversations') || [];
    const activeStates = statesData?.activeStates || {};
    this.renderConversationsList(conversations, activeStates);
  }

  /**
   * Handle conversation state change
   * @param {Object} state - New state
   */
  handleConversationStateChange(state) {
    this.refreshConversationsDisplay();
  }

  /**
   * Update loading state
   * @param {boolean} isLoading - Loading state
   */
  updateLoadingState(isLoading) {
    const loadingState = this.container.querySelector('#conversations-loading');
    if (loadingState) {
      loadingState.style.display = isLoading ? 'flex' : 'none';
    }
  }

  /**
   * Update error state
   * @param {Error|string} error - Error object or message
   */
  updateErrorState(error) {
    const errorState = this.container.querySelector('#conversations-error');
    const errorMessage = this.container.querySelector('.error-message');
    
    if (errorState && errorMessage) {
      if (error) {
        errorMessage.textContent = error.message || error;
        errorState.style.display = 'flex';
      } else {
        errorState.style.display = 'none';
      }
    }
  }

  /**
   * Destroy agents page
   */
  destroy() {
    // Cleanup components
    Object.values(this.components).forEach(component => {
      if (component.destroy) {
        component.destroy();
      }
    });
    
    // Unsubscribe from state changes
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    this.isInitialized = false;
  }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AgentsPage;
}