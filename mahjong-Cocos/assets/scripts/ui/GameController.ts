import { _decorator, Component, Node, Label, director } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';
import { MessageType } from '../core/TileConstants';
import { GameData } from '../core/GameData';
import { ActionQueue } from '../core/ActionQueue';
import { MahjongTable } from './MahjongTable';
import { OpponentArea } from './OpponentArea';
import { TableCenterManager } from './TableCenterManager';
import { ActionController } from './ActionController';
import { MissSuitSelector } from './MissSuitSelector';
import { RoundResultPanel } from './RoundResultPanel';
import { VisualEffectManager } from './VisualEffectManager';
import { TingIndicator } from './TingIndicator';
import { PlayerUI } from './PlayerUI';

const { ccclass, property } = _decorator;

@ccclass('GameController')
export class GameController extends Component {
    @property(MahjongTable)
    mahjongTable: MahjongTable = null!;

    @property([OpponentArea])
    opponentAreas: OpponentArea[] = [];

    @property(TableCenterManager)
    centerManager: TableCenterManager = null!;

    @property(ActionController)
    actionController: ActionController = null!;

    @property(MissSuitSelector)
    missSuitSelector: MissSuitSelector = null!;

    @property(RoundResultPanel)
    roundResultPanel: RoundResultPanel = null!;

    @property(Label)
    labelWallCount: Label = null!;

    @property(TingIndicator)
    tingIndicator: TingIndicator = null!;

    @property(PlayerUI)
    localPlayerUI: PlayerUI = null!;

    @property(Node)
    readyPanel: Node = null!;

    private _mySeatIndex: number = -1;
    private _isReady: boolean = false;
    private _actionQueue: ActionQueue = new ActionQueue();

    protected onLoad(): void {
        WebSocketManager.instance.initIframeBridge();

        const ws = WebSocketManager.instance;
        ws.on(MessageType.S_ROOM_STATE, this._onRoomState, this);
        ws.on(MessageType.S_GAME_START, this._onGameStart, this);
        ws.on(MessageType.S_SELECT_MISS_SUIT, this._onStartMissSuit, this);
        ws.on(MessageType.S_MISS_SUIT_RESULT, this._onMissSuitResult, this);
        ws.on(MessageType.S_DRAW, this._onDraw, this);
        ws.on(MessageType.S_DISCARD, this._onDiscard, this);
        ws.on(MessageType.S_PENG, this._onPeng, this);
        ws.on(MessageType.S_CHI, this._onChi, this);
        ws.on(MessageType.S_GANG, this._onGang, this);
        ws.on(MessageType.S_GANG_DRAW, this._onGangDraw, this);
        ws.on(MessageType.S_HU, this._onHu, this);
        ws.on(MessageType.S_COUNTDOWN, this._onCountdown, this);
        ws.on(MessageType.S_ERROR, this._onError, this);
    }

    protected onDestroy(): void {
        const ws = WebSocketManager.instance;
        ws.off(MessageType.S_ROOM_STATE, this._onRoomState, this);
        ws.off(MessageType.S_GAME_START, this._onGameStart, this);
        ws.off(MessageType.S_SELECT_MISS_SUIT, this._onStartMissSuit, this);
        ws.off(MessageType.S_MISS_SUIT_RESULT, this._onMissSuitResult, this);
        ws.off(MessageType.S_DRAW, this._onDraw, this);
        ws.off(MessageType.S_DISCARD, this._onDiscard, this);
        ws.off(MessageType.S_PENG, this._onPeng, this);
        ws.off(MessageType.S_CHI, this._onChi, this);
        ws.off(MessageType.S_GANG, this._onGang, this);
        ws.off(MessageType.S_GANG_DRAW, this._onGangDraw, this);
        ws.off(MessageType.S_HU, this._onHu, this);
        ws.off(MessageType.S_COUNTDOWN, this._onCountdown, this);
        ws.off(MessageType.S_ERROR, this._onError, this);
    }

    public onLeaveClick(): void {
        WebSocketManager.instance.send('C_LEAVE_ROOM', {});
        director.loadScene('LobbyScene');
    }

