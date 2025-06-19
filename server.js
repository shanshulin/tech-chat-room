// server.js (已添加RSS缓存功能)

require('dotenv').config();

const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const Parser = require('rss-parser');
const iconv = require('iconv-lite');
const streamifier = require('streamifier');

const parser = new Parser();

// --- 新增：缓存配置 ---
const cache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 缓存10分钟 (单位：毫秒)

// --- Configuration ---
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.DATABASE_URL) {
    console.error("FATAL ERROR: Missing CLOUDINARY or DATABASE_URL environment variables.");
    process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Database Initialization (no changes)
async function initializeDatabase() { /* ... */ }

// Static File Serving (no changes)
app.use(express.static(path.join(__dirname, 'public')));


// --- API Routes ---
// Image Upload Route (no changes)
app.post('/upload', upload.single('image'), (req, res) => { /* ... */ });

// ▼▼▼ 核心修改点：为 /parse-rss 接口添加缓存逻辑 ▼▼▼
app.get('/parse-rss', (req, res) => {
    const feedUrl = req.query.url;
    if (!feedUrl) {
        return res.status(400).json({ error: 'RSS URL is required' });
    }

    // 步骤1：检查缓存
    const cachedData = cache.get(feedUrl);
    if (cachedData && (Date.now() - cachedData.timestamp < CACHE_DURATION)) {
        console.log(`Serving from cache for: ${feedUrl}`);
        return res.json(cachedData.feed);
    }
    
    // 步骤2：如果缓存不存在或已过期，则发起请求
    console.log(`Fetching new data for: ${feedUrl}`);
    const protocol = feedUrl.startsWith('https') ? https : http;

    protocol.get(feedUrl, (response) => {
        if (response.statusCode !== 200) {
            // 将错误信息也返回给前端
            return res.status(response.statusCode).json({ error: `Request Failed. Status Code: ${response.statusCode}` });
        }

        const chunks = [];
        response.on('data', (chunk) => { chunks.push(chunk); });

        response.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            let feed;

            try {
                const xmlString = buffer.toString('utf8');
                feed = await parser.parseString(xmlString);
            } catch (utf8Error) {
                try {
                    const xmlString = iconv.decode(buffer, 'gb2312');
                    feed = await parser.parseString(xmlString);
                } catch (gbkError) {
                    return res.status(500).json({ error: 'Failed to parse RSS feed. Invalid format or unsupported encoding.' });
                }
            }
            
            // 步骤3：将成功获取的数据存入缓存
            cache.set(feedUrl, { feed: feed, timestamp: Date.now() });
            console.log(`Cached new data for: ${feedUrl}`);
            
            // 步骤4：将数据返回给客户端
            res.json(feed);
        });

    }).on('error', (e) => {
        console.error(`Error fetching RSS feed from URL: ${feedUrl}`, e);
        res.status(500).json({ error: 'Could not fetch the RSS feed from the URL.' });
    });
});
// ▲▲▲ 核心修改点结束 ▲▲▲


// Socket.IO Connection Logic (no changes)
// ...

// Start Server (no changes)
// ...

// 为了完整性，我把未改动的部分也补充进来
async function fullInitializeDatabase() {
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
    console.log('Database table "messages" is ready.');
  } catch (dbErr) {
    console.error('FATAL ERROR: Could not initialize database!', dbErr);
    process.exit(1);
  }
}

app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    let cld_upload_stream = cloudinary.uploader.upload_stream({ folder: "chat_app" }, (error, result) => {
        if (error) {
            console.error('Cloudinary upload error:', error);
            return res.status(500).json({ error: 'Failed to upload image.' });
        }
        res.status(200).json({ imageUrl: result.secure_url });
    });
    streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream);
});

const users = {};
io.on('connection', async (socket) => {
    console.log('User connected:', socket.id);
    try {
        const result = await pool.query('SELECT nickname, content AS msg, message_type, created_at FROM messages ORDER BY created_at DESC LIMIT 50');
        socket.emit('load history', result.rows.reverse());
    } catch (err) { console.error('Failed to read history:', err); }
    
    socket.on('join', (nickname) => {
        if (nickname) {
            socket.nickname = nickname;
            users[socket.id] = nickname;
            io.emit('update users', Object.values(users));
            socket.broadcast.emit('system message', `“${nickname}”加入了聊天室`);
        }
    });
    
    socket.on('chat message', async (data) => {
      if (socket.nickname && data.msg) {
        try {
          const result = await pool.query('INSERT INTO messages (nickname, content, message_type) VALUES ($1, $2, $3) RETURNING created_at', [socket.nickname, data.msg, data.type]);
          const messageToSend = { nickname: socket.nickname, msg: data.msg, message_type: data.type, created_at: result.rows[0].created_at };
          io.emit('chat message', messageToSend);
        } catch (err) { 
            console.error('Failed to save message:', err);
        }
      }
    });

    socket.on('disconnect', () => {
        if (socket.nickname) {
            delete users[socket.id];
            io.emit('update users', Object.values(users));
            io.emit('system message', `“${socket.nickname}”离开了聊天室`);
        }
        console.log('User disconnected:', socket.id);
    });
});

async function startServer() {
    await fullInitializeDatabase();
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => { console.log(`Server is running successfully on http://localhost:${PORT}`); });
}

startServer();