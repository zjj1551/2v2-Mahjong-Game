package com.mahjong.model;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * 单局游戏状态
 * 记录一局牌的所有运行时数据：牌墙、当前轮到谁出牌、最后打出的牌、各玩家状态等
 */
public class GameState {

    // ── 游戏阶段枚举 ─────────────────────────────────────────
    public enum Phase {
        /** 发牌阶段 */
        DEALING,
        /** 定缺阶段（所有玩家选择弃一门花色） */
        SELECTING_MISS_SUIT,
        /** 主循环：摸牌-出牌 */
        PLAYING,
        /** 有人胡牌后（血战到底模式下继续打） */
        BLOOD_BATTLE,
        /** 本局结束结算 */
        SETTLING,
        /** 全局比赛结束 */
        GAME_OVER
    }

    private Phase phase = Phase.DEALING;

    /** 当前轮到操作的座位号（0~3） */
    private int currentSeat = 0;
    /** 庄家座位号 */
    private int bankerSeat = 0;

    /** 牌墙（剩余待摸的牌，使用队列） */
    private final Deque<Tile> wall = new ArrayDeque<>();

    /** 最后打出（或摸出）的牌，供其他玩家判断是否碰/杠/胡 */
    private Tile lastDiscardedTile = null;
    /** 最后打牌的座位号 */
    private int lastDiscardSeat = -1;

    /** 弃牌河（按座位存储，用于回放/观战） */
    private final java.util.Map<Integer, java.util.List<Tile>> discardPiles = new java.util.HashMap<>();

    /** 四杠数量（全局）：用于判断"刮风下雨" */
    private int totalGangCount = 0;

    /** 已胡牌人数（血战到底计数） */
    private int huCount = 0;
    /** 定缺选择计数（所有人选完才进入 PLAYING） */
    private int missSuitSelectedCount = 0;

    /** 当前等待操作的玩家（摸牌后等待打牌，或他人打牌后等待碰/杠/胡声明） */
    private int awaitingSeat = -1;

    public GameState(int bankerSeat, List<Player> players) {
        this.bankerSeat = bankerSeat;
        this.currentSeat = bankerSeat; // 庄家先摸牌
        for (Player p : players) {
            discardPiles.put(p.getSeatIndex(), new java.util.ArrayList<>());
        }
    }

    // ─── 牌墙操作 ─────────────────────────────────────────────

    /** 将洗好的牌加入牌墙 */
    public void fillWall(List<Tile> tiles) {
        wall.clear();
        wall.addAll(tiles);
    }

    /** 摸一张牌，返回牌；牌墙摸完返回 null */
    public Tile draw() {
        return wall.pollFirst();
    }

    /** 剩余牌墙张数 */
    public int remainingWall() {
        return wall.size();
    }

    /** 记录打出的牌 */
    public void recordDiscard(int seat, Tile tile) {
        this.lastDiscardedTile = tile;
        this.lastDiscardSeat = seat;
        discardPiles.get(seat).add(tile);
    }

    /** 下一个摸牌座位（顺时针：0→1→2→3→0） */
    public int nextSeat(int seat) {
        return (seat + 1) % 4;
    }

    // ─── Getters / Setters ───────────────────────────────────

    public Phase getPhase() {
        return phase;
    }

    public void setPhase(Phase phase) {
        this.phase = phase;
    }

    public int getCurrentSeat() {
        return currentSeat;
    }

    public void setCurrentSeat(int currentSeat) {
        this.currentSeat = currentSeat;
    }

    public int getBankerSeat() {
        return bankerSeat;
    }

    public Tile getLastDiscardedTile() {
        return lastDiscardedTile;
    }

    public int getLastDiscardSeat() {
        return lastDiscardSeat;
    }

    public java.util.Map<Integer, java.util.List<Tile>> getDiscardPiles() {
        return discardPiles;
    }

    public int getTotalGangCount() {
        return totalGangCount;
    }

    public void incrementGangCount() {
        this.totalGangCount++;
    }

    public int getHuCount() {
        return huCount;
    }

    public void incrementHuCount() {
        this.huCount++;
    }

    public int getMissSuitSelectedCount() {
        return missSuitSelectedCount;
    }

    public void incrementMissSuitSelected() {
        this.missSuitSelectedCount++;
    }

    public int getAwaitingSeat() {
        return awaitingSeat;
    }

    public void setAwaitingSeat(int awaitingSeat) {
        this.awaitingSeat = awaitingSeat;
    }
}
