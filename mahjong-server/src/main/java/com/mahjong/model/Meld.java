package com.mahjong.model;

import java.util.List;

/**
 * 副露（面子组合）：碰、吃、明杠
 */
public class Meld {

    public enum MeldType {
        PENG, // 碰（3张相同）
        CHI, // 吃（3张顺子，四川麻将默认关闭吃牌，可配置）
        GANG // 明杠（4张相同，由对方打出触发）
    }

    private final MeldType type;
    /** 副露的所有牌 */
    private final List<Tile> tiles;
    /** 触发该副露的来源玩家座位（从哪家的打牌触发） */
    private final int fromSeat;

    public Meld(MeldType type, List<Tile> tiles, int fromSeat) {
        this.type = type;
        this.tiles = tiles;
        this.fromSeat = fromSeat;
    }

    public MeldType getType() {
        return type;
    }

    public List<Tile> getTiles() {
        return tiles;
    }

    public int getFromSeat() {
        return fromSeat;
    }

    @Override
    public String toString() {
        return type + ":" + tiles;
    }
}
