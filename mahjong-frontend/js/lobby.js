// js/lobby.js
// 游戏大厅的主控制逻辑

class LobbyController {

    constructor() {
        this.roomsContainer = document.getElementById('list-rooms');
        this.ws = null;
        this.keepAliveInterval = null;
        this.lastFriendRequests = [];
        this.rejoinAttempted = false;
        this.roomContextKey = 'mahjong_room_context';
    }

    // 初始化大厅数据，在用户登录成功后调用
    async init() {
        if (!app.state.user) return app.switchView('auth');

        // --- 第一步：立即使用本地缓存渲染 UI (防止刷新后显示“加载中”) ---
        const u = app.state.user;
        const safeNickname = u.nickname || u.username || '玩家';
        const safeAvatarChar = (u.avatarChar || safeNickname || '?').charAt(0).toUpperCase();
        
        document.getElementById('lbl-nickname').innerText = safeNickname;
        document.getElementById('lbl-nickname-top').innerText = safeNickname;
        document.getElementById('lbl-user-id').innerText = u.userId || '-';
        document.getElementById('lbl-avatar-char').innerText = safeAvatarChar;
        
        // 渲染本地缓存的分数（如果有）
        const cachedScore = u.totalScore || 0;
        document.getElementById('lbl-score').innerText = cachedScore;
        document.getElementById('lbl-score-top').innerText = cachedScore;
        this.updateUserRankTitle(cachedScore);

        // 根据角色显示管理员按钮
        const adminBtn = document.getElementById('btn-admin-panel');
        if (adminBtn) {
            if (u.role === 1) adminBtn.classList.remove('hidden');
            else adminBtn.classList.add('hidden');
        }

        // --- 第二步：异步从后端同步最新数据 ---
        try {
            const userInfo = await api.getUserInfo(u.userId);
            const latestScore = userInfo.totalScore || 0;
            
            // 更新 UI 到最新值
            document.getElementById('lbl-score').innerText = latestScore;
            document.getElementById('lbl-score-top').innerText = latestScore;
            const latestNickname = userInfo.nickname || safeNickname;
            const latestAvatarChar = (userInfo.avatarChar || latestNickname || '?').charAt(0).toUpperCase();
            document.getElementById('lbl-nickname').innerText = latestNickname;
            document.getElementById('lbl-avatar-char').innerText = latestAvatarChar;
            this.updateUserRankTitle(latestScore);

            // 【关键修复】同步回本地缓存，确保下次刷新有最新数据
            app.state.user = { ...app.state.user, ...userInfo };
            localStorage.setItem('mahjong_user', JSON.stringify(app.state.user));

            // 加载其他模块数据
            setTimeout(() => {
                if (window.leaderboard) window.leaderboard.loadMiniData();
                this.loadRooms();
                this.loadFriends();
                this.loadFriendRequests();
            }, 100);

            this.connectWebSocket(u.userId);

        } catch (e) {
            console.error('Lobby sync error:', e);
            // 即使后端同步失败，依然允许用户留在页面查看缓存数据并尝试建立链接
            this.loadRooms(); 
            this.connectWebSocket(u.userId);
        }
    }

