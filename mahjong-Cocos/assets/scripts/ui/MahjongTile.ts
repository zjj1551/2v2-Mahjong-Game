import { _decorator, Component, Sprite, SpriteFrame, resources, Label } from 'cc';
import { TILE_MAP } from '../core/TileConstants';

const { ccclass, property } = _decorator;

/**
 * 麻将牌组件
 * 负责显示麻将牌的正面图案，并处理资源动态加载
 */
@ccclass('MahjongTile')
export class MahjongTile extends Component {
    @property(Sprite)
    tileIcon: Sprite = null!; // 牌面图标 Sprite

    private _tileId: number = -1;

    protected onLoad() {
        // 如果没有手动分配 tileIcon，尝试寻找
        if (!this.tileIcon) {
            // 优先寻找名为 Icon 或 face 的子节点
            const iconNode = this.node.getChildByName('Icon') || this.node.getChildByName('icon') || 
                             this.node.getChildByName('Face') || this.node.getChildByName('face');
            
            if (iconNode) {
                this.tileIcon = iconNode.getComponent(Sprite)!;
            }
            
            // 如果还没找到，就拿第一个看到的 Sprite
            if (!this.tileIcon) {
                this.tileIcon = this.node.getComponent(Sprite) || this.node.getComponentInChildren(Sprite)!;
            }
        }
    }

    /**
     * 初始化麻将牌
     * @param id 麻将牌 ID (0-26)
     */
    public init(id: number) {
        this._tileId = id;
        this.updateView();
    }

    public get tileId(): number {
        return this._tileId;
    }

    /**
     * 更新牌面显示
     */
    private updateView() {
        const spriteName = TILE_MAP[this._tileId];
        if (!spriteName) {
            // console.warn('[MahjongTile] No sprite name for tileId:', this._tileId);
            return;
        }

        // Cocos Creator 3.x 动态加载 SpriteFrame 的路径格式
        const path = 'textures/mj/' + spriteName + '/spriteFrame';
        
        resources.load(path, SpriteFrame, (err, sf) => {     
            if (err) {
                // console.error(`[MahjongTile] Failed to load tile texture: ${path}`, err);
                return;
            }
            if (this.tileIcon && this.node && this.node.isValid) {
                this.tileIcon.spriteFrame = sf;
            }
        });
    }
}
