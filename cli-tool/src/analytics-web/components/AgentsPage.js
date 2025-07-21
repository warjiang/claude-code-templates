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
    
    // Pagination state for conversations
    this.pagination = {
      currentPage: 0,
      limit: 10,
      hasMore: true,
      isLoading: false
    };
    
    // Pagination state for messages
    this.messagesPagination = {
      currentPage: 0,
      limit: 10,
      hasMore: true,
      isLoading: false,
      conversationId: null
    };
    
    // Loaded conversations cache
    this.loadedConversations = [];
    this.loadedMessages = new Map(); // Cache messages by conversation ID (now stores paginated data)
    
    // Initialize tool display component
    this.toolDisplay = new ToolDisplay();
    
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
        console.log(`🔄 WebSocket update_conversation_states:`, {
          conversationStates: state.conversationStates,
          type: typeof state.conversationStates,
          keys: state.conversationStates ? Object.keys(state.conversationStates) : 'none'
        });
        
        // Handle both direct states object and nested structure
        const activeStates = state.conversationStates?.activeStates || state.conversationStates || {};
        
        this.updateConversationStates(activeStates);
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
      case 'new_message':
        // Handle new message in real-time
        console.log('📨 WebSocket: New message received', state);
        this.handleNewMessage(state.conversationId, state.message, state.metadata);
        break;
    }
  }
  
  /**
   * Handle new message received via WebSocket
   * @param {string} conversationId - Conversation ID that received new message
   * @param {Object} message - New message object
   * @param {Object} metadata - Additional metadata
   */
  handleNewMessage(conversationId, message, metadata) {
    console.log(`📨 Handling new message for conversation ${conversationId}:`, { message, metadata });
    
    // Only process if this conversation is currently selected
    if (this.selectedConversationId !== conversationId) {
      console.log(`📨 Message for ${conversationId} but ${this.selectedConversationId} is selected - ignoring`);
      return;
    }
    
    // Get current messages for this conversation
    const existingMessages = this.loadedMessages.get(conversationId) || [];
    
    // Check if we already have this message (avoid duplicates)
    const messageExists = existingMessages.some(msg => 
      msg.id === message.id || 
      (msg.timestamp === message.timestamp && msg.role === message.role)
    );
    
    if (!messageExists) {
      // Add new message to the end
      const updatedMessages = [...existingMessages, message];
      this.loadedMessages.set(conversationId, updatedMessages);
      
      // Re-render messages with new message
      this.renderCachedMessages(updatedMessages, false);
      
      // Auto-scroll to new message
      this.scrollToBottom();
      
      // Show notification
      this.showNewMessageNotification(message, metadata);
      
      console.log(`✅ Added new message to conversation ${conversationId}`);
    } else {
      console.log(`📨 Message already exists in conversation ${conversationId} - skipping`);
    }
  }

  /**
   * Update only conversation states without affecting pagination
   */
  async updateConversationStatesOnly() {
    try {
      const statesData = await this.dataService.getConversationStates();
      const activeStates = statesData?.activeStates || {};
      
      // Update StateService with fresh states
      this.stateService.updateConversationStates(activeStates);
      
      // Update states in already loaded conversations
      this.updateConversationStateElements(activeStates);
      
      // Update banner if we have a selected conversation
      if (this.selectedConversationId && activeStates[this.selectedConversationId]) {
        console.log(`🔄 Updating banner for ${this.selectedConversationId}: ${activeStates[this.selectedConversationId]}`);
        this.updateStateBanner(this.selectedConversationId, activeStates[this.selectedConversationId]);
      }
      
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
                  Claude Code web UI
                </h1>
              </div>
              <div class="page-subtitle">
                Monitor and analyze Claude Code agent interactions in real-time
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
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
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
              <h3>Chats</h3>
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
            
            <!-- Conversation State Banner -->
            <div class="conversation-state-banner" id="conversation-state-banner" style="display: none;">
              <div class="state-indicator">
                <span class="state-dot" id="state-dot"></span>
                <span class="state-text" id="state-text">Ready</span>
              </div>
              <div class="state-timestamp" id="state-timestamp"></div>
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
   * Load initial conversations data using paginated API
   */
  async loadConversationsData() {
    try {
      console.log('🔄 Starting paginated conversation loading...');
      
      // Reset pagination state
      this.pagination = {
        currentPage: 0,
        limit: 10,
        hasMore: true,
        isLoading: false
      };
      this.loadedConversations = [];
      this.loadedMessages.clear(); // Clear message cache too
      
      // Clear the list container
      const listContainer = this.container.querySelector('#conversations-list');
      if (listContainer) {
        listContainer.innerHTML = '';
      }
      
      // Hide empty state initially
      this.hideEmptyState();
      
      // Load first page and states
      await this.loadMoreConversations();
      
      console.log(`✅ Initial load complete. Loaded ${this.loadedConversations.length} conversations`);
      
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
      
      console.log(`🔍 loadMoreConversations - States data:`, {
        statesData,
        activeStates: statesData?.activeStates,
        statesCount: statesData?.activeStates ? Object.keys(statesData.activeStates).length : 0
      });
      
      // Update pagination info
      this.pagination.hasMore = conversationsData.pagination.hasMore;
      this.pagination.currentPage = conversationsData.pagination.page + 1;
      
      // Get only NEW conversations for this page
      const newConversations = conversationsData.conversations;
      
      // Add new conversations to loaded list
      this.loadedConversations.push(...newConversations);
      
      // Log summary for monitoring
      console.log(`📊 Loaded page ${conversationsData.pagination.page} with ${newConversations.length} conversations`);
      console.log(`🔄 Total conversations: ${this.loadedConversations.length}/${conversationsData.pagination.totalCount}`);
      
      // Extract activeStates from the response structure
      const activeStates = statesData?.activeStates || {};
      
      // Update state with correct format
      this.stateService.updateConversations(this.loadedConversations);
      this.stateService.updateConversationStates(activeStates);
      
      console.log(`🔍 Updated StateService with:`, {
        conversationsCount: this.loadedConversations.length,
        activeStatesCount: Object.keys(activeStates).length,
        firstFewStates: Object.keys(activeStates).slice(0, 3)
      });
      
      // For initial load (page 0), replace content. For subsequent loads, append
      const isInitialLoad = conversationsData.pagination.page === 0;
      this.renderConversationsList(
        isInitialLoad ? this.loadedConversations : newConversations, 
        activeStates, 
        !isInitialLoad
      );
      
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
   * @param {boolean} append - Whether to append or replace content
   */
  renderConversationsList(conversations, states, append = false) {
    const listContainer = this.container.querySelector('#conversations-list');
    const filteredConversations = this.filterConversations(conversations, states);
    
    this.updateResultsCount(filteredConversations.length);
    this.updateClearFiltersButton();
    
    if (filteredConversations.length === 0 && !append) {
      this.showEmptyState();
      return;
    }
    
    this.hideEmptyState();
    
    const conversationHTML = filteredConversations.map(conv => {
      const state = states[conv.id] || 'unknown';
      const stateClass = this.getStateClass(state);
      
      return `
        <div class="sidebar-conversation-item" data-id="${conv.id}">
          <div class="sidebar-conversation-header">
            <div class="sidebar-conversation-title">
              <span class="status-dot ${stateClass}"></span>
              <h4 class="sidebar-conversation-name">${conv.title || `Chat ${conv.id.slice(-8)}`}</h4>
            </div>
            <span class="sidebar-conversation-badge ${stateClass}">${this.getStateLabel(state)}</span>
          </div>
          
          <div class="sidebar-conversation-meta">
            <span class="sidebar-meta-item">
              <span class="sidebar-meta-icon">📁</span>
              ${this.truncateText(conv.project || 'Unknown', 12)}
            </span>
          </div>
          
          <div class="sidebar-conversation-preview">
            <p class="sidebar-preview-text">${this.getSimpleConversationPreview(conv)}</p>
          </div>
        </div>
      `;
    }).join('');
    
    if (append) {
      listContainer.insertAdjacentHTML('beforeend', conversationHTML);
    } else {
      listContainer.innerHTML = conversationHTML;
    }
    
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
    
    // Show and update the state banner
    this.showStateBanner(this.selectedConversationId);
  }
  
  /**
   * Load and display conversation messages (with caching)
   * @param {string} conversationId - Conversation ID
   */
  async loadConversationMessages(conversationId) {
    // Reset pagination for new conversation
    this.messagesPagination = {
      currentPage: 0,
      limit: 10,
      hasMore: true,
      isLoading: false,
      conversationId: conversationId
    };
    
    // Clear cached messages for this conversation
    this.loadedMessages.delete(conversationId);
    
    // Load first page of messages
    await this.loadMoreMessages(conversationId, true);
  }

  /**
   * Show and update conversation state banner
   * @param {string} conversationId - Conversation ID
   */
  showStateBanner(conversationId) {
    const banner = this.container.querySelector('#conversation-state-banner');
    if (!banner) return;
    
    // Show the banner
    banner.style.display = 'flex';
    
    // Get current state from WebSocket or cache
    const conversationStates = this.stateService.getStateProperty('conversationStates') || {};
    const currentState = conversationStates[conversationId] || 'unknown';
    
    console.log(`🔍 Debug banner state for ${conversationId}:`, {
      conversationId,
      currentState,
      availableStates: Object.keys(conversationStates),
      stateValue: conversationStates[conversationId],
      totalStates: Object.keys(conversationStates).length,
      allStates: conversationStates
    });
    
    // If we don't have the state yet, try to fetch it after a short delay
    if (currentState === 'unknown') {
      setTimeout(() => {
        this.fetchConversationState(conversationId);
      }, 100);
    }
    
    // Update banner with current state
    this.updateStateBanner(conversationId, currentState);
  }

  /**
   * Update conversation state banner
   * @param {string} conversationId - Conversation ID  
   * @param {string} state - Current conversation state
   */
  updateStateBanner(conversationId, state) {
    const banner = this.container.querySelector('#conversation-state-banner');
    const stateDot = this.container.querySelector('#state-dot');
    const stateText = this.container.querySelector('#state-text');
    const stateTimestamp = this.container.querySelector('#state-timestamp');
    
    console.log(`🎯 updateStateBanner called:`, {
      conversationId,
      state,
      bannerExists: !!banner,
      elementsExist: { stateDot: !!stateDot, stateText: !!stateText, stateTimestamp: !!stateTimestamp }
    });
    
    if (!banner || !stateDot || !stateText || !stateTimestamp) {
      console.warn('❌ Banner elements not found');
      return;
    }
    
    // Map states to user-friendly messages
    const stateMessages = {
      'Claude Code working...': {
        text: 'Claude Code is working...',
        class: 'status-working'
      },
      'Awaiting user input...': {
        text: 'Waiting for your response',
        class: 'status-waiting'
      },
      'User typing...': {
        text: 'User typing...',
        class: 'status-typing'
      },
      'Awaiting response...': {
        text: 'Awaiting Claude response',
        class: 'status-waiting'
      },
      'Recently active': {
        text: 'Recently active',
        class: 'status-active'
      },
      'Idle': {
        text: 'Idle',
        class: 'status-idle'
      },
      'Inactive': {
        text: 'Inactive',
        class: 'status-idle'
      },
      'Old': {
        text: 'No recent activity',
        class: 'status-idle'
      },
      'unknown': {
        text: 'Loading conversation state...',
        class: 'status-idle'
      }
    };
    
    const stateInfo = stateMessages[state] || stateMessages['unknown'];
    
    // Update dot class
    stateDot.className = `state-dot ${stateInfo.class}`;
    
    // Update text
    stateText.textContent = stateInfo.text;
    
    // Update timestamp
    const now = new Date();
    stateTimestamp.textContent = `Updated ${now.toLocaleTimeString()}`;
    
    console.log(`🔄 State banner updated: ${conversationId} -> ${state}`);
  }

  /**
   * Fetch conversation state from API
   * @param {string} conversationId - Conversation ID
   */
  async fetchConversationState(conversationId) {
    try {
      console.log(`🔄 Fetching state for conversation: ${conversationId}`);
      const stateData = await this.dataService.getConversationStates();
      
      if (stateData && stateData.activeStates && stateData.activeStates[conversationId]) {
        const state = stateData.activeStates[conversationId];
        console.log(`✅ Found state for ${conversationId}: ${state}`);
        
        // Update the StateService with the new data
        this.stateService.updateConversationStates(stateData.activeStates);
        
        // Update the banner with the real state
        this.updateStateBanner(conversationId, state);
      } else {
        console.log(`⚠️ No state found for conversation ${conversationId}`);
        // Keep showing unknown for now
      }
    } catch (error) {
      console.error('Error fetching conversation state:', error);
    }
  }

  /**
   * Hide conversation state banner
   */
  hideStateBanner() {
    const banner = this.container.querySelector('#conversation-state-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  /**
   * Auto-scroll to bottom of messages
   */
  scrollToBottom() {
    const messagesContent = this.container.querySelector('#messages-content');
    if (messagesContent) {
      messagesContent.scrollTop = messagesContent.scrollHeight;
    }
  }

  /**
   * Show notification for new message
   * @param {Object} message - New message object
   * @param {Object} metadata - Message metadata
   */
  showNewMessageNotification(message, metadata) {
    // Update banner if it's showing to reflect new activity
    if (this.selectedConversationId) {
      const banner = this.container.querySelector('#conversation-state-banner');
      if (banner && banner.style.display !== 'none') {
        // Temporarily highlight the banner to show activity
        banner.style.backgroundColor = 'rgba(213, 116, 85, 0.1)';
        setTimeout(() => {
          banner.style.backgroundColor = '';
        }, 1000);
      }
    }
    
    // Could add visual indicator for new message (pulse, notification badge, etc.)
    console.log(`🔔 New message notification: ${message.role} message in conversation`);
  }

  /**
   * Load more messages (for infinite scroll)
   * @param {string} conversationId - Conversation ID
   * @param {boolean} isInitialLoad - Whether this is the initial load
   */
  async loadMoreMessages(conversationId, isInitialLoad = false) {
    const messagesContent = this.container.querySelector('#messages-content');
    if (!messagesContent) return;
    
    // Prevent concurrent loading
    if (this.messagesPagination.isLoading || !this.messagesPagination.hasMore) {
      return;
    }
    
    // Ensure we're loading for the correct conversation
    if (this.messagesPagination.conversationId !== conversationId) {
      return;
    }
    
    try {
      this.messagesPagination.isLoading = true;
      
      if (isInitialLoad) {
        // Show loading state for initial load
        messagesContent.innerHTML = `
          <div class="messages-loading">
            <div class="loading-spinner"></div>
            <span>Loading messages...</span>
          </div>
        `;
      } else {
        // Show loading indicator at top for infinite scroll
        this.showMessagesLoadingIndicator(true);
      }
      
      // Fetch paginated messages from the server
      const messagesData = await this.dataService.cachedFetch(
        `/api/conversations/${conversationId}/messages?page=${this.messagesPagination.currentPage}&limit=${this.messagesPagination.limit}`
      );
      
      if (messagesData && messagesData.messages) {
        // Update pagination state - handle both paginated and non-paginated responses
        if (messagesData.pagination) {
          // Paginated response
          this.messagesPagination.hasMore = messagesData.pagination.hasMore;
          this.messagesPagination.currentPage = messagesData.pagination.page + 1;
        } else {
          // Non-paginated response (fallback) - treat as complete data
          this.messagesPagination.hasMore = false;
          this.messagesPagination.currentPage = 1;
        }
        
        // Get existing messages or initialize
        let existingMessages = this.loadedMessages.get(conversationId) || [];
        
        if (isInitialLoad) {
          // For initial load, replace all messages
          existingMessages = messagesData.messages;
        } else {
          // For infinite scroll, prepend older messages (they come in chronological order)
          existingMessages = [...messagesData.messages, ...existingMessages];
        }
        
        // Cache the combined messages
        this.loadedMessages.set(conversationId, existingMessages);
        
        // Render messages
        this.renderCachedMessages(existingMessages, !isInitialLoad);
        
        // Setup scroll listener for infinite scroll (only on initial load)
        if (isInitialLoad) {
          this.setupMessagesScrollListener(conversationId);
        }
        
        
      } else if (isInitialLoad) {
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
      
      if (isInitialLoad) {
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
    } finally {
      this.messagesPagination.isLoading = false;
      if (!isInitialLoad) {
        this.showMessagesLoadingIndicator(false);
      }
    }
  }
  
  /**
   * Render cached messages
   * @param {Array} messages - Array of messages
   * @param {boolean} prepend - Whether to prepend messages (for infinite scroll)
   */
  renderCachedMessages(messages, prepend = false) {
    const messagesContent = this.container.querySelector('#messages-content');
    if (!messagesContent) return;
    
    const messageHTML = `
      <div class="messages-loading-indicator" style="display: none;">
        <div class="loading-spinner small"></div>
        <span>Loading older messages...</span>
      </div>
      <div class="messages-list">
        ${messages.map(msg => this.renderMessage(msg)).join('')}
      </div>
    `;
    
    if (prepend) {
      // For infinite scroll, we need to maintain scroll position
      const oldScrollHeight = messagesContent.scrollHeight;
      
      // Update content
      messagesContent.innerHTML = messageHTML;
      
      // Restore scroll position relative to the bottom
      const newScrollHeight = messagesContent.scrollHeight;
      const scrollDifference = newScrollHeight - oldScrollHeight;
      messagesContent.scrollTop += scrollDifference;
    } else {
      // Initial load - just replace content and scroll to bottom
      messagesContent.innerHTML = messageHTML;
      
      // Scroll to bottom for new conversation load
      setTimeout(() => {
        messagesContent.scrollTop = messagesContent.scrollHeight;
      }, 100);
    }
    
    // Bind tool display events
    this.toolDisplay.bindEvents(messagesContent);
  }

  /**
   * Show/hide messages loading indicator
   * @param {boolean} show - Whether to show the indicator
   */
  showMessagesLoadingIndicator(show) {
    const messagesContent = this.container.querySelector('#messages-content');
    if (!messagesContent) return;
    
    const indicator = messagesContent.querySelector('.messages-loading-indicator');
    if (indicator) {
      indicator.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * Setup scroll listener for infinite scroll in messages
   * @param {string} conversationId - Current conversation ID
   */
  setupMessagesScrollListener(conversationId) {
    const messagesContent = this.container.querySelector('#messages-content');
    if (!messagesContent) return;
    
    // Remove existing listener if any
    if (this.messagesScrollListener) {
      messagesContent.removeEventListener('scroll', this.messagesScrollListener);
    }
    
    // Create new listener
    this.messagesScrollListener = () => {
      // Check if we've scrolled near the top (for loading older messages)
      const scrollTop = messagesContent.scrollTop;
      const threshold = 100; // pixels from top
      
      if (scrollTop <= threshold && this.messagesPagination.hasMore && !this.messagesPagination.isLoading) {
        this.loadMoreMessages(conversationId, false);
      }
    };
    
    // Add listener
    messagesContent.addEventListener('scroll', this.messagesScrollListener);
  }
  
  /**
   * Render a single message with terminal-style formatting
   * @param {Object} message - Message object
   * @returns {string} HTML string
   */
  renderMessage(message) {
    const timestamp = this.formatRelativeTime(new Date(message.timestamp));
    const fullTimestamp = new Date(message.timestamp).toLocaleString();
    const isUser = message.role === 'user';
    
    // Detect message content types
    const messageType = this.getMessageType(message);
    
    // Detect if message contains tools
    const hasTools = Array.isArray(message.content) && 
                    message.content.some(block => block.type === 'tool_use');
    const toolCount = hasTools ? 
                     message.content.filter(block => block.type === 'tool_use').length : 0;
    
    // Terminal-style prompt
    const prompt = isUser ? '>' : '#';
    const roleLabel = isUser ? 'user' : 'claude';
    
    // Get message ID (short version for display)
    const messageId = message.id ? message.id.slice(-8) : 'unknown';
    
    return `
      <div class="terminal-message ${isUser ? 'user' : 'assistant'}" data-message-id="${message.id || ''}">
        <div class="message-container">
          <div class="message-prompt">
            <span class="prompt-char">${prompt}</span>
            <div class="message-metadata">
              <span class="timestamp" title="${fullTimestamp}">${timestamp}</span>
              <span class="role-label">${roleLabel}</span>
              <span class="message-id" title="Message ID: ${message.id || 'unknown'}">[${messageId}]</span>
              ${message.usage ? `
                <span class="tokens">
                  ${message.usage.input_tokens > 0 ? `i:${message.usage.input_tokens}` : ''}
                  ${message.usage.output_tokens > 0 ? `o:${message.usage.output_tokens}` : ''}
                  ${message.usage.cache_read_input_tokens > 0 ? `c:${message.usage.cache_read_input_tokens}` : ''}
                </span>
              ` : ''}
              ${hasTools ? `<span class="tool-count">[${toolCount}t]</span>` : ''}
              ${message.model ? `<span class="model">[${message.model.replace('claude-', '').replace('-20250514', '')}]</span>` : ''}
              <div class="message-type-indicator ${messageType.class}" title="${messageType.label}"></div>
            </div>
          </div>
          <div class="message-body">
            ${this.formatMessageContent(message.content, message)}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get message type based on content
   * @param {Object} message - Message object
   * @returns {Object} Message type info
   */
  getMessageType(message) {
    const isUser = message.role === 'user';
    
    if (isUser) {
      // User message types
      if (typeof message.content === 'string') {
        if (message.content.includes('Tool Result')) {
          return { label: 'TOOL_RESULT', class: 'type-tool-result' };
        }
        return { label: 'INPUT', class: 'type-user-input' };
      }
      return { label: 'INPUT', class: 'type-user-input' };
    } else {
      // Claude message types
      if (Array.isArray(message.content)) {
        const hasText = message.content.some(block => block.type === 'text');
        const hasTools = message.content.some(block => block.type === 'tool_use');
        
        if (hasTools && hasText) {
          return { label: 'RESPONSE+TOOLS', class: 'type-response-tools' };
        } else if (hasTools) {
          return { label: 'TOOLS', class: 'type-tools-only' };
        } else if (hasText) {
          return { label: 'RESPONSE', class: 'type-response' };
        }
      }
      return { label: 'RESPONSE', class: 'type-response' };
    }
  }

  /**
   * Get icon for message type
   * @param {Object} messageType - Message type object
   * @returns {string} Unicode icon
   */
  getMessageTypeIcon(messageType) {
    const icons = {
      'INPUT': '◆',
      'TOOL_RESULT': '◇',
      'RESPONSE': '■',
      'TOOLS': '▲',
      'RESPONSE+TOOLS': '●'
    };
    return icons[messageType.label] || '□';
  }
  
  /**
   * Format message content with support for text and tool calls
   * @param {string|Array} content - Message content
   * @returns {string} Formatted HTML
   */
  formatMessageContent(content, message = null) {
    let result = '';
    
    // Handle different content formats
    if (Array.isArray(content)) {
      // Assistant messages with content blocks
      content.forEach(block => {
        if (block.type === 'text') {
          result += this.formatTextContent(block.text);
        } else if (block.type === 'tool_use') {
          result += this.toolDisplay.renderToolUse(block);
        } else if (block.type === 'tool_result') {
          result += this.toolDisplay.renderToolResult(block);
        }
      });
    } else if (typeof content === 'string' && content.trim() !== '') {
      // User messages with plain text - check for special patterns
      if (content.includes('Tool Result') && content.length > 1000) {
        // This is likely a large tool result that should be handled specially
        result += this.formatLargeToolResult(content);
      } else {
        // Check if this is a confirmation response "[ok]" or similar
        const enhancedContent = this.enhanceConfirmationMessage(content, message);
        result = this.formatTextContent(enhancedContent);
      }
    } else if (content && typeof content === 'object') {
      // Handle edge cases where content might be an object
      result = this.formatTextContent(JSON.stringify(content, null, 2));
    }
    
    return result || '<em class="empty-content">No displayable content available</em>';
  }
  
  /**
   * Format regular text content
   * @param {string} text - Text content
   * @returns {string} Formatted HTML
   */
  formatTextContent(text) {
    if (!text || text.trim() === '') return '';
    
    // Escape HTML to prevent XSS
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };
    
    const escapedText = escapeHtml(text);
    
    // Basic markdown-like formatting (applied after escaping)
    return escapedText
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      .replace(/\n/g, '<br>');
  }

  /**
   * Format large tool result content safely
   * @param {string} content - Large tool result content
   * @returns {string} Safe formatted content
   */
  formatLargeToolResult(content) {
    // Extract tool result ID if present
    const toolIdMatch = content.match(/Tool Result\s+([A-Za-z0-9]+)/);
    const toolId = toolIdMatch ? toolIdMatch[1] : 'unknown';
    
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };
    
    const preview = content.length > 80 
      ? escapeHtml(content.substring(0, 80)) + '...' 
      : escapeHtml(content);
    
    return `
      <div class="terminal-tool tool-result large">
        <span class="tool-prompt">></span>
        <span class="tool-status">[LARGE]</span>
        <span class="tool-id">[${toolId}]</span>
        <span class="tool-output">${content.length}b: ${preview}</span>
      </div>
    `;
  }

  /**
   * Enhance confirmation messages like "[ok]" with context information
   * @param {string} content - Original message content
   * @param {Object} message - Full message object with metadata
   * @returns {string} Enhanced message content
   */
  enhanceConfirmationMessage(content, message) {
    const trimmedContent = content.trim();
    
    // Detect simple confirmation patterns
    const confirmationPatterns = [
      /^\[ok\]$/i,
      /^ok$/i,
      /^yes$/i,
      /^\[yes\]$/i,
      /^y$/i,
      /^\[y\]$/i,
      /^1$/,  // Choice selection
      /^2$/,
      /^3$/
    ];
    
    const isConfirmation = confirmationPatterns.some(pattern => pattern.test(trimmedContent));
    
    if (isConfirmation && message) {
      // Try to extract context from the message timestamp
      const messageTime = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : 'unknown time';
      
      // Enhanced display for confirmation messages
      return `${content} <span class="confirmation-context">(User confirmation at ${messageTime})</span>`;
    }
    
    // For other potential confirmation-like messages, check if they seem like choices
    if (/^[1-9]$/.test(trimmedContent)) {
      return `${content} <span class="confirmation-context">(Menu selection)</span>`;
    }
    
    // Check for common CLI responses
    if (/^(continue|proceed|accept|confirm|done)$/i.test(trimmedContent)) {
      return `${content} <span class="confirmation-context">(User command)</span>`;
    }
    
    return content;
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
    if (!clearBtn) return; // Guard against null when AgentsPage isn't rendered
    
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
        const category = this.getStateCategory(state);
        return category === this.filters.status;
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
   * Get state category for filtering
   * @param {string} state - Detailed conversation state
   * @returns {string} Category: 'active' or 'inactive'
   */
  getStateCategory(state) {
    // Active states - conversation is currently being used or recently active
    const activeStates = [
      'Claude Code working...',
      'Awaiting user input...',
      'User typing...',
      'Awaiting response...',
      'Recently active'
    ];
    
    // Inactive states - conversation is idle or old
    const inactiveStates = [
      'Idle',
      'Inactive',
      'Old',
      'unknown'
    ];
    
    if (activeStates.includes(state)) {
      return 'active';
    } else if (inactiveStates.includes(state)) {
      return 'inactive';
    } else {
      // Default for any unknown states
      return 'inactive';
    }
  }

  /**
   * Get simple conversation preview text (avoids repeating metadata)
   * @param {Object} conv - Conversation object
   * @returns {string} Preview text
   */
  getSimpleConversationPreview(conv) {
    // If we have a last message, show it (this is the most useful info)
    if (conv.lastMessage && conv.lastMessage.trim()) {
      const lastMsg = conv.lastMessage.trim();
      
      // Check if last message is a simple confirmation and try to make it more descriptive
      if (this.isSimpleConfirmation(lastMsg)) {
        const messageCount = conv.messageCount || 0;
        const lastActivity = conv.lastModified ? this.formatRelativeTime(new Date(conv.lastModified)) : 'recently';
        return `User confirmed action • ${messageCount} messages • ${lastActivity}`;
      }
      
      // Check if it's a tool-related message
      if (lastMsg.includes('Tool Result') || lastMsg.includes('[Tool:')) {
        return `Tool execution completed • ${this.truncateText(lastMsg, 60)}`;
      }
      
      return this.truncateText(lastMsg, 80);
    }
    
    // For empty conversations, show descriptive text
    const messageCount = conv.messageCount || 0;
    if (messageCount === 0) {
      return 'Empty conversation - click to start chatting';
    }
    
    // For conversations without lastMessage but with messages, show informative text
    const lastActivity = conv.lastModified ? this.formatRelativeTime(new Date(conv.lastModified)) : 'unknown';
    return `${messageCount} messages • Last activity ${lastActivity}`;
  }
  
  /**
   * Check if a message is a simple confirmation
   * @param {string} message - Message content
   * @returns {boolean} True if it's a simple confirmation
   */
  isSimpleConfirmation(message) {
    const trimmed = message.trim();
    const confirmationPatterns = [
      /^\[ok\]$/i,
      /^ok$/i,
      /^yes$/i,
      /^\[yes\]$/i,
      /^y$/i,
      /^\[y\]$/i,
      /^[1-9]$/,  // Choice selection
      /^(continue|proceed|accept|confirm|done)$/i
    ];
    
    return confirmationPatterns.some(pattern => pattern.test(trimmed));
  }

  /**
   * Get conversation preview text (legacy method - still used in other places)
   * @param {Object} conv - Conversation object
   * @param {string} state - Conversation state
   * @returns {string} Preview text
   */
  getConversationPreview(conv, state) {
    // If we have a last message, show it
    if (conv.lastMessage && conv.lastMessage.trim()) {
      return this.truncateText(conv.lastMessage, 60);
    }
    
    // Otherwise, show conversation info based on state and metadata
    const messageCount = conv.messageCount || 0;
    
    if (messageCount === 0) {
      return `Empty conversation • Project: ${conv.project || 'Unknown'}`;
    }
    
    // Show state-based preview
    if (state === 'Claude Code working...') {
      return `Claude is working • ${messageCount} messages`;
    } else if (state === 'Awaiting user input...') {
      return `Waiting for your input • ${messageCount} messages`;
    } else if (state === 'User typing...') {
      return `Ready for your message • ${messageCount} messages`;
    } else if (state === 'Recently active') {
      return `Recently active • ${messageCount} messages`;
    } else {
      return `${messageCount} messages • Last active ${this.formatRelativeTime(new Date(conv.lastModified))}`;
    }
  }

  /**
   * Get state CSS class
   * @param {string} state - Conversation state
   * @returns {string} CSS class
   */
  getStateClass(state) {
    const stateClasses = {
      'Claude Code working...': 'status-active',
      'Awaiting user input...': 'status-waiting',
      'User typing...': 'status-typing',
      'Awaiting response...': 'status-pending',
      'Recently active': 'status-recent',
      'Idle': 'status-idle',
      'Inactive': 'status-inactive',
      'Old': 'status-old',
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
      'Claude Code working...': 'Working',
      'Awaiting user input...': 'Awaiting input',
      'User typing...': 'Typing',
      'Awaiting response...': 'Awaiting response',
      'Recently active': 'Recent',
      'Idle': 'Idle',
      'Inactive': 'Inactive',
      'Old': 'Old',
      'unknown': 'Unknown'
    };
    return stateLabels[state] || state;
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
    if (!searchInput) return; // Guard against null when AgentsPage isn't rendered
    
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
    const statusFilter = this.container.querySelector('#status-filter');
    const timeFilter = this.container.querySelector('#time-filter');
    const searchFilter = this.container.querySelector('#search-filter');
    
    if (statusFilter) statusFilter.value = 'all';
    if (timeFilter) timeFilter.value = '7d';
    if (searchFilter) searchFilter.value = '';
    
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
    if (!refreshBtn) return; // Guard against null when AgentsPage isn't rendered
    
    refreshBtn.disabled = true;
    const iconElement = refreshBtn.querySelector('.btn-icon');
    if (iconElement) {
      iconElement.style.animation = 'spin 1s linear infinite';
    }

    try {
      // Clear both server and client cache to force fresh data
      console.log('🔄 Refreshing conversations with full cache clear...');
      await this.dataService.clearServerCache('conversations');
      await this.loadConversationsData();
    } catch (error) {
      console.error('Error refreshing conversations:', error);
      this.stateService.setError('Failed to refresh conversations');
    } finally {
      refreshBtn.disabled = false;
      if (iconElement) {
        iconElement.style.animation = '';
      }
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
    const conversationsList = this.container.querySelector('#conversations-list');
    const emptyState = this.container.querySelector('#empty-state');
    if (!conversationsList || !emptyState) return; // Guard against null when AgentsPage isn't rendered
    
    conversationsList.style.display = 'none';
    emptyState.style.display = 'flex';
  }

  /**
   * Hide empty state
   */
  hideEmptyState() {
    const conversationsList = this.container.querySelector('#conversations-list');
    const emptyState = this.container.querySelector('#empty-state');
    if (!conversationsList || !emptyState) return; // Guard against null when AgentsPage isn't rendered
    
    conversationsList.style.display = 'block';
    emptyState.style.display = 'none';
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

    const gridElement = this.container.querySelector('#conversations-grid');
    const tableSection = this.container.querySelector('.conversations-table-section');
    
    if (!gridElement || !tableSection) return; // Guard against null when AgentsPage isn't rendered
    
    const gridSection = gridElement.parentNode;

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
   * @param {Object} activeStates - Active conversation states (direct object, not nested)
   */
  updateConversationStates(activeStates) {
    const conversations = this.stateService.getStateProperty('conversations') || [];
    
    console.log(`🔄 updateConversationStates called with:`, {
      activeStatesCount: Object.keys(activeStates || {}).length,
      selectedConversation: this.selectedConversationId,
      selectedState: activeStates?.[this.selectedConversationId]
    });
    
    // Re-render conversation list with new states
    this.renderConversationsList(conversations, activeStates || {});
    
    // Update banner if we have a selected conversation
    if (this.selectedConversationId && activeStates && activeStates[this.selectedConversationId]) {
      console.log(`🔄 Updating banner from updateConversationStates: ${this.selectedConversationId} -> ${activeStates[this.selectedConversationId]}`);
      this.updateStateBanner(this.selectedConversationId, activeStates[this.selectedConversationId]);
    }
  }

  /**
   * Handle conversation state change
   * @param {Object} _state - New state (unused but required by interface)
   */
  handleConversationStateChange(_state) {
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
    
    // Cleanup scroll listeners
    const messagesContent = this.container.querySelector('#messages-content');
    if (messagesContent && this.messagesScrollListener) {
      messagesContent.removeEventListener('scroll', this.messagesScrollListener);
    }
    
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