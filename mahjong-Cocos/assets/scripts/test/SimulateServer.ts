import { _decorator, Component } from 'cc';
import { WebSocketManager, IWsMessage } from '../network/WebSocketManager';

const { ccclass } = _decorator;

/**
 * 模拟服务器，用于本地测试完整的单局流程（玩家为庄家，其他三人为人机循环打牌）
 * 将此脚本挂载在场景中（如 Canvas 或 GameController 所在的节点）即可生效。
 */
@ccclass('SimulateServer')
export class SimulateServer extends Component {

    private _mySeat = 0;
    private _currentSeat = 0;
    private _wallCount = 108 - 53;
    private _gameStarted = false;

    // 一个简单且随机的牌池用于人机摸牌
    private _tilePool = [
        0, 1, 2, 3, 4, 5, 6, 7, 8,       // 万
        9, 10, 11, 12, 13, 14, 15, 16, 17, // 筒
        18, 19, 20, 21, 22, 23, 24, 25, 26 // 条
    ];

    protected start() {
        console.log('--- [SimulateServer] 启动模拟服务器拦截 ---');

        // 模拟 WebSocket 的 config 注入，这样 GameController 获取 userId 才是 1000
        (WebSocketManager.instance as any)._config = { userId: 1000, roomId: 'test_room' };
        
        // 拦截 WebSocket 的 send 方法
        const originalSend = WebSocketManager.instance.send;
        WebSocketManager.instance.send = (type: string, data?: any) => {
            console.log(`[SimulateServer] 拦截到客户端请求: ${type}`, data);
            this._handleClientRequest(type, data);
            
            // 为了防止连接未建立报错，不再调用 originalSend
        };

        // 延迟 1 秒后自动触发进入房间和游戏开始（因为 Web 里会做，这里作为独立测试入口）
        setTimeout(() => {
            this._mockRoomEnter();
        }, 1000);
    }

    private _sendToClient(type: string, data: any) {
        console.log(`[SimulateServer] 下发给客户端: ${type}`, data);
        const wsAny = WebSocketManager.instance as any;
        // 模拟 WebSocket 接收消息
        wsAny._onMessage({
            data: JSON.stringify({ type, data })
        });
    }

    private _handleClientRequest(type: string, data: any) {
        if (type === 'C_SELECT_MISS_SUIT') {
            // 我定缺了，模拟所有人定缺完成
            setTimeout(() => {
                this._sendToClient('S_MISS_SUIT_RESULT', [
                    { seatIndex: 0, suitIndex: data.suitIndex },
                    { seatIndex: 1, suitIndex: 0 },
                    { seatIndex: 2, suitIndex: 1 },
                    { seatIndex: 3, suitIndex: 2 },
                ]);

                // 定缺完后，庄家（我自己，0号位）摸牌
                setTimeout(() => this._turnToSeat(0), 1000);
            }, 1000);
        } 
        else if (type === 'C_DISCARD') {
            const tileId = data.tileId;
            // 广播我打出的牌
            this._sendToClient('S_DISCARD', {
                seatIndex: this._mySeat,
                tileId: tileId,
                wallCount: this._wallCount
            });

            // 轮到下家（1号位）摸牌
            setTimeout(() => this._turnToSeat(1), 1000);
        }
    }

    private _mockRoomEnter() {
        // 1. 发送房间状态
        this._sendToClient('S_ROOM_STATE', {
            status: 'WAITING',
            players: [
                { userId: WebSocketManager.instance.userId || 1000, seatIndex: 0, nickname: '我(庄家)', ready: true, score: 1000 },
                { userId: 1001, seatIndex: 1, nickname: '机器人右', ready: true, score: 1000 },
                { userId: 1002, seatIndex: 2, nickname: '机器人上', ready: true, score: 1000 },
                { userId: 1003, seatIndex: 3, nickname: '机器人左', ready: true, score: 1000 },
            ]
        });

        // 2. 发送游戏开始 (我作为庄家)
        setTimeout(() => {
            this._sendToClient('S_GAME_START', {
                dealerSeat: 0,
                wallCount: this._wallCount,
                handTiles: [0, 1, 2, 8, 9, 10, 11, 17, 18, 19, 20, 25, 26] // 初始 13 张牌
            });

            // 3. 开始定缺
            setTimeout(() => {
                this._sendToClient('S_SELECT_MISS_SUIT', {});
            }, 1500);

        }, 1500);
    }

    /** 轮到某个座位行动 */
    private _turnToSeat(seatIndex: number) {
        this._currentSeat = seatIndex;
        this._wallCount--;

        if (this._wallCount <= 0) {
            console.log('[SimulateServer] 牌墙摸完，流局');
            return; // 简单结束
        }

        // 摸一张随机牌
        const drawTile = this._tilePool[Math.floor(Math.random() * this._tilePool.length)];

        // 广播倒计时
        this._sendToClient('S_COUNTDOWN', {
            seatIndex: seatIndex,
            seconds: 15
        });

        if (seatIndex === this._mySeat) {
            // 我的回合：给自己发 S_DRAW
            this._sendToClient('S_DRAW', {
                seatIndex: seatIndex,
                tileId: drawTile,
                wallCount: this._wallCount,
                tingTiles: [] // 暂时不模拟听牌数据
            });
            // 接下来等待我点击出牌按钮发送 C_DISCARD
        } else {
            // 机器人的回合：模拟机器人摸牌，然后随机打出一张牌
            // 客户端的 _onCountdown 补丁已经给机器人加了一张手牌了
            setTimeout(() => {
                const discardTile = this._tilePool[Math.floor(Math.random() * this._tilePool.length)];
                this._sendToClient('S_DISCARD', {
                    seatIndex: seatIndex,
                    tileId: discardTile,
                    wallCount: this._wallCount
                });

                // 轮到下一个人
                setTimeout(() => this._turnToSeat((seatIndex + 1) % 4), 1000);
            }, 1500); // 机器人思考 1.5 秒后出牌
        }
    }
}
