document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let myNickname = '';

    // ★ 全新的、包含20个颜文字的列表 ★
    const KAOMOJI_MAP = {
        // --- 开心 & 喜悦 ---
        ':happy:': '(^▽^)',
        ':lol:': 'o(>▽<)o',
        ':love:': '(｡♥‿♥｡)',
        ':excited:': '(*^▽^*)',
        ':proud:': '(´_ゝ`)', // Smug face

        // --- 悲伤 & 哭泣 ---
        ':sad:': '(T_T)',
        ':cry:': '(；′⌒`)',
        ':sob:': '༼ಢ_ಢ༽',

        // --- 惊讶 & 无语 ---
        ':wow:': 'Σ(°ロ°)',
        ':speechless:': '(－_－) zzZ',
        ':confused:': '(°_°)?',

        // --- 动作 & 互动 ---
        ':wave:': '(^_^)/',
        ':ok:': 'd(^_^o)',
        ':sorry:': 'm(_ _)m',
        ':run:': 'ε=ε=┌( >_<)┘',
        ':tableflip:': '(╯°□°）╯︵ ┻━┻',

        // --- 其他 & 可爱 ---
        ':cat:': '(=^ェ^=)',
        ':bear:': 'ʕ •ᴥ•ʔ',
        ':note:': 'ヾ( ´ A ` )ﾉ',
        ':sleepy:': '(´-ω-`)'
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
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPanel = document.getElementById('emoji-panel');

    // --- 核心功能函数 ---
    function switchScreen(screenName) { Object.values(screens).forEach(screen => screen.classList.remove('active')); screens[screenName].classList.add('active'); }
    function sendMessage() { if (input.value && !input.disabled) { socket.emit('chat message', input.value); input.value = ''; input.focus(); } }
    function addSystemMessage(msg) { const item = document.createElement('div'); item.classList.add('system-message'); item.textContent = `*** ${msg} ***`; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
    
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

        let finalMessage = data.msg;
        for (const code in KAOMOJI_MAP) {
            const kaomoji = KAOMOJI_MAP[code];
            const escapedCode = code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(escapedCode, 'g');
            finalMessage = finalMessage.replace(regex, kaomoji);
        }

        const contentSpan = document.createElement('span');
        contentSpan.textContent = finalMessage;

        item.appendChild(timestampSpan);
        item.appendChild(nicknameSpan);
        item.appendChild(contentSpan);
        
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }

    // --- 表情面板的逻辑 ---
    emojiPanel.innerHTML = '';
    for (const code in KAOMOJI_MAP) {
        const kaomoji = KAOMOJI_MAP[code];
        const panelItem = document.createElement('div');
        panelItem.className = 'emoji-item';
        panelItem.textContent = kaomoji;
        panelItem.title = code;
        panelItem.addEventListener('click', () => {
            input.value += ` ${code} `;
            input.focus();
            emojiPanel.classList.add('hidden');
        });
        emojiPanel.appendChild(panelItem);
    }
    emojiBtn.textContent = '(^o^)/';


    // --- 事件绑定和Socket.IO处理 ---
    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPanel.classList.toggle('hidden'); });
    document.addEventListener('click', () => { if (!emojiPanel.classList.contains('hidden')) { emojiPanel.classList.add('hidden'); } });
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