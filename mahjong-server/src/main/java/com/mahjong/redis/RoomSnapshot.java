package com.mahjong.redis;

import com.mahjong.model.Player;
import com.mahjong.model.Room;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 房间快照，用于 Redis/缓存层存储与回放。
 */
public class RoomSnapshot {

    private String roomId;
    private String roomName;
    private long creatorId;
    private String status;
    private int currentRound;
    private int maxRounds;
    private int baseScore;
    private boolean allowChi;
    private boolean enableFengYu;
    private List<Map<String, Object>> seats;
    private Map<Long, String> lobbyUsers;
    private Instant updatedAt;

    public static RoomSnapshot fromRoom(Room room) {
        RoomSnapshot snapshot = new RoomSnapshot();
        snapshot.setRoomId(room.getRoomId());
        snapshot.setRoomName(room.getRoomName());
        snapshot.setCreatorId(room.getCreatorId());
        snapshot.setStatus(room.getStatus().name());
        snapshot.setCurrentRound(room.getCurrentRound());
        snapshot.setMaxRounds(room.getMaxRounds());
        snapshot.setBaseScore(room.getBaseScore());
        snapshot.setAllowChi(room.isAllowChi());
        snapshot.setEnableFengYu(room.isEnableFengYu());

        List<Map<String, Object>> seatList = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Player p = room.getPlayer(i);
            Map<String, Object> seat = new LinkedHashMap<>();
            seat.put("seatIndex", i);
            seat.put("occupied", p != null);
            if (p != null) {
                seat.put("userId", p.getUserId());
                seat.put("nickname", p.getNickname());
                seat.put("team", p.getTeam());
                seat.put("online", p.isOnline());
                seat.put("ready", p.isReady());
            }
            seatList.add(seat);
        }
        snapshot.setSeats(seatList);
        snapshot.setLobbyUsers(new LinkedHashMap<>(room.getLobbyUsers()));
        snapshot.setUpdatedAt(Instant.now());
        return snapshot;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public String getRoomName() {
        return roomName;
    }

    public void setRoomName(String roomName) {
        this.roomName = roomName;
    }

    public long getCreatorId() {
        return creatorId;
    }

    public void setCreatorId(long creatorId) {
        this.creatorId = creatorId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getCurrentRound() {
        return currentRound;
    }

    public void setCurrentRound(int currentRound) {
        this.currentRound = currentRound;
    }

    public int getMaxRounds() {
        return maxRounds;
    }

    public void setMaxRounds(int maxRounds) {
        this.maxRounds = maxRounds;
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

    public List<Map<String, Object>> getSeats() {
        return seats;
    }

    public void setSeats(List<Map<String, Object>> seats) {
        this.seats = seats;
    }

    public Map<Long, String> getLobbyUsers() {
        return lobbyUsers;
    }

    public void setLobbyUsers(Map<Long, String> lobbyUsers) {
        this.lobbyUsers = lobbyUsers;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
