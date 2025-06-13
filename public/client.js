document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let myNickname = '';

    // ★ 定义我们的表情包和它们的Unicode字符
    const EMOJI_MAP = {
        ':smile:': '😀',
        ':joy:': '😂',
        ':heart_eyes:': '😍',
        ':thinking:': '🤔',
        ':thumbsup:': '👍',
        ':tada:': '🎉',
        ':sob:': '😭',
        ':fire:': '🔥',
    };

    // --- DOM 元素 ---
    const screens = { login: document.getElementById('login-screen'), nickname: document.getElementById('nickname-screen'), chat: document.getElementById('chat-screen') };
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
    // ★ 表情相关的DOM元素
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPanel = document.getElementById('emoji-panel');


    // --- 核心功能函数 ---
    function switchScreen(screenName) { Object.values(screens).forEach(screen => screen.classList.remove('active')); screens[screenName].classList.add('active'); }
    function sendMessage() { if (input.value && !input.disabled) { socket.emit('chat message', input.value); input.value = ''; input.focus(); } }
    function addSystemMessage(msg) { const item = document.createElement('div'); item.classList.add('system-message'); item.textContent = `*** ${msg} ***`; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
    

    // ★ 升级 addChatMessage 函数来“翻译”表情代码
    function addChatMessage(data) {
        const item = document.createElement('div');

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        const date = new Date(data.created_at);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        timestampSpan.textContent = `${year}/${month}/${day} ${hours}:${minutes}`;
        
        const nicknameSpan = document.createElement('span');
        nicknameSpan.className = 'nickname';
        nicknameSpan.textContent = `<${data.nickname}>: `;

        item.appendChild(timestampSpan);
        item.appendChild(nicknameSpan);
        
        // --- 表情翻译魔法发生在这里 ---
        const messageParts = data.msg.split(/(\s+)/); // 按空白符分割，并保留分隔符
        messageParts.forEach(part => {
            if (EMOJI_MAP[part]) {
                const emojiImg = document.createElement('img');
                const emojiUnicode = EMOJI_MAP[part];
                emojiImg.src = `https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/${emojiUnicode.codePointAt(0).toString(16)}.png`;
                emojiImg.alt = part;
                emojiImg.style.width = '20px';
                emojiImg.style.height = '20px';
                emojiImg.style.verticalAlign = 'middle';
                item.appendChild(emojiImg);
            } else {
                item.append(document.createTextNode(part));
            }
        });
        
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }


    // --- 表情面板的逻辑 ---
    for (const code in EMOJI_MAP) {
        const emoji = EMOJI_MAP[code];
        const img = document.createElement('img');
        img.src = `https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/${emoji.codePointAt(0).toString(16)}.png`;
        img.alt = code;
        img.className = 'emoji-item';
        img.title = code;
        img.addEventListener('click', () => {
            input.value += ` ${code} `;
            input.focus();
            emojiPanel.classList.add('hidden');
        });
        emojiPanel.appendChild(img);
    }
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPanel.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
        if (!emojiPanel.classList.contains('hidden')) {
            emojiPanel.classList.add('hidden');
        }
    });

    // --- 事件绑定 ---
    loginBtn.addEventListener('click', () => { if (passwordInput.value === 'MWNMT') { switchScreen('nickname'); } else { errorMsg.textContent = '错误: 密码不正确。'; setTimeout(() => { errorMsg.textContent = ''; }, 3000); } });
    passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') loginBtn.click(); });
    nicknameBtn.addEventListener('click', () => { const nickname = nicknameInput.value.trim(); if (nickname) { myNickname = nickname; socket.emit('join', nickname); switchScreen('chat'); } });
    nicknameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') nicknameBtn.click(); });
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });

    // --- Socket.IO 核心事件处理 ---
    socket.on('load history', (history) => { messages.innerHTML = ''; history.forEach(data => { addChatMessage(data); }); addSystemMessage('欢迎来到聊天室！'); });
    socket.on('chat message', (data) => { addChatMessage(data); });
    socket.on('system message', (msg) => { addSystemMessage(msg); });
    socket.on('update users', (users) => { usersList.innerHTML = ''; users.forEach(user => { const item = document.createElement('li'); item.textContent = user; usersList.appendChild(item); }); });
    socket.on('disconnect', () => { addSystemMessage('您已断开连接，正在尝试重连...'); chatWindowTitle.textContent = '糯米团 v1.0 - 正在重新连接...'; input.disabled = true; sendBtn.disabled = true; });
    socket.on('connect', () => { if (myNickname) { chatWindowTitle.textContent = '糯米团 v1.0 - 在线聊天室'; input.disabled = false; sendBtn.disabled = false; socket.emit('join', myNickname); } });
});