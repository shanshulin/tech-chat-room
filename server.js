const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Cloudinary 配置 ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Multer 配置 (暂存文件于内存) ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 数据库连接 ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // 数据库和表格初始化
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        message_type VARCHAR(10) DEFAULT 'text', -- 'text' or 'image'
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    client.release();
    console.log('数据库表格 "messages" 已成功准备就绪。');
  } catch (dbErr) {
    console.error('致命错误：无法初始化数据库！', dbErr);
    process.exit(1);
  }

  // 静态文件服务
  app.use(express.static('public'));
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
  });

  // --- 图片上传 API 路由 ---
  app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }
    // 将文件 buffer 上传到 Cloudinary
    cloudinary.uploader.upload_stream({ resource_type: 'image' }, async (error, result) => {
      if (error || !result) {
        console.error('Cloudinary 上传失败:', error);
        return res.status(500).send('Upload to Cloudinary failed.');
      }
      res.json({ imageUrl: result.secure_url });
    }).end(req.file.buffer);
  });


  // Socket.IO 连接逻辑
  const users = {};
  io.on('connection', async (socket) => {
    console.log('一个用户连接了 id:', socket.id);

    try {
      const result = await pool.query('SELECT nickname, content AS msg, message_type, created_at FROM messages ORDER BY created_at DESC LIMIT 50');
      const history = result.rows.reverse();
      socket.emit('load history', history);
    } catch (err) { console.error('读取历史消息失败:', err); }

    socket.on('join', (nickname) => {
      socket.nickname = nickname;
      users[socket.id] = nickname;
      io.emit('system message', `${nickname} 加入了聊天室`);
      io.emit('update users', Object.values(users));
    });

    socket.on('chat message', async (data) => {
      if (socket.nickname) {
        const messageType = data.type || 'text';
        const messageContent = data.msg;
        try {
          await pool.query(
            'INSERT INTO messages (nickname, content, message_type) VALUES ($1, $2, $3)', 
            [socket.nickname, messageContent, messageType]
          );
          io.emit('chat message', { 
            nickname: socket.nickname, 
            msg: messageContent,
            message_type: messageType,
            created_at: new Date()
          });
        } catch (err) { console.error('保存消息到数据库失败:', err); }
      }
    });

    socket.on('disconnect', () => {
      if (socket.nickname) {
        console.log(socket.nickname + ' 断开了连接');
        delete users[socket.id];
        io.emit('system message', `${socket.nickname} 离开了聊天室`);
        io.emit('update users', Object.values(users));
      }
    });
  });

  // 启动服务器
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`服务器已在 http://localhost:${PORT} 上成功启动并运行`);
  });
}

main();