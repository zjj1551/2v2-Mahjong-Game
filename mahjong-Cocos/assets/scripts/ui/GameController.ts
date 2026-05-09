import { _decorator, Component, Node, Label, Prefab, instantiate, director } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';
import { HttpManager } from '../network/HttpManager';
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
 * 游戏主场景协调器
 *
 * 完整场景节点树：
 * Canvas (1080x1920 或 适配分辨率)
 * ├── BgNode                      → TableManager 组件（自动铺满背景）
 * │
 * ├── BottomArea                  → 自己（本地玩家）
 * │   ├── HandContainer           → MahjongTable.bottomHandContainer
 * │   ├── MeldContainer           （自己的副露）
 * │   └── DiscardRiver            → DiscardRiver 组件
 * │
 * ├── RightArea                   → OpponentArea（右家，旋转90°）
 * ├── TopArea                     → OpponentArea（对家，旋转180°）
 * ├── LeftArea                    → OpponentArea（左家，旋转-90°）
 * │
 * ├── CenterArea                  → TableCenterManager
 * │   ├── DirNodes[0..3]          （东南西北方位图标）
 * │   ├── TensDigit               （倒计时十位）
 * │   └── OnesDigit               （倒计时个位）
 * │
 * ├── ActionPanel                 → ActionController
 * │   ├── BtnPeng
 * │   ├── BtnGang
 * │   ├── BtnHu
 * │   └── BtnPass
 * │
 * ├── MissSuitPanel               → MissSuitSelector
 * │   ├── BtnWan
 * │   ├── BtnTong
 * │   └── BtnTiao
 * │
 * └── RoundResultPanel            → RoundResultPanel
 *     ├── ScoreLabels[0..3]
 *     ├── LabelWinnerInfo
 *     └── BtnContinue
 */
@ccclass('GameController')
export class GameController extends Component {

    @property(MahjongTable)
    mahjongTable: MahjongTable = null!;

    @property([OpponentArea])
    opponentAreas: OpponentArea[] = [];  // [0]=右家, [1]=对家, [2]=左家（相对位置）

    @property(TableCenterManager)
    centerManager: TableCenterManager = null!;

    @property(ActionController)
    actionController: ActionController = null!;

    @property(MissSuitSelector)
    missSuitSelector: MissSuitSelector = null!;

    @property(RoundResultPanel)
    roundResultPanel: RoundResultPanel = null!;

    @property(Label)
    labelWallCount: Label = null!;   // 显示牌墙剩余张数

    @property(TingIndicator)
    tingIndicator: TingIndicator = null!; // 听牌提示器

    @property(PlayerUI)
    localPlayerUI: PlayerUI = null!; // 本地玩家的 UI

    private _mySeatIndex: number = -1;
    private _isReady: boolean = false;
    private _actionQueue: ActionQueue = new ActionQueue();

    protected onLoad(): void {
        WebSocketManager.instance.initIframeBridge();
        const ws = WebSocketManager.instance;
        ws.on(MessageType.S_ROOM_STATE,    this._onRoomState,    this);
        ws.on(MessageType.S_GAME_START,    this._onGameStart,    this);
        ws.on(MessageType.S_SELECT_MISS_SUIT, this._onStartMissSuit, this);
        ws.on(MessageType.S_MISS_SUIT_RESULT, this._onMissSuitResult, this);
        ws.on(MessageType.S_DRAW,          this._onDraw,         this);
        ws.on(MessageType.S_DISCARD,       this._onDiscard,      this);
        ws.on(MessageType.S_PENG,          this._onPeng,         this);
        ws.on(MessageType.S_CHI,           this._onChi,          this);
        ws.on(MessageType.S_GANG,          this._onGang,         this);
        ws.on(MessageType.S_GANG_DRAW,     this._onGangDraw,     this);
        ws.on(MessageType.S_HU,            this._onHu,           this);
        ws.on(MessageType.S_COUNTDOWN,     this._onCountdown,    this);
        ws.on(MessageType.S_ERROR,         this._onError,        this);
    }

