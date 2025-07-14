/**
 * Dashboard - Main dashboard component that orchestrates all other components
 * Part of the modular frontend architecture
 */
class Dashboard {
  constructor(container, services) {
    this.container = container;
    this.dataService = services.data;
    this.stateService = services.state;
    this.chartService = services.chart;
    
    this.components = {};
    this.refreshInterval = null;
    this.isInitialized = false;
    
    // Subscribe to state changes
    this.unsubscribe = this.stateService.subscribe(this.handleStateChange.bind(this));
  }

  /**
   * Initialize the dashboard
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.stateService.setLoading(true);
      await this.render();
      await this.initializeComponents();
      await this.loadInitialData();
      this.startPeriodicRefresh();
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      this.stateService.setError(error);
    } finally {
      this.stateService.setLoading(false);
    }
  }

  /**
   * Handle state changes from StateService
   * @param {Object} state - New state
   * @param {string} action - Action that caused the change
   */
  handleStateChange(state, action) {
    switch (action) {
      case 'update_conversations':
        this.updateSummaryDisplay(state.summary);
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
    }
  }

  /**
   * Render the dashboard structure
   */
  async render() {
    this.container.innerHTML = `
      <div class="dashboard-container">
        <!-- Header -->
        <div class="dashboard-header">
          <div class="terminal-title">
            <span class="status-dot"></span>
            Claude Code Analytics - Terminal
          </div>
          <div class="header-controls">
            <button class="control-btn" id="refresh-btn" title="Refresh data">
              <span class="refresh-icon">🔄</span>
              Refresh
            </button>
            <button class="control-btn" id="notifications-btn" title="Toggle notifications">
              <span class="notification-icon">🔔</span>
              Notifications
            </button>
            <div class="last-update">
              <span id="last-update-text">Never</span>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div class="loading-overlay" id="loading-overlay" style="display: none;">
          <div class="loading-spinner"></div>
          <span class="loading-text">Loading dashboard...</span>
        </div>

        <!-- Error State -->
        <div class="error-banner" id="error-banner" style="display: none;">
          <span class="error-icon">⚠️</span>
          <span class="error-text"></span>
          <button class="error-close" id="error-close">×</button>
        </div>

        <!-- Summary Cards -->
        <div class="summary-section">
          <div class="summary-cards">
            <div class="summary-card">
              <div class="card-header">
                <h3>Total Conversations</h3>
                <span class="card-icon">💬</span>
              </div>
              <div class="card-value" id="total-conversations">0</div>
              <div class="card-change">
                <span class="change-text" id="conversations-change">+0 today</span>
              </div>
            </div>

            <div class="summary-card">
              <div class="card-header">
                <h3>Active Sessions</h3>
                <span class="card-icon">⚡</span>
              </div>
              <div class="card-value" id="active-sessions">0</div>
              <div class="card-change">
                <span class="change-text" id="sessions-change">0 running</span>
              </div>
            </div>

            <div class="summary-card">
              <div class="card-header">
                <h3>Total Tokens</h3>
                <span class="card-icon">🔤</span>
              </div>
              <div class="card-value" id="total-tokens">0</div>
              <div class="card-change">
                <span class="change-text" id="tokens-change">0 avg/conv</span>
              </div>
            </div>

            <div class="summary-card">
              <div class="card-header">
                <h3>Projects</h3>
                <span class="card-icon">📁</span>
              </div>
              <div class="card-value" id="total-projects">0</div>
              <div class="card-change">
                <span class="change-text" id="projects-change">0 active</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Charts Section -->
        <div class="charts-section">
          <div class="chart-container">
            <div class="chart-header">
              <h3>Usage Over Time</h3>
              <div class="chart-controls">
                <select id="chart-period">
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </div>
            </div>
            <div class="chart-canvas-container">
              <canvas id="usage-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- Conversations Table -->
        <div class="conversations-section">
          <div class="section-header">
            <h3>Recent Conversations</h3>
            <div class="section-controls">
              <button class="control-btn" id="export-btn">
                <span class="export-icon">📤</span>
                Export
              </button>
            </div>
          </div>
          <div class="conversations-table-container" id="conversations-table">
            <!-- ConversationTable component will be mounted here -->
          </div>
        </div>

        <!-- Footer -->
        <div class="dashboard-footer">
          <div class="footer-info">
            <span>Analytics Dashboard v1.0</span>
            <span>•</span>
            <span id="connection-status">Connected</span>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * Initialize child components
   */
  async initializeComponents() {
    // Initialize ConversationTable
    const tableContainer = this.container.querySelector('#conversations-table');
    this.components.conversationTable = new ConversationTable(
      tableContainer,
      this.dataService,
      this.stateService
    );
    await this.components.conversationTable.initialize();

    // Initialize Charts (if available)
    if (this.chartService) {
      await this.initializeCharts();
    }
  }

  /**
   * Initialize charts
   */
  async initializeCharts() {
    const chartCanvas = this.container.querySelector('#usage-chart');
    if (chartCanvas) {
      this.components.usageChart = new Chart(chartCanvas, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Conversations',
            data: [],
            borderColor: '#3fb950',
            backgroundColor: 'rgba(63, 185, 80, 0.1)',
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                color: '#30363d'
              },
              ticks: {
                color: '#c9d1d9'
              }
            },
            x: {
              grid: {
                color: '#30363d'
              },
              ticks: {
                color: '#c9d1d9'
              }
            }
          },
          plugins: {
            legend: {
              labels: {
                color: '#c9d1d9'
              }
            }
          }
        }
      });
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Refresh button
    const refreshBtn = this.container.querySelector('#refresh-btn');
    refreshBtn.addEventListener('click', () => this.refreshData());

    // Notifications button
    const notificationsBtn = this.container.querySelector('#notifications-btn');
    notificationsBtn.addEventListener('click', () => this.toggleNotifications());

    // Export button
    const exportBtn = this.container.querySelector('#export-btn');
    exportBtn.addEventListener('click', () => this.exportData());

    // Chart period selector
    const chartPeriod = this.container.querySelector('#chart-period');
    chartPeriod.addEventListener('change', (e) => this.updateChartPeriod(e.target.value));

    // Error banner close
    const errorClose = this.container.querySelector('#error-close');
    errorClose.addEventListener('click', () => this.clearError());
  }

  /**
   * Load initial data
   */
  async loadInitialData() {
    try {
      const [conversationsData, statesData] = await Promise.all([
        this.dataService.getConversations(),
        this.dataService.getConversationStates()
      ]);

      this.stateService.updateConversations(conversationsData.conversations);
      this.stateService.updateSummary(conversationsData.summary);
      this.stateService.updateConversationStates(statesData);
      
      this.updateLastUpdateTime();
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.stateService.setError('Failed to load dashboard data');
    }
  }

  /**
   * Refresh all data
   */
  async refreshData() {
    const refreshBtn = this.container.querySelector('#refresh-btn');
    refreshBtn.disabled = true;
    refreshBtn.querySelector('.refresh-icon').style.animation = 'spin 1s linear infinite';

    try {
      this.dataService.clearCache();
      await this.loadInitialData();
    } catch (error) {
      console.error('Error refreshing data:', error);
      this.stateService.setError('Failed to refresh data');
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.querySelector('.refresh-icon').style.animation = '';
    }
  }

  /**
   * Update summary display
   * @param {Object} summary - Summary data
   */
  updateSummaryDisplay(summary) {
    if (!summary) return;

    const totalConvs = this.container.querySelector('#total-conversations');
    const activeSessions = this.container.querySelector('#active-sessions');
    const totalTokens = this.container.querySelector('#total-tokens');
    const totalProjects = this.container.querySelector('#total-projects');

    if (totalConvs) totalConvs.textContent = summary.totalConversations?.toLocaleString() || '0';
    if (activeSessions) activeSessions.textContent = summary.activeConversations?.toLocaleString() || '0';
    if (totalTokens) totalTokens.textContent = summary.totalTokens?.toLocaleString() || '0';
    if (totalProjects) totalProjects.textContent = summary.totalProjects?.toLocaleString() || '0';

    // Update change indicators
    const conversationsChange = this.container.querySelector('#conversations-change');
    const sessionsChange = this.container.querySelector('#sessions-change');
    const tokensChange = this.container.querySelector('#tokens-change');
    const projectsChange = this.container.querySelector('#projects-change');

    if (conversationsChange) conversationsChange.textContent = `+${summary.totalConversations || 0} total`;
    if (sessionsChange) sessionsChange.textContent = `${summary.activeConversations || 0} running`;
    if (tokensChange) tokensChange.textContent = `${summary.avgTokensPerConversation || 0} avg/conv`;
    if (projectsChange) projectsChange.textContent = `${summary.activeProjects || 0} active`;
  }

  /**
   * Update conversation states
   * @param {Object} states - Conversation states
   */
  updateConversationStates(states) {
    // Update status dot based on active conversations
    const statusDot = this.container.querySelector('.status-dot');
    const activeCount = Object.values(states).filter(state => state === 'active').length;
    
    if (activeCount > 0) {
      statusDot.style.background = '#3fb950';
      statusDot.style.animation = 'pulse 2s infinite';
    } else {
      statusDot.style.background = '#f85149';
      statusDot.style.animation = 'none';
    }
  }

  /**
   * Handle conversation state change
   * @param {Object} state - New state
   */
  handleConversationStateChange(state) {
    // Show notification for state changes
    this.showNotification(`Conversation state changed`, 'info');
    this.updateLastUpdateTime();
  }

  /**
   * Update loading state
   * @param {boolean} isLoading - Loading state
   */
  updateLoadingState(isLoading) {
    const loadingOverlay = this.container.querySelector('#loading-overlay');
    loadingOverlay.style.display = isLoading ? 'flex' : 'none';
  }

  /**
   * Update error state
   * @param {Error|string} error - Error object or message
   */
  updateErrorState(error) {
    const errorBanner = this.container.querySelector('#error-banner');
    const errorText = this.container.querySelector('.error-text');
    
    if (error) {
      errorText.textContent = error.message || error;
      errorBanner.style.display = 'flex';
    } else {
      errorBanner.style.display = 'none';
    }
  }

  /**
   * Clear error state
   */
  clearError() {
    this.stateService.clearError();
  }

  /**
   * Toggle notifications
   */
  toggleNotifications() {
    const notificationsBtn = this.container.querySelector('#notifications-btn');
    const isEnabled = notificationsBtn.classList.toggle('active');
    
    if (isEnabled) {
      this.requestNotificationPermission();
    }
  }

  /**
   * Request notification permission
   */
  async requestNotificationPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.showNotification('Notifications enabled', 'success');
      }
    }
  }

  /**
   * Show notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   */
  showNotification(message, type = 'info') {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Claude Code Analytics`, {
        body: message,
        icon: '/favicon.ico'
      });
    }
  }

  /**
   * Export data
   */
  exportData() {
    const conversations = this.stateService.getStateProperty('conversations');
    const dataStr = JSON.stringify(conversations, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `claude-analytics-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Update chart period
   * @param {string} period - New period
   */
  updateChartPeriod(period) {
    // Update chart with new period data
    console.log('Updating chart period to:', period);
    // Implementation would update the chart with filtered data
  }

  /**
   * Update last update time
   */
  updateLastUpdateTime() {
    const lastUpdateText = this.container.querySelector('#last-update-text');
    if (lastUpdateText) {
      lastUpdateText.textContent = new Date().toLocaleTimeString();
    }
  }

  /**
   * Start periodic refresh
   */
  startPeriodicRefresh() {
    this.refreshInterval = setInterval(async () => {
      try {
        const statesData = await this.dataService.getConversationStates();
        this.stateService.updateConversationStates(statesData);
        this.updateLastUpdateTime();
      } catch (error) {
        console.error('Error during periodic refresh:', error);
      }
    }, 30000); // Refresh every 30 seconds
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
   * Cleanup and destroy dashboard
   */
  destroy() {
    this.stopPeriodicRefresh();
    
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
  module.exports = Dashboard;
}