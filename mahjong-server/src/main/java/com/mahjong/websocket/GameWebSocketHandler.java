package com.mahjong.websocket;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.mahjong.model.Player;
import com.mahjong.model.Room;
import com.mahjong.service.GameService;
import com.mahjong.service.RoomService;
import com.mahjong.service.UserService;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * WebSocket 消息路由分发器
 *
 * <p>
 * 处理所有 WebSocket 连接的建立、消息接收、断开。
 * 根据消息中的 {@link MessageType} 路由到对应的 {@link GameService} 方法。
 *
 * <p>
 * WebSocket 端点：{@code ws://host:port/ws/game?userId=xxx}
 */
@Component
public class GameWebSocketHandler extends TextWebSocketHandler implements GameService.MessageSender {

    private static final Logger log = Logger.getLogger(GameWebSocketHandler.class.getName());

    private final RoomService roomService;
    private final GameService gameService;
    private final UserService userService;
    private static final AtomicLong BOT_USER_ID_SEQ = new AtomicLong(900000000L);

    /** sessionId -> WebSocketSession 映射 */
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public GameWebSocketHandler(RoomService roomService, GameService gameService, UserService userService) {
        this.roomService = roomService;
        this.gameService = gameService;
        this.userService = userService;
        // 注入消息发送回调
        this.gameService.setMessageSender(this);
    }

    // ═══════════════════════════════════════════════════════════
    // WebSocket 生命周期
    // ═══════════════════════════════════════════════════════════

    /**
     * 连接建立：通过 URL 参数获取 userId，注册 session
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String sessionId = session.getId();

        // 从 URL 参数获取 userId
        Long userId = extractUserId(session);
        if (userId == null) {
            sendError(session, 1001, "WebSocket 连接缺少 userId 参数");
            session.close();
            return;
        }

        sessions.put(sessionId, session);
        roomService.registerSession(userId, sessionId);
        
        log.info("WebSocket 连接建立: sessionId=" + sessionId + ", userId=" + userId);

        // -- 新增: 断线重连恢复房间状态逻辑 --
        // 检查用户是否已在某个房间中（防刷新丢失状态）
        Room joinedRoom = getRoomByUserId(userId);
        if (joinedRoom != null) {
            // 重新绑定 session 和 roomId
            roomService.bindSessionRoom(sessionId, joinedRoom.getRoomId());
            
            Player p = joinedRoom.getPlayerByUserId(userId);
            if (p != null) {
                p.setOnline(true);
                // 广播玩家上线状态给房间其他人
                GameMessage onlineMsg = new GameMessage(MessageType.S_PLAYER_STATUS,
                        Map.of("seatIndex", p.getSeatIndex(), "online", true,
                                "nickname", p.getNickname()));
                broadcastRaw(joinedRoom, onlineMsg, sessionId); // 不包含自己，因为自己会收到全量状态
            }
            
            // 下发全量房间状态给当前重连的玩家
            GameMessage stateMsg = new GameMessage(MessageType.S_ROOM_STATE, getRoomStateData(joinedRoom));
            try {
                session.sendMessage(new TextMessage(JSON.toJSONString(stateMsg)));
            } catch (IOException e) {
                log.warning("发送全量房间状态失败: sessionId=" + sessionId);
            }
        }
    }

    /**
     * 辅助方法：把房间数据构造为 Map
     */
    private java.util.Map<String, Object> getRoomStateData(Room room) {
        java.util.List<Map<String, Object>> seatList = new java.util.ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Player p = room.getPlayer(i);
            Map<String, Object> seat = new java.util.HashMap<>();
            seat.put("seatIndex", i);
            if (p != null) {
                seat.put("occupied", true);
                seat.put("userId", p.getUserId());
                seat.put("nickname", p.getNickname());
                seat.put("team", p.getTeam());
                seat.put("online", p.isOnline());
                seat.put("ready", p.isReady());
                seat.put("isBot", p.isBot());
                seat.put("isHu", p.isHu());
                seat.put("missSuit", p.getMissSuit());
                seat.put("avatarChar", p.getAvatarChar());
                seat.put("avatarColor", p.getAvatarColor());
            } else {
                seat.put("occupied", false);
            }
            seatList.add(seat);
        }

        java.util.List<Map<String, Object>> lobbyList = new java.util.ArrayList<>();
        room.getLobbyUsers().forEach((uid, nick) -> lobbyList.add(Map.of(
                "userId", uid,
                "nickname", nick,
                "avatarChar", nick == null || nick.isBlank() ? "?" : nick.substring(0, 1).toUpperCase())));

        Map<String, Object> data = new java.util.HashMap<>();
        data.put("roomId", room.getRoomId());
        data.put("roomName", room.getRoomName());
        data.put("status", room.getStatus().name());
        data.put("creatorId", room.getCreatorId());
        data.put("seats", seatList);
        data.put("lobbyUsers", lobbyList);
        data.put("maxRounds", room.getMaxRounds());
        data.put("baseScore", room.getBaseScore());
        return data;
    }

    /**
     * 辅助方法：排除 senderSessionId 进行广播
     */
    private void broadcastRaw(Room room, GameMessage message, String excludeSessionId) {
        String payload = JSON.toJSONString(message);
        TextMessage textMessage = new TextMessage(payload);

        room.getPlayerList().forEach(p -> {
            String sid = roomService.getSessionId(p.getUserId());
            if (sid != null && !sid.equals(excludeSessionId)) {
                WebSocketSession s = sessions.get(sid);
                if (s != null && s.isOpen()) {
                    try {
                        s.sendMessage(textMessage);
                    } catch (IOException e) {
                        log.warning("广播消息失败: sessionId=" + sid);
                    }
                }
            }
        });
        room.getLobbyUsers().keySet().forEach(lobbyUserId -> {
            String sid = roomService.getSessionId(lobbyUserId);
            if (sid != null && !sid.equals(excludeSessionId)) {
                WebSocketSession s = sessions.get(sid);
                if (s != null && s.isOpen()) {
                    try {
                        s.sendMessage(textMessage);
                    } catch (IOException e) {
                        log.warning("广播消息失败: sessionId=" + sid);
                    }
                }
            }
        });
    }

    /**
     * 辅助查找用户当前所在房间
     */
    private Room getRoomByUserId(Long userId) {
        // 由于 RoomService 目前没有直接暴露 activeRooms，我们可以通过遍历所有房间来寻找。
        // 但更好的做法是让 RoomService 提供，这里我们暂时临时依赖 RoomService.getRoom 获取不到列表，所以需要修改 RoomService
        return roomService.getRoomByUserId(userId);
    }

    /**
     * 接收到文本消息 → 解析 JSON → 路由到对应处理方法
     */
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String sessionId = session.getId();
        String payload = message.getPayload();

        try {
            JSONObject json = JSON.parseObject(payload);
            String typeStr = json.getString("type");
            if (typeStr == null) {
                sendError(session, 1002, "消息缺少 type 字段");
                return;
            }

            MessageType type;
            try {
                type = MessageType.valueOf(typeStr);
            } catch (IllegalArgumentException e) {
                sendError(session, 1003, "未知消息类型: " + typeStr);
                return;
            }

            String roomId = json.getString("roomId");
            Long userId = json.getLong("userId");
            JSONObject data = json.getJSONObject("data");
            if (data == null) {
                data = new JSONObject();
            }

            log.fine("收到消息: type=" + type + ", sessionId=" + sessionId + ", roomId=" + roomId);

            switch (type) {
                case C_JOIN_ROOM -> handleJoinRoom(session, roomId, userId);
                case C_CHOOSE_SEAT -> handleChooseSeat(session, roomId, userId, data);
                case C_LEAVE_SEAT -> handleLeaveSeat(session, roomId, userId);
                case C_READY -> handleReady(session, roomId, userId);
                case C_LEAVE_ROOM -> handleLeaveRoom(session, roomId, userId);
                case C_DISBAND_ROOM -> handleDisbandRoom(session, roomId, userId);
                case C_INVITE_FRIEND -> handleInviteFriend(session, roomId, userId, data);
                case C_START_GAME -> handleStartGame(session, roomId, userId);
                case C_ADD_BOT -> handleAddBot(session, roomId, userId, data);
                case C_SELECT_MISS_SUIT -> handleSelectMissSuit(roomId, sessionId, data);
                case C_DISCARD -> handleDiscard(roomId, sessionId, data);
                case C_PENG -> handlePeng(roomId, sessionId);
                case C_CHI -> handleChi(roomId, sessionId, data);
                case C_GANG -> handleGang(roomId, sessionId, data);
                case C_AN_GANG -> handleAnGang(roomId, sessionId, data);
                case C_HU -> handleHu(roomId, sessionId, data);
                case C_PASS -> handlePass(roomId, sessionId);
                case C_CHAT -> handleChat(roomId, sessionId, data);
                case C_PING -> handlePing(session);
                default -> sendError(session, 1004, "不支持的客户端消息类型: " + type);
            }
        } catch (Exception e) {
            log.log(Level.WARNING, "处理消息异常: " + e.getMessage(), e);
            sendError(session, 2000, "服务器错误: " + e.getMessage());
        }
    }

    /**
     * 容纳斷连玩家：已就座玩家标记离线；大厅玩家直接移除。
     */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String sessionId = session.getId();

        Room room = roomService.getRoomBySession(sessionId);
        if (room != null) {
            Player player = room.getPlayerBySession(sessionId);
            if (player != null) {
                // 已就座玩家：标记离线
                player.setOnline(false);
                GameMessage offlineMsg = new GameMessage(MessageType.S_PLAYER_STATUS,
                        Map.of("seatIndex", player.getSeatIndex(), "online", false,
                                "nickname", player.getNickname()));
                broadcast(room, offlineMsg);
            } else {
                // 大厅玩家：断连则移出大厅
                Long userId = extractUserId(session);
                if (userId != null) {
                    roomService.leaveRoom(room.getRoomId(), userId);
                    if (!room.isEmpty()) {
                        broadcastRoomState(room);
                    }
                }
            }
        }

        sessions.remove(sessionId);
        roomService.unregisterSession(sessionId);

        log.info("WebSocket 连接断开: sessionId=" + sessionId + ", status=" + status);
    }

    /**
     * 传输错误
     */
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.log(Level.WARNING, "WebSocket 传输错误: sessionId=" + session.getId(), exception);
        session.close(CloseStatus.SERVER_ERROR);
    }

    // ═══════════════════════════════════════════════════════════
    // 消息路由处理方法
    // ═══════════════════════════════════════════════════════════

    /**
     * 加入房间大厅（不自动分配座位）
     */
    private void handleJoinRoom(WebSocketSession session, String roomId, Long userId) {
        if (roomId == null || userId == null) {
            sendError(session, 1010, "加入房间需要 roomId 和 userId");
            return;
        }

        String sessionId = session.getId();

        // 查找用户信息
        var userOpt = userService.findById(userId);
        if (userOpt.isEmpty()) {
            sendError(session, 1011, "用户不存在");
            return;
        }
        var userEntity = userOpt.get();

        Room room = roomService.getRoom(roomId);
        if (room == null) {
            sendError(session, 1012, "房间不存在");
            return;
        }
        if (room.getStatus() == Room.RoomStatus.FINISHED) {
            sendError(session, 1013, "房间已结束");
            return;
        }

        // 游戏进行中：允许以观战者身份加入
        if (room.getStatus() == Room.RoomStatus.PLAYING) {
            // 已就座玩家重连
            Player existingPlayer = room.getPlayerByUserId(userId);
            if (existingPlayer != null) {
                existingPlayer.setSessionId(sessionId);
                existingPlayer.setOnline(true);
                roomService.registerSession(userId, sessionId);
                roomService.bindSessionRoom(sessionId, roomId);
                roomService.syncRoomSnapshot(roomId);
                broadcastToRoom(room, new GameMessage(MessageType.S_PLAYER_STATUS,
                        Map.of("seatIndex", existingPlayer.getSeatIndex(), "online", true,
                                "nickname", existingPlayer.getNickname())));
                return;
            }
            // 新观战者进入大厅
            room.enterLobby(userId, userEntity.getNickname());
            roomService.registerSession(userId, sessionId);
            roomService.bindSessionRoom(sessionId, roomId);
            roomService.syncRoomSnapshot(roomId);
            // 推送当前公开局面给观战者
            gameService.pushSpectateState(roomId, sessionId);
            log.info("观战者加入: userId=" + userId + ", roomId=" + roomId);
            return;
        }

        // 已就座玩家重连：更新 session
        Player existingPlayer = room.getPlayerByUserId(userId);
        if (existingPlayer != null) {
            existingPlayer.setSessionId(sessionId);
            existingPlayer.setOnline(true);
            roomService.bindSessionRoom(sessionId, roomId);
            roomService.syncRoomSnapshot(roomId);
            broadcastToRoom(room, new GameMessage(MessageType.S_PLAYER_STATUS,
                    Map.of("seatIndex", existingPlayer.getSeatIndex(), "online", true,
                            "nickname", existingPlayer.getNickname())));
            broadcastRoomState(room);
            return;
        }

        // 大厅用户重连：更新 session
        if (room.getLobbyUsers().containsKey(userId)) {
            roomService.registerSession(userId, sessionId);
            roomService.bindSessionRoom(sessionId, roomId);
            roomService.syncRoomSnapshot(roomId);
            broadcastRoomState(room);
            return;
        }

        // 全新玩家进入大厅
        boolean entered = room.enterLobby(userId, userEntity.getNickname());
        if (!entered) {
            sendError(session, 1014, "该房间当前不允许加入");
            return;
        }

        roomService.registerSession(userId, sessionId);
        roomService.bindSessionRoom(sessionId, roomId);
        roomService.syncRoomSnapshot(roomId);

        log.info("玩家进入大厅: userId=" + userId + ", roomId=" + roomId);
        broadcastRoomState(room);
    }

    /**
     * 选择座位入座
     */
    private void handleChooseSeat(WebSocketSession session, String roomId, Long userId, JSONObject data) {
        if (roomId == null || userId == null) {
            sendError(session, 1020, "需要 roomId 和 userId");
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            sendError(session, 1021, "房间不存在");
            return;
        }
        int seatIndex = data.getIntValue("seatIndex");
        String sessionId = session.getId();

        int result = room.chooseSeat(userId, seatIndex, sessionId);
        if (result < 0) {
            String msg = switch (result) {
                case -1 -> "该座位已被占用";
                case -2 -> "您不在该房间内，请先加入房间";
                case -3 -> "游戏已开始，不能换座";
                default -> "无效座位号";
            };
            sendError(session, 1022, msg);
            return;
        }

        log.info("玩家入座: userId=" + userId + ", roomId=" + roomId + ", seat=" + result);
        roomService.syncRoomSnapshot(roomId);

        // 广播座位变动
        Player p = room.getPlayer(result);
        broadcastToRoom(room, new GameMessage(MessageType.S_SEAT_CHANGED,
                Map.of("seatIndex", result, "action", "SIT",
                        "userId", userId, "nickname", p.getNickname())));
        broadcastRoomState(room);
    }

    /**
     * 从座位起身，回到大厅
     */
    private void handleLeaveSeat(WebSocketSession session, String roomId, Long userId) {
        if (roomId == null || userId == null) {
            sendError(session, 1030, "需要 roomId 和 userId");
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            sendError(session, 1031, "房间不存在");
            return;
        }
        Player p = room.getPlayerByUserId(userId);
        if (p == null) {
            sendError(session, 1032, "您尚未就座");
            return;
        }
        int oldSeat = p.getSeatIndex();
        String nickname = p.getNickname();
        room.leaveSeat(userId);
        roomService.syncRoomSnapshot(roomId);

        broadcastToRoom(room, new GameMessage(MessageType.S_SEAT_CHANGED,
                Map.of("seatIndex", oldSeat, "action", "STAND",
                        "userId", userId, "nickname", nickname)));
        broadcastRoomState(room);
    }

    /**
     * 切换准备状态。
     */
    private void handleReady(WebSocketSession session, String roomId, Long userId) {
        if (roomId == null || userId == null) {
            sendError(session, 1040, "需要 roomId 和 userId");
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            sendError(session, 1041, "房间不存在");
            return;
        }
        Player p = room.getPlayerByUserId(userId);
        if (p == null) {
            sendError(session, 1042, "请先就座再准备");
            return;
        }

        boolean newReady = !p.isReady(); // 切换
        room.setReady(userId, newReady);
        roomService.syncRoomSnapshot(roomId);

        broadcastToRoom(room, new GameMessage(MessageType.S_READY_CHANGED,
                Map.of("seatIndex", p.getSeatIndex(), "userId", userId, "ready", newReady)));
        // 推送全量状态，前端据此刷新按钮与座位状态
        broadcastRoomState(room);
    }

    /**
     * 完全离开房间。若离开者是房主且房间仍有其他人，则自动解散并通知所有人。
     */
    private void handleLeaveRoom(WebSocketSession session, String roomId, Long userId) {
        if (roomId == null || userId == null) {
            sendError(session, 1050, "需要 roomId 和 userId");
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null)
            return;

        boolean isCreator = room.getCreatorId() == userId;

        // 记录离开信息（广播前获取）
        Player p = room.getPlayerByUserId(userId);
        int departedSeat = p != null ? p.getSeatIndex() : -1;
        String departedNick = p != null ? p.getNickname() : room.getLobbyUsers().get(userId);
        if (departedNick == null)
            departedNick = "";

        roomService.leaveRoom(roomId, userId);
        roomService.unbindSessionRoom(session.getId());

        log.info("玩家离开房间: userId=" + userId + ", roomId=" + roomId + ", isCreator=" + isCreator);

        // 返回离开房间成功给离开者本人，防止前端如果还在等待会导致挂起
        sendToSessionDirect(session, new GameMessage(MessageType.S_LEAVE_ROOM, Map.of("userId", userId)));

        // 房间已空（leaveRoom 内已自动删除），无需广播
        if (room.isEmpty())
            return;

        // 若房主离开，自动转让房主（选座位上的第一个人，若没人则选旁观者）
        if (isCreator) {
            Long newCreatorId = null;
            if (!room.getPlayerList().isEmpty()) {
                newCreatorId = room.getPlayerList().iterator().next().getUserId();
            } else if (!room.getLobbyUsers().isEmpty()) {
                newCreatorId = room.getLobbyUsers().keySet().iterator().next();
            }
            if (newCreatorId != null) {
                room.setCreatorId(newCreatorId);
                roomService.syncRoomSnapshot(roomId);
                String newCreatorName = room.getPlayerByUserId(newCreatorId) != null ? 
                    room.getPlayerByUserId(newCreatorId).getNickname() : room.getLobbyUsers().get(newCreatorId);
                broadcastToRoom(room, new GameMessage(MessageType.S_CHAT, Map.of(
                        "seatIndex", -1, "nickname", "系统", "message", "原房主已离开，房间已转交房主给 " + newCreatorName)));
            }
        }

        // 普通玩家或转让房主后离开 → 广播座位变动
        if (departedSeat >= 0) {
            broadcastToRoom(room, new GameMessage(MessageType.S_SEAT_CHANGED,
                    Map.of("seatIndex", departedSeat, "action", "LEAVE",
                            "userId", userId, "nickname", departedNick)));
        }
        broadcastRoomState(room);
    }

    /**
     * 房间内好友邀请
     * data: {targetUserId: long}
     */
    private void handleInviteFriend(WebSocketSession session, String roomId, Long inviterId,
            com.alibaba.fastjson2.JSONObject data) {
        if (roomId == null || inviterId == null || data == null) {
            sendError(session, 1080, "需要 roomId 和 targetUserId");
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            sendError(session, 1081, "房间不存在");
            return;
        }
        Long targetUserId = data.getLong("targetUserId");
        if (targetUserId == null) {
            sendError(session, 1082, "缺少 targetUserId");
            return;
        }

        String targetSessionId = roomService.getSessionId(targetUserId);
        if (targetSessionId == null) {
            sendError(session, 1083, "对方不在线");
            return;
        }

        String inviterNickname = userService.findById(inviterId)
                .map(u -> u.getNickname()).orElse("用户" + inviterId);

        GameMessage invite = new GameMessage(MessageType.S_ROOM_INVITE, Map.of(
                "roomId", roomId,
                "roomName", room.getRoomName(),
                "inviterId", inviterId,
                "inviterNickname", inviterNickname));
        sendToSession(targetSessionId, invite);
        log.info("玩家 " + inviterId + " 邀请 " + targetUserId + " 加入房间 " + roomId);
    }

    /**
     * 房主主动解散房间
     */
    private void handleDisbandRoom(WebSocketSession session, String roomId, Long userId) {
        if (roomId == null || userId == null) {
            sendError(session, 1070, "需要 roomId 和 userId");
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            sendError(session, 1071, "房间不存在");
            return;
        }
        if (room.getCreatorId() != userId) {
            sendError(session, 1072, "只有房主才能解散房间");
            return;
        }
        if (room.getStatus() == Room.RoomStatus.PLAYING) {
            sendError(session, 1073, "游戏进行中不能解散房间");
            return;
        }
        log.info("房主 " + userId + " 主动解散房间 " + roomId);
        disbandAndNotify(room, "房主已解散房间");
        roomService.unbindSessionRoom(session.getId());
    }

    /**
     * 广播解散通知后删除房间
     */
    private void disbandAndNotify(Room room, String reason) {
        GameMessage msg = new GameMessage(MessageType.S_ROOM_DISBANDED,
                Map.of("roomId", room.getRoomId(), "reason", reason));
        broadcastToRoom(room, msg);
        roomService.disbandRoom(room.getRoomId());
    }

    /**
     * 房主开始游戏（需 4 人全部准备）
     */
    private void handleStartGame(WebSocketSession session, String roomId, Long userId) {
        if (roomId == null || userId == null) {
            sendError(session, 1060, "需要 roomId 和 userId");
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            sendError(session, 1061, "房间不存在");
            return;
        }
        if (room.getCreatorId() != userId) {
            sendError(session, 1062, "只有房主才能开始游戏");
            return;
        }
        if (!room.isFull()) {
            sendError(session, 1063, "需要 4 个玩家全就座才能开始");
            return;
        }
        if (!room.isAllReady()) {
            sendError(session, 1064, "需要 4 个玩家全部准备后才能开始");
            return;
        }
        log.info("房主 " + userId + " 强制开始房间 " + roomId);
        gameService.startGame(roomId);
    }

    /**
     * 房主添加人机。
     * data: {seatIndex?: 0-3}
     */
    private void handleAddBot(WebSocketSession session, String roomId, Long userId, JSONObject data) {
        if (roomId == null || userId == null) {
            sendError(session, 1090, "需要 roomId 和 userId");
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            sendError(session, 1091, "房间不存在");
            return;
        }
        if (room.getCreatorId() != userId) {
            sendError(session, 1092, "只有房主可以添加人机");
            return;
        }
        if (room.getStatus() == Room.RoomStatus.PLAYING || room.getStatus() == Room.RoomStatus.FINISHED) {
            sendError(session, 1093, "当前房间状态不允许添加人机");
            return;
        }
        if (room.isFull()) {
            sendError(session, 1094, "房间已满");
            return;
        }

        Integer preferredSeat = null;
        if (data != null && data.containsKey("seatIndex")) {
            preferredSeat = data.getInteger("seatIndex");
            if (preferredSeat == null || preferredSeat < 0 || preferredSeat > 3) {
                sendError(session, 1095, "seatIndex 必须在 0-3");
                return;
            }
            if (room.getPlayer(preferredSeat) != null) {
                sendError(session, 1096, "目标座位已被占用");
                return;
            }
        }

        int seat = preferredSeat != null ? preferredSeat : -1;
        if (seat < 0) {
            for (int i = 0; i < 4; i++) {
                if (room.getPlayer(i) == null) {
                    seat = i;
                    break;
                }
            }
        }
        if (seat < 0) {
            sendError(session, 1097, "没有可用空位");
            return;
        }

        long botId = BOT_USER_ID_SEQ.incrementAndGet();
        String botName = "AI-" + (botId % 10000);
        room.enterLobby(botId, botName);
        int chooseResult = room.chooseSeat(botId, seat, "BOT-" + botId);
        if (chooseResult < 0) {
            sendError(session, 1098, "人机入座失败");
            return;
        }

        Player bot = room.getPlayer(seat);
        if (bot != null) {
            bot.setBot(true);
            bot.setOnline(true);
            bot.setReady(true);
        }
        roomService.syncRoomSnapshot(roomId);

        broadcastToRoom(room, new GameMessage(MessageType.S_CHAT, Map.of(
                "seatIndex", -1,
                "nickname", "系统",
                "message", botName + " 已加入座位 " + seat)));
        broadcastToRoom(room, new GameMessage(MessageType.S_SEAT_CHANGED, Map.of(
                "seatIndex", seat,
                "action", "SIT",
                "userId", botId,
                "nickname", botName,
                "isBot", true)));
        broadcastRoomState(room);
    }

    /**
     * 定缺选择
     */
    private void handleSelectMissSuit(String roomId, String sessionId, JSONObject data) {
        int seatIndex = findSeatIndex(roomId, sessionId);
        int suitIndex = data.getIntValue("suitIndex");
        gameService.selectMissSuit(roomId, seatIndex, suitIndex);
    }

    /**
     * 出牌
     */
    private void handleDiscard(String roomId, String sessionId, JSONObject data) {
        int seatIndex = findSeatIndex(roomId, sessionId);
        int tileId = data.getIntValue("tileId");
        gameService.discard(roomId, seatIndex, tileId);
    }

    /**
     * 碰牌
     */
    private void handlePeng(String roomId, String sessionId) {
        int seatIndex = findSeatIndex(roomId, sessionId);
        gameService.peng(roomId, seatIndex);
    }

    /**
     * 吃牌
     */
    private void handleChi(String roomId, String sessionId, JSONObject data) {
        int seatIndex = findSeatIndex(roomId, sessionId);
        List<Integer> consumeTileIdList = new ArrayList<>();
        if (data.containsKey("consumeTileIds") && data.getJSONArray("consumeTileIds") != null) {
            data.getJSONArray("consumeTileIds").forEach(value -> consumeTileIdList.add(((Number) value).intValue()));
        }
        List<Integer> consumeTileIds = consumeTileIdList.isEmpty() ? null : consumeTileIdList;
        gameService.chi(roomId, seatIndex, consumeTileIds);
    }

    /**
     * 明杠 / 补杠
     */
    private void handleGang(String roomId, String sessionId, JSONObject data) {
        int seatIndex = findSeatIndex(roomId, sessionId);
        String gangType = data.getString("gangType");
        int tileId = data.getIntValue("tileId");

        if ("BU".equals(gangType)) {
            gameService.buGang(roomId, seatIndex, tileId);
        } else {
            gameService.mingGang(roomId, seatIndex);
        }
    }

    /**
     * 暗杠
     */
    private void handleAnGang(String roomId, String sessionId, JSONObject data) {
        int seatIndex = findSeatIndex(roomId, sessionId);
        int tileId = data.getIntValue("tileId");
        gameService.anGang(roomId, seatIndex, tileId);
    }

    /**
     * 胡牌
     */
    private void handleHu(String roomId, String sessionId, JSONObject data) {
        int seatIndex = findSeatIndex(roomId, sessionId);
        boolean isSelfDraw = data.getBooleanValue("isSelfDraw");
        gameService.hu(roomId, seatIndex, isSelfDraw);
    }

    /**
     * 跳过
     */
    private void handlePass(String roomId, String sessionId) {
        int seatIndex = findSeatIndex(roomId, sessionId);
        gameService.pass(roomId, seatIndex);
    }

    /**
     * 聊天消息
     */
    private void handleChat(String roomId, String sessionId, JSONObject data) {
        Room room = roomService.getRoomBySession(sessionId);
        if (room == null)
            return;

        Player player = room.getPlayerBySession(sessionId);
        if (player == null)
            return;

        Map<String, Object> chatData = Map.of(
                "seatIndex", player.getSeatIndex(),
                "nickname", player.getNickname(),
                "message", data.getString("message"));
        broadcast(room, new GameMessage(MessageType.S_CHAT, chatData));
    }

    /**
     * 心跳响应
     */
    private void handlePing(WebSocketSession session) {
        sendToSessionDirect(session, new GameMessage(MessageType.S_PONG, Map.of("time", System.currentTimeMillis())));
    }

    // ═══════════════════════════════════════════════════════════
    // MessageSender 接口实现（供 GameService 回调）
    // ═══════════════════════════════════════════════════════════

    @Override
    public void broadcast(Room room, GameMessage message) {
        String json = JSON.toJSONString(message);
        for (Player p : room.getPlayerList()) {
            sendJson(p.getSessionId(), json);
        }
    }

    @Override
    public void sendToSession(String sessionId, GameMessage message) {
        WebSocketSession ws = sessions.get(sessionId);
        if (ws != null && ws.isOpen()) {
            sendToSessionDirect(ws, message);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 辅助方法
    // ═══════════════════════════════════════════════════════════

    /**
     * 从 WebSocket URL 参数中提取 userId
     * URL 格式：ws://host:port/ws/game?userId=123
     */
    private Long extractUserId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null)
            return null;

        String query = uri.getQuery();
        if (query == null)
            return null;

        for (String param : query.split("&")) {
            String[] kv = param.split("=", 2);
            if (kv.length == 2 && "userId".equals(kv[0])) {
                try {
                    return Long.parseLong(kv[1]);
                } catch (NumberFormatException e) {
                    return null;
                }
            }
        }
        return null;
    }

    /**
     * 根据 sessionId 查找玩家座位号
     */
    private int findSeatIndex(String roomId, String sessionId) {
        Room room = roomService.getRoom(roomId);
        if (room == null)
            throw new IllegalStateException("房间不存在: " + roomId);

        Player player = room.getPlayerBySession(sessionId);
        if (player == null)
            throw new IllegalStateException("玩家不在该房间中");

        return player.getSeatIndex();
    }

    /**
     * 广播房间状态（广播给座位玩家 + 大厅玩家）
     */
    private void broadcastRoomState(Room room) {
        GameMessage msg = new GameMessage(MessageType.S_ROOM_STATE, getRoomStateData(room));
        broadcastToRoom(room, msg);
    }

    /**
     * 将消息广播给房间内所有人（座位玩家 + 大厅玩家）
     */
    private void broadcastToRoom(Room room, GameMessage message) {
        String json = JSON.toJSONString(message);
        // 座位玩家
        for (Player p : room.getPlayerList()) {
            sendJson(p.getSessionId(), json);
        }
        // 大厅玩家
        for (Long lobbyUserId : room.getLobbyUsers().keySet()) {
            String sid = roomService.getSessionId(lobbyUserId);
            if (sid != null)
                sendJson(sid, json);
        }
    }

    /**
     * 向指定 session 直接发送消息
     */
    private void sendToSessionDirect(WebSocketSession session, GameMessage message) {
        try {
            String json = JSON.toJSONString(message);
            session.sendMessage(new TextMessage(json));
        } catch (IOException e) {
            log.warning("发送消息失败: sessionId=" + session.getId() + ", error=" + e.getMessage());
        }
    }

    /**
     * 根据 sessionId 发送 JSON 字符串（broadcast 内部使用）
     */
    private void sendJson(String sessionId, String json) {
        WebSocketSession ws = sessions.get(sessionId);
        if (ws != null && ws.isOpen()) {
            try {
                ws.sendMessage(new TextMessage(json));
            } catch (IOException e) {
                log.warning("发送消息失败: sessionId=" + sessionId + ", error=" + e.getMessage());
            }
        }
    }

    /**
     * 发送错误消息
     */
    private void sendError(WebSocketSession session, int code, String msg) {
        sendToSessionDirect(session, GameMessage.error(code, msg));
    }
}
