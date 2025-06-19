const express = require('express');
const http = require('http'); // 用于发起HTTP请求
const https = require('https'); // 用于发起HTTPS请求
const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const Parser = require('rss-parser');
const iconv = require('iconv-lite'); // 引入新安装的库

const parser = new Parser();

// --- 配置 ---
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
  
  // --- 静态文件服务 ---
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));
  
  app.get(/^(?!\/api\/|\/parse-rss|\/socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // --- API 路由 ---
  app.post('/upload', upload.single('image'), async (req, res) => { /* ... 上传逻辑不变 ... */ });
  app.get('/api/search', async (req, res) => { /* ... 搜索逻辑不变 ... */ });
  
  // ▼▼▼ 核心修改：重写 /parse-rss API 端点以支持编码转换 ▼▼▼
  app.get('/parse-rss', (req, res) => {
      const feedUrl = req.query.url;
      if (!feedUrl) {
          return res.status(400).json({ error: 'RSS URL is required' });
      }

      // 根据URL协议选择http或https模块
      const protocol = feedUrl.startsWith('https') ? https : http;

      protocol.get(feedUrl, (response) => {
          if (response.statusCode !== 200) {
              return res.status(response.statusCode).json({ error: `Request Failed. Status Code: ${response.statusCode}` });
          }

          const chunks = [];
          response.on('data', (chunk) => {
              chunks.push(chunk);
          });

          response.on('end', async () => {
              const buffer = Buffer.concat(chunks);
              
              // 检测编码
              const contentType = response.headers['content-type'] || '';
              let xmlString = '';

              if (contentType.includes('gb2312') || contentType.includes('gbk')) {
                  console.log(`检测到 ${contentType} 编码，正在转换为UTF-8...`);
                  xmlString = iconv.decode(buffer, 'gb2312');
              } else {
                  // 默认为UTF-8
                  xmlString = buffer.toString('utf8');
              }

              try {
                  const feed = await parser.parseString(xmlString);
                  res.json(feed);
              } catch (parseError) {
                  console.error('RSS 解析失败:', parseError);
                  res.status(500).json({ error: 'Failed to parse RSS feed content.' });
              }
          });

      }).on('error', (e) => {
          console.error(`请求RSS源时出错: ${e.message}`);
          res.status(500).json({ error: 'Could not fetch the RSS feed from the URL.' });
      });
  });
  // ▲▲▲ API 端点修改结束 ▲▲▲

  // --- Socket.IO 连接逻辑 ---
  const users = {};
  io.on('connection', async (socket) => {
    // ... 所有socket.io逻辑不变 ...
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
          const messageToSend = { nickname: socket.nickname, msg: data.msg, message_type: data.type, created_at: result.rows[0].created_at };
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