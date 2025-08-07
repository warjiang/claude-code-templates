// Index Events - Handles events specific to index.html

class IndexPageManager {
    constructor() {
        this.currentFilter = 'agents';
        this.currentCategoryFilter = 'all';
        this.templatesData = null;
        this.componentsData = null;
        this.availableCategories = {
            agents: new Set(),
            commands: new Set(),
            mcps: new Set(),
            templates: new Set()
        };
        
        // Pagination settings
        this.currentPage = 1;
        this.itemsPerPage = 24; // 3x3 grid
        this.totalPages = 1;
        
        // Framework icons mapping (from script.js)
        this.FRAMEWORK_ICONS = {
            // Languages
            'common': 'devicon-gear-plain',
            'javascript-typescript': 'devicon-javascript-plain',
            'python': 'devicon-python-plain',
            'ruby': 'devicon-ruby-plain',
            'rust': 'devicon-rust-plain',
            'go': 'devicon-go-plain',
            
            // JavaScript/TypeScript frameworks
            'react': 'devicon-react-original',
            'vue': 'devicon-vuejs-plain',
            'angular': 'devicon-angularjs-plain',
            'node': 'devicon-nodejs-plain',
            
            // Python frameworks
            'django': 'devicon-django-plain',
            'flask': 'devicon-flask-original',
            'fastapi': 'devicon-fastapi-plain',
            
            // Ruby frameworks
            'rails': 'devicon-rails-plain',
            'sinatra': 'devicon-ruby-plain',
            
            // Default fallback
            'default': 'devicon-devicon-plain'
        };
    }

    async init() {
        try {
            // Load both templates and components data
            await Promise.all([
                this.loadTemplatesData(),
                this.loadComponentsData()
            ]);
            
            this.setupEventListeners();
            this.displayCurrentFilter();
        } catch (error) {
            console.error('Error initializing index page:', error);
            this.showError('Failed to load data. Please refresh the page.');
        }
    }

    async loadTemplatesData() {
        try {
            this.templatesData = await window.dataLoader.loadTemplates();
        } catch (error) {
            console.error('Error loading templates:', error);
            // Continue without templates - show only components
        }
    }

    async loadComponentsData() {
        this.componentsData = await window.dataLoader.loadComponents();
        this.collectAvailableCategories();
    }

