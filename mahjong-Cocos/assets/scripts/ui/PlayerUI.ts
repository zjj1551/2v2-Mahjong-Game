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

    @property(Node)
    zhuangIcon: Node = null!; // 庄家图标

    @property(Label)
    missSuitLabel: Label = null!; // 定缺标识图标(文本)

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
     * 设置是否为庄家
     * @param isZhuang 是否为庄家
     */
    public setZhuang(isZhuang: boolean) {
        if (this.zhuangIcon) {
            this.zhuangIcon.active = isZhuang;
        }
    }

    /**
     * 设置定缺状态显示
     * @param suitName 花色名称 (如 "万", "筒", "条")，传空字符串表示隐藏
     */
    public setMissSuit(suitName: string) {
        if (this.missSuitLabel) {
            if (suitName) {
                this.missSuitLabel.node.active = true;
                this.missSuitLabel.string = `缺${suitName}`;
            } else {
                this.missSuitLabel.node.active = false;
            }
        }
    }
}
