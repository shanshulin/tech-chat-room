const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
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
    process.exit(1);
  }

  app.use(express.static('public'));
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
  });

  const users = {};

  io.on('connection', async (socket) => {
    console.log('一个用户连接了 id:', socket.id);
    
    try {
      // ★ 修改1: 读取历史消息时，把 created_at 也选出来，并重命名为 timestamp
      const result = await pool.query('SELECT nickname, content AS msg, created_at AS timestamp FROM messages ORDER BY created_at DESC LIMIT 50');
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
          // 先存入数据库
          await pool.query('INSERT INTO messages (nickname, content) VALUES ($1, $2)', [socket.nickname, msg]);
          
          // ★ 修改2: 广播新消息时，附上当前的服务器时间
          io.emit('chat message', { 
            nickname: socket.nickname, 
            msg: msg,
            timestamp: new Date() // 附上新创建的时间戳
          });
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

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`服务器已在 http://localhost:${PORT} 上成功启动并运行`);
  });
}

main();