    private _onRoomState(data: any): void {
        data = data || {};
        const status = data.status;
        const players = this._normalizePlayers(data);
        const bankerSeat = this._getBankerSeat(data);
        const myUserId = WebSocketManager.instance.userId;

        const me = players.find((p: any) => p.userId === myUserId);
        if (me) {
            this._mySeatIndex = me.seatIndex;
            this._isReady = !!me.ready;

            if (this.mahjongTable) {
                this.mahjongTable.setMySeatIndex(this._mySeatIndex);
            }
            if (this.centerManager) {
                this.centerManager.setLocalSeatIndex(this._mySeatIndex);
            }
            if (this.localPlayerUI) {
                this.localPlayerUI.updateInfo(me.nickname || 'Me', me.score || 0, me.online !== false);
            }
        }

        if (this.readyPanel) {
            this.readyPanel.active = status === 'WAITING' || status === 'READY';
        }

        for (const p of players) {
            if (p.userId === myUserId) {
                if (this.localPlayerUI) {
                    (this.localPlayerUI as any).node.setSiblingIndex(999);
                    this.localPlayerUI.setZhuang(p.seatIndex === bankerSeat);
                }
                continue;
            }

            const relSeat = GameData.getRelativeSeat(this._mySeatIndex, p.seatIndex);
            const area = this.opponentAreas[relSeat - 1];
            if (area) {
                area.init(p.seatIndex, p.nickname || ('Player' + p.seatIndex), 13);
                if (typeof p.score === 'number') {
                    area.setScore(p.score);
                }
                area.setZhuang(p.seatIndex === bankerSeat);
            }
        }
    }

    private _onGameStart(data: any): void {
        data = data || {};

        if (this.readyPanel) {
            this.readyPanel.active = false;
        }
        if (this.tingIndicator) {
            this.tingIndicator.hide();
        }

        this._actionQueue.clear();

        const wallCount = data.wallCount;
        const bankerSeat = this._getBankerSeat(data);

        if (typeof data.seatIndex === 'number') {
            this._mySeatIndex = data.seatIndex;
        }

        this._updateWallCount(wallCount);

        if (this.mahjongTable) {
            this.mahjongTable.setMySeatIndex(this._mySeatIndex);
        }
        if (this.centerManager) {
            this.centerManager.setLocalSeatIndex(this._mySeatIndex);
            if (typeof bankerSeat === 'number') {
                this.centerManager.setActiveDirection(bankerSeat);
            }
        }

        if (this.localPlayerUI) {
            this.localPlayerUI.setZhuang(this._mySeatIndex === bankerSeat);
            (this.localPlayerUI as any).node.setSiblingIndex(999);
        }

        for (const area of this.opponentAreas) {
            if (!area) continue;

            const nickname = area.labelNickname ? area.labelNickname.string : ('Player' + area.seatIndex);
            area.init(area.seatIndex, nickname, 13);
            area.setZhuang(area.seatIndex === bankerSeat);
        }
    }

    private _onStartMissSuit(_data: any): void {
        if (this.missSuitSelector) {
            const selectorNode = (this.missSuitSelector as any).node;
            if (selectorNode) {
                selectorNode.active = true;
            }
        }
    }

    private _onMissSuitResult(data: any): void {
        const results: { seatIndex: number; suitIndex: number }[] = Array.isArray(data) ? data : [];
        const suitNames = ['Wan', 'Tong', 'Tiao'];

        for (const r of results) {
            const relSeat = GameData.getRelativeSeat(this._mySeatIndex, r.seatIndex);
            const suitName = suitNames[r.suitIndex] || '';

            if (relSeat === 0) {
                if (this.localPlayerUI) {
                    this.localPlayerUI.setMissSuit(suitName);
                }
                continue;
            }

            const area = this.opponentAreas[relSeat - 1];
            if (area) {
                area.setMissSuit(suitName);
            }
        }
    }

    private _onDraw(data: any): void {
        data = data || {};
        this._updateWallCount(data.wallCount);

        if (typeof data.seatIndex === 'number' && this.centerManager) {
            this.centerManager.setActiveDirection(data.seatIndex);
        }
        if (this.centerManager) {
            this.centerManager.startCountdown(20);
        }

        if (this.tingIndicator) {
            if (data.tingTiles && data.tingTiles.length > 0) {
                this.tingIndicator.showTing(data.tingTiles);
            } else {
                this.tingIndicator.hide();
            }
        }
    }

