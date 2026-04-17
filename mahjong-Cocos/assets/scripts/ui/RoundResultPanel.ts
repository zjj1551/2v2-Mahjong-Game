import { _decorator, Component } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';
import { MessageType } from '../core/TileConstants';
const { ccclass } = _decorator;

/**
 * 结算数据抛出组件
 * 此组件不再渲染 Cocos UI 面板，而是将 WebSocket 的结算数据
 * 直接抛出给外部 HTML (通过 window.parent.postMessage)。
 */
@ccclass('RoundResultPanel')
export class RoundResultPanel extends Component {

    protected onLoad(): void {
        WebSocketManager.instance.on(MessageType.S_ROUND_RESULT, this._onRoundResult, this);
        WebSocketManager.instance.on(MessageType.S_GAME_OVER, this._onGameOver, this);
    }

    protected onDestroy(): void {
        WebSocketManager.instance.off(MessageType.S_ROUND_RESULT, this._onRoundResult);
        WebSocketManager.instance.off(MessageType.S_GAME_OVER, this._onGameOver);
    }

    private _onRoundResult(data: any): void {
        // 向外部 HTML iframe 或父窗口发送单局结算数据
        if (window && window.parent) {
            window.parent.postMessage({ type: 'S_ROUND_RESULT', data: data }, '*');
        }
        console.log('[RoundResultPanel] Post S_ROUND_RESULT to HTML');
    }

    private _onGameOver(data: any): void {
        // 向外部 HTML iframe 或父窗口发送对局结束数据
        if (window && window.parent) {
            window.parent.postMessage({ type: 'S_GAME_OVER', data: data }, '*');
        }
        console.log('[RoundResultPanel] Post S_GAME_OVER to HTML');
    }
}