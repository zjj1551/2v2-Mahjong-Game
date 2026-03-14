import { _decorator, Component, Node } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';

const { ccclass, property } = _decorator;

@ccclass('SimulateServer')
export class SimulateServer extends Component {

    start() {
        // Wait a bit before simulating to let other scripts initialize
        setTimeout(() => {
            this.simulateGameStart();
        }, 2000);
    }

    simulateGameStart() {
        console.log('--- SIMULATING SERVER: Game Start ---');
        
        // Simulating receiving 13 tiles for the bottom player (mySeatIndex = 0)
        // tileIds: 0(Wan 1), 8(Wan 9), 9(Tong 1), 17(Tong 9), 18(Tiao 1), 26(Tiao 9)
        const mockHandTiles = [0, 1, 2, 8, 9, 10, 11, 17, 18, 19, 20, 25, 26];

        // Trigger the S_GAME_START event that MahjongTable is listening for
        // Using any to bypass private access for quick testing, in real use backend sends this
        (WebSocketManager.instance as any)._onMessage({
            data: JSON.stringify({
                type: 'S_GAME_START',
                data: {
                    handTiles: mockHandTiles,
                    dealerSeat: 0,
                    wallCount: 108 - 53
                }
            })
        });

        // Simulate drawing a tile 2 seconds later
        setTimeout(() => {
            console.log('--- SIMULATING SERVER: Draw Tile ---');
            (WebSocketManager.instance as any)._onMessage({
                data: JSON.stringify({
                    type: 'S_DRAW',
                    data: {
                        tileId: 5 // Wan 6
                    }
                })
            });
        }, 2000);
    }
}