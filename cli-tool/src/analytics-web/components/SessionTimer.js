/**
 * SessionTimer Component
 * Displays current session information, timing, token usage, and Max plan limits
 */
class SessionTimer {
  constructor(container, dataService, stateService) {
    this.container = container;
    this.dataService = dataService;
    this.stateService = stateService;
    this.sessionData = null;
    this.updateInterval = null;
    this.isInitialized = false;
    this.refreshInterval = 1000; // 1 second for real-time updates
    this.SESSION_DURATION = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
  }

  /**
   * Initialize the session timer component
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      await this.render();
      await this.loadSessionData();
      this.startAutoUpdate();
      this.isInitialized = true;
      
      console.log('📊 SessionTimer component initialized');
    } catch (error) {
      console.error('Error initializing SessionTimer:', error);
      this.showError('Failed to initialize session timer');
    }
  }

  /**
   * Render the session timer UI
   */
  async render() {
    this.container.innerHTML = `
      <div class="session-timer-accordion">
        <div class="session-timer-header" onclick="window.sessionTimer?.toggleAccordion()">
          <div class="session-timer-title-section">
            <span class="session-timer-chevron">▼</span>
            <h3 class="session-timer-title">Current Session</h3>
          </div>
          <div class="session-timer-status-inline">
            <span class="session-timer-status-dot"></span>
            <span class="session-timer-status-text">Loading...</span>
          </div>
        </div>
        
        <div class="session-timer-content" id="session-timer-content">
          <div class="session-loading-state">
            <div class="session-spinner"></div>
            <span>Loading session data...</span>
          </div>
          
          <div class="session-display" style="display: none;">
            <!-- Session timer display will be populated here -->
          </div>
          
          <div class="session-warnings">
            <!-- Warnings will be displayed here -->
          </div>
        </div>
      </div>
    `;

    // Make component globally accessible for button clicks
    window.sessionTimer = this;
    this.isExpanded = true; // Start expanded
  }

  /**
   * Load session data from API
   */
  async loadSessionData() {
    try {
      this.sessionData = await this.dataService.getSessionData();
      this.updateDisplay();
    } catch (error) {
      console.error('Error loading session data:', error);
      this.showError('Failed to load session data');
    }
  }

