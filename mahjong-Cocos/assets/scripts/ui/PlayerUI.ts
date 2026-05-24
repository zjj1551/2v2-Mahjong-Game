import { _decorator, Component, Node, Label, Sprite, Color, assetManager, ImageAsset, SpriteFrame, Texture2D, UITransform } from 'cc';

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

    @property(Label)
    huLabel: Label = null!;

    private _fallbackSpriteFrame: SpriteFrame | null = null;

    protected onLoad() {
        const node = this.node;
        if (this.avatarSprite) {
            this._fallbackSpriteFrame = this.avatarSprite.spriteFrame;
        }

        // 自动寻找组件
        this._ensureZhuangIcon();
        
        if (!this.missSuitLabel) {
            const missNode = this._findChildRecursive(node, ['MissSuitLabel', 'misssuitlabel', 'MissSuit', 'missSuitLabel']);
            if (missNode) {
                this.missSuitLabel = missNode.getComponent(Label);
            }
        }
        if (!this.huLabel) {
            const huNode = this._findChildRecursive(node, ['HuLabel', 'Hu', 'hulabel', 'huicon', 'flag_hu', 'HuStatus']);
            if (huNode) {
                this.huLabel = huNode.getComponent(Label);
            }
        }

        // 初始化时隐藏
        this.setMissSuit("");
        this.setZhuang(false);
        this.setHu(false);
    }

    private _ensureZhuangIcon() {
        if (!this.zhuangIcon) {
            this.zhuangIcon = this._findChildRecursive(this.node, ['ZhuangIcon', 'zhuangicon', 'BankerIcon', 'banker', 'Zhuang', 'img_banker', 'Zhuang Icon', 'zhuang_icon']);
        }
    }

    public updateInfo(nickname: string, score: number, online: boolean = true, avatarChar?: string, avatarColor?: string, avatarUrl?: string) {
        if (this.nicknameLabel) {
            this.nicknameLabel.string = nickname;
        }
        if (this.scoreLabel) {
            this.scoreLabel.string = score.toString();
        }
        if (this.offlineMask) {
            this.offlineMask.active = !online;
        }

        this.setAvatar(avatarUrl);
    }

    public setAvatar(avatarUrl?: string) {
        const cleanUrl = avatarUrl ? avatarUrl.trim() : '';

        if (cleanUrl) {
            this._showImageAvatar(cleanUrl);
            return;
        }

        this._showFallbackAvatar();
    }

    public setAvatarText(text: string) {
        this._showFallbackAvatar();
    }

    public setAvatarColor(avatarColor?: string) {
        const color = this._parseColor(avatarColor);
        if (!color) return;

        if (this.avatarSprite) {
            this.avatarSprite.color = color;
        }
    }

    public setZhuang(isZhuang: boolean) {
        this._ensureZhuangIcon();
        
        if (this.zhuangIcon) {
            const label = this.zhuangIcon.getComponent(Label);
            if (label) {
                label.enabled = isZhuang;
                this.zhuangIcon.active = true;
            } else {
                this.zhuangIcon.active = isZhuang;
            }
        }
    }

    public setMissSuit(suitName: string) {
        if (!this.missSuitLabel) {
            const labels = this.node.getComponentsInChildren(Label);
            for (const lb of labels) {
                if (lb.node.name.toLowerCase().includes('miss')) {
                    this.missSuitLabel = lb;
                    break;
                }
            }
        }

        if (!this.missSuitLabel) return;

        if (suitName) {
            this.missSuitLabel.enabled = true;
            this.missSuitLabel.node.active = true;
            this.missSuitLabel.string = this._toMissSuitText(suitName);
        } else {
            this.missSuitLabel.enabled = false;
        }
    }

    public setHu(isHu: boolean, text: string = '胡') {
        if (!this.huLabel) {
            const labels = this.node.getComponentsInChildren(Label);
            for (const lb of labels) {
                const lname = lb.node.name.toLowerCase();
                if (lname.includes('hu') || lname.includes('status') || lname.includes('result')) {
                    this.huLabel = lb;
                    break;
                }
            }
        }
        if (!this.huLabel) return;

        this.huLabel.enabled = isHu;
        if (isHu) {
            this.huLabel.node.active = true;
            this.huLabel.string = text || '胡';
        }
    }

    public setResultBadge(text: string) {
        if (!this.huLabel) return;

        if (text) {
            this.huLabel.enabled = true;
            this.huLabel.node.active = true;
            this.huLabel.string = text;
        } else {
            this.huLabel.enabled = false;
        }
    }

    private _toMissSuitText(suitName: string): string {
        switch (suitName) {
            case 'Wan': return '缺万';
            case 'Tong': return '缺筒';
            case 'Tiao': return '缺条';
            default: return '缺' + suitName;
        }
    }

    private _findChildRecursive(root: Node, names: string[]): Node | null {
        for (const child of root.children) {
            const childName = child.name.toLowerCase();
            for (const name of names) {
                if (childName === name.toLowerCase()) {
                    return child;
                }
            }
            const found = this._findChildRecursive(child, names);
            if (found) return found;
        }
        return null;
    }

    private _showImageAvatar(avatarUrl: string) {
        if (!this.avatarSprite) return;
        this.avatarSprite.node.active = true;
        this.avatarSprite.enabled = true;

        assetManager.loadRemote<ImageAsset>(avatarUrl, (err, imageAsset) => {
            if (err || !imageAsset || !this.avatarSprite || !this.avatarSprite.node?.isValid) {
                this._showFallbackAvatar();
                return;
            }

            const texture = new Texture2D();
            texture.image = imageAsset;
            const frame = new SpriteFrame();
            frame.texture = texture;
            this.avatarSprite.spriteFrame = frame;
            this.avatarSprite.color = Color.WHITE;
        });
    }

    private _showFallbackAvatar() {
        if (this.avatarSprite && this._fallbackSpriteFrame) {
            this.avatarSprite.node.active = true;
            this.avatarSprite.enabled = true;
            this.avatarSprite.spriteFrame = this._fallbackSpriteFrame;
            this.avatarSprite.color = Color.WHITE;
        }
    }

    private _parseColor(value?: string): Color | null {
        if (!value) return null;

        const normalized = value.trim();
        const hex = normalized.startsWith('#') ? normalized.substring(1) : normalized;
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;

        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return new Color(r, g, b, 255);
    }
}
