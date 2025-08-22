const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const Database = require('./database');

// Initialize database
const db = new Database();

// Store active documents and their WebSocket connections
const activeDocuments = new Map();

// Helper function to get document from activeDocuments
function getOrCreateDocument(documentUuid) {
    if (!activeDocuments.has(documentUuid)) {
        activeDocuments.set(documentUuid, {
            content: '',
            version: 0,
            users: new Map()
        });
    }
    return activeDocuments.get(documentUuid);
}

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname, method);
    return;
  }

  // Static file serving
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  
  // Get file extension
  const ext = path.extname(filePath);
  let contentType = 'text/html';
  
  switch (ext) {
    case '.css':
      contentType = 'text/css';
      break;
    case '.js':
      contentType = 'application/javascript';
      break;
    case '.json':
      contentType = 'application/json';
      break;
  }
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// API request handler
function handleApiRequest(req, res, pathname, method) {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      const data = body ? JSON.parse(body) : {};
      
      // Authentication endpoints
      if (pathname === '/api/auth/signup' && method === 'POST') {
        await handleSignup(req, res, data);
      } else if (pathname === '/api/auth/login' && method === 'POST') {
        await handleLogin(req, res, data);
      }
      // Document endpoints
      else if (pathname === '/api/documents' && method === 'GET') {
        await handleGetDocuments(req, res);
      } else if (pathname === '/api/documents' && method === 'POST') {
        await handleCreateDocument(req, res, data);
      } else if (pathname.match(/^\/api\/documents\/([^\/]+)\/access$/) && method === 'GET') {
        const documentUuid = pathname.match(/^\/api\/documents\/([^\/]+)\/access$/)[1];
        await handleDocumentAccess(req, res, documentUuid);
      }
      // Default 404
      else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }
    } catch (error) {
      console.error('API Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}

// Authentication handlers
async function handleSignup(req, res, data) {
  try {
    const { username, password } = data;
    
    if (!username || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username and password required' }));
      return;
    }
    
    if (password.length < 6) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Password must be at least 6 characters' }));
      return;
    }
    
    const user = await db.createUser(username, password);
    
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      message: 'User created successfully',
      user: { id: user.id, username: user.username }
    }));
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username already exists' }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create user' }));
    }
  }
}

async function handleLogin(req, res, data) {
  try {
    const { username, password } = data;
    
    if (!username || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username and password required' }));
      return;
    }
    
    const user = await db.authenticateUser(username, password);
    
    if (user) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        message: 'Login successful',
        user: { id: user.id, username: user.username }
      }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid username or password' }));
    }
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Login failed' }));
  }
}

// Document handlers
async function handleGetDocuments(req, res) {
  try {
    // Get user ID from query params (simple auth for demo)
    const parsedUrl = url.parse(req.url, true);
    const userId = parsedUrl.query.user;
    
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Authentication required' }));
      return;
    }
    
    const documents = await db.getUserDocuments(parseInt(userId));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ documents }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch documents' }));
  }
}

async function handleCreateDocument(req, res, data) {
  try {
    const { title, userId } = data;
    
    if (!title || !userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Title and user ID required' }));
      return;
    }
    
    const documentUuid = uuidv4();
    const document = await db.createDocument(title, userId, documentUuid);
    
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      message: 'Document created successfully',
      document: document
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to create document' }));
  }
}

async function handleDocumentAccess(req, res, documentUuid) {
  try {
    const parsedUrl = url.parse(req.url, true);
    const userId = parsedUrl.query.user;
    
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Authentication required' }));
      return;
    }
    
    const hasAccess = await db.hasDocumentAccess(documentUuid, parseInt(userId));
    
    if (hasAccess) {
      // Load document content if not in memory
      if (!activeDocuments.has(documentUuid)) {
        const document = await db.getDocumentByUuid(documentUuid);
        if (document) {
          activeDocuments.set(documentUuid, {
            content: document.content || '# Welcome to your collaborative document\n\nStart typing to see real-time collaboration in action!',
            version: 0,
            users: new Map()
          });
        }
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access: true }));
    } else {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied' }));
    }
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to check document access' }));
  }
}

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  verifyClient: async (info) => {
    try {
      const parsedUrl = url.parse(info.req.url, true);
      const documentUuid = parsedUrl.query.doc;
      const userId = parsedUrl.query.user;
      
      if (!documentUuid || !userId) {
        return false;
      }
      
      // Verify user has access to document
      const hasAccess = await db.hasDocumentAccess(documentUuid, parseInt(userId));
      return hasAccess;
    } catch (error) {
      console.error('WebSocket verification error:', error);
      return false;
    }
  }
});

