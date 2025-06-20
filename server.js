// server.js (最终强化版)

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const Parser = require('rss-parser');
const iconv = require('iconv-lite');
const streamifier = require('streamifier');
const OpenAI = require('openai');
const axios =require('axios');

const parser = new Parser();

// --- 全局配置 ---
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.DATABASE_URL || !process.env.DEEPSEEK_API_KEY || !process.env.GOOGLE_SEARCH_API_KEY || !process.env.GOOGLE_SEARCH_CX) {
    console.error("FATAL ERROR: Missing required environment variables.");
    process.exit(1);
}

// ... (所有初始化代码保持不变) ...
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
async function initializeDatabase() { try { const client = await pool.connect(); await client.query(`CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, nickname VARCHAR(100) NOT NULL, content TEXT NOT NULL, message_type VARCHAR(10) DEFAULT 'text', created_at TIMESTAMPTZ DEFAULT NOW());`); client.release(); console.log('Database table "messages" is ready.'); } catch (dbErr) { console.error('FATAL ERROR: Could not initialize database!', dbErr); process.exit(1); } }
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.post('/upload', upload.single('image'), (req, res) => { if (!req.file) { return res.status(400).json({ error: 'No file uploaded.' }); } let cld_upload_stream = cloudinary.uploader.upload_stream({ folder: "chat_app" }, (error, result) => { if (error) { console.error('Cloudinary upload error:', error); return res.status(500).json({ error: 'Failed to upload image.' }); } res.status(200).json({ imageUrl: result.secure_url }); }); streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream); });
app.get('/parse-rss', async (req, res) => { const feedUrl = req.query.url; if (!feedUrl) { return res.status(400).json({ error: 'RSS URL is required' }); } try { const feed = await parser.parseURL(feedUrl); res.json(feed); } catch (error) { console.error(`Failed to parse RSS feed from ${feedUrl}:`, error); try { const response = await axios.get(feedUrl, { responseType: 'arraybuffer' }); const decodedBody = iconv.decode(response.data, 'gb2312'); const feed = await parser.parseString(decodedBody); res.json(feed); } catch (gbkError) { res.status(500).json({ error: 'Failed to parse RSS feed with standard and fallback encodings.' }); } } });


// ▼▼▼ 智能代理核心：定义多个工具 ▼▼▼
const tools = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "当需要回答关于时事、人物、事件、定义或任何需要当前或实时信息的问题时，使用此工具进行网络搜索。",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "用于搜索引擎的、简洁明了的搜索查询词。例如：'美国现任总统' 或 '2024年欧洲杯冠军'。" },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_current_time",
            description: "获取当前的日期和时间。",
            parameters: { type: "object", properties: {} },
        },
    }
];

const availableTools = {
    "web_search": async ({ query }) => {
        console.log(`Executing Google web_search with query: "${query}"`);
        const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
        const cx = process.env.GOOGLE_SEARCH_CX;
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
        try {
            const response = await axios.get(url);
            if (!response.data.items || response.data.items.length === 0) {
                return JSON.stringify({ "info": "No search results found." });
            }
            const results = response.data.items.map(item => ({ title: item.title, snippet: item.snippet }));
            return JSON.stringify(results.slice(0, 5));
        } catch (error) {
            console.error("Google Search API error:", error.response ? error.response.data.error.message : error.message);
            // 返回一个对AI更友好的错误信息
            return JSON.stringify({ error: `Google Search API failed. Reason: ${error.response ? error.response.data.error.message : error.message}` });
        }
    },
    "get_current_time": async () => {
        console.log("Executing get_current_time tool.");
        return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    }
};
// ▲▲▲ 智能代理核心结束 ▲▲▲


// AI 聊天 API 路由 (强化版)
app.post('/api/ai-chat', async (req, res) => {
    const { history, use_network } = req.body; 
    if (!history || !history.length) { return res.status(400).json({ error: 'Conversation history is required.' }); }

    try {
        const payload = { model: "deepseek-chat", messages: history };

        if (use_network) {
            console.log("Network search is ENABLED, providing tools to AI.");
            payload.tools = tools;
            payload.tool_choice = "auto";
        } else {
            console.log("Network search is DISABLED.");
        }

        const initialResponse = await deepseek.chat.completions.create(payload);
        const message = initialResponse.choices[0].message;

        if (use_network && message.tool_calls) {
            history.push(message); // 将AI的工具调用决定加入历史
            const toolCall = message.tool_calls[0];
            const functionName = toolCall.function.name;
            const functionArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
            
            console.log(`AI decided to use the tool: ${functionName}`);

            const toolToExecute = availableTools[functionName];
            
            if (toolToExecute) {
                const toolResult = await toolToExecute(functionArgs);
                console.log(`Tool ${functionName} returned:`, toolResult);
                history.push({ tool_call_id: toolCall.id, role: "tool", name: functionName, content: toolResult });
            } else {
                 const errorContent = `Error: Tool '${functionName}' not found.`;
                 console.error(errorContent);
                 history.push({ tool_call_id: toolCall.id, role: "tool", name: functionName, content: JSON.stringify({ error: errorContent })});
            }
            
            console.log("Sending final request to AI with tool result...");
            const finalResponse = await deepseek.chat.completions.create({ model: "deepseek-chat", messages: history });
            return res.json({ reply: finalResponse.choices[0].message.content });
        } else {
            console.log("AI directly responding (no tool was used).");
            return res.json({ reply: message.content });
        }
    } catch (error) {
        console.error('Fatal error in /api/ai-chat route:', error);
        return res.status(500).json({ error: 'An unexpected server error occurred.' });
    }
});


// ... (Socket.IO 和服务器启动代码保持不变) ...
const users = {};
io.on('connection', async (socket) => { console.log('User connected:', socket.id); try { const result = await pool.query('SELECT nickname, content AS msg, message_type, created_at FROM messages ORDER BY created_at DESC LIMIT 50'); socket.emit('load history', result.rows.reverse()); } catch (err) { console.error('Failed to read history:', err); } socket.on('join', (nickname) => { if (nickname) { socket.nickname = nickname; users[socket.id] = nickname; io.emit('update users', Object.values(users)); socket.broadcast.emit('system message', `“${nickname}”加入了聊天室`); } }); socket.on('chat message', async (data) => { if (socket.nickname && data.msg) { try { const result = await pool.query('INSERT INTO messages (nickname, content, message_type) VALUES ($1, $2, $3) RETURNING created_at', [socket.nickname, data.msg, data.type]); const messageToSend = { nickname: socket.nickname, msg: data.msg, message_type: data.type, created_at: result.rows[0].created_at }; io.emit('chat message', messageToSend); } catch (err) { console.error('Failed to save message:', err); } } }); socket.on('disconnect', () => { if (socket.nickname) { delete users[socket.id]; io.emit('update users', Object.values(users)); io.emit('system message', `“${socket.nickname}”离开了聊天室`); } console.log('User disconnected:', socket.id); }); });
async function startServer() { await initializeDatabase(); const PORT = process.env.PORT || 3000; server.listen(PORT, () => { console.log(`Server is running successfully on http://localhost:${PORT}`); }); }
startServer();