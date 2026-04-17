import { _decorator, Component, Node, tween, v3 } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';
const { ccclass, property } = _decorator;

@ccclass('MissSuitSelector')
export class MissSuitSelector extends Component {
    @property(Node)
    wanBtn: Node = null!;
    @property(Node)
    tongBtn: Node = null!;
    @property(Node)
    tiaoBtn: Node = null!;

    onEnable() {
        // 面板弹出效果
        this.node.setScale(v3(0.5, 0.5, 1));
        tween(this.node)
            .to(0.25, { scale: v3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    /** 统一点击缩放 */
    private _playBtnEffect(node: Node, callback: Function) {
        tween(node)
            .to(0.05, { scale: v3(0.9, 0.9, 1) })
            .to(0.05, { scale: v3(1, 1, 1) })
            .call(() => callback())
            .start();
    }

    public onSelectWan() {
        this._playBtnEffect(this.wanBtn, () => this._sendSelect(0));
    }

    public onSelectTong() {
        this._playBtnEffect(this.tongBtn, () => this._sendSelect(1));
    }

    public onSelectTiao() {
        this._playBtnEffect(this.tiaoBtn, () => this._sendSelect(2));
    }

    private _sendSelect(suitIndex: number) {
        WebSocketManager.instance.send('C_SELECT_MISS_SUIT', { suitIndex });
        this.node.active = false; // 选完立即隐藏面板
    }
}
