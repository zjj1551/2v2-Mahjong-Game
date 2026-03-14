package com.mahjong.model;

import java.util.*;

/**
 * 游戏房间
 * 管理房间内的玩家列表、房间配置及游戏状态
 */
public class Room {

    /** 房间唯一ID */
    private final String roomId;
    /** 房间名称 */
    private String roomName;
    /** 创建者userId */
    private long creatorId;

    /** 底分（默认1分） */
    private int baseScore = 1;
    /** 是否允许吃牌（四川麻将通常不允许吃） */
    private boolean allowChi = false;
    /** 是否启用刮风下雨（四杠加倍/四杠加倍） */
    private boolean enableFengYu = true;
    /** 最大局数 */
    private int maxRounds = 8;

    /** 座位 -> 玩家，4个座位（0=东 1=南 2=西 3=北） */
    private final Map<Integer, Player> players = new LinkedHashMap<>();

    /** 已进入房间但尚未就座的玩家：userId -> nickname */
    private final Map<Long, String> lobbyUsers = new LinkedHashMap<>();

    /** 当前游戏状态机 */
    private GameState gameState;

    /** 当前进行到第几局 */
    private int currentRound = 0;

    /** 房间状态 */
    public enum RoomStatus {
        WAITING, // 等待玩家加入
        READY, // 4人满座，等待开始
        PLAYING, // 对战中
        FINISHED // 比赛结束
    }

    private RoomStatus status = RoomStatus.WAITING;

    public Room(String roomId, String roomName, long creatorId) {
        this.roomId = roomId;
        this.roomName = roomName;
        this.creatorId = creatorId;
    }

    // ─── 玩家管理 ─────────────────────────────────────────────

    /**
     * 进入房间大厅（未就座）。若已就座则跳过。
     * @return true 表示成功进入或已在房间内；false 表示房间不接受新玩家
     */
    public boolean enterLobby(long userId, String nickname) {
        if (status == RoomStatus.PLAYING || status == RoomStatus.FINISHED) return false;
        if (getPlayerByUserId(userId) != null) return true; // 已就座，无需重复加入大厅
        lobbyUsers.put(userId, nickname);
        return true;
    }

    /**
     * 选择座位入座。若玩家已就其他座位，会先自动起身。
     * @param userId   操作用户ID
     * @param seatIndex 目标座位(0-3)
     * @param sessionId 当前会话ID
     * @return 实际分配座位号；-1=座位已被他人占用；-2=用户不在房间；-3=游戏已开始；-4=无效座位号
     */
    public int chooseSeat(long userId, int seatIndex, String sessionId) {
        if (seatIndex < 0 || seatIndex >= 4) return -4;
        if (status == RoomStatus.PLAYING || status == RoomStatus.FINISHED) return -3;

        // 目标座位已被其他人占用
        Player occupant = players.get(seatIndex);
        if (occupant != null && occupant.getUserId() != userId) return -1;

        // 获取玩家当前信息
        String nickname;
        Player currentSeated = getPlayerByUserId(userId);
        if (currentSeated != null) {
            if (currentSeated.getSeatIndex() == seatIndex) return seatIndex; // 已在目标座位
            nickname = currentSeated.getNickname();
            players.remove(currentSeated.getSeatIndex());
            if (status == RoomStatus.READY) status = RoomStatus.WAITING;
        } else {
            nickname = lobbyUsers.get(userId);
            if (nickname == null) return -2; // 不在房间内
            lobbyUsers.remove(userId);
        }

        Player player = new Player(seatIndex, userId, nickname, sessionId);
        players.put(seatIndex, player);
        if (players.size() == 4) status = RoomStatus.READY;
        return seatIndex;
    }

    /** 从座位起身，回到大厅 */
    public boolean leaveSeat(long userId) {
        Player p = getPlayerByUserId(userId);
        if (p == null) return false;
        players.remove(p.getSeatIndex());
        lobbyUsers.put(userId, p.getNickname());
        if (status == RoomStatus.READY) status = RoomStatus.WAITING;
        return true;
    }

