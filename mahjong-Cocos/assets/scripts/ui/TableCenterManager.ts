import { _decorator, Component, Node, Sprite, SpriteFrame, resources, error, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TableCenterManager')
export class TableCenterManager extends Component {
    @property(Node)
    dirNodes: Node[] = []; // 方位节点数组，顺序：0-东, 1-南, 2-西, 3-北

    @property(Sprite)
    tensDigit: Sprite = null!; // 十位数 Sprite

    @property(Sprite)
    onesDigit: Sprite = null!; // 个位数 Sprite

    @property(Sprite)
    bgSprite: Sprite = null!; // 底盘背景

    @property(Sprite)
    middleSprite: Sprite = null!; // 非高亮的东南西北字

    private _countdown: number = 0;
    private _timer: any = null;
    private _localSeatIndex: number = 0;
    private _directionSlots: Vec3[] = [];
    private _directionBaseAngles: number[] = [];
    private _middleBaseAngle: number = 0;

    protected onLoad() {
        this._captureDirectionSlots();
        this._captureDirectionBaseAngles();
        this.loadStaticSprite(this.bgSprite, 'textures/dir/dir_bg/spriteFrame');
        this.loadStaticSprite(this.middleSprite, 'textures/dir/middle/spriteFrame');
        this._layoutDirectionsForLocalSeat();
    }

    private loadStaticSprite(sprite: Sprite, path: string) {
        if (!sprite) return;
        resources.load(path, SpriteFrame, (err, sf) => {
            if (!err && sprite.isValid) {
                sprite.spriteFrame = sf;
            }
        });
    }

    /**
     * 设置当前活跃方位
     * @param seatIndex 0-3
     */
    public setLocalSeatIndex(seatIndex: number) {
        if (seatIndex < 0 || seatIndex > 3) return;
        this._localSeatIndex = seatIndex;
        this._captureDirectionSlots();
        this._captureDirectionBaseAngles();
        this._layoutDirectionsForLocalSeat();
    }

    public setActiveDirection(seatIndex: number) {
        if (seatIndex < 0 || seatIndex > 3) return;
        this.dirNodes.forEach((node, index) => {
            node.active = (index === seatIndex);
        });
    }

    private _layoutDirectionsForLocalSeat() {
        if (this._directionSlots.length !== this.dirNodes.length) return;
        if (this._directionBaseAngles.length !== this.dirNodes.length) {
            this._captureDirectionBaseAngles();
        }

        const rotationOffset = -this._localSeatIndex * 90;
        if (this.middleSprite?.node) {
            this.middleSprite.node.angle = this._middleBaseAngle + rotationOffset;
        }

        this.dirNodes.forEach((node, absoluteSeat) => {
            const relativeSeat = (absoluteSeat - this._localSeatIndex + 4) % 4;
            const slot = this._directionSlots[relativeSeat];
            if (slot) {
                node.setPosition(slot);
            }
            const baseAngle = this._directionBaseAngles[absoluteSeat] ?? 0;
            node.angle = baseAngle + rotationOffset;
        });
    }

    private _captureDirectionSlots() {
        if (this._directionSlots.length === this.dirNodes.length) return;
        this._directionSlots = this.dirNodes.map(node => node.position.clone());
    }

    private _captureDirectionBaseAngles() {
        if (this._directionBaseAngles.length === this.dirNodes.length) return;
        this._directionBaseAngles = this.dirNodes.map(node => node.angle);
        this._middleBaseAngle = this.middleSprite?.node?.angle ?? 0;
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

        // 倒计时 <= 3 秒时，数字变红以示警告
        const colorFolder = this._countdown <= 3 ? 'number_red' : 'number_blue';

        this.setNumberSprite(this.tensDigit, tens, colorFolder);
        this.setNumberSprite(this.onesDigit, ones, colorFolder);
    }

    private setNumberSprite(sprite: Sprite, num: number, folderName: string) {
        if (!sprite) return;
        const path = `textures/${folderName}/${num}/spriteFrame`;
        resources.load(path, SpriteFrame, (err, sf) => {
            if (err) {
                error(`Failed to load number sprite: ${path}`);
                return;
            }
            if (sprite.isValid) {
                sprite.spriteFrame = sf;
            }
        });
    }

    protected onDestroy() {
        if (this._timer) clearInterval(this._timer);
    }
}
