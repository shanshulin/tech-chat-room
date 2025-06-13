const express = require('express');
const http = require('http'); // ★ 改变 1: 直接引入整个 http 模块
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app); // ★ 改变 2: 使用 http.createServer
const io = new Server(server);         // ★ 改变 3: 将 server 传递给 socket.io

// --- 数据库连接设置 ---
// ★ 改变 4: 将 Pool 的创建放在最顶层，确保它在整个应用生命周期内是单例
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * 主程序函数
 */
async function main() {
  // 1. 测试并初始化数据库
  try {
    const client = await pool.connect();
    console.log('数据库连接测试成功！');
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    client.release();
    console.log('数据库表格 "messages" 已成功准备就绪。');
  } catch (dbErr) {
    console.error('致命错误：无法初始化数据库！', dbErr);
    process.exit(1); 
  }

  // 2. 设置静态文件服务
  app.use(express.static('public'));
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
  });

  const users = {};

  // 3. 设置 Socket.IO 事件监听
  io.on('connection', async (socket) => {
    console.log('一个用户连接了 id:', socket.id);
    
    // 读取历史消息
    try {
      const result = await pool.query('SELECT nickname, content AS msg FROM messages ORDER BY created_at DESC LIMIT 50');
      const history = result.rows.reverse(); 
      socket.emit('load history', history);
    } catch (err) {
      console.error('读取历史消息失败:', err);
    }
    
    socket.on('join', (nickname) => {
      socket.nickname = nickname;
      users[socket.id] = nickname;
      io.emit('system message', `${nickname} 加入了聊天室`);
      io.emit('update users', Object.values(users));
    });

    socket.on('chat message', async (msg) => {
      if (socket.nickname) {
        try {
          // ★ 改变 5: 使用同一个全局的 pool 对象
          await pool.query('INSERT INTO messages (nickname, content) VALUES ($1, $2)', [socket.nickname, msg]);
          io.emit('chat message', { nickname: socket.nickname, msg: msg });
        } catch (err) {
          console.error('保存消息到数据库失败:', err);
        }
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

  // 4. 启动服务器
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => { // ★ 改变 6: 监听我们新创建的 server
    console.log(`服务器已在 http://localhost:${PORT} 上成功启动并运行`);
  });
}

// 启动主程序
main();