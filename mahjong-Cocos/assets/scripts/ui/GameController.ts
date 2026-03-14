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

    private _mySeatIndex: number = -1;
    private _actionQueue: ActionQueue = new ActionQueue();

    protected onLoad(): void {
        const ws = WebSocketManager.instance;
        ws.on(MessageType.S_ROOM_STATE,    this._onRoomState,    this);
        ws.on(MessageType.S_GAME_START,    this._onGameStart,    this);
        ws.on(MessageType.S_MISS_SUIT_RESULT, this._onMissSuitResult, this);
        ws.on(MessageType.S_DRAW,          this._onDraw,         this);
        ws.on(MessageType.S_DISCARD,       this._onDiscard,      this);
        ws.on(MessageType.S_PENG,          this._onPeng,         this);
        ws.on(MessageType.S_GANG,          this._onGang,         this);
        ws.on(MessageType.S_GANG_DRAW,     this._onGangDraw,     this);
        ws.on(MessageType.S_HU,            this._onHu,           this);
        ws.on(MessageType.S_ERROR,         this._onError,        this);
    }

    protected onDestroy(): void {
        const ws = WebSocketManager.instance;
        ws.off(MessageType.S_ROOM_STATE,    this._onRoomState);
        ws.off(MessageType.S_GAME_START,    this._onGameStart);
        ws.off(MessageType.S_MISS_SUIT_RESULT, this._onMissSuitResult);
        ws.off(MessageType.S_DRAW,          this._onDraw);
        ws.off(MessageType.S_DISCARD,       this._onDiscard);
        ws.off(MessageType.S_PENG,          this._onPeng);
        ws.off(MessageType.S_GANG,          this._onGang);
        ws.off(MessageType.S_GANG_DRAW,     this._onGangDraw);
        ws.off(MessageType.S_HU,            this._onHu);
        ws.off(MessageType.S_ERROR,         this._onError);
    }

    // ─── 消息处理 ─────────────────────────────────────────────

    /** 房间状态同步（进入房间/断线重连时） */
    private _onRoomState(data: any): void {
        const players: any[] = data?.players ?? [];
        const myUserId = HttpManager.instance.userId;

        // 找到自己的座位
        const me = players.find(p => p.userId === myUserId);
        if (me) this._mySeatIndex = me.seatIndex;

        // 初始化对手区域
        for (const p of players) {
            if (p.userId === myUserId) continue;
            const relSeat = GameData.getRelativeSeat(this._mySeatIndex, p.seatIndex);
            // relSeat: 1=右家, 2=对家, 3=左家 → 映射到 opponentAreas[0..2]
            const area = this.opponentAreas[relSeat - 1];
            area?.init(p.seatIndex, p.nickname ?? `玩家${p.seatIndex}`, 0);
        }
    }

    /** 游戏开始 */
    private _onGameStart(data: any): void {
        this._actionQueue.clear();
        const { handTiles, dealerSeat, wallCount } = data;
        this._updateWallCount(wallCount);
        this.centerManager?.setActiveDirection(dealerSeat);
        // MahjongTable 自己监听了 S_GAME_START，这里做额外协调
        console.log('[GameController] Game started, dealer:', dealerSeat);
    }

    /** 所有人定缺完毕 */
    private _onMissSuitResult(data: any): void {
        const results: { seatIndex: number; suitIndex: number }[] = data ?? [];
        const suitNames = ['万', '筒', '条'];
        for (const r of results) {
            if (r.seatIndex === this._mySeatIndex) continue;
            const relSeat = GameData.getRelativeSeat(this._mySeatIndex, r.seatIndex);
            const area = this.opponentAreas[relSeat - 1];
            area?.setMissSuit(suitNames[r.suitIndex] ?? '?');
        }
    }

    /** 摸牌（只有自己能收到） */
    private _onDraw(data: any): void {
        this._updateWallCount(data?.wallCount);
        // MahjongTable 自己监听 S_DRAW 添加手牌
        this.centerManager?.startCountdown(20);
    }

    /** 某人出牌 */
    private _onDiscard(data: any): void {
        const { seatIndex, tileId, wallCount } = data;
        this._updateWallCount(wallCount);
        this.centerManager?.setActiveDirection(seatIndex);

        if (seatIndex === this._mySeatIndex) return;

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        const area = this.opponentAreas[relSeat - 1];
        area?.onOpponentDiscard(tileId);
    }

    /** 某人碰牌 */
    private _onPeng(data: any): void {
        const { seatIndex, tileId } = data;
        if (seatIndex === this._mySeatIndex) return;

        const relSeat = GameData.getRelativeSeat(this._mySeatIndex, seatIndex);
        this.opponentAreas[relSeat - 1]?.onPeng(tileId);
    }

    /** 某人杠牌 */
    private _onGang(data: any): void {
        const { seatIndex, tileId, gangType } = data;
        if (seatIndex === this._mySeatIndex) return;

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
        const type = isSelfDraw ? '自摸' : '点炮';
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
