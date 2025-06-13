document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let myNickname = '';

    const screens = { /* ...代码不变... */ };
    // ... 其他DOM元素获取代码不变 ...
    const messages = document.getElementById('messages');
    
    // ★ 修改1: 修改 addChatMessage 函数来处理和显示时间戳
    function addChatMessage(data) {
        const item = document.createElement('div');
        item.className = 'message-item'; // 给消息项一个容器类

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'content-wrapper';

        const nicknameSpan = document.createElement('span');
        nicknameSpan.className = 'nickname';
        nicknameSpan.textContent = `<${data.nickname}>: `;

        contentWrapper.appendChild(nicknameSpan);
        contentWrapper.append(document.createTextNode(data.msg));
        
        item.appendChild(contentWrapper);

        // 如果有时间戳，就创建并添加时间戳元素
        if (data.timestamp) {
            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'timestamp';
            // 将ISO格式的时间字符串转换为更易读的本地时间格式 (例如: 14:30)
            timestampSpan.textContent = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            item.appendChild(timestampSpan);
        }
        
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }
    
    // ...其他所有函数和事件绑定代码保持不变...

    // 以下为完整的 client.js 代码，方便你直接复制
    const loginBtn = document.getElementById('login-btn');
    const passwordInput = document.getElementById('password-input');
    const errorMsg = document.getElementById('error-msg');
    const nicknameBtn = document.getElementById('nickname-btn');
    const nicknameInput = document.getElementById('nickname-input');
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('input');
    const usersList = document.querySelector('#users-list');
    const chatWindowTitle = document.querySelector('#chat-screen .title-bar-text');

    function switchScreen(screenName) { Object.values(screens).forEach(screen => screen.classList.remove('active')); screens[screenName].classList.add('active'); }
    function sendMessage() { if (input.value && !input.disabled) { socket.emit('chat message', input.value); input.value = ''; input.focus(); } }
    function addSystemMessage(msg) { const item = document.createElement('div'); item.classList.add('system-message'); item.textContent = `*** ${msg} ***`; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }

    loginBtn.addEventListener('click', () => { if (passwordInput.value === 'MWNMT') { switchScreen('nickname'); } else { errorMsg.textContent = '错误: 密码不正确。'; setTimeout(() => { errorMsg.textContent = ''; }, 3000); } });
    passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') loginBtn.click(); });
    nicknameBtn.addEventListener('click', () => { const nickname = nicknameInput.value.trim(); if (nickname) { myNickname = nickname; socket.emit('join', nickname); switchScreen('chat'); } });
    nicknameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') nicknameBtn.click(); });
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });

    socket.on('load history', (history) => { messages.innerHTML = ''; history.forEach(data => { addChatMessage(data); }); addSystemMessage('欢迎来到聊天室！'); });
    socket.on('chat message', (data) => { addChatMessage(data); });
    socket.on('system message', (msg) => { addSystemMessage(msg); });
    socket.on('update users', (users) => { usersList.innerHTML = ''; users.forEach(user => { const item = document.createElement('li'); item.textContent = user; usersList.appendChild(item); }); });
    socket.on('disconnect', () => { addSystemMessage('您已断开连接，正在尝试重连...'); chatWindowTitle.textContent = '糯米团 v1.0 - 正在重新连接...'; input.disabled = true; sendBtn.disabled = true; });
    socket.on('connect', () => { if (myNickname) { chatWindowTitle.textContent = '糯米团 v1.0 - 在线聊天室'; input.disabled = false; sendBtn.disabled = false; socket.emit('join', myNickname); } });
});