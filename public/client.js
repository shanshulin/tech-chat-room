const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { Pool } = require('pg'); // ★ 新增：引入pg库

// --- ★ 新增：数据库连接设置 ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // 从环境变量读取数据库秘密地址
  ssl: {
    rejectUnauthorized: false // Render的数据库需要这个SSL设置
  }
});

// --- ★ 新增：一个函数，用来在程序启动时创建消息表（如果它还不存在） ---
async function setupDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('数据库表格 "messages" 已准备就绪。');
  } catch (err) {
    console.error('创建数据库表格失败:', err);
  } finally {
    client.release();
  }
}

// 启动程序时，先设置好数据库
setupDatabase();


// --- 现有代码，基本不变 ---
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const users = {};

io.on('connection', async (socket) => { // ★ 将连接处理函数变为 async
  console.log('一个用户连接了 id:', socket.id);

  // --- ★ 新增：用户一连接，就去数据库读取最近的50条历史消息 ---
  try {
    const result = await pool.query('SELECT nickname, content FROM messages ORDER BY created_at ASC LIMIT 50');
    // 将历史消息只发送给这个刚刚连接的用户
    result.rows.forEach(msg => {
      socket.emit('chat message', { nickname: msg.nickname, msg: msg.content });
    });
  } catch (err) {
    console.error('读取历史消息失败:', err);
  }


  // --- 修改：当用户发送消息时，先存入数据库，再广播出去 ---
  socket.on('chat message', async (msg) => { // ★ 将消息处理函数变为 async
    if (socket.nickname) {
      try {
        // 1. 存入数据库 (写入记事本)
        await pool.query('INSERT INTO messages (nickname, content) VALUES ($1, $2)', [socket.nickname, msg]);
        
        // 2. 广播给所有在线用户 (大声喊出来)
        io.emit('chat message', { nickname: socket.nickname, msg: msg });
      } catch (err) {
        console.error('保存消息到数据库失败:', err);
      }
    }
  });


  // --- 以下代码与之前版本相同 ---
  socket.on('join', (nickname) => {
    socket.nickname = nickname;
    users[socket.id] = nickname;
    io.emit('system message', `${nickname} 加入了聊天室`);
    io.emit('update users', Object.values(users));
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器正在 http://localhost:${PORT} 上运行`);
});