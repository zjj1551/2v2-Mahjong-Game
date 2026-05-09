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
    private _discardLocked: boolean = true;

    protected onLoad() {
        const ws = WebSocketManager.instance;
        ws.on(MessageType.S_GAME_START, this.onGameStart, this);
        ws.on(MessageType.S_DRAW, this.onDraw, this);
        ws.on(MessageType.S_DISCARD, this.onDiscard, this);
        ws.on(MessageType.S_ERROR, this.onServerError, this);
    }

    protected onDestroy() {
        const ws = WebSocketManager.instance;
        ws.off(MessageType.S_GAME_START, this.onGameStart, this);
        ws.off(MessageType.S_DRAW, this.onDraw, this);
        ws.off(MessageType.S_DISCARD, this.onDiscard, this);
        ws.off(MessageType.S_ERROR, this.onServerError, this);
    }

    public setMySeatIndex(seatIndex: number) {
        this._mySeatIndex = seatIndex;
        this._refreshHandInteractable();
    }

    private onGameStart(data: any) {
        data = data || {};

        const handTiles = data.handTiles;
        const bankerSeat = data.bankerSeat !== undefined ? data.bankerSeat : data.dealerSeat;
        this._discardLocked = bankerSeat !== this._mySeatIndex;

        if (this.bottomHandContainer) {
            this.bottomHandContainer.removeAllChildren();
        }
        if (this.bottomDiscardRiver) {
            this.bottomDiscardRiver.clear();
        }
        if (this.bottomMeldContainer) {
            this.bottomMeldContainer.removeAllChildren();
        }

        if (handTiles && Array.isArray(handTiles)) {
            const tiles = handTiles.map((tile: number | { tileId: number }) => {
                return typeof tile === 'number' ? tile : tile.tileId;
            });
            tiles.sort((a: number, b: number) => a - b);
            tiles.forEach((id: number) => this._addTileToHand(id));
        }

        this._refreshHandInteractable();
    }

    private onDraw(data: any) {
        data = data || {};

        const tileId = data.tileId;
        const seatIndex = data.seatIndex;
        const tile = data.tile;

        if (seatIndex === this._mySeatIndex || this._mySeatIndex === -1) {
            this._discardLocked = false;
            const drawTileId = typeof tileId === 'number' ? tileId : tile ? tile.tileId : undefined;
            if (typeof drawTileId === 'number') {
                this._addTileToHand(drawTileId);
            }
            this._refreshHandInteractable();
        }
    }

    public onPeng(tileId: number) {
        this._removeTilesFromHand([tileId, tileId]);
        this._addMeld([tileId, tileId, tileId]);
        this._discardLocked = false;
        this._refreshHandInteractable();
    }

    public onChi(tileId: number, consumeTileIds: number[]) {
        this._removeTilesFromHand(consumeTileIds || []);
        this._addMeld([...(consumeTileIds || []), tileId]);
        this._discardLocked = false;
        this._refreshHandInteractable();
    }

    public onGang(tileId: number, gangType: string) {
        const isAnGang = gangType === 'AN';
        const isBuGang = gangType === 'BU';

        if (isBuGang) {
            this._removeTilesFromHand([tileId]);
            this._addMeld([tileId]);
        } else {
            const removeCount = isAnGang ? 4 : 3;
            this._removeTilesFromHand(Array(removeCount).fill(tileId));
            this._addMeld([tileId, tileId, tileId, tileId]);
        }

        this._discardLocked = true;
        this._refreshHandInteractable();
    }

    private onServerError() {
        this._discardLocked = false;
        this._refreshHandInteractable();
    }

    private onDiscard(data: any) {
        data = data || {};

        const seatIndex = data.seatIndex;
        const tileId = data.tileId;
        this._discardLocked = true;

        if (seatIndex === this._mySeatIndex) {
            this._removeConfirmedDiscard(tileId);
        }

        this._refreshHandInteractable();
    }

    private _addTileToHand(tileId: number) {
        if (!this.tilePrefab || !this.bottomHandContainer) return;

        const node = instantiate(this.tilePrefab);
        node.parent = this.bottomHandContainer;

        const comp = node.getComponent(MahjongTile);
        if (comp) {
            comp.init(tileId);
        }

        node.on(Node.EventType.TOUCH_END, () => {
            this._requestDiscard(tileId);
        });

        this._refreshTileInteractable(node);
    }

    private _requestDiscard(tileId: number) {
        if (this._mySeatIndex < 0 || this._discardLocked) return;

        this._discardLocked = true;
        this._refreshHandInteractable();
        WebSocketManager.instance.send(MessageType.C_DISCARD, { tileId: tileId });
    }

    private _removeConfirmedDiscard(tileId: number) {
        const tileNode = this._findTileNode(tileId);
        if (!tileNode || !this.bottomDiscardRiver) return;

        const riverNode = (this.bottomDiscardRiver as any).node;
        const tableNode = (this as any).node;
        if (!riverNode || !tableNode || !tableNode.parent) {
            return;
        }

        const worldPos = riverNode.worldPosition;
        const originalPos = tileNode.worldPosition;
        tileNode.parent = tableNode.parent;
        tileNode.worldPosition = originalPos;

        tween(tileNode)
            .to(0.2, { worldPosition: worldPos, scale: v3(0.5, 0.5, 1) }, { easing: 'sineOut' })
            .call(() => {
                if (this.bottomDiscardRiver) {
                    this.bottomDiscardRiver.addDiscard(tileId);
                }
                tileNode.destroy();
            })
            .start();
    }

    private _findTileNode(tileId: number): Node | null {
        if (!this.bottomHandContainer) return null;

        for (const child of this.bottomHandContainer.children) {
            const comp = child.getComponent(MahjongTile);
            if (comp && comp.tileId === tileId && child.active) {
                return child;
            }
        }
        return null;
    }

    private _removeTilesFromHand(tileIds: number[]) {
        if (!this.bottomHandContainer) return;

        for (const id of tileIds) {
            for (const child of this.bottomHandContainer.children) {
                const comp = child.getComponent(MahjongTile);
                if (comp && comp.tileId === id && child.active) {
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
            if (comp) {
                comp.init(id);
            }
            node.off(Node.EventType.TOUCH_END);
        }
    }

    private _refreshHandInteractable() {
        if (!this.bottomHandContainer) return;

        for (const child of this.bottomHandContainer.children) {
            this._refreshTileInteractable(child);
        }
    }

    private _refreshTileInteractable(node: Node) {
        node.active = true;
        node.setScale(this._discardLocked ? v3(0.96, 0.96, 1) : v3(1, 1, 1));
    }
}
