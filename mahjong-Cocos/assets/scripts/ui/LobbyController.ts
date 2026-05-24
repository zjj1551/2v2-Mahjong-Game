import { _decorator, Component, Node, Label, Prefab, instantiate, ScrollView, EditBox, director } from 'cc';
import { HttpManager } from '../network/HttpManager';
import { WebSocketManager } from '../network/WebSocketManager';
import { RoomItem } from './RoomItem';
const { ccclass, property } = _decorator;

/**
 * 游戏大厅控制器
 *
 * 场景节点结构：
 * Canvas
 * ├── Label_Welcome        ("欢迎，{nickname}")
 * ├── Btn_Refresh          (刷新房间列表)
 * ├── ScrollView_RoomList
 * │   └── Content          (房间条目挂载点)
 * ├── Panel_CreateRoom
 * │   ├── EditBox_RoomName
 * │   ├── Btn_Confirm
 * │   └── Btn_Cancel
 * └── Btn_CreateRoom       (弹出创建面板)
 */
@ccclass('LobbyController')
export class LobbyController extends Component {

    @property(Label)
    labelWelcome: Label = null!;

    @property(Node)
    roomListContent: Node = null!;

    @property(Prefab)
    roomItemPrefab: Prefab = null!;

    @property(Node)
    createRoomPanel: Node = null!;

    @property(EditBox)
    editRoomName: EditBox = null!;

    @property(Label)
    labelTip: Label = null!;

    @property
    serverHost: string = 'localhost';

    @property
    serverPort: number = 8080;

    protected async start(): Promise<void> {
        HttpManager.instance.setBaseUrl(this.serverHost, this.serverPort);
        if (this.createRoomPanel) this.createRoomPanel.active = false;
        await this._refreshRoomList();
    }

    /** 刷新房间列表 */
    public async onRefreshClick(): Promise<void> {
        await this._refreshRoomList();
    }

    /** 显示创建房间面板 */
    public onCreateRoomClick(): void {
        if (this.createRoomPanel) this.createRoomPanel.active = true;
    }

    /** 确认创建房间 */
    public async onConfirmCreateRoom(): Promise<void> {
        const roomName = this.editRoomName?.string?.trim() || '麻将房间';
        try {
            const result = await HttpManager.instance.createRoom(roomName);
            if (result && result.roomId) {
                if (this.createRoomPanel) this.createRoomPanel.active = false;
                this._enterRoom(result.roomId);
            } else {
                this._setTip(result?.message || '创建房间失败');
            }
        } catch (e) {
            this._setTip('创建失败，请确认已登录');
        }
    }

    /** 取消创建房间 */
    public onCancelCreateRoom(): void {
        if (this.createRoomPanel) this.createRoomPanel.active = false;
    }

    private async _refreshRoomList(): Promise<void> {
        this._setTip('加载中…');
        try {
            const rooms = await HttpManager.instance.getRoomList();
            this._buildRoomList(rooms ?? []);
            this._setTip(rooms?.length ? '' : '暂无开放房间，快来创建一个吧！');
        } catch (e) {
            this._setTip('获取房间列表失败');
        }
    }

    private _buildRoomList(rooms: any[]): void {
        if (!this.roomListContent || !this.roomItemPrefab) return;
        this.roomListContent.removeAllChildren();
        for (const roomData of rooms) {
            const node = instantiate(this.roomItemPrefab);
            node.parent = this.roomListContent;
            const item = node.getComponent(RoomItem);
            item?.init(roomData, (roomId) => this._enterRoom(roomId));
        }
    }

    private _enterRoom(roomId: string): void {
        // 将 roomId 保存，GameController 会读取
        const http = HttpManager.instance;
        WebSocketManager.instance.connect({
            host: this.serverHost,
            port: this.serverPort,
            userId: http.userId,
            roomId: roomId
        });
        director.loadScene('GameScene');
    }

    private _setTip(msg: string): void {
        if (this.labelTip) this.labelTip.string = msg;
    }
}
