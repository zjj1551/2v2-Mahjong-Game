// js/room.js
// 房间准备视图及聊天逻辑

class RoomController {
    constructor() {
        this.currentRoomId = null;
        this.seats = [null, null, null, null]; 
        this.mySeatIndex = -1;
        this.isReady = false;
        this.isCreator = false;
        this.roomStatus = 'WAITING';
        this.cocosFrame = null;
        this.cocosReady = false;
        this.latestRoomState = null;
        this.latestGameStartData = null;
        this.latestHuSeatIndex = null;
        this.cocosResizeObserver = null;
        this.cocosResizeRaf = 0;
        this.handleWindowResize = () => this.scheduleCocosResize();
        this.cocosBuildPath = window.COCOS_BUILD_PATH || '/cocos-build/web-desktop/index.html';

        window.addEventListener('message', (event) => this.onCocosMessage(event));
    }

    // 进入房间入口 (由 Lobby 调用)
    enter(roomId, roomData) {
        this.currentRoomId = roomId;
        if (window.lobby) window.lobby.saveRoomContext(roomId);
        document.getElementById('lbl-prep-room-id').innerText = `${roomId}`;

        // 重置状态
        this.seats = [null, null, null, null];
        this.mySeatIndex = -1;
        this.isReady = false;
        this.roomStatus = 'WAITING';
        
        // UI 初始化
        const btnReady = document.getElementById('btn-ready');
        btnReady.disabled = true;
        btnReady.innerText = "准备";
        btnReady.classList.remove('active');

        const btnStart = document.getElementById('btn-start-game');
        if (btnStart) {
            btnStart.disabled = true;
        }
        const btnAddBot = document.getElementById('btn-add-bot');
        if (btnAddBot) {
            btnAddBot.disabled = true;
        }

        document.getElementById('chat-message-list').innerHTML =
            '<div class="chat-msg system" style="color:var(--color-primary); text-align:center; font-size:0.9em;">--- 欢迎来到蜀山论剑 ---</div>';
        const gameChatList = document.getElementById('game-chat-message-list');
        if (gameChatList) {
            gameChatList.innerHTML = '<div class="chat-msg system" style="color:var(--color-primary); text-align:center; font-size:0.9em;">--- 对局聊天频道已开启 ---</div>';
        }

        app.switchView('room-prep');

        // 同步初始数据
        if (roomData) {
            this.handleRoomStateUpdate(roomData);
        }
    }

    enterGameView(gameStartData) {
        document.getElementById('lbl-game-room-id').innerText = this.currentRoomId || '-';
        this.latestGameStartData = gameStartData || null;
        this.mountCocos(gameStartData);
        app.switchView('game');
        this.renderGamePlayerStatusBar();
        this.scheduleCocosResize();
    }

    // 离开房间
    leaveRoom() {
        if (!confirm("确定要离开房间吗？")) return;
        if (window.lobby && window.lobby.ws) {
            window.lobby.sendWsMessage('C_LEAVE_ROOM', this.currentRoomId, {});
            window.lobby.clearRoomContext();
        }
        this.resetUI();
        app.switchView('lobby');
        if (window.lobby) window.lobby.loadRooms();
    }

    // 房主解散房间
    disbandRoom() {
        if (!this.isCreator) {
            app.showError("只有房主可以解散房间");
            return;
        }
        if (confirm("确定要解散房间吗？此操作将把所有人踢出。")) {
            if (window.lobby && window.lobby.ws) {
                window.lobby.sendWsMessage('C_DISBAND_ROOM', this.currentRoomId, {});
                window.lobby.clearRoomContext();
            }
            this.resetUI();
            app.switchView('lobby');
            if (window.lobby) window.lobby.loadRooms();
        }
    }

    resetUI() {
        this.currentRoomId = null;
        this.seats = [null, null, null, null];
        this.mySeatIndex = -1;
        this.isReady = false;
        this.isCreator = false;
        this.roomStatus = 'WAITING';
        this.latestRoomState = null;
        this.latestGameStartData = null;
        this.latestHuSeatIndex = null;
        this.unmountCocos();
        
        // 显式隐藏房间头部的管理按钮区
        const creatorEl = document.getElementById('creator-controls');
        if (creatorEl) creatorEl.style.display = 'none';
        
        // 清空聊天
        document.getElementById('chat-message-list').innerHTML = '';
        const gameChatList = document.getElementById('game-chat-message-list');
        if (gameChatList) gameChatList.innerHTML = '';
    }

