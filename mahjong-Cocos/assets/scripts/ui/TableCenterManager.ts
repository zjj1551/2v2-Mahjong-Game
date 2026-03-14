import { _decorator, Component, Node, Sprite, SpriteFrame, resources, Label, error } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TableCenterManager')
export class TableCenterManager extends Component {
    @property(Node)
    dirNodes: Node[] = []; // 方位节点数组，顺序：0-东, 1-南, 2-西, 3-北

    @property(Sprite)
    tensDigit: Sprite = null!; // 十位数 Sprite

    @property(Sprite)
    onesDigit: Sprite = null!; // 个位数 Sprite

    private _countdown: number = 0;
    private _timer: any = null;

    /**
     * 设置当前活跃方位
     * @param seatIndex 0-3
     */
    public setActiveDirection(seatIndex: number) {
        this.dirNodes.forEach((node, index) => {
            node.active = (index === seatIndex);
        });
    }

    /**
     * 开始倒计时
     * @param seconds 秒数
     */
    public startCountdown(seconds: number) {
        this._countdown = seconds;
        this.updateCountdownDisplay();
        
        if (this._timer) clearInterval(this._timer);
        
        this._timer = setInterval(() => {
            this._countdown--;
            if (this._countdown <= 0) {
                this._countdown = 0;
                clearInterval(this._timer);
            }
            this.updateCountdownDisplay();
        }, 1000);
    }

    private updateCountdownDisplay() {
        const tens = Math.floor(this._countdown / 10);
        const ones = this._countdown % 10;

        this.setNumberSprite(this.tensDigit, tens);
        this.setNumberSprite(this.onesDigit, ones);
    }

    private setNumberSprite(sprite: Sprite, num: number) {
        // 使用红色数字
        const path = `textures/number_red/${num}/spriteFrame`;
        resources.load(path, SpriteFrame, (err, sf) => {
            if (err) {
                error(`Failed to load number sprite: ${path}`);
                return;
            }
            sprite.spriteFrame = sf;
        });
    }

    protected onDestroy() {
        if (this._timer) clearInterval(this._timer);
    }
}
