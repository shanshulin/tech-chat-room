const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const Parser = require('rss-parser');

// 初始化RSS解析器
const parser = new Parser();

// --- Cloudinary 和 数据库 的配置 ---
// 确保你的 .env 文件或Render环境变量中设置了这些值
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

  // --- 数据库初始化 ---
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

  // ▼▼▼ 关键部分：正确配置静态文件服务 ▼▼▼
  // 定义 'public' 文件夹的绝对路径
  const publicPath = path.join(__dirname, 'public');
  
  // 告诉 Express，所有静态文件（如css, js, ico）都从 'public' 文件夹提供
  app.use(express.static(publicPath));
  
  // 将所有未匹配到API的GET请求都重定向到 index.html
  // 这对于单页应用（SPA）和直接访问子路径非常重要
  app.get(/^(?!\/api\/|\/parse-rss|\/socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
  // ▲▲▲ 静态文件服务配置结束 ▲▲▲


  // --- API 路由 ---
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
        const { username, keyword, year, month, day } = req.query;
        let query = 'SELECT nickname, content, message_type, created_at FROM messages';
        const conditions = [];
        const values = [];
        let valueIndex = 1;
        if (username) { conditions.push(`nickname ILIKE $${valueIndex++}`); values.push(`%${username}%`); }
        if (keyword) { conditions.push(`content ILIKE $${valueIndex++}`); values.push(`%${keyword}%`); }
        if (year && year !== 'any') { conditions.push(`EXTRACT(YEAR FROM created_at) = $${valueIndex++}`); values.push(year); }
        if (month && month !== 'any') { conditions.push(`EXTRACT(MONTH FROM created_at) = $${valueIndex++}`); values.push(month); }
        if (day && day !== 'any') { conditions.push(`EXTRACT(DAY FROM created_at) = $${valueIndex++}`); values.push(day); }
        if (conditions.length > 0) { query += ' WHERE ' + conditions.join(' AND '); }
        query += ' ORDER BY created_at DESC LIMIT 100';
        const { rows } = await pool.query(query, values);
        const formattedRows = rows.map(row => ({ nickname: row.nickname, msg: row.content, message_type: row.message_type, created_at: row.created_at }));
        res.json(formattedRows);
    } catch (err) {
        console.error('搜索聊天记录失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
  });

  app.get('/parse-rss', async (req, res) => {
      const feedUrl = req.query.url;
      if (!feedUrl) {
          return res.status(400).json({ error: 'RSS URL is required' });
      }
      try {
          const feed = await parser.parseURL(feedUrl);
          res.json(feed);
      } catch (error) {
          console.error(`Error parsing RSS feed: ${feedUrl}`, error.message);
          res.status(500).json({ error: 'Failed to parse RSS feed. Check the URL or try again later.' });
      }
  });

  // --- Socket.IO 连接逻辑 ---
  const users = {};
  io.on('connection', async (socket) => {
    console.log('一个用户连接了 id:', socket.id);
    try {
      const result = await pool.query('SELECT nickname, content AS msg, message_type, created_at FROM messages ORDER BY created_at DESC LIMIT 50');
      socket.emit('load history', result.rows.reverse());
    } catch (err) { console.error('读取历史消息失败:', err); }
    
    socket.on('join', (nickname) => {
        if (nickname) {
            socket.nickname = nickname;
            users[socket.id] = nickname;
            io.emit('update users', Object.values(users));
            socket.broadcast.emit('system message', `“${nickname}”加入了聊天室`);
        }
    });
    
    socket.on('chat message', async (data) => {
      if (socket.nickname) {
        try {
          const result = await pool.query('INSERT INTO messages (nickname, content, message_type) VALUES ($1, $2, $3) RETURNING created_at', [socket.nickname, data.msg, data.type]);
          
          const messageToSend = {
            nickname: socket.nickname,
            msg: data.msg,
            message_type: data.type,
            created_at: result.rows[0].created_at
          };
          io.emit('chat message', messageToSend);

        } catch (err) { console.error('保存消息到数据库失败:', err); }
      }
    });

    socket.on('disconnect', () => {
        if (socket.nickname) {
            delete users[socket.id];
            io.emit('update users', Object.values(users));
            io.emit('system message', `“${socket.nickname}”离开了聊天室`);
        }
        console.log('一个用户断开了连接 id:', socket.id);
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => { console.log(`服务器已在 http://localhost:${PORT} 上成功启动并运行`); });
}

main();