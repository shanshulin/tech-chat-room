document.addEventListener('DOMContentLoaded', () => {
    // 确保所有窗口在加载时都是隐藏的，以避免闪烁
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

    // --- 全局变量和常量 ---
    const socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, reconnectionAttempts: Infinity });
    let myNickname = sessionStorage.getItem('nickname') || '';
    let zIndexCounter = 10;
    const KAOMOJI_MAP = { ':happy:': '(^▽^)', ':lol:': 'o(>▽<)o', ':love:': '(｡♥‿♥｡)', ':excited:': '(*^▽^*)', ':proud:': '(´_ゝ`)', ':sad:': '(T_T)', ':cry:': '(；′⌒`)', ':sob:': '༼ಢ_ಢ༽', ':wow:': 'Σ(°ロ°)', ':speechless:': '(－_－) zzZ', ':confused:': '(°_°)?', ':wave:': '(^_^)/', ':ok:': 'd(^_^o)', ':sorry:': 'm(_ _)m', ':run:': 'ε=ε=┌( >_<)┘', ':tableflip:': '(╯°□°）╯︵ ┻━┻', ':cat:': '(=^ェ^=)', ':bear:': 'ʕ •ᴥ•ʔ', ':note:': 'ヾ( ´ A ` )ﾉ', ':sleepy:': '(´-ω-`)' };
    const systemPrompt = `You are a helpful assistant powered by the DeepSeek model. You must identify yourself as a DeepSeek assistant. When you need to search for the "latest" or "current" information, use the web_search tool. IMPORTANT: When using the web_search tool for the latest information, construct a simple query like "latest entertainment news" or "current weather in Beijing". DO NOT add any specific dates like '2023' or 'September' to the query unless the user explicitly provides them. Please format your response using Markdown.`;
    let aiConversationHistory = [{ role: 'system', content: systemPrompt }];

    // --- DOM 元素获取 ---
    const desktop = document.getElementById('desktop');
    const taskbarApps = document.getElementById('taskbar-apps');
    const clockElement = document.getElementById('clock');
    
    // 应用窗口管理对象
    const apps = {
        'chat': { icon: document.getElementById('chat-app-icon'), window: document.getElementById('chat-screen'), closeBtn: document.getElementById('chat-close-btn'), minimizeBtn: document.getElementById('minimize-btn'), maximizeBtn: document.getElementById('maximize-btn'), title: '糯米团 v1.0' },
        'ai': { icon: document.getElementById('ai-app-icon'), window: document.getElementById('ai-chat-screen'), closeBtn: document.getElementById('ai-close-btn'), minimizeBtn: document.getElementById('ai-minimize-btn'), maximizeBtn: document.getElementById('ai-maximize-btn'), title: 'DeepSeek AI' },
        'login': { window: document.getElementById('login-screen'), closeBtn: document.getElementById('login-close-btn') },
        'nickname': { window: document.getElementById('nickname-screen'), closeBtn: document.getElementById('nickname-close-btn') },
        'search': { window: document.getElementById('search-window'), closeBtn: document.getElementById('search-close-btn') }
    };
    
    // 各功能区DOM元素
    const usersListWindow = document.getElementById('users-list-window');
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
    const modalCloseBtn = document.querySelector('.close-btn');
    
    // AI聊天DOM元素
    const aiMessages = document.getElementById('ai-messages');
    const aiInput = document.getElementById('ai-input');
    const aiSendBtn = document.getElementById('ai-send-btn');
    const aiNetworkToggle = document.getElementById('ai-network-toggle');
    const searchProviderSelect = document.getElementById('search-provider-select');
    
    // ★★★ 搜索功能DOM元素 ★★★
    const searchBtn = document.getElementById('search-btn'); // 主聊天窗口的搜索按钮
    const searchUsernameInput = document.getElementById('search-username');
    const searchKeywordInput = document.getElementById('search-keyword');
    const searchYearSelect = document.getElementById('search-year');
    const searchMonthSelect = document.getElementById('search-month');
    const searchDaySelect = document.getElementById('search-day');
    const executeSearchBtn = document.getElementById('execute-search-btn');
    const searchResultsContainer = document.getElementById('search-results');

    // --- 窗口管理与拖拽 ---
    const windowManager = { open(appId) { const app = apps[appId]; if (!app || !app.window) return; app.window.classList.add('active'); this.focus(appId); if (app.icon) this.createTaskbarTab(appId); if (appId === 'chat') { usersListWindow.classList.add('active'); makeDraggable(usersListWindow); } }, close(appId) { const app = apps[appId]; if (!app || !app.window) return; app.window.classList.remove('active', 'maximized'); const taskbarTab = document.getElementById(`${appId}-taskbar-tab`); if (taskbarTab) taskbarTab.remove(); if (appId === 'chat') { usersListWindow.classList.remove('active'); } }, minimize(appId) { const app = apps[appId]; if (!app || !app.window) return; app.window.classList.remove('active'); const taskbarTab = document.getElementById(`${appId}-taskbar-tab`); if (taskbarTab) { taskbarTab.classList.remove('active'); taskbarTab.classList.add('inactive'); } if (appId === 'chat') { usersListWindow.classList.remove('active'); } }, toggle(appId) { const app = apps[appId]; if (!app || !app.window) return; if (app.window.classList.contains('active')) { this.minimize(appId); } else { app.window.classList.add('active'); this.focus(appId); if (appId === 'chat') { usersListWindow.classList.add('active'); } } }, focus(appId) { const app = apps[appId]; if (!app || !app.window) return; if (appId === 'chat') { usersListWindow.style.zIndex = ++zIndexCounter; } app.window.style.zIndex = ++zIndexCounter; document.querySelectorAll('.taskbar-tab').forEach(t => t.classList.remove('active', 'inactive')); document.querySelectorAll('.taskbar-tab').forEach(t => { if(t.id !== `${appId}-taskbar-tab`) t.classList.add('inactive'); }); const taskbarTab = document.getElementById(`${appId}-taskbar-tab`); if (taskbarTab) taskbarTab.classList.add('active'); }, createTaskbarTab(appId) { const app = apps[appId]; if (document.getElementById(`${appId}-taskbar-tab`)) return; const taskbarTab = document.createElement('div'); taskbarTab.id = `${appId}-taskbar-tab`; taskbarTab.className = 'taskbar-tab active'; taskbarTab.textContent = app.title; taskbarApps.appendChild(taskbarTab); taskbarTab.addEventListener('click', () => this.toggle(appId)); } };
    function makeDraggable(windowElement) { const titleBar = windowElement.querySelector('.title-bar'); if (!titleBar) return; let isDragging = false, offsetX, offsetY; titleBar.addEventListener('mousedown', (e) => { if (windowElement.classList.contains('maximized') || e.target.closest('.button-control')) return; isDragging = true; const appId = Object.keys(apps).find(key => apps[key].window === windowElement); if (appId) { windowManager.focus(appId); } else if (windowElement.id === 'users-list-window') { windowManager.focus('chat'); } const rect = windowElement.getBoundingClientRect(); windowElement.style.top = `${rect.top}px`; windowElement.style.left = `${rect.left}px`; windowElement.style.transform = 'none'; offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top; document.body.classList.add('dragging-active'); e.preventDefault(); }); document.addEventListener('mousemove', (e) => { if (!isDragging) return; windowElement.style.left = `${e.clientX - offsetX}px`; windowElement.style.top = `${e.clientY - offsetY}px`; }); document.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; document.body.classList.remove('dragging-active'); } }); }

    // --- 核心功能函数 ---
    function sendMessage() { if (input.value && !input.disabled) { socket.emit('chat message', { type: 'text', msg: input.value }); input.value = ''; input.focus(); } }
    function addSystemMessage(container, msg) { const item = document.createElement('div'); item.classList.add('system-message'); item.textContent = `*** ${msg} ***`; container.appendChild(item); container.scrollTop = container.scrollHeight; }
    function createChatMessageElement(data) { const item = document.createElement('div'); item.className = 'message-item'; const timestampSpan = document.createElement('span'); timestampSpan.className = 'timestamp'; const date = new Date(data.created_at || Date.now()); timestampSpan.textContent = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; const nicknameSpan = document.createElement('span'); nicknameSpan.className = 'nickname'; nicknameSpan.textContent = `<${data.nickname}>: `; const contentSpan = document.createElement('span'); const messageContent = data.msg || ''; if (data.message_type === 'image') { const img = document.createElement('img'); img.src = messageContent; img.className = 'chat-image'; contentSpan.appendChild(img); } else { let finalMessage = messageContent; for (const code in KAOMOJI_MAP) { const regex = new RegExp(code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'); finalMessage = finalMessage.replace(regex, KAOMOJI_MAP[code]); } contentSpan.textContent = finalMessage; } item.appendChild(timestampSpan); item.appendChild(nicknameSpan); item.appendChild(contentSpan); return item; }
    function addChatMessage(data) { const item = createChatMessageElement(data); messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
    async function uploadImage(file) { if (!file || !file.type.startsWith('image/')) return; addSystemMessage(messages, `正在上传图片: ${file.name || 'clipboard_image.png'}...`); const formData = new FormData(); formData.append('image', file); try { const response = await fetch('/upload', { method: 'POST', body: formData }); if (!response.ok) throw new Error('上传失败'); const result = await response.json(); socket.emit('chat message', { type: 'image', msg: result.imageUrl }); } catch (error) { console.error('上传出错:', error); addSystemMessage(messages, `图片上传失败。`); } }
    function updateClock() { const now = new Date(); const hours = String(now.getHours()).padStart(2, '0'); const minutes = String(now.getMinutes()).padStart(2, '0'); clockElement.textContent = `${hours}:${minutes}`; }
    function addAiChatMessage(role, text) { const item = document.createElement('div'); if (role === 'user') { item.className = 'user-message'; item.textContent = `You: ${text}`; } else if (role === 'assistant') { item.className = 'ai-message'; item.innerHTML = `<b>AI:</b> ${marked.parse(text)}`; } else if (role === 'thinking') { item.className = 'thinking-indicator'; item.id = 'thinking-indicator'; item.textContent = 'AI is thinking...'; } else if (role === 'error') { item.className = 'system-message'; item.textContent = `*** Error: ${text} ***`; } aiMessages.appendChild(item); aiMessages.scrollTop = aiMessages.scrollHeight; return item; }
    async function sendAiMessage() { const messageText = aiInput.value.trim(); if (!messageText) return; addAiChatMessage('user', messageText); aiConversationHistory.push({ role: 'user', content: messageText }); aiInput.value = ''; aiInput.disabled = true; aiSendBtn.disabled = true; const thinkingIndicator = addAiChatMessage('thinking'); const useNetwork = aiNetworkToggle.checked; const searchProvider = searchProviderSelect.value; try { const response = await fetch('/api/ai-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history: aiConversationHistory, use_network: useNetwork, search_provider: searchProvider }) }); if (!response.ok) { const errData = await response.json(); throw new Error(errData.error || 'AI service returned an error.'); } const data = await response.json(); addAiChatMessage('assistant', data.reply); aiConversationHistory.push({ role: 'assistant', content: data.reply }); } catch (error) { console.error('AI Chat Error:', error); addAiChatMessage('error', error.message); } finally { if (thinkingIndicator) thinkingIndicator.remove(); aiInput.disabled = false; aiSendBtn.disabled = false; aiInput.focus(); } }
    
    // ★★★ 新增：填充日期选择框的函数 ★★★
    function populateDateSelectors() {
        const currentYear = new Date().getFullYear();
        searchYearSelect.innerHTML = '<option value="">年</option>';
        for (let year = currentYear; year >= 2024; year--) { searchYearSelect.add(new Option(year, year)); }
        searchMonthSelect.innerHTML = '<option value="">月</option>';
        for (let month = 1; month <= 12; month++) { searchMonthSelect.add(new Option(String(month).padStart(2, '0'), month)); }
        searchDaySelect.innerHTML = '<option value="">日</option>';
        for (let day = 1; day <= 31; day++) { searchDaySelect.add(new Option(String(day).padStart(2, '0'), day)); }
    }

    // --- 事件绑定 ---
    Object.keys(apps).forEach(appId => { if (apps[appId].window) { makeDraggable(apps[appId].window); apps[appId].window.addEventListener('mousedown', () => windowManager.focus(appId), true); } if (apps[appId].icon) { apps[appId].icon.addEventListener('dblclick', () => { const taskbarTab = document.getElementById(`${appId}-taskbar-tab`); if(taskbarTab){ windowManager.toggle(appId); } else if (appId === 'chat') { if (myNickname) windowManager.open('chat'); else windowManager.open('login'); } else { windowManager.open(appId); } }); } if (apps[appId].closeBtn) apps[appId].closeBtn.addEventListener('click', (e) => { e.stopPropagation(); windowManager.close(appId); }); if (apps[appId].minimizeBtn) apps[appId].minimizeBtn.addEventListener('click', (e) => { e.stopPropagation(); windowManager.minimize(appId); }); if (apps[appId].maximizeBtn) apps[appId].maximizeBtn.addEventListener('click', (e) => { e.stopPropagation(); apps[appId].window.classList.toggle('maximized'); }); });
    loginBtn.addEventListener('click', () => { if (passwordInput.value === 'MWNMT') { windowManager.close('login'); windowManager.open('nickname'); } else { errorMsg.textContent = '错误: 密码不正确。'; setTimeout(() => { errorMsg.textContent = ''; }, 3000); } });
    nicknameBtn.addEventListener('click', () => { const nickname = nicknameInput.value.trim(); if (nickname) { myNickname = nickname; sessionStorage.setItem('nickname', nickname); socket.emit('join', nickname); windowManager.close('nickname'); windowManager.open('chat'); } });
    passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') loginBtn.click(); });
    nicknameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') nicknameBtn.click(); });
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });
    imageBtn.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', (event) => { const file = event.target.files[0]; if (file) uploadImage(file); event.target.value = ''; });
    input.addEventListener('paste', (e) => { const items = (e.clipboardData || window.clipboardData).items; for (const item of items) { if (item.kind === 'file' && item.type.startsWith('image/')) { e.preventDefault(); const file = item.getAsFile(); if (file) { uploadImage(file); } return; } } });
    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPanel.classList.toggle('hidden'); });
    document.addEventListener('click', (e) => { if (!emojiPanel.contains(e.target)) emojiPanel.classList.add('hidden'); });
    if(modalCloseBtn) modalCloseBtn.addEventListener('click', () => imageModal.classList.remove('active'));
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.classList.remove('active'); });
    document.addEventListener('keydown', (e) => { if (e.key === "Escape" && imageModal.classList.contains('active')) { imageModal.classList.remove('active'); } });
    aiSendBtn.addEventListener('click', sendAiMessage);
    aiInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendAiMessage(); });
    
    // ★★★ 搜索功能事件绑定 ★★★
    searchBtn.addEventListener('click', () => {
        populateDateSelectors();
        windowManager.open('search');
    });
    executeSearchBtn.addEventListener('click', () => {
        const criteria = { username: searchUsernameInput.value.trim(), keyword: searchKeywordInput.value.trim(), year: searchYearSelect.value, month: searchMonthSelect.value, day: searchDaySelect.value };
        searchResultsContainer.innerHTML = '<div class="system-message">*** 正在查找... ***</div>';
        socket.emit('search messages', criteria);
    });

    // --- 初始化和定时器 ---
    updateClock();
    setInterval(updateClock, 1000 * 30);
    for (const code in KAOMOJI_MAP) { const kaomoji = KAOMOJI_MAP[code]; const panelItem = document.createElement('div'); panelItem.className = 'emoji-item'; panelItem.textContent = kaomoji; panelItem.title = code; panelItem.addEventListener('click', () => { input.value += ` ${code} `; input.focus(); emojiPanel.classList.add('hidden'); }); emojiPanel.appendChild(panelItem); }
    
    // --- Socket.IO 事件处理 ---
    socket.on('load history', (history) => { messages.innerHTML = ''; history.forEach(data => addChatMessage(data)); addSystemMessage(messages, '欢迎来到聊天室！'); });
    socket.on('chat message', (data) => addChatMessage(data));
    socket.on('system message', (msg) => addSystemMessage(messages, msg));
    socket.on('update users', (users) => { usersList.innerHTML = ''; users.forEach(user => { const item = document.createElement('li'); item.textContent = user; usersList.appendChild(item); }); });
    socket.on('disconnect', () => { addSystemMessage(messages, '您已断开连接，正在尝试重连...'); chatWindowTitle.textContent = '糯米团 v1.0 - 正在重新连接...'; input.disabled = true; sendBtn.disabled = true; });
    socket.on('connect', () => { if (myNickname) { chatWindowTitle.textContent = '糯米团 v1.0 - 在线聊天室'; input.disabled = false; sendBtn.disabled = false; socket.emit('join', myNickname); } });
    // ★★★ 监听搜索结果事件 ★★★
    socket.on('search results', (results) => {
        searchResultsContainer.innerHTML = '';
        if (!results || results.length === 0) {
            addSystemMessage(searchResultsContainer, '未找到匹配的聊天记录。');
            return;
        }
        results.forEach(msg => {
            const messageElement = createChatMessageElement(msg);
            searchResultsContainer.appendChild(messageElement);
        });
    });
});