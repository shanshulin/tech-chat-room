document.addEventListener('DOMContentLoaded', () => {
    // ▼▼▼ 核心修改：优化 Socket.IO 的重连策略 ▼▼▼
    const socket = io({
        reconnection: true,             // 确保自动重连开启
        reconnectionDelay: 1000,        // 首次重连前等待1秒
        reconnectionDelayMax: 5000,     // 每次重连尝试之间的最长等待时间为5秒
        reconnectionAttempts: Infinity  // 永不放弃重连
    });
    // ▲▲▲ 修改结束 ▲▲▲

    let myNickname = '';

    const KAOMOJI_MAP = { ':happy:': '(^▽^)', ':lol:': 'o(>▽<)o', ':love:': '(｡♥‿♥｡)', ':excited:': '(*^▽^*)', ':proud:': '(´_ゝ`)', ':sad:': '(T_T)', ':cry:': '(；′⌒`)', ':sob:': '༼ಢ_ಢ༽', ':wow:': 'Σ(°ロ°)', ':speechless:': '(－_－) zzZ', ':confused:': '(°_°)?', ':wave:': '(^_^)/', ':ok:': 'd(^_^o)', ':sorry:': 'm(_ _)m', ':run:': 'ε=ε=┌( >_<)┘', ':tableflip:': '(╯°□°）╯︵ ┻━┻', ':cat:': '(=^ェ^=)', ':bear:': 'ʕ •ᴥ•ʔ', ':note:': 'ヾ( ´ A ` )ﾉ', ':sleepy:': '(´-ω-`)' };

    // --- DOM 元素 ---
    const screens = { login: document.getElementById('login-screen'), nickname: document.getElementById('nickname-screen'), chat: document.getElementById('chat-screen'), search: document.getElementById('search-window') };
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
    const imageModal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    const closeBtn = document.querySelector('.close-btn');
    const searchBtn = document.getElementById('search-btn');
    const searchWindow = document.getElementById('search-window');
    const searchCloseBtn = document.getElementById('search-close-btn');
    const searchUsername = document.getElementById('search-username');
    const searchKeyword = document.getElementById('search-keyword');
    const searchYear = document.getElementById('search-year');
    const searchMonth = document.getElementById('search-month');
    const searchDay = document.getElementById('search-day');
    const executeSearchBtn = document.getElementById('execute-search-btn');
    const searchResults = document.getElementById('search-results');

    // --- 核心功能函数 ---
    function switchScreen(screenName) { Object.values(screens).forEach(screen => screen.classList.remove('active')); screens[screenName].classList.add('active'); }
    function sendMessage() { if (input.value && !input.disabled) { socket.emit('chat message', { type: 'text', msg: input.value }); input.value = ''; input.focus(); } }
    function addSystemMessage(msg) { const item = document.createElement('div'); item.classList.add('system-message'); item.textContent = `*** ${msg} ***`; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }

    function createChatMessageElement(data) {
        const item = document.createElement('div');
        item.className = 'message-item';
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        const date = new Date(data.created_at || Date.now());
        timestampSpan.textContent = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        const nicknameSpan = document.createElement('span');
        nicknameSpan.className = 'nickname';
        nicknameSpan.textContent = `<${data.nickname}>: `;
        const contentSpan = document.createElement('span');
        
        const messageContent = data.msg || '';

        if (data.message_type === 'image') {
            const img = document.createElement('img');
            img.src = messageContent;
            img.className = 'chat-image';
            contentSpan.appendChild(img);
        } else {
            let finalMessage = messageContent;
            for (const code in KAOMOJI_MAP) {
                const regex = new RegExp(code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
                finalMessage = finalMessage.replace(regex, KAOMOJI_MAP[code]);
            }
            contentSpan.textContent = finalMessage;
        }
        item.appendChild(timestampSpan); item.appendChild(nicknameSpan); item.appendChild(contentSpan);
        return item;
    }

    function addChatMessage(data) { const item = createChatMessageElement(data); messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
    async function uploadImage(file) { if (!file || !file.type.startsWith('image/')) return; addSystemMessage(`正在上传图片: ${file.name || 'clipboard_image.png'}...`); const formData = new FormData(); formData.append('image', file); try { const response = await fetch('/upload', { method: 'POST', body: formData }); if (!response.ok) throw new Error('上传失败'); const result = await response.json(); socket.emit('chat message', { type: 'image', msg: result.imageUrl }); } catch (error) { console.error('上传出错:', error); addSystemMessage(`图片上传失败。`); } }
    function populateDateSelectors() { const currentYear = new Date().getFullYear(); searchYear.innerHTML = '<option value="any">所有年份</option>'; for (let y = currentYear; y >= 2023; y--) { searchYear.innerHTML += `<option value="${y}">${y}年</option>`; } searchMonth.innerHTML = '<option value="any">所有月份</option>'; for (let m = 1; m <= 12; m++) { searchMonth.innerHTML += `<option value="${m}">${m}月</option>`; } searchDay.innerHTML = '<option value="any">所有日期</option>'; for (let d = 1; d <= 31; d++) { searchDay.innerHTML += `<option value="${d}">${d}日</option>`; } }

    // --- 事件绑定 ---
    messages.addEventListener('click', (e) => { if (e.target && e.target.classList.contains('chat-image')) { imageModal.classList.add('active'); modalImg.src = e.target.src; } });
    closeBtn.addEventListener('click', () => { imageModal.classList.remove('active'); });
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) { imageModal.classList.remove('active'); } });
    document.addEventListener('keydown', (e) => { if (e.key === "Escape" && (imageModal.classList.contains('active') || searchWindow.classList.contains('active'))) { imageModal.classList.remove('active'); searchWindow.classList.remove('active'); } });
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
    searchBtn.addEventListener('click', () => { searchWindow.classList.add('active'); });
    searchCloseBtn.addEventListener('click', () => { searchWindow.classList.remove('active'); });
    executeSearchBtn.addEventListener('click', async () => {
        const queryParams = new URLSearchParams({
            username: searchUsername.value.trim(),
            keyword: searchKeyword.value.trim(),
            year: searchYear.value,
            month: searchMonth.value,
            day: searchDay.value
        });
        searchResults.innerHTML = '正在查询中...';
        try {
            const response = await fetch(`/api/search?${queryParams.toString()}`);
            if (!response.ok) throw new Error('查询失败');
            const results = await response.json();
            searchResults.innerHTML = '';
            if (results.length === 0) { searchResults.innerHTML = '没有找到匹配的记录。'; } 
            else { results.forEach(record => { const item = createChatMessageElement(record); searchResults.appendChild(item); }); }
        } catch(err) { searchResults.innerHTML = '查询出错，请稍后再试。'; console.error('Search error:', err); }
    });

    // --- 初始化 ---
    populateDateSelectors();
    for (const code in KAOMOJI_MAP) { const kaomoji = KAOMOJI_MAP[code]; const panelItem = document.createElement('div'); panelItem.className = 'emoji-item'; panelItem.textContent = kaomoji; panelItem.title = code; panelItem.addEventListener('click', () => { input.value += ` ${code} `; input.focus(); emojiPanel.classList.add('hidden'); }); emojiPanel.appendChild(panelItem); }

    // --- Socket.IO 事件处理 ---
    socket.on('load history', (history) => { messages.innerHTML = ''; history.forEach(data => addChatMessage(data)); addSystemMessage('欢迎来到聊天室！'); });
    socket.on('chat message', (data) => addChatMessage(data));
    socket.on('system message', (msg) => addSystemMessage(msg));
    socket.on('update users', (users) => { usersList.innerHTML = ''; users.forEach(user => { const item = document.createElement('li'); item.textContent = user; usersList.appendChild(item); }); });
    socket.on('disconnect', () => { addSystemMessage('您已断开连接，正在尝试重连...'); chatWindowTitle.textContent = '糯米团 v1.0 - 正在重新连接...'; input.disabled = true; sendBtn.disabled = true; });
    
    // 这个事件现在可以更可靠地被触发了
    socket.on('connect', () => { 
        if (myNickname) { 
            chatWindowTitle.textContent = '糯米团 v1.0 - 在线聊天室'; 
            input.disabled = false; 
            sendBtn.disabled = false; 
            socket.emit('join', myNickname); 
        } 
    });
});