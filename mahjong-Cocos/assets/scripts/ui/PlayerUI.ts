import { _decorator, Component, Node, Label, Sprite } from 'cc';

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
    offlineMask: Node = null!;

    @property(Node)
    zhuangIcon: Node = null!;

    @property(Label)
    missSuitLabel: Label = null!;

    protected onLoad() {
        const node = (this as any).node;
        if (!this.zhuangIcon) {
            this.zhuangIcon = node ? node.getChildByName('ZhuangIcon') : null;
        }
        if (!this.missSuitLabel) {
            const missNode = node ? node.getChildByName('MissSuitLabel') : null;
            if (missNode) {
                this.missSuitLabel = missNode.getComponent(Label);
            }
        }
        if (this.missSuitLabel) {
            this.missSuitLabel.node.active = false;
        }
        if (this.zhuangIcon) {
            this.zhuangIcon.active = false;
        }
    }

    public updateInfo(nickname: string, score: number, online: boolean = true) {
        if (this.nicknameLabel) {
            this.nicknameLabel.string = nickname;
        }
        if (this.scoreLabel) {
            this.scoreLabel.string = score.toString();
        }
        if (this.offlineMask) {
            this.offlineMask.active = !online;
        }
    }

    public setZhuang(isZhuang: boolean) {
        if (this.zhuangIcon) {
            this.zhuangIcon.active = isZhuang;
        }
    }

    public setMissSuit(suitName: string) {
        if (!this.missSuitLabel) return;

        if (suitName) {
            this.missSuitLabel.node.active = true;
            this.missSuitLabel.string = 'Miss ' + suitName;
        } else {
            this.missSuitLabel.node.active = false;
        }
    }
}
