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

/**
 * 游戏主控制器
 */
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
    private _myUserId: string = '';
    private _isReady: boolean = false;
    private _bankerSeat: number = -1;
    private _actionQueue: ActionQueue = new ActionQueue();
    private _cachedTingTiles: number[] = [];

    protected onLoad(): void {
        WebSocketManager.instance.initIframeBridge();
        this._resolveSceneBindings();

        const ws = WebSocketManager.instance;
        ws.on(MessageType.S_ROOM_STATE, this._onRoomState, this);
        ws.on(MessageType.S_SPECTATE_INIT, this._onRoomState, this);
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
        ws.on(MessageType.S_ROUND_RESULT, this._onRoundResult, this);
        ws.on(MessageType.S_GAME_OVER, this._onRoundResult, this);
        ws.on(MessageType.S_COUNTDOWN, this._onCountdown, this);
        ws.on(MessageType.S_ERROR, this._onError, this);
    }

    protected onDestroy(): void {
        const ws = WebSocketManager.instance;
        ws.off(MessageType.S_ROOM_STATE, this._onRoomState, this);
        ws.off(MessageType.S_SPECTATE_INIT, this._onRoomState, this);
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
        ws.off(MessageType.S_ROUND_RESULT, this._onRoundResult, this);
        ws.off(MessageType.S_GAME_OVER, this._onRoundResult, this);
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
        if (typeof bankerSeat === 'number' && bankerSeat >= 0) {
            this._bankerSeat = bankerSeat;
        }

        const myUserId = this._resolveCurrentUserId(data);
        const wallCount = this._resolveWallCount(data);

        this._updateWallCount(wallCount);

        const me = myUserId ? this._mergePlayerMeta(players.find((p: any) => String(p.userId) === myUserId), data) : null;
        if (!me && this._mySeatIndex < 0) {
            this._mySeatIndex = this._resolveViewSeat(data, players);
        }
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
                this.localPlayerUI.updateInfo(
                    me.nickname || '我',
                    this._resolvePlayerScore(me, data),
                    me.online !== false,
                    me.avatarChar,
                    me.avatarColor,
                    me.avatarUrl
                );
                this.localPlayerUI.setHu(!!me.isHu);
                const mySuit = this._resolvePlayerMissSuit(me, data);
                this.localPlayerUI.setMissSuit(mySuit);
                if (this._bankerSeat >= 0) {
                    this.localPlayerUI.setZhuang(me.seatIndex === this._bankerSeat);
                }
            }
        }

        if (this.readyPanel) {
            this.readyPanel.active = status === 'WAITING' || status === 'READY';
        }

        // 更新其他玩家
        for (const rawPlayer of players) {
            const p = this._mergePlayerMeta(rawPlayer, data);
            if (myUserId && String(p.userId) === myUserId) continue;

            const relSeat = this._getRelativeSeat(p.seatIndex);
            if (relSeat === 0) {
                this.localPlayerUI?.updateInfo(
                    p.nickname || ('玩家' + p.seatIndex),
                    this._resolvePlayerScore(p, data),
                    p.online !== false,
                    p.avatarChar,
                    p.avatarColor,
                    p.avatarUrl
                );
                this.localPlayerUI?.setHu(!!p.isHu);
                this.localPlayerUI?.setMissSuit(this._resolvePlayerMissSuit(p, data));
                if (this._bankerSeat >= 0) {
                    this.localPlayerUI?.setZhuang(p.seatIndex === this._bankerSeat);
                }
                continue;
            }

            // relSeat: 1=Right, 2=Top, 3=Left
            const area = this.opponentAreas[relSeat - 1];
            if (area) {
                area.init(p.seatIndex, p.nickname || ('玩家' + p.seatIndex), this._resolveHandCount(p), undefined, p);
                const suit = this._resolvePlayerMissSuit(p, data);
                area.updatePlayerMeta(p, this._resolvePlayerScore(p, data), suit);
                area.setScore(this._resolvePlayerScore(p, data));
                if (this._bankerSeat >= 0) {
                    area.setZhuang(p.seatIndex === this._bankerSeat);
                }
                area.setHu(!!p.isHu);
            }
        }

        this._syncZhuangIcons();
    }

    private _onGameStart(data: any): void {
        data = data || {};

        if (this.readyPanel) {
            this.readyPanel.active = false;
        }
        if (this.tingIndicator) {
            this._clearTingCache();
        }

        this._actionQueue.clear();

        const wallCount = this._resolveWallCount(data);
        const bankerSeat = this._getBankerSeat(data);
        if (typeof bankerSeat === 'number' && bankerSeat >= 0) {
            this._bankerSeat = bankerSeat;
        }

        const explicitMySeat = this._resolveExplicitSeat(data);

        if (typeof explicitMySeat === 'number') {
            this._mySeatIndex = explicitMySeat;
        } else if (this._mySeatIndex < 0 && Array.isArray(data.handTiles) && typeof data.seatIndex === 'number') {
            this._mySeatIndex = data.seatIndex;
        }

        this._updateWallCount(wallCount);

        if (this.mahjongTable) {
            this.mahjongTable.setMySeatIndex(this._mySeatIndex);
        }
        if (this.centerManager) {
            this.centerManager.setLocalSeatIndex(this._mySeatIndex);
            if (this._bankerSeat >= 0) {
                this.centerManager.setActiveDirection(this._bankerSeat);
            }
        }

        if (this.localPlayerUI) {
            if (this._bankerSeat >= 0) {
                this.localPlayerUI.setZhuang(this._mySeatIndex === this._bankerSeat);
            }
            this.localPlayerUI.setHu(false);
            this.localPlayerUI.setMissSuit(""); 
        }

        for (const area of this.opponentAreas) {
            if (!area) continue;
            if (this._bankerSeat >= 0) {
                area.setZhuang(area.seatIndex === this._bankerSeat);
            }
            area.setHu(false);
            area.setMissSuit(""); 
        }

        this._syncZhuangIcons();
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
        data = data || {};
        const bankerSeat = this._getBankerSeat(data);
        if (typeof bankerSeat === 'number' && bankerSeat >= 0) {
            this._bankerSeat = bankerSeat;
        }

        const results = this._normalizeMissSuitResults(data);

        for (const r of results) {
            const relSeat = this._getRelativeSeat(r.seatIndex);
            const suitName = this._resolveSuitName(r.suitIndex);

            if (relSeat === 0) {
                if (this.localPlayerUI) {
                    this.localPlayerUI.setMissSuit(suitName);
                    if (this._bankerSeat >= 0) {
                        this.localPlayerUI.setZhuang(this._mySeatIndex === this._bankerSeat);
                    }
                }
                continue;
            }

            const area = this.opponentAreas[relSeat - 1];
            if (area) {
                area.setMissSuit(suitName);
                if (this._bankerSeat >= 0) {
                    area.setZhuang(area.seatIndex === this._bankerSeat);
                }
            }
        }

        this._syncZhuangIcons();
    }

    private _onDraw(data: any): void {
        data = data || {};
        const wallCount = this._resolveWallCount(data);
        this._updateWallCount(wallCount);

        const seatIndex = data.seatIndex;
        if (typeof seatIndex === 'number' && this.centerManager) {
            this.centerManager.setActiveDirection(seatIndex);
        }
        if (this.centerManager) {
            this.centerManager.startCountdown(20);
        }

        this._cacheTingTilesFromAction(data, seatIndex);
    }

    private _onCountdown(data: any): void {
        data = data || {};
        const seatIndex = data.seatIndex;
        const seconds = data.seconds;
        
        const wallCount = this._resolveWallCount(data);
        this._updateWallCount(wallCount);

        if (this.centerManager) {
            this.centerManager.setActiveDirection(seatIndex);
            this.centerManager.startCountdown(seconds);
        }

        const relSeat = this._getRelativeSeat(seatIndex);
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
        const wallCount = this._resolveWallCount(data);

        this._updateWallCount(wallCount);

        this._cacheTingTilesFromAction(data, seatIndex);

        if (seatIndex === this._mySeatIndex) {
            return;
        }

        const relSeat = this._getRelativeSeat(seatIndex);
        const area = this.opponentAreas[relSeat - 1];
        if (area) {
            area.onOpponentDiscard(tileId);
        }
    }

    private _onPeng(data: any): void {
        data = data || {};
        const seatIndex = data.seatIndex;
        const tileId = data.tileId;
        
        const wallCount = this._resolveWallCount(data);
        this._updateWallCount(wallCount);

        this._playActionEffect(seatIndex, '碰');
        
        this._cacheTingTilesFromAction(data, seatIndex);
        this._removeClaimedDiscard(data, tileId);

        if (seatIndex === this._mySeatIndex) {
            if (this.mahjongTable) {
                this.mahjongTable.onPeng(tileId);
            }
            return;
        }

        const relSeat = this._getRelativeSeat(seatIndex);
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
        
        const wallCount = this._resolveWallCount(data);
        this._updateWallCount(wallCount);

        this._playActionEffect(seatIndex, '吃');

        this._cacheTingTilesFromAction(data, seatIndex);
        this._removeClaimedDiscard(data, tileId);

        if (seatIndex === this._mySeatIndex) {
            if (this.mahjongTable) {
                this.mahjongTable.onChi(tileId, consumeTileIds);
            }
            return;
        }

        const relSeat = this._getRelativeSeat(seatIndex);
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
        
        const wallCount = this._resolveWallCount(data);
        this._updateWallCount(wallCount);

        this._playActionEffect(seatIndex, '杠');

        this._cacheTingTilesFromAction(data, seatIndex);
        if (gangType !== 'AN') {
            this._removeClaimedDiscard(data, tileId);
        }

        if (seatIndex === this._mySeatIndex) {
            if (this.mahjongTable) {
                this.mahjongTable.onGang(tileId, gangType);
            }
            return;
        }

        const relSeat = this._getRelativeSeat(seatIndex);
        const area = this.opponentAreas[relSeat - 1];
        if (area) {
            area.onGang(tileId, gangType === 'AN');
        }
    }

    private _onGangDraw(data: any): void {
        data = data || {};
        const wallCount = this._resolveWallCount(data);
        this._updateWallCount(wallCount);
        console.log('[GameController] 杠抓牌:', data.tileId);
    }

    private _onHu(data: any): void {
        data = data || {};
        const seatIndex = data.seatIndex;
        const text = data.isSelfDraw ? '自摸' : '胡';
        
        const wallCount = this._resolveWallCount(data);
        this._updateWallCount(wallCount);

        this._playActionEffect(seatIndex, text);

        if (seatIndex === this._mySeatIndex) {
            this.localPlayerUI?.setHu(true, text);
        } else {
            const relSeat = this._getRelativeSeat(seatIndex);
            const area = this.opponentAreas[relSeat - 1];
            area?.setHu(true, text);
        }
    }

    private _onRoundResult(data: any): void {
        const huaZhuSeats = this._normalizeSeatList(data?.huaZhuSeats);
        const players = this._normalizePlayers(data);
        
        const wallCount = this._resolveWallCount(data);
        this._updateWallCount(wallCount);

        for (const player of players) {
            const relSeat = this._getRelativeSeat(player.seatIndex);
            if (relSeat === 0) {
                this.localPlayerUI?.updateInfo(
                    player.nickname || '我',
                    this._resolvePlayerScore(player, data),
                    player.online !== false,
                    player.avatarChar,
                    player.avatarColor,
                    player.avatarUrl
                );
                this.localPlayerUI?.setMissSuit(this._resolvePlayerMissSuit(player, data));
            } else {
                const area = this.opponentAreas[relSeat - 1];
                const suit = this._resolvePlayerMissSuit(player, data);
                area?.updatePlayerMeta(player, this._resolvePlayerScore(player, data), suit);
            }
        }

        for (const seatIndex of huaZhuSeats) {
            const relSeat = this._getRelativeSeat(seatIndex);
            if (relSeat === 0) {
                this.localPlayerUI?.setResultBadge('花猪');
            } else {
                this.opponentAreas[relSeat - 1]?.setResultBadge('花猪');
            }
        }
    }

    private _onError(data: any): void {
        data = data || {};
        console.warn('[GameController] 服务器错误:', data.message || data);
    }

    private _playActionEffect(seatIndex: number, text: string): void {
        if (!VisualEffectManager.instance) return;

        const relSeat = this._getRelativeSeat(seatIndex);
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
        this.labelWallCount.string = '剩余: ' + count;
    }

    private _resolveSceneBindings(): void {
        if (!this.localPlayerUI) {
            const localNode = this.node.getChildByName('PlayerItemBottom') || this.node.parent?.getChildByName('PlayerItemBottom');
            this.localPlayerUI = localNode?.getComponent(PlayerUI) || this.localPlayerUI;
        }
    }

    private _resolvePlayerMissSuit(player: any, roomStateData?: any): string {
        let suit = player?.missSuit ?? player?.suitIndex ?? player?.suit;

        if ((suit === undefined || suit === null || suit === -1) && roomStateData) {
            const maps = [roomStateData.missSuits, roomStateData.playerMissSuits, roomStateData.missSuitMap];   
            const userId = player?.userId;
            const seatIndex = player?.seatIndex;

            for (const map of maps) {
                if (!map || typeof map !== 'object') continue;
                if (userId !== undefined && map[userId] !== undefined) {
                    suit = map[userId];
                    break;
                }
                if (seatIndex !== undefined && map[seatIndex] !== undefined) {
                    suit = map[seatIndex];
                    break;
                }
            }
        }

        return this._resolveSuitName(suit);
    }

    private _removeClaimedDiscard(data: any, tileId: number): void {
        const fromSeat = this._resolveDiscardProviderSeat(data);
        if (typeof fromSeat !== 'number') return;

        const relSeat = this._getRelativeSeat(fromSeat);
        if (relSeat === 0) {
            this.mahjongTable?.removeLastDiscard(tileId);
            return;
        }

        this.opponentAreas[relSeat - 1]?.removeLastDiscard(tileId);
    }

    private _resolveDiscardProviderSeat(data: any): number | undefined {
        const candidates = [
            data?.fromSeat,
            data?.fromSeatIndex,
            data?.discardSeat,
            data?.discardSeatIndex,
            data?.providerSeat,
            data?.providerSeatIndex,
            data?.targetSeat,
            data?.targetSeatIndex
        ];

        for (const value of candidates) {
            const seat = Number(value);
            if (!isNaN(seat) && seat >= 0) return seat;
        }

        return undefined;
    }

    private _cacheTingTilesFromAction(data: any, seatIndex?: number): void {
        if (!data || seatIndex !== this._mySeatIndex) return;

        const tingTiles = this._resolveTingTiles(data);
        if (!tingTiles.length) return;

        this._cachedTingTiles = tingTiles;
        this.tingIndicator?.showTing(this._cachedTingTiles);
    }

    private _clearTingCache(): void {
        this._cachedTingTiles = [];
        this.tingIndicator?.hide();
    }

    private _resolveTingTiles(data: any): number[] {
        const candidates = [
            data?.tingTiles,
            data?.drawData?.tingTiles,
            data?.actionData?.tingTiles,
            data?.result?.tingTiles
        ];

        for (const value of candidates) {
            if (Array.isArray(value) && value.length > 0) {
                return value
                    .map((tile: any) => typeof tile === 'number' ? tile : Number(tile?.tileId ?? tile))
                    .filter((tile: number) => !isNaN(tile));
            }
        }

        return [];
    }

    private _getRelativeSeat(targetSeat: number): number {
        if (this._mySeatIndex < 0) return targetSeat;
        return GameData.getRelativeSeat(this._mySeatIndex, targetSeat);
    }

    private _resolveViewSeat(data: any, players: any[]): number {
        const explicitSeat = this._resolveExplicitSeat(data);
        if (typeof explicitSeat === 'number') return explicitSeat;

        const myUserId = this._resolveCurrentUserId(data);
        if (myUserId) {
            const me = players.find((p: any) => String(p?.userId) === myUserId);
            if (typeof me?.seatIndex === 'number') return me.seatIndex;
        }

        return 0;
    }

    private _mergePlayerMeta(player: any, roomStateData?: any): any {
        if (!player) return player;

        const htmlUser = this._findHtmlUser(player.userId, roomStateData);
        if (!htmlUser) return player;

        const avatarUrl = htmlUser.avatarUrl || player.avatarUrl;
        const avatarChar = htmlUser.avatarChar || player.avatarChar || String(player.userId || htmlUser.userId || "").charAt(0);
        const avatarColor = htmlUser.avatarColor || player.avatarColor;

        return {
            ...htmlUser,
            ...player,
            avatarChar: avatarChar,
            avatarColor: avatarColor,
            avatarUrl: avatarUrl,
            totalScore: player.totalScore ?? htmlUser.totalScore,
            score: player.score ?? htmlUser.score
        };
    }

    private _resolveExplicitSeat(data: any): number | undefined {
        const candidates = [data?.mySeatIndex, data?.selfSeatIndex, data?.viewSeat, data?.viewerSeat];
        for (const value of candidates) {
            const seat = Number(value);
            if (!isNaN(seat) && seat >= 0) return seat;
        }

        return undefined;
    }

    private _resolveCurrentUserId(data?: any): string {
        const candidates = [
            data?.myUserId,
            data?.currentUserId,
            data?.selfUserId,
            data?.me?.userId,
            data?.currentUser?.userId,
            WebSocketManager.instance.userId
        ];

        for (const value of candidates) {
            if (value !== undefined && value !== null && String(value) !== '' && String(value) !== 'undefined') {
                this._myUserId = String(value);
                return this._myUserId;
            }
        }

        return this._myUserId;
    }

    private _resolveWallCount(data: any): number | undefined {
        const candidates = [data?.remaining, data?.wallCount, data?.WallCount, data?.remainCount];
        for (const value of candidates) {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
        }
        return undefined;
    }

    private _resolveHandCount(player: any): number {
        const candidates = [player?.handCount, player?.tileCount, player?.handTileCount];
        for (const value of candidates) {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
        }
        return 13;
    }

    private _getBankerSeat(data: any): number | undefined {
        const candidates = [
            data?.bankerSeat,
            data?.dealerSeat,
            data?.gameState?.bankerSeat,
            data?.state?.bankerSeat,
            data?.roomState?.bankerSeat
        ];

        for (const value of candidates) {
            const seat = Number(value);
            if (!isNaN(seat) && seat >= 0) return seat;
        }

        return undefined;
    }

    private _syncZhuangIcons(): void {
        if (this._bankerSeat < 0) return;

        if (this.localPlayerUI && this._mySeatIndex >= 0) {
            this.localPlayerUI.setZhuang(this._mySeatIndex === this._bankerSeat);
        }

        for (const area of this.opponentAreas) {
            if (!area || area.seatIndex < 0) continue;
            area.setZhuang(area.seatIndex === this._bankerSeat);
        }
    }

    private _normalizePlayers(data: any): any[] {
        if (data && Array.isArray(data.players)) return data.players;
        if (data && Array.isArray(data.seats)) return data.seats.filter((p: any) => p && p.occupied !== false); 
        if (data && Array.isArray(data.results)) return data.results;
        return [];
    }

    private _resolvePlayerScore(player: any, roomStateData?: any): number {
        const candidates = [
            this._resolveHtmlUserScore(player?.userId, roomStateData),
            player?.totalScore,
            player?.score,
            player?.userScore,
            player?.gold,
            player?.balance,
            player?.points,
            player?.profile?.totalScore,
            player?.profile?.score
        ];

        for (const value of candidates) {
            const score = this._toFiniteNumber(value);
            if (typeof score === 'number') return score;
        }

        const myUserId = String(WebSocketManager.instance.userId);
        if (String(player?.userId) === myUserId && roomStateData) {
            const myScore = this._toFiniteNumber(roomStateData.myTotalScore);
            if (typeof myScore === 'number') return myScore;
        }

        return 0;
    }

    private _resolveHtmlUserScore(userId: any, roomStateData?: any): number | undefined {
        if (userId === undefined || userId === null || !roomStateData) return undefined;

        const htmlUser = this._findHtmlUser(userId, roomStateData);
        const htmlScore = this._extractScore(htmlUser);
        if (typeof htmlScore === 'number') return htmlScore;

        const maps = [
            roomStateData.userScores,
            roomStateData.scoreByUserId,
            roomStateData.htmlScores
        ];

        for (const map of maps) {
            if (!map || typeof map !== 'object') continue;
            const score = this._toFiniteNumber(map[userId]) ?? this._extractScore(map[userId]);
            if (typeof score === 'number') return score;
        }

        return undefined;
    }

    private _findHtmlUser(userId: any, roomStateData?: any): any {
        if (userId === undefined || userId === null || !roomStateData) return null;

        const userKey = String(userId);
        const collections = [
            roomStateData.lobbyUsers,
            roomStateData.users,
            roomStateData.members,
            roomStateData.playerInfos,
            roomStateData.htmlPlayers
        ];

        for (const collection of collections) {
            if (!Array.isArray(collection)) continue;
            const item = collection.find((u: any) => String(u?.userId ?? u?.id) === userKey);
            if (item) return item;
        }

        const currentUser = roomStateData.currentUser;
        if (currentUser && String(currentUser.userId ?? currentUser.id) === userKey) {
            return currentUser;
        }

        return null;
    }

    private _extractScore(data: any): number | undefined {
        const candidates = [
            data?.totalScore,
            data?.score,
            data?.userScore,
            data?.gold,
            data?.balance,
            data?.points
        ];

        for (const value of candidates) {
            const score = this._toFiniteNumber(value);
            if (typeof score === 'number') return score;
        }

        return undefined;
    }

    private _resolveSuitName(suitIndex: any): string {
        if (suitIndex === null || suitIndex === undefined || suitIndex === -1 || suitIndex === '') return '';   

        if (typeof suitIndex === 'string') {
            const value = suitIndex.trim().toLowerCase();
            if (value === 'wan' || value === 'w' || value === '万') return 'Wan';
            if (value === 'tong' || value === 't' || value === '筒') return 'Tong';
            if (value === 'tiao' || value === '条') return 'Tiao';
        }

        const suitNames = ['Wan', 'Tong', 'Tiao'];
        const idx = Number(suitIndex);
        if (isNaN(idx) || idx < 0 || idx > 2) return '';
        return suitNames[idx];
    }

    private _resolveSuitIndex(suitValue: any): number {
        const suitName = this._resolveSuitName(suitValue);
        if (suitName === 'Wan') return 0;
        if (suitName === 'Tong') return 1;
        if (suitName === 'Tiao') return 2;
        return Number(suitValue);
    }

    private _normalizeMissSuitResults(data: any): { seatIndex: number; suitIndex: number }[] {
        if (Array.isArray(data)) {
            return data.map(item => ({
                seatIndex: Number(item?.seatIndex ?? item?.seat),
                suitIndex: this._resolveSuitIndex(item?.suitIndex ?? item?.missSuit ?? item?.suit)
            })).filter(item => !isNaN(item.seatIndex) && !isNaN(item.suitIndex));
        }
        if (data && typeof data === 'object') {
            if (Array.isArray(data.results)) {
                return data.results.map((item: any) => ({
                    seatIndex: Number(item?.seatIndex ?? item?.seat),
                    suitIndex: this._resolveSuitIndex(item?.suitIndex ?? item?.missSuit ?? item?.suit)
                })).filter((item: any) => !isNaN(item.seatIndex) && !isNaN(item.suitIndex));
            }
            if (data.missSuits && typeof data.missSuits === 'object') {
                return Object.keys(data.missSuits)
                    .map(key => ({
                        seatIndex: Number(key),
                        suitIndex: this._resolveSuitIndex(data.missSuits[key])
                    }))
                    .filter(item => !isNaN(item.seatIndex) && !isNaN(item.suitIndex));
            }
            const sIdx = Number(data.seatIndex ?? data.seat);
            const tIdx = this._resolveSuitIndex(data.suitIndex ?? data.missSuit ?? data.suit);
            if (!isNaN(sIdx) && !isNaN(tIdx)) return [{ seatIndex: sIdx, suitIndex: tIdx }];
        }
        return [];
    }

    private _toFiniteNumber(value: any): number | undefined {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '') {
            const numberValue = Number(value);
            if (Number.isFinite(numberValue)) return numberValue;
        }
        return undefined;
    }

    private _normalizeSeatList(value: any): number[] {
        if (!Array.isArray(value)) return [];

        return value
            .map((item: any) => typeof item === 'number' ? item : Number(item?.seatIndex ?? item))
            .filter((seatIndex: number) => !isNaN(seatIndex));
    }
}
