package com.mahjong.model;

import java.util.Objects;

/**
 * 麻将牌对象
 *
 * <p>
 * 编号规则（方便向听数数组索引）：
 * 
 * <pre>
 *   万子 1~9  → tileId =  0 + (point-1) = 0~8
 *   筒子 1~9  → tileId =  9 + (point-1) = 9~17
 *   条子 1~9  → tileId = 18 + (point-1) = 18~26
 * </pre>
 * 
 * 共 27 种牌，每种 4 张，全副 108 张。
 */
public class Tile {

    private final TileType type;
    /** 点数 1-9 */
    private final int point;
    /** 全局唯一编号 0~26，用于向听数计算的 int[] 索引 */
    private final int tileId;
    /** 同种牌的第几张（0~3），方便区分实体牌 */
    private int copyIndex;

    public Tile(TileType type, int point) {
        if (point < 1 || point > 9) {
            throw new IllegalArgumentException("点数必须为 1-9，当前: " + point);
        }
        this.type = type;
        this.point = point;
        this.tileId = type.getIndex() * 9 + (point - 1);
    }

    public Tile(TileType type, int point, int copyIndex) {
        this(type, point);
        this.copyIndex = copyIndex;
    }

    // ─── 工厂方法 ────────────────────────────────────────────

    /**
     * 根据 tileId (0~26) 创建牌对象
     */
    public static Tile fromId(int tileId, int copyIndex) {
        if (tileId < 0 || tileId > 26) {
            throw new IllegalArgumentException("tileId 必须为 0~26");
        }
        TileType type = TileType.fromIndex(tileId / 9);
        int point = tileId % 9 + 1;
        return new Tile(type, point, copyIndex);
    }

    // ─── Getters ─────────────────────────────────────────────

    public TileType getType() {
        return type;
    }

    public int getPoint() {
        return point;
    }

    public int getTileId() {
        return tileId;
    }

    public int getCopyIndex() {
        return copyIndex;
    }

    public void setCopyIndex(int copyIndex) {
        this.copyIndex = copyIndex;
    }

    // ─── 辅助方法 ─────────────────────────────────────────────

    /** 是否与另一张牌同种（type + point 相同） */
    public boolean isSameKind(Tile other) {
        return other != null && this.tileId == other.tileId;
    }

    @Override
    public String toString() {
        return point + type.getName();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (!(o instanceof Tile tile))
            return false;
        return tileId == tile.tileId && copyIndex == tile.copyIndex;
    }

    @Override
    public int hashCode() {
        return Objects.hash(tileId, copyIndex);
    }
}
