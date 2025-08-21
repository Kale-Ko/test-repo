class CollaborativeEditor {
    constructor() {
        this.ws = null;
        this.userId = null;
        this.userColor = null;
        this.documentVersion = 0;
        this.isConnected = false;
        this.users = new Map();
        this.lastCursorPosition = 0;
        
        this.editor = document.getElementById('markdown-editor');
        this.preview = document.getElementById('markdown-preview');
        this.connectionStatus = document.getElementById('connection-status');
        this.activeUsers = document.getElementById('active-users');
        this.cursorsOverlay = document.getElementById('cursors-overlay');
        
        this.setupEventListeners();
        this.connect();
    }
    
    setupEventListeners() {
        // Text change events
        this.editor.addEventListener('input', (e) => {
            this.handleTextChange(e);
            this.updatePreview();
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
        const wsUrl = `${protocol}//${window.location.host}`;
        
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
    
    handleTextChange(event) {
        if (!this.isConnected) return;
        
        const currentContent = this.editor.value;
        const cursorPos = this.editor.selectionStart;
        
        // Create operation based on input type
        let operation = null;
        
        if (event.inputType === 'insertText' || event.inputType === 'insertCompositionText') {
            operation = {
                type: 'insert',
                position: cursorPos - event.data.length,
                content: event.data,
                version: this.documentVersion
            };
        } else if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') {
            // For deletions, we need to figure out what was deleted
            // This is a simplified approach
            operation = {
                type: 'delete',
                position: cursorPos,
                content: event.data || 'x', // Simplified - in real implementation, track previous content
                version: this.documentVersion
            };
        } else if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
            operation = {
                type: 'insert',
                position: cursorPos - 1,
                content: '\n',
                version: this.documentVersion
            };
        }
        
        if (operation && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'operation',
                operation: operation
            }));
        }
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