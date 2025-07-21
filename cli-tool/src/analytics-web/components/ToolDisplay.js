/**
 * ToolDisplay - Dedicated component for displaying tool uses and results safely
 * Handles proper formatting, truncation, and escaping of tool content
 */
class ToolDisplay {
  constructor() {
    this.maxContentLength = 500;
    this.maxParamLength = 100;
  }

  /**
   * Render a tool use block
   * @param {Object} toolBlock - Tool use block
   * @returns {string} Safe HTML string
   */
  renderToolUse(toolBlock) {
    const toolName = this.escapeHtml(toolBlock.name || 'Unknown');
    const toolId = toolBlock.id ? toolBlock.id.slice(-8) : 'unknown';
    
    // Generate compact command representation
    const commandSummary = this.generateCompactCommand(toolName, toolBlock.input);
    
    return `
      <div class="terminal-tool tool-use compact">
        <span class="tool-command">⏺ ${commandSummary}</span>
      </div>
    `;
  }

  /**
   * Render a tool result block
   * @param {Object} toolResultBlock - Tool result block
   * @returns {string} Safe HTML string
   */
  renderToolResult(toolResultBlock) {
    const toolId = toolResultBlock.tool_use_id ? toolResultBlock.tool_use_id.slice(-8) : 'unknown';
    const isError = toolResultBlock.is_error || false;
    
    const preview = this.generateResultPreview(toolResultBlock.content);
    const status = isError ? 'ERROR' : 'OK';
    
    // For compact terminal display, show simple output with tree symbol
    const content = toolResultBlock.content || '';
    const compactOutput = this.generateCompactOutput(content, isError);
    
    return `
      <div class="terminal-tool tool-result compact ${isError ? 'error' : 'success'}">
        <span class="tool-prompt">⎿</span>
        <span class="tool-output-compact">${compactOutput}</span>
      </div>
    `;
  }

  /**
   * Generate compact command representation for tool use
   * @param {string} toolName - Tool name
   * @param {Object} input - Tool input parameters
   * @returns {string} Compact command
   */
  generateCompactCommand(toolName, input) {
    if (!input || typeof input !== 'object') {
      return `${toolName}()`;
    }

    switch (toolName) {
      case 'Bash':
        if (input.command) {
          const command = this.escapeHtml(input.command);
          return `<span class="tool-name-bold">Bash</span>(${command})`;
        }
        break;
        
      case 'Read':
        if (input.file_path) {
          const fileName = input.file_path.split('/').pop();
          return `<span class="tool-name-bold">Read</span>(${this.escapeHtml(fileName)})`;
        }
        break;
        
      case 'Edit':
        if (input.file_path) {
          const fileName = input.file_path.split('/').pop();
          return `<span class="tool-name-bold">Edit</span>(${this.escapeHtml(fileName)})`;
        }
        break;
        
      case 'Write':
        if (input.file_path) {
          const fileName = input.file_path.split('/').pop();
          return `<span class="tool-name-bold">Write</span>(${this.escapeHtml(fileName)})`;
        }
        break;
        
      case 'Glob':
        if (input.pattern) {
          return `<span class="tool-name-bold">Glob</span>("${this.escapeHtml(input.pattern)}")`;
        }
        break;
        
      case 'Grep':
        if (input.pattern) {
          return `<span class="tool-name-bold">Grep</span>("${this.escapeHtml(input.pattern)}")`;
        }
        break;
        
      case 'TodoWrite':
        const todoCount = Array.isArray(input.todos) ? input.todos.length : 0;
        return `<span class="tool-name-bold">TodoWrite</span>(${todoCount} todos)`;
    }
    
    return `${toolName}()`;
  }

  /**
   * Generate compact output representation for tool results
   * @param {*} content - Tool result content
   * @param {boolean} _isError - Whether this is an error result (unused)
   * @returns {string} Compact output
   */
  generateCompactOutput(content, _isError) {
    if (typeof content === 'string') {
      // For JSON content, try to format it nicely
      if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
        try {
          const parsed = JSON.parse(content);
          const formatted = JSON.stringify(parsed, null, 2);
          return `<pre class="json-output">${this.escapeHtml(formatted)}</pre>`;
        } catch (e) {
          // Fall through to regular text handling
        }
      }
      
      // For multi-line content, show first few lines with continuation
      const lines = content.split('\n');
      if (lines.length > 3) {
        const preview = lines.slice(0, 3).join('\n');
        const remaining = lines.length - 3;
        return `<pre class="text-output">${this.escapeHtml(preview)}\n<span class="continuation">… +${remaining} lines</span></pre>`;
      } else {
        return `<pre class="text-output">${this.escapeHtml(content)}</pre>`;
      }
    } else if (Array.isArray(content)) {
      return `<span class="array-output">[${content.length} items]</span>`;
    } else if (content && typeof content === 'object') {
      const keys = Object.keys(content);
      return `<span class="object-output">{${keys.length} properties}</span>`;
    }
    
