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

  // 你的图片上传路由 (保持不变)
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

  // ★★★ 新增：聊天记录搜索 API ★★★
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
        res.json(rows);
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
    
    socket.on('join', (nickname) => { /* ... 保持不变 ... */ });
    
    socket.on('chat message', async (data) => {
      if (socket.nickname) {
        try {
          const result = await pool.query('INSERT INTO messages (nickname, content, message_type) VALUES ($1, $2, $3) RETURNING created_at', [socket.nickname, data.msg, data.type]);
          io.emit('chat message', { ...data, nickname: socket.nickname, created_at: result.rows[0].created_at });
        } catch (err) { console.error('保存消息到数据库失败:', err); }
      }
    });

    socket.on('disconnect', () => { /* ... 保持不变 ... */ });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => { console.log(`服务器已在 http://localhost:${PORT} 上成功启动并运行`); });
}

main();