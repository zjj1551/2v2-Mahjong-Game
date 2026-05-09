import { _decorator, Component, Sprite, SpriteFrame, resources, error } from 'cc';
import { TILE_MAP } from '../core/TileConstants';
const { ccclass, property } = _decorator;

@ccclass('MahjongTile')
export class MahjongTile extends Component {
    @property(Sprite)
    tileIcon: Sprite = null!;

    private _tileId: number = -1;

    public init(id: number) {
        this._tileId = id;
        this.updateView();
    }

    public get tileId(): number {
        return this._tileId;
    }

    private updateView() {
        const spriteName = TILE_MAP[this._tileId];
        if (!spriteName) return;

        const path = `textures/mj/${spriteName}/spriteFrame`;
        resources.load(path, SpriteFrame, (err, sf) => {
            if (err) return;
            if (this.tileIcon && this.node.isValid) {
                this.tileIcon.spriteFrame = sf;
            }
        });
    }
}
