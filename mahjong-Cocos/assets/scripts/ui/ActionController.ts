import { _decorator, Component, Node, tween, v3, Prefab, instantiate, Layout, UITransform, Label } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';
import { MessageType } from '../core/TileConstants';
import { MahjongTile } from './MahjongTile';
const { ccclass, property } = _decorator;

type GangOption = {
    type: 'AN' | 'BU';
    tileId: number;
};

@ccclass('ActionController')
export class ActionController extends Component {
    @property(Node)
    actionPanel: Node = null!;

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
    optionPanel: Node = null!;

    @property(Prefab)
    tilePrefab: Prefab = null!;

    private _chiOptions: any[] = [];
    private _targetTile: number = -1;
    private _lastDiscardTileId: number = -1;
    private _canAnGangIds: number[] = [];
    private _buGangTileId: number = -1;
    private _isSelfDrawAction: boolean = false;

    protected onLoad(): void {
        this.hideAll();
        const ws = WebSocketManager.instance;
        ws.on(MessageType.S_ACTION_OPTIONS, this.onShowActions, this);
        ws.on(MessageType.S_DRAW, this.onSelfDrawActions, this);
        ws.on(MessageType.S_DISCARD, this.onDiscard, this);
    }

    protected onDestroy(): void {
        const ws = WebSocketManager.instance;
        ws.off(MessageType.S_ACTION_OPTIONS, this.onShowActions, this);
        ws.off(MessageType.S_DRAW, this.onSelfDrawActions, this);
        ws.off(MessageType.S_DISCARD, this.onDiscard, this);
    }

    private onDiscard(data: any): void {
        if (typeof data?.tileId === 'number') {
            this._lastDiscardTileId = data.tileId;
        }
    }

    private onShowActions(data: any): void {
        const options = data?.options ?? data?.actions ?? [];
        this._chiOptions = data?.chiOptions ?? [];
        this._targetTile = data?.targetTile ?? data?.tileId ?? this._lastDiscardTileId;
        this._isSelfDrawAction = false;
        this._showPanel(options);
    }

    private onSelfDrawActions(data: any): void {
        const actions: string[] = data?.actions ?? [];
        if (actions.length === 0) return;

        this._isSelfDrawAction = true;
        this._canAnGangIds = data?.canAnGangIds ?? [];
        this._buGangTileId = data?.buGangTileId ?? -1;

        const mappedOptions: string[] = [];
        if (actions.includes('HU')) mappedOptions.push('HU');
        if (actions.includes('AN_GANG') || actions.includes('BU_GANG')) mappedOptions.push('GANG');
        mappedOptions.push('PASS');

        this._showPanel(mappedOptions);
    }

    private _showPanel(options: string[]): void {
        this.actionPanel.active = true;
        if (this.optionPanel) this.optionPanel.active = false;

        this.actionPanel.setScale(v3(0.5, 0.5, 1));
        tween(this.actionPanel)
            .to(0.2, { scale: v3(1, 1, 1) }, { easing: 'backOut' })
            .start();

        this.btnPeng.active = options.includes('PENG');
        this.btnChi.active = options.includes('CHI');
        this.btnGang.active = options.includes('GANG');
        this.btnHu.active = options.includes('HU');
        this.btnPass.active = options.includes('PASS');
    }

    private hideAll(): void {
        this.actionPanel.active = false;
        if (this.optionPanel) this.optionPanel.active = false;
    }

    private _playBtnEffect(node: Node, callback: () => void): void {
        tween(node)
            .to(0.05, { scale: v3(0.9, 0.9, 1) })
            .to(0.05, { scale: v3(1, 1, 1) })
            .call(callback)
            .start();
    }

    public onChiClick(): void {
        this._playBtnEffect(this.btnChi, () => {
            if (this._chiOptions.length === 1) {
                WebSocketManager.instance.send(MessageType.C_CHI, {
                    consumeTileIds: this._chiOptions[0].consumeTileIds
                });
                this.hideAll();
            } else if (this._chiOptions.length > 1) {
                this.showSecondaryOptions('CHI');
            } else {
                WebSocketManager.instance.send(MessageType.C_CHI, {});
                this.hideAll();
            }
        });
    }

