const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// データベースファイルのパス
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../database/assistant.db');

// データベースディレクトリが存在しない場合は作成
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// データベースファイルが存在するか確認
const dbExists = fs.existsSync(dbPath);
if (dbExists) {
  console.log(`既存のデータベースファイルを使用します: ${dbPath}`);
} else {
  console.log(`新しいデータベースファイルを作成します: ${dbPath}`);
}

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err.message);
  } else {
    console.log('データベースに接続しました');
    initializeDatabase();
  }
});

// データベース初期化
function initializeDatabase() {
  // メッセージ履歴テーブル
  db.run(`CREATE TABLE IF NOT EXISTS message_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // タスクテーブル
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    due_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // プロジェクトアイデアテーブル
  db.run(`CREATE TABLE IF NOT EXISTS project_ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ジャーナルテーブル
  db.run(`CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    mood TEXT,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('データベーステーブルが初期化されました');
}

// メッセージをデータベースに保存
function saveMessage(userId, channelId, content) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('INSERT INTO message_history (user_id, channel_id, message_content) VALUES (?, ?, ?)');
    stmt.run(userId, channelId, content, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
    stmt.finalize();
  });
}

// ユーザーの最近のメッセージを取得
function getRecentMessages(userId, limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM message_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
      [userId, limit],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

// タスク関連の操作
const tasks = {
  create: (userId, title, description, dueDate = null) => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        'INSERT INTO tasks (user_id, title, description, due_date) VALUES (?, ?, ?, ?)'
      );
      stmt.run(userId, title, description, dueDate, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
      stmt.finalize();
    });
  },

  getAll: (userId) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  },

  update: (taskId, updateData) => {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updateData);

      db.run(
        `UPDATE tasks SET ${fields} WHERE id = ?`,
        [...values, taskId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }
};

// プロジェクトアイデア関連の操作
const projectIdeas = {
  create: (userId, title, description, category = null) => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        'INSERT INTO project_ideas (user_id, title, description, category) VALUES (?, ?, ?, ?)'
      );
      stmt.run(userId, title, description, category, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
      stmt.finalize();
    });
  },

  getAll: (userId) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM project_ideas WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }
};

// ジャーナル関連の操作
const journal = {
  create: (userId, content, mood = null, tags = null) => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        'INSERT INTO journal_entries (user_id, content, mood, tags) VALUES (?, ?, ?, ?)'
      );
      stmt.run(userId, content, mood, tags, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
      stmt.finalize();
    });
  },

  getRecent: (userId, limit = 10) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM journal_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }
};

module.exports = {
  db,
  saveMessage,
  getRecentMessages,
  tasks,
  projectIdeas,
  journal,
  close: () => {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
};
