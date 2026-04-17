import { _decorator, Component, Node, Prefab, instantiate, Layout, UITransform, v3, tween } from 'cc';
import { MahjongTile } from './MahjongTile';
const { ccclass, property } = _decorator;

/**
 * 听牌提示器
 * 用于在屏幕上方/角落显示玩家当前可胡的牌
 */
@ccclass('TingIndicator')
export class TingIndicator extends Component {
    @property(Node)
    container: Node = null!; // 存放提示牌的容器 (建议挂一个 Layout 组件，Horizontal)

    @property(Prefab)
    tilePrefab: Prefab = null!; // 麻将牌预制件

    protected onLoad() {
        this.node.active = false;
    }

    /**
     * 显示听牌提示
     * @param tingTiles 可胡的牌的 ID 数组
     */
    public showTing(tingTiles: number[]) {
        if (!tingTiles || tingTiles.length === 0) {
            this.hide();
            return;
        }

        if (!this.container || !this.tilePrefab) return;

        this.node.active = true;
        this.container.removeAllChildren();

        // 排序，让提示看起来更规整
        tingTiles.sort((a, b) => a - b);

        tingTiles.forEach(tileId => {
            const tileNode = instantiate(this.tilePrefab);
            tileNode.parent = this.container;
            // 听牌提示的图标通常比较小
            tileNode.setScale(v3(0.6, 0.6, 1));
            
            const tileComp = tileNode.getComponent(MahjongTile);
            if (tileComp) tileComp.init(tileId);
        });

        // 简单的淡入效果
        this.node.setScale(v3(0.8, 0.8, 1));
        tween(this.node)
            .to(0.2, { scale: v3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    /** 隐藏听牌提示 */
    public hide() {
        this.node.active = false;
    }
}
