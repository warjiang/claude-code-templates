/**
 * SessionAnalyzer - Extracts session timing, token usage, and plan information
 * Tracks Claude Max plan session limits and usage patterns
 */
const chalk = require('chalk');

class SessionAnalyzer {
  constructor() {
    this.SESSION_DURATION = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
    this.MONTHLY_SESSION_LIMIT = 50;
    
    // Plan-specific message limits (conservative estimates)
    this.PLAN_LIMITS = {
      'standard': {
        name: 'Max Plan (5x)',
        messagesPerSession: 225,
        monthlyPrice: 100,
        hasSessionLimits: true
      },
      'premium': {
        name: 'Max Plan (20x)',
        messagesPerSession: 900,
        monthlyPrice: 200,
        hasSessionLimits: true
      },
      'pro': {
        name: 'Pro Plan',
        messagesPerSession: 120, // Pro plan practical limit (varies by message length)
        monthlyPrice: 20,
        hasSessionLimits: false // Pro plan doesn't have 5-hour session limits
      }
    };
  }

  /**
   * Analyze all conversations to extract session information
   * @param {Array} conversations - Array of conversation objects with parsed messages
   * @returns {Object} Session analysis data
   */
  analyzeSessionData(conversations) {
    const sessions = this.extractSessions(conversations);
    const currentSession = this.getCurrentActiveSession(sessions);
    const monthlyUsage = this.calculateMonthlyUsage(sessions);
    const userPlan = this.detectUserPlan(conversations);
    
    return {
      sessions,
      currentSession,
      monthlyUsage,
      userPlan,
      limits: this.PLAN_LIMITS[userPlan.planType] || this.PLAN_LIMITS['pro'],
      warnings: this.generateWarnings(currentSession, monthlyUsage, userPlan)
    };
  }

  /**
   * Calculate message complexity weight based on token usage
   * Pro plan limits are based on message complexity, not just count
   * @param {Object} message - Message object
   * @returns {number} Message weight (1.0 = average message)
   */
  calculateMessageWeight(message) {
    // If we have token usage data, use it for more accurate weighting
    if (message.usage && message.usage.input_tokens) {
      // Average user message is ~200 English sentences = ~3000-4000 tokens
      // But Claude Code messages tend to be shorter, so we use ~500 tokens as average
      const AVERAGE_MESSAGE_TOKENS = 500;
      const inputTokens = message.usage.input_tokens || 0;
      const cacheTokens = message.usage.cache_creation_input_tokens || 0;
      const totalTokens = inputTokens + cacheTokens;
      
      // Calculate weight based on token count relative to average
      const weight = Math.max(0.1, totalTokens / AVERAGE_MESSAGE_TOKENS);
      
      // Cap maximum weight to prevent single very long messages from dominating
      return Math.min(weight, 5.0);
    }
    
    // Fallback: assume average message if no usage data
    return 1.0;
  }

  /**
   * Calculate session usage based on weighted messages
   * @param {Array} userMessages - Array of user messages
   * @returns {Object} Usage statistics
   */
  calculateSessionUsage(userMessages) {
    let totalWeight = 0;
    let shortMessages = 0;
    let longMessages = 0;
    
    userMessages.forEach(msg => {
      const weight = this.calculateMessageWeight(msg);
      totalWeight += weight;
      
      if (weight < 0.5) shortMessages++;
      else if (weight > 2.0) longMessages++;
    });
    
    return {
      messageCount: userMessages.length,
      totalWeight: totalWeight,
      shortMessages,
      longMessages,
      averageWeight: userMessages.length > 0 ? totalWeight / userMessages.length : 0
    };
  }

  /**
   * Extract 5-hour sliding window sessions from conversations
   * @param {Array} conversations - Array of conversation objects
   * @returns {Array} Array of 5-hour session windows
   */
  extractSessions(conversations) {
    // Collect all messages from all conversations with timestamps
    const allMessages = [];
    
    conversations.forEach(conversation => {
      if (!conversation.parsedMessages || conversation.parsedMessages.length === 0) {
        return;
      }

      const sortedMessages = conversation.parsedMessages.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );

      sortedMessages.forEach(message => {
        allMessages.push({
          timestamp: message.timestamp,
          role: message.role,
          conversationId: conversation.id,
          usage: message.usage
        });
      });
    });

    // Sort all messages by timestamp
    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Group messages into 5-hour sliding windows
    const sessions = [];
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
    
    // Find first user message to start session tracking
    const firstUserMessage = allMessages.find(msg => msg.role === 'user');
    if (!firstUserMessage) return [];

    let currentWindowStart = new Date(firstUserMessage.timestamp);
    let sessionCounter = 1;
    
