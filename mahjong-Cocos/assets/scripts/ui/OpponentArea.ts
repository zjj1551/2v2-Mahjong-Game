import { _decorator, Component, Node, Label, Prefab, instantiate } from 'cc';
import { MahjongTile } from './MahjongTile';
import { DiscardRiver } from './DiscardRiver';
const { ccclass, property } = _decorator;

/**
 * 对手玩家区域组件（右家/对家/左家）
 * 每个区域实例化3次，挂在 Right/Top/Left 三个节点上。
 *
 * 节点结构示例（以 RightPlayer 为例，整体旋转-90度）：
 * PlayerArea
 * ├── Label_Nickname
 * ├── Label_HandCount   ("13张")
 * ├── HandContainer     (背牌，全显示为 mj_bg.png)
 * ├── MeldContainer     (副露牌，横向排列)
 * └── DiscardRiver      (弃牌河组件)
 */
@ccclass('OpponentArea')
export class OpponentArea extends Component {

    @property(Label)
    labelNickname: Label = null!;

    @property(Label)
    labelHandCount: Label = null!;

    @property(Node)
    handContainer: Node = null!;

    @property(Node)
    meldContainer: Node = null!;

    @property(DiscardRiver)
    discardRiver: DiscardRiver = null!;

    @property(Prefab)
    tilePrefab: Prefab = null!;

    @property(Prefab)
    backTilePrefab: Prefab = null!;  // 背面牌预制件（显示 mj_bg.png）

    private _seatIndex: number = -1;
    private _handCount: number = 0;

    /** 初始化对手信息 */
    public init(seatIndex: number, nickname: string, handCount: number): void {
        this._seatIndex = seatIndex;
        this._handCount = handCount;
        if (this.labelNickname) this.labelNickname.string = nickname;
        this._refreshHandDisplay();
        this.discardRiver?.clear();
    }

    /** 对手摸了一张牌（只知道数量+1） */
    public onOpponentDraw(): void {
        this._handCount++;
        this._refreshHandDisplay();
    }

    /** 对手打出一张牌 */
    public onOpponentDiscard(tileId: number): void {
        this._handCount = Math.max(0, this._handCount - 1);
        this._refreshHandDisplay();
        this.discardRiver?.addDiscard(tileId);
    }

    /** 对手碰牌（手牌-2，副露+3） */
    public onPeng(tileId: number): void {
        this._handCount = Math.max(0, this._handCount - 2);
        this._refreshHandDisplay();
        this._addMeld([tileId, tileId, tileId]);
    }

    /** 对手杠牌（手牌-3，副露+4；或手牌-4 暗杠） */
    public onGang(tileId: number, isAnGang: boolean): void {
        const cost = isAnGang ? 4 : 3;
        this._handCount = Math.max(0, this._handCount - cost);
        this._refreshHandDisplay();
        this._addMeld([tileId, tileId, tileId, tileId]);
    }

    /** 设置定缺花色标识（可选：在昵称旁显示定缺花色） */
    public setMissSuit(suitName: string): void {
        if (this.labelNickname) {
            this.labelNickname.string = `${this.labelNickname.string} [缺${suitName}]`;
        }
    }

    private _refreshHandDisplay(): void {
        if (this.labelHandCount) {
            this.labelHandCount.string = `${this._handCount}张`;
        }

        if (!this.handContainer || !this.backTilePrefab) return;
        this.handContainer.removeAllChildren();
        for (let i = 0; i < this._handCount; i++) {
            const node = instantiate(this.backTilePrefab);
            node.parent = this.handContainer;
            node.setScale(0.7, 0.7, 1);
        }
    }

    private _addMeld(tileIds: number[]): void {
        if (!this.meldContainer || !this.tilePrefab) return;
        for (const id of tileIds) {
            const node = instantiate(this.tilePrefab);
            node.parent = this.meldContainer;
            node.setScale(0.65, 0.65, 1);
            node.getComponent(MahjongTile)?.init(id);
        }
    }

    public get seatIndex(): number { return this._seatIndex; }
}
