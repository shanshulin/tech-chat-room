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
        if (input.value && !input.disabled) {
            socket.emit('chat message', input.value);
            input.value = '';
            input.focus();
        }
    }

    function addChatMessage(data) {
        const item = document.createElement('div');
        const nicknameSpan = document.createElement('span');
        nicknameSpan.className = 'nickname';
        nicknameSpan.textContent = `<${data.nickname}>: `;

        item.appendChild(nicknameSpan);
        item.append(document.createTextNode(data.msg));
        
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }

    function addSystemMessage(msg) {
        const item = document.createElement('div');
        item.classList.add('system-message');
        item.textContent = `*** ${msg} ***`;
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }


    // --- 事件绑定 ---
    loginBtn.addEventListener('click', () => {
        if (passwordInput.value === 'MWNMT') {
            switchScreen('nickname');
        } else {
            errorMsg.textContent = '错误: 密码不正确。';
            setTimeout(() => { errorMsg.textContent = ''; }, 3000);
        }
    });
    passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') loginBtn.click(); });

    nicknameBtn.addEventListener('click', () => {
        const nickname = nicknameInput.value.trim();
        if (nickname) {
            myNickname = nickname;
            socket.emit('join', nickname);
            switchScreen('chat');
        }
    });
    nicknameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') nicknameBtn.click(); });

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });


    // --- Socket.IO 核心事件处理 ---

    // ★ 新增：专门处理历史消息加载的事件
    socket.on('load history', (history) => {
        messages.innerHTML = ''; // 先清空消息区
        history.forEach(data => {
            addChatMessage(data);
        });
        // 加载完历史后，显示一条欢迎信息
        addSystemMessage('欢迎来到聊天室！');
    });

    // 接收实时聊天消息
    socket.on('chat message', (data) => {
        addChatMessage(data);
    });

    // 接收系统消息
    socket.on('system message', (msg) => {
        addSystemMessage(msg);
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

    // 处理断线事件
    socket.on('disconnect', () => {
        addSystemMessage('您已断开连接，正在尝试重连...');
        chatWindowTitle.textContent = '糯米团 v1.0 - 正在重新连接...';
        input.disabled = true;
        sendBtn.disabled = true;
    });

    // 处理重连成功事件
    socket.on('connect', () => {
        if (myNickname) {
            chatWindowTitle.textContent = '糯米团 v1.0 - 在线聊天室';
            input.disabled = false;
            sendBtn.disabled = false;
            socket.emit('join', myNickname);
            // 注意：重连后不再显示欢迎信息，因为历史记录不会重新加载
        }
    });
});