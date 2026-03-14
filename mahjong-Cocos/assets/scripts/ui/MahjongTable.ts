import { _decorator, Component, Node, Prefab, instantiate, Label, Vec3, tween } from 'cc';
import { MahjongTile } from './MahjongTile';
import { PlayerUI } from './PlayerUI';
import { WebSocketManager } from '../network/WebSocketManager';
import { MessageType } from '../core/TileConstants';

const { ccclass, property } = _decorator;

@ccclass('MahjongTable')
export class MahjongTable extends Component {
    @property(Node)
    handContainers: Node[] = []; // 0-下, 1-右, 2-上, 3-左

    @property(Node)
    discardContainers: Node[] = []; // 0-下, 1-右, 2-上, 3-左

    @property(PlayerUI)
    playerUIs: PlayerUI[] = []; 

    @property(Prefab)
    tilePrefab: Prefab = null!; 

    @property(Label)
    wallCountLabel: Label = null!; 

    private _mySeatIndex: number = 0; 

    protected onLoad() {
        WebSocketManager.instance.on(MessageType.S_GAME_START, this.onGameStart, this);
        WebSocketManager.instance.on(MessageType.S_DRAW, this.onDraw, this);
        WebSocketManager.instance.on(MessageType.S_ROOM_STATE, this.onRoomStateUpdate, this);
        WebSocketManager.instance.on(MessageType.S_DISCARD, this.onDiscardBroadcast, this);
    }

    protected start() {
        // --- 恢复完整的模拟测试 ---
        const testData = {
            handTiles: [0, 1, 2, 9, 10, 11, 18, 19, 20, 21, 22, 23, 26], // 13张
            wallCount: 82
        };
        this.scheduleOnce(() => {
            this.onGameStart(testData);
        }, 0.5);
    }

    private getRelativeSeat(targetSeat: number): number {
        return (targetSeat - this._mySeatIndex + 4) % 4;
    }

    private onRoomStateUpdate(data: any) {
        const { players } = data;
        if (!players) return;
        players.forEach((p: any) => {
            const relIndex = this.getRelativeSeat(p.seatIndex);
            if (this.playerUIs[relIndex]) {
                this.playerUIs[relIndex].node.active = true;
                this.playerUIs[relIndex].updateInfo(p.nickname, p.score, p.online);
            }
        });
    }

    private onGameStart(data: any) {
        const { handTiles, wallCount } = data;
        
        // 清理旧牌
        this.handContainers.forEach(c => { if(c) c.removeAllChildren(); });
        this.discardContainers.forEach(c => { if(c) c.removeAllChildren(); });

        // 1. 渲染自己的手牌
        this.renderMyHand(handTiles);
        
        // 2. 渲染三个对手的手牌（背面）
        for (let i = 1; i < 4; i++) {
            this.renderOpponentHand(i, 13);
        }

        if (this.wallCountLabel) {
            this.wallCountLabel.string = `剩余: ${wallCount}`;
        }
    }

    private renderMyHand(tiles: number[]) {
        const container = this.handContainers[0];
        if (!container) return;
        tiles.sort((a, b) => a - b);
        tiles.forEach(tileId => {
            const tileNode = instantiate(this.tilePrefab);
            tileNode.parent = container;
            const tileComp = tileNode.getComponent(MahjongTile);
            if (tileComp) tileComp.init(tileId);

            tileNode.on(Node.EventType.TOUCH_END, () => {
                this.playDiscardAction(tileNode, tileId, 0);
            });
        });
    }

    private renderOpponentHand(relSeat: number, count: number) {
        for (let i = 0; i < count; i++) {
            this.addOneOpponentTile(relSeat);
        }
    }

    private addOneOpponentTile(relSeat: number) {
        const container = this.handContainers[relSeat];
        if (!container) return;
        const tileNode = instantiate(this.tilePrefab);
        tileNode.parent = container;
        const tileComp = tileNode.getComponent(MahjongTile);
        if (tileComp) tileComp.init(-1); // 显示背面
        
        // 根据方位微调
        if (relSeat === 2) {
            tileNode.setScale(0.6, 0.6, 1);
        } else {
            tileNode.setScale(0.5, 0.5, 1);
        }
    }

    private playDiscardAction(tileNode: Node, tileId: number, relSeat: number) {
        const discardContainer = this.discardContainers[relSeat];
        if (!discardContainer) {
            tileNode.destroy();
            return;
        }

        const worldPos = discardContainer.worldPosition;
        tween(tileNode)
            .to(0.15, { position: new Vec3(tileNode.position.x, tileNode.position.y + 60, 0), scale: new Vec3(1.1, 1.1, 1) })
            .to(0.25, { worldPosition: worldPos, scale: new Vec3(0.5, 0.5, 1) })
            .call(() => {
                this.addTileToDiscardPile(relSeat, tileId);
                tileNode.destroy();
            })
            .start();
    }

    private addTileToDiscardPile(relSeat: number, tileId: number) {
        const container = this.discardContainers[relSeat];
        if (!container) return;
        const tileNode = instantiate(this.tilePrefab);
        tileNode.parent = container;
        const tileComp = tileNode.getComponent(MahjongTile);
        if (tileComp) tileComp.init(tileId);
        tileNode.setScale(0.4, 0.4, 1);
    }

    private onDiscardBroadcast(data: any) {
        const { seatIndex, tileId } = data;
        const relSeat = this.getRelativeSeat(seatIndex);
        if (relSeat !== 0) {
            const hand = this.handContainers[relSeat];
            if (hand && hand.children.length > 0) {
                this.playDiscardAction(hand.children[0], tileId, relSeat);
            }
        }
    }

    private onDraw(data: any) {
        const { tileId, seatIndex } = data;
        const relSeat = this.getRelativeSeat(seatIndex);
        if (relSeat === 0) {
            const tileNode = instantiate(this.tilePrefab);
            tileNode.parent = this.handContainers[0];
            const tileComp = tileNode.getComponent(MahjongTile);
            if (tileComp) tileComp.init(tileId);
        } else {
            this.addOneOpponentTile(relSeat);
        }
    }
}
