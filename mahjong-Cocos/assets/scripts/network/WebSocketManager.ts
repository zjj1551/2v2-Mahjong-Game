import { _decorator } from 'cc';
const { ccclass } = _decorator;

export interface IWsMessage {
    type: string;
    roomId?: string;
    userId?: number;
    data?: any;
}

export interface IGameConfig {
    host: string;
    port: number;
    userId: number;
    roomId?: string;
}

export type WsCallback = (data: any) => void;

@ccclass('WebSocketManager')
export class WebSocketManager {
    private static _instance: WebSocketManager | null = null;
    private _ws: WebSocket | null = null;
    private _isConnected: boolean = false;
    private _config: IGameConfig | null = null;
    private _callbacks: Map<string, WsCallback[]> = new Map();
    private _pingInterval: number = -1;

    public static get instance(): WebSocketManager {
        if (!this._instance) {
            this._instance = new WebSocketManager();
        }
        return this._instance;
    }

    public connect(config: IGameConfig): void {
        this._config = config;
        const url = 'ws://' + config.host + ':' + config.port + '/ws/game?userId=' + config.userId;
        console.log('[WebSocket] Connecting to ' + url + '...');

        this._ws = new WebSocket(url);

        this._ws.onopen = this._onOpen.bind(this);
        this._ws.onmessage = this._onMessage.bind(this);
        this._ws.onerror = this._onError.bind(this);
        this._ws.onclose = this._onClose.bind(this);
    }

    public disconnect(): void {
        this._stopPing();
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        this._isConnected = false;
    }

    public send(type: string, data?: any): void {
        if (!this._isConnected || !this._ws) {
            console.error('[WebSocket] Cannot send message: not connected.');
            return;
        }

        const msg: IWsMessage = {
            type: type,
            userId: this._config?.userId,
            roomId: this._config?.roomId,
            data: data
        };

        const msgStr = JSON.stringify(msg);
        console.log('[WebSocket] SEND -> ' + msgStr);
        this._ws.send(msgStr);
    }

    public on(type: string, callback: WsCallback): void {
        let list = this._callbacks.get(type);
        if (!list) {
            list = [];
            this._callbacks.set(type, list);
        }
        list.push(callback);
    }

    public off(type: string, callback: WsCallback): void {
        const list = this._callbacks.get(type);
        if (list) {
            const index = list.indexOf(callback);
            if (index > -1) {
                list.splice(index, 1);
            }
        }
    }

    private _onOpen(event: Event): void {
        console.log('[WebSocket] Connected successfully.');
        this._isConnected = true;
        this._startPing();

        if (this._config && this._config.roomId) {
            this.send('C_JOIN_ROOM');
        }
    }

    private _onMessage(event: MessageEvent): void {
        try {
            const msg: IWsMessage = JSON.parse(event.data);
            console.log('[WebSocket] RECV <- ' + event.data);

            const list = this._callbacks.get(msg.type);
            if (list) {
                for (const cb of list) {
                    cb(msg.data);
                }
            }
        } catch (e) {
            console.error('[WebSocket] Failed to parse message:', event.data, e);
        }
    }

    private _onError(event: Event): void {
        console.error('[WebSocket] Error occurred.', event);
    }

    private _onClose(event: CloseEvent): void {
        console.log('[WebSocket] Connection closed. Code: ' + event.code + ', Reason: ' + event.reason);
        this._isConnected = false;
        this._stopPing();
    }

    private _startPing(): void {
        this._stopPing();
        this._pingInterval = window.setInterval(() => {
            this.send('C_PING');
        }, 25000);
    }

    private _stopPing(): void {
        if (this._pingInterval !== -1) {
            clearInterval(this._pingInterval);
            this._pingInterval = -1;
        }
    }
}