    // WebSocket 广播：全量房间状态同步
    handleRoomStateUpdate(data) {
        if (!data) return;
        
        this.latestRoomState = data;
        this.currentRoomId = data.roomId;
        if (window.lobby) window.lobby.saveRoomContext(data.roomId);
        this.isCreator = data.creatorId === app.state.user.userId;
        this.roomStatus = data.status || 'WAITING';
        
        // 房主控制区显示/隐藏
        const creatorEl = document.getElementById('creator-controls');
        if (creatorEl) creatorEl.style.display = this.isCreator ? 'flex' : 'none';

        // 更新座位信息
        const newSeats = [null, null, null, null];
        let foundMe = false;

        if (data.seats) {
            data.seats.forEach(s => {
                if (s.occupied) {
                    newSeats[s.seatIndex] = s;
                    if (s.userId === app.state.user.userId) {
                        this.mySeatIndex = s.seatIndex;
                        this.isReady = s.ready;
                        foundMe = true;
                    }
                }
            });
        }

        this.seats = newSeats;
        if (!foundMe) {
            this.mySeatIndex = -1;
            this.isReady = false;
        }

        this.renderSeats();
        this.renderGamePlayerStatusBar();
        this.updateActionButtons(data);
    }

    mountCocos(gameStartData) {
        const stageEl = document.getElementById('cocos-game-stage');
        if (!stageEl) return;

        stageEl.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.id = 'cocos-iframe';
        iframe.className = 'cocos-iframe';
        iframe.src = this.cocosBuildPath;
        iframe.allowTransparency = 'true';
        iframe.setAttribute('scrolling', 'no');
        iframe.setAttribute('allow', 'fullscreen');
        iframe.setAttribute('loading', 'eager');
        iframe.setAttribute('referrerpolicy', 'no-referrer');

        iframe.addEventListener('load', () => {
            this.cocosReady = false;
            this.syncCocosFrameSize();
            if (gameStartData) {
                this.sendToCocos('S_GAME_START', gameStartData);
            }
            if (this.latestRoomState) {
                this.sendToCocos('S_ROOM_STATE', this.latestRoomState);
            }
        });

        stageEl.appendChild(iframe);
        this.cocosFrame = iframe;
        this.attachCocosResizeObserver(stageEl);
        window.addEventListener('resize', this.handleWindowResize);
        this.renderGamePlayerStatusBar();
    }

    unmountCocos() {
        window.removeEventListener('resize', this.handleWindowResize);
        if (this.cocosResizeObserver) {
            this.cocosResizeObserver.disconnect();
            this.cocosResizeObserver = null;
        }
        if (this.cocosResizeRaf) {
            cancelAnimationFrame(this.cocosResizeRaf);
            this.cocosResizeRaf = 0;
        }
        if (this.cocosFrame && this.cocosFrame.parentElement) {
            this.cocosFrame.parentElement.innerHTML = '';
        }
        this.cocosFrame = null;
        this.cocosReady = false;
    }

    attachCocosResizeObserver(stageEl) {
        if (this.cocosResizeObserver) {
            this.cocosResizeObserver.disconnect();
            this.cocosResizeObserver = null;
        }

        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        this.cocosResizeObserver = new ResizeObserver(() => this.scheduleCocosResize());
        this.cocosResizeObserver.observe(stageEl);
    }

    scheduleCocosResize() {
        if (this.cocosResizeRaf) {
            cancelAnimationFrame(this.cocosResizeRaf);
        }
        this.cocosResizeRaf = requestAnimationFrame(() => {
            this.cocosResizeRaf = 0;
            this.syncCocosFrameSize();
        });
    }

    syncCocosFrameSize() {
        if (!this.cocosFrame || !this.cocosFrame.contentWindow || !this.cocosFrame.contentDocument) {
            return;
        }

        const stageEl = document.getElementById('cocos-game-stage');
        if (!stageEl) return;

        const width = stageEl.clientWidth;
        const height = stageEl.clientHeight;
        if (!width || !height) return;

        const doc = this.cocosFrame.contentDocument;
        const win = this.cocosFrame.contentWindow;
        let styleEl = doc.getElementById('mahjong-cocos-responsive-style');
        if (!styleEl) {
            styleEl = doc.createElement('style');
            styleEl.id = 'mahjong-cocos-responsive-style';
            doc.head.appendChild(styleEl);
        }

        styleEl.textContent = `
            html, body {
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                overflow: hidden !important;
                background: #000 !important;
            }

            body {
                display: block !important;
            }

            #GameDiv,
            #Cocos3dGameContainer,
            #GameCanvas {
                width: 100% !important;
                height: 100% !important;
                max-width: none !important;
                max-height: none !important;
            }

            #GameDiv {
                margin: 0 !important;
                border: 0 !important;
                border-radius: 0 !important;
                box-shadow: none !important;
            }

            .header,
            .footer {
                display: none !important;
            }
        `;

        try {
            win.dispatchEvent(new win.Event('resize'));
        } catch (e) {
            // 忽略跨浏览器兼容性差异，样式注入已足够让 Cocos 重新适配。
        }
    }

