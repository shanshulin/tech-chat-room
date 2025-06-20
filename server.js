// server.js (Google搜索最终版)

require('dotenv').config();

const express = require('express');
const http = require('http');
const https = require('https-proxy-agent');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const Parser = require('rss-parser');
const iconv = require('iconv-lite');
const streamifier = require('streamifier');
const OpenAI = require('openai');
// ▼▼▼ 新增: 引入 axios 用于发送HTTP请求 ▼▼▼
const axios = require('axios');
// ▲▲▲ 新增结束 ▲▲▲

const parser = new Parser();

// --- 全局配置 ---
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.DATABASE_URL || !process.env.DEEPSEEK_API_KEY || !process.env.GOOGLE_SEARCH_API_KEY || !process.env.GOOGLE_SEARCH_CX) {
    console.error("FATAL ERROR: Missing required environment variables (CLOUDINARY, DATABASE, DEEPSEEK, or GOOGLE credentials).");
    process.exit(1);
}

// ... (Cloudinary, Pool, Express, Socket.IO 初始化代码保持不变) ...
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1',
});

// ... (数据库初始化, 静态文件, 图片上传, RSS解析等路由保持不变) ...
async function initializeDatabase() { try { const client = await pool.connect(); await client.query(`CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, nickname VARCHAR(100) NOT NULL, content TEXT NOT NULL, message_type VARCHAR(10) DEFAULT 'text', created_at TIMESTAMPTZ DEFAULT NOW());`); client.release(); console.log('Database table "messages" is ready.'); } catch (dbErr) { console.error('FATAL ERROR: Could not initialize database!', dbErr); process.exit(1); } }
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.post('/upload', upload.single('image'), (req, res) => { if (!req.file) { return res.status(400).json({ error: 'No file uploaded.' }); } let cld_upload_stream = cloudinary.uploader.upload_stream({ folder: "chat_app" }, (error, result) => { if (error) { console.error('Cloudinary upload error:', error); return res.status(500).json({ error: 'Failed to upload image.' }); } res.status(200).json({ imageUrl: result.secure_url }); }); streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream); });
app.get('/parse-rss', (req, res) => { const feedUrl = req.query.url; if (!feedUrl) { return res.status(400).json({ error: 'RSS URL is required' }); } const cachedData = new Map().get(feedUrl); if (cachedData && (Date.now() - cachedData.timestamp < (10*60*1000))) { return res.json(cachedData.feed); } const protocol = feedUrl.startsWith('https') ? https.globalAgent.protocol.slice(0, -1) : http.globalAgent.protocol.slice(0, -1); const options = { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }; const request = require(protocol).get(feedUrl, options, (response) => { if (response.statusCode !== 200) { return res.status(response.statusCode).json({ error: `Request Failed. Status Code: ${response.statusCode}` }); } const chunks = []; response.on('data', (chunk) => { chunks.push(chunk); }); response.on('end', async () => { const buffer = Buffer.concat(chunks); let feed; try { feed = await parser.parseString(buffer.toString('utf8')); } catch (e) { try { feed = await parser.parseString(iconv.decode(buffer, 'gb2312')); } catch (e2) { return res.status(500).json({ error: 'Failed to parse RSS feed.' }); } } new Map().set(feedUrl, { feed: feed, timestamp: Date.now() }); res.json(feed); }); }); request.on('timeout', () => { request.destroy(); res.status(504).json({ error: 'Gateway Timeout' }); }); request.on('error', (e) => { res.status(502).json({ error: 'Bad Gateway' }); }); });


// 智能代理核心：定义通用的Google搜索工具
const tools = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "当需要回答关于时事、最新信息或用户不清楚的任何主题的问题时，使用此工具进行网络搜索。该工具可以访问最新的信息。",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "用于搜索引擎的搜索查询关键词。例如：'2024年夏季奥运会结果'或'什么是量子计算'。",
                    },
                },
                required: ["query"],
            },
        },
    },
];

const availableTools = {
    "web_search": async ({ query }) => {
        console.log(`Executing Google web_search with query: "${query}"`);
        const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
        const cx = process.env.GOOGLE_SEARCH_CX;
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;

        try {
            const response = await axios.get(url);
            // 提取搜索结果中的标题和摘要
            const results = response.data.items.map(item => ({
                title: item.title,
                snippet: item.snippet
            }));
            return JSON.stringify(results.slice(0, 5)); // 返回前5条结果
        } catch (error) {
            console.error("Google Search API error:", error.response ? error.response.data : error.message);
            return JSON.stringify({ error: "Sorry, the Google search failed." });
        }
    },
};

// AI 聊天 API 路由
app.post('/api/ai-chat', async (req, res) => {
    // ... (这部分逻辑与之前完全相同，无需修改) ...
    const { history } = req.body;
    if (!history || !history.length) { return res.status(400).json({ error: 'Conversation history is required.' }); }
    try {
        const initialResponse = await deepseek.chat.completions.create({ model: "deepseek-chat", messages: history, tools: tools, tool_choice: "auto" });
        const message = initialResponse.choices[0].message;
        if (message.tool_calls) {
            console.log("AI decided to use the web_search tool.");
            history.push(message);
            const toolCall = message.tool_calls[0];
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            const toolToExecute = availableTools[functionName];
            if (toolToExecute) {
                const toolResult = await toolToExecute(functionArgs);
                history.push({ tool_call_id: toolCall.id, role: "tool", name: functionName, content: toolResult });
            } else {
                 history.push({ tool_call_id: toolCall.id, role: "tool", name: functionName, content: JSON.stringify({ error: `Tool '${functionName}' not found.`})});
            }
            const finalResponse = await deepseek.chat.completions.create({ model: "deepseek-chat", messages: history });
            res.json({ reply: finalResponse.choices[0].message.content });
        } else {
            console.log("AI decided not to use any tool.");
            res.json({ reply: message.content });
        }
    } catch (error) {
        console.error('API or Tool logic error:', error);
        res.status(500).json({ error: 'Failed to get response from AI assistant.' });
    }
});


// ... (Socket.IO 和服务器启动代码保持不变) ...
const users = {};
io.on('connection', async (socket) => { console.log('User connected:', socket.id); try { const result = await pool.query('SELECT nickname, content AS msg, message_type, created_at FROM messages ORDER BY created_at DESC LIMIT 50'); socket.emit('load history', result.rows.reverse()); } catch (err) { console.error('Failed to read history:', err); } socket.on('join', (nickname) => { if (nickname) { socket.nickname = nickname; users[socket.id] = nickname; io.emit('update users', Object.values(users)); socket.broadcast.emit('system message', `“${nickname}”加入了聊天室`); } }); socket.on('chat message', async (data) => { if (socket.nickname && data.msg) { try { const result = await pool.query('INSERT INTO messages (nickname, content, message_type) VALUES ($1, $2, $3) RETURNING created_at', [socket.nickname, data.msg, data.type]); const messageToSend = { nickname: socket.nickname, msg: data.msg, message_type: data.type, created_at: result.rows[0].created_at }; io.emit('chat message', messageToSend); } catch (err) { console.error('Failed to save message:', err); } } }); socket.on('disconnect', () => { if (socket.nickname) { delete users[socket.id]; io.emit('update users', Object.values(users)); io.emit('system message', `“${socket.nickname}”离开了聊天室`); } console.log('User disconnected:', socket.id); }); });
async function startServer() { await initializeDatabase(); const PORT = process.env.PORT || 3000; server.listen(PORT, () => { console.log(`Server is running successfully on http://localhost:${PORT}`); }); }
startServer();