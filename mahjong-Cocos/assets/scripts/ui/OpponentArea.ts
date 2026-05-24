import { _decorator, Component, Node, Label, Prefab, instantiate, Sprite } from 'cc';
import { MahjongTile } from './MahjongTile';
import { DiscardRiver } from './DiscardRiver';
import { PlayerUI } from './PlayerUI';
const { ccclass, property } = _decorator;

/**
 * 对手玩家区域组件
 */
@ccclass('OpponentArea')
export class OpponentArea extends Component {

    @property(Label)
    labelNickname: Label = null!;

    @property(Label)
    labelScore: Label = null!;

    @property(Node)
    handContainer: Node = null!;

    @property(Node)
    meldContainer: Node = null!;

    @property(DiscardRiver)
    discardRiver: DiscardRiver = null!;

    @property(Prefab)
    tilePrefab: Prefab = null!;

    @property(Prefab)
    backTilePrefab: Prefab = null!;

    private _seatIndex: number = -1;
    private _handCount: number = 0;
    private _originalNickname: string = "";
    private _viewPosition: number = -1;
    private _cachedPlayerUI: PlayerUI | null = null;

    /** 初始化对手信息 */
    public init(seatIndex: number, nickname: string, handCount: number, viewPosition?: number, playerMeta?: any): void {
        this._seatIndex = seatIndex;
        this._handCount = handCount;
        this._originalNickname = nickname;
        this._cachedPlayerUI = null;
        if (viewPosition !== undefined) {
            this._viewPosition = viewPosition;
        }

        if (this.labelNickname) this.labelNickname.string = nickname;

        // 核心同步：头像与基本信息
        const ui = this._getPlayerUI();
        if (ui) {
            ui.updateInfo(
                nickname,
                this._resolvePlayerScore(playerMeta),
                playerMeta?.online !== false,
                playerMeta?.avatarChar,
                playerMeta?.avatarColor,
                playerMeta?.avatarUrl
            );
        } else {
            // 兜底逻辑：文字头像
            const labels = this.node.getComponentsInChildren(Label);
            for (const lb of labels) {
                const lname = lb.node.name.toLowerCase();
                if (lname.includes('avatar') || lname === 'label') {
                    if (lb !== this.labelNickname && lb !== this.labelScore) {
                        lb.string = nickname.charAt(0).toUpperCase();
                        break;
                    }
                }
            }
        }

        this._applyContainerAngles();
        this._refreshHandDisplay();
        this.discardRiver?.clear();
    }

    public updatePlayerMeta(player: any, score: number, suitName?: string): void {
        const nickname = player?.nickname || this._originalNickname || ('玩家' + this._seatIndex);
        this._originalNickname = nickname;
        if (this.labelNickname) this.labelNickname.string = nickname;

        const ui = this._getPlayerUI();
        if (ui) {
            ui.updateInfo(
                nickname,
                score,
                player?.online !== false,
                player?.avatarChar,
                player?.avatarColor,
                player?.avatarUrl
            );
            if (suitName !== undefined) {
                ui.setMissSuit(suitName);
            }
        } else {
            this.setScore(score);
            if (suitName !== undefined) {
                this.setMissSuit(suitName);
            }
        }
    }

    public onOpponentDraw(): void {
        this._handCount++;
        this._refreshHandDisplay();
    }

    public onOpponentDiscard(tileId: number): void {
        this._handCount = Math.max(0, this._handCount - 1);
        this._refreshHandDisplay();
        this.discardRiver?.addDiscard(tileId);
    }

    public onPeng(tileId: number): void {
        this._handCount = Math.max(0, this._handCount - 2);
        this._refreshHandDisplay();
        this._addMeld([tileId, tileId, tileId]);
    }

    public onChi(tileId: number, consumeTileIds: number[]): void {
        this._handCount = Math.max(0, this._handCount - 2);
        this._refreshHandDisplay();
        this._addMeld([...consumeTileIds, tileId].sort((a, b) => a - b));
    }

    public onGang(tileId: number, isAnGang: boolean): void {
        const cost = isAnGang ? 4 : 3;
        this._handCount = Math.max(0, this._handCount - cost);
        this._refreshHandDisplay();
        this._addMeld([tileId, tileId, tileId, tileId]);
    }

    /** 设置定缺色 */
    public setMissSuit(suitName: string): void {
        const ui = this._getPlayerUI();
        if (ui) {
            ui.setMissSuit(suitName);
        } else {
            // 兜底逻辑：在当前节点及其子节点中搜索
            const labels = this.node.getComponentsInChildren(Label);
            for (const lb of labels) {
                if (lb.node.name.toLowerCase().includes('miss')) {
                    if (suitName) {
                        lb.enabled = true;
                        lb.node.active = true;
                        switch (suitName) {
                            case 'Wan': lb.string = '缺万'; break;
                            case 'Tong': lb.string = '缺筒'; break;
                            case 'Tiao': lb.string = '缺条'; break;
                            default: lb.string = '缺' + suitName; break;
                        }
                    } else {
                        lb.enabled = false;
                    }
                    break;
                }
            }
        }
    }

    /** 更新分数 */
    public setScore(score: number): void {
        if (this.labelScore) {
            this.labelScore.string = score.toString();
        }
        const ui = this._getPlayerUI();
        if (ui && ui.scoreLabel) {
            ui.scoreLabel.string = score.toString();
        }
    }

