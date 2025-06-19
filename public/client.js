// client.js (完整修复版)
document.addEventListener('DOMContentLoaded', () => {
    // 强制隐藏所有窗口，防止启动时全部显示
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

    // --- DOM 元素统一获取 ---
    const desktop = document.getElementById('desktop');
    const taskbarApps = document.getElementById('taskbar-apps');
    const clockElement = document.getElementById('clock');
    
    // 应用及其核心元素的映射
    const apps = {
        'chat': { icon: document.getElementById('chat-app-icon'), window: document.getElementById('chat-screen'), closeBtn: document.getElementById('chat-close-btn'), minimizeBtn: document.getElementById('minimize-btn'), maximizeBtn: document.getElementById('maximize-btn'), title: '糯米团 v1.0' },
        'rss': { icon: document.getElementById('rss-reader-icon'), window: document.getElementById('rss-reader-screen'), closeBtn: document.getElementById('rss-close-btn'), minimizeBtn: document.getElementById('rss-minimize-btn'), maximizeBtn: document.getElementById('rss-maximize-btn'), title: 'Netscape RSS' },
        'login': { window: document.getElementById('login-screen'), closeBtn: document.getElementById('login-close-btn') },
        'nickname': { window: document.getElementById('nickname-screen'), closeBtn: document.getElementById('nickname-close-btn') },
        'search': { window: document.getElementById('search-window'), closeBtn: document.getElementById('search-close-btn') }
    };

    // 其他功能性DOM元素
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
    const modalCloseBtn = document.querySelector('.modal-close-btn') || document.querySelector('.close-btn');
    const searchBtn = document.getElementById('search-btn');
    const executeSearchBtn = document.getElementById('execute-search-btn');
    const searchResults = document.getElementById('search-results');
    const rssUrlInput = document.getElementById('rss-url-input');
    const fetchRssBtn = document.getElementById('fetch-rss-btn');
    const rssContent = document.getElementById('rss-content');
    const rssStatusText = document.getElementById('rss-status-text');
    const rssItemCount = document.getElementById('rss-item-count');
    const rssBackBtn = document.getElementById('rss-back-btn');
    const rssForwardBtn = document.getElementById('rss-forward-btn');
    const rssReloadBtn = document.getElementById('rss-reload-btn');
    const rssAddBookmarkBtn = document.getElementById('rss-add-bookmark-btn');
    const rssBookmarksBtn = document.getElementById('rss-bookmarks-btn');
    const rssBookmarksPanel = document.getElementById('rss-bookmarks-panel');
    const bookmarksList = document.getElementById('bookmarks-list');
    
    // --- 状态变量 ---
    const socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, reconnectionAttempts: Infinity });
    let myNickname = sessionStorage.getItem('nickname') || '';
    let zIndexCounter = 10;
    const KAOMOJI_MAP = { ':happy:': '(^▽^)', ':lol:': 'o(>▽<)o', ':love:': '(｡♥‿♥｡)', ':excited:': '(*^▽^*)', ':proud:': '(´_ゝ`)', ':sad:': '(T_T)', ':cry:': '(；′⌒`)', ':sob:': '༼ಢ_ಢ༽', ':wow:': 'Σ(°ロ°)', ':speechless:': '(－_－) zzZ', ':confused:': '(°_°)?', ':wave:': '(^_^)/', ':ok:': 'd(^_^o)', ':sorry:': 'm(_ _)m', ':run:': 'ε=ε=┌( >_<)┘', ':tableflip:': '(╯°□°）╯︵ ┻━┻', ':cat:': '(=^ェ^=)', ':bear:': 'ʕ •ᴥ•ʔ', ':note:': 'ヾ( ´ A ` )ﾉ', ':sleepy:': '(´-ω-`)' };
    let rssHistory = [];
    let rssCurrentIndex = -1;
    let bookmarks = JSON.parse(localStorage.getItem('rss_bookmarks')) || [];
    let currentFeedTitle = '';

    // --- 窗口管理器 ---
    const windowManager = {
        open(appId) {
            const app = apps[appId];
            if (!app || !app.window) return;
            
            app.window.classList.add('active');
            this.focus(appId);

            if (app.icon) {
                this.createTaskbarTab(appId);
            }
        },
        close(appId) {
            const app = apps[appId];
            if (!app || !app.window) return;
            app.window.classList.remove('active', 'maximized');
            const taskbarTab = document.getElementById(`${appId}-taskbar-tab`);
            if (taskbarTab) {
                taskbarTab.remove();
                // 从app对象中也移除，以便下次能重新创建
                if (app) app.taskbarTab = null;
            }
        },
        minimize(appId) {
            const app = apps[appId];
            if (!app || !app.window) return;
            app.window.classList.remove('active');
            const taskbarTab = document.getElementById(`${appId}-taskbar-tab`);
            if (taskbarTab) {
                taskbarTab.classList.remove('active');
                taskbarTab.classList.add('inactive');
            }
        },
        toggle(appId) {
            const app = apps[appId];
            if (!app || !app.window) return;
             
            if (app.window.classList.contains('active')) {
                this.minimize(appId);
            } else {
                app.window.classList.add('active');
                this.focus(appId);
            }
        },
        focus(appId) {
            const app = apps[appId];
            if (!app || !app.window) return;
            app.window.style.zIndex = ++zIndexCounter;

            document.querySelectorAll('.taskbar-tab').forEach(t => {
                t.classList.remove('active');
                if(!t.classList.contains('inactive')) t.classList.add('inactive');
            });

            const taskbarTab = document.getElementById(`${appId}-taskbar-tab`);
            if (taskbarTab) {
                taskbarTab.classList.add('active');
                taskbarTab.classList.remove('inactive');
            }
        },
        createTaskbarTab(appId) {
            const app = apps[appId];
            if (document.getElementById(`${appId}-taskbar-tab`)) return;

            const taskbarTab = document.createElement('div');
            taskbarTab.id = `${appId}-taskbar-tab`;
            taskbarTab.className = 'taskbar-tab active';
            taskbarTab.textContent = app.title;
            taskbarApps.appendChild(taskbarTab);
            app.taskbarTab = taskbarTab;

            taskbarTab.addEventListener('click', () => this.toggle(appId));
        }
    };
    
    // --- 核心功能函数 ---
    function makeDraggable(windowElement) {
        const titleBar = windowElement.querySelector('.title-bar');
        if (!titleBar) return;
        let isDragging = false, offsetX, offsetY;
        titleBar.addEventListener('mousedown', (e) => {
            if (windowElement.classList.contains('maximized') || e.target.closest('.button-control')) return;
            isDragging = true;
            const appId = Object.keys(apps).find(key => apps[key].window === windowElement);
            if (appId) windowManager.focus(appId);
            const rect = windowElement.getBoundingClientRect();
            windowElement.style.top = `${rect.top}px`;
            windowElement.style.left = `${rect.left}px`;
            windowElement.style.transform = 'none';
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            document.body.classList.add('dragging-active');
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => { if (!isDragging) return; windowElement.style.left = `${e.clientX - offsetX}px`; windowElement.style.top = `${e.clientY - offsetY}px`; });
        document.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; document.body.classList.remove('dragging-active'); } });
    }
    
    function sendMessage() { if (input.value && !input.disabled) { socket.emit('chat message', { type: 'text', msg: input.value }); input.value = ''; input.focus(); } }
    function addSystemMessage(msg) { const item = document.createElement('div'); item.classList.add('system-message'); item.textContent = `*** ${msg} ***`; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
    function createChatMessageElement(data) { const item = document.createElement('div'); item.className = 'message-item'; const timestampSpan = document.createElement('span'); timestampSpan.className = 'timestamp'; const date = new Date(data.created_at || Date.now()); timestampSpan.textContent = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; const nicknameSpan = document.createElement('span'); nicknameSpan.className = 'nickname'; nicknameSpan.textContent = `<${data.nickname}>: `; const contentSpan = document.createElement('span'); const messageContent = data.msg || ''; if (data.message_type === 'image') { const img = document.createElement('img'); img.src = messageContent; img.className = 'chat-image'; contentSpan.appendChild(img); } else { let finalMessage = messageContent; for (const code in KAOMOJI_MAP) { const regex = new RegExp(code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'); finalMessage = finalMessage.replace(regex, KAOMOJI_MAP[code]); } contentSpan.textContent = finalMessage; } item.appendChild(timestampSpan); item.appendChild(nicknameSpan); item.appendChild(contentSpan); return item; }
    function addChatMessage(data) { const item = createChatMessageElement(data); messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
    async function uploadImage(file) { if (!file || !file.type.startsWith('image/')) return; addSystemMessage(`正在上传图片: ${file.name || 'clipboard_image.png'}...`); const formData = new FormData(); formData.append('image', file); try { const response = await fetch('/upload', { method: 'POST', body: formData }); if (!response.ok) throw new Error('上传失败'); const result = await response.json(); socket.emit('chat message', { type: 'image', msg: result.imageUrl }); } catch (error) { console.error('上传出错:', error); addSystemMessage(`图片上传失败。`); } }
    function populateDateSelectors() { const currentYear = new Date().getFullYear(); const searchYear = document.getElementById('search-year'); const searchMonth = document.getElementById('search-month'); const searchDay = document.getElementById('search-day'); searchYear.innerHTML = '<option value="any">所有年份</option>'; for (let y = currentYear; y >= 2023; y--) { searchYear.innerHTML += `<option value="${y}">${y}年</option>`; } searchMonth.innerHTML = '<option value="any">所有月份</option>'; for (let m = 1; m <= 12; m++) { searchMonth.innerHTML += `<option value="${m}">${m}月</option>`; } searchDay.innerHTML = '<option value="any">所有日期</option>'; for (let d = 1; d <= 31; d++) { searchDay.innerHTML += `<option value="${d}">${d}日</option>`; } }
    function updateClock() { const now = new Date(); const hours = String(now.getHours()).padStart(2, '0'); const minutes = String(now.getMinutes()).padStart(2, '0'); clockElement.textContent = `${hours}:${minutes}`; }
    
    async function fetchRss(url, addToHistory = true) {
        if (!url) { alert('请输入一个有效的RSS源地址！'); return; }
        rssStatusText.textContent = `Loading ${url}...`;
        rssContent.innerHTML = '';
        rssItemCount.textContent = '';
        try {
            const response = await fetch(`/parse-rss?url=${encodeURIComponent(url)}`);
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || '无法解析RSS源'); }
            const feed = await response.json();
            rssUrlInput.value = url;
            currentFeedTitle = feed.title || 'Untitled Feed';
            displayRssFeed(feed);
            if (addToHistory) {
                rssHistory = rssHistory.slice(0, rssCurrentIndex + 1);
                rssHistory.push(url);
                rssCurrentIndex++;
            }
            updateRssNavButtons();
        } catch (error) {
            rssStatusText.textContent = `Error!`;
            rssContent.innerHTML = `<p>加载失败: ${error.message}</p>`;
            console.error('RSS Fetch Error:', error);
        }
    }
    
    function displayRssFeed(feed) {
        rssContent.innerHTML = ''; 
        const title = document.createElement('h2');
        title.textContent = feed.title;
        rssContent.appendChild(title);
        if (feed.items && feed.items.length > 0) {
            feed.items.forEach(item => {
                const itemDiv = document.createElement('div'); itemDiv.className = 'rss-item';
                const itemTitle = document.createElement('h3');
                const itemLink = document.createElement('a'); itemLink.href = item.link; itemLink.textContent = item.title || 'No Title'; itemLink.target = '_blank';
                itemTitle.appendChild(itemLink);
                const itemSnippet = document.createElement('p');
                const snippetText = (item.contentSnippet || item.content || '').replace(/<[^>]*>?/gm, '');
                itemSnippet.textContent = snippetText.substring(0, 200) + (snippetText.length > 200 ? '...' : '');
                const itemDate = document.createElement('p'); itemDate.style.fontSize = '0.8em'; itemDate.style.color = '#808080';
                itemDate.textContent = item.pubDate ? new Date(item.pubDate).toLocaleString() : '未知日期';
                itemDiv.appendChild(itemTitle); itemDiv.appendChild(itemSnippet); itemDiv.appendChild(itemDate);
                rssContent.appendChild(itemDiv);
            });
            rssStatusText.textContent = 'Done';
            rssItemCount.textContent = `${feed.items.length} items`;
        } else {
            rssContent.innerHTML += '<p>这个RSS源中没有文章。</p>';
            rssStatusText.textContent = 'Done';
            rssItemCount.textContent = '0 items';
        }
    }
    
    function updateRssNavButtons() { rssBackBtn.disabled = rssCurrentIndex <= 0; rssForwardBtn.disabled = rssCurrentIndex >= rssHistory.length - 1; }
    function loadBookmarks() { bookmarksList.innerHTML = ''; bookmarks.forEach(bookmark => { const li = document.createElement('li'); li.textContent = bookmark.title; li.title = bookmark.url; li.addEventListener('click', () => { fetchRss(bookmark.url); }); bookmarksList.appendChild(li); }); }
    function saveBookmark(title, url) { if (!bookmarks.some(b => b.url === url)) { bookmarks.push({ title, url }); localStorage.setItem('rss_bookmarks', JSON.stringify(bookmarks)); loadBookmarks(); alert(`书签 "${title}" 已添加!`); } else { alert('这个书签已经存在了。'); } }

    // --- 事件绑定 ---
    Object.keys(apps).forEach(appId => {
        const app = apps[appId];
        if (app.window) {
            makeDraggable(app.window);
            app.window.addEventListener('mousedown', () => windowManager.focus(appId), true);
        }
        if (app.icon) {
             app.icon.addEventListener('dblclick', () => {
                const taskbarTab = document.getElementById(`${appId}-taskbar-tab`);
                if(taskbarTab){
                    windowManager.toggle(appId);
                } else if (appId === 'chat') {
                    if (myNickname) windowManager.open('chat'); else windowManager.open('login');
                } else {
                    windowManager.open(appId);
                }
            });
        }
        if (app.closeBtn) app.closeBtn.addEventListener('click', (e) => { e.stopPropagation(); windowManager.close(appId); });
        if (app.minimizeBtn) app.minimizeBtn.addEventListener('click', (e) => { e.stopPropagation(); windowManager.minimize(appId); });
        if (app.maximizeBtn) app.maximizeBtn.addEventListener('click', (e) => { e.stopPropagation(); app.window.classList.toggle('maximized'); });
    });
    
    loginBtn.addEventListener('click', () => { if (passwordInput.value === 'MWNMT') { windowManager.close('login'); windowManager.open('nickname'); } else { errorMsg.textContent = '错误: 密码不正确。'; setTimeout(() => { errorMsg.textContent = ''; }, 3000); } });
    nicknameBtn.addEventListener('click', () => { const nickname = nicknameInput.value.trim(); if (nickname) { myNickname = nickname; sessionStorage.setItem('nickname', nickname); socket.emit('join', nickname); windowManager.close('nickname'); windowManager.open('chat'); } });
    
    searchBtn.addEventListener('click', () => windowManager.open('search'));
    
    // 其他功能性事件绑定
    passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') loginBtn.click(); });
    nicknameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') nicknameBtn.click(); });
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });
    imageBtn.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', (event) => { const file = event.target.files[0]; if (file) uploadImage(file); event.target.value = ''; });
    
    // ▼▼▼ 新增的粘贴图片处理逻辑 ▼▼▼
    input.addEventListener('paste', (e) => {
        const items = (e.clipboardData || window.clipboardData).items;
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                e.preventDefault(); // 阻止浏览器默认的粘贴行为 (比如粘贴文件路径)
                const file = item.getAsFile();
                if (file) {
                    uploadImage(file); // 调用您已有的上传函数
                }
                return; // 只处理找到的第一个图片文件
            }
        }
    });
    // ▲▲▲ 新增的粘贴图片处理逻辑 ▲▲▲

    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPanel.classList.toggle('hidden'); });
    document.addEventListener('click', (e) => { if (!emojiPanel.contains(e.target)) emojiPanel.classList.add('hidden'); });
    if(modalCloseBtn) modalCloseBtn.addEventListener('click', () => imageModal.classList.remove('active'));
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.classList.remove('active'); });
    document.addEventListener('keydown', (e) => { if (e.key === "Escape") imageModal.classList.remove('active'); });

    // RSS 事件
    fetchRssBtn.addEventListener('click', () => fetchRss(rssUrlInput.value.trim()));
    rssUrlInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') fetchRss(rssUrlInput.value.trim()); });
    rssReloadBtn.addEventListener('click', () => { if (rssHistory[rssCurrentIndex]) fetchRss(rssHistory[rssCurrentIndex], false); });
    rssBackBtn.addEventListener('click', () => { if (rssCurrentIndex > 0) { rssCurrentIndex--; fetchRss(rssHistory[rssCurrentIndex], false); } });
    rssForwardBtn.addEventListener('click', () => { if (rssCurrentIndex < rssHistory.length - 1) { rssCurrentIndex++; fetchRss(rssHistory[rssCurrentIndex], false); } });
    rssBookmarksBtn.addEventListener('click', () => rssBookmarksPanel.classList.toggle('active'));
    rssAddBookmarkBtn.addEventListener('click', () => {
        const url = rssUrlInput.value.trim();
        if (url) {
            const title = prompt("请输入书签的名称:", currentFeedTitle || url);
            if (title) saveBookmark(title, url);
        } else {
            alert('地址栏是空的，无法添加书签。');
        }
    });
    
    // --- 初始化 ---
    populateDateSelectors();
    updateClock();
    setInterval(updateClock, 1000 * 30);
    loadBookmarks();
    updateRssNavButtons();
    for (const code in KAOMOJI_MAP) { const kaomoji = KAOMOJI_MAP[code]; const panelItem = document.createElement('div'); panelItem.className = 'emoji-item'; panelItem.textContent = kaomoji; panelItem.title = code; panelItem.addEventListener('click', () => { input.value += ` ${code} `; input.focus(); emojiPanel.classList.add('hidden'); }); emojiPanel.appendChild(panelItem); }

    // --- Socket.IO 事件处理 ---
    socket.on('load history', (history) => { messages.innerHTML = ''; history.forEach(data => addChatMessage(data)); addSystemMessage('欢迎来到聊天室！'); });
    socket.on('chat message', (data) => addChatMessage(data));
    socket.on('system message', (msg) => addSystemMessage(msg));
    socket.on('update users', (users) => { usersList.innerHTML = ''; users.forEach(user => { const item = document.createElement('li'); item.textContent = user; usersList.appendChild(item); }); });
    socket.on('disconnect', () => { addSystemMessage('您已断开连接，正在尝试重连...'); chatWindowTitle.textContent = '糯米团 v1.0 - 正在重新连接...'; input.disabled = true; sendBtn.disabled = true; });
    socket.on('connect', () => { if (myNickname) { chatWindowTitle.textContent = '糯米团 v1.0 - 在线聊天室'; input.disabled = false; sendBtn.disabled = false; socket.emit('join', myNickname); } });
});