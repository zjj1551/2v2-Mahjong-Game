import { _decorator, Component, Node, Sprite, UITransform, view, screen, SpriteFrame, resources, error } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TableManager')
export class TableManager extends Component {
    @property(Node)
    bgNode: Node = null!; // 背景节点

    protected start() {
        this.adaptBackground();
    }

    private adaptBackground() {
        if (!this.bgNode) return;

        // 加载背景图（如果编辑器里没挂，脚本动态加载）
        const path = 'textures/background/table_bg/spriteFrame';
        resources.load(path, SpriteFrame, (err, sf) => {
            if (err) {
                error(`Failed to load background: ${err}`);
                return;
            }
            const sprite = this.bgNode.getComponent(Sprite) || this.bgNode.addComponent(Sprite);
            sprite.spriteFrame = sf;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;

            // 自动适配全屏
            const winSize = view.getVisibleSize();
            const uiTransform = this.bgNode.getComponent(UITransform)!;
            uiTransform.setContentSize(winSize.width, winSize.height);
        });
    }
}
