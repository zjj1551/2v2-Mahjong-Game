import { _decorator, Component, Node, Label } from 'cc';
import { WebSocketManager } from '../network/WebSocketManager';
import { MessageType } from '../core/TileConstants';
const { ccclass, property } = _decorator;

interface PlayerScore {
    seatIndex: number;
    nickname: string;
    delta: number;    // 本局得分变化
    fanCount: number; // 番数
    fanDetails: string[];
}

/**
 * 单局结算面板
 *
 * 节点结构：
 * RoundResultPanel
 * ├── Label_Title         ("本局结算")
 * ├── ScoreContainer      (4行玩家得分)
 * │   ├── Label_Score_0
 * │   ├── Label_Score_1
 * │   ├── Label_Score_2
 * │   └── Label_Score_3
 * ├── Label_WinnerInfo    ("东家 自摸 清一色 8番")
 * └── Btn_Continue        ("继续" 按钮)
 */
@ccclass('RoundResultPanel')
export class RoundResultPanel extends Component {

    @property(Node)
    panel: Node = null!;

    @property([Label])
    scoreLabels: Label[] = [];  // 长度4，对应0-3号座位

    @property(Label)
    labelWinnerInfo: Label = null!;

    @property(Label)
    labelTitle: Label = null!;

    protected onLoad(): void {
        if (this.panel) this.panel.active = false;
        WebSocketManager.instance.on(MessageType.S_ROUND_RESULT, this._onRoundResult, this);
        WebSocketManager.instance.on(MessageType.S_GAME_OVER, this._onGameOver, this);
    }

    protected onDestroy(): void {
        WebSocketManager.instance.off(MessageType.S_ROUND_RESULT, this._onRoundResult);
        WebSocketManager.instance.off(MessageType.S_GAME_OVER, this._onGameOver);
    }

    private _onRoundResult(data: any): void {
        this._show(data, '本局结算');
    }

    private _onGameOver(data: any): void {
        this._show(data, '对局结束');
    }

    private _show(data: any, title: string): void {
        if (this.panel) this.panel.active = true;
        if (this.labelTitle) this.labelTitle.string = title;

        // data.scores: [{seatIndex, nickname, delta, fanCount, fanDetails}]
        const scores: PlayerScore[] = data?.scores ?? [];
        scores.forEach((s) => {
            const label = this.scoreLabels[s.seatIndex];
            if (label) {
                const sign = s.delta >= 0 ? '+' : '';
                label.string = `${s.nickname}: ${sign}${s.delta}分 (${s.fanCount}番)`;
                // 输家显示红色，赢家显示金色
                label.color = s.delta >= 0
                    ? new (label.color.constructor as any)(255, 215, 0, 255)
                    : new (label.color.constructor as any)(255, 80, 80, 255);
            }
        });

        // 显示赢家详情
        const winner = scores.find(s => s.delta > 0);
        if (winner && this.labelWinnerInfo) {
            const details = winner.fanDetails?.join(' · ') ?? '';
            this.labelWinnerInfo.string = `${winner.nickname} ${details} ${winner.fanCount}番`;
        }
    }

    /** "继续"按钮回调 */
    public onContinueClick(): void {
        if (this.panel) this.panel.active = false;
    }
}