    onCocosMessage(event) {
        if (event.origin !== window.location.origin) return;
        const data = event.data || {};
        if (!data.type) return;

        if (data.type === 'COCOS_READY') {
            this.cocosReady = true;
            if (this.latestRoomState) {
                this.sendToCocos('S_ROOM_STATE', this.latestRoomState);
            }
            if (this.latestGameStartData) {
                this.sendToCocos('S_GAME_START', this.latestGameStartData);
            }
            return;
        }

        if (data.type === 'COCOS_SEND_WS') {
            const action = data.payload?.action;
            const payload = data.payload?.data || {};
            if (!action || !window.lobby) return;
            window.lobby.sendWsMessage(action, this.currentRoomId, payload);
        }
    }

    forwardToCocos(msg) {
        if (!msg || !msg.type) return;
        this.applyHtmlLiveStatusMessage(msg);
        if (!this.cocosFrame) return;
        const allowed = new Set([
            'S_ROOM_STATE',
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
            'S_ERROR',
            'S_ROUND_RESULT',
            'S_GAME_OVER',
            'S_COUNTDOWN'
        ]);

        if (!allowed.has(msg.type)) return;
        this.sendToCocos(msg.type, msg.data || {});
    }

    applyHtmlLiveStatusMessage(msg) {
        if (!msg || !msg.type) return;

        if (msg.type === 'S_ROOM_STATE') {
            this.latestRoomState = msg.data || this.latestRoomState;
            this.renderGamePlayerStatusBar();
            return;
        }

        if (msg.type === 'S_HU') {
            const seatIndex = Number(msg.data?.seatIndex);
            if (!Number.isNaN(seatIndex) && seatIndex >= 0) {
                this.latestHuSeatIndex = seatIndex;
                this.markPlayerHu(seatIndex);
                this.renderGamePlayerStatusBar();
            }
        }
    }

    markPlayerHu(seatIndex) {
        if (!this.latestRoomState || !Array.isArray(this.latestRoomState.seats)) return;
        const seat = this.latestRoomState.seats.find(s => s && s.seatIndex === seatIndex);
        if (seat) {
            seat.isHu = true;
        }
    }

    renderGamePlayerStatusBar() {
        const bar = document.getElementById('game-player-status-bar');
        if (!bar) return;

        const seats = Array.isArray(this.latestRoomState?.seats)
            ? [...this.latestRoomState.seats].filter(Boolean).sort((a, b) => a.seatIndex - b.seatIndex)
            : [];

        if (!seats.length) {
            bar.innerHTML = `
                <div class="player-status-note" style="grid-column:1/-1;">等待房间状态同步后显示玩家在线、定缺和胡牌状态。</div>
            `;
            return;
        }

        const missSuitNames = ['万', '筒', '条'];
        const myUserId = app.state.user?.userId;
        bar.innerHTML = seats.map(seat => {
            const isSelf = Number(seat.userId) === Number(myUserId);
            const isOnline = seat.online !== false;
            const isHu = !!seat.isHu;
            const missSuitName = Number.isInteger(seat.missSuit) && seat.missSuit >= 0
                ? missSuitNames[seat.missSuit] || String(seat.missSuit)
                : '';
            const badges = [];
            badges.push(`<span class="player-state-badge ${isOnline ? 'online' : 'offline'}">${isOnline ? '在线' : '离线'}</span>`);
            if (seat.ready) badges.push('<span class="player-state-badge ready">准备</span>');
            if (missSuitName) badges.push(`<span class="player-state-badge miss">缺${missSuitName}</span>`);
            if (isHu) badges.push('<span class="player-state-badge hu">胡</span>');
            if (seat.isBot) badges.push('<span class="player-state-badge offline">AI</span>');

            return `
                <div class="player-status-card ${isSelf ? 'is-self' : ''} ${!isOnline ? 'is-offline' : ''} ${isHu ? 'is-hu' : ''}">
                    <div class="player-status-head">
                        <div class="player-status-avatar" style="width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:10px;background:${seat.avatarColor || 'var(--color-primary)'};color:#111;font-weight:900;box-shadow:0 6px 14px rgba(0,0,0,0.25);">${seat.avatarChar || (seat.nickname || ('玩家' + seat.seatIndex))[0]}</div>
                        <div class="player-status-name">${seat.nickname || ('玩家' + seat.seatIndex)}</div>
                        <div class="player-status-seat">座位 ${seat.seatIndex}</div>
                    </div>
                    <div class="player-status-badges">
                        ${badges.join('')}
                    </div>
                    <div class="player-status-note">${isSelf ? '你当前所在座位' : '网页层状态同步，不影响 Cocos 内部渲染'}</div>
                </div>
            `;
        }).join('');
    }

