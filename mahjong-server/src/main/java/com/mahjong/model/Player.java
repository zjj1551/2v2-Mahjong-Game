package com.mahjong.model;

import java.util.ArrayList;
import java.util.List;

/**
 * 玩家模型
 * 包含手牌、副露（碰/杠/吃的面子）、定缺花色、胡牌状态等
 */
public class Player {

    /** 座位号 0~3（东南西北） */
    private final int seatIndex;
    /** 玩家唯一ID（对应数据库用户ID） */
    private long userId;
    /** 玩家昵称 */
    private String nickname;
    /** WebSocket会话ID */
    private String sessionId;
    /** 队伍 0=A队(0号+2号座位) 1=B队(1号+3号座位) */
    private int team;

    /** 手牌（未明牌） */
    private List<Tile> handTiles = new ArrayList<>();
    /** 副露区：碰/明杠/吃的面子组合 */
    private List<Meld> melds = new ArrayList<>();
    /** 暗杠列表（玩家自己的暗杠） */
    private List<List<Tile>> concealedKongs = new ArrayList<>();

    /** 定缺花色（0=万 1=筒 2=条），-1表示未定缺 */
    private int missSuit = -1;
    /** 是否已胡牌 */
    private boolean hu = false;
    /** 本局得分 */
    private int score = 0;
    /** 是否在线 */
    private boolean online = true;
    /** 是否已准备（等待游戏开始阶段） */
    private boolean ready = false;

    public Player(int seatIndex, long userId, String nickname, String sessionId) {
        this.seatIndex = seatIndex;
        this.userId = userId;
        this.nickname = nickname;
        this.sessionId = sessionId;
        this.team = seatIndex % 2; // 0、2号座位同队；1、3号座位同队
    }

    // ─── 手牌操作 ─────────────────────────────────────────────

    /** 摸一张牌加入手牌 */
    public void drawTile(Tile tile) {
        handTiles.add(tile);
    }

    /** 从手牌中打出一张牌（按 tileId 匹配，打第一张匹配的） */
    public Tile discardTile(int tileId) {
        for (int i = 0; i < handTiles.size(); i++) {
            if (handTiles.get(i).getTileId() == tileId) {
                return handTiles.remove(i);
            }
        }
        throw new IllegalArgumentException("手牌中没有 tileId=" + tileId + " 的牌");
    }

    /** 将手牌转换为向听数算法使用的 int[27] 计数数组 */
    public int[] toCountArray() {
        int[] count = new int[27];
        for (Tile t : handTiles) {
            count[t.getTileId()]++;
        }
        return count;
    }

    /** 检查手牌中某 tileId 的数量 */
    public int countTile(int tileId) {
        int cnt = 0;
        for (Tile t : handTiles) {
            if (t.getTileId() == tileId)
                cnt++;
        }
        return cnt;
    }

    /** 从手牌中移除指定数量的某种牌（用于碰/杠/吃操作） */
    public List<Tile> removeTiles(int tileId, int count) {
        List<Tile> removed = new ArrayList<>();
        List<Tile> remaining = new ArrayList<>();
        int removing = 0;
        for (Tile t : handTiles) {
            if (t.getTileId() == tileId && removing < count) {
                removed.add(t);
                removing++;
            } else {
                remaining.add(t);
            }
        }
        if (removed.size() != count) {
            throw new IllegalStateException("手牌不足，无法移除 " + count + " 张 tileId=" + tileId);
        }
        handTiles = remaining;
        return removed;
    }

    /** 是否定缺了该花色 */
    public boolean isMissSuit(int suitIndex) {
        return this.missSuit == suitIndex;
    }

    /** 检查手牌中是否含有定缺花色的牌（用于胡牌合法性校验） */
    public boolean hasMissSuitTile() {
        if (missSuit < 0)
            return false;
        for (Tile t : handTiles) {
            if (t.getType().getIndex() == missSuit)
                return true;
        }
        return false;
    }

    // ─── Getters / Setters ───────────────────────────────────

    public int getSeatIndex() {
        return seatIndex;
    }

    public long getUserId() {
        return userId;
    }

    public String getNickname() {
        return nickname;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public int getTeam() {
        return team;
    }

    public List<Tile> getHandTiles() {
        return handTiles;
    }

    public List<Meld> getMelds() {
        return melds;
    }

    public List<List<Tile>> getConcealedKongs() {
        return concealedKongs;
    }

    public int getMissSuit() {
        return missSuit;
    }

    public void setMissSuit(int missSuit) {
        this.missSuit = missSuit;
    }

    public boolean isHu() {
        return hu;
    }

    public void setHu(boolean hu) {
        this.hu = hu;
    }

    public int getScore() {
        return score;
    }

    public void addScore(int delta) {
        this.score += delta;
    }

    public boolean isOnline() {
        return online;
    }

    public void setOnline(boolean online) {
        this.online = online;
    }

    public boolean isReady() {
        return ready;
    }

    public void setReady(boolean ready) {
        this.ready = ready;
    }

    public void addMeld(Meld meld) {
        this.melds.add(meld);
    }

    public void addConcealedKong(List<Tile> kong) {
        this.concealedKongs.add(kong);
    }

    @Override
    public String toString() {
        return String.format("Player{seat=%d, nick=%s, handSize=%d, missSuit=%d, hu=%b}",
                seatIndex, nickname, handTiles.size(), missSuit, hu);
    }
}
