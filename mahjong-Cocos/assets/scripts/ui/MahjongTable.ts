import { _decorator, Component, Node, Prefab, instantiate, Vec3, tween, v3 } from 'cc';
import { MahjongTile } from './MahjongTile';
import { PlayerUI } from './PlayerUI';
import { WebSocketManager } from '../network/WebSocketManager';
import { MessageType } from '../core/TileConstants';
import { DiscardRiver } from './DiscardRiver';

const { ccclass, property } = _decorator;

@ccclass('MahjongTable')
export class MahjongTable extends Component {
    @property(Node)
    bottomHandContainer: Node = null!; // 本地玩家手牌容器

    @property(Node)
    bottomMeldContainer: Node = null!; // 本地玩家副露区

    @property(DiscardRiver)
    bottomDiscardRiver: DiscardRiver = null!;  // 本地玩家弃牌河

    @property(Prefab)
    tilePrefab: Prefab = null!;        // 麻将牌预制件

    private _mySeatIndex: number = -1;

    protected onLoad() {
        WebSocketManager.instance.on(MessageType.S_GAME_START, this.onGameStart, this);
        WebSocketManager.instance.on(MessageType.S_DRAW, this.onDraw, this);
        WebSocketManager.instance.on(MessageType.S_DISCARD, this.onDiscard, this);
    }

    /** 游戏开始：渲染初始手牌 */
    private onGameStart(data: any) {
        const { handTiles } = data;
        this.bottomHandContainer.removeAllChildren();
        if (this.bottomDiscardRiver) this.bottomDiscardRiver.clear();
        this.bottomMeldContainer.removeAllChildren();

        if (handTiles) {
            handTiles.sort((a: number, b: number) => a - b);
            handTiles.forEach((id: number) => {
                this._addTileToHand(id);
            });
        }
    }

    /** 摸牌 */
    private onDraw(data: any) {
        const { tileId, seatIndex } = data;
        // 如果是我摸牌
        if (seatIndex === this._mySeatIndex || this._mySeatIndex === -1) {
            this._addTileToHand(tileId);
        }
    }

    /** 向手牌添加一张牌 */
    private _addTileToHand(tileId: number) {
        const node = instantiate(this.tilePrefab);
        node.parent = this.bottomHandContainer;
        const comp = node.getComponent(MahjongTile);
        if (comp) comp.init(tileId);

        // 绑定点击出牌事件
        node.on(Node.EventType.TOUCH_END, () => {
            this._discardTile(node, tileId);
        });
    }

    /** 出牌逻辑（带动画） */
    private _discardTile(tileNode: Node, tileId: number) {
        // 1. 发送给服务端
        WebSocketManager.instance.send(MessageType.C_DISCARD, { tileId });

        // 2. 播放飞向弃牌河的动画
        const worldPos = this.bottomDiscardRiver.node.worldPosition;
        
        // 临时切换父节点到最外层，防止被 Layout 影响动画
        const originalPos = tileNode.worldPosition;
        tileNode.parent = this.node.parent; 
        tileNode.worldPosition = originalPos;

        tween(tileNode)
            .to(0.2, { worldPosition: worldPos, scale: v3(0.5, 0.5, 1) }, { easing: 'sineOut' })
            .call(() => {
                // 动画结束，放入弃牌河并销毁临时节点
                this._addTileToRiver(tileId);
                tileNode.destroy();
            })
            .start();
    }

    /** 真正把牌放入弃牌河 */
    private _addTileToRiver(tileId: number) {
        if (this.bottomDiscardRiver) {
            this.bottomDiscardRiver.addDiscard(tileId);
        }
    }

    /** 广播：别人打牌（目前只做简单的逻辑，以后可以加动画） */
    private onDiscard(data: any) {
        // 这里可以根据 seatIndex 找到对应对手的区域并更新
    }
}
