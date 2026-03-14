package com.mahjong.engine;

import com.mahjong.model.Tile;
import com.mahjong.model.TileType;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 牌堆管理器
 *
 * <p>
 * 四川麻将全副108张：万子/筒子/条子各9种，每种4张，无字牌。
 * 使用 Fisher-Yates 洗牌算法保证随机性。
 */
public class TileManager {

    /** 全副牌张数 */
    public static final int TOTAL_TILES = 108;
    /** 牌种数（每花色9种点数 × 3花色） */
    public static final int TILE_TYPES = 27;
    /** 每种牌的数量 */
    public static final int COPY_PER_TYPE = 4;
    /** 每人初始手牌数 */
    public static final int INITIAL_HAND_SIZE = 13;
    /** 庄家初始手牌数 */
    public static final int BANKER_INITIAL_SIZE = 14;

    /**
     * 生成一副完整的洗好的108张牌
     *
     * @return 打乱后的牌列表（索引0为牌墙顶，发牌从头取）
     */
    public static List<Tile> createShuffledDeck() {
        List<Tile> deck = new ArrayList<>(TOTAL_TILES);

        // 生成全副牌
        for (TileType type : TileType.values()) {
            for (int point = 1; point <= 9; point++) {
                for (int copy = 0; copy < COPY_PER_TYPE; copy++) {
                    deck.add(new Tile(type, point, copy));
                }
            }
        }

        // Fisher-Yates 洗牌
        Collections.shuffle(deck);
        return deck;
    }

    /**
     * 发牌：庄家14张，其余三家各13张
     *
     * @param deck       打乱后的全副牌（108张）
     * @param hands      长度为4的手牌列表数组，索引对应座位号
     * @param bankerSeat 庄家座位号 (0~3)
     * @return 剩余牌墙（发完后剩余的牌）
     */
    public static List<Tile> deal(List<Tile> deck, List<List<Tile>> hands, int bankerSeat) {
        if (hands.size() != 4)
            throw new IllegalArgumentException("需要4个手牌列表");
        for (List<Tile> hand : hands)
            hand.clear();

        int idx = 0;
        // 非庄家各发13张
        for (int seat = 0; seat < 4; seat++) {
            if (seat == bankerSeat)
                continue;
            for (int i = 0; i < INITIAL_HAND_SIZE; i++) {
                hands.get(seat).add(deck.get(idx++));
            }
        }
        // 庄家发14张
        for (int i = 0; i < BANKER_INITIAL_SIZE; i++) {
            hands.get(bankerSeat).add(deck.get(idx++));
        }

        // 剩余牌墙
        return new ArrayList<>(deck.subList(idx, deck.size()));
    }

    /**
     * 验证牌堆完整性（测试用）：
     * 确认全副108张、每种牌恰好4张
     *
     * @param deck 待验证的牌列表
     * @return true = 完整
     */
    public static boolean verifyDeck(List<Tile> deck) {
        if (deck.size() != TOTAL_TILES)
            return false;
        int[] count = new int[TILE_TYPES];
        for (Tile t : deck) {
            count[t.getTileId()]++;
        }
        for (int c : count) {
            if (c != COPY_PER_TYPE)
                return false;
        }
        return true;
    }
}
