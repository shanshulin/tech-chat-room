// --- 修复后的 server.js ---

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// --- Cloudinary 和 数据库 的配置 ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        message_type VARCHAR(10) DEFAULT 'text',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    client.release();
    console.log('数据库表格 "messages" 已成功准备就绪。');
  } catch (dbErr) {
    console.error('致命错误：无法初始化数据库！', dbErr);
    process.exit(1);
  }

  app.use(express.static('public'));
  app.get('/', (req, res) => { res.sendFile(__dirname + '/public/index.html'); });

  app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
          if (error || !result) return reject(error || new Error('Cloudinary error.'));
          resolve(result);
        });
        stream.end(req.file.buffer);
      });
      res.json({ imageUrl: result.secure_url });
    } catch (error) {
      console.error('Cloudinary 上传失败:', error);
      res.status(500).send({ message: 'Upload failed.' });
    }
  });

  app.get('/api/search', async (req, res) => {
    try {
        const { keyword, year, month, day } = req.query;
        let query = 'SELECT nickname, content, message_type, created_at FROM messages';
        const conditions = [];
        const values = [];
        let valueIndex = 1;

        if (keyword) {
            conditions.push(`content ILIKE $${valueIndex++}`);
            values.push(`%${keyword}%`);
        }
        if (year && year !== 'any') {
            conditions.push(`EXTRACT(YEAR FROM created_at) = $${valueIndex++}`);
            values.push(year);
        }
        if (month && month !== 'any') {
            conditions.push(`EXTRACT(MONTH FROM created_at) = $${valueIndex++}`);
            values.push(month);
        }
        if (day && day !== 'any') {
            conditions.push(`EXTRACT(DAY FROM created_at) = $${valueIndex++}`);
            values.push(day);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY created_at DESC LIMIT 100';

        const { rows } = await pool.query(query, values);
        
        const formattedRows = rows.map(row => ({
            nickname: row.nickname,
            msg: row.content,
            message_type: row.message_type,
            created_at: row.created_at
        }));
        
        res.json(formattedRows);

    } catch (err) {
        console.error('搜索聊天记录失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
  });

  const users = {};
  io.on('connection', async (socket) => {
    console.log('一个用户连接了 id:', socket.id);
    try {
      const result = await pool.query('SELECT nickname, content AS msg, message_type, created_at FROM messages ORDER BY created_at DESC LIMIT 50');
      socket.emit('load history', result.rows.reverse());
    } catch (err) { console.error('读取历史消息失败:', err); }
    
    // ★★★ 核心修复 #1：补全用户加入逻辑 ★★★
    socket.on('join', (nickname) => {
        if (nickname) {
            socket.nickname = nickname;
            users[socket.id] = nickname;
            // 向所有客户端广播更新后的用户列表
            io.emit('update users', Object.values(users));
            // 向除了当前用户外的其他所有用户发送系统消息
            socket.broadcast.emit('system message', `“${nickname}”加入了聊天室`);
            console.log(`“${nickname}”加入，当前在线用户:`, Object.values(users));
        }
    });
    
    socket.on('chat message', async (data) => {
      // 这个判断现在可以正常工作了
      if (socket.nickname) {
        try {
          const result = await pool.query('INSERT INTO messages (nickname, content, message_type) VALUES ($1, $2, $3) RETURNING created_at', [socket.nickname, data.msg, data.type]);
          io.emit('chat message', { ...data, nickname: socket.nickname, created_at: result.rows[0].created_at });
        } catch (err) { console.error('保存消息到数据库失败:', err); }
      }
    });

    // ★★★ 核心修复 #2：补全用户断开连接逻辑 ★★★
    socket.on('disconnect', () => {
        if (socket.nickname) {
            console.log(`“${socket.nickname}”断开了连接`);
            // 从用户列表中移除
            delete users[socket.id];
            // 向所有客户端广播更新后的用户列表和系统消息
            io.emit('update users', Object.values(users));
            io.emit('system message', `“${socket.nickname}”离开了聊天室`);
        } else {
            console.log('一个未命名用户断开了连接 id:', socket.id);
        }
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => { console.log(`服务器已在 http://localhost:${PORT} 上成功启动并运行`); });
}

main();