import { _decorator, Component, Node, tween, v3, Prefab, instantiate, Layout, UITransform, Label } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';
import { MahjongTile } from './MahjongTile';
const { ccclass, property } = _decorator;

@ccclass('ActionController')
export class ActionController extends Component {
    @property(Node)
    actionPanel: Node = null!; // 存放所有主按钮的父容器

    @property(Node)
    btnPeng: Node = null!;
    @property(Node)
    btnChi: Node = null!;
    @property(Node)
    btnGang: Node = null!;
    @property(Node)
    btnHu: Node = null!;
    @property(Node)
    btnPass: Node = null!;

    @property(Node)
    optionPanel: Node = null!; // 二级选择面板（用于显示多组吃牌/杠牌）

    @property(Prefab)
    tilePrefab: Prefab = null!; // 麻将牌预制件，用于在二级面板中渲染牌面

    private _chiOptions: any[] = [];
    private _targetTile: number = -1; // 当前别人打出的那张牌

    // 用于处理自己摸牌时的杠/胡状态
    private _canAnGangIds: number[] = [];
    private _buGangTileId: number = -1;
    private _isSelfDrawAction: boolean = false;

    protected onLoad() {
        this.hideAll();
        // 监听别人打牌时的响应选项 (吃、碰、明杠、胡)
        WebSocketManager.instance.on('S_ACTION_OPTIONS', this.onShowActions, this);
        // 监听自己摸牌时的响应选项 (暗杠、补杠、自摸)
        WebSocketManager.instance.on('S_DRAW', this.onSelfDrawActions, this);
    }

    /** 收到别人打牌操作请求时的逻辑 */
    private onShowActions(data: any) {
        const { options, chiOptions, seatIndex } = data;
        // 如果是自己打的牌，不响应
        if (seatIndex === WebSocketManager.instance.userId) return; // 假设数据里有区分，或者后端已经过滤

        this._targetTile = data.targetTile ?? -1;
        this._chiOptions = chiOptions || [];
        this._isSelfDrawAction = false;

        this._showPanel(options);
    }

    /** 收到自己摸牌请求时的逻辑（处理暗杠、补杠、自摸） */
    private onSelfDrawActions(data: any) {
        const { actions, canAnGangIds, buGangTileId } = data;
        
        // 如果没有可以执行的动作，直接返回
        if (!actions || actions.length === 0) return;

        this._isSelfDrawAction = true;
        this._canAnGangIds = canAnGangIds || [];
        this._buGangTileId = buGangTileId ?? -1;

        // 这里后端的 actions 可能是 ["HU", "AN_GANG", "BU_GANG"]
        // 我们统一映射到现有的按钮上
        const mappedOptions: string[] = [];
        if (actions.includes("HU")) mappedOptions.push("HU");
        if (actions.includes("AN_GANG") || actions.includes("BU_GANG")) mappedOptions.push("GANG");
        mappedOptions.push("PASS"); // 摸牌有动作时，也可以选择“过”

        this._showPanel(mappedOptions);
    }

    private _showPanel(options: string[]) {
        this.actionPanel.active = true;
        if (this.optionPanel) this.optionPanel.active = false; // 隐藏二级面板
        
        // 弹出动画
        this.actionPanel.setScale(v3(0.5, 0.5, 1));
        tween(this.actionPanel)
            .to(0.2, { scale: v3(1, 1, 1) }, { easing: 'backOut' })
            .start();

        this.btnPeng.active = options.includes("PENG");
        this.btnChi.active = options.includes("CHI");
        this.btnGang.active = options.includes("GANG");
        this.btnHu.active = options.includes("HU");
        this.btnPass.active = options.includes("PASS");
    }

    private hideAll() {
        this.actionPanel.active = false;
        if (this.optionPanel) this.optionPanel.active = false;
    }

    /** 统一的点击缩放效果 */
    private _playBtnEffect(node: Node, callback: Function) {
        tween(node)
            .to(0.05, { scale: v3(0.9, 0.9, 1) })
            .to(0.05, { scale: v3(1, 1, 1) })
            .call(() => callback())
            .start();
    }

    // --- 按钮点击回调 ---

    public onChiClick() {
        this._playBtnEffect(this.btnChi, () => {
            if (this._chiOptions.length === 1) {
                // 只有一种吃法，直接发给后端
                WebSocketManager.instance.send('C_CHI', { consumeTileIds: this._chiOptions[0].consumeTileIds });
                this.hideAll();
            } else if (this._chiOptions.length > 1) {
                // 有多种吃法，弹出二级选择面板
                this.showSecondaryOptions('CHI');
            }
        });
    }