    // ─── 按钮点击 ─────────────────────────────────────────────

    public onLeaveClick(): void {
        WebSocketManager.instance.send('C_LEAVE_ROOM', {});
        director.loadScene('LobbyScene');
    }

    // ─── 消息处理 ─────────────────────────────────────────────

    /** 房间状态同步（进入房间/断线重连时） */
    private _onRoomState(data: any): void {
        const { status, dealerSeat } = data;
        const players = data?.players ?? (data?.seats ?? []).filter((p: any) => p.occupied);
        const myUserId = WebSocketManager.instance.userId;

        // 找到自己的座位
        const me = players.find((p: any) => p.userId === myUserId);
        if (me) {
            this._mySeatIndex = me.seatIndex;
            this._isReady = me.ready;
            this.mahjongTable?.setMySeatIndex(this._mySeatIndex);
            this.centerManager?.setLocalSeatIndex(this._mySeatIndex);
        }

        // 更新准备面板显示
        if (this.readyPanel) {
            this.readyPanel.active = (status === 'WAITING' || status === 'READY');
        }

        // 初始化对手区域
        for (const p of players) {
            if (p.userId === myUserId) {
                if (this.localPlayerUI) {
                    this.localPlayerUI.setZhuang(p.seatIndex === dealerSeat);
                }
                continue;
            }
            const relSeat = GameData.getRelativeSeat(this._mySeatIndex, p.seatIndex);
            // relSeat: 1=右家, 2=对家, 3=左家 → 映射到 opponentAreas[0..2]
            const area = this.opponentAreas[relSeat - 1];
            area?.init(p.seatIndex, p.nickname ?? `玩家${p.seatIndex}`, 13);
            area?.setZhuang(p.seatIndex === dealerSeat);
        }
    }

    /** 游戏开始 */
    private _onGameStart(data: any): void {
        if (this.readyPanel) this.readyPanel.active = false;
        if (this.tingIndicator) this.tingIndicator.hide();
        this._actionQueue.clear();
        const { handTiles, wallCount } = data;
        const dealerSeat = data?.dealerSeat ?? data?.bankerSeat;
        if (typeof data?.seatIndex === 'number') {
            this._mySeatIndex = data.seatIndex;
        }
        this._updateWallCount(wallCount);
        this.mahjongTable?.setMySeatIndex(this._mySeatIndex);
        this.centerManager?.setLocalSeatIndex(this._mySeatIndex);
        if (typeof dealerSeat === 'number') {
            this.centerManager?.setActiveDirection(dealerSeat);
        }
        
        if (this.localPlayerUI) {
            this.localPlayerUI.setZhuang(this._mySeatIndex === dealerSeat);
            this.localPlayerUI.node.setSiblingIndex(999);
        }

        // 初始化对手手牌为 13 张
        this.opponentAreas.forEach(area => {
            if (area) {
                area.init(area.seatIndex, area.labelNickname.string, 13);
                area.setZhuang(area.seatIndex === dealerSeat);
                const playerNode = area.labelNickname?.node?.parent;
                if (playerNode) {
                    playerNode.setSiblingIndex(999);
                }
            }
        });

        console.log('[GameController] Game started, dealer:', dealerSeat);
    }

    /** 进入定缺阶段 */
    private _onStartMissSuit(data: any): void {
        if (this.missSuitSelector) {
            this.missSuitSelector.node.active = true;
        }
    }
    private _onMissSuitResult(data: any): void {
        const results: { seatIndex: number; suitIndex: number }[] = data ?? [];
        const suitNames = ['万', '筒', '条'];
        for (const r of results) {
            const relSeat = GameData.getRelativeSeat(this._mySeatIndex, r.seatIndex);
            if (relSeat === 0) {
                if (this.localPlayerUI) {
                    this.localPlayerUI.setMissSuit(suitNames[r.suitIndex] ?? '?');
                }
                continue;
            }
            const area = this.opponentAreas[relSeat - 1];
            area?.setMissSuit(suitNames[r.suitIndex] ?? '?');
        }
    }

