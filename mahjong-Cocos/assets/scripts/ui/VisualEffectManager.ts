import { _decorator, Component, Node, Prefab, instantiate, v3, tween, Label } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 视觉特效管理器
 * 负责在屏幕中央或玩家头像旁显示 “碰”、“杠”、“胡” 等文字动画
 */
@ccclass('VisualEffectManager')
export class VisualEffectManager extends Component {
    private static _instance: VisualEffectManager | null = null;
    public static get instance(): VisualEffectManager { return this._instance!; }

    @property(Prefab)
    effectTextPrefab: Prefab = null!; // 一个带有 Label 的预制件

    protected onLoad() {
        VisualEffectManager._instance = this;
    }

    /**
     * 播放文字特效
     * @param text 文字内容 (碰/杠/胡/自摸)
     * @param worldPos 播放的世界坐标 (通常在玩家头像附近)
     */
    public playTextEffect(text: string, worldPos: any) {
        if (!this.effectTextPrefab) return;

        const node = instantiate(this.effectTextPrefab);
        node.parent = this.node;
        node.worldPosition = worldPos;

        const label = node.getComponent(Label) || node.getgetComponentInChildren(Label);
        if (label) label.string = text;

        // 动画效果：从小变大回弹，然后向上漂移消失
        node.setScale(v3(0, 0, 1));
        tween(node)
            .to(0.3, { scale: v3(1.5, 1.5, 1) }, { easing: 'backOut' })
            .delay(0.5)
            .by(0.5, { position: v3(0, 100, 0) }, { easing: 'sineIn' })
            .call(() => {
                node.destroy();
            })
            .start();
    }
}