    /** 设置庄家 */
    public setZhuang(isZhuang: boolean): void {
        const ui = this._getPlayerUI();
        if (ui) {
            ui.setZhuang(isZhuang);
        } else {
            const zhuangNode = this._findChildRecursive(this.node, ['zhuang', 'banker']);
            if (zhuangNode) {
                const sprite = zhuangNode.getComponent(Sprite);
                if (sprite) {
                    sprite.enabled = isZhuang;
                    zhuangNode.active = true;
                } else {
                    zhuangNode.active = isZhuang;
                }
            }
        }
    }

    /** 设置胡牌状态 */
    public setHu(isHu: boolean, text: string = '胡'): void {
        const ui = this._getPlayerUI();
        if (ui) {
            ui.setHu(isHu, text);
        } else {
            const huLabelNode = this._findChildRecursive(this.node, ['hu', 'status', 'result']);
            if (huLabelNode) {
                const lb = huLabelNode.getComponent(Label);
                if (lb) {
                    lb.enabled = isHu;
                    if (isHu) {
                        lb.node.active = true;
                        lb.string = text;
                    }
                }
            }
        }
    }

    public setResultBadge(text: string): void {
        const ui = this._getPlayerUI();
        if (ui) {
            ui.setResultBadge(text);
        } else {
            if (text) {
                this.setHu(true, text);
            } else {
                this.setHu(false);
            }
        }
    }

    public removeLastDiscard(tileId?: number): void {
        this.discardRiver?.removeLastDiscard(tileId);
    }

    private _refreshHandDisplay(): void {
        if (!this.handContainer || !this.backTilePrefab) return;
        this.handContainer.removeAllChildren();
        for (let i = 0; i < this._handCount; i++) {
            const node = instantiate(this.backTilePrefab);
            node.parent = this.handContainer;
            node.setScale(0.7, 0.7, 1);
        }
    }

    private _addMeld(tileIds: number[]): void {
        if (!this.meldContainer || !this.tilePrefab) return;
        for (const id of tileIds) {
            const node = instantiate(this.tilePrefab);
            node.parent = this.meldContainer;
            node.setScale(0.65, 0.65, 1);
            node.angle = this._getMeldTileAngle();
            node.getComponent(MahjongTile)?.init(id);
        }
    }

    private _applyContainerAngles(): void {
        if (this.handContainer) this.handContainer.angle = this._getHandTiltAngle();
        if (this.meldContainer) this.meldContainer.angle = this._getMeldRotationAngle();
    }

    private _getHandTiltAngle(): number {
        if (this.node.name.includes('Left')) return -15;
        if (this.node.name.includes('Right')) return 15;
        return 0;
    }

    private _getMeldRotationAngle(): number {
        if (this.node.name.includes('Right') || this.node.name.includes('Left')) return this._getHandTiltAngle();
        if (this.node.name.includes('Top')) return 180;
        return 0;
    }

    private _getMeldTileAngle(): number {
        if (this.node.name.includes('Right')) return 90;
        if (this.node.name.includes('Left')) return -90;
        return 0;
    }

    private _getPlayerUI(): PlayerUI | null {
        if (this._cachedPlayerUI && this._cachedPlayerUI.node?.isValid) return this._cachedPlayerUI;

        // 1. 本节点或子节点
        let ui = this.node.getComponent(PlayerUI) || this.node.getComponentInChildren(PlayerUI);
        if (ui) {
            this._cachedPlayerUI = ui;
            return ui;
        }

        // 2. 根据节点名称查找映射
        const mappedNodeName = this._getMappedPlayerItemName();
        if (mappedNodeName && this.node.parent) {
            const mappedNode = this.node.parent.getChildByName(mappedNodeName);
            ui = mappedNode ? mappedNode.getComponent(PlayerUI) : null;
            if (ui) {
                this._cachedPlayerUI = ui;
                return ui;
            }
        }

        // 3. 模糊匹配父节点的所有子节点
        if (this.node.parent) {
            const myNodeName = this.node.name.toLowerCase();
            let orientation = '';
            if (myNodeName.includes('left')) orientation = 'left';
            else if (myNodeName.includes('right')) orientation = 'right';
            else if (myNodeName.includes('top')) orientation = 'top';

            if (orientation) {
                const siblings = this.node.parent.getComponentsInChildren(PlayerUI);
                for (const siblingUI of siblings) {
                    const nodeName = siblingUI.node.name.toLowerCase();
                    if (nodeName.includes(orientation) && nodeName.includes('item')) {
                        this._cachedPlayerUI = siblingUI;
                        return siblingUI;
                    }
                }
            }
        }

        return null;
    }

    private _getMappedPlayerItemName(): string {
        if (this.node.name.includes('Right')) return 'PlayerItemRight';
        if (this.node.name.includes('Top')) return 'PlayerItemTop';
        if (this.node.name.includes('Left')) return 'PlayerItemLeft';
        return '';
    }

    private _resolvePlayerScore(player: any): number {
        const candidates = [player?.totalScore, player?.score, player?.userScore, player?.gold];
        for (const value of candidates) {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
        }
        return 0;
    }

    private _findChildRecursive(root: Node, names: string[]): Node | null {
        for (const child of root.children) {
            const childName = child.name.toLowerCase();
            for (const name of names) {
                if (childName.includes(name.toLowerCase())) {
                    return child;
                }
            }
            const found = this._findChildRecursive(child, names);
            if (found) return found;
        }
        return null;
    }

    public get seatIndex(): number { return this._seatIndex; }
}