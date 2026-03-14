import { _decorator, Component, Node, Label, Sprite, resources, SpriteFrame } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PlayerUI')
export class PlayerUI extends Component {
    @property(Label)
    nicknameLabel: Label = null!;
    
    @property(Label)
    scoreLabel: Label = null!;

    @property(Sprite)
    avatarSprite: Sprite = null!;

    @property(Node)
    offlineMask: Node = null!; // 离线蒙层

    /**
     * 更新玩家信息展示
     * @param nickname 昵称
     * @param score 分数
     * @param online 是否在线
     */
    public updateInfo(nickname: string, score: number, online: boolean = true) {
        if (this.nicknameLabel) this.nicknameLabel.string = nickname;
        if (this.scoreLabel) this.scoreLabel.string = score.toString();
        if (this.offlineMask) this.offlineMask.active = !online;
    }

    /**
     * 设置定缺状态显示
     * @param suitIndex 0-2 (万筒条)
     */
    public showMissSuit(suitIndex: number) {
        // 逻辑：显示一个小图标在头像旁边标识已定缺
        console.log(`Player miss suit: ${suitIndex}`);
    }
}