    sendToCocos(action, payload) {
        if (!this.cocosFrame || !this.cocosFrame.contentWindow) return;
        const enrichedPayload = {
            ...(payload || {}),
            myUserId: app.state.user?.userId
        };
        this.cocosFrame.contentWindow.postMessage({ action, payload: enrichedPayload }, window.location.origin);
    }

    // 渲染四个座位 UI
    renderSeats() {
        const uiSeatNames = ['下', '右', '上', '左'];

        for (let i = 0; i < 4; i++) {
            const el = document.querySelector(`.seat[data-seat="${i}"]`);
            if (!el) continue;
            
            const nameEl = el.querySelector('.seat-name');
            const avatarEl = el.querySelector('.seat-avatar');
            const p = this.seats[i];

            if (p) {
                // 已有人
                const safeNickname = p.nickname || (p.isBot ? 'AI' : `玩家${p.seatIndex}`);
                const displayName = p.isBot ? `${safeNickname} [AI]` : safeNickname;
                nameEl.innerText = displayName;
                nameEl.style.color = p.ready ? 'var(--color-success)' : '#fff';
                const avatarText = p.avatarChar || (p.isBot ? 'AI' : safeNickname.charAt(0).toUpperCase());
                avatarEl.innerText = avatarText;
                avatarEl.style.background = p.avatarColor || 'var(--color-primary)';
                
                // 状态表现
                if (p.ready) {
                    avatarEl.style.border = '3px solid var(--color-success)';
                    avatarEl.style.boxShadow = '0 0 15px var(--color-success)';
                } else {
                    avatarEl.style.border = '2px solid var(--color-primary)';
                    avatarEl.style.boxShadow = 'none';
                }

                // 标记在线状态
                avatarEl.style.opacity = p.online ? '1' : '0.5';

                if (p.userId === app.state.user.userId) {
                    nameEl.innerText += ' (我)';
                }
            } else {
                // 空座
                nameEl.innerText = `点击坐下 (${uiSeatNames[i]})`;
                nameEl.style.color = 'var(--text-muted)';
                avatarEl.innerText = '🪑';
                avatarEl.style.border = '2px dashed rgba(255,255,255,0.3)';
                avatarEl.style.boxShadow = 'none';
                avatarEl.style.opacity = '1';
            }
        }
    }

    // 更新操作按钮状态
    updateActionButtons(data) {
        const btnReady = document.getElementById('btn-ready');
        const btnStart = document.getElementById('btn-start-game');
        const btnAddBot = document.getElementById('btn-add-bot');
        
        if (this.mySeatIndex === -1) {
            btnReady.disabled = true;
            btnReady.innerText = "请先选座";
            btnReady.classList.remove('active');
        } else {
            btnReady.disabled = false;
            btnReady.innerText = this.isReady ? "取消准备" : "准备就绪";
            if (this.isReady) btnReady.classList.add('active');
            else btnReady.classList.remove('active');
        }

        if (btnStart) {
            const occupiedSeats = this.seats.filter(Boolean).length;
            const allReady = occupiedSeats === 4 && this.seats.every(p => p && p.ready);
            const gameNotStarted = this.roomStatus !== 'PLAYING';
            const canStart = this.isCreator && allReady && gameNotStarted;
            btnStart.disabled = !canStart;
        }

        if (btnAddBot) {
            const occupiedSeats = this.seats.filter(Boolean).length;
            const gameNotStarted = this.roomStatus !== 'PLAYING';
            btnAddBot.disabled = !(this.isCreator && gameNotStarted && occupiedSeats < 4);
        }

        // 房主特权：解散按钮 (如果需要动态添加)
        if (this.isCreator) {
            // 可以在 UI 上显示一个特殊的房主图标或功能
        }
    }

