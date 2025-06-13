const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// ★★★ 改变 1: 将所有 require 放在一起，但 app 的初始化移到 main 函数内部

// --- Cloudinary 和 数据库 的配置可以放在全局 ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


/**
 * 主程序函数
 */
async function main() {
  // ★★★ 改变 2: 在 main 函数的开头，初始化 app, server, 和 io ★★★
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  // --- Multer 配置 ---
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  // 1. 数据库初始化
  try {
    const client = await pool.connect();
    console.log('数据库连接测试成功！');
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

  // 2. 静态文件服务
  app.use(express.static('public'));
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
  });

  // 3. 图片上传路由
  app.post('/upload', upload.single('image'), async (req, res) => {
    console.log('--- /upload 路由被访问 ---');
    if (!req.file) {
      console.log('上传失败：没有文件。');
      return res.status(400).send('No file uploaded.');
    }
    console.log(`收到文件: ${req.file.originalname}`);
    try {
      const uploadToCloudinary = (fileBuffer) => {
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                if (error || !result) return reject(error || new Error('Cloudinary result is empty.'));
                resolve(result);
            });
            stream.end(fileBuffer);
        });
      };
      const result = await uploadToCloudinary(req.file.buffer);
      console.log('Cloudinary 上传成功！');
      res.json({ imageUrl: result.secure_url });
    } catch (error) {
      console.error('Cloudinary 上传过程中发生异常:', error);
      res.status(500).send({ message: 'Upload to Cloudinary failed.' });
    }
  });


  // 4. Socket.IO 逻辑
  const users = {};
  io.on('connection', async (socket) => {
    // ... (这部分完全不变)
    console.log('一个用户连接了 id:', socket.id);
    try {
      const result = await pool.query('SELECT nickname, content AS msg, message_type, created_at FROM messages ORDER BY created_at DESC LIMIT 50');
      const history = result.rows.reverse();
      socket.emit('load history', history);
    } catch (err) { console.error('读取历史消息失败:', err); }
    socket.on('join', (nickname) => {
      socket.nickname = nickname; users[socket.id] = nickname;
      io.emit('system message', `${nickname} 加入了聊天室`);
      io.emit('update users', Object.values(users));
    });
    socket.on('chat message', async (data) => {
      if (socket.nickname) {
        const messageType = data.type || 'text';
        const messageContent = data.msg;
        try {
          await pool.query('INSERT INTO messages (nickname, content, message_type) VALUES ($1, $2, $3)', [socket.nickname, messageContent, messageType]);
          io.emit('chat message', { nickname: socket.nickname, msg: messageContent, message_type: messageType, created_at: new Date() });
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

  // 5. 启动服务器
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`服务器已在 http://localhost:${PORT} 上成功启动并运行`);
  });
}

// 启动主程序
main();