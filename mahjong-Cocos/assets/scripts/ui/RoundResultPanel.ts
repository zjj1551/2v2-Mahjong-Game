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
        WebSocketManager.instance.off(MessageType.S_ROUND_RESULT, this._onRoundResult, this);
        WebSocketManager.instance.off(MessageType.S_GAME_OVER, this._onGameOver, this);
    }

    private _onRoundResult(data: any): void {
        WebSocketManager.instance.emitToFrontend('COCOS_EVENT', {
            action: MessageType.S_ROUND_RESULT,
            data
        });
        console.log('[RoundResultPanel] Post S_ROUND_RESULT to HTML');
    }

    private _onGameOver(data: any): void {
        WebSocketManager.instance.emitToFrontend('COCOS_EVENT', {
            action: MessageType.S_GAME_OVER,
            data
        });
        console.log('[RoundResultPanel] Post S_GAME_OVER to HTML');
    }
}
