package com.mahjong.engine;

import com.mahjong.model.Meld;
import com.mahjong.model.Player;
import com.mahjong.model.Tile;
import com.mahjong.model.TileType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * WinChecker 单元测试
 */
class WinCheckerTest {

    /**
     * 创建一个测试用玩家，给定手牌 tileId 列表
     */
    private Player createPlayer(int seatIndex, int missSuit, int... tileIds) {
        Player player = new Player(seatIndex, 1000 + seatIndex, "测试" + seatIndex, "s" + seatIndex);
        player.setMissSuit(missSuit);
        for (int id : tileIds) {
            player.drawTile(Tile.fromId(id, 0));
        }
        return player;
    }

    @Test
    @DisplayName("自摸场景下 winTile 已在手牌中，应使用不补牌判定")
    void checkWin_selfDrawTileAlreadyInHand_shouldUseNoAppendMode() {
        // 14张完整和牌：123万 456万 789万 123筒 + 44筒
        Player player = createPlayer(0, 2,
                0, 1, 2,
                3, 4, 5,
                6, 7, 8,
                9, 10, 11,
                12, 12);

        Tile drawnWinTile = Tile.fromId(12, 0);

        WinChecker.WinResult selfDrawResult = WinChecker.checkWin(player, drawnWinTile, false);
        assertNotNull(selfDrawResult, "自摸时应可胡牌");

        WinChecker.WinResult appendModeResult = WinChecker.checkWin(player, drawnWinTile, true);
        assertNull(appendModeResult, "若错误地重复补入胡牌，应判定失败");
    }

    // ─── 普通胡牌测试 ────────────────────────────────────────

    @Nested
    @DisplayName("普通胡牌判定")
    class NormalWinTests {

        @Test
        @DisplayName("4面子+1雀头应能胡牌（平胡）")
        void checkWin_normalHu_shouldWin() {
            // 手牌：1万2万3万 4万5万6万 7万8万9万 1筒1筒 + 胡牌2筒 需要再加一组
            // 简化：手牌有12张（含3组面子+1对雀头候选），加1张胡牌凑满
            // 构造：1万2万3万(顺) 4万5万6万(顺) 7万8万9万(顺) 1筒1筒(雀头) → 共12张，
            // 加上已有1个meld(副露)的话手牌可以少3张
            // 直接构造无副露13张手牌 + 1张胡牌的情况
            // 手牌: 1万2万3万 4万5万6万 7万8万9万 1筒1筒1筒2筒 → 13张
            // 胡牌: 3筒 → 凑成1筒2筒3筒顺 + 1筒雀头? 不对，1筒已经用了3张
            // 换：手牌: 0,1,2, 3,4,5, 6,7,8, 9,9,10,11 → 13张
            // 胡牌: 12 → 10,11,12顺子 + 9,9雀头 ✓
            Player player = createPlayer(0, 2, // 定缺条子
                    0, 1, 2, // 1万2万3万
                    3, 4, 5, // 4万5万6万
                    6, 7, 8, // 7万8万9万
                    9, 9, 10, 11 // 1筒1筒2筒3筒 → 13张
            );
            Tile winTile = Tile.fromId(12, 0); // 4筒

            WinChecker.WinResult result = WinChecker.checkWin(player, winTile);
            assertNotNull(result, "应能胡牌");
            assertFalse(result.isQiDui(), "不是七对");
        }

        @Test
        @DisplayName("不满足面子+雀头条件不能胡")
        void checkWin_invalidHand_shouldNotWin() {
            // 随意给牌，不能组成面子+雀头
            Player player = createPlayer(0, 2,
                    0, 2, 4, 6, 8, // 全奇数万子
                    9, 11, 13, 15, 17, // 全奇数筒子
                    0, 1, 3 // 13张
            );
            Tile winTile = Tile.fromId(5, 0);

            WinChecker.WinResult result = WinChecker.checkWin(player, winTile);
            assertNull(result, "不应能胡牌");
        }
    }

    // ─── 七对测试 ────────────────────────────────────────────

    @Nested
    @DisplayName("七对判定")
    class QiDuiTests {

        @Test
        @DisplayName("7组对子应能胡七对")
        void checkWin_qiDui_shouldWin() {
            // 手牌: 7对 → 14张（13手牌+1胡牌）
            // 0,0, 1,1, 2,2, 3,3, 4,4, 5,5, 6,6 → 13张（6.5对）
            // 不对——需要13张手牌 + 1张胡牌 = 7对
            // 手牌: 0,0, 1,1, 2,2, 3,3, 4,4, 5,5, 6 → 13张（6对+半对）
            // 胡牌: 6 → 凑成第7对
            Player player = createPlayer(0, 2, // 定缺条子
                    0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6 // 13张
            );
            Tile winTile = Tile.fromId(6, 1); // 再来一个7万

            WinChecker.WinResult result = WinChecker.checkWin(player, winTile);
            assertNotNull(result, "应能胡七对");
            assertTrue(result.isQiDui(), "应为七对");
            assertFalse(result.isDragonQiDui(), "不是龙七对");
        }