// Remove the old document state variables and users map
// let documentContent = '# Welcome to Collaborative Markdown Editor\n\nStart typing to see real-time collaboration in action!';
// let documentVersion = 0;
// const users = new Map();

// Operational transformation for conflict resolution
class Operation {
  constructor(type, position, content, version) {
    this.type = type; // 'insert' or 'delete'
    this.position = position;
    this.content = content;
    this.version = version;
    this.id = uuidv4();
  }
}

// Transform operation against another operation
function transformOperation(op1, op2) {
  if (op1.version >= op2.version) return op1;
  
  const newOp = { ...op1 };
  
  if (op2.type === 'insert') {
    if (op1.position >= op2.position) {
      newOp.position += op2.content.length;
    }
  } else if (op2.type === 'delete') {
    if (op1.position > op2.position) {
      newOp.position -= op2.content.length;
    }
  }
  
  return newOp;
}

// Apply operation to document
function applyOperation(content, operation) {
  if (operation.type === 'insert') {
    return content.slice(0, operation.position) + operation.content + content.slice(operation.position);
  } else if (operation.type === 'delete') {
    return content.slice(0, operation.position) + content.slice(operation.position + operation.content.length);
  }
  return content;
}

// Broadcast to all clients in a document except sender
function broadcast(documentUuid, message, excludeClient = null) {
  const document = activeDocuments.get(documentUuid);
  if (!document) return;
  
  document.users.forEach((user, userId) => {
    if (user.ws !== excludeClient && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify(message));
    }
  });
}

// WebSocket connection handler
wss.on('connection', async (ws, req) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    const documentUuid = parsedUrl.query.doc;
    const userId = parseInt(parsedUrl.query.user);
    
    if (!documentUuid || !userId) {
      ws.close();
      return;
    }
    
    // Get or create document
    const document = getOrCreateDocument(documentUuid);
    
    // Get user info
    const user = await db.getUserById(userId);
    if (!user) {
      ws.close();
      return;
    }
    
    const sessionId = uuidv4();
    const userColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
    
    // Add user to document
    document.users.set(sessionId, {
      id: userId,
      username: user.username,
      sessionId: sessionId,
      color: userColor,
      cursor: 0,
      ws: ws
    });
    
    console.log(`User ${user.username} connected to document ${documentUuid}`);
    
    // Send initial state to new client
    ws.send(JSON.stringify({
      type: 'init',
      content: document.content,
      version: document.version,
      userId: sessionId,
      userColor: userColor,
      users: Array.from(document.users.values()).map(u => ({
        id: u.sessionId,
        username: u.username,
        color: u.color,
        cursor: u.cursor
      }))
    }));
    
    // Notify other users about new user
    broadcast(documentUuid, {
      type: 'user-joined',
      user: {
        id: sessionId,
        username: user.username,
        color: userColor,
        cursor: 0
      }
    }, ws);
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        
        switch (message.type) {
          case 'operation':
            // Transform operation against concurrent operations
            let transformedOp = message.operation;
            
            // Apply operation to document
            document.content = applyOperation(document.content, transformedOp);
            document.version++;
            
            // Save to database
            await db.updateDocumentContent(documentUuid, document.content);
            
            // Broadcast operation to other clients
            broadcast(documentUuid, {
              type: 'operation',
              operation: {
                ...transformedOp,
                version: document.version
              },
              userId: sessionId
            }, ws);
            break;
            
          case 'cursor':
            // Update user cursor position
            if (document.users.has(sessionId)) {
              document.users.get(sessionId).cursor = message.position;
              
              // Broadcast cursor position to other clients
              broadcast(documentUuid, {
                type: 'cursor',
                userId: sessionId,
                position: message.position
              }, ws);
            }
            break;
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log(`User ${user.username} disconnected from document ${documentUuid}`);
      
      // Remove user from document
      document.users.delete(sessionId);
      
      // Notify other users about disconnection
      broadcast(documentUuid, {
        type: 'user-left',
        userId: sessionId
      });
      
      // Clean up empty documents
      if (document.users.size === 0) {
        activeDocuments.delete(documentUuid);
      }
    });
    
  } catch (error) {
    console.error('WebSocket connection error:', error);
    ws.close();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Collaborative Markdown Editor server running on http://localhost:${PORT}`);
});