    return '<span class="empty-output">[empty]</span>';
  }

  /**
   * Generate tool summary based on tool type
   * @param {string} toolName - Tool name
   * @param {Object} input - Tool input parameters
   * @returns {string} Tool summary
   */
  generateToolSummary(toolName, input) {
    if (!input || typeof input !== 'object') return '';

    switch (toolName) {
      case 'TodoWrite':
        const todoCount = Array.isArray(input.todos) ? input.todos.length : 0;
        return `${todoCount} todo${todoCount !== 1 ? 's' : ''}`;
        
      case 'Read':
        if (input.file_path) {
          const fileName = input.file_path.split('/').pop();
          return this.escapeHtml(fileName);
        }
        break;
        
      case 'Edit':
        if (input.file_path) {
          const fileName = input.file_path.split('/').pop();
          const changeSize = input.old_string ? input.old_string.length : 0;
          return `${this.escapeHtml(fileName)} (${changeSize}b)`;
        }
        break;
        
      case 'Bash':
        if (input.command) {
          const command = this.truncateText(input.command, 40);
          return `<span class="bash-command">${this.escapeHtml(command)}</span>`;
        }
        break;
        
      case 'Write':
        if (input.file_path) {
          const fileName = input.file_path.split('/').pop();
          const contentSize = input.content ? input.content.length : 0;
          return `${this.escapeHtml(fileName)} (${contentSize}b)`;
        }
        break;
        
      case 'Glob':
        if (input.pattern) {
          return `"${this.escapeHtml(input.pattern)}"`;
        }
        break;
        
      case 'Grep':
        if (input.pattern) {
          return `"${this.escapeHtml(input.pattern)}"`;
        }
        break;
    }
    
    return '';
  }


  /**
   * Format Bash command output with proper console styling
   * @param {string} content - Bash output content
   * @returns {string} Formatted HTML
   */
  formatBashOutput(content) {
    if (!content) return '';
    
    const lines = content.split('\n');
    const formattedLines = lines.map(line => {
      // Escape HTML first
      line = this.escapeHtml(line);
      
      // Highlight different types of output
      if (line.includes('Error:') || line.includes('ERROR') || line.includes('❌')) {
        return `<span class="console-error">${line}</span>`;
      } else if (line.includes('Warning:') || line.includes('WARN') || line.includes('⚠️')) {
        return `<span class="console-warning">${line}</span>`;
      } else if (line.includes('✅') || line.includes('SUCCESS')) {
        return `<span class="console-success">${line}</span>`;
      } else if (line.startsWith('>')) {
        return `<span class="console-command">${line}</span>`;
      } else if (line.includes('📊') || line.includes('🔧') || line.includes('⚡')) {
        return `<span class="console-info">${line}</span>`;
      } else {
        return `<span class="console-output">${line}</span>`;
      }
    });
    
    return formattedLines.join('<br>');
  }

  /**
   * Generate result preview
   * @param {*} content - Tool result content
   * @returns {string} Result preview
   */
  generateResultPreview(content) {
    if (typeof content === 'string') {
      if (content.length > 50) {
        const preview = this.truncateText(content, 50);
        return this.escapeHtml(preview);
      }
      return this.escapeHtml(content);
    } else if (Array.isArray(content)) {
      return `${content.length} items`;
    } else if (content && typeof content === 'object') {
      const keys = Object.keys(content);
      return `${keys.length} props`;
    }
    
    return '';
  }

  /**
   * Truncate text safely
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (typeof text !== 'string') return String(text);
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Bind events for tool displays (simplified for terminal style)
   * @param {Element} _container - Container element (unused in terminal style)
   */
  bindEvents(_container) {
    // No expand/collapse needed for terminal style - everything is compact
  }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ToolDisplay;
}