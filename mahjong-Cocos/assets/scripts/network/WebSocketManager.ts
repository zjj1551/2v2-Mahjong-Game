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

interface ICallbackInfo {
    callback: WsCallback;
    target?: any;
}

@ccclass('WebSocketManager')
export class WebSocketManager {
    private static _instance: WebSocketManager | null = null;
    private _ws: WebSocket | null = null;
    private _isConnected: boolean = false;
    private _config: IGameConfig | null = null;
    private _callbacks: Map<string, ICallbackInfo[]> = new Map();
    private _pingInterval: number = -1;

    // Used in iframe mode to know the local userId
    private _iframeUserId: number = -1;

    public static get instance(): WebSocketManager {
        if (!this._instance) {
            this._instance = new WebSocketManager();
        }
        return this._instance;
    }

    public get userId(): number | undefined {
        if (window.parent !== window && this._iframeUserId !== -1) {
            return this._iframeUserId;
        }
        return this._config?.userId;
    }

    public initIframeBridge() {
        if (window.parent !== window) {
            console.log('[WebSocketManager] Init Iframe Bridge Mode');
            window.addEventListener('message', this._onPostMessageReceived.bind(this));
            window.parent.postMessage({ type: 'COCOS_READY' }, '*');
        }
    }

    private _onPostMessageReceived(event: MessageEvent) {
        const data = event.data;
        if (!data || data.type !== 'SERVER_INBOUND') return;
        
        console.log('[Cocos] 收到前端透传的服务端指令:', data.action);
        
        // Auto-extract userId if frontend passes it in S_ROOM_STATE
        if (data.action === 'S_ROOM_STATE' && data.payload && data.payload.myUserId !== undefined) {
            this._iframeUserId = data.payload.myUserId;
        }

        const list = this._callbacks.get(data.action);
        if (list) {
            for (const item of list) {
                if (item.target) {
                    item.callback.call(item.target, data.payload);
                } else {
                    item.callback(data.payload);
                }
            }
        }
    }

    public connect(config: IGameConfig): void {
        this._config = config;
        
        if (window.parent !== window) {
            console.log('[WebSocketManager] 处于内嵌环境，拦截 connect 调用，使用 postMessage 桥接。');
            return; // 桥接模式下不需要建立真实的 WebSocket 连接
        }

        const url = 'ws://' + config.host + ':' + config.port + '/ws/game?userId=' + config.userId;
        console.log('[WebSocket] Connecting to ' + url + '...');

        this._ws = new WebSocket(url);
        this._ws.onopen = this._onOpen.bind(this);
        this._ws.onmessage = this._onMessage.bind(this);
        this._ws.onerror = this._onError.bind(this);
        this._ws.onclose = this._onClose.bind(this);
    }

    public disconnect(): void {
        if (window.parent !== window) return; // iframe 环境不处理真实的 disconnect
        this._stopPing();
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        this._isConnected = false;
    }

    public send(type: string, data?: any): void {
        if (window.parent !== window) {
            // 内嵌模式：通过 postMessage 委托外层前端发送
            window.parent.postMessage({
                type: 'COCOS_OUTBOUND',
                action: type,
                payload: data
            }, '*');
            return;
        }

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

    public on(type: string, callback: WsCallback, target?: any): void {
        let list = this._callbacks.get(type);
        if (!list) {
            list = [];
            this._callbacks.set(type, list);
        }
        list.push({ callback, target });
    }

    public off(type: string, callback: WsCallback, target?: any): void {
        const list = this._callbacks.get(type);
        if (list) {
            const index = list.findIndex(item => item.callback === callback && item.target === target);
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
                for (const item of list) {
                    if (item.target) {
                        item.callback.call(item.target, msg.data);
                    } else {
                        item.callback(msg.data);
                    }
                }
            }
        } catch (e) {
            console.error('[WebSocket] Callback execution or parsing error:', e);
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