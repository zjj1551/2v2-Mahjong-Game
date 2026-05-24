import { _decorator, Component, Node, Prefab, instantiate, Layout, UITransform, v3, tween, Sprite, color, Label, Color } from 'cc';
import { MahjongTile } from './MahjongTile';
const { ccclass, property } = _decorator;

/**
 * 听牌指示器组件
 * 当玩家抓牌后，如果已经听牌，在屏幕下方显示当前听牌的花色和剩余张数（可选）
 */
@ccclass('TingIndicator')
export class TingIndicator extends Component {
    @property(Node)
    container: Node = null!; // 听牌图标容器 (通常是一个带有 Layout 组件的水平节点)

    @property(Prefab)
    tilePrefab: Prefab = null!; // 麻将牌预制件

    private _bgSprite: Sprite | null = null;

    protected onLoad() {
        this.node.active = false;
        this._initUI();
    }

    private _initUI() {
        // 确保有 UITransform
        let uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = this.node.addComponent(UITransform);
        }

        // 动态添加一个黑色半透明背景
        if (!this.node.getComponent(Sprite)) {
            this._bgSprite = this.node.addComponent(Sprite); 
            this._bgSprite.color = color(0, 0, 0, 150); 
        }

        // 初始化容器
        if (!this.container) {
            this.container = new Node('TingContainer');      
            this.container.parent = this.node;
        }

        // 配置 Layout
        let layout = this.container.getComponent(Layout);    
        if (!layout) {
            layout = this.container.addComponent(Layout);    
            layout.type = Layout.Type.HORIZONTAL;
            layout.resizeMode = Layout.ResizeMode.CONTAINER; 
            layout.spacingX = 10; 
        }

        if (!this.container.getComponent(UITransform)) {     
            this.container.addComponent(UITransform);        
        }

        // 添加“听”字标签
        let labelNode = this.container.getChildByName('TingLabel');
        if (!labelNode) {
            labelNode = new Node('TingLabel');
            labelNode.parent = this.container;
            const labelUi = labelNode.addComponent(UITransform); 
            labelUi.setContentSize(60, 60);
            const label = labelNode.addComponent(Label);
            label.string = '听:';
            label.fontSize = 32;
            label.lineHeight = 60;
            label.color = Color.YELLOW;
        }
    }

    /**
     * 显示听牌提示
     * @param tingTiles 听牌 ID 列表
     */
    public showTing(tingTiles: number[]) {
        if (!tingTiles || tingTiles.length === 0) {
            this.hide();
            return;
        }

        if (!this.container || !this.tilePrefab) {
            console.warn('[TingIndicator] Missing container or tilePrefab');
            return;
        }

        this.node.active = true;

        // 清理旧的听牌图标（保留第一个节点即 "听:" 标签）
        const children = this.container.children;
        for (let i = children.length - 1; i >= 0; i--) {
            if (children[i].name !== 'TingLabel') {
                children[i].destroy();
            }
        }

        // 排序并去重
        const sortedTiles = [...new Set(tingTiles)].sort((a, b) => a - b);

        sortedTiles.forEach(tileId => {
            const tileNode = instantiate(this.tilePrefab);   
            tileNode.parent = this.container;
            // 听牌提示图标稍微小一点
            tileNode.setScale(v3(0.5, 0.5, 1));

            const tileComp = tileNode.getComponent(MahjongTile);
            if (tileComp) {
                tileComp.init(tileId);
            }

            // 禁用听牌图标的交互
            tileNode.off(Node.EventType.TOUCH_END);
        });

        // 播放渐显动画
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
