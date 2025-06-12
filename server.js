const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// --- 数据库连接设置 ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * 主程序函数，封装了所有启动逻辑
 */
async function main() {
  // 1. 确保数据库表格已就绪
  try {
    const client = await pool.connect();
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
    console.error('致命错误：无法初始化数据库！应用将退出。', dbErr);
    process.exit(1); // 如果数据库都连不上，直接退出程序，防止应用以错误状态运行
  }

  // 2. 设置静态文件服务
  app.use(express.static('public'));
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
  });

  const users = {};

  // 3. 设置 Socket.IO 的事件监听
  io.on('connection', async (socket) => {
    console.log('一个用户连接了 id:', socket.id);
    
    // 当新用户连接时，读取并发送最近的50条历史消息
    try {
      const result = await pool.query('SELECT nickname, content AS msg FROM messages ORDER BY created_at DESC LIMIT 50');
      // 从数据库是倒序读的 (最新在前)，需要反转成正序 (最旧在前) 发送给前端
      const history = result.rows.reverse(); 
      socket.emit('load history', history); // 使用一个专门的事件来加载历史
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
          // 先存入数据库
          await pool.query('INSERT INTO messages (nickname, content) VALUES ($1, $2)', [socket.nickname, msg]);
          // 再广播给所有在线用户
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

  // 4. 所有都准备好后，才开始监听端口
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`服务器已在 http://localhost:${PORT} 上成功启动并运行`);
  });
}

// 启动主程序
main();