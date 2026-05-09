import { _decorator, Component, Node, Prefab, instantiate, tween, v3 } from 'cc';
import { MahjongTile } from './MahjongTile';
import { WebSocketManager } from '../network/WebSocketManager';
import { MessageType } from '../core/TileConstants';
import { DiscardRiver } from './DiscardRiver';

const { ccclass, property } = _decorator;

@ccclass('MahjongTable')
export class MahjongTable extends Component {
    @property(Node)
    bottomHandContainer: Node = null!;

    @property(Node)
    bottomMeldContainer: Node = null!;

    @property(DiscardRiver)
    bottomDiscardRiver: DiscardRiver = null!;

    @property(Prefab)
    tilePrefab: Prefab = null!;

    private _mySeatIndex: number = -1;
    private _activeSeatIndex: number = -1;
    private _discardPending: boolean = false;

    protected onLoad() {
        const ws = WebSocketManager.instance;
        ws.on(MessageType.S_GAME_START, this.onGameStart, this);
        ws.on(MessageType.S_DRAW, this.onDraw, this);
        ws.on(MessageType.S_DISCARD, this.onDiscard, this);
        ws.on(MessageType.S_COUNTDOWN, this.onCountdown, this);
        ws.on(MessageType.S_ERROR, this.onServerError, this);
    }

    protected onDestroy() {
        const ws = WebSocketManager.instance;
        ws.off(MessageType.S_GAME_START, this.onGameStart, this);
        ws.off(MessageType.S_DRAW, this.onDraw, this);
        ws.off(MessageType.S_DISCARD, this.onDiscard, this);
        ws.off(MessageType.S_COUNTDOWN, this.onCountdown, this);
        ws.off(MessageType.S_ERROR, this.onServerError, this);
    }

    public setMySeatIndex(seatIndex: number) {
        this._mySeatIndex = seatIndex;
        this._refreshHandInteractable();
    }

    private onGameStart(data: any) {
        const { handTiles } = data;
        this._discardPending = false;
        this._activeSeatIndex = -1;

        this.bottomHandContainer.removeAllChildren();
        this.bottomMeldContainer?.removeAllChildren();
        this.bottomDiscardRiver?.clear();

        if (handTiles) {
            handTiles.sort((a: number, b: number) => a - b);
            handTiles.forEach((id: number) => this._addTileToHand(id));
        }

        this._refreshHandInteractable();
    }

    private onDraw(data: any) {
        const { tileId, seatIndex } = data;
        if (seatIndex !== this._mySeatIndex) return;

        this._discardPending = false;
        this._activeSeatIndex = seatIndex;
        if (typeof tileId === 'number') {
            this._addTileToHand(tileId);
        }
        this._refreshHandInteractable();
    }

    private onCountdown(data: any) {
        const nextSeat = data?.seatIndex;
        if (typeof nextSeat !== 'number') return;

        this._activeSeatIndex = nextSeat;
        if (nextSeat !== this._mySeatIndex) {
            this._discardPending = false;
        }
        this._refreshHandInteractable();
    }

    public onPeng(tileId: number) {
        this._removeTilesFromHand([tileId, tileId]);
        this._addMeld([tileId, tileId, tileId]);
        this._refreshHandInteractable();
    }

    public onChi(tileId: number, consumeTileIds: number[]) {
        this._removeTilesFromHand(consumeTileIds);
        this._addMeld([...consumeTileIds, tileId]);
        this._refreshHandInteractable();
    }

    public onGang(tileId: number, gangType: string) {
        const isAnGang = gangType === 'AN';
        const isBuGang = gangType === 'BU';

        if (isBuGang) {
            this._removeTilesFromHand([tileId]);
            // 简单处理：将这1张牌加到副露区。如果是真实项目可能需要找到对应的碰再进行特殊放置。
            this._addMeld([tileId]);
        } else {
            const removeCount = isAnGang ? 4 : 3;
            const tilesToRemove = Array(removeCount).fill(tileId);
            this._removeTilesFromHand(tilesToRemove);
            this._addMeld([tileId, tileId, tileId, tileId]);
        }
        this._refreshHandInteractable();
    }

    private _removeTilesFromHand(tileIds: number[]) {
        // 为了防止销毁同一个节点多次，我们复制一下数组并在找到后从父节点移除
        for (const id of tileIds) {
            for (const child of this.bottomHandContainer.children) {
                const tile = child.getComponent(MahjongTile);
                if (tile?.tileId === id && child.active) {
                    child.removeFromParent();
                    child.destroy();
                    break;
                }
            }
        }
    }

    private _addMeld(tileIds: number[]) {
        if (!this.bottomMeldContainer || !this.tilePrefab) return;
        for (const id of tileIds) {
            const node = instantiate(this.tilePrefab);
            node.parent = this.bottomMeldContainer;
            node.setScale(v3(0.8, 0.8, 1));
            const comp = node.getComponent(MahjongTile);
            comp?.init(id);
            // 副露牌不可交互
            node.off(Node.EventType.TOUCH_END);
        }
    }

    private onDiscard(data: any) {
        const { seatIndex, tileId } = data ?? {};
        if (seatIndex !== this._mySeatIndex) return;

        this._discardPending = false;
        this._activeSeatIndex = -1;
        this._removeConfirmedDiscard(tileId);
        this._refreshHandInteractable();
    }

    private onServerError() {
        this._discardPending = false;
        this._refreshHandInteractable();
    }

    private _addTileToHand(tileId: number) {
        const node = instantiate(this.tilePrefab);
        node.parent = this.bottomHandContainer;

        const comp = node.getComponent(MahjongTile);
        comp?.init(tileId);

        node.on(Node.EventType.TOUCH_END, () => {
            this._requestDiscard(tileId);
        });

        this._refreshTileInteractable(node);
    }

    private _requestDiscard(tileId: number) {
        if (this._discardPending) return;
        if (this._mySeatIndex < 0) return;
        if (this._activeSeatIndex !== this._mySeatIndex) return;

        this._discardPending = true;
        this._refreshHandInteractable();
        WebSocketManager.instance.send(MessageType.C_DISCARD, { tileId });
    }

    private _removeConfirmedDiscard(tileId: number) {
        const tileNode = this._findTileNode(tileId);
        if (!tileNode) return;

        const worldPos = this.bottomDiscardRiver.node.worldPosition;
        const originalPos = tileNode.worldPosition;
        tileNode.parent = this.node.parent;
        tileNode.worldPosition = originalPos;

        tween(tileNode)
            .to(0.2, { worldPosition: worldPos, scale: v3(0.5, 0.5, 1) }, { easing: 'sineOut' })
            .call(() => {
                this.bottomDiscardRiver?.addDiscard(tileId);
                tileNode.destroy();
            })
            .start();
    }

    private _findTileNode(tileId: number): Node | null {
        for (const child of this.bottomHandContainer.children) {
            const tile = child.getComponent(MahjongTile);
            if (tile?.tileId === tileId) {
                return child;
            }
        }
        return null;
    }

    private _refreshHandInteractable() {
        for (const child of this.bottomHandContainer.children) {
            this._refreshTileInteractable(child);
        }
    }

    private _refreshTileInteractable(tileNode: Node) {
        const canDiscard = this._activeSeatIndex === this._mySeatIndex && !this._discardPending;
        tileNode.active = true;
        tileNode.setScale(canDiscard ? v3(1, 1, 1) : v3(0.96, 0.96, 1));
    }
}