    /** 完全离开房间（座位+大厅均删除） */
    public boolean leaveRoom(long userId) {
        lobbyUsers.remove(userId);
        Player p = getPlayerByUserId(userId);
        if (p != null) {
            players.remove(p.getSeatIndex());
            if (status == RoomStatus.READY) status = RoomStatus.WAITING;
        }
        return true;
    }

    /** 设置玩家的准备状态，返回设置后的实际状态 */
    public boolean setReady(long userId, boolean ready) {
        Player p = getPlayerByUserId(userId);
        if (p == null) return false;
        p.setReady(ready);
        return true;
    }

    /** 判断是否 4 个座位全部就座且全部已准备 */
    public boolean isAllReady() {
        if (players.size() < 4) return false;
        return players.values().stream().allMatch(Player::isReady);
    }

    /** 获取大厅中未就座的用户映射（userId -> nickname，只读） */
    public Map<Long, String> getLobbyUsers() {
        return Collections.unmodifiableMap(lobbyUsers);
    }

    /** 判断房间是否完全没有任何人（座位+大厅） */
    public boolean isEmpty() {
        return players.isEmpty() && lobbyUsers.isEmpty();
    }

    /** 尝试加入房间，返回分配的座位号；满座返回 -1 */
    @Deprecated
    public int join(Player player) {
        for (int seat = 0; seat < 4; seat++) {
            if (!players.containsKey(seat)) {
                players.put(seat, player);
                if (players.size() == 4) {
                    status = RoomStatus.READY;
                }
                return seat;
            }
        }
        return -1; // 满座
    }

    /** 玩家离开房间 */
    public boolean leave(long userId) {
        Iterator<Map.Entry<Integer, Player>> it = players.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<Integer, Player> entry = it.next();
            if (entry.getValue().getUserId() == userId) {
                it.remove();
                if (status == RoomStatus.READY) {
                    status = RoomStatus.WAITING;
                }
                return true;
            }
        }
        return false;
    }

    /** 获取所有玩家列表（按座位号顺序） */
    public List<Player> getPlayerList() {
        List<Player> list = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            if (players.containsKey(i))
                list.add(players.get(i));
        }
        return list;
    }

    /** 根据座位号获取玩家 */
    public Player getPlayer(int seat) {
        return players.get(seat);
    }

    /** 根据userId获取玩家 */
    public Player getPlayerByUserId(long userId) {
        return players.values().stream()
                .filter(p -> p.getUserId() == userId)
                .findFirst().orElse(null);
    }

    /** 根据sessionId获取玩家 */
    public Player getPlayerBySession(String sessionId) {
        return players.values().stream()
                .filter(p -> sessionId.equals(p.getSessionId()))
                .findFirst().orElse(null);
    }

    public boolean isFull() {
        return players.size() == 4;
    }

    // ─── Getters / Setters ───────────────────────────────────

    public String getRoomId() {
        return roomId;
    }

    public String getRoomName() {
        return roomName;
    }

    public long getCreatorId() {
        return creatorId;
    }

    public void setCreatorId(long creatorId) {
        this.creatorId = creatorId;
    }

    public int getBaseScore() {
        return baseScore;
    }

    public void setBaseScore(int baseScore) {
        this.baseScore = baseScore;
    }

    public boolean isAllowChi() {
        return allowChi;
    }

    public void setAllowChi(boolean allowChi) {
        this.allowChi = allowChi;
    }

    public boolean isEnableFengYu() {
        return enableFengYu;
    }

    public void setEnableFengYu(boolean enableFengYu) {
        this.enableFengYu = enableFengYu;
    }

    public int getMaxRounds() {
        return maxRounds;
    }

    public void setMaxRounds(int maxRounds) {
        this.maxRounds = maxRounds;
    }

    public GameState getGameState() {
        return gameState;
    }

    public void setGameState(GameState gameState) {
        this.gameState = gameState;
    }

    public RoomStatus getStatus() {
        return status;
    }

    public void setStatus(RoomStatus status) {
        this.status = status;
    }

    public int getCurrentRound() {
        return currentRound;
    }

    public void incrementRound() {
        this.currentRound++;
    }

    @Override
    public String toString() {
        return String.format("Room{id=%s, name=%s, players=%d, status=%s}",
                roomId, roomName, players.size(), status);
    }
}
