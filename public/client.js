document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素 ---
    const chatAppIcon = document.getElementById('chat-app-icon');
    const clockElement = document.getElementById('clock');
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
    const loginCloseBtn = document.getElementById('login-close-btn');
    const nicknameCloseBtn = document.getElementById('nickname-close-btn');
    const chatCloseBtn = document.getElementById('chat-close-btn');

    // ▼▼▼ 新增：获取新添加的DOM元素 ▼▼▼
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const taskbarApps = document.getElementById('taskbar-apps');
    // ▲▲▲ 新增结束 ▲▲▲

    // --- 状态变量 ---
    const socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, reconnectionAttempts: Infinity });
    let myNickname = sessionStorage.getItem('nickname') || ''; // 从sessionStorage恢复昵称
    const KAOMOJI_MAP = { ':happy:': '(^▽^)', ':lol:': 'o(>▽<)o', ':love:': '(｡♥‿♥｡)', ':excited:': '(*^▽^*)', ':proud:': '(´_ゝ`)', ':sad:': '(T_T)', ':cry:': '(；′⌒`)', ':sob:': '༼ಢ_ಢ༽', ':wow:': 'Σ(°ロ°)', ':speechless:': '(－_－) zzZ', ':confused:': '(°_°)?', ':wave:': '(^_^)/', ':ok:': 'd(^_^o)', ':sorry:': 'm(_ _)m', ':run:': 'ε=ε=┌( >_<)┘', ':tableflip:': '(╯°□°）╯︵ ┻━┻', ':cat:': '(=^ェ^=)', ':bear:': 'ʕ •ᴥ•ʔ', ':note:': 'ヾ( ´ A ` )ﾉ', ':sleepy:': '(´-ω-`)' };

    // --- 核心功能函数 ---
    function switchScreen(screenName) { Object.values(screens).forEach(screen => screen.classList.remove('active')); if (screens[screenName]) screens[screenName].classList.add('active'); }
    function sendMessage() { if (input.value && !input.disabled) { socket.emit('chat message', { type: 'text', msg: input.value }); input.value = ''; input.focus(); } }
    function addSystemMessage(msg) { const item = document.createElement('div'); item.classList.add('system-message'); item.textContent = `*** ${msg} ***`; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
    function createChatMessageElement(data) { const item = document.createElement('div'); item.className = 'message-item'; const timestampSpan = document.createElement('span'); timestampSpan.className = 'timestamp'; const date = new Date(data.created_at || Date.now()); timestampSpan.textContent = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; const nicknameSpan = document.createElement('span'); nicknameSpan.className = 'nickname'; nicknameSpan.textContent = `<${data.nickname}>: `; const contentSpan = document.createElement('span'); const messageContent = data.msg || ''; if (data.message_type === 'image') { const img = document.createElement('img'); img.src = messageContent; img.className = 'chat-image'; contentSpan.appendChild(img); } else { let finalMessage = messageContent; for (const code in KAOMOJI_MAP) { const regex = new RegExp(code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'); finalMessage = finalMessage.replace(regex, KAOMOJI_MAP[code]); } contentSpan.textContent = finalMessage; } item.appendChild(timestampSpan); item.appendChild(nicknameSpan); item.appendChild(contentSpan); return item; }
    function addChatMessage(data) { const item = createChatMessageElement(data); messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
    async function uploadImage(file) { if (!file || !file.type.startsWith('image/')) return; addSystemMessage(`正在上传图片: ${file.name || 'clipboard_image.png'}...`); const formData = new FormData(); formData.append('image', file); try { const response = await fetch('/upload', { method: 'POST', body: formData }); if (!response.ok) throw new Error('上传失败'); const result = await response.json(); socket.emit('chat message', { type: 'image', msg: result.imageUrl }); } catch (error) { console.error('上传出错:', error); addSystemMessage(`图片上传失败。`); } }
    function populateDateSelectors() { const currentYear = new Date().getFullYear(); searchYear.innerHTML = '<option value="any">所有年份</option>'; for (let y = currentYear; y >= 2023; y--) { searchYear.innerHTML += `<option value="${y}">${y}年</option>`; } searchMonth.innerHTML = '<option value="any">所有月份</option>'; for (let m = 1; m <= 12; m++) { searchMonth.innerHTML += `<option value="${m}">${m}月</option>`; } searchDay.innerHTML = '<option value="any">所有日期</option>'; for (let d = 1; d <= 31; d++) { searchDay.innerHTML += `<option value="${d}">${d}日</option>`; } }
    function updateClock() { const now = new Date(); const hours = String(now.getHours()).padStart(2, '0'); const minutes = String(now.getMinutes()).padStart(2, '0'); clockElement.textContent = `${hours}:${minutes}`; }

    // ▼▼▼ 新增：打开聊天窗口的函数，封装重复逻辑 ▼▼▼
    function openChatWindow() {
        switchScreen('chat'); // 显示聊天窗口

        // 如果任务栏标签不存在，则创建一个
        if (!document.getElementById('chat-taskbar-tab')) {
            const taskbarTab = document.createElement('button');
            taskbarTab.id = 'chat-taskbar-tab';
            taskbarTab.className = 'taskbar-tab active'; // 初始为激活状态
            taskbarTab.textContent = '糯米团 v1.0 - ...';

            // 点击任务栏标签可以切换窗口显示/隐藏
            taskbarTab.addEventListener('click', () => {
                if (screens.chat.classList.contains('active')) {
                    screens.chat.classList.remove('active');
                    taskbarTab.classList.remove('active');
                } else {
                    screens.chat.classList.add('active');
                    taskbarTab.classList.add('active');
                }
            });
            taskbarApps.appendChild(taskbarTab);
        }
    }
    // ▲▲▲ 新增结束 ▲▲▲

    // --- 事件绑定 ---
    chatAppIcon.addEventListener('click', () => {
        // 如果聊天窗口已经打开（即任务栏有标签），则直接激活它
        const taskbarTab = document.getElementById('chat-taskbar-tab');
        if (taskbarTab) {
            screens.chat.classList.add('active');
            taskbarTab.classList.add('active');
        } else if (myNickname) {
            openChatWindow(); // 如果已登录但窗口未打开，则打开
        } else {
            switchScreen('login'); // 否则显示登录
        }
    });

    messages.addEventListener('click', (e) => { if (e.target && e.target.classList.contains('chat-image')) { imageModal.classList.add('active'); modalImg.src = e.target.src; } });
    closeBtn.addEventListener('click', () => { imageModal.classList.remove('active'); });
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) { imageModal.classList.remove('active'); } });
    document.addEventListener('keydown', (e) => { if (e.key === "Escape" && (imageModal.classList.contains('active') || searchWindow.classList.contains('active'))) { imageModal.classList.remove('active'); searchWindow.classList.remove('active'); } });
    imageBtn.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', (event) => { const file = event.target.files[0]; if (file) uploadImage(file); event.target.value = ''; });
    input.addEventListener('paste', (event) => { const items = (event.clipboardData || window.clipboardData).items; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { event.preventDefault(); const blob = items[i].getAsFile(); if (blob) uploadImage(blob); return; } } });
    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPanel.classList.toggle('hidden'); });
    document.addEventListener('click', () => { if (!emojiPanel.classList.contains('hidden')) emojiPanel.classList.add('hidden'); });
    
    loginBtn.addEventListener('click', () => {
        // 使用一个固定的密码，或者你可以从 localStorage 读取
        const validPassword = localStorage.getItem('chat_password') || '12345';
        if (passwordInput.value === validPassword) {
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
            sessionStorage.setItem('nickname', nickname); // 保存昵称到 sessionStorage
            socket.emit('join', nickname);
            openChatWindow(); // 使用新函数打开聊天窗口
        }
    });

    nicknameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') nicknameBtn.click(); });
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });
    searchBtn.addEventListener('click', () => { searchWindow.classList.add('active'); });
    loginCloseBtn.addEventListener('click', () => { screens.login.classList.remove('active'); });
    nicknameCloseBtn.addEventListener('click', () => { screens.nickname.classList.remove('active'); });
    
    chatCloseBtn.addEventListener('click', () => {
        screens.chat.classList.remove('active');
        const taskbarTab = document.getElementById('chat-taskbar-tab');
        if (taskbarTab) taskbarTab.remove();
        // 如果需要，可以在这里断开 socket 或重置状态
    });

    searchCloseBtn.addEventListener('click', () => { searchWindow.classList.remove('active'); });
    
    // ▼▼▼ 新增：最小化和最大化按钮的事件监听 ▼▼▼
    minimizeBtn.addEventListener('click', () => {
        screens.chat.classList.remove('active');
        const taskbarTab = document.getElementById('chat-taskbar-tab');
        if (taskbarTab) taskbarTab.classList.remove('active');
    });

    maximizeBtn.addEventListener('click', () => {
        screens.chat.classList.toggle('maximized');
    });
    // ▲▲▲ 新增结束 ▲▲▲

    executeSearchBtn.addEventListener('click', async () => { /* ... 搜索逻辑不变 ... */ });

    // --- 初始化 ---
    // 首次密码生成逻辑
    if (!localStorage.getItem('chat_password')) {
        const randomPassword = Math.random().toString(36).substring(2, 8);
        localStorage.setItem('chat_password', randomPassword);
        alert(`首次使用，已为您生成一个初始密码: ${randomPassword}\n请记住它，或者在 client.js 中修改。`);
    }

    populateDateSelectors();
    for (const code in KAOMOJI_MAP) { const kaomoji = KAOMOJI_MAP[code]; const panelItem = document.createElement('div'); panelItem.className = 'emoji-item'; panelItem.textContent = kaomoji; panelItem.title = code; panelItem.addEventListener('click', () => { input.value += ` ${code} `; input.focus(); emojiPanel.classList.add('hidden'); }); emojiPanel.appendChild(panelItem); }
    updateClock();
    setInterval(updateClock, 1000 * 30);

    // --- Socket.IO 事件处理 ---
    socket.on('load history', (history) => { messages.innerHTML = ''; history.forEach(data => addChatMessage(data)); addSystemMessage('欢迎来到聊天室！'); });
    socket.on('chat message', (data) => addChatMessage(data));
    socket.on('system message', (msg) => addSystemMessage(msg));
    socket.on('update users', (users) => { usersList.innerHTML = ''; users.forEach(user => { const item = document.createElement('li'); item.textContent = user; usersList.appendChild(item); }); });
    socket.on('disconnect', () => { addSystemMessage('您已断开连接，正在尝试重连...'); chatWindowTitle.textContent = '糯米团 v1.0 - 正在重新连接...'; input.disabled = true; sendBtn.disabled = true; });
    socket.on('connect', () => { if (myNickname) { chatWindowTitle.textContent = '糯米团 v1.0 - 在线聊天室'; input.disabled = false; sendBtn.disabled = false; socket.emit('join', myNickname); } });
});