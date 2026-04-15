// js/game-console.js
// 开局后网页内嵌终端，直接通过现有 WebSocket 继续对局

class GameConsoleController {
    constructor() {
        this.roomId = null;
        this.userId = null;
        this.seatIndex = null;
        this.isOpen = false;
        this.handTiles = [];
        this.pendingActions = [];
        this.selectedTileId = null;
        this.pendingGangTileIds = [];
        this.pendingBuGangTileId = null;
        this.pendingChiOptions = [];
        this.phase = 'WAITING';
        this.selectedMissSuit = null;
    }

    open(gameStartData) {
        this.roomId = window.room?.currentRoomId || null;
        this.userId = app.state.user?.userId || null;
        this.seatIndex = gameStartData?.seatIndex ?? null;
        this.isOpen = true;
        this.phase = 'STARTED';
        this.pendingActions = [];
        this.pendingGangTileIds = [];
        this.pendingBuGangTileId = null;
        this.pendingChiOptions = [];
        this.selectedTileId = null;
        this.selectedMissSuit = null;
        this.setHandTiles(gameStartData?.handTiles || []);

        document.getElementById('game-console-room-id').innerText = this.roomId || '-';
        document.getElementById('game-console-user-id').innerText = this.userId || '-';
        document.getElementById('game-console-seat-index').innerText = this.seatIndex ?? '-';
        document.getElementById('game-console-banker-seat').innerText = gameStartData?.bankerSeat ?? '-';
        document.getElementById('modal-game-console').classList.remove('hidden');
        document.getElementById('game-console-input').focus();

        this.clearOutput();
        this.append('system', '对局开始，网页终端已接管。');
        this.setPhase('STARTED', '已发牌，先定缺，再进行出牌与碰杠胡。');
        this.append('system', `当前手牌: ${this.formatTileList(this.handTiles)}`);
        this.append('system', '优先使用上方按钮和手牌区操作；命令输入框保留为兜底。');
        this.render();
    }

    close() {
        this.isOpen = false;
        document.getElementById('modal-game-console').classList.add('hidden');
    }

    clearOutput() {
        document.getElementById('game-console-output').innerHTML = '';
    }

    append(kind, text) {
        const output = document.getElementById('game-console-output');
        const line = document.createElement('div');
        line.className = `game-console-line ${kind}`;
        line.innerText = text;
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
    }

    setPhase(phase, tip) {
        this.phase = phase;
        const phaseText = {
            WAITING: '等待开局',
            STARTED: '已开局',
            SELECT_MISS_SUIT: '定缺中',
            YOUR_TURN: '轮到你出牌',
            REACTING: '等待你响应',
            ROUND_SETTLED: '本局结算',
            GAME_OVER: '整场结束'
        }[phase] || phase;

        document.getElementById('game-console-phase').innerText = phaseText;
        document.getElementById('game-console-tip').innerText = tip || '开局后可直接点击按钮操作。';
    }

    setSelectedTile(tileId) {
        this.selectedTileId = Number.isInteger(tileId) ? tileId : null;
        const label = this.selectedTileId == null
            ? '未选择'
            : this.tileLabel(this.findTileById(this.selectedTileId) || { tileId: this.selectedTileId });
        document.getElementById('game-console-selected-tile').innerText = label;
        this.renderHand();
        this.renderActions();
    }

    setHandTiles(tiles) {
        this.handTiles = Array.isArray(tiles) ? tiles.map(tile => ({ ...tile })) : [];
        this.sortHandTiles();
        this.renderHand();
    }

    sortHandTiles() {
        this.handTiles.sort((left, right) => {
            const leftId = Number(left?.tileId ?? 999);
            const rightId = Number(right?.tileId ?? 999);
            return leftId - rightId;
        });
    }

    render() {
        this.renderHand();
        this.renderActions();
    }

