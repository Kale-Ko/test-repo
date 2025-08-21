# 🚀 Collaborative Markdown Editor

A real-time collaborative markdown editor built with WebSockets, featuring conflict resolution and user presence indicators.

## ✨ Features

- **Real-time Collaboration**: Multiple users can edit the same document simultaneously
- **WebSocket Synchronization**: Instant updates across all connected clients
- **Conflict Resolution**: Operational transformation prevents conflicts when users edit simultaneously
- **User Presence Indicators**: See who's online and where they're working
- **Live Markdown Preview**: Real-time rendering of markdown content
- **User Cursors**: See other users' cursor positions in real-time
- **Responsive Design**: Works on desktop and mobile devices

## 🛠️ Technology Stack

- **Backend**: Node.js with WebSocket (ws library)
- **Frontend**: Vanilla HTML, CSS, and JavaScript
- **Markdown Processing**: marked.js for parsing and rendering
- **Real-time Communication**: WebSockets for bi-directional communication
- **Conflict Resolution**: Simple operational transformation algorithm

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd collaborative-markdown-editor
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

5. Open multiple browser tabs/windows to see real-time collaboration in action!

## 🎯 How It Works

### Real-time Synchronization

The editor uses WebSockets to maintain persistent connections between clients and the server. When a user makes changes:

1. **Local Change**: User types in the editor
2. **Operation Creation**: The change is converted to an operation (insert/delete)
3. **Server Broadcast**: Operation is sent to the server and broadcast to other users
4. **Remote Application**: Other users receive and apply the operation
5. **Conflict Resolution**: Operational transformation ensures consistency

### Conflict Resolution

The system uses a simplified operational transformation approach:

- Each operation has a version number
- Operations are transformed against concurrent operations
- Position adjustments prevent conflicts when multiple users edit simultaneously

### User Presence

- Each user gets a unique color and identifier
- Cursor positions are tracked and shared in real-time
- Active users are displayed in the header with color indicators

## 📁 Project Structure

```
collaborative-markdown-editor/
├── server.js              # WebSocket server with operation handling
├── package.json           # Project dependencies and scripts
├── public/
│   ├── index.html         # Main HTML structure
│   ├── style.css          # Styling and responsive design
│   └── script.js          # Client-side WebSocket and editor logic
└── README.md              # This file
```

## 🔧 Configuration

The server runs on port 3000 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## 🌟 Usage Examples

### Basic Editing
1. Start typing in the editor
2. See your changes reflected in the preview panel
3. Open another browser tab to see real-time collaboration

### Multiple Users
1. Share the URL with others
2. Each user gets a unique color indicator
3. See cursor positions and edits in real-time
4. Users are automatically synchronized

### Markdown Features
The editor supports all standard markdown features:
- Headers (`# ## ###`)
- **Bold** and *italic* text
- Code blocks and `inline code`
- Lists and links
- Blockquotes
- And more!

## 🐛 Known Limitations

- Simplified conflict resolution (production systems would use more sophisticated algorithms)
- No persistent storage (document resets when server restarts)
- Basic user identification (no authentication system)
- Limited offline support

## 🔮 Future Enhancements

- User authentication and persistent sessions
- Document persistence with database storage
- Advanced operational transformation algorithms
- File upload and image embedding
- Export to various formats (PDF, HTML, etc.)
- Syntax highlighting for code blocks
- Comments and annotations system

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ for real-time collaboration