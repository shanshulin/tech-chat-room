document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let myNickname = '';

    const KAOMOJI_MAP = {
        ':happy:': '(^▽^)', ':lol:': 'o(>▽<)o', ':love:': '(｡♥‿♥｡)', ':excited:': '(*^▽^*)', ':proud:': '(´_ゝ`)',
        ':sad:': '(T_T)', ':cry:': '(；′⌒`)', ':sob:': '༼ಢ_ಢ༽', ':wow:': 'Σ(°ロ°)', ':speechless:': '(－_－) zzZ',
        ':confused:': '(°_°)?', ':wave:': '(^_^)/', ':ok:': 'd(^_^o)', ':sorry:': 'm(_ _)m', ':run:': 'ε=ε=┌( >_<)┘',
        ':tableflip:': '(╯°□°）╯︵ ┻━┻', ':cat:': '(=^ェ^=)', ':bear:': 'ʕ •ᴥ•ʔ', ':note:': 'ヾ( ´ A ` )ﾉ', ':sleepy:': '(´-ω-`)'
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
    const imageBtn = document.getElementById('image-btn');
    const imageUploadInput = document.getElementById('image-upload-input');

    // ★★★ 新增：获取模态框相关元素 ★★★
    const imageModal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    const closeBtn = document.querySelector('.close-btn');

    // --- 核心功能函数 ---
    function switchScreen(screenName) { Object.values(screens).forEach(screen => screen.classList.remove('active')); screens[screenName].classList.add('active'); }
    function sendMessage() { if (input.value && !input.disabled) { socket.emit('chat message', { type: 'text', msg: input.value }); input.value = ''; input.focus(); } }
    function addSystemMessage(msg) { const item = document.createElement('div'); item.classList.add('system-message'); item.textContent = `*** ${msg} ***`; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }

    function addChatMessage(data) {
        const item = document.createElement('div');
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        // 如果历史记录里有时间戳就用，实时消息则用当前时间
        const date = new Date(data.created_at || Date.now()); 
        const year = date.getFullYear(); const month = date.getMonth() + 1; const day = date.getDate();
        const hours = String(date.getHours()).padStart(2, '0'); const minutes = String(date.getMinutes()).padStart(2, '0');
        timestampSpan.textContent = `${year}/${month}/${day} ${hours}:${minutes}`;

        const nicknameSpan = document.createElement('span');
        nicknameSpan.className = 'nickname';
        nicknameSpan.textContent = `<${data.nickname}>: `;

        const contentSpan = document.createElement('span');

        if (data.message_type === 'image') {
            const img = document.createElement('img');
            img.src = data.msg;
            img.className = 'chat-image';
            img.onload = () => messages.scrollTop = messages.scrollHeight;
            contentSpan.appendChild(img);
        } else {
            let finalMessage = data.msg;
            for (const code in KAOMOJI_MAP) {
                const regex = new RegExp(code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
                finalMessage = finalMessage.replace(regex, KAOMOJI_MAP[code]);
            }
            contentSpan.textContent = finalMessage;
        }

        item.appendChild(timestampSpan);
        item.appendChild(nicknameSpan);
        item.appendChild(contentSpan);
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }

    async function uploadImage(file) {
        if (!file || !file.type.startsWith('image/')) return;
        addSystemMessage(`正在上传图片: ${file.name || 'clipboard_image.png'}...`);
        const formData = new FormData();
        formData.append('image', file);
        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('上传失败，服务器错误。');
            const result = await response.json();
            socket.emit('chat message', { type: 'image', msg: result.imageUrl });
        } catch (error) {
            console.error('上传出错:', error);
            addSystemMessage(`图片上传失败。`);
        }
    }

    // --- 事件绑定 ---
    // ★★★ 新增：图片点击和模态框关闭逻辑 ★★★
    messages.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('chat-image')) {
            imageModal.classList.add('active');
            modalImg.src = e.target.src;
        }
    });
    closeBtn.addEventListener('click', () => { imageModal.classList.remove('active'); });
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) { imageModal.classList.remove('active'); } });
    document.addEventListener('keydown', (e) => { if (e.key === "Escape" && imageModal.classList.contains('active')) { imageModal.classList.remove('active'); } });

    // 你已有的事件绑定
    imageBtn.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', (event) => { const file = event.target.files[0]; if (file) uploadImage(file); event.target.value = ''; });
    input.addEventListener('paste', (event) => { const items = (event.clipboardData || window.clipboardData).items; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { event.preventDefault(); const blob = items[i].getAsFile(); if(blob) uploadImage(blob); return; } } });
    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPanel.classList.toggle('hidden'); });
    document.addEventListener('click', () => { if (!emojiPanel.classList.contains('hidden')) emojiPanel.classList.add('hidden'); });
    loginBtn.addEventListener('click', () => { if (passwordInput.value === 'MWNMT') { switchScreen('nickname'); } else { errorMsg.textContent = '错误: 密码不正确。'; setTimeout(() => { errorMsg.textContent = ''; }, 3000); } });
    passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') loginBtn.click(); });
    nicknameBtn.addEventListener('click', () => { const nickname = nicknameInput.value.trim(); if (nickname) { myNickname = nickname; socket.emit('join', nickname); switchScreen('chat'); } });
    nicknameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') nicknameBtn.click(); });
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });

    // --- 表情面板 ---
    emojiPanel.innerHTML = '';
    for (const code in KAOMOJI_MAP) { const kaomoji = KAOMOJI_MAP[code]; const panelItem = document.createElement('div'); panelItem.className = 'emoji-item'; panelItem.textContent = kaomoji; panelItem.title = code; panelItem.addEventListener('click', () => { input.value += ` ${code} `; input.focus(); emojiPanel.classList.add('hidden'); }); emojiPanel.appendChild(panelItem); }

    // --- Socket.IO 事件处理 ---
    socket.on('load history', (history) => { messages.innerHTML = ''; history.forEach(data => addChatMessage(data)); addSystemMessage('欢迎来到聊天室！'); });
    socket.on('chat message', (data) => addChatMessage(data));
    socket.on('system message', (msg) => addSystemMessage(msg));
    socket.on('update users', (users) => { usersList.innerHTML = ''; users.forEach(user => { const item = document.createElement('li'); item.textContent = user; usersList.appendChild(item); }); });
    socket.on('disconnect', () => { addSystemMessage('您已断开连接，正在尝试重连...'); chatWindowTitle.textContent = '糯米团 v1.0 - 正在重新连接...'; input.disabled = true; sendBtn.disabled = true; });
    socket.on('connect', () => { if (myNickname) { chatWindowTitle.textContent = '糯米团 v1.0 - 在线聊天室'; input.disabled = false; sendBtn.disabled = false; socket.emit('join', myNickname); } });
});