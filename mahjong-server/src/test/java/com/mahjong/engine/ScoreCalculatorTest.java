package com.mahjong.engine;

import com.mahjong.model.Player;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ScoreCalculator 单元测试
 */
class ScoreCalculatorTest {

    /**
     * 创建4名测试玩家
     */
    private Player[] createPlayers() {
        Player[] players = new Player[4];
        for (int i = 0; i < 4; i++) {
            players[i] = new Player(i, 1000 + i, "测试" + i, "s" + i);
            players[i].setMissSuit(2); // 定缺条子
        }
        return players;
    }

    // ─── 番数计算测试 ────────────────────────────────────────

    @Nested
    @DisplayName("番数计算")
    class FanCalculationTests {

        @Test
        @DisplayName("平胡基础=1番")
        void calculate_pingHu_shouldBe1Fan() {
            Player winner = new Player(0, 1000, "测试", "s0");
            winner.setMissSuit(2);

            WinChecker.WinResult result = new WinChecker.WinResult();
            result.setQiDui(false);
            result.setQingYiSe(false);

            // 平胡、非自摸、无特殊番
            int score = ScoreCalculator.calculate(winner, result,
                    false, false, false, false, 0, 1);
            // 平胡1番 + 门清1番（无副露）= 2番 × 底分1 = 2
            assertEquals(2, score, "平胡+门清=2番×底分1=2分");
        }

        @Test
        @DisplayName("七对=2番")
        void calculate_qiDui_shouldBe2Fan() {
            Player winner = new Player(0, 1000, "测试", "s0");
            winner.setMissSuit(2);

            WinChecker.WinResult result = new WinChecker.WinResult();
            result.setQiDui(true);
            result.setDragonQiDui(false);
            result.setQingYiSe(false);

            int score = ScoreCalculator.calculate(winner, result,
                    false, false, false, false, 0, 1);
            // 七对2番 + 门清1番 = 3番
            assertEquals(3, score, "七对+门清=3番");
        }

        @Test
        @DisplayName("龙七对=4番")
        void calculate_dragonQiDui_shouldBe4Fan() {
            Player winner = new Player(0, 1000, "测试", "s0");
            winner.setMissSuit(2);

            WinChecker.WinResult result = new WinChecker.WinResult();
            result.setQiDui(true);
            result.setDragonQiDui(true);
            result.setQingYiSe(false);

            int score = ScoreCalculator.calculate(winner, result,
                    false, false, false, false, 0, 1);
            // 龙七对4番 + 门清1番 = 5番
            assertEquals(5, score, "龙七对+门清=5番");
        }

        @Test
        @DisplayName("清一色=8番（含平胡基础1+7）")
        void calculate_qingYiSe_shouldBe8Fan() {
            Player winner = new Player(0, 1000, "测试", "s0");
            winner.setMissSuit(2);

            WinChecker.WinResult result = new WinChecker.WinResult();
            result.setQiDui(false);
            result.setQingYiSe(true);

            int score = ScoreCalculator.calculate(winner, result,
                    false, false, false, false, 0, 1);
            // 平胡1番 + 清一色7番 + 门清1番 = 9番
            assertEquals(9, score, "平胡+清一色+门清=9番");
        }

        @Test
        @DisplayName("自摸额外+1番")
        void calculate_ziMo_shouldAddOneFan() {
            Player winner = new Player(0, 1000, "测试", "s0");
            winner.setMissSuit(2);

            WinChecker.WinResult result = new WinChecker.WinResult();
            result.setQiDui(false);
            result.setQingYiSe(false);

            int score = ScoreCalculator.calculate(winner, result,
                    true, false, false, false, 0, 1);
            // 平胡1番 + 自摸1番 + 门清1番 = 3番
            assertEquals(3, score, "平胡+自摸+门清=3番");
        }

        @Test
        @DisplayName("杠上花额外+1番")
        void calculate_gangShang_shouldAddOneFan() {
            Player winner = new Player(0, 1000, "测试", "s0");
            winner.setMissSuit(2);

            WinChecker.WinResult result = new WinChecker.WinResult();
            result.setQiDui(false);
            result.setQingYiSe(false);

            int score = ScoreCalculator.calculate(winner, result,
                    true, true, false, false, 0, 1);
            // 平胡1 + 自摸1 + 杠上花1 + 门清1 = 4番
            assertEquals(4, score, "平胡+自摸+杠上花+门清=4番");
        }

        @Test
        @DisplayName("4杠刮风翻倍")
        void calculate_guaFeng_shouldDouble() {
            Player winner = new Player(0, 1000, "测试", "s0");
            winner.setMissSuit(2);

            WinChecker.WinResult result = new WinChecker.WinResult();
            result.setQiDui(false);
            result.setQingYiSe(false);

            int score = ScoreCalculator.calculate(winner, result,
                    true, false, false, false, 4, 1);
            // (平胡1 + 自摸1 + 门清1) = 3番, 4杠翻倍 → 3×2=6番
            assertEquals(6, score, "3番×2(四杠)=6");
        }

        @Test
        @DisplayName("底分乘以番数")
        void calculate_baseScore_shouldMultiply() {
            Player winner = new Player(0, 1000, "测试", "s0");
            winner.setMissSuit(2);

            WinChecker.WinResult result = new WinChecker.WinResult();
            result.setQiDui(false);
            result.setQingYiSe(false);

            int score = ScoreCalculator.calculate(winner, result,
                    false, false, false, false, 0, 5);
            // 平胡1番 + 门清1番 = 2番 × 底分5 = 10
            assertEquals(10, score, "2番×底分5=10分");
        }
    }

    // ─── 结算测试 ────────────────────────────────────────────

    @Nested
    @DisplayName("得分结算")
    class SettleTests {

        @Test
        @DisplayName("自摸结算：其余3家各扣，胡牌者得3份")
        void settle_ziMo_shouldDistributeCorrectly() {
            Player[] players = createPlayers();
            int winScore = 10;

            ScoreCalculator.settle(players, 0, -1, winScore);

            assertEquals(30, players[0].getScore(), "胡牌者应得+30");
            assertEquals(-10, players[1].getScore(), "闲家1应扣-10");
            assertEquals(-10, players[2].getScore(), "闲家2应扣-10");
            assertEquals(-10, players[3].getScore(), "闲家3应扣-10");
        }

        @Test
        @DisplayName("点炮结算：出炮者独赔3份")
        void settle_dianPao_shouldChargeShooter() {
            Player[] players = createPlayers();
            int winScore = 10;

            ScoreCalculator.settle(players, 0, 2, winScore);

            assertEquals(30, players[0].getScore(), "胡牌者应得+30");
            assertEquals(0, players[1].getScore(), "闲家1不受影响");
            assertEquals(-30, players[2].getScore(), "出炮者应扣-30");
            assertEquals(0, players[3].getScore(), "闲家3不受影响");
        }

        @Test
        @DisplayName("所有玩家得分总和应为0（零和博弈）")
        void settle_sumShouldBeZero() {
            Player[] players = createPlayers();
            ScoreCalculator.settle(players, 1, -1, 5); // 自摸

            int sum = 0;
            for (Player p : players)
                sum += p.getScore();
            assertEquals(0, sum, "得分总和应为0");
        }
    }
}