    connectWebSocket(userId) {
        if (this.ws) {
            this.ws.onclose = null; 
            this.ws.close();
            this.ws = null;
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.host || 'localhost:8081';
        const wsUrl = `${wsProtocol}//${wsHost}/ws/game?userId=${userId}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('✅ WebSocket 连接成功');
            this.rejoinAttempted = false;
            this.startKeepAlive();
            this.tryRejoinSavedRoom();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleServerMessage(msg);
            } catch (e) {
                console.error("WS Parse Error", e, event.data);
            }
        };

        this.ws.onclose = () => {
            console.log('❌ WebSocket 断开');
            this.stopKeepAlive();
            // 自动重连
            if (app.state.user && app.state.currentView !== 'auth') {
                setTimeout(() => this.connectWebSocket(app.state.user.userId), 3000);
            }
        };
    }

    startKeepAlive() {
        this.stopKeepAlive();
        this.keepAliveInterval = setInterval(() => {
            this.sendWsMessage('C_PING', null, {});
        }, 20000); // 20秒连接保活
    }

    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    tryRejoinSavedRoom() {
        if (this.rejoinAttempted) return;
        this.rejoinAttempted = true;
        const savedRoomId = this.getSavedRoomId();
        if (!savedRoomId) return;
        this.sendWsMessage('C_JOIN_ROOM', savedRoomId, {});
        app.showToast(`已尝试恢复房间 ${savedRoomId}`);
    }

    saveRoomContext(roomId) {
        if (!roomId) return;
        localStorage.setItem(this.roomContextKey, JSON.stringify({ roomId }));
    }

    clearRoomContext() {
        localStorage.removeItem(this.roomContextKey);
    }

    getSavedRoomId() {
        try {
            const raw = localStorage.getItem(this.roomContextKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed?.roomId || null;
        } catch (error) {
            return null;
        }
    }

    handleServerMessage(msg) {
        const type = msg.type;
        const data = msg.data || {};
        if (type === 'S_ERROR' && window.room) {
            window.room.forwardToCocos(msg);
        }

        const gameMessageTypes = new Set([
            'S_GAME_START',
            'S_SELECT_MISS_SUIT',
            'S_MISS_SUIT_RESULT',
            'S_DRAW',
            'S_DISCARD',
            'S_ACTION_OPTIONS',
            'S_CHI',
            'S_PENG',
            'S_GANG',
            'S_HU',
            'S_ROUND_RESULT',
            'S_GAME_OVER',
            'S_ERROR',
            'S_PONG'
        ]);

        switch (type) {
            case 'S_ROOM_STATE':
                this.saveRoomContext(data.roomId);
                if (window.room) {
                    // 如果当前不在房间视图，则切过去
                    if (app.state.currentView !== 'room-prep' && app.state.currentView !== 'game') {
                        window.room.enter(data.roomId, data);
                    } else {
                        window.room.handleRoomStateUpdate(data);
                    }
                }
                if (window.room) window.room.forwardToCocos(msg);
                if (window.gameConsole && window.gameConsole.isOpen) {
                    window.gameConsole.handleServerMessage(msg);
                }
                break;
            
            case 'S_LEAVE_ROOM':
                // 收到玩家离开通知
                if (data.userId === app.state.user.userId) {
                    this.clearRoomContext();
                    app.switchView('lobby');
                    this.loadRooms();
                } else {
                    app.showToast(`玩家 [${data.nickname}] 离开了房间`, 'info');
                }
                break;

            case 'S_CHAT':
                if (window.room) window.room.handleChatReceive(data);
                if (window.gameConsole && window.gameConsole.isOpen) {
                    window.gameConsole.handleServerMessage(msg);
                }
                break;

            case 'S_ROOM_INVITE':
                this.handleInviteReceive(data);
                break;

            case 'S_ROOM_DISBANDED':
                this.clearRoomContext();
                app.showToast(data.reason || "房间已解散", "info");
                app.switchView('lobby');
                this.loadRooms();
                break;

            case 'S_GAME_START':
                this.simulateCocosTransition(data);
                if (window.room) window.room.forwardToCocos(msg);
                break;

            case 'S_ERROR':
                app.showError(data.message || '操作失败');
                if (window.gameConsole && window.gameConsole.isOpen) {
                    window.gameConsole.handleServerMessage(msg);
                }
                if (window.room) {
                    window.room.forwardToCocos(msg);
                }
                break;

            case 'S_PONG':
                if (window.gameConsole && window.gameConsole.isOpen) {
                    window.gameConsole.handleServerMessage(msg);
                }
                break;

            case 'S_GAME_OVER':
                if (window.gameConsole && gameMessageTypes.has(type)) {
                    window.gameConsole.handleServerMessage(msg);
                }
                if (window.room) window.room.forwardToCocos(msg);
                this.syncCurrentUserScore();
                break;

            default:
                if (window.gameConsole && gameMessageTypes.has(type)) {
                    window.gameConsole.handleServerMessage(msg);
                }
                if (window.room) window.room.forwardToCocos(msg);
                break;
        }
    }

    async syncCurrentUserScore() {
        const userId = app.state.user?.userId;
        if (!userId) return;

        try {
            const userInfo = await api.getUserInfo(userId);
            const latestScore = userInfo.totalScore || 0;
            document.getElementById('lbl-score').innerText = latestScore;
            document.getElementById('lbl-score-top').innerText = latestScore;
            this.updateUserRankTitle(latestScore);
            app.state.user = { ...app.state.user, ...userInfo };
            localStorage.setItem('mahjong_user', JSON.stringify(app.state.user));
        } catch (error) {
            console.warn('同步最新雀分失败', error);
        }
    }

    simulateCocosTransition(gameStartData) {
        app.showSuccess("对局开始！已切换到游戏画面。");
        if (window.room) {
            window.room.enterGameView(gameStartData);
        }
        if (window.gameConsole) {
            window.gameConsole.latestGameStartData = gameStartData || {};
        }
    }

    handleInviteReceive(data) {
        // data: { roomId, roomName, inviterNickname }
        const confirmJoin = confirm(`玩家 [${data.inviterNickname}] 邀请你加入房间: ${data.roomName}\n是否加入？`);
        if (confirmJoin) {
            this.joinRoom(data.roomId, false);
        }
    }

    // 通过 WS 发送包裹好的类型 (严格对齐后端 JSON 结构)
    sendWsMessage(type, roomId, data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const payload = {
            type: type,
            roomId: roomId || "",
            userId: app.state.user.userId,
            data: data || {}
        };
        this.ws.send(JSON.stringify(payload));
    }

    async createRoom() {
        try {
            const userId = app.state.user.userId;
            const baseScore = parseInt(document.getElementById('sel-base-score').value);
            const maxRounds = parseInt(document.getElementById('sel-max-rounds').value);
            let roomName = document.getElementById('inp-room-name').value.trim();

            if (!roomName) {
                roomName = `蜀山论剑_${Math.floor(Math.random() * 9000) + 1000}`;
            }

            const res = await api.createRoom(userId, roomName, baseScore, maxRounds);
            app.showSuccess('房间创建成功！');

            // 立即通过 WS 加入
            this.joinRoom(res.roomId, false);

        } catch (err) {
            app.showError(err.message);
        }
    }

    async loadRooms() {
        try {
            this.roomsContainer.innerHTML = '<div class="loading-text">搜索房间中...</div>';
            const res = await api.getRoomList();
            const rooms = res.rooms || [];
            this.roomsContainer.innerHTML = '';

            if (rooms.length === 0) {
                this.roomsContainer.innerHTML = '<div class="loading-text">暂无公开房间</div>';
                return;
            }

            rooms.forEach(rm => {
                const count = rm.playerCount || 0;
                const isFull = count >= 4;
                const card = document.createElement('div');
                card.className = 'room-card fade-in-up';
                card.innerHTML = `
                    <div class="room-info">
                        <h4>${rm.roomName}</h4>
                        <div class="room-meta">ID: ${rm.roomId} | ${rm.maxRounds}局 | ${rm.baseScore}分</div>
                    </div>
                    <div class="room-status" style="text-align: right;">
                        <div class="room-players ${isFull ? 'full' : ''}">${count} / 4 人</div>
                        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px; flex-wrap:wrap;">
                            <button class="btn-text-small" onclick="lobby.showRoomInfoModal('${rm.roomId}')">详情</button>
                            <button class="btn-text-small" onclick="lobby.showRoomRecordsModal('${rm.roomId}')">战绩</button>
                            <button class="join-btn" onclick="lobby.joinRoom('${rm.roomId}', ${isFull})" ${isFull ? 'disabled' : ''}>
                                ${isFull ? '已满' : '加入'}
                            </button>
                        </div>
                    </div>
                `;
                this.roomsContainer.appendChild(card);
            });
        } catch (err) {
            this.roomsContainer.innerHTML = `<div class="loading-text text-danger">读取失败</div>`;
        }
    }

    joinRoom(roomId, isFull) {
        if (isFull) {
            app.showError('房间已满');
            return;
        }
        this.saveRoomContext(roomId);
        this.sendWsMessage('C_JOIN_ROOM', roomId, {});
    }

    // ================= 好友系统 =================

    async loadFriends() {
        const listEl = document.getElementById('list-friends');
        try {
            const res = await api.getFriendsList(app.state.user.userId);
            const friends = res.friends || [];
            listEl.innerHTML = '';

            if (friends.length === 0) {
                listEl.innerHTML = '<li class="loading-text">暂无好友</li>';
                return;
            }

            friends.forEach(f => {
                const li = document.createElement('li');
                li.className = 'rank-item fade-in-left';
                li.innerHTML = `
                    <span class="rank-name" style="flex:1;">
                        <span class="avatar-mini">${f.nickname.charAt(0).toUpperCase()}</span>
                        ${f.nickname}
                    </span>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-text-small" onclick="lobby.showUserRecordsModal(${f.friendId}, '${f.nickname.replace(/'/g, "\\'")}')">战绩</button>
                        <button class="btn-text-small" onclick="lobby.inviteFriend(${f.friendId})">邀请</button>
                    </div>
                `;
                listEl.appendChild(li);
            });
        } catch (e) {
            listEl.innerHTML = '<li class="loading-text">读取失败</li>';
        }
    }

    async loadFriendRequests() {
        const badge = document.getElementById('badge-friend-requests');
        if (!badge) return;

        try {
            const res = await api.getFriendRequests(app.state.user.userId);
            const requests = res.requests || [];
            this.lastFriendRequests = requests;

            if (requests.length > 0) {
                badge.style.display = 'inline';
                badge.innerText = `(${requests.length})`;
            } else {
                badge.style.display = 'none';
            }
        } catch (e) {
            console.warn('读取好友申请失败', e);
            badge.style.display = 'none';
            this.lastFriendRequests = [];
        }
    }

    inviteFriend(targetId) {
        if (!window.room.currentRoomId) {
            app.showToast("请先进入房间再发起邀请");
            return;
        }
        this.sendWsMessage('C_INVITE_FRIEND', window.room.currentRoomId, { targetUserId: targetId });
        app.showToast("邀请已发出");
    }

    showAddFriendModal() {
        document.getElementById('inp-friend-id').value = '';
        document.getElementById('modal-add-friend').classList.remove('hidden');
    }

    closeAddFriendModal() {
        document.getElementById('modal-add-friend').classList.add('hidden');
    }

    async addFriendSubmit() {
        const val = document.getElementById('inp-friend-id').value.trim();
        if (!val) return;
        try {
            await api.addFriend(app.state.user.userId, parseInt(val));
            app.showSuccess('请求已发送，等待对方确认');
            this.closeAddFriendModal();
            this.loadFriends();
        } catch (e) {
            app.showError(e.message);
        }
    }

    async showFriendRequestsModal() {
        document.getElementById('modal-friend-requests').classList.remove('hidden');
        await this.loadFriendRequests();
        this.renderFriendRequests();
    }

    closeFriendRequestsModal() {
        document.getElementById('modal-friend-requests').classList.add('hidden');
    }

    renderFriendRequests() {
        const wrap = document.getElementById('list-friend-requests');
        const requests = this.lastFriendRequests || [];

        if (!wrap) return;
        if (requests.length === 0) {
            wrap.innerHTML = '<div class="loading-text">当前没有待处理申请</div>';
            return;
        }

        wrap.innerHTML = requests.map(r => `
            <div class="rank-item" style="margin-bottom:10px;">
                <div style="display:flex; flex-direction:column; gap:3px;">
                    <span style="font-weight:700;">${r.nickname || ('用户' + r.fromUserId)}</span>
                    <span style="color:var(--text-muted); font-size:0.85rem;">ID: ${r.fromUserId}</span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn-text-small" onclick="lobby.acceptFriendRequest(${r.requestId})">同意</button>
                    <button class="btn-text-small danger" onclick="lobby.rejectFriendRequest(${r.requestId})">拒绝</button>
                </div>
            </div>
        `).join('');
    }

    async acceptFriendRequest(requestId) {
        try {
            await api.acceptFriendRequest(requestId, app.state.user.userId);
            app.showSuccess('已同意好友申请');
            await this.loadFriendRequests();
            await this.loadFriends();
            this.renderFriendRequests();
        } catch (e) {
            app.showError(e.message);
        }
    }

    async rejectFriendRequest(requestId) {
        try {
            await api.rejectFriendRequest(requestId, app.state.user.userId);
            app.showToast('已拒绝该申请');
            await this.loadFriendRequests();
            this.renderFriendRequests();
        } catch (e) {
            app.showError(e.message);
        }
    }

    showRenameModal() {
        const input = document.getElementById('inp-new-nickname');
        input.value = app.state.user?.nickname || '';
        document.getElementById('modal-rename').classList.remove('hidden');
    }

    closeRenameModal() {
        document.getElementById('modal-rename').classList.add('hidden');
    }

    async submitRename() {
        const input = document.getElementById('inp-new-nickname');
        const nickname = input.value.trim();
        if (!nickname) return app.showError('昵称不能为空');

        try {
            const res = await api.updateNickname(app.state.user.userId, nickname);
            app.state.user.nickname = res.nickname || nickname;
            localStorage.setItem('mahjong_user', JSON.stringify(app.state.user));
            document.getElementById('lbl-nickname').innerText = app.state.user.nickname;
            document.getElementById('lbl-avatar-char').innerText = app.state.user.nickname.charAt(0).toUpperCase();
            this.closeRenameModal();
            app.showSuccess('昵称更新成功');
        } catch (e) {
            app.showError(e.message);
        }
    }

    async showUserRecordsModal(targetUserId = null, titleName = '我的') {
        const userId = targetUserId || app.state.user.userId;
        const tbody = document.getElementById('table-user-records-body');
        const modal = document.getElementById('modal-user-records');
        modal.classList.remove('hidden');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">战绩读取中...</td></tr>';

        try {
            const res = await api.getUserRecords(userId, 20);
            const records = res.records || [];
            document.querySelector('#modal-user-records .modal-title').innerText = `${titleName}历史战绩`;

            if (records.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">暂无历史记录</td></tr>';
                return;
            }

            tbody.innerHTML = records.map((r, idx) => `
                <tr>
                    <td>#${idx + 1}</td>
                    <td>${r.roomId || '-'}</td>
                    <td>${r.roundNum ?? '-'}</td>
                    <td>${r.winType || '-'}</td>
                    <td style="color:var(--color-primary);">${r.score ?? 0}</td>
                    <td>${this.formatTime(r.createdAt)}</td>
                </tr>
            `).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--color-danger);">${e.message}</td></tr>`;
        }
    }

    closeUserRecordsModal() {
        document.getElementById('modal-user-records').classList.add('hidden');
    }

    async showRoomInfoModal(roomId) {
        const modal = document.getElementById('modal-room-info');
        const title = document.getElementById('room-info-title');
        const content = document.getElementById('room-info-content');
        modal.classList.remove('hidden');
        title.innerText = '房间详情';
        content.innerHTML = '<div class="loading-text">读取房间详情中...</div>';

        try {
            const res = await api.getRoomInfo(roomId);
            const seats = res.seats || [];
            const seatRows = seats.map(s => {
                if (!s.occupied) {
                    return `<tr><td>${s.seatIndex}</td><td>空座</td><td>-</td><td>-</td><td>-</td></tr>`;
                }
                return `<tr><td>${s.seatIndex}</td><td>${s.nickname}</td><td>${s.userId}</td><td>${s.ready ? '已准备' : '未准备'}</td><td>${s.online ? '在线' : '离线'}</td></tr>`;
            }).join('');

            content.innerHTML = `
                <div style="margin-bottom:14px; color:var(--text-muted);">
                    房间ID: ${res.roomId} | 名称: ${res.roomName} | 状态: ${res.status} | 局数: ${res.currentRound}/${res.maxRounds} | 底分: ${res.baseScore}
                </div>
                <table class="premium-table">
                    <thead><tr><th>座位</th><th>昵称</th><th>用户ID</th><th>准备</th><th>在线</th></tr></thead>
                    <tbody>${seatRows}</tbody>
                </table>
            `;
        } catch (e) {
            content.innerHTML = `<div class="loading-text" style="color:var(--color-danger);">${e.message}</div>`;
        }
    }

    async showRoomRecordsModal(roomId) {
        const modal = document.getElementById('modal-room-info');
        const title = document.getElementById('room-info-title');
        const content = document.getElementById('room-info-content');
        modal.classList.remove('hidden');
        title.innerText = `房间 ${roomId} 战绩`;
        content.innerHTML = '<div class="loading-text">读取房间战绩中...</div>';

        try {
            const res = await api.getRoomRecords(roomId);
            const records = res.records || [];
            if (records.length === 0) {
                content.innerHTML = '<div class="loading-text">该房间暂无记录</div>';
                return;
            }

            const rows = records.map((r, idx) => `
                <tr>
                    <td>#${idx + 1}</td>
                    <td>${r.roundNum ?? '-'}</td>
                    <td>${r.winnerId ?? '-'}</td>
                    <td>${r.loserId ?? '-'}</td>
                    <td>${r.winType || '-'}</td>
                    <td style="color:var(--color-primary);">${r.score ?? 0}</td>
                    <td>${this.formatTime(r.createdAt)}</td>
                </tr>
            `).join('');

            content.innerHTML = `
                <table class="premium-table">
                    <thead>
                        <tr><th>#</th><th>局数</th><th>胜者</th><th>败者</th><th>番型</th><th>分数</th><th>时间</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        } catch (e) {
            content.innerHTML = `<div class="loading-text" style="color:var(--color-danger);">${e.message}</div>`;
        }
    }

    closeRoomInfoModal() {
        document.getElementById('modal-room-info').classList.add('hidden');
    }

    formatTime(value) {
        if (!value) return '-';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString('zh-CN', { hour12: false });
    }

    // ================= 称号系统 =================

    updateUserRankTitle(score) {
        const titleEl = document.getElementById('lbl-user-title');
        if (!titleEl) return;

        let title = '雀坛萌新';
        if (score >= 8000) title = '传说雀神';
        else if (score >= 6000) title = '无双雀圣';
        else if (score >= 4000) title = '名手雀豪';
        else if (score >= 2500) title = '资深雀杰';
        else if (score >= 1500) title = '进阶雀士';

        titleEl.innerText = title;
    }

    // ================= 管理员功能 =================

    async showAdminModal() {
        document.getElementById('modal-admin').classList.remove('hidden');
        await this.loadAdminUserList();
    }

    closeAdminModal() {
        document.getElementById('modal-admin').classList.add('hidden');
    }

    async loadAdminUserList() {
        const tbody = document.getElementById('table-admin-users-body');
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">正在拉取全服用户数据...</td></tr>';

        try {
            const res = await api.adminGetAllUsers(app.state.user.userId);
            const users = res.users || [];
            tbody.innerHTML = '';

            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">暂无用户数据</td></tr>';
                return;
            }

            users.forEach(u => {
                const winRate = u.gameCount > 0 ? ((u.winCount / u.gameCount) * 100).toFixed(1) + '%' : '0%';
                const roleText = u.role === 1 ? '<span style="color:var(--color-danger)">管理员</span>' : '普通用户';
                // 修正逻辑：0 为正常，1 为封禁
                const isNormal = (u.status === 0);
                const statusText = isNormal ? '<span style="color:var(--color-success)">正常</span>' : '<span style="color:var(--color-danger)">锁定</span>';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${u.userId}</td>
                    <td>${u.username}</td>
                    <td>${u.nickname}</td>
                    <td><b style="color:var(--color-accent)">${u.totalScore}</b></td>
                    <td>${winRate}</td>
                    <td>${roleText}</td>
                    <td>${statusText}</td>
                    <td>
                        <div style="display:flex; gap:5px; flex-wrap:wrap;">
                            <button class="btn-text-small" onclick="lobby.adminUpdateScore(${u.userId}, ${u.totalScore})">改分</button>
                            <button class="btn-text-small" onclick="lobby.adminToggleStatus(${u.userId}, ${u.status})">${isNormal ? '锁定' : '解锁'}</button>
                            <button class="btn-text-small" onclick="lobby.adminToggleRole(${u.userId}, ${u.role})">${u.role === 1 ? '降权' : '提权'}</button>
                            <button class="btn-text-small" onclick="lobby.adminResetPassword(${u.userId})">重置密码</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--color-danger);">${e.message}</td></tr>`;
        }
    }

    async adminUpdateScore(targetId, currentScore) {
        const newScore = prompt(`请输入用户 ID:${targetId} 的新总雀分:`, currentScore);
        if (newScore === null) return;
        try {
            await api.adminUpdateScore(app.state.user.userId, targetId, parseInt(newScore));
            app.showSuccess('雀分修改成功');
            this.loadAdminUserList();
        } catch (e) {
            app.showError(e.message);
        }
    }

    async adminToggleStatus(targetId, currentStatus) {
        const newStatus = currentStatus === 1 ? 0 : 1;
        try {
            await api.adminSetStatus(app.state.user.userId, targetId, newStatus);
            app.showSuccess('用户状态已更新');
            this.loadAdminUserList();
        } catch (e) {
            app.showError(e.message);
        }
    }

    async adminToggleRole(targetId, currentRole) {
        const newRole = currentRole === 1 ? 0 : 1;
        try {
            await api.adminSetRole(app.state.user.userId, targetId, newRole);
            app.showSuccess('用户权限已更新');
            this.loadAdminUserList();
        } catch (e) {
            app.showError(e.message);
        }
    }

    async adminResetPassword(targetId) {
        const newPwd = prompt(`请输入用户 ID:${targetId} 的新密码:`, '123456');
        if (!newPwd) return;
        try {
            await api.adminResetPassword(app.state.user.userId, targetId, newPwd);
            app.showSuccess('密码重置成功');
        } catch (e) {
            app.showError(e.message);
        }
    }
}

const lobby = new LobbyController();
window.lobby = lobby;
