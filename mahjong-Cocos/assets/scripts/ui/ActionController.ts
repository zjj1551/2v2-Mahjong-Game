import { _decorator, Component, Node, Button, EventHandler } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';
import { MessageType } from '../core/TileConstants';
const { ccclass, property } = _decorator;

@ccclass('ActionController')
export class ActionController extends Component {
    @property(Node)
    actionPanel: Node = null!; // 存放所有按钮的父容器

    @property(Node)
    btnPeng: Node = null!;
    @property(Node)
    btnGang: Node = null!;
    @property(Node)
    btnHu: Node = null!;
    @property(Node)
    btnPass: Node = null!;

    protected onLoad() {
        // 初始隐藏操作面板
        this.hideAll();
        // 监听后端的操作请求消息
        WebSocketManager.instance.on('S_ACTION_OPTIONS', this.onShowActions, this);
    }

    /**
     * 收到操作请求时的逻辑
     * data: { options: ["PENG", "GANG", "HU", "PASS"], targetTile: 14 }
     */
    private onShowActions(data: any) {
        const { options } = data;
        this.actionPanel.active = true;

        this.btnPeng.active = options.includes("PENG");
        this.btnGang.active = options.includes("GANG");
        this.btnHu.active = options.includes("HU");
        this.btnPass.active = options.includes("PASS");
    }

    private hideAll() {
        this.actionPanel.active = false;
    }

    // --- 按钮点击回调 ---

    public onPengClick() {
        WebSocketManager.instance.send('C_PENG', {});
        this.hideAll();
    }

    public onGangClick() {
        // 简单处理，发送明杠
        WebSocketManager.instance.send('C_GANG', { gangType: "MING" });
        this.hideAll();
    }

    public onHuClick() {
        WebSocketManager.instance.send('C_HU', { isSelfDraw: false });
        this.hideAll();
    }

    public onPassClick() {
        WebSocketManager.instance.send('C_PASS', {});
        this.hideAll();
    }
}