    /** 摸牌（只有自己能收到） */
    private _onDraw(data: any): void {
        this._updateWallCount(data?.wallCount);
        if (typeof data?.seatIndex === 'number') {
            this.centerManager?.setActiveDirection(data.seatIndex);
        }
        this.centerManager?.startCountdown(20);

        // 听牌提示
        if (data?.tingTiles && data.tingTiles.length > 0) {
            this.tingIndicator?.showTing(data.tingTiles);
        } else {
            this.tingIndicator?.hide();
        }
    }

    /** 倒计时广播 */
    private _onCountdown(data: any): void {
        const { seatIndex, seconds } = data;
        this.centerManager?.setActiveDirection(seatIndex);
        this.centerManager?.startCountdown(seconds);

        // 如果轮到对手摸牌，我们在这里更新其手牌计数（补丁：弥补 S_DRAW 不广播的问题）
        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        if (relSeat !== 0) {
            this.opponentAreas[relSeat - 1]?.onOpponentDraw();
        }
    }

    /** 某人出牌 */
    private _onDiscard(data: any): void {
        const { seatIndex, tileId, wallCount } = data;
        this._updateWallCount(wallCount);

        if (seatIndex === this._mySeatIndex) return;

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        const area = this.opponentAreas[relSeat - 1];
        area?.onOpponentDiscard(tileId);
    }

    private _playActionEffect(seatIndex: number, text: string): void {
        if (!VisualEffectManager.instance) return;
        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        let pos = null;
        if (relSeat === 0) {
            pos = this.localPlayerUI?.node?.worldPosition;
        } else {
            pos = this.opponentAreas[relSeat - 1]?.node?.worldPosition;
        }
        if (pos) {
            VisualEffectManager.instance.playTextEffect(text, pos);
        }
    }

    /** 某人碰牌 */
    private _onPeng(data: any): void {
        const { seatIndex, tileId } = data;
        this._playActionEffect(seatIndex, "碰");

        if (seatIndex === this._mySeatIndex) {
            this.mahjongTable?.onPeng(tileId);
            return;
        }

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        this.opponentAreas[relSeat - 1]?.onPeng(tileId);
    }

    /** 某人吃牌 */
    private _onChi(data: any): void {
        const { seatIndex, tileId, consumeTileIds } = data;
        this._playActionEffect(seatIndex, "吃");

        if (seatIndex === this._mySeatIndex) {
            this.mahjongTable?.onChi(tileId, consumeTileIds);
            return;
        }

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        this.opponentAreas[relSeat - 1]?.onChi(tileId, consumeTileIds);
    }

    /** 某人杠牌 */
    private _onGang(data: any): void {
        const { seatIndex, tileId, gangType } = data;
        this._playActionEffect(seatIndex, "杠");

        if (seatIndex === this._mySeatIndex) {
            this.mahjongTable?.onGang(tileId, gangType);
            return;
        }

        const isAnGang = gangType === 'AN';
        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        this.opponentAreas[relSeat - 1]?.onGang(tileId, isAnGang);
    }

    /** 杠后补牌（只有自己能收到） */
    private _onGangDraw(data: any): void {
        // MahjongTable 的 onDraw 逻辑也适用于此，直接 dispatch S_DRAW 事件即可复用
        // 或在这里单独处理
        console.log('[GameController] Gang draw tileId:', data?.tileId);
    }

    /** 某人胡牌 */
    private _onHu(data: any): void {
        const { seatIndex, isSelfDraw } = data;
        const type = isSelfDraw ? '自摸' : '胡';
        this._playActionEffect(seatIndex, type);
        
        console.log(`[GameController] Seat ${seatIndex} HU! (${type})`);
        // 胡牌动效可在此处播放（通过 ActionQueue 排队）
    }

    /** 服务端错误 */
    private _onError(data: any): void {
        console.warn('[GameController] Server error:', data?.message);
        // TODO: 显示 Toast 提示
    }

    private _updateWallCount(count?: number): void {
        if (count !== undefined && this.labelWallCount) {
            this.labelWallCount.string = `剩余: ${count}张`;
        }
    }
}