    setupEventListeners() {
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.setFilter(filter);
            });
        });

        // Copy buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-btn')) {
                const command = e.target.previousElementSibling.textContent;
                this.copyToClipboard(command);
            }
        });
        
        // Card flip functionality for template cards
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            // Prevent flipping for "add new" cards or if a button is clicked
            if (card && !card.classList.contains('add-template-card') && !e.target.closest('button')) {
                console.log('Global template card clicked, toggling flip');
                card.classList.toggle('flipped');
            }
        });
        
        // ESC key to close all flipped cards
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.template-card.flipped').forEach(card => {
                    card.classList.remove('flipped');
                });
            }
        });
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.currentPage = 1; // Reset to first page when changing filter
        this.currentCategoryFilter = 'all'; // Reset category filter to show all items
        
        // Update active button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        this.displayCurrentFilter();
    }

    // Set category filter
    setCategoryFilter(category) {
        this.currentCategoryFilter = category;
        this.currentPage = 1; // Reset to first page when changing category
        
        // Update category filter buttons
        document.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const targetBtn = document.querySelector(`[data-category="${category}"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
        
        // Regenerate the component display
        this.displayCurrentFilter();
    }

    // Update category sub-filters in the unified-filter-bar
    updateCategorySubFilters() {
        const unifiedFilterBar = document.querySelector('.unified-filter-bar');
        if (!unifiedFilterBar) return;
        
        // Remove existing category filters
        const existingCategoryFilters = unifiedFilterBar.querySelector('.category-filter-row');
        if (existingCategoryFilters) {
            existingCategoryFilters.remove();
        }
        
        // Get categories for current filter type
        const currentCategories = Array.from(this.availableCategories[this.currentFilter] || []).sort();
        
        if (currentCategories.length <= 1) {
            // Don't show sub-filters if there's only one category or none
            return;
        }
        
        // Create category filter row
        const categoryFilterRow = document.createElement('div');
        categoryFilterRow.className = 'category-filter-row';
        categoryFilterRow.innerHTML = `
            <div class="category-filter-label">Categories:</div>
            <div class="category-filter-buttons">
                <button class="category-filter-btn ${this.currentCategoryFilter === 'all' ? 'active' : ''}" 
                        data-category="all">
                    All
                </button>
                ${currentCategories.map(category => `
                    <button class="category-filter-btn ${this.currentCategoryFilter === category ? 'active' : ''}" 
                            data-category="${category}">
                        ${this.formatComponentName(category)}
                    </button>
                `).join('')}
            </div>
        `;
        
        // Add click event listeners
        categoryFilterRow.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setCategoryFilter(btn.getAttribute('data-category'));
            });
        });
        
        // Append to unified filter bar
        unifiedFilterBar.appendChild(categoryFilterRow);
    }

    // Get filtered components based on current filter and category filter
    getFilteredComponents(type) {
        if (!type) type = this.currentFilter;
        if (type === 'templates') {
            return [];
        }
        
        let components = this.componentsData[type] || [];
        
        // Apply category filter if not 'all'
        if (this.currentCategoryFilter !== 'all') {
            components = components.filter(component => {
                const category = component.category || 'general';
                return category === this.currentCategoryFilter;
            });
        }
        
        return components;
    }

    // Collect available categories from loaded components
    collectAvailableCategories() {
        // Reset categories
        this.availableCategories.agents.clear();
        this.availableCategories.commands.clear();
        this.availableCategories.mcps.clear();
        this.availableCategories.templates.clear();
        
        // Collect categories from each component type
        if (this.componentsData.agents && Array.isArray(this.componentsData.agents)) {
            this.componentsData.agents.forEach(component => {
                const category = component.category || 'general';
                this.availableCategories.agents.add(category);
            });
        }
        
        if (this.componentsData.commands && Array.isArray(this.componentsData.commands)) {
            this.componentsData.commands.forEach(component => {
                const category = component.category || 'general';  
                this.availableCategories.commands.add(category);
            });
        }
        
        if (this.componentsData.mcps && Array.isArray(this.componentsData.mcps)) {
            this.componentsData.mcps.forEach(component => {
                const category = component.category || 'general';
                this.availableCategories.mcps.add(category);
            });
        }
        
        // Collect categories from templates (use language as category for language templates)
        if (this.componentsData.templates && Array.isArray(this.componentsData.templates)) {
            this.componentsData.templates.forEach(template => {
                if (template.subtype === 'language') {
                    this.availableCategories.templates.add(template.name);
                } else if (template.subtype === 'framework' && template.language) {
                    this.availableCategories.templates.add(template.language);
                }
            });
        }
    }

    displayCurrentFilter() {
        const grid = document.getElementById('unifiedGrid');
        if (!grid) return;

        // Set proper grid class based on current filter
        if (this.currentFilter === 'templates') {
            grid.className = 'unified-grid templates-mode';
        } else {
            grid.className = 'unified-grid components-mode';
        }

        // Update filter button counts
        this.updateFilterCounts();

        switch (this.currentFilter) {
            case 'templates':
                this.displayTemplates(grid);
                break;
            case 'agents':
            case 'commands':
            case 'mcps':
                this.displayComponents(grid, this.currentFilter);
                break;
            default:
                grid.innerHTML = '<div class="error">Unknown filter</div>';
        }
    }

    displayTemplates(grid) {
        if (!this.componentsData || !this.componentsData.templates) {
            grid.innerHTML = '<div class="loading">Loading templates...</div>';
            return;
        }

        // Update category sub-filters for templates
        this.updateCategorySubFilters();

        // Clear the grid
        grid.innerHTML = '';
        
        // Add the "Add New Template" card first
        const addTemplateCard = this.createAddTemplateCard();
        grid.appendChild(addTemplateCard);
        
        // Filter templates based on category selection
        let filteredTemplates = this.componentsData.templates;
        if (this.currentCategoryFilter !== 'all') {
            filteredTemplates = this.componentsData.templates.filter(template => {
                if (template.subtype === 'language') {
                    return template.name === this.currentCategoryFilter;
                } else if (template.subtype === 'framework') {
                    return template.language === this.currentCategoryFilter;
                }
                return false;
            });
        }
        
        // Create template cards from the filtered list
        filteredTemplates.forEach(template => {
            const templateCard = this.createTemplateCardFromJSON(template);
            grid.appendChild(templateCard);
        });
    }

    displayComponents(grid, type) {
        if (!this.componentsData) {
            grid.innerHTML = '<div class="loading">Loading components...</div>';
            return;
        }

        // Update category sub-filters in the unified-filter-bar
        this.updateCategorySubFilters();
        
        const allComponents = this.getFilteredComponents(type);
        
        // Calculate pagination
        const totalItems = allComponents.length + 1; // +1 for "Add New" card
        this.totalPages = Math.ceil(totalItems / this.itemsPerPage);
        
        // Get components for current page
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        
        let html = '';
        let itemsToShow = [];
        
        // Add "Add New" card to the beginning
        itemsToShow.push({ type: 'add-new', data: type });
        
        // Add components
        allComponents.forEach(component => {
            itemsToShow.push({ type: 'component', data: component });
        });
        
        // Get items for current page
        const pageItems = itemsToShow.slice(startIndex, endIndex);
        
        // Generate HTML for page items
        pageItems.forEach(item => {
            if (item.type === 'add-new') {
                html += this.createAddComponentCard(item.data);
            } else {
                html += this.generateComponentCard(item.data);
            }
        });
        
        // Create pagination controls
        const paginationHTML = this.createPaginationControls();
        
        grid.innerHTML = html || '<div class="no-data">No components available</div>';
        
        // Add pagination after the grid
        this.updatePagination(paginationHTML);
    }


    generateComponentCard(component) {
        // Generate install command - remove .md extension from path
        let componentPath = component.path || component.name;
        if (componentPath.endsWith('.md')) {
            componentPath = componentPath.replace(/\.md$/, '');
        }
        if (componentPath.endsWith('.json')) {
            componentPath = componentPath.replace(/\.json$/, '');
        }
        const installCommand = `npx claude-code-templates@latest --${component.type}=${componentPath} --yes`;
        
        const typeConfig = {
            agent: { icon: '🤖', color: '#ff6b6b' },
            command: { icon: '⚡', color: '#4ecdc4' },
            mcp: { icon: '🔌', color: '#45b7d1' }
        };
        
        const config = typeConfig[component.type];
        
        // Escape quotes and special characters for onclick attributes
        const escapedType = component.type.replace(/'/g, "\\'");
        const escapedName = (component.name || '').replace(/'/g, "\\'");
        const escapedPath = (component.path || component.name || '').replace(/'/g, "\\'");
        const escapedCategory = (component.category || 'general').replace(/'/g, "\\'");
        const escapedCommand = installCommand.replace(/'/g, "\\'");
        
        // Create category label (use "General" if no category)
        const categoryName = component.category || 'general';
        const categoryLabel = `<div class="category-label">${this.formatComponentName(categoryName)}</div>`;
        
        return `
            <div class="template-card" data-type="${component.type}">
                <div class="card-inner">
                    <div class="card-front">
                        ${categoryLabel}
                        <div class="framework-logo" style="color: ${config.color}">
                            <span class="component-icon">${config.icon}</span>
                        </div>
                        <h3 class="template-title">${this.formatComponentName(component.name)}</h3>
                        ${component.type === 'mcp' ? 
                            `<p class="template-description">${this.truncateDescription(component.description || 'MCP integration for enhanced development workflow', 80)}</p>` : 
                            `<p class="template-description">${this.getComponentDescription(component)}</p>`
                        }
                    </div>
                    <div class="card-back">
                        <div class="command-display">
                            <h3>Installation Command</h3>
                            <div class="command-code">${installCommand}</div>
                            <div class="action-buttons">
                                <button class="view-files-btn" onclick="showComponentDetails('${escapedType}', '${escapedName}', '${escapedPath}', '${escapedCategory}')">
                                    📁 View Details
                                </button>
                                <button class="copy-command-btn" onclick="copyToClipboard('${escapedCommand}')">
                                    📋 Copy Command
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    copyToClipboard(text) {
        // Use the global function from utils.js
        if (typeof window.copyToClipboard === 'function') {
            window.copyToClipboard(text);
        } else {
            copyToClipboard(text);
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            z-index: 10000;
            font-family: system-ui, -apple-system, sans-serif;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    formatComponentName(name) {
        return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    truncateDescription(description, maxLength = 80) {
        if (!description) return '';
        if (description.length <= maxLength) return description;
        return description.substring(0, maxLength).trim() + '...';
    }

    getComponentDescription(component) {
        let description = '';
        
        if (component.description) {
            description = component.description;
        } else if (component.content) {
            // Try to extract description from frontmatter
            const descMatch = component.content.match(/description:\s*(.+?)(?:\n|$)/);
            if (descMatch) {
                description = descMatch[1].trim().replace(/^["']|["']$/g, '');
            } else {
                // Use first paragraph if no frontmatter description
                const lines = component.content.split('\n');
                const firstParagraph = lines.find(line => line.trim() && !line.startsWith('---') && !line.startsWith('#'));
                if (firstParagraph) {
                    description = firstParagraph.trim();
                }
            }
        }
        
        if (!description) {
            description = `A ${component.type} component for Claude Code.`;
        }
        
        // Truncate description to max 120 characters for proper card display
        if (description.length > 120) {
            description = description.substring(0, 117) + '...';
        }
        
        return description;
    }

    // Update filter button counts
    updateFilterCounts() {
        if (!this.componentsData) return;
        
        const agentsCount = this.componentsData.agents ? this.componentsData.agents.length : 0;
        const commandsCount = this.componentsData.commands ? this.componentsData.commands.length : 0;
        const mcpsCount = this.componentsData.mcps ? this.componentsData.mcps.length : 0;
        const templatesCount = this.componentsData.templates ? this.componentsData.templates.length : 0;
        
        // Update each filter button with count
        const agentsBtn = document.querySelector('[data-filter="agents"]');
        const commandsBtn = document.querySelector('[data-filter="commands"]');
        const mcpsBtn = document.querySelector('[data-filter="mcps"]');
        const templatesBtn = document.querySelector('[data-filter="templates"]');
        
        if (agentsBtn) {
            agentsBtn.innerHTML = `🤖 Agents (${agentsCount})`;
        }
        if (commandsBtn) {
            commandsBtn.innerHTML = `⚡ Commands (${commandsCount})`;
        }
        if (mcpsBtn) {
            mcpsBtn.innerHTML = `🔌 MCPs (${mcpsCount})`;
        }
        if (templatesBtn) {
            templatesBtn.innerHTML = `📦 Templates (${templatesCount})`;
        }
    }

    // Create Add Component card
    createAddComponentCard(type) {
        const typeConfig = {
            agents: { 
                icon: '🤖', 
                name: 'Agent', 
                description: 'Create a new AI specialist agent',
                color: '#ff6b6b'
            },
            commands: { 
                icon: '⚡', 
                name: 'Command', 
                description: 'Add a custom slash command',
                color: '#4ecdc4'
            },
            mcps: { 
                icon: '🔌', 
                name: 'MCP', 
                description: 'Build a Model Context Protocol integration',
                color: '#45b7d1'
            }
        };
        
        const config = typeConfig[type];
        if (!config) return '';
        
        return `
            <div class="template-card add-template-card add-component-card" onclick="showComponentContributeModal('${type}')">
                <div class="card-inner">
                    <div class="card-front">
                        <div class="framework-logo" style="color: ${config.color}">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                            </svg>
                        </div>
                        <h3 class="template-title">Add New ${config.name}</h3>
                        <p class="template-description">${config.description}</p>
                    </div>
                </div>
            </div>
        `;
    }

    showError(message) {
        const grid = document.getElementById('unifiedGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="error-message">
                    <h3>Error</h3>
                    <p>${message}</p>
                    <button onclick="location.reload()" class="btn-primary">Retry</button>
                </div>
            `;
        }
    }

    // Get framework icon from mapping
    getFrameworkIcon(framework) {
        return this.FRAMEWORK_ICONS[framework] || this.FRAMEWORK_ICONS['default'];
    }

    // Create Add Template card
    createAddTemplateCard() {
        const card = document.createElement('div');
        card.className = 'template-card add-template-card';
        
        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    <div class="framework-logo">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                        </svg>
                    </div>
                    <h3 class="template-title">Add New Template</h3>
                    <p class="template-description">Contribute a new language or framework to the community</p>
                </div>
            </div>
        `;
        
        // Add click handler
        card.addEventListener('click', () => {
            showComponentContributeModal('templates');
        });
        
        return card;
    }

    // Create template card from JSON structure
    createTemplateCardFromJSON(template) {
        const card = document.createElement('div');
        card.className = 'template-card';
        
        // Determine the icon based on template name/type
        const icon = this.getFrameworkIcon(template.name);
        
        // Create the display name
        const displayName = template.subtype === 'framework' 
            ? `${template.language}/${template.name}`
            : template.name;
            
        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    <div class="framework-logo">
                        <i class="${icon} colored"></i>
                    </div>
                    <h3 class="template-title">${displayName}</h3>
                    <p class="template-description">${template.description}</p>
                </div>
                <div class="card-back">
                    <div class="command-display">
                        <h3>Installation Command</h3>
                        <div class="command-code">${template.installCommand}</div>
                        <div class="action-buttons">
                            <button class="view-files-btn" onclick="showTemplateDetails('${template.id}', '${template.name}', '${template.subtype}')">
                                📁 View Files
                            </button>
                            <button class="copy-command-btn" onclick="copyToClipboard('${template.installCommand}')">
                                📋 Copy Command
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Card flip is handled by global event listener in setupEventListeners
        
        return card;
    }

    // Create individual template card (legacy method, keep for compatibility)
    createTemplateCard(languageKey, languageData, frameworkKey, frameworkData) {
        const card = document.createElement('div');
        card.className = `template-card ${languageData.comingSoon ? 'coming-soon' : ''}`;
        
        const displayName = frameworkKey === 'none' ? 
            frameworkData.name : 
            `${languageData.name.split('/')[0]}/${frameworkData.name}`;
        
        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    ${languageData.comingSoon ? '<div class="coming-soon-badge">Coming Soon</div>' : ''}
                    <div class="framework-logo">
                        <i class="${frameworkData.icon} colored"></i>
                    </div>
                    <h3 class="template-title">${displayName}</h3>
                    <p class="template-description">${(languageData.description || '').substring(0, 120)}${(languageData.description || '').length > 120 ? '...' : ''}</p>
                </div>
                <div class="card-back">
                    <div class="command-display">
                        <h3>Installation Options</h3>
                        <div class="command-code">${frameworkData.command}</div>
                        <div class="action-buttons">
                            <button class="view-files-btn" onclick="showInstallationFiles('${languageKey}', '${frameworkKey}', '${displayName}')">
                                📁 View Files
                            </button>
                            <button class="copy-command-btn" onclick="copyToClipboard('${frameworkData.command}')">
                                📋 Copy Command
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add click handler for card flip (only if not coming soon)
        if (!languageData.comingSoon) {
            card.addEventListener('click', (e) => {
                // Don't flip if clicking on buttons
                if (!e.target.closest('button')) {
                    card.classList.toggle('flipped');
                }
            });
        }
        
        return card;
    }

    // Fetch templates configuration from GitHub
    async fetchTemplatesConfig() {
        const GITHUB_CONFIG = {
            owner: 'davila7',
            repo: 'claude-code-templates',
            branch: 'main',
            templatesPath: 'cli-tool/src/templates.js'
        };
        
        try {
            const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.templatesPath}?t=${Date.now()}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const templateFileContent = await response.text();
            this.templatesData = this.parseTemplatesConfig(templateFileContent);
            
            return this.templatesData;
        } catch (error) {
            console.error('Error fetching templates:', error);
            throw error;
        }
    }

    // Parse templates configuration
    parseTemplatesConfig(fileContent) {
        try {
            const configMatch = fileContent.match(/const TEMPLATES_CONFIG = ({[\s\S]*?});/);
            if (!configMatch) {
                throw new Error('TEMPLATES_CONFIG not found in file');
            }
            
            let configString = configMatch[1];
            configString = configString.replace(/'/g, '"');
            configString = configString.replace(/(\w+):/g, '"$1":');
            configString = configString.replace(/,(\s*[}\]])/g, '$1');
            
            return JSON.parse(configString);
        } catch (error) {
            console.error('Error parsing templates config:', error);
            return null;
        }
    }

    // Show contribute modal
    showContributeModal() {
        alert('Contribute modal would open here - this needs to be implemented with the full modal HTML from script.js');
    }
    
    // Create pagination controls
    createPaginationControls() {
        if (this.totalPages <= 1) return '';
        
        let paginationHTML = '<div class="pagination-container">';
        paginationHTML += '<div class="pagination">';
        
        // Previous button
        const prevDisabled = this.currentPage === 1 ? 'disabled' : '';
        paginationHTML += `<button class="pagination-btn prev-btn ${prevDisabled}" onclick="goToPage(${this.currentPage - 1})" ${prevDisabled ? 'disabled' : ''}>`;
        paginationHTML += '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
        paginationHTML += '</button>';
        
        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);
        
        if (startPage > 1) {
            paginationHTML += `<button class="pagination-btn page-btn" onclick="goToPage(1)">1</button>`;
            if (startPage > 2) {
                paginationHTML += '<span class="pagination-dots">...</span>';
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === this.currentPage ? 'active' : '';
            paginationHTML += `<button class="pagination-btn page-btn ${activeClass}" onclick="goToPage(${i})">${i}</button>`;
        }
        
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                paginationHTML += '<span class="pagination-dots">...</span>';
            }
            paginationHTML += `<button class="pagination-btn page-btn" onclick="goToPage(${this.totalPages})">${this.totalPages}</button>`;
        }
        
        // Next button
        const nextDisabled = this.currentPage === this.totalPages ? 'disabled' : '';
        paginationHTML += `<button class="pagination-btn next-btn ${nextDisabled}" onclick="goToPage(${this.currentPage + 1})" ${nextDisabled ? 'disabled' : ''}>`;
        paginationHTML += '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10.02 6L8.61 7.41 13.19 12l-4.58 4.59L10.02 18l6-6z"/></svg>';
        paginationHTML += '</button>';
        
        paginationHTML += '</div>';
        paginationHTML += `<div class="pagination-info">Page ${this.currentPage} of ${this.totalPages}</div>`;
        paginationHTML += '</div>';
        
        return paginationHTML;
    }
    
    // Navigate to specific page
    goToPage(page) {
        if (page < 1 || page > this.totalPages || page === this.currentPage) return;
        
        this.currentPage = page;
        this.displayCurrentFilter();
        
        // Scroll to top of content grid
        const contentGrid = document.getElementById('contentGrid');
        if (contentGrid) {
            contentGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    // Update pagination controls
    updatePagination(paginationHTML) {
        // Remove any existing pagination containers from the entire document
        const existingPaginations = document.querySelectorAll('.pagination-container');
        existingPaginations.forEach(pagination => pagination.remove());
        
        // Add new pagination if needed
        if (this.totalPages > 1 && paginationHTML) {
            const contentGrid = document.getElementById('contentGrid');
            if (contentGrid) {
                contentGrid.insertAdjacentHTML('afterend', paginationHTML);
            }
        }
    }
}

// Global function for component details is now handled by modal-helpers.js

// Global function for copying is now handled by utils.js

// Global function for setting filter (called from onclick)
function setUnifiedFilter(filter) {
    if (window.indexManager) {
        window.indexManager.setFilter(filter);
    }
}

// Global helper functions for template cards
function showInstallationFiles(languageKey, frameworkKey, displayName) {
    console.log('Show installation files for:', displayName);
    // For now, just show a simple alert - could be enhanced later with full modal
    alert(`Installation files for ${displayName} would be shown here.`);
}

// Global function for template details
function showTemplateDetails(templateId, templateName, subtype) {
    if (!window.indexManager || !window.indexManager.componentsData) {
        console.error('IndexManager or components data not available');
        return;
    }
    
    // Find the template in the data
    const template = window.indexManager.componentsData.templates.find(t => t.id === templateId);
    if (!template) {
        console.error('Template not found:', templateId);
        return;
    }
    
    // Create modal to show template files
    const modalHTML = `
        <div class="modal-overlay" onclick="closeComponentModal()">
            <div class="modal-content component-modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <div class="component-modal-title">
                        <span class="component-icon">📦</span>
                        <h3>${templateName} Template</h3>
                    </div>
                    <div class="component-type-badge" style="background-color: #f9a825;">TEMPLATE</div>
                    <button class="modal-close" onclick="closeComponentModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="component-details">
                        <div class="component-description">
                            ${template.description}
                        </div>
                        
                        <div class="installation-section">
                            <h4>📦 Installation</h4>
                            <div class="command-line">
                                <code>${template.installCommand}</code>
                                <button class="copy-btn" onclick="copyToClipboard('${template.installCommand}')">Copy</button>
                            </div>
                        </div>

                        <div class="component-content">
                            <h4>📁 Template Files (${template.files ? template.files.length : 0} files)</h4>
                            ${template.files && template.files.length > 0 ? `
                                <div class="template-files-list">
                                    ${template.files.map(file => `
                                        <div class="template-file-item">
                                            <span class="file-icon">📄</span>
                                            <span class="file-name">${file}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '<p>No files listed for this template.</p>'}
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <a href="https://github.com/davila7/claude-code-templates/tree/main/cli-tool/templates/${subtype === 'framework' ? `${template.language}/examples/${templateName}` : templateName}" target="_blank" class="github-folder-link">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.30.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        View on GitHub
                    </a>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if present
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Global function for setting category filter (called from onclick)
function setCategoryFilter(category) {
    if (window.indexManager) {
        window.indexManager.setCategoryFilter(category);
    }
}

// Show component contribute modal (copied from script.js)
function showComponentContributeModal(type) {
    const typeConfig = {
        agents: { 
            name: 'Agent', 
            description: 'AI specialist that handles specific development tasks',
            example: 'python-testing-specialist',
            structure: '- Agent metadata (name, description, color)\n- Core expertise areas\n- When to use guidelines\n- Code examples and patterns'
        },
        commands: { 
            name: 'Command', 
            description: 'Custom slash command for Claude Code',
            example: 'optimize-bundle',
            structure: '- Command description and usage\n- Task breakdown\n- Process steps\n- Best practices and examples'
        },
        mcps: { 
            name: 'MCP', 
            description: 'Model Context Protocol integration',
            example: 'redis-integration',
            structure: '- MCP server configuration\n- Connection parameters\n- Environment variables\n- Usage examples'
        },
        templates: { 
            name: 'Template', 
            description: 'Project template with language or framework setup',
            example: 'python or django-app',
            structure: 'For Languages: Create folder with base files\nFor Frameworks: Add to examples/ subfolder with specific setup'
        }
    };
    
    const config = typeConfig[type];
    
    let modalHTML = '';
    
    if (type === 'templates') {
        // Special modal for templates
        modalHTML = `
            <div class="modal-overlay" onclick="closeComponentModal()">
                <div class="modal-content contribute-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>📦 Contribute a New Template</h3>
                        <button class="modal-close" onclick="closeComponentModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="contribute-intro">
                            <p>Help expand Claude Code by contributing a new project template! Choose between contributing a new <strong>Language</strong> or a <strong>Framework</strong>:</p>
                        </div>
                        
                        <div class="template-types">
                            <div class="template-type-section">
                                <h3>🏗️ Contributing a New Language</h3>
                                <p>Add support for a completely new programming language (e.g., Kotlin, PHP, Swift)</p>
                                
                                <div class="contribute-steps">
                                    <div class="contribute-step">
                                        <div class="step-number-contrib">1</div>
                                        <div class="step-content-contrib">
                                            <h4>Create Language Folder</h4>
                                            <p>Create a new folder in <code>cli-tool/templates/</code> with your language name:</p>
                                            <div class="step-command">
                                                <code>mkdir cli-tool/templates/kotlin</code>
                                                <button class="copy-btn" onclick="copyToClipboard('mkdir cli-tool/templates/kotlin')">Copy</button>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="contribute-step">
                                        <div class="step-number-contrib">2</div>
                                        <div class="step-content-contrib">
                                            <h4>Add Base Files</h4>
                                            <p>Add the essential files for your language. <strong>Required Claude Code files:</strong></p>
                                            <div class="claude-files-info">
                                                <ul>
                                                    <li><code>CLAUDE.md</code> - Project documentation and Claude Code instructions</li>
                                                    <li><code>.mcp.json</code> - MCP server configuration if needed</li>
                                                    <li><code>.claude/</code> - Claude Code configuration folder with agents, commands, and settings</li>
                                                </ul>
                                            </div>
                                            <div class="component-structure">
                                                <strong>Required structure:</strong>
                                                <pre>cli-tool/templates/kotlin/
├── CLAUDE.md           # Claude Code configuration
├── .mcp.json          # MCP server configuration
└── .claude/           # Claude Code settings
    ├── agents/        # Language-specific agents
    ├── commands/      # Language-specific commands
    └── settings.json  # Claude settings
                                        </pre>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="contribute-step">
                                        <div class="step-number-contrib">3</div>
                                        <div class="step-content-contrib">
                                            <h4>Create Examples Folder (Optional)</h4>
                                            <p>If your language has popular frameworks, create an examples folder:</p>
                                            <div class="step-command">
                                                <code>mkdir cli-tool/templates/kotlin/examples</code>
                                                <button class="copy-btn" onclick="copyToClipboard('mkdir cli-tool/templates/kotlin/examples')">Copy</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="template-type-section">
                                <h3>⚡ Contributing a Framework</h3>
                                <p>Add a framework variation to an existing language (e.g., Spring Boot for Java)</p>
                                
                                <div class="contribute-steps">
                                    <div class="contribute-step">
                                        <div class="step-number-contrib">1</div>
                                        <div class="step-content-contrib">
                                            <h4>Choose Existing Language</h4>
                                            <p>Navigate to an existing language's examples folder:</p>
                                            <div class="step-command">
                                                <code>cd cli-tool/templates/javascript-typescript/examples</code>
                                                <button class="copy-btn" onclick="copyToClipboard('cd cli-tool/templates/javascript-typescript/examples')">Copy</button>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="contribute-step">
                                        <div class="step-number-contrib">2</div>
                                        <div class="step-content-contrib">
                                            <h4>Create Framework Folder</h4>
                                            <p>Create a folder with your framework name:</p>
                                            <div class="step-command">
                                                <code>mkdir nextjs-app</code>
                                                <button class="copy-btn" onclick="copyToClipboard('mkdir nextjs-app')">Copy</button>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="contribute-step">
                                        <div class="step-number-contrib">3</div>
                                        <div class="step-content-contrib">
                                            <h4>Add Framework Files</h4>
                                            <p>Add all necessary files for your framework setup. <strong>Required Claude Code files:</strong></p>
                                            <div class="claude-files-info">
                                                <ul>
                                                    <li><code>CLAUDE.md</code> - Framework documentation and Claude Code instructions</li>
                                                    <li><code>.mcp.json</code> - MCP server configuration for framework-specific tools</li>
                                                    <li><code>.claude/</code> - Claude Code configuration folder with framework-specific agents and commands</li>
                                                </ul>
                                            </div>
                                            <div class="component-structure">
                                                <strong>Required structure:</strong>
                                                <pre>nextjs-app/
├── CLAUDE.md           # Claude Code configuration
├── .mcp.json          # MCP server configuration
└── .claude/           # Claude Code settings
    ├── agents/        # Framework-specific agents
    ├── commands/      # Framework-specific commands
    └── settings.json  # Claude settings
                                        </pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="contribute-step">
                            <div class="step-number-contrib">4</div>
                            <div class="step-content-contrib">
                                <h4>Test Your Template</h4>
                                <p>Test your template installation:</p>
                                <div class="step-command">
                                    <code>npx claude-code-templates@latest --template=your-template-name --yes</code>
                                    <button class="copy-btn" onclick="copyToClipboard('npx claude-code-templates@latest --template=your-template-name --yes')">Copy</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="contribute-step">
                            <div class="step-number-contrib">5</div>
                            <div class="step-content-contrib">
                                <h4>Submit Pull Request</h4>
                                <p>Submit your template contribution:</p>
                                <div class="step-command">
                                    <code>git add cli-tool/templates/</code>
                                    <button class="copy-btn" onclick="copyToClipboard('git add cli-tool/templates/')">Copy</button>
                                </div>
                                <div class="step-command">
                                    <code>git commit -m "feat: Add [language/framework] template"</code>
                                    <button class="copy-btn" onclick="copyToClipboard('git commit -m \\"feat: Add [language/framework] template\\"')">Copy</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="contribute-footer">
                            <div class="help-section">
                                <h4>Need Help?</h4>
                                <p>Check <a href="https://github.com/davila7/claude-code-templates/tree/main/cli-tool/templates" target="_blank">existing templates</a> for examples or open an issue on GitHub for guidance.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Default modal for other component types
        modalHTML = `
            <div class="modal-overlay" onclick="closeComponentModal()">
                <div class="modal-content contribute-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>📝 Contribute a New ${config.name}</h3>
                        <button class="modal-close" onclick="closeComponentModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="contribute-intro">
                            <p>Help expand Claude Code by contributing a new ${config.name.toLowerCase()}! Follow these steps:</p>
                        </div>
                        
                        <div class="contribute-steps">
                            <div class="contribute-step">
                                <div class="step-number-contrib">1</div>
                                <div class="step-content-contrib">
                                    <h4>Create Your ${config.name}</h4>
                                    <p>Add your ${config.name.toLowerCase()} to: <code>cli-tool/components/${type}/</code></p>
                                    <div class="component-structure">
                                        <strong>Structure should include:</strong>
                                        <pre>${config.structure}</pre>
                                    </div>
                                    <div class="step-command">
                                        <strong>Example filename:</strong> <code>${config.example}.${type === 'mcps' ? 'json' : 'md'}</code>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="contribute-step">
                                <div class="step-number-contrib">2</div>
                                <div class="step-content-contrib">
                                    <h4>Follow the Pattern</h4>
                                    <p>Check existing ${type} in the repository to understand the structure and conventions.</p>
                                    <div class="step-command">
                                        <a href="https://github.com/davila7/claude-code-templates/tree/main/cli-tool/components/${type}" target="_blank" class="github-folder-link">
                                            📁 View existing ${type}
                                        </a>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="contribute-step">
                                <div class="step-number-contrib">3</div>
                                <div class="step-content-contrib">
                                    <h4>Test Your Component</h4>
                                    <p>Ensure your ${config.name.toLowerCase()} works correctly with Claude Code.</p>
                                    <div class="step-command">
                                        <code>cd cli-tool && npm test</code>
                                        <button class="copy-btn" onclick="copyToClipboard('cd cli-tool && npm test')">Copy</button>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="contribute-step">
                                <div class="step-number-contrib">4</div>
                                <div class="step-content-contrib">
                                    <h4>Submit Pull Request</h4>
                                    <p>Submit your contribution with proper documentation:</p>
                                    <div class="step-command">
                                        <code>git add cli-tool/components/${type}/${config.example}.${type === 'mcps' ? 'json' : 'md'}</code>
                                        <button class="copy-btn" onclick="copyToClipboard('git add cli-tool/components/${type}/${config.example}.${type === 'mcps' ? 'json' : 'md'}')">Copy</button>
                                    </div>
                                    <div class="step-command">
                                        <code>git commit -m "feat: Add ${config.example} ${config.name.toLowerCase()}"</code>
                                        <button class="copy-btn" onclick="copyToClipboard('git commit -m \\"feat: Add ${config.example} ${config.name.toLowerCase()}\\"')">Copy</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="contribute-footer">
                            <div class="help-section">
                                <h4>Need Help?</h4>
                                <p>Check existing ${type} for examples or open an issue on GitHub for guidance.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Remove existing modal if present
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add event listener for ESC key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeComponentModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// Global functions for templates functionality
function showInstallationFiles(languageKey, frameworkKey, displayName) {
    alert(`Installation files for ${displayName} would be shown here`);
}

// Close modal (from script.js)
function closeModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.remove();
    }
}

// Close component modal
function closeComponentModal() {
    const modalOverlay = document.querySelector('.modal-overlay');
    if (modalOverlay) {
        modalOverlay.remove();
    }
}

// Global pagination function (called from onclick)
function goToPage(page) {
    if (window.indexManager) {
        window.indexManager.goToPage(page);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.indexManager = new IndexPageManager();
    window.indexManager.init();
});