    // 点击某座位尝试坐下
    selectSeat(seatIndex) {
        // 如果点击的是自己所在的座位，视为“起身” (C_LEAVE_SEAT)
        if (this.mySeatIndex === seatIndex) {
            window.lobby.sendWsMessage('C_LEAVE_SEAT', this.currentRoomId, {});
            return;
        }

        // 如果点击的是别人的座位，报错
        if (this.seats[seatIndex]) {
            app.showToast('该座位已被占据');
            return;
        }

        // 发送选座请求
        if (window.lobby && window.lobby.ws) {
            window.lobby.sendWsMessage('C_CHOOSE_SEAT', this.currentRoomId, { seatIndex: seatIndex });
        }
    }

    // 切换准备状态
    toggleReady() {
        if (this.mySeatIndex === -1) return;
        window.lobby.sendWsMessage('C_READY', this.currentRoomId, {});
    }

    startGame() {
        if (!this.isCreator) {
            app.showError('只有房主可以开始游戏');
            return;
        }

        const occupiedSeats = this.seats.filter(Boolean).length;
        const allReady = occupiedSeats === 4 && this.seats.every(p => p && p.ready);
        if (!allReady) {
            app.showToast('需要 4 名玩家全部准备后才能开始');
            return;
        }

        window.lobby.sendWsMessage('C_START_GAME', this.currentRoomId, {});
    }

    addBot() {
        if (!this.isCreator) {
            app.showError('只有房主可以添加人机');
            return;
        }
        const occupiedSeats = this.seats.filter(Boolean).length;
        if (occupiedSeats >= 4) {
            app.showToast('房间已满，无法添加人机');
            return;
        }
        window.lobby.sendWsMessage('C_ADD_BOT', this.currentRoomId, {});
    }

    // --- 聊天系统 ---

    sendChat(e) {
        e.preventDefault();
        const inp = document.getElementById('chat-input');
        const txt = inp.value.trim();
        if (!txt) return;

        if (window.lobby && window.lobby.ws) {
            window.lobby.sendWsMessage('C_CHAT', this.currentRoomId, { message: txt });
        }
        inp.value = '';
    }

    sendGameChat(e) {
        e.preventDefault();
        const inp = document.getElementById('game-chat-input');
        const txt = inp.value.trim();
        if (!txt) return;

        if (window.lobby && window.lobby.ws) {
            window.lobby.sendWsMessage('C_CHAT', this.currentRoomId, { message: txt });
        }
        inp.value = '';
    }

    sendQuickChat(txt) {
        if (window.lobby && window.lobby.ws) {
            window.lobby.sendWsMessage('C_CHAT', this.currentRoomId, { message: txt });
        }
    }

    handleChatReceive(msgData) {
        // msgData: { seatIndex, nickname, message, senderId }
        const isSelf = msgData.senderId === app.state.user.userId;
        this.appendMessage(msgData.nickname, msgData.message, isSelf);
    }

    appendMessage(senderName, text, isSelf) {
        const activeGame = app.state.currentView === 'game';
        const list = document.getElementById(activeGame ? 'game-chat-message-list' : 'chat-message-list');
        if (!list) return;
        const msgWrapper = document.createElement('div');
        msgWrapper.style.display = "flex";
        msgWrapper.style.flexDirection = "column";
        msgWrapper.style.alignItems = isSelf ? "flex-end" : "flex-start";
        msgWrapper.style.marginBottom = "10px";

        const msgDiv = document.createElement('div');
        msgDiv.style.padding = "8px 12px";
        msgDiv.style.borderRadius = "8px";
        msgDiv.style.maxWidth = "85%";
        msgDiv.style.wordBreak = "break-all";
        msgDiv.style.fontSize = "0.9em";

        if (isSelf) {
            msgDiv.style.background = "var(--color-primary)";
            msgDiv.style.color = "#000";
            msgDiv.style.fontWeight = "bold";
            msgDiv.innerText = text;
        } else {
            msgDiv.style.background = "rgba(255,255,255,0.1)";
            msgDiv.style.color = "#eee";
            msgDiv.innerHTML = `<span style="color:var(--color-primary); font-weight:bold; font-size:0.8em; display:block; margin-bottom:2px;">${senderName}</span>${text}`;
        }

        msgWrapper.appendChild(msgDiv);
        list.appendChild(msgWrapper);
        list.scrollTop = list.scrollHeight;
    }
}

const room = new RoomController();
window.room = room;