        @Test
        @DisplayName("龙七对（含四张相同）应能胡")
        void checkWin_dragonQiDui_shouldWin() {
            // 手牌: 0,0,0,0(4张1万算两对), 1,1, 2,2, 3,3, 4,4, 5 → 13张
            // 胡牌: 5 → 第7对
            Player player = createPlayer(0, 2,
                    0, 0, 0, 0, // 4张1万 = 两对
                    1, 1, 2, 2, 3, 3, 4, 4, 5 // 13张
            );
            Tile winTile = Tile.fromId(5, 1);

            WinChecker.WinResult result = WinChecker.checkWin(player, winTile);
            assertNotNull(result, "应能胡龙七对");
            assertTrue(result.isQiDui(), "应为七对");
            assertTrue(result.isDragonQiDui(), "应为龙七对");
        }
    }

    // ─── 清一色测试 ───────────────────────────────────────────

    @Nested
    @DisplayName("清一色判定")
    class QingYiSeTests {

        @Test
        @DisplayName("全万子手牌应判定为清一色")
        void checkWin_qingYiSe_shouldDetect() {
            // 全万子: 0~8 中组面子+雀头
            // 手牌: 0,0,0, 1,2,3, 4,5,6, 7,7,7,8 → 13张
            // 胡牌: 8 → 7,8+8不行。。→ 7,7雀头 + 0,0,0刻 + 1,2,3顺 + 4,5,6顺 + 7,8,8不行
            // 换: 0,1,2, 3,4,5, 6,7,8, 0,0,0,1 → 胡牌:1 → 0,1,2顺+3,4,5顺+6,7,8顺+0,0刻?不对
            // 简化: 0,0, 1,1,1, 2,2,2, 3,3,3, 4,4 → 13张, 胡牌: 0 → 0,0,0刻+4,4雀头+1,2,3两个刻?不对
            // 手牌: 0,1,2, 3,4,5, 6,7,8, 0,0,1,2 → 胡 0: 凑0,0,0刻+1,2,1,2→不行
            // 直接: 手牌 0,0,1,2,3,4,5,6,7,8,8,8,6 → 胡6: 6,6雀头+0,1,2顺+3,4,5顺+6,7,8顺+8,8刻?不够
            // 最简单: 手牌 0,0,0, 2,3,4, 5,6,7, 1,1,1,8 → 胡8: 8,8?只有一个8
            // OK最终: 手牌有1个meld副露
            Player player = createPlayer(0, 1, // 定缺筒子
                    0, 1, 2, // 1万2万3万
                    3, 4, 5, // 4万5万6万
                    6, 7, 8, // 7万8万9万
                    0 // 1万 → 共10张手牌
            );
            // 添加一个碰面子（万子的碰）
            List<Tile> meldTiles = List.of(
                    Tile.fromId(8, 1), Tile.fromId(8, 2), Tile.fromId(8, 3));
            player.addMeld(new Meld(Meld.MeldType.PENG, new ArrayList<>(meldTiles), 1));

            Tile winTile = Tile.fromId(0, 1); // 1万

            WinChecker.WinResult result = WinChecker.checkWin(player, winTile);
            assertNotNull(result, "应能胡牌");
            assertTrue(result.isQingYiSe(), "应为清一色");
        }
    }

    // ─── 定缺限制测试 ────────────────────────────────────────

    @Nested
    @DisplayName("定缺限制")
    class MissSuitTests {

        @Test
        @DisplayName("手牌含定缺花色不能胡")
        void checkWin_hasMissSuitTile_shouldNotWin() {
            // 定缺万子(0)，但手牌含万子
            Player player = createPlayer(0, 0, // 定缺万子
                    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 11);
            Tile winTile = Tile.fromId(12, 0);

            WinChecker.WinResult result = WinChecker.checkWin(player, winTile);
            assertNull(result, "含定缺花色不能胡牌");
        }

        @Test
        @DisplayName("胡的牌是定缺花色也不能胡")
        void checkWin_winTileIsMissSuit_shouldNotWin() {
            // 定缺万子(0)，手牌不含万子，但胡的牌是万子
            Player player = createPlayer(0, 0,
                    9, 10, 11, 12, 13, 14, 15, 16, 17, 9, 9, 10, 11);
            Tile winTile = Tile.fromId(0, 0); // 万子

            WinChecker.WinResult result = WinChecker.checkWin(player, winTile);
            assertNull(result, "胡牌为定缺花色不能胡");
        }

        @Test
        @DisplayName("未定缺不能胡牌")
        void checkWin_notSelectedMissSuit_shouldNotWin() {
            Player player = createPlayer(0, -1, // 未定缺
                    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 11);
            Tile winTile = Tile.fromId(12, 0);

            WinChecker.WinResult result = WinChecker.checkWin(player, winTile);
            assertNull(result, "未定缺不能胡牌");
        }
    }