    public onGangClick() {
        this._playBtnEffect(this.btnGang, () => {
            if (!this._isSelfDrawAction) {
                // 别人打牌 -> 必定是明杠 (MING)
                WebSocketManager.instance.send('C_GANG', { gangType: "MING", tileId: this._targetTile });
                this.hideAll();
            } else {
                // 自己摸牌 -> 可能是暗杠 (AN) 或 补杠 (BU)
                const gangOptions = [];
                if (this._buGangTileId !== -1) gangOptions.push({ type: 'BU', tileId: this._buGangTileId });
                this._canAnGangIds.forEach(id => gangOptions.push({ type: 'AN', tileId: id }));

                if (gangOptions.length === 1) {
                    // 只有一种杠法，直接发
                    const opt = gangOptions[0];
                    if (opt.type === 'AN') {
                        WebSocketManager.instance.send('C_AN_GANG', { tileId: opt.tileId });
                    } else {
                        WebSocketManager.instance.send('C_GANG', { gangType: "BU", tileId: opt.tileId });
                    }
                    this.hideAll();
                } else if (gangOptions.length > 1) {
                    // 多种杠法（罕见但可能发生），弹出二级选择面板
                    this.showSecondaryOptions('GANG', gangOptions);
                }
            }
        });
    }

    public onPengClick() {
        this._playBtnEffect(this.btnPeng, () => {
            WebSocketManager.instance.send('C_PENG', {});
            this.hideAll();
        });
    }

    public onHuClick() {
        this._playBtnEffect(this.btnHu, () => {
            // isSelfDrawAction 为 true 就是自摸，false 就是点炮
            WebSocketManager.instance.send('C_HU', { isSelfDraw: this._isSelfDrawAction });
            this.hideAll();
        });
    }

    public onPassClick() {
        this._playBtnEffect(this.btnPass, () => {
            WebSocketManager.instance.send('C_PASS', {});
            this.hideAll();
        });
    }

    // --- 二级面板渲染逻辑 ---

    /** 显示吃牌/杠牌的二级选择组合 */
    private showSecondaryOptions(actionType: 'CHI' | 'GANG', gangOptions?: any[]) {
        if (!this.optionPanel || !this.tilePrefab) return;
        
        this.actionPanel.active = false; // 隐藏主按钮
        this.optionPanel.active = true;
        this.optionPanel.removeAllChildren();

        if (actionType === 'CHI') {
            this._chiOptions.forEach((option) => {
                // 组合：要吃的两张牌 + 别人打出的那张牌
                const tiles = [...option.consumeTileIds, this._targetTile];
                tiles.sort((a, b) => a - b);
                
                // 渲染这组牌，绑定点击发送事件
                this._renderTileGroup(tiles, () => {
                    WebSocketManager.instance.send('C_CHI', { consumeTileIds: option.consumeTileIds });
                    this.hideAll();
                });
            });
        } else if (actionType === 'GANG' && gangOptions) {
            gangOptions.forEach((opt) => {
                // 渲染 4 张一样的牌作为选项
                const tiles = [opt.tileId, opt.tileId, opt.tileId, opt.tileId];
                this._renderTileGroup(tiles, () => {
                    if (opt.type === 'AN') {
                        WebSocketManager.instance.send('C_AN_GANG', { tileId: opt.tileId });
                    } else {
                        WebSocketManager.instance.send('C_GANG', { gangType: "BU", tileId: opt.tileId });
                    }
                    this.hideAll();
                });
            });
        }

        // 动态添加一个“取消”返回按钮
        const cancelNode = new Node('CancelBtn');
        cancelNode.addComponent(UITransform);
        const label = cancelNode.addComponent(Label);
        label.string = "取消";
        label.fontSize = 40;
        label.lineHeight = 40;
        cancelNode.parent = this.optionPanel;
        
        cancelNode.on(Node.EventType.TOUCH_END, () => {
            this.optionPanel.active = false;
            this.actionPanel.active = true; // 重新显示主菜单
        });
    }

    /** 渲染一组牌，并使其可点击 */
    private _renderTileGroup(tileIds: number[], onClick: Function) {
        // 创建一个横向排列的容器 (Node)
        const groupNode = new Node('OptionGroup');
        groupNode.addComponent(UITransform);
        const layout = groupNode.addComponent(Layout);
        layout.type = Layout.Type.HORIZONTAL;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        layout.spacingX = 2; // 牌间距
        groupNode.parent = this.optionPanel;

        // 生成麻将牌
        tileIds.forEach(id => {
            const tileNode = instantiate(this.tilePrefab);
            tileNode.parent = groupNode;
            tileNode.setScale(v3(0.8, 0.8, 1)); // 稍微缩小一点
            tileNode.getComponent(MahjongTile)?.init(id);
        });

        // 给这组牌整体加上点击事件
        groupNode.on(Node.EventType.TOUCH_END, () => {
            onClick();
        });
    }
}
