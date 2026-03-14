package com.mahjong.engine;

import com.mahjong.model.Tile;
import com.mahjong.model.TileType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TileManager 单元测试
 */
class TileManagerTest {

    @Test
    @DisplayName("洗牌后应生成108张牌")
    void createShuffledDeck_shouldReturn108Tiles() {
        List<Tile> deck = TileManager.createShuffledDeck();
        assertEquals(TileManager.TOTAL_TILES, deck.size(), "牌数必须为108");
    }

    @RepeatedTest(5)
    @DisplayName("洗牌后的牌堆应通过完整性校验")
    void createShuffledDeck_shouldPassVerification() {
        List<Tile> deck = TileManager.createShuffledDeck();
        assertTrue(TileManager.verifyDeck(deck), "每种牌应恰好4张");
    }

    @Test
    @DisplayName("洗牌后每种花色应有36张牌（9点数×4张）")
    void createShuffledDeck_eachSuitShouldHave36() {
        List<Tile> deck = TileManager.createShuffledDeck();
        int[] suitCount = new int[3];
        for (Tile t : deck) {
            suitCount[t.getType().getIndex()]++;
        }
        assertEquals(36, suitCount[0], "万子应有36张");
        assertEquals(36, suitCount[1], "筒子应有36张");
        assertEquals(36, suitCount[2], "条子应有36张");
    }

    @Test
    @DisplayName("发牌：庄家应得14张，其余各13张")
    void deal_bankerGets14_othersGet13() {
        List<Tile> deck = TileManager.createShuffledDeck();
        List<List<Tile>> hands = new ArrayList<>();
        for (int i = 0; i < 4; i++)
            hands.add(new ArrayList<>());

        int bankerSeat = 0;
        List<Tile> wall = TileManager.deal(deck, hands, bankerSeat);

        assertEquals(TileManager.BANKER_INITIAL_SIZE, hands.get(0).size(), "庄家应有14张");
        assertEquals(TileManager.INITIAL_HAND_SIZE, hands.get(1).size(), "闲家1应有13张");
        assertEquals(TileManager.INITIAL_HAND_SIZE, hands.get(2).size(), "闲家2应有13张");
        assertEquals(TileManager.INITIAL_HAND_SIZE, hands.get(3).size(), "闲家3应有13张");

        // 手牌+牌墙 = 108
        int totalDealt = hands.stream().mapToInt(List::size).sum();
        assertEquals(TileManager.TOTAL_TILES, totalDealt + wall.size(), "手牌+牌墙应=108");
    }

    @Test
    @DisplayName("发牌：不同庄家座位号应正确分配")
    void deal_differentBankerSeats() {
        for (int bankerSeat = 0; bankerSeat < 4; bankerSeat++) {
            List<Tile> deck = TileManager.createShuffledDeck();
            List<List<Tile>> hands = new ArrayList<>();
            for (int i = 0; i < 4; i++)
                hands.add(new ArrayList<>());

            TileManager.deal(deck, hands, bankerSeat);

            for (int seat = 0; seat < 4; seat++) {
                int expected = (seat == bankerSeat) ? TileManager.BANKER_INITIAL_SIZE : TileManager.INITIAL_HAND_SIZE;
                assertEquals(expected, hands.get(seat).size(),
                        "庄家=" + bankerSeat + "时，seat=" + seat + "手牌数不正确");
            }
        }
    }

    @Test
    @DisplayName("发牌后牌墙剩余应为108-14-13×3=55")
    void deal_wallShouldHave55Remaining() {
        List<Tile> deck = TileManager.createShuffledDeck();
        List<List<Tile>> hands = new ArrayList<>();
        for (int i = 0; i < 4; i++)
            hands.add(new ArrayList<>());

        List<Tile> wall = TileManager.deal(deck, hands, 0);
        assertEquals(55, wall.size(), "牌墙应剩余55张");
    }

    @Test
    @DisplayName("verifyDeck对不完整牌堆应返回false")
    void verifyDeck_incompleteDeck_shouldReturnFalse() {
        List<Tile> deck = TileManager.createShuffledDeck();
        deck.remove(0); // 移除一张牌
        assertFalse(TileManager.verifyDeck(deck));
    }

    @Test
    @DisplayName("牌的tileId范围应为0~26")
    void tiles_shouldHaveValidTileIds() {
        List<Tile> deck = TileManager.createShuffledDeck();
        for (Tile t : deck) {
            assertTrue(t.getTileId() >= 0 && t.getTileId() <= 26,
                    "tileId应在0~26范围内，实际: " + t.getTileId());
        }
    }
}
