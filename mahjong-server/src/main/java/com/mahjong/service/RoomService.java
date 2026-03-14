package com.mahjong.service;

import com.mahjong.model.Player;
import com.mahjong.model.Room;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 房间管理服务
 *
 * <p>所有房间数据存放在内存中（ConcurrentHashMap），
 * 不落库（对局记录由 GameService 负责持久化）。
 */
@Service
public class RoomService {

    /** roomId -> Room */
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    /** sessionId -> roomId：记录每个 WebSocket 连接所在的房间 */
    private final Map<String, String> sessionRoomMap = new ConcurrentHashMap<>();

    /** userId -> sessionId：记录在线用户的 WebSocket 会话 */
    private final Map<Long, String> userSessionMap = new ConcurrentHashMap<>();

    // ─── 房间 CRUD ────────────────────────────────────────────

    /**
     * 创建房间
     *
     * @param roomName  房间名称
     * @param creatorId 创建者 userId
     * @return 新创建的 Room 对象
     */
    public Room createRoom(String roomName, long creatorId) {
        String roomId = "R" + System.currentTimeMillis() + creatorId;
        Room room = new Room(roomId, roomName, creatorId);
        rooms.put(roomId, room);
        return room;
    }

    /**
     * 根据 roomId 获取房间
     */
    public Room getRoom(String roomId) {
        return rooms.get(roomId);
    }

    /**
     * 根据 userId 获取该用户当前所在的房间（如果存在的话）
     */
    public Room getRoomByUserId(long userId) {
        for (Room r : rooms.values()) {
            if (r.getPlayerByUserId(userId) != null || r.getLobbyUsers().containsKey(userId)) {
                return r;
            }
        }
        return null;
    }

    /**
     * 获取所有等待中的房间列表（用于大厅展示）
     */
    public List<Room> listWaitingRooms() {
        List<Room> list = new ArrayList<>();
        for (Room r : rooms.values()) {
            if (r.getStatus() == Room.RoomStatus.WAITING || r.getStatus() == Room.RoomStatus.READY) {
                list.add(r);
            }
        }
        return list;
    }

    /**
     * 玩家加入房间
     *
     * @return 分配的座位号，-1 表示满座或房间不存在
     */
    public int joinRoom(String roomId, Player player) {
        Room room = rooms.get(roomId);
        if (room == null) return -2; // 房间不存在
        if (room.getStatus() == Room.RoomStatus.PLAYING) return -3; // 游戏已开始
        int seat = room.join(player);
        if (seat >= 0) {
            sessionRoomMap.put(player.getSessionId(), roomId);
        }
        return seat;
    }

    /**
     * 玩家离开房间（座位与大厅均清除）
     */
    public boolean leaveRoom(String roomId, long userId) {
        Room room = rooms.get(roomId);
        if (room == null) return false;
        room.leaveRoom(userId);
        // 仅在房间真正空了时才自动删除；房主离开的解散逻辑由 Handler 负责
        if (room.isEmpty()) {
            rooms.remove(roomId);
            sessionRoomMap.values().removeIf(id -> id.equals(roomId));
        }
        return true;
    }

    /**
     * 解散房间（房主主动操作或房主离开时由 Handler 调用）
     *
     * @return 被解散的 Room 对象（用于广播），若房间不存在则返回 null
     */
    public Room disbandRoom(String roomId) {
        Room room = rooms.remove(roomId);
        if (room == null) return null;
        // 清除所有属于该房间的 session-room 绑定
        sessionRoomMap.values().removeIf(id -> id.equals(roomId));
        return room;
    }

    /**
     * 通过 sessionId 找到该连接所在的房间
     */
    public Room getRoomBySession(String sessionId) {
        String roomId = sessionRoomMap.get(sessionId);
        if (roomId == null) return null;
        return rooms.get(roomId);
    }

    /**
     * 通过 sessionId 找到对应的玩家
     */
    public Player getPlayerBySession(String sessionId) {
        Room room = getRoomBySession(sessionId);
        if (room == null) return null;
        return room.getPlayerBySession(sessionId);
    }

    // ─── Session / 用户在线状态管理 ───────────────────────────

    /**
     * 注册用户的 WebSocket 会话
     */
    public void registerSession(long userId, String sessionId) {
        userSessionMap.put(userId, sessionId);
    }

    /**
     * 注销用户的 WebSocket 会话（断连时调用）
     */
    public void unregisterSession(String sessionId) {
        userSessionMap.values().remove(sessionId);
        sessionRoomMap.remove(sessionId);
    }

    /**
     * 获取某用户的 sessionId（用于定向推送消息）
     */
    public String getSessionId(long userId) {
        return userSessionMap.get(userId);
    }

    /**
     * 通过 sessionId 获取所在 roomId
     */
    public String getRoomIdBySession(String sessionId) {
        return sessionRoomMap.get(sessionId);
    }

    /**
     * 关联 session 和 roomId
     */
    public void bindSessionRoom(String sessionId, String roomId) {
        sessionRoomMap.put(sessionId, roomId);
    }

    /**
     * 解绑 session 和 roomId（离开房间时调用）
     */
    public void unbindSessionRoom(String sessionId) {
        sessionRoomMap.remove(sessionId);
    }
}
