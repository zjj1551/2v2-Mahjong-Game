package com.mahjong.engine;

import com.mahjong.model.Player;
import com.mahjong.engine.WinChecker.WinResult;

/**
 * 番数计算器（四川双打竞技麻将）
 *
 * <p>番型与分值（底分*番数）：
 * <ul>
 *   <li>平胡        = 1番（基础）</li>
 *   <li>清一色      = 8番（清一色含平胡）</li>
 *   <li>七对        = 2番</li>
 *   <li>龙七对      = 4番（豪华七对）</li>
 *   <li>自摸        额外 +1番</li>
 *   <li>门清        额外 +1番（无副露胡牌）</li>
 *   <li>杠上花      额外 +1番（杠后摸牌胡）</li>
 *   <li>抢杠胡      额外 +1番（对方补杠时胡）</li>
 *   <li>海底捞月    额外 +1番（最后一张牌自摸胡）</li>
 *   <li>刮风下雨    全局番数翻倍（4杠时生效）</li>
 * </ul>
 */
public class ScoreCalculator {

    /**
     * 计算胡牌番数
     *
     * @param winner       胡牌玩家
     * @param result       胡牌结果（牌型信息）
     * @param isTuMo       是否自摸
     * @param isGangShang  是否杠上花（杠后摸牌胡）
     * @param isQiangGang  是否抢杠胡
     * @param isHaiDi      是否海底捞月
     * @param totalGangs   当前全局杠的总数量
     * @param baseScore    底分
     * @return 该玩家本局得分（底分 × 番数）
     */
    public static int calculate(Player winner, WinResult result,
                                 boolean isTuMo, boolean isGangShang,
                                 boolean isQiangGang, boolean isHaiDi,
                                 int totalGangs, int baseScore) {

        int fan = 0; // 番数

        // ── 基础番型 ────────────────────────────────────────
        if (result.isQiDui()) {
            fan += result.isDragonQiDui() ? 4 : 2; // 龙七对4番，普通七对2番
        } else {
            fan += 1; // 平胡基础1番
        }

        if (result.isQingYiSe()) {
            fan += 7; // 清一色在平胡1番基础上再加7番，共8番
        }

        // ── 加分番型 ────────────────────────────────────────
        if (isTuMo) {
            fan += 1; // 自摸 +1番
        }

        // 门清：无副露（碰/吃/明杠）胡牌额外+1
        boolean isMenQing = winner.getMelds().isEmpty();
        if (isMenQing) {
            fan += 1;
        }

        if (isGangShang) {
            fan += 1; // 杠上花 +1番
        }

        if (isQiangGang) {
            fan += 1; // 抢杠胡 +1番
        }

        if (isHaiDi) {
            fan += 1; // 海底捞月 +1番
        }

        // ── 全局翻倍：刮风下雨 ─────────────────────────────
        // 四川麻将：4杠=刮风（番数×2），8杠=下雨（番数×4）
        if (totalGangs >= 8) {
            fan *= 4;
        } else if (totalGangs >= 4) {
            fan *= 2;
        }

        return baseScore * fan;
    }

    /**
     * 结算本局全体玩家得分（血战到底规则）
     *
     * <p>得分规则：
     * <ul>
    *   <li>点炮/自摸/队友点炮：只扣对方队伍的两名玩家，每人 -N 分</li>
    *   <li>胡牌者最终入账 +2N 分（与对方两名玩家各扣一份相对应）</li>
     * </ul>
     *
     * @param players    4位玩家数组（座位0~3）
     * @param winnerSeat 胡牌玩家座位
     * @param loserSeat  出炮玩家座位（自摸时传入 -1）
     * @param winScore   该局胡牌计算出的得分（单人份）
     */
    public static void settle(Player[] players, int winnerSeat, int loserSeat, int winScore) {
        // 简化规则：所有结算仅扣对方队伍的两名玩家，且平均扣除。
        // 胡牌者入账为两份（+2 * winScore），对方队伍的每位玩家各扣一份（-winScore）。
        int winnerTeam = players[winnerSeat].getTeam();
        for (int i = 0; i < 4; i++) {
            if (players[i].getTeam() != winnerTeam) {
                players[i].addScore(-winScore);
            }
        }
        // 胡牌者获得两份
        players[winnerSeat].addScore(winScore * 2);
    }
}
