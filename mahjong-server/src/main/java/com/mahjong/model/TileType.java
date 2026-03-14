package com.mahjong.model;

/**
 * 麻将牌种类枚举
 * 四川麻将不含风牌和箭牌（东南西北中发白）
 */
public enum TileType {

    /** 万子（字符牌） */
    WAN("万", 0),

    /** 筒子（圆牌） */
    TONG("筒", 1),

    /** 条子（竹牌） */
    TIAO("条", 2);

    private final String name;
    /** 花色索引，用于定缺判断 */
    private final int index;

    TileType(String name, int index) {
        this.name = name;
        this.index = index;
    }

    public String getName() {
        return name;
    }

    public int getIndex() {
        return index;
    }

    public static TileType fromIndex(int index) {
        for (TileType t : values()) {
            if (t.index == index)
                return t;
        }
        throw new IllegalArgumentException("无效花色索引: " + index);
    }

    @Override
    public String toString() {
        return name;
    }
}