  /**
   * Refresh session data manually
   */
  async refreshSessionData() {
    const refreshBtn = this.container.querySelector('.session-refresh-btn button');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
      await this.loadSessionData();
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
      }
    }
  }

  /**
   * Update the display with current session data
   */
  updateDisplay() {
    if (!this.sessionData) return;

    const loadingState = this.container.querySelector('.session-loading-state');
    const sessionDisplay = this.container.querySelector('.session-display');
    const warningsContainer = this.container.querySelector('.session-warnings');

    if (loadingState) loadingState.style.display = 'none';
    if (sessionDisplay) sessionDisplay.style.display = 'block';

    // Update session display
    this.renderSessionInfo(sessionDisplay);
    
    // Update warnings
    this.renderWarnings(warningsContainer);
  }

  /**
   * Render session information
   */
  renderSessionInfo(container) {
    const { timer, userPlan, monthlyUsage, limits } = this.sessionData;
    
    // Update header status
    this.updateHeaderStatus(timer);
    
    if (!timer.hasActiveSession) {
      container.innerHTML = `
        <div class="session-timer-empty">
          <div class="session-timer-empty-text">No active session</div>
          <div class="session-timer-empty-subtext">Start a conversation to begin tracking</div>
        </div>
      `;
      return;
    }

    // Calculate progress colors based on usage
    const progressPercentage = Math.round(timer.sessionProgress);
    const timeProgressPercentage = Math.round(((this.SESSION_DURATION - timer.timeRemaining) / this.SESSION_DURATION) * 100);
    
    const getProgressColor = (percentage) => {
      if (percentage < 50) return '#3fb950';
      if (percentage < 80) return '#f97316';
      return '#f85149';
    };

    const messageProgressColor = getProgressColor(progressPercentage);
    const timeProgressColor = getProgressColor(timeProgressPercentage);
    
    // Format time remaining with better UX
    const formatTimeRemaining = (ms) => {
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((ms % (1000 * 60)) / 1000);
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    };

    container.innerHTML = `
      <div class="session-timer-compact">
        <div class="session-timer-row">
          <div class="session-timer-time-compact">
            <div class="session-timer-time-value">${formatTimeRemaining(timer.timeRemaining)}</div>
            <div class="session-timer-time-label">remaining</div>
          </div>
          
          <div class="session-timer-progress-compact">
            <div class="session-timer-progress-item">
              <div class="session-timer-progress-header">
                <span class="session-timer-progress-label">Messages</span>
                <span class="session-timer-progress-value">${timer.messagesUsed}/${timer.messagesLimit} ${timer.messageWeight ? `(${timer.messageWeight.toFixed(1)}x)` : ''}</span>
              </div>
              <div class="session-timer-progress-bar">
                <div class="session-timer-progress-fill" 
                     style="width: ${progressPercentage}%; background-color: ${messageProgressColor};"></div>
              </div>
              ${timer.usageDetails && timer.usageDetails.shortMessages > 0 ? `
              <div class="session-timer-usage-details">
                <small>Short: ${timer.usageDetails.shortMessages}, Long: ${timer.usageDetails.longMessages}</small>
              </div>
              ` : ''}
            </div>
            
            <div class="session-timer-progress-item">
              <div class="session-timer-progress-header">
                <span class="session-timer-progress-label">Session Time</span>
                <span class="session-timer-progress-value">${formatTimeRemaining(this.SESSION_DURATION - timer.timeRemaining)}/5h</span>
              </div>
              <div class="session-timer-progress-bar">
                <div class="session-timer-progress-fill" 
                     style="width: ${timeProgressPercentage}%; background-color: ${timeProgressColor};"></div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="session-timer-stats-row">
          <div class="session-timer-stat-compact">
            <span class="session-timer-stat-label">Tokens:</span>
            <span class="session-timer-stat-value">${timer.tokensUsed.toLocaleString()}</span>
          </div>
          
          <div class="session-timer-stat-compact">
            <span class="session-timer-stat-label">Plan:</span>
            <span class="session-timer-stat-value">${limits.name}</span>
          </div>
          
          <div class="session-timer-stat-compact">
            <span class="session-timer-stat-label">Monthly:</span>
            <span class="session-timer-stat-value">${timer.monthlySessionsUsed}/${timer.monthlySessionsLimit}</span>
          </div>
          
          <div class="session-timer-stat-compact">
            <span class="session-timer-stat-label">Resets:</span>
            <span class="session-timer-stat-value">${new Date(timer.willResetAt).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render warnings if any
   */
  renderWarnings(container) {
    if (!this.sessionData || !this.sessionData.warnings || this.sessionData.warnings.length === 0) {
      container.innerHTML = '';
      return;
    }

    const warnings = this.sessionData.warnings
      .filter(warning => warning.type.includes('session') || warning.type.includes('monthly'))
      .slice(0, 3); // Show max 3 warnings

    if (warnings.length === 0) {
      container.innerHTML = '';
      return;
    }

    const warningHtml = warnings.map(warning => `
      <div class="session-warning ${warning.level}">
        <i class="fas ${this.getWarningIcon(warning.level)}"></i>
        <span>${warning.message}</span>
        ${warning.timeRemaining ? `<small>Time remaining: ${this.formatTimeRemaining(warning.timeRemaining)}</small>` : ''}
      </div>
    `).join('');

    container.innerHTML = `<div class="warnings-list">${warningHtml}</div>`;
  }

  /**
   * Get message limit based on current plan
   */
  getMessageLimit() {
    if (!this.sessionData || !this.sessionData.limits) return 225;
    return this.sessionData.limits.messagesPerSession;
  }

  /**
   * Get plan badge CSS class
   */
  getPlanBadgeClass(planType) {
    const classes = {
      'premium': 'plan-premium',
      'standard': 'plan-standard',
      'pro': 'plan-pro'
    };
    return classes[planType] || 'plan-standard';
  }

  /**
   * Get warning icon based on level
   */
  getWarningIcon(level) {
    const icons = {
      'error': 'fa-exclamation-triangle',
      'warning': 'fa-exclamation-circle',
      'info': 'fa-info-circle'
    };
    return icons[level] || 'fa-info-circle';
  }

  /**
   * Format time remaining for display
   */
  formatTimeRemaining(milliseconds) {
    if (milliseconds <= 0) return '0m';
    
    const hours = Math.floor(milliseconds / (60 * 60 * 1000));
    const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Format numbers with appropriate units
   */
  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /**
   * Show error message
   */
  showError(message) {
    const loadingState = this.container.querySelector('.session-loading-state');
    const sessionDisplay = this.container.querySelector('.session-display');
    
    if (loadingState) loadingState.style.display = 'none';
    if (sessionDisplay) {
      sessionDisplay.style.display = 'block';
      sessionDisplay.innerHTML = `
        <div class="session-timer-error">
          <div class="session-timer-error-text">${message}</div>
          <button class="session-timer-retry-btn" onclick="window.sessionTimer?.refreshSessionData()">Retry</button>
        </div>
      `;
    }
  }

  /**
   * Start automatic updates
   */
  startAutoUpdate() {
    // Update every 1 second for real-time display
    this.updateInterval = setInterval(() => {
      this.loadSessionData();
    }, this.refreshInterval);
  }

  /**
   * Stop automatic updates
   */
  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Handle real-time updates
   */
  handleRealtimeUpdate(data) {
    if (data.type === 'session_update' && data.sessionData) {
      this.sessionData = data.sessionData;
      this.updateDisplay();
    }
  }

  /**
   * Toggle accordion open/closed
   */
  toggleAccordion() {
    const content = this.container.querySelector('#session-timer-content');
    const chevron = this.container.querySelector('.session-timer-chevron');
    
    if (this.isExpanded) {
      content.style.display = 'none';
      chevron.textContent = '▶';
      this.isExpanded = false;
    } else {
      content.style.display = 'block';
      chevron.textContent = '▼';
      this.isExpanded = true;
    }
  }
  
  /**
   * Update header status display
   */
  updateHeaderStatus(timer) {
    const statusDot = this.container.querySelector('.session-timer-status-dot');
    const statusText = this.container.querySelector('.session-timer-status-text');
    
    if (!timer.hasActiveSession) {
      statusDot.className = 'session-timer-status-dot inactive';
      statusText.textContent = 'Inactive';
    } else if (timer.timeRemaining < 600000) {
      statusDot.className = 'session-timer-status-dot warning';
      statusText.textContent = 'Ending Soon';
    } else {
      statusDot.className = 'session-timer-status-dot active';
      statusText.textContent = 'Active';
    }
  }

  /**
   * Cleanup component
   */
  destroy() {
    this.stopAutoUpdate();
    if (window.sessionTimer === this) {
      delete window.sessionTimer;
    }
    this.isInitialized = false;
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionTimer;
}

// Global registration for browser
if (typeof window !== 'undefined') {
  window.SessionTimer = SessionTimer;
}