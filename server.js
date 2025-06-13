const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const fetch = require('node-fetch'); // ★ 新增：引入 node-fetch

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const pool = new Pool({ /* ...数据库连接代码不变... */ });

/**
 * ★ 新增：根据IP地址获取地理位置的函数
 * @param {string} ip 用户的IP地址
 * @returns {string} 格式化的地理位置, e.g., "上海, 中国"
 */
async function getGeoFromIp(ip) {
  // 对本地地址或特殊地址进行处理
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    return '本地';
  }
  // 处理 IPv6-mapped IPv4 地址, e.g., ::ffff:123.123.123.123
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  try {
    // 使用免费的ip-api.com服务，并请求中文结果
    const response = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,country,city`);
    const data = await response.json();
    if (data.status === 'success') {
      // 拼接城市和国家，如果城市不存在则只显示国家
      return data.city ? `${data.city}, ${data.country}` : data.country;
    }
    return '未知地区';
  } catch (error) {
    console.error('IP地理位置查询失败:', error);
    return '未知地区';
  }
}


async function main() {
  // ... main 函数里的数据库初始化代码不变 ...

  app.use(express.static('public'));
  app.get('/', (req, res) => { /* ...代码不变... */ });

  const users = {};

  io.on('connection', async (socket) => {
    // ★ 修改点1: 从 socket.handshake 中获取 IP 地址
    const userIp = socket.handshake.address;
    console.log(`一个用户连接了 id: ${socket.id}, IP: ${userIp}`);
    
    // ... 加载历史记录的代码不变 ...
    
    // ★ 修改点2: 在用户加入时，查询IP并拼接昵称
    socket.on('join', async (nickname) => { // 将这个函数也变成 async
      const location = await getGeoFromIp(userIp);
      const finalNickname = `${nickname} (${location})`; // e.g., "谢bro (上海, 中国)"

      socket.nickname = finalNickname; // 保存最终的、带地区的昵称
      users[socket.id] = finalNickname;

      // 广播时，使用这个最终的昵称
      io.emit('system message', `${finalNickname} 加入了聊天室`);
      io.emit('update users', Object.values(users));
    });

    // ★ 修改点3: 发送消息时，自动使用带地区的昵称
    socket.on('chat message', async (msg) => {
      if (socket.nickname) { // socket.nickname 现在已经是 "xxx (地区)" 的格式了
        try {
          await pool.query('INSERT INTO messages (nickname, content) VALUES ($1, $2)', [socket.nickname, msg]);
          io.emit('chat message', { 
            nickname: socket.nickname, 
            msg: msg,
            timestamp: new Date()
          });
        } catch (err) {
          console.error('保存消息到数据库失败:', err);
        }
      }
    });

    // ... disconnect 事件代码不变 ...
  });
  
  // ... 服务器监听端口的代码不变 ...
}

// 为了方便你直接复制，下面是完整的 server.js 文件
pool.ssl = { rejectUnauthorized: false };
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
main(); // 调用main函数
httpServer.listen(process.env.PORT || 3000, () => {
  console.log(`服务器已在 http://localhost:${process.env.PORT || 3000} 上成功启动并运行`);
});