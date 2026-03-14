import { _decorator, Component, Node, Label, Sprite, SpriteFrame, resources, error } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';
import { MessageType } from '../core/TileConstants';
const { ccclass, property } = _decorator;

/**
 * 定缺选择 UI 组件
 *
 * 节点结构（挂载在游戏桌面 Canvas 下）：
 * MissSuitPanel
 * ├── Label_Title       ("请选择定缺花色")
 * ├── Btn_Wan           (选万)
 * ├── Btn_Tong          (选筒)
 * └── Btn_Tiao          (选条)
 */
@ccclass('MissSuitSelector')
export class MissSuitSelector extends Component {

    @property(Node)
    panel: Node = null!;

    protected onLoad(): void {
        if (this.panel) this.panel.active = false;
        WebSocketManager.instance.on(MessageType.S_SELECT_MISS_SUIT, this._onSelectMissSuit, this);
    }

    protected onDestroy(): void {
        WebSocketManager.instance.off(MessageType.S_SELECT_MISS_SUIT, this._onSelectMissSuit);
    }

    private _onSelectMissSuit(_data: any): void {
        if (this.panel) this.panel.active = true;
    }

    /** 点击"万"按钮 */
    public onSelectWan(): void {
        this._select(0);
    }

    /** 点击"筒"按钮 */
    public onSelectTong(): void {
        this._select(1);
    }

    /** 点击"条"按钮 */
    public onSelectTiao(): void {
        this._select(2);
    }

    private _select(suitIndex: number): void {
        WebSocketManager.instance.send(MessageType.C_SELECT_MISS_SUIT, { suitIndex });
        if (this.panel) this.panel.active = false;
    }
}
