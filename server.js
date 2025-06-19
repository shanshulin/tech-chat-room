// server.js (已增强RSS解析逻辑)

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

// --- Database Initialization ---
async function initializeDatabase() {
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

// --- Static File Serving ---
app.use(express.static(path.join(__dirname, 'public')));


// --- API Routes ---
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

// ▼▼▼ 核心修改点：重写 /parse-rss 接口，使其更健壮 ▼▼▼
app.get('/parse-rss', (req, res) => {
    const feedUrl = req.query.url;
    if (!feedUrl) {
        return res.status(400).json({ error: 'RSS URL is required' });
    }

    const protocol = feedUrl.startsWith('https') ? https : http;

    protocol.get(feedUrl, (response) => {
        if (response.statusCode !== 200) {
            return res.status(response.statusCode).json({ error: `Request Failed. Status Code: ${response.statusCode}` });
        }

        const chunks = [];
        response.on('data', (chunk) => { chunks.push(chunk); });

        response.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            let feed;

            // 策略1：首先尝试用UTF-8解析
            try {
                const xmlString = buffer.toString('utf8');
                feed = await parser.parseString(xmlString);
                console.log(`Successfully parsed ${feedUrl} with UTF-8.`);
                return res.json(feed);
            } catch (utf8Error) {
                console.log(`UTF-8 parsing failed for ${feedUrl}. Trying GBK/GB2312...`);
                
                // 策略2：如果UTF-8失败，再尝试用GBK/GB2312解析
                try {
                    const xmlString = iconv.decode(buffer, 'gb2312');
                    feed = await parser.parseString(xmlString);
                    console.log(`Successfully parsed ${feedUrl} with GBK/GB2312.`);
                    return res.json(feed);
                } catch (gbkError) {
                    console.error(`Failed to parse ${feedUrl} with both UTF-8 and GBK encodings.`, { utf8Error, gbkError });
                    return res.status(500).json({ error: 'Failed to parse RSS feed. The format might be invalid or use an unsupported encoding.' });
                }
            }
        });

    }).on('error', (e) => {
        console.error(`Error fetching RSS feed from URL: ${feedUrl}`, e);
        res.status(500).json({ error: 'Could not fetch the RSS feed from the URL.' });
    });
});
// ▲▲▲ 核心修改点结束 ▲▲▲


// --- Socket.IO Connection Logic ---
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

// --- Start Server ---
async function startServer() {
    await initializeDatabase();
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => { console.log(`Server is running successfully on http://localhost:${PORT}`); });
}

startServer();