const chalk = require('chalk');

/**
 * StateCalculator - Handles all conversation state determination logic
 * Extracted from monolithic analytics.js for better maintainability
 */
class StateCalculator {
  constructor() {
    // Cache for process states to avoid repeated calculations
    this.processCache = new Map();
  }

  /**
   * Main state determination logic with process information
   * @param {Array} messages - Parsed conversation messages
   * @param {Date} lastModified - File last modification time
   * @param {Object} runningProcess - Active process information
   * @returns {string} Conversation state
   */
  determineConversationState(messages, lastModified, runningProcess = null) {
    const now = new Date();
    const timeDiff = now - lastModified;
    const minutesAgo = timeDiff / (1000 * 60);

    // If there's an active process, use simpler and more stable logic
    if (runningProcess && runningProcess.hasActiveCommand) {
      // Check conversation flow first for immediate response
      if (messages.length > 0) {
        const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const lastMessage = sortedMessages[sortedMessages.length - 1];
        const lastMessageTime = new Date(lastMessage.timestamp);
        const lastMessageMinutesAgo = (now - lastMessageTime) / (1000 * 60);
        
        if (lastMessage.role === 'user') {
          // User sent message - be more conservative about "working" state
          if (lastMessageMinutesAgo < 1) {
            return 'Claude Code working...';
          } else {
            return 'Awaiting response...';
          }
        } else if (lastMessage.role === 'assistant') {
          // Claude responded - check if file activity indicates continued work
          const fileTimeDiff = (now - lastModified) / 1000; // seconds
          if (fileTimeDiff < 30) {
            return 'Claude Code working...';
          }
          // Use broader time ranges for more stability
          if (lastMessageMinutesAgo < 5) {
            return 'Awaiting user input...';
          } else {
            return 'User typing...';
          }
        }
      }
      
      // Very recent file activity = Claude working (fallback)
      const fileTimeDiff = (now - lastModified) / 1000; // seconds
      if (fileTimeDiff < 30) {
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

    // Simplified and more stable state logic
    if (lastMessage.role === 'user') {
      // User sent last message
      if (lastMessageMinutesAgo < 1) {
        return 'Claude Code working...';
      } else if (lastMessageMinutesAgo < 5) {
        return 'Awaiting response...';
      } else {
        return 'User typing...';
      }
    } else if (lastMessage.role === 'assistant') {
      // Assistant sent last message - consolidate similar states
      if (lastMessageMinutesAgo < 5) {
        return 'Awaiting user input...';
      } else {
        return 'User typing...';
      }
    }

    // Fallback states
    if (minutesAgo < 5) return 'Recently active';
    if (minutesAgo < 60) return 'Idle';
    return 'Inactive';
  }

  /**
   * Quick state calculation without file I/O for ultra-fast updates
   * @param {Object} conversation - Conversation object
   * @param {Array} runningProcesses - Array of active processes
   * @returns {string|null} Conversation state or null if not active
   */
  quickStateCalculation(conversation, runningProcesses) {
    // Check if there's an active process for this conversation
    const hasActiveProcess = runningProcesses.some(process => 
      process.workingDir.includes(conversation.project) ||
      process.command.includes(conversation.project) ||
      conversation.runningProcess // Already matched
    );
    
    if (!hasActiveProcess) {
      return null; // Not active, skip
    }
    
    // Simple heuristic based on file modification time - use broader ranges for stability
    const now = new Date();
    const timeDiff = (now - new Date(conversation.lastModified)) / 1000; // seconds
    
    // More stable state logic - fewer transitions
    if (timeDiff < 30) {
      return 'Claude Code working...';
    } else if (timeDiff < 300) { // 5 minutes
      return 'Awaiting user input...';
    } else {
      return 'User typing...';
    }
  }

  /**
   * Determine conversation status (active/recent/inactive)
   * @param {Array} messages - Parsed conversation messages
   * @param {Date} lastModified - File last modification time
   * @returns {string} Conversation status
   */
  determineConversationStatus(messages, lastModified) {
    const now = new Date();
    const timeDiff = now - lastModified;
    const minutesAgo = timeDiff / (1000 * 60);

    if (messages.length === 0) {
      return minutesAgo < 5 ? 'active' : 'inactive';
    }

    // Sort messages by timestamp
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

  /**
   * Get CSS class for conversation state styling
   * @param {string} conversationState - The conversation state
   * @returns {string} CSS class name
   */
  getStateClass(conversationState) {
    if (conversationState.includes('working') || conversationState.includes('Working')) {
      return 'working';
    }
    if (conversationState.includes('typing') || conversationState.includes('Typing')) {
      return 'typing';
    }
    return '';
  }

  /**
   * Clear any cached state information
   */
  clearCache() {
    this.processCache.clear();
  }
}

module.exports = StateCalculator;