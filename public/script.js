class CollaborativeEditor {
    constructor() {
        this.ws = null;
        this.userId = null;
        this.userColor = null;
        this.documentVersion = 0;
        this.isConnected = false;
        this.users = new Map();
        this.lastCursorPosition = 0;
        this.documentUuid = null;
        this.user = null;
        
        // Track previous state for accurate operation detection
        this.previousContent = '';
        this.previousSelectionStart = 0;
        this.previousSelectionEnd = 0;
        
        this.editor = document.getElementById('markdown-editor');
        this.preview = document.getElementById('markdown-preview');
        this.connectionStatus = document.getElementById('connection-status');
        this.activeUsers = document.getElementById('active-users');
        this.cursorsOverlay = document.getElementById('cursors-overlay');
        
        // Check authentication and document access
        this.checkAuthAndDocument();
    }
    
    checkAuthAndDocument() {
        // Check if user is logged in
        this.user = JSON.parse(localStorage.getItem('user'));
        if (!this.user) {
            this.showAuthRequired();
            return;
        }
        
        // Get document UUID from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.documentUuid = urlParams.get('doc');
        
        if (!this.documentUuid) {
            window.location.href = 'dashboard.html';
            return;
        }
        
        // Verify document access
        this.verifyDocumentAccess();
    }
    
    async verifyDocumentAccess() {
        try {
            const response = await fetch(`/api/documents/${this.documentUuid}/access?user=${this.user.id}`);
            if (response.ok) {
                // User has access, proceed with editor setup
                this.setupEventListeners();
                this.connect();
            } else {
                this.showAccessDenied();
            }
        } catch (error) {
            console.error('Error verifying document access:', error);
            this.showAccessDenied();
        }
    }
    
    showAuthRequired() {
        document.getElementById('auth-check').style.display = 'flex';
    }
    
    showAccessDenied() {
        const authCheck = document.getElementById('auth-check');
        authCheck.style.display = 'flex';
        authCheck.innerHTML = `
            <div class="auth-message">
                <h3>Access Denied</h3>
                <p>You don't have permission to access this document.</p>
                <a href="dashboard.html" class="dashboard-link">Go to Dashboard</a>
            </div>
        `;
    }
    
    setupEventListeners() {
        // Text change events
        this.editor.addEventListener('input', (e) => {
            this.handleTextChange(e);
            this.updatePreview();
        });
        
        // Capture state before changes for accurate operation detection
        this.editor.addEventListener('beforeinput', (e) => {
            this.captureEditorState();
        });
        
        // Cursor movement events
        this.editor.addEventListener('selectionchange', () => {
            this.handleCursorChange();
        });
        
        this.editor.addEventListener('keyup', () => {
            this.handleCursorChange();
        });
        
        this.editor.addEventListener('mouseup', () => {
            this.handleCursorChange();
        });
        
        // Window beforeunload to cleanup
        window.addEventListener('beforeunload', () => {
            if (this.ws) {
                this.ws.close();
            }
        });
    }
    
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}?doc=${this.documentUuid}&user=${this.user.id}`;
        
        this.updateConnectionStatus('connecting');
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('Connected to WebSocket server');
                this.isConnected = true;
                this.updateConnectionStatus('connected');
            };
            
            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from WebSocket server');
                this.isConnected = false;
                this.updateConnectionStatus('disconnected');
                
                // Attempt to reconnect after 3 seconds
                setTimeout(() => this.connect(), 3000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('disconnected');
            };
            
        } catch (error) {
            console.error('Failed to connect:', error);
            this.updateConnectionStatus('disconnected');
            setTimeout(() => this.connect(), 3000);
        }
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'init':
                this.userId = message.userId;
                this.userColor = message.userColor;
                this.documentVersion = message.version;
                this.editor.value = message.content;
                this.updatePreview();
                
                // Initialize state tracking
                this.captureEditorState();
                
                // Initialize other users
                message.users.forEach(user => {
                    if (user.id !== this.userId) {
                        this.users.set(user.id, user);
                    }
                });
                this.updateActiveUsers();
                break;
                
            case 'operation':
                this.applyRemoteOperation(message.operation);
                this.updatePreview();
                // Update state tracking after remote changes
                this.captureEditorState();
                break;
                
            case 'cursor':
                if (message.userId !== this.userId) {
                    this.updateUserCursor(message.userId, message.position);
                }
                break;
                
            case 'user-joined':
                this.users.set(message.user.id, message.user);
                this.updateActiveUsers();
                console.log(`User ${message.user.id} joined`);
                break;
                
            case 'user-left':
                this.users.delete(message.userId);
                this.updateActiveUsers();
                this.removeUserCursor(message.userId);
                console.log(`User ${message.userId} left`);
                break;
        }
    }
    
    captureEditorState() {
        this.previousContent = this.editor.value;
        this.previousSelectionStart = this.editor.selectionStart;
        this.previousSelectionEnd = this.editor.selectionEnd;
    }
    
    handleTextChange(event) {
        if (!this.isConnected) return;
        
        const currentContent = this.editor.value;
        const cursorPos = this.editor.selectionStart;
        
        // Create operation based on comparing previous and current state
        let operation = null;
        
        if (event.inputType === 'insertText' || event.inputType === 'insertCompositionText') {
            operation = {
                type: 'insert',
                position: cursorPos - event.data.length,
                content: event.data,
                version: this.documentVersion
            };
        } else if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') {
            // Calculate what was actually deleted by comparing before/after states
            const deletedContent = this.calculateDeletedContent(this.previousContent, currentContent, this.previousSelectionStart, this.previousSelectionEnd);
            
            if (deletedContent.content.length > 0) {
                operation = {
                    type: 'delete',
                    position: deletedContent.position,
                    content: deletedContent.content,
                    version: this.documentVersion
                };
            }
        } else if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
            operation = {
                type: 'insert',
                position: cursorPos - 1,
                content: '\n',
                version: this.documentVersion
            };
        } else if (event.inputType === 'insertFromPaste') {
            // Handle paste operations
            const insertedContent = this.calculateInsertedContent(this.previousContent, currentContent, this.previousSelectionStart);
            
            if (insertedContent.content.length > 0) {
                operation = {
                    type: 'insert',
                    position: insertedContent.position,
                    content: insertedContent.content,
                    version: this.documentVersion
                };
            }
        } else if (event.inputType === 'insertReplacementText' || event.inputType === 'deleteByDrag' || event.inputType === 'deleteByCut') {
            // Handle replacement operations (select + type/paste)
            const changes = this.calculateReplacementChanges(this.previousContent, currentContent, this.previousSelectionStart, this.previousSelectionEnd);
            
            if (changes.deletedContent.length > 0) {
                // Send delete operation first
                const deleteOp = {
                    type: 'delete',
                    position: changes.deletePosition,
                    content: changes.deletedContent,
                    version: this.documentVersion
                };
                
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'operation',
                        operation: deleteOp
                    }));
                }
            }
            
            if (changes.insertedContent.length > 0) {
                // Send insert operation
                operation = {
                    type: 'insert',
                    position: changes.insertPosition,
                    content: changes.insertedContent,
                    version: this.documentVersion
                };
            }
        }
        
        if (operation && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'operation',
                operation: operation
            }));
        }
    }
    
    calculateDeletedContent(previousContent, currentContent, selectionStart, selectionEnd) {
        // If there was a selection, the deleted content is the selected text
        if (selectionStart !== selectionEnd) {
            return {
                position: selectionStart,
                content: previousContent.substring(selectionStart, selectionEnd)
            };
        }
        
        // Find the difference between previous and current content
        let deletePosition = -1;
        let deletedContent = '';
        
        // Find where the content differs
        for (let i = 0; i < Math.max(previousContent.length, currentContent.length); i++) {
            if (i >= currentContent.length || i >= previousContent.length || previousContent[i] !== currentContent[i]) {
                deletePosition = i;
                break;
            }
        }
        
        if (deletePosition !== -1) {
            // Calculate how much was deleted
            const lengthDiff = previousContent.length - currentContent.length;
            if (lengthDiff > 0) {
                deletedContent = previousContent.substring(deletePosition, deletePosition + lengthDiff);
            }
        }
        
        return {
            position: deletePosition !== -1 ? deletePosition : selectionStart,
            content: deletedContent
        };
    }
    
    calculateInsertedContent(previousContent, currentContent, selectionStart) {
        // Find where content was inserted
        let insertPosition = selectionStart;
        let insertedContent = '';
        
        const lengthDiff = currentContent.length - previousContent.length;
        if (lengthDiff > 0) {
            insertedContent = currentContent.substring(selectionStart, selectionStart + lengthDiff);
        }
        
        return {
            position: insertPosition,
            content: insertedContent
        };
    }
    
    calculateReplacementChanges(previousContent, currentContent, selectionStart, selectionEnd) {
        const deletedContent = selectionStart !== selectionEnd ? 
            previousContent.substring(selectionStart, selectionEnd) : '';
        
        const insertedContent = currentContent.substring(selectionStart, 
            selectionStart + (currentContent.length - previousContent.length + deletedContent.length));
        
        return {
            deletePosition: selectionStart,
            deletedContent: deletedContent,
            insertPosition: selectionStart,
            insertedContent: insertedContent
        };
    }
    
    handleCursorChange() {
        const cursorPos = this.editor.selectionStart;
        
        if (cursorPos !== this.lastCursorPosition && this.isConnected) {
            this.lastCursorPosition = cursorPos;
            
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'cursor',
                    position: cursorPos
                }));
            }
        }
    }
    
    applyRemoteOperation(operation) {
        const currentPos = this.editor.selectionStart;
        const currentContent = this.editor.value;
        
        let newContent = currentContent;
        
        if (operation.type === 'insert') {
            newContent = currentContent.slice(0, operation.position) + 
                       operation.content + 
                       currentContent.slice(operation.position);
        } else if (operation.type === 'delete') {
            newContent = currentContent.slice(0, operation.position) + 
                        currentContent.slice(operation.position + operation.content.length);
        }
        
        // Update editor content
        this.editor.value = newContent;
        
        // Adjust cursor position if needed
        let newCursorPos = currentPos;
        if (operation.type === 'insert' && operation.position <= currentPos) {
            newCursorPos += operation.content.length;
        } else if (operation.type === 'delete' && operation.position < currentPos) {
            newCursorPos -= Math.min(operation.content.length, currentPos - operation.position);
        }
        
        this.editor.setSelectionRange(newCursorPos, newCursorPos);
        this.documentVersion = operation.version;
    }
    
    updatePreview() {
        const markdownContent = this.editor.value;
        this.preview.innerHTML = marked.parse(markdownContent);
    }
    
    updateConnectionStatus(status) {
        this.connectionStatus.className = `status-${status}`;
        
        switch (status) {
            case 'connected':
                this.connectionStatus.textContent = '🟢 Connected';
                break;
            case 'connecting':
                this.connectionStatus.textContent = '🟡 Connecting...';
                break;
            case 'disconnected':
                this.connectionStatus.textContent = '🔴 Disconnected';
                break;
        }
    }
    
    updateActiveUsers() {
        this.activeUsers.innerHTML = '';
        
        // Add current user
        const currentUserDiv = document.createElement('div');
        currentUserDiv.className = 'user-indicator';
        currentUserDiv.style.backgroundColor = this.userColor;
        currentUserDiv.textContent = 'You';
        currentUserDiv.title = 'You';
        this.activeUsers.appendChild(currentUserDiv);
        
        // Add other users
        this.users.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-indicator';
            userDiv.style.backgroundColor = user.color;
            userDiv.textContent = user.id.slice(0, 2).toUpperCase();
            userDiv.title = `User ${user.id}`;
            this.activeUsers.appendChild(userDiv);
        });
    }
    
    updateUserCursor(userId, position) {
        const user = this.users.get(userId);
        if (!user) return;
        
        // Remove existing cursor
        this.removeUserCursor(userId);
        
        // Calculate cursor position in pixels
        const textContent = this.editor.value.substring(0, position);
        const lines = textContent.split('\n');
        const lineHeight = 22; // Approximate line height
        const charWidth = 8; // Approximate character width
        
        const lineNumber = lines.length - 1;
        const columnNumber = lines[lines.length - 1].length;
        
        const top = lineNumber * lineHeight + 20; // 20px for padding
        const left = columnNumber * charWidth + 20; // 20px for padding
        
        // Create cursor element
        const cursor = document.createElement('div');
        cursor.className = 'user-cursor';
        cursor.id = `cursor-${userId}`;
        cursor.style.top = `${top}px`;
        cursor.style.left = `${left}px`;
        cursor.style.height = `${lineHeight}px`;
        cursor.style.color = user.color;
        cursor.setAttribute('data-user', user.id.slice(0, 8));
        
        this.cursorsOverlay.appendChild(cursor);
        
        // Update user cursor position
        user.cursor = position;
    }
    
    removeUserCursor(userId) {
        const existingCursor = document.getElementById(`cursor-${userId}`);
        if (existingCursor) {
            existingCursor.remove();
        }
    }
}

// Initialize the collaborative editor when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CollaborativeEditor();
});