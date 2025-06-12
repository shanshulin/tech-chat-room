document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let myNickname = '';

    // --- DOM 元素 ---
    const screens = {
        login: document.getElementById('login-screen'),
        nickname: document.getElementById('nickname-screen'),
        chat: document.getElementById('chat-screen')
    };
    const loginBtn = document.getElementById('login-btn');
    const passwordInput = document.getElementById('password-input');
    const errorMsg = document.getElementById('error-msg');
    const nicknameBtn = document.getElementById('nickname-btn');
    const nicknameInput = document.getElementById('nickname-input');
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('input');
    const messages = document.getElementById('messages');
    const usersList = document.querySelector('#users-list');
    const chatWindowTitle = document.querySelector('#chat-screen .title-bar-text');

    // --- 核心功能函数 ---
    function switchScreen(screenName) {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        screens[screenName].classList.add('active');
    }

    function sendMessage() {
        if (input.value && !input.disabled) { // 增加一个判断，如果输入框被禁用了就不发送
            socket.emit('chat message', input.value);
            input.value = '';
            input.focus();
        }
    }

    // --- 事件绑定 ---
    // 1. 登录
    loginBtn.addEventListener('click', () => {
        if (passwordInput.value === 'MWNMT') { switchScreen('nickname'); } 
        else { errorMsg.textContent = '错误: 密码不正确。'; setTimeout(() => { errorMsg.textContent = ''; }, 3000); }
    });
    passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') loginBtn.click(); });

    // 2. 设置昵称
    nicknameBtn.addEventListener('click', () => {
        const nickname = nicknameInput.value.trim();
        if (nickname) {
            myNickname = nickname;
            socket.emit('join', nickname);
            switchScreen('chat');
        }
    });
    nicknameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') nicknameBtn.click(); });

    // 3. 发送消息
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });

    // --- Socket.IO 核心事件处理 ---

    // 接收聊天消息
    socket.on('chat message', (data) => {
        const item = document.createElement('div');
        const nicknameSpan = document.createElement('span');
        nicknameSpan.className = 'nickname';
        nicknameSpan.textContent = `<${data.nickname}>: `;
        item.appendChild(nicknameSpan);
        item.append(document.createTextNode(data.msg));
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });

    // 接收系统消息
    socket.on('system message', (msg) => {
        const item = document.createElement('div');
        item.classList.add('system-message');
        item.textContent = `*** ${msg} ***`;
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });
    
    // 更新在线用户列表
    socket.on('update users', (users) => {
        usersList.innerHTML = '';
        users.forEach(user => {
            const item = document.createElement('li');
            item.textContent = user;
            usersList.appendChild(item);
        });
    });

    // ★★★ 新增：处理断线事件 ★★★
    socket.on('disconnect', () => {
        chatWindowTitle.textContent = '正在重新连接...'; // 给用户一个视觉反馈
        input.disabled = true; // 禁用输入框，防止发送消息
        sendBtn.disabled = true; // 禁用发送按钮
    });

    // ★★★ 新增：处理重连成功事件 ★★★
    socket.on('connect', () => {
        // 如果用户之前已经设置过昵称，说明他是在中途断线后重连的
        if (myNickname) {
            chatWindowTitle.textContent = '重连成功！正在重新加入...';
            input.disabled = false;
            sendBtn.disabled = false;
            // 关键一步：带着之前的昵称，重新加入房间
            socket.emit('join', myNickname); 
        }
        // 如果 myNickname 是空的，说明是用户第一次连接，不需要做任何事
    });
});