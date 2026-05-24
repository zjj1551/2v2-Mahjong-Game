import { _decorator, Component, Node, Label, Prefab, instantiate, UITransform } from 'cc';
import { MahjongTile } from './MahjongTile';
const { ccclass, property } = _decorator;

/**
 * 弃牌河管理器
 * 负责展示某一方向玩家已打出的牌列表（最多显示24张，3行8列）
 *
 * 节点结构：
 * DiscardRiver（本组件挂载节点）
 * └── Content（Layout：Grid，水平间距4，垂直间距4）
 */
@ccclass('DiscardRiver')
export class DiscardRiver extends Component {

    @property(Node)
    content: Node = null!;

    @property(Prefab)
    tilePrefab: Prefab = null!;

    private _discards: number[] = [];

    /** 添加一张弃牌 */
    public addDiscard(tileId: number): void {
        this._discards.push(tileId);
        this._appendTile(tileId);
    }

    public removeLastDiscard(tileId?: number): void {
        if (this._discards.length === 0) return;

        let index = this._discards.length - 1;
        if (typeof tileId === 'number') {
            for (let i = this._discards.length - 1; i >= 0; i--) {
                if (this._discards[i] === tileId) {
                    index = i;
                    break;
                }
            }
        }

        this._discards.splice(index, 1);
        this._rebuildTiles();
    }

    /** 清空弃牌河（新局开始时调用） */
    public clear(): void {
        this._discards = [];
        if (this.content) this.content.removeAllChildren();
    }

    private _appendTile(tileId: number): void {
        if (!this.content || !this.tilePrefab) return;
        const node = instantiate(this.tilePrefab);
        node.parent = this.content;

        // 弃牌河中的牌稍小一些（缩放0.6）
        node.setScale(0.6, 0.6, 1);

        const tile = node.getComponent(MahjongTile);
        tile?.init(tileId);
    }

    private _rebuildTiles(): void {
        if (!this.content) return;
        this.content.removeAllChildren();
        for (const tileId of this._discards) {
            this._appendTile(tileId);
        }
    }
}