    renderHand() {
        const container = document.getElementById('game-console-hand');
        const summary = document.getElementById('game-console-hand-summary');
        if (!container || !summary) return;

        container.innerHTML = '';
        if (!this.handTiles.length) {
            summary.innerText = '暂无手牌';
            return;
        }

        summary.innerText = this.formatTileList(this.handTiles);

        for (const tile of this.handTiles) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `game-console-tile${tile.tileId === this.selectedTileId ? ' selected' : ''}`;
            button.onclick = () => this.setSelectedTile(tile.tileId);
            button.innerHTML = `
                <span class="game-console-tile-name">${this.tileLabel(tile)}</span>
                <span class="game-console-tile-id">ID ${tile.tileId}</span>
            `;
            container.appendChild(button);
        }
    }

    renderActions() {
        const container = document.getElementById('game-console-actions');
        if (!container) return;

        container.innerHTML = '';
        const buildGroup = (title) => {
            const group = document.createElement('div');
            group.className = 'game-console-action-group';

            const titleEl = document.createElement('div');
            titleEl.className = 'game-console-action-group-title';
            titleEl.innerText = title;
            group.appendChild(titleEl);

            const body = document.createElement('div');
            body.className = 'game-console-action-group-body';
            group.appendChild(body);
            container.appendChild(group);
            return body;
        };

        const missSuitGroup = buildGroup('定缺');
        if (this.phase === 'SELECT_MISS_SUIT' && this.selectedMissSuit == null) {
            missSuitGroup.appendChild(this.buildActionButton('缺万', () => this.sendMissSuit(0)));
            missSuitGroup.appendChild(this.buildActionButton('缺筒', () => this.sendMissSuit(1)));
            missSuitGroup.appendChild(this.buildActionButton('缺条', () => this.sendMissSuit(2)));
        } else if (this.selectedMissSuit != null) {
            const suitNames = ['万', '筒', '条'];
            missSuitGroup.appendChild(this.buildActionButton(`已定缺: ${suitNames[this.selectedMissSuit] || this.selectedMissSuit}`, null, 'secondary', true));
        } else {
            missSuitGroup.appendChild(this.buildActionButton('等待定缺阶段', null, 'secondary', true));
        }

        const discardGroup = buildGroup('出牌');
        if (this.selectedTileId != null) {
            discardGroup.appendChild(this.buildActionButton(`打出 ${this.tileLabel(this.findTileById(this.selectedTileId))}`, () => this.sendDiscard(this.selectedTileId)));
        } else {
            discardGroup.appendChild(this.buildActionButton('先点选一张手牌', null, 'secondary', true));
        }

        const reactGroup = buildGroup('碰吃胡');
        const canPeng = this.pendingActions.includes('PENG');
        const canChi = this.pendingActions.includes('CHI');
        const canHu = this.pendingActions.includes('HU');

        reactGroup.appendChild(this.buildActionButton('碰', () => this.sendPeng(), '', !canPeng));
        if (canChi && this.pendingChiOptions.length) {
            for (const option of this.pendingChiOptions) {
                reactGroup.appendChild(this.buildActionButton(this.buildChiOptionLabel(option), () => this.sendChi(option.consumeTileIds)));
            }
        } else {
            reactGroup.appendChild(this.buildActionButton('吃', () => this.sendChi(), '', !canChi));
        }
        reactGroup.appendChild(this.buildActionButton('胡', () => this.sendHu(false), 'danger', !canHu));

        let hasReactAction = canPeng || canChi || canHu;
        if (this.pendingActions.includes('PASS')) {
            reactGroup.appendChild(this.buildActionButton('过', () => this.sendPass(), 'secondary'));
            hasReactAction = true;
        }
        if (this.pendingActions.includes('GANG')) {
            reactGroup.appendChild(this.buildActionButton('明杠', () => this.sendGang()));
            hasReactAction = true;
        }
        if (this.pendingActions.includes('AN_GANG')) {
            hasReactAction = true;
            for (const tileId of this.pendingGangTileIds) {
                reactGroup.appendChild(this.buildActionButton(`暗杠 ${this.tileLabel(this.findTileById(tileId) || { tileId })}`, () => this.sendAnGang(tileId)));
            }
        }
        if (this.pendingActions.includes('BU_GANG') && this.pendingBuGangTileId != null) {
            reactGroup.appendChild(this.buildActionButton(`补杠 ${this.tileLabel(this.findTileById(this.pendingBuGangTileId) || { tileId: this.pendingBuGangTileId })}`, () => this.sendBuGang(this.pendingBuGangTileId)));
            hasReactAction = true;
        }
        if (this.pendingActions.includes('ZI_MO')) {
            reactGroup.appendChild(this.buildActionButton('自摸', () => this.sendHu(true), 'danger'));
            hasReactAction = true;
        }
        if (!hasReactAction) {
            reactGroup.appendChild(this.buildActionButton('当前无可响应动作', null, 'secondary', true));
        }

        const systemGroup = buildGroup('系统');
        systemGroup.appendChild(this.buildActionButton('刷新状态', () => this.execute('state'), 'secondary'));
    }

    buildActionButton(text, onClick, className = '', disabled = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `game-console-action-btn${className ? ` ${className}` : ''}`;
        button.innerText = text;
        if (disabled) {
            button.disabled = true;
            button.classList.add('disabled');
        } else if (typeof onClick === 'function') {
            button.onclick = onClick;
        }
        return button;
    }

    buildChiOptionLabel(option) {
        const consumeTileIds = Array.isArray(option?.consumeTileIds) ? option.consumeTileIds : [];
        if (!consumeTileIds.length) return '吃';
        return `吃 ${consumeTileIds.map(tileId => this.tileLabel({ tileId })).join('+')}`;
    }

    tileLabel(tile) {
        const tileId = Number(tile?.tileId);
        const chineseDigits = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
        if (!Number.isInteger(tileId) || tileId < 0) {
            return tile?.name || '未知牌';
        }

        if (tileId <= 8) return `${chineseDigits[tileId]}万`;
        if (tileId <= 17) return `${chineseDigits[tileId - 9]}筒`;
        if (tileId <= 26) return `${chineseDigits[tileId - 18]}条`;
        return tile?.name || `牌${tileId}`;
    }

    formatTileList(tiles) {
        if (!Array.isArray(tiles) || !tiles.length) {
            return '暂无手牌';
        }
        return tiles.map(tile => this.tileLabel(tile)).join(' ');
    }

    findTileById(tileId) {
        return this.handTiles.find(tile => Number(tile.tileId) === Number(tileId)) || null;
    }

    removeTileFromHand(tileId, count = 1) {
        let remaining = count;
        this.handTiles = this.handTiles.filter(tile => {
            if (remaining > 0 && Number(tile.tileId) === Number(tileId)) {
                remaining -= 1;
                return false;
            }
            return true;
        });
        if (this.selectedTileId == null || !this.findTileById(this.selectedTileId)) {
            this.selectedTileId = null;
            document.getElementById('game-console-selected-tile').innerText = '未选择';
        }
        this.renderHand();
    }

    addTileToHand(tile) {
        if (!tile) return;
        this.handTiles.push({ ...tile });
        this.sortHandTiles();
        this.renderHand();
    }

    sendMissSuit(suitIndex) {
        if (this.selectedMissSuit != null) {
            this.append('system', '你已完成定缺，无需重复提交。');
            return;
        }
        this.execute(`miss ${suitIndex}`);
    }

    sendDiscard(tileId) {
        this.execute(`discard ${tileId}`);
    }

    sendPass() {
        this.execute('pass');
    }

    sendPeng() {
        this.execute('peng');
    }

    sendChi(consumeTileIds = null) {
        if (Array.isArray(consumeTileIds) && consumeTileIds.length === 2) {
            this.execute(`chi ${consumeTileIds[0]} ${consumeTileIds[1]}`);
            return;
        }
        this.execute('chi');
    }

    sendGang() {
        this.execute('gang');
    }

    sendBuGang(tileId) {
        this.execute(`bu ${tileId}`);
    }

    sendAnGang(tileId) {
        this.execute(`angang ${tileId}`);
    }

    sendHu(isSelfDraw) {
        this.execute(isSelfDraw ? 'zimo' : 'hu');
    }

    submit(event) {
        event.preventDefault();
        const input = document.getElementById('game-console-input');
        const command = input.value.trim();
        if (!command) return;
        input.value = '';
        this.execute(command);
    }

    execute(command) {
        const parts = command.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        this.append('cmd', `> ${command}`);

        if (cmd === 'help') {
            this.append('system', '可直接点按钮操作。命令兜底: miss <0|1|2> | discard <tileId> | pass | peng | chi [tileId tileId] | gang | bu <tileId> | angang <tileId> | hu | zimo | chat <文本> | ping | state');
            return;
        }

        if (!window.lobby || !window.lobby.ws || window.lobby.ws.readyState !== WebSocket.OPEN) {
            this.append('error', 'WebSocket 未连接，无法发送命令');
            return;
        }

        const send = (type, data = {}) => window.lobby.sendWsMessage(type, this.roomId, data);

        try {
            switch (cmd) {
                case 'miss':
                    if (args.length !== 1) throw new Error('用法: miss <0|1|2>');
                    const suitIndex = this.parseSuitArg(args[0]);
                    if (suitIndex < 0 || suitIndex > 2) throw new Error('定缺只支持 0/1/2 或 万/筒/条');
                    send('C_SELECT_MISS_SUIT', { suitIndex });
                    break;
                case 'discard':
                    if (args.length !== 1) throw new Error('用法: discard <tileId>');
                    send('C_DISCARD', { tileId: parseInt(args[0], 10) });
                    break;
                case 'pass':
                    send('C_PASS', {});
                    break;
                case 'peng':
                    send('C_PENG', {});
                    break;
                case 'chi':
                    if (args.length === 0) {
                        send('C_CHI', {});
                        break;
                    }
                    if (args.length !== 2) throw new Error('用法: chi 或 chi <tileId1> <tileId2>');
                    send('C_CHI', {
                        consumeTileIds: args.map(arg => parseInt(arg, 10))
                    });
                    break;
                case 'gang':
                    send('C_GANG', { gangType: 'MING', tileId: 0 });
                    break;
                case 'bu':
                    if (args.length !== 1) throw new Error('用法: bu <tileId>');
                    send('C_GANG', { gangType: 'BU', tileId: parseInt(args[0], 10) });
                    break;
                case 'angang':
                    if (args.length !== 1) throw new Error('用法: angang <tileId>');
                    send('C_AN_GANG', { tileId: parseInt(args[0], 10) });
                    break;
                case 'hu':
                    send('C_HU', { isSelfDraw: false });
                    break;
                case 'zimo':
                    send('C_HU', { isSelfDraw: true });
                    break;
                case 'chat':
                    if (args.length < 1) throw new Error('用法: chat <文本>');
                    send('C_CHAT', { message: args.join(' ') });
                    break;
                case 'ping':
                    send('C_PING', {});
                    break;
                case 'state':
                    send('C_JOIN_ROOM', {});
                    break;
                default:
                    this.append('error', '未知命令，输入 help 查看支持命令');
                    break;
            }
        } catch (error) {
            this.append('error', error.message || '命令解析失败');
        }
    }

    handleServerMessage(msg) {
        const type = msg.type;
        const data = msg.data || {};

        if (type === 'S_ERROR') {
            this.append('error', data.message || '操作失败');
            return;
        }

        if (type === 'S_GAME_START') {
            if (!this.isOpen) {
                this.open(data);
            } else {
                this.pendingActions = [];
                this.pendingGangTileIds = [];
                this.pendingBuGangTileId = null;
                this.pendingChiOptions = [];
                this.selectedTileId = null;
                this.selectedMissSuit = null;
                this.setHandTiles(data.handTiles || []);
                this.setPhase('STARTED', '新一局开始，等待定缺。');
                this.append('system', `新一局开始，手牌: ${this.formatTileList(this.handTiles)}`);
                this.render();
            }
            return;
        }

        switch (type) {
            case 'S_SELECT_MISS_SUIT':
                this.pendingActions = [];
                this.pendingGangTileIds = [];
                this.pendingBuGangTileId = null;
                this.pendingChiOptions = [];
                this.setPhase('SELECT_MISS_SUIT', data.message || '请选择定缺花色');
                this.append('system', data.message || '请选择定缺花色');
                this.renderActions();
                return;

            case 'S_MISS_SUIT_RESULT': {
                const suitNames = ['万', '筒', '条'];
                const seatText = data.seatIndex === this.seatIndex ? '你' : `${data.seatIndex}号位`;
                this.append('system', `${seatText}已定缺${suitNames[data.suitIndex] || data.suitIndex}`);
                if (Number(data.seatIndex) === Number(this.seatIndex)) {
                    this.selectedMissSuit = data.suitIndex;
                    this.setPhase('STARTED', `你已定缺${suitNames[data.suitIndex] || data.suitIndex}，等待所有玩家完成定缺。`);
                    this.renderActions();
                }
                return;
            }

            case 'S_DRAW': {
                if (Number(data.seatIndex) === Number(this.seatIndex) && data.tile) {
                    this.addTileToHand(data.tile);
                    this.pendingActions = [];
                    this.pendingChiOptions = [];
                    if (Array.isArray(data.actions)) {
                        for (const action of data.actions) {
                            if (action === 'HU') this.pendingActions.push('ZI_MO');
                            if (action === 'AN_GANG') this.pendingActions.push('AN_GANG');
                            if (action === 'BU_GANG') this.pendingActions.push('BU_GANG');
                        }
                    }
                    this.pendingGangTileIds = Array.isArray(data.canAnGangIds) ? data.canAnGangIds : [];
                    this.pendingBuGangTileId = Number.isInteger(data.buGangTileId) ? data.buGangTileId : null;
                    const tingText = Array.isArray(data.tingTiles) && data.tingTiles.length
                        ? `；听牌: ${data.tingTiles.map(tileId => this.tileLabel({ tileId })).join(' ')}`
                        : '';
                    this.setPhase('YOUR_TURN', `轮到你出牌，剩余牌墙 ${data.remaining ?? '-'} 张${tingText}`);
                    this.append('system', `你摸到 ${this.tileLabel(data.tile)}，当前手牌: ${this.formatTileList(this.handTiles)}`);
                    this.render();
                }
                return;
            }

            case 'S_DISCARD':
                if (Number(data.seatIndex) === Number(this.seatIndex)) {
                    this.removeTileFromHand(data.tileId, 1);
                    this.pendingActions = [];
                    this.pendingGangTileIds = [];
                    this.pendingBuGangTileId = null;
                    this.pendingChiOptions = [];
                    this.setPhase('STARTED', '已出牌，等待其他玩家响应。');
                }
                this.append('system', `${data.seatIndex}号位打出 ${this.tileLabel({ tileId: data.tileId, name: data.tileName })}`);
                this.renderActions();
                return;

            case 'S_ACTION_OPTIONS':
                this.pendingActions = Array.isArray(data.actions) ? data.actions.slice() : [];
                this.pendingChiOptions = this.normalizeChiOptions(data.chiOptions);
                this.setPhase('REACTING', `你可以响应：${this.pendingActions.join(' / ')}`);
                this.append('system', `可响应操作: ${this.pendingActions.join(', ')}`);
                this.renderActions();
                return;

            case 'S_CHI':
                if (Number(data.seatIndex) === Number(this.seatIndex)) {
                    const consumeTileIds = Array.isArray(data.consumeTileIds) ? data.consumeTileIds : [];
                    for (const tileId of consumeTileIds) {
                        this.removeTileFromHand(tileId, 1);
                    }
                    this.pendingActions = [];
                    this.pendingGangTileIds = [];
                    this.pendingBuGangTileId = null;
                    this.pendingChiOptions = [];
                    this.setPhase('YOUR_TURN', '吃牌成功，请继续出牌。');
                }
                this.append('system', `${data.seatIndex}号位吃了 ${this.tileLabel({ tileId: data.tileId })}`);
                this.renderActions();
                return;

            case 'S_PENG':
                if (Number(data.seatIndex) === Number(this.seatIndex)) {
                    this.removeTileFromHand(data.tileId, 2);
                    this.setPhase('YOUR_TURN', '碰牌成功，请继续出牌。');
                }
                this.append('system', `${data.seatIndex}号位碰了 ${this.tileLabel({ tileId: data.tileId })}`);
                this.renderActions();
                return;

            case 'S_GANG':
                if (Number(data.seatIndex) === Number(this.seatIndex)) {
                    if (data.gangType === 'AN') this.removeTileFromHand(data.tileId, 4);
                    if (data.gangType === 'BU') this.removeTileFromHand(data.tileId, 1);
                    if (data.gangType === 'MING') this.removeTileFromHand(data.tileId, 3);
                    this.pendingActions = [];
                    this.pendingGangTileIds = [];
                    this.pendingBuGangTileId = null;
                    this.pendingChiOptions = [];
                    this.setPhase('STARTED', '杠牌完成，等待补牌。');
                }
                this.append('system', `${data.seatIndex}号位${data.gangType || ''}杠了 ${this.tileLabel({ tileId: data.tileId })}`);
                this.render();
                return;

            case 'S_HU':
                this.pendingActions = [];
                this.pendingGangTileIds = [];
                this.pendingBuGangTileId = null;
                this.pendingChiOptions = [];
                this.setPhase('ROUND_SETTLED', `${data.seatIndex}号位${data.isSelfDraw ? '自摸' : '胡牌'}，本次分数 ${data.score ?? 0}`);
                this.append('system', `${data.seatIndex}号位${data.isSelfDraw ? '自摸' : '胡牌'}，牌型 ${data.winType || '胡牌'}，分数 ${data.score ?? 0}`);
                this.renderActions();
                return;

            case 'S_ROUND_RESULT':
                this.pendingActions = [];
                this.pendingGangTileIds = [];
                this.pendingBuGangTileId = null;
                this.pendingChiOptions = [];
                this.setPhase('ROUND_SETTLED', `第 ${data.round ?? '-'} 局已结算`);
                this.append('system', `本局结算: ${(data.players || []).map(player => `${player.nickname}:${player.score}`).join(' / ')}`);
                this.renderActions();
                return;

            case 'S_GAME_OVER':
                this.pendingActions = [];
                this.pendingGangTileIds = [];
                this.pendingBuGangTileId = null;
                this.pendingChiOptions = [];
                this.setPhase('GAME_OVER', '整场对局结束');
                this.append('system', `整场结束: ${(data.players || []).map(player => `${player.nickname}:${player.totalScore}`).join(' / ')}`);
                this.renderActions();
                return;

            case 'S_ROOM_STATE':
                if (data.status) {
                    this.append('system', `房间状态同步: ${data.status}`);
                }
                return;

            case 'S_CHAT':
                this.append('system', `[聊天] ${data.nickname || '玩家'}: ${data.message || ''}`);
                return;

            case 'S_PONG':
                this.append('system', '连接保活正常');
                return;

            default:
                break;
        }

        const prettyData = JSON.stringify(data);
        this.append('system', `[${type}] ${prettyData}`);
    }

    parseSuitArg(raw) {
        if (raw == null) return -1;
        const normalized = String(raw).trim().toLowerCase();
        if (normalized === '0' || normalized === 'wan' || normalized === 'w' || normalized === '万') return 0;
        if (normalized === '1' || normalized === 'tong' || normalized === 't' || normalized === '筒') return 1;
        if (normalized === '2' || normalized === 'tiao' || normalized === '条') return 2;
        return -1;
    }

    normalizeChiOptions(raw) {
        if (!Array.isArray(raw)) return [];
        const options = [];

        for (const option of raw) {
            const consumeTileIds = Array.isArray(option)
                ? option
                : (Array.isArray(option?.consumeTileIds) ? option.consumeTileIds : []);

            if (consumeTileIds.length !== 2) continue;
            const parsed = consumeTileIds.map(value => parseInt(value, 10));
            if (parsed.some(value => !Number.isInteger(value))) continue;
            options.push({ consumeTileIds: parsed });
        }

        return options;
    }
}

const gameConsole = new GameConsoleController();
window.gameConsole = gameConsole;
