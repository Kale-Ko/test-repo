const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create HTTP server
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  
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

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Document state
let documentContent = '# Welcome to Collaborative Markdown Editor\n\nStart typing to see real-time collaboration in action!';
let documentVersion = 0;

// Connected users
const users = new Map();

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

// Broadcast to all clients except sender
function broadcast(message, excludeClient = null) {
  wss.clients.forEach(client => {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  const userId = uuidv4();
  const userColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
  
  // Add user to active users
  users.set(userId, {
    id: userId,
    color: userColor,
    cursor: 0,
    ws: ws
  });
  
  console.log(`User ${userId} connected`);
  
  // Send initial state to new client
  ws.send(JSON.stringify({
    type: 'init',
    content: documentContent,
    version: documentVersion,
    userId: userId,
    userColor: userColor,
    users: Array.from(users.values()).map(u => ({
      id: u.id,
      color: u.color,
      cursor: u.cursor
    }))
  }));
  
  // Notify other users about new user
  broadcast({
    type: 'user-joined',
    user: {
      id: userId,
      color: userColor,
      cursor: 0
    }
  }, ws);
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'operation':
          // Transform operation against concurrent operations
          let transformedOp = message.operation;
          
          // Apply operation to document
          documentContent = applyOperation(documentContent, transformedOp);
          documentVersion++;
          
          // Broadcast operation to other clients
          broadcast({
            type: 'operation',
            operation: {
              ...transformedOp,
              version: documentVersion
            },
            userId: userId
          }, ws);
          break;
          
        case 'cursor':
          // Update user cursor position
          if (users.has(userId)) {
            users.get(userId).cursor = message.position;
            
            // Broadcast cursor position to other clients
            broadcast({
              type: 'cursor',
              userId: userId,
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
    console.log(`User ${userId} disconnected`);
    
    // Remove user from active users
    users.delete(userId);
    
    // Notify other users about disconnection
    broadcast({
      type: 'user-left',
      userId: userId
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Collaborative Markdown Editor server running on http://localhost:${PORT}`);
});