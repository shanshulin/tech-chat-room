const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// 告诉服务器，所有前端文件都在 'public' 文件夹里
app.use(express.static('public'));

// 当用户访问网站根目录时，发送 index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// 用来存储在线用户的昵称
const users = {};

// 当有一个新的用户连接上服务器时
io.on('connection', (socket) => {
  console.log('一个用户连接了 id:', socket.id);

  // 监听'join'事件，当用户设置好昵称后触发
  socket.on('join', (nickname) => {
    socket.nickname = nickname;
    users[socket.id] = nickname;
    // 向所有客户端广播，有人加入了
    io.emit('system message', `${nickname} 加入了聊天室`);
    // 向所有客户端广播，更新在线用户列表
    io.emit('update users', Object.values(users));
  });

  // 监听'chat message'事件，当用户发送消息时触发
  socket.on('chat message', (msg) => {
    // 向所有客户端广播这条消息和发送者的昵称
    io.emit('chat message', { nickname: socket.nickname, msg: msg });
  });

  // 监听'disconnect'事件，当用户断开连接时触发
  socket.on('disconnect', () => {
    if (socket.nickname) {
      console.log(socket.nickname + ' 断开了连接');
      // 从用户列表中移除
      delete users[socket.id];
      // 向所有客户端广播，有人离开了
      io.emit('system message', `${socket.nickname} 离开了聊天室`);
      // 向所有客户端广播，更新在线用户列表
      io.emit('update users', Object.values(users));
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`服务器正在 http://localhost:${PORT} 上运行`);
});