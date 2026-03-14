import { _decorator, Component, Label, Node } from 'cc';
import { HttpManager } from '../network/HttpManager';
const { ccclass, property } = _decorator;

/**
 * 房间列表条目预制件脚本
 *
 * 对应预制件节点结构（RoomItem.prefab）：
 * RoomItem (UITransform: 600x80)
 * ├── Label_RoomName
 * ├── Label_Players   （"2/4人"）
 * ├── Label_Status    （"等待中" / "游戏中"）
 * └── Btn_Join
 */
@ccclass('RoomItem')
export class RoomItem extends Component {
    @property(Label)
    labelRoomName: Label = null!;

    @property(Label)
    labelPlayers: Label = null!;

    @property(Label)
    labelStatus: Label = null!;

    private _roomId: string = '';
    private _onJoinCallback: ((roomId: string) => void) | null = null;

    public init(roomData: any, onJoin: (roomId: string) => void): void {
        this._roomId = roomData.roomId ?? roomData.id ?? '';
        this._onJoinCallback = onJoin;

        if (this.labelRoomName) this.labelRoomName.string = roomData.roomName ?? '未命名房间';
        if (this.labelPlayers) this.labelPlayers.string = `${roomData.playerCount ?? 0}/4人`;
        if (this.labelStatus) this.labelStatus.string = roomData.status === 'PLAYING' ? '游戏中' : '等待中';
    }

    public onJoinClick(): void {
        if (this._onJoinCallback) {
            this._onJoinCallback(this._roomId);
        }
    }
}
