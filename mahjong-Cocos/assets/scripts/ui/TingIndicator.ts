import { _decorator, Component, Node, Prefab, instantiate, Layout, UITransform, v3, tween, Sprite, color, Label, Color } from 'cc';
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

    private _bgSprite: Sprite | null = null;

    protected onLoad() {
        this.node.active = false;
        this._initUI();
    }

    private _initUI() {
        // 如果没有挂载 UITransform，自动添加
        let uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = this.node.addComponent(UITransform);
        }

        // 添加一个半透明黑色背景
        if (!this.node.getComponent(Sprite)) {
            this._bgSprite = this.node.addComponent(Sprite);
            this._bgSprite.color = color(0, 0, 0, 150); // 半透明黑底
        }

        // 如果没有设置 container，自动创建一个
        if (!this.container) {
            this.container = new Node('TingContainer');
            this.container.parent = this.node;
        }

        // 确保 container 有 Layout
        let layout = this.container.getComponent(Layout);
        if (!layout) {
            layout = this.container.addComponent(Layout);
            layout.type = Layout.Type.HORIZONTAL;
            layout.resizeMode = Layout.ResizeMode.CONTAINER;
            layout.spacingX = 5; // 牌之间的间距
        }
        
        // 确保 container 有 UITransform
        if (!this.container.getComponent(UITransform)) {
            this.container.addComponent(UITransform);
        }

        // 在 container 左侧添加一个 "听" 字标识
        const labelNode = new Node('TingLabel');
        labelNode.parent = this.container;
        const labelUi = labelNode.addComponent(UITransform);
        labelUi.setContentSize(50, 50);
        const label = labelNode.addComponent(Label);
        label.string = '听:';
        label.fontSize = 35;
        label.lineHeight = 50;
        label.color = Color.YELLOW;
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
        
        // 保留第一个子节点 (就是我们刚创建的 "听" 字 Label)，移除其他之前的牌
        const children = this.container.children;
        for (let i = children.length - 1; i >= 1; i--) {
            children[i].destroy();
        }

        // 排序，让提示看起来更规整
        tingTiles.sort((a, b) => a - b);

        // 去重，防止相同的胡牌被显示多次
        const uniqueTingTiles = [...new Set(tingTiles)];

        uniqueTingTiles.forEach(tileId => {
            const tileNode = instantiate(this.tilePrefab);
            tileNode.parent = this.container;
            // 听牌提示的图标通常比较小
            tileNode.setScale(v3(0.6, 0.6, 1));
            
            const tileComp = tileNode.getComponent(MahjongTile);
            if (tileComp) tileComp.init(tileId);

            // 禁用点击事件，防止误触
            tileNode.off(Node.EventType.TOUCH_END);
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
