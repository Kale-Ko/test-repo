const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'collaborative_editor.db'));
        this.initializeTables();
    }

    initializeTables() {
        // Create users table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create documents table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                content TEXT DEFAULT '',
                owner_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES users (id)
            )
        `);

        // Create document_users table for sharing
        this.db.run(`
            CREATE TABLE IF NOT EXISTS document_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                permission TEXT DEFAULT 'edit',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES documents (id),
                FOREIGN KEY (user_id) REFERENCES users (id),
                UNIQUE(document_id, user_id)
            )
        `);
    }

    // User operations
    async createUser(username, password) {
        return new Promise((resolve, reject) => {
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.db.run(
                    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
                    [username, hash],
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ id: this.lastID, username });
                        }
                    }
                );
            });
        });
    }

    async authenticateUser(username, password) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, username, password_hash FROM users WHERE username = ?',
                [username],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (!row) {
                        resolve(null);
                        return;
                    }

                    bcrypt.compare(password, row.password_hash, (err, result) => {
                        if (err) {
                            reject(err);
                        } else if (result) {
                            resolve({ id: row.id, username: row.username });
                        } else {
                            resolve(null);
                        }
                    });
                }
            );
        });
    }

    async getUserById(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, username FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    // Document operations
    async createDocument(title, ownerId, uuid) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO documents (uuid, title, owner_id) VALUES (?, ?, ?)',
                [uuid, title, ownerId],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID, uuid, title, owner_id: ownerId });
                    }
                }
            );
        });
    }

    async getDocumentByUuid(uuid) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT d.*, u.username as owner_username 
                 FROM documents d 
                 JOIN users u ON d.owner_id = u.id 
                 WHERE d.uuid = ?`,
                [uuid],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    async updateDocumentContent(uuid, content) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [content, uuid],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async getUserDocuments(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT d.uuid, d.title, d.created_at, d.updated_at, 
                        u.username as owner_username,
                        CASE WHEN d.owner_id = ? THEN 'owner' ELSE du.permission END as permission
                 FROM documents d
                 LEFT JOIN document_users du ON d.id = du.document_id AND du.user_id = ?
                 JOIN users u ON d.owner_id = u.id
                 WHERE d.owner_id = ? OR du.user_id = ?
                 ORDER BY d.updated_at DESC`,
                [userId, userId, userId, userId],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    async shareDocument(documentUuid, userId, permission = 'edit') {
        return new Promise((resolve, reject) => {
            // First get the document ID
            this.db.get(
                'SELECT id FROM documents WHERE uuid = ?',
                [documentUuid],
                (err, doc) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (!doc) {
                        reject(new Error('Document not found'));
                        return;
                    }

                    // Add user to document
                    this.db.run(
                        'INSERT OR REPLACE INTO document_users (document_id, user_id, permission) VALUES (?, ?, ?)',
                        [doc.id, userId, permission],
                        (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        }
                    );
                }
            );
        });
    }

    async hasDocumentAccess(documentUuid, userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT d.id 
                 FROM documents d
                 LEFT JOIN document_users du ON d.id = du.document_id AND du.user_id = ?
                 WHERE d.uuid = ? AND (d.owner_id = ? OR du.user_id = ?)`,
                [userId, documentUuid, userId, userId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(!!row);
                    }
                }
            );
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = Database;