    public onGangClick(): void {
        this._playBtnEffect(this.btnGang, () => {
            if (!this._isSelfDrawAction) {
                WebSocketManager.instance.send(MessageType.C_GANG, {
                    gangType: 'MING',
                    tileId: this._targetTile
                });
                this.hideAll();
                return;
            }

            const gangOptions: GangOption[] = [];
            if (this._buGangTileId !== -1) gangOptions.push({ type: 'BU', tileId: this._buGangTileId });
            this._canAnGangIds.forEach(tileId => gangOptions.push({ type: 'AN', tileId }));

            if (gangOptions.length === 1) {
                this.sendGangOption(gangOptions[0]);
                this.hideAll();
            } else if (gangOptions.length > 1) {
                this.showSecondaryOptions('GANG', gangOptions);
            }
        });
    }

    public onPengClick(): void {
        this._playBtnEffect(this.btnPeng, () => {
            WebSocketManager.instance.send(MessageType.C_PENG, {});
            this.hideAll();
        });
    }

    public onHuClick(): void {
        this._playBtnEffect(this.btnHu, () => {
            WebSocketManager.instance.send(MessageType.C_HU, { isSelfDraw: this._isSelfDrawAction });
            this.hideAll();
        });
    }

    public onPassClick(): void {
        this._playBtnEffect(this.btnPass, () => {
            WebSocketManager.instance.send(MessageType.C_PASS, {});
            this.hideAll();
        });
    }

    private showSecondaryOptions(actionType: 'CHI' | 'GANG', gangOptions?: GangOption[]): void {
        if (!this.optionPanel || !this.tilePrefab) return;

        this.actionPanel.active = false;
        this.optionPanel.active = true;
        this.optionPanel.removeAllChildren();

        if (actionType === 'CHI') {
            this._chiOptions.forEach(option => {
                const tiles = [...option.consumeTileIds, this._targetTile].filter(id => typeof id === 'number' && id >= 0);
                tiles.sort((a, b) => a - b);

                this._renderTileGroup(tiles, () => {
                    WebSocketManager.instance.send(MessageType.C_CHI, {
                        consumeTileIds: option.consumeTileIds
                    });
                    this.hideAll();
                });
            });
        } else if (gangOptions) {
            gangOptions.forEach(option => {
                this._renderTileGroup([option.tileId, option.tileId, option.tileId, option.tileId], () => {
                    this.sendGangOption(option);
                    this.hideAll();
                });
            });
        }

        this._renderCancelButton();
    }

    private sendGangOption(option: GangOption): void {
        if (option.type === 'AN') {
            WebSocketManager.instance.send(MessageType.C_AN_GANG, { tileId: option.tileId });
        } else {
            WebSocketManager.instance.send(MessageType.C_GANG, {
                gangType: 'BU',
                tileId: option.tileId
            });
        }
    }

    private _renderCancelButton(): void {
        const cancelNode = new Node('CancelBtn');
        cancelNode.addComponent(UITransform);
        const label = cancelNode.addComponent(Label);
        label.string = '取消';
        label.fontSize = 40;
        label.lineHeight = 40;
        cancelNode.parent = this.optionPanel;

        cancelNode.on(Node.EventType.TOUCH_END, () => {
            this.optionPanel.active = false;
            this.actionPanel.active = true;
        });
    }

    private _renderTileGroup(tileIds: number[], onClick: () => void): void {
        const groupNode = new Node('OptionGroup');
        groupNode.addComponent(UITransform);
        const layout = groupNode.addComponent(Layout);
        layout.type = Layout.Type.HORIZONTAL;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        layout.spacingX = 2;
        groupNode.parent = this.optionPanel;

        tileIds.forEach(id => {
            const tileNode = instantiate(this.tilePrefab);
            tileNode.parent = groupNode;
            tileNode.setScale(v3(0.8, 0.8, 1));
            tileNode.getComponent(MahjongTile)?.init(id);
        });

        groupNode.on(Node.EventType.TOUCH_END, onClick);
    }
}
