document.addEventListener('DOMContentLoaded', () => {
    // Canvas特效代码已全部移除

    // --- 聊天室逻辑 ---
    const socket = io();
    let myNickname = '';

    // DOM 元素
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
    
    // 注意：发送按钮现在有了一个新ID
    const form = document.querySelector('.chat-input-area');
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('input');
    const messages = document.getElementById('messages');
    const usersList = document.querySelector('#users-list');

    // 切换界面函数
    function switchScreen(screenName) {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        screens[screenName].classList.add('active');
    }

    // 1. 登录
    loginBtn.addEventListener('click', () => {
        if (passwordInput.value === 'MWNMT') {
            switchScreen('nickname');
        } else {
            errorMsg.textContent = '错误: 密码不正确。';
            setTimeout(() => {
                errorMsg.textContent = '';
            }, 3000);
        }
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

    // 3. 发送消息（通过点击或回车）
    function sendMessage() {
        if (input.value) {
            socket.emit('chat message', input.value);
            input.value = '';
            input.focus();
        }
    }
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });


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
});