    private _onCountdown(data: any): void {
        data = data || {};
        const seatIndex = data.seatIndex;
        const seconds = data.seconds;

        if (this.centerManager) {
            this.centerManager.setActiveDirection(seatIndex);
            this.centerManager.startCountdown(seconds);
        }

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        if (relSeat !== 0) {
            const area = this.opponentAreas[relSeat - 1];
            if (area) {
                area.onOpponentDraw();
            }
        }
    }

    private _onDiscard(data: any): void {
        data = data || {};
        const seatIndex = data.seatIndex;
        const tileId = data.tileId;
        const wallCount = data.wallCount;

        this._updateWallCount(wallCount);

        if (seatIndex === this._mySeatIndex) {
            return;
        }

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        const area = this.opponentAreas[relSeat - 1];
        if (area) {
            area.onOpponentDiscard(tileId);
        }
    }

    private _onPeng(data: any): void {
        data = data || {};
        const seatIndex = data.seatIndex;
        const tileId = data.tileId;

        this._playActionEffect(seatIndex, 'Peng');
        if (seatIndex === this._mySeatIndex) {
            if (this.mahjongTable) {
                this.mahjongTable.onPeng(tileId);
            }
            return;
        }

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        const area = this.opponentAreas[relSeat - 1];
        if (area) {
            area.onPeng(tileId);
        }
    }

    private _onChi(data: any): void {
        data = data || {};
        const seatIndex = data.seatIndex;
        const tileId = data.tileId;
        const consumeTileIds = data.consumeTileIds || [];

        this._playActionEffect(seatIndex, 'Chi');
        if (seatIndex === this._mySeatIndex) {
            if (this.mahjongTable) {
                this.mahjongTable.onChi(tileId, consumeTileIds);
            }
            return;
        }

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        const area = this.opponentAreas[relSeat - 1];
        if (area) {
            area.onChi(tileId, consumeTileIds);
        }
    }

    private _onGang(data: any): void {
        data = data || {};
        const seatIndex = data.seatIndex;
        const tileId = data.tileId;
        const gangType = data.gangType;

        this._playActionEffect(seatIndex, 'Gang');
        if (seatIndex === this._mySeatIndex) {
            if (this.mahjongTable) {
                this.mahjongTable.onGang(tileId, gangType);
            }
            return;
        }

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        const area = this.opponentAreas[relSeat - 1];
        if (area) {
            area.onGang(tileId, gangType === 'AN');
        }
    }

    private _onGangDraw(data: any): void {
        data = data || {};
        console.log('[GameController] Gang draw tileId:', data.tileId);
    }

    private _onHu(data: any): void {
        data = data || {};
        const seatIndex = data.seatIndex;
        const text = data.isSelfDraw ? 'ZiMo' : 'Hu';

        this._playActionEffect(seatIndex, text);
        console.log('[GameController] Seat ' + seatIndex + ' HU! (' + text + ')');
    }

    private _onError(data: any): void {
        data = data || {};
        console.warn('[GameController] Server error:', data.message || data);
    }

    private _playActionEffect(seatIndex: number, text: string): void {
        if (!VisualEffectManager.instance) return;

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        let pos: any = null;
        if (relSeat === 0) {
            const localNode = this.localPlayerUI ? (this.localPlayerUI as any).node : null;
            pos = localNode ? localNode.worldPosition : null;
        } else {
            const area = this.opponentAreas[relSeat - 1];
            const areaNode = area ? (area as any).node : null;
            pos = areaNode ? areaNode.worldPosition : null;
        }

        if (pos) {
            VisualEffectManager.instance.playTextEffect(text, pos);
        }
    }

    private _updateWallCount(count?: number): void {
        if (count === undefined || !this.labelWallCount) return;

        this.labelWallCount.string = 'Remaining: ' + count;
        this.labelWallCount.node.setSiblingIndex(999);
        if (this.labelWallCount.node.parent) {
            this.labelWallCount.node.parent.setSiblingIndex(999);
        }
    }

    private _getBankerSeat(data: any): number | undefined {
        if (data && data.bankerSeat !== undefined) {
            return data.bankerSeat;
        }
        return data ? data.dealerSeat : undefined;
    }

    private _normalizePlayers(data: any): any[] {
        if (data && Array.isArray(data.players)) {
            return data.players;
        }

        if (data && Array.isArray(data.seats)) {
            return data.seats.filter((p: any) => p && p.occupied);
        }

        return [];
    }
}
