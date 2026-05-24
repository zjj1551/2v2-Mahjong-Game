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
    private _iframeUserId: number = -1;
    private _bridgeInitialized: boolean = false;
    private _boundPostMessageHandler: ((event: MessageEvent) => void) | null = null;

    public static get instance(): WebSocketManager {
        if (!this._instance) {
            this._instance = new WebSocketManager();
        }
        return this._instance;
    }

    public get userId(): number | undefined {
        if (this.isIframeMode() && this._iframeUserId !== -1) {
            return this._iframeUserId;
        }
        return this._config?.userId;
    }

    public isIframeMode(): boolean {
        return typeof window !== 'undefined' && window.parent !== window;
    }

    public initIframeBridge(): void {
        if (!this.isIframeMode() || this._bridgeInitialized) return;

        console.log('[WebSocketManager] Init iframe bridge mode');
        this._boundPostMessageHandler = this._onPostMessageReceived.bind(this);
        window.addEventListener('message', this._boundPostMessageHandler);
        this._bridgeInitialized = true;
        this.emitToFrontend('COCOS_READY', {});
    }

    private _onPostMessageReceived(event: MessageEvent): void {
        if (event.source && event.source !== window.parent) return;

        const message = event.data;
        if (!message) return;

        const action = this._resolveInboundAction(message);
        const payload = this._resolveInboundPayload(message);
        if (!action) return;

        this._captureIframeUserId(message, payload);

        this._dispatch(action, this._normalizeInboundPayload(action, payload));
    }

    public connect(config: IGameConfig): void {
        this._config = config;

        this.initIframeBridge();
        if (this.isIframeMode()) {
            console.log('[WebSocketManager] Running inside iframe, using postMessage bridge');
            return;
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
        if (this.isIframeMode()) return;
        this._stopPing();
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        this._isConnected = false;
    }

    public send(type: string, data?: any): void {
        if (this.isIframeMode()) {
            this.initIframeBridge();
            this.emitToFrontend('COCOS_SEND_WS', {
                action: type,
                data: data || {}
            });
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
        if (!list) return;

        const index = list.findIndex(item => item.callback === callback && item.target === target);
        if (index > -1) {
            list.splice(index, 1);
        }
    }

    public emitToFrontend(type: string, payload?: any): void {
        if (!this.isIframeMode()) return;

        const message: any = {
            type,
            payload: payload || {}
        };

        if (type !== 'COCOS_READY' && payload && typeof payload === 'object') {
            message.action = payload.action;
            message.data = payload.data;
        }

        window.parent.postMessage(message, this._getParentTargetOrigin());
    }

    private _onOpen(_event: Event): void {
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
            this._dispatch(msg.type, this._normalizeInboundPayload(msg.type, msg.data));
        } catch (e) {
            console.error('[WebSocket] Callback execution or parsing error:', e);
        }
    }

    private _resolveInboundAction(message: any): string | undefined {
        if (typeof message.action === 'string') {
            return message.action === 'GAME_START_DATA' ? 'S_ROOM_STATE' : message.action;
        }

        if (message.type === 'SERVER_INBOUND' && typeof message.action === 'string') {
            return message.action;
        }

        if (typeof message.type === 'string' && message.type.startsWith('S_')) {
            return message.type;
        }

        return undefined;
    }

    private _resolveInboundPayload(message: any): any {
        if (message.payload !== undefined) return message.payload;
        if (message.data !== undefined) return message.data;
        return {};
    }

    private _captureIframeUserId(message: any, payload: any): void {
        const candidates = [
            message?.userId,
            message?.myUserId,
            payload?.myUserId,
            payload?.currentUserId,
            payload?.userId,
            payload?.me?.userId,
            payload?.currentUser?.userId
        ];

        for (const value of candidates) {
            const numericValue = Number(value);
            if (!isNaN(numericValue) && numericValue > 0) {
                this._iframeUserId = numericValue;
                return;
            }
        }
    }

    private _getParentTargetOrigin(): string {
        try {
            if (document.referrer) {
                return new URL(document.referrer).origin;
            }
        } catch (e) {
            console.warn('[WebSocketManager] Cannot resolve parent origin, fallback to wildcard.', e);
        }
        return '*';
    }

    private _dispatch(type: string, data: any): void {
        const list = this._callbacks.get(type);
        if (!list) return;

        for (const item of list) {
            if (item.target) {
                item.callback.call(item.target, data);
            } else {
                item.callback(data);
            }
        }
    }

    private _normalizeInboundPayload(type: string, payload: any): any {
        if (!payload || typeof payload !== 'object') return payload;

        const normalized: any = { ...payload };
        if (type === 'S_DRAW') {
            if (typeof normalized.tileId !== 'number' && normalized.tile && typeof normalized.tile.tileId === 'number') {
                normalized.tileId = normalized.tile.tileId;
            }
            if (typeof normalized.wallCount !== 'number' && typeof normalized.remaining === 'number') {
                normalized.wallCount = normalized.remaining;
            }
        }

        if (type === 'S_ACTION_OPTIONS' && !Array.isArray(normalized.options) && Array.isArray(normalized.actions)) {
            normalized.options = normalized.actions;
        }

        return normalized;
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