    // ─── 碰/杠判定测试 ───────────────────────────────────────

    @Nested
    @DisplayName("碰/杠判定")
    class PengGangTests {

        @Test
        @DisplayName("手牌有2张相同应能碰")
        void canPeng_hasTwoPairs_shouldReturnTrue() {
            Player player = createPlayer(0, 2, 5, 5, 1, 2, 3);
            Tile tile = Tile.fromId(5, 2);
            assertTrue(WinChecker.canPeng(player, tile));
        }

        @Test
        @DisplayName("手牌只有1张相同不能碰")
        void canPeng_hasOnlyOne_shouldReturnFalse() {
            Player player = createPlayer(0, 2, 5, 1, 2, 3);
            Tile tile = Tile.fromId(5, 2);
            assertFalse(WinChecker.canPeng(player, tile));
        }

        @Test
        @DisplayName("手牌有3张相同应能明杠")
        void canMingGang_hasThree_shouldReturnTrue() {
            Player player = createPlayer(0, 2, 5, 5, 5, 1, 2);
            Tile tile = Tile.fromId(5, 3);
            assertTrue(WinChecker.canMingGang(player, tile));
        }

        @Test
        @DisplayName("手牌有4张相同应能暗杠")
        void canAnGang_hasFour_shouldReturnTrue() {
            Player player = createPlayer(0, 2, 5, 5, 5, 5, 1);
            assertTrue(WinChecker.canAnGang(player, 5));
        }

        @Test
        @DisplayName("已碰的牌又摸到应能补杠")
        void canBuGang_hasPengAndDrawn_shouldReturnTrue() {
            Player player = createPlayer(0, 2, 1, 2, 3);
            // 添加碰面子
            List<Tile> meldTiles = new ArrayList<>(List.of(
                    Tile.fromId(5, 0), Tile.fromId(5, 1), Tile.fromId(5, 2)));
            player.addMeld(new Meld(Meld.MeldType.PENG, meldTiles, 1));

            Tile drawn = Tile.fromId(5, 3);
            assertTrue(WinChecker.canBuGang(player, drawn));
        }
    }

    // ─── 向听数 & 听牌测试 ───────────────────────────────────

    @Nested
    @DisplayName("向听数和听牌")
    class ShantenTests {

        @Test
        @DisplayName("已胡牌手牌向听数应为-1")
        void calcShanten_completedHand_shouldBeNegativeOne() {
            // 4面子+1雀头的完整手牌(14张对应的计数)
            int[] counts = new int[27];
            // 1万2万3万 + 4万5万6万 + 7万8万9万 + 1筒1筒(雀头) + 2筒3筒4筒
            counts[0] = 1;
            counts[1] = 1;
            counts[2] = 1; // 1万2万3万
            counts[3] = 1;
            counts[4] = 1;
            counts[5] = 1; // 4万5万6万
            counts[6] = 1;
            counts[7] = 1;
            counts[8] = 1; // 7万8万9万
            counts[9] = 2; // 1筒1筒（雀头）
            counts[10] = 1;
            counts[11] = 1;
            counts[12] = 1; // 2筒3筒4筒

            int shanten = WinChecker.calcShanten(counts, 0);
            assertEquals(-1, shanten, "完整胡牌向听数应为-1");
        }

        @Test
        @DisplayName("听牌手牌向听数应为0")
        void calcShanten_tenpai_shouldBeZero() {
            // 差一张就能胡的手牌
            int[] counts = new int[27];
            // 1万2万3万 + 4万5万6万 + 7万8万9万 + 1筒 → 差1筒雀头
            counts[0] = 1;
            counts[1] = 1;
            counts[2] = 1;
            counts[3] = 1;
            counts[4] = 1;
            counts[5] = 1;
            counts[6] = 1;
            counts[7] = 1;
            counts[8] = 1;
            counts[9] = 1; // 1筒（需要再来一个1筒凑雀头）
            counts[10] = 1;
            counts[11] = 1;
            counts[12] = 1; // 2筒3筒4筒

            int shanten = WinChecker.calcShanten(counts, 0);
            assertEquals(0, shanten, "听牌向听数应为0");
        }

        @Test
        @DisplayName("14张出牌回合应能给出听牌提示")
        void getTingTiles_discardTurn_shouldReturnWaitingTiles() {
            // 123万 456万 789万 123筒 + 45筒（14张）
            // 打4筒听5筒，打5筒听4筒。
            Player player = createPlayer(0, 2,
                    0, 1, 2,
                    3, 4, 5,
                    6, 7, 8,
                    9, 10, 11,
                    12, 13);

            List<Integer> tingTiles = WinChecker.getTingTiles(player);
            assertTrue(tingTiles.contains(12), "应提示可听4筒");
            assertTrue(tingTiles.contains(13), "应提示可听5筒");
        }
    }
}
