class Dashboard {
    constructor() {
        this.user = JSON.parse(localStorage.getItem('user'));
        this.documents = [];
        
        if (!this.user) {
            window.location.href = 'login.html';
            return;
        }
        
        this.init();
    }
    
    init() {
        // Display user info
        document.getElementById('username-display').textContent = `@${this.user.username}`;
        
        // Setup event listeners
        document.getElementById('create-document-form').addEventListener('submit', (e) => {
            this.handleCreateDocument(e);
        });
        
        // Load documents
        this.loadDocuments();
    }
    
    async handleCreateDocument(e) {
        e.preventDefault();
        
        const title = document.getElementById('document-title').value.trim();
        const createBtn = document.getElementById('create-btn');
        const messageContainer = document.getElementById('create-message-container');
        
        if (!title) {
            messageContainer.innerHTML = '<div class="error-message">Please enter a document title</div>';
            return;
        }
        
        // Disable form
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
        messageContainer.innerHTML = '';
        
        try {
            const response = await fetch('/api/documents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    title: title,
                    userId: this.user.id
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                messageContainer.innerHTML = '<div class="success-message">Document created successfully!</div>';
                document.getElementById('document-title').value = '';
                
                // Reload documents
                this.loadDocuments();
                
                // Clear success message after a delay
                setTimeout(() => {
                    messageContainer.innerHTML = '';
                }, 3000);
            } else {
                messageContainer.innerHTML = `<div class="error-message">${data.error || 'Failed to create document'}</div>`;
            }
        } catch (error) {
            messageContainer.innerHTML = '<div class="error-message">Network error. Please try again.</div>';
        } finally {
            createBtn.disabled = false;
            createBtn.textContent = 'Create Document';
        }
    }
    
    async loadDocuments() {
        const container = document.getElementById('documents-container');
        container.innerHTML = '<div class="loading">Loading your documents...</div>';
        
        try {
            const response = await fetch(`/api/documents?user=${this.user.id}`);
            const data = await response.json();
            
            if (response.ok) {
                this.documents = data.documents;
                this.renderDocuments();
            } else {
                container.innerHTML = '<div class="error-message">Failed to load documents</div>';
            }
        } catch (error) {
            container.innerHTML = '<div class="error-message">Network error. Please try again.</div>';
        }
    }
    
    renderDocuments() {
        const container = document.getElementById('documents-container');
        
        if (this.documents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No documents yet</h3>
                    <p>Create your first collaborative document to get started!</p>
                </div>
            `;
            return;
        }
        
        const documentsGrid = document.createElement('div');
        documentsGrid.className = 'documents-grid';
        
        this.documents.forEach(doc => {
            const card = this.createDocumentCard(doc);
            documentsGrid.appendChild(card);
        });
        
        container.innerHTML = '';
        container.appendChild(documentsGrid);
    }
    
    createDocumentCard(doc) {
        const card = document.createElement('div');
        card.className = 'document-card';
        
        const createdDate = new Date(doc.created_at).toLocaleDateString();
        const updatedDate = new Date(doc.updated_at).toLocaleDateString();
        const isOwner = doc.permission === 'owner';
        
        card.innerHTML = `
            <div class="document-title">${this.escapeHtml(doc.title)}</div>
            <div class="document-meta">
                <div>Created: ${createdDate}</div>
                <div>Updated: ${updatedDate}</div>
                <div>Owner: ${this.escapeHtml(doc.owner_username)}</div>
                <div>Permission: ${doc.permission}</div>
            </div>
            <div class="document-actions">
                <button class="action-btn edit-btn" onclick="dashboard.openDocument('${doc.uuid}')">
                    Open Editor
                </button>
                ${isOwner ? `<button class="action-btn share-btn" onclick="dashboard.shareDocument('${doc.uuid}', '${this.escapeHtml(doc.title)}')">
                    Share
                </button>` : ''}
                <button class="action-btn copy-btn" onclick="dashboard.copyDocumentUrl('${doc.uuid}')">
                    Copy URL
                </button>
            </div>
        `;
        
        return card;
    }
    
    openDocument(uuid) {
        window.location.href = `editor.html?doc=${uuid}`;
    }
    
    shareDocument(uuid, title) {
        const modal = document.getElementById('share-modal');
        const urlInput = document.getElementById('share-url-input');
        const messageContainer = document.getElementById('share-message-container');
        
        // Clear previous messages
        messageContainer.innerHTML = '';
        
        // Set the share URL
        const shareUrl = `${window.location.origin}/editor.html?doc=${uuid}`;
        urlInput.value = shareUrl;
        
        // Show modal
        modal.style.display = 'block';
    }
    
    async copyDocumentUrl(uuid) {
        const url = `${window.location.origin}/editor.html?doc=${uuid}`;
        
        try {
            await navigator.clipboard.writeText(url);
            
            // Show temporary success message
            const messageContainer = document.getElementById('create-message-container');
            messageContainer.innerHTML = '<div class="success-message">Document URL copied to clipboard!</div>';
            
            setTimeout(() => {
                messageContainer.innerHTML = '';
            }, 3000);
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            const messageContainer = document.getElementById('create-message-container');
            messageContainer.innerHTML = '<div class="success-message">Document URL copied to clipboard!</div>';
            
            setTimeout(() => {
                messageContainer.innerHTML = '';
            }, 3000);
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

function closeShareModal() {
    document.getElementById('share-modal').style.display = 'none';
}

async function copyShareUrl() {
    const urlInput = document.getElementById('share-url-input');
    const messageContainer = document.getElementById('share-message-container');
    
    try {
        await navigator.clipboard.writeText(urlInput.value);
        messageContainer.innerHTML = '<div class="success-message">URL copied to clipboard!</div>';
    } catch (error) {
        // Fallback for older browsers
        urlInput.select();
        document.execCommand('copy');
        messageContainer.innerHTML = '<div class="success-message">URL copied to clipboard!</div>';
    }
    
    setTimeout(() => {
        messageContainer.innerHTML = '';
    }, 3000);
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('share-modal');
    if (e.target === modal) {
        closeShareModal();
    }
});

// Initialize dashboard
const dashboard = new Dashboard();