    // Create sessions based on 5-hour windows
    while (currentWindowStart <= new Date()) {
      const windowEnd = new Date(currentWindowStart.getTime() + FIVE_HOURS_MS);
      
      // Find messages within this 5-hour window
      const windowMessages = allMessages.filter(msg => {
        const msgTime = new Date(msg.timestamp);
        return msgTime >= currentWindowStart && msgTime < windowEnd;
      });

      if (windowMessages.length > 0) {
        const session = {
          id: `session_${sessionCounter}`,
          startTime: currentWindowStart,
          endTime: windowEnd,
          messages: windowMessages,
          tokenUsage: {
            input: 0,
            output: 0,
            cacheCreation: 0,
            cacheRead: 0,
            total: 0
          },
          conversations: [...new Set(windowMessages.map(msg => msg.conversationId))],
          serviceTier: null,
          isActive: false
        };

        // Calculate token usage for this window
        windowMessages.forEach(message => {
          if (message.usage) {
            session.tokenUsage.input += message.usage.input_tokens || 0;
            session.tokenUsage.output += message.usage.output_tokens || 0;
            session.tokenUsage.cacheCreation += message.usage.cache_creation_input_tokens || 0;
            session.tokenUsage.cacheRead += message.usage.cache_read_input_tokens || 0;
            session.serviceTier = message.usage.service_tier || session.serviceTier;
          }
        });
        
        session.tokenUsage.total = session.tokenUsage.input + session.tokenUsage.output + 
                                  session.tokenUsage.cacheCreation + session.tokenUsage.cacheRead;

        // Calculate additional properties
        const now = new Date();
        session.duration = windowEnd - currentWindowStart;
        // Only count USER messages for session limits (Claude Code only counts prompts, not responses)
        const userMessages = windowMessages.filter(msg => msg.role === 'user');
        
        // Calculate session usage with message complexity weighting
        const sessionUsage = this.calculateSessionUsage(userMessages);
        session.messageCount = sessionUsage.messageCount;
        session.messageWeight = sessionUsage.totalWeight;
        session.usageDetails = sessionUsage;
        session.conversationCount = session.conversations.length;
        
        // Session is active if current time is within this window
        session.isActive = now >= currentWindowStart && now < windowEnd;
        
        // Calculate time remaining in this window
        if (session.isActive) {
          session.timeRemaining = Math.max(0, windowEnd - now);
        } else {
          session.timeRemaining = 0;
        }
        
        session.actualDuration = session.duration;
        
        sessions.push(session);
        sessionCounter++;
      }

      // Move to next potential session start (look for next user message after current window)
      const nextUserMessage = allMessages.find(msg => 
        msg.role === 'user' && new Date(msg.timestamp) >= windowEnd
      );
      
      if (nextUserMessage) {
        currentWindowStart = new Date(nextUserMessage.timestamp);
      } else {
        break;
      }
    }

    // Sort by start time (most recent first)
    return sessions.sort((a, b) => b.startTime - a.startTime);
  }


  /**
   * Get current active session
   * @param {Array} sessions - Array of session objects
   * @returns {Object|null} Current active session or null
   */
  getCurrentActiveSession(sessions) {
    return sessions.find(session => session.isActive) || null;
  }

  /**
   * Calculate monthly usage statistics
   * @param {Array} sessions - Array of session objects
   * @returns {Object} Monthly usage data
   */
  calculateMonthlyUsage(sessions) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const monthlySessions = sessions.filter(session => 
      session.startTime >= monthStart
    );

    const totalTokens = monthlySessions.reduce((sum, session) => 
      sum + session.tokenUsage.total, 0
    );

    const totalMessages = monthlySessions.reduce((sum, session) => 
      sum + session.messageCount, 0
    );

    return {
      sessionCount: monthlySessions.length,
      totalTokens,
      totalMessages,
      remainingSessions: Math.max(0, this.MONTHLY_SESSION_LIMIT - monthlySessions.length),
      averageTokensPerSession: monthlySessions.length > 0 ? 
        Math.round(totalTokens / monthlySessions.length) : 0,
      averageMessagesPerSession: monthlySessions.length > 0 ? 
        Math.round(totalMessages / monthlySessions.length) : 0
    };
  }

  /**
   * Detect user plan based on service tier information
   * @param {Array} conversations - Array of conversation objects
   * @returns {Object} User plan information
   */
  detectUserPlan(conversations) {
    const serviceTiers = new Set();
    let latestTier = null;
    let latestTimestamp = null;

    conversations.forEach(conversation => {
      if (!conversation.parsedMessages) return;

      conversation.parsedMessages.forEach(message => {
        if (message.usage && message.usage.service_tier) {
          serviceTiers.add(message.usage.service_tier);
          
          if (!latestTimestamp || message.timestamp > latestTimestamp) {
            latestTimestamp = message.timestamp;
            latestTier = message.usage.service_tier;
          }
        }
      });
    });

    // Map service tier to plan type - Pro plan users typically have 'standard' service tier
    // Default to Pro plan since most users have Pro plan
    const planMapping = {
      'standard': 'pro',      // Pro Plan (most common tier)
      'premium': 'premium',   // Max Plan 20x
      'max': 'standard'       // Max Plan 5x
    };

    const detectedTier = latestTier || 'standard';
    const planType = planMapping[detectedTier] || 'pro';

    return {
      tier: detectedTier,
      planType: planType,
      allTiers: Array.from(serviceTiers),
      confidence: latestTier ? 'high' : 'low',
      lastDetected: latestTimestamp
    };
  }

  /**
   * Generate warnings based on current usage
   * @param {Object|null} currentSession - Current active session
   * @param {Object} monthlyUsage - Monthly usage data
   * @param {Object} userPlan - User plan information
   * @returns {Array} Array of warning objects
   */
  generateWarnings(currentSession, monthlyUsage, userPlan) {
    const warnings = [];
    const planLimits = this.PLAN_LIMITS[userPlan.planType] || this.PLAN_LIMITS['standard'];

    // Session-level warnings
    if (currentSession) {
      const sessionProgress = currentSession.messageCount / planLimits.messagesPerSession;
      
      if (sessionProgress >= 0.9) {
        warnings.push({
          type: 'session_limit_critical',
          level: 'error',
          message: `You're near your session message limit (${currentSession.messageCount}/${planLimits.messagesPerSession})`,
          timeRemaining: currentSession.timeRemaining
        });
      } else if (sessionProgress >= 0.75) {
        warnings.push({
          type: 'session_limit_warning',
          level: 'warning',
          message: `75% of session messages used (${currentSession.messageCount}/${planLimits.messagesPerSession})`,
          timeRemaining: currentSession.timeRemaining
        });
      }

      // Time remaining warning
      if (currentSession.timeRemaining < 30 * 60 * 1000) { // 30 minutes
        warnings.push({
          type: 'session_time_warning',
          level: 'info',
          message: `Session expires in ${Math.round(currentSession.timeRemaining / 60000)} minutes`,
          timeRemaining: currentSession.timeRemaining
        });
      }
    }

    // Monthly warnings
    const monthlyProgress = monthlyUsage.sessionCount / this.MONTHLY_SESSION_LIMIT;
    
    if (monthlyProgress >= 0.9) {
      warnings.push({
        type: 'monthly_limit_critical',
        level: 'error',
        message: `You're near your monthly session limit (${monthlyUsage.sessionCount}/${this.MONTHLY_SESSION_LIMIT})`,
        remainingSessions: monthlyUsage.remainingSessions
      });
    } else if (monthlyProgress >= 0.75) {
      warnings.push({
        type: 'monthly_limit_warning',
        level: 'warning',
        message: `75% of monthly sessions used (${monthlyUsage.sessionCount}/${this.MONTHLY_SESSION_LIMIT})`,
        remainingSessions: monthlyUsage.remainingSessions
      });
    }

    return warnings;
  }

  /**
   * Format time remaining for display
   * @param {number} milliseconds - Time in milliseconds
   * @returns {string} Formatted time string
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
   * Get session timer data for dashboard display
   * @param {Object} sessionData - Session analysis data
   * @returns {Object} Timer display data
   */
  getSessionTimerData(sessionData) {
    const { currentSession, monthlyUsage, limits, warnings } = sessionData;
    
    if (!currentSession) {
      return {
        hasActiveSession: false,
        message: 'No active session',
        nextSessionAvailable: true
      };
    }

    // Use weighted message calculation for more accurate progress
    const weightedProgress = (currentSession.messageWeight / limits.messagesPerSession) * 100;
    
    return {
      hasActiveSession: true,
      timeRemaining: currentSession.timeRemaining,
      timeRemainingFormatted: this.formatTimeRemaining(currentSession.timeRemaining),
      messagesUsed: currentSession.messageCount,
      messagesLimit: limits.messagesPerSession,
      messageWeight: currentSession.messageWeight,
      usageDetails: currentSession.usageDetails,
      tokensUsed: currentSession.tokenUsage.total,
      sessionProgress: weightedProgress,
      sessionProgressSimple: (currentSession.messageCount / limits.messagesPerSession) * 100,
      planName: limits.name,
      monthlySessionsUsed: monthlyUsage.sessionCount,
      monthlySessionsLimit: this.MONTHLY_SESSION_LIMIT,
      warnings: warnings.filter(w => w.type.includes('session')),
      willResetAt: currentSession.endTime
    };
  }
}

module.exports = SessionAnalyzer;