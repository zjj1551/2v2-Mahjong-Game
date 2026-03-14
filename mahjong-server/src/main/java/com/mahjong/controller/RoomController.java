package com.mahjong.controller;

import com.mahjong.model.Room;
import com.mahjong.entity.GameRecordEntity;
import com.mahjong.service.GameRecordRepository;
import com.mahjong.service.RoomService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 房间管理 REST 接口
 */
@RestController
@RequestMapping("/api/room")
public class RoomController {

    private final RoomService roomService;
    private final GameRecordRepository gameRecordRepository;

    public RoomController(RoomService roomService, GameRecordRepository gameRecordRepository) {
        this.roomService = roomService;
        this.gameRecordRepository = gameRecordRepository;
    }

    /**
     * 创建房间
     * POST /api/room/create
     * Body: { "roomName": "xxx", "creatorId": 1001, "baseScore": 1, "maxRounds": 8 }
     */
    @PostMapping("/create")
    public ResponseEntity<Map<String, Object>> createRoom(@RequestBody Map<String, Object> body) {
        String roomName = (String) body.get("roomName");
        Number creatorIdNum = (Number) body.get("creatorId");
        if (roomName == null || creatorIdNum == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", "参数不完整"));
        }

        long creatorId = creatorIdNum.longValue();
        Room room = roomService.createRoom(roomName, creatorId);

        // 可选配置
        if (body.containsKey("baseScore")) {
            room.setBaseScore(((Number) body.get("baseScore")).intValue());
        }
        if (body.containsKey("maxRounds")) {
            room.setMaxRounds(((Number) body.get("maxRounds")).intValue());
        }
        if (body.containsKey("allowChi")) {
            room.setAllowChi((Boolean) body.get("allowChi"));
        }
        if (body.containsKey("enableFengYu")) {
            room.setEnableFengYu((Boolean) body.get("enableFengYu"));
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("roomId", room.getRoomId());
        result.put("roomName", room.getRoomName());
        return ResponseEntity.ok(result);
    }

    /**
     * 获取等待中的房间列表（大厅）
     * GET /api/room/list
     */
    @GetMapping("/list")
    public ResponseEntity<Map<String, Object>> listRooms() {
        List<Room> rooms = roomService.listWaitingRooms();
        List<Map<String, Object>> list = rooms.stream().map(r -> {
            Map<String, Object> m = new HashMap<>();
            m.put("roomId", r.getRoomId());
            m.put("roomName", r.getRoomName());
            m.put("playerCount", r.getPlayerList().size());
            m.put("status", r.getStatus().name());
            m.put("baseScore", r.getBaseScore());
            m.put("maxRounds", r.getMaxRounds());
            return m;
        }).toList();
        return ResponseEntity.ok(Map.of("success", true, "rooms", list));
    }

    /**
     * 解散房间（仅房主可用）
     * DELETE /api/room/{roomId}?creatorId=xxx
     */
    @DeleteMapping("/{roomId}")
    public ResponseEntity<Map<String, Object>> disbandRoom(
            @PathVariable String roomId,
            @RequestParam long creatorId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return ResponseEntity.ok(Map.of("success", false, "msg", "房间不存在"));
        }
        if (room.getCreatorId() != creatorId) {
            return ResponseEntity.ok(Map.of("success", false, "msg", "只有房主才能解散房间"));
        }
        if (room.getStatus() == Room.RoomStatus.PLAYING) {
            return ResponseEntity.ok(Map.of("success", false, "msg", "游戏进行中不能解散房间"));
        }
        roomService.disbandRoom(roomId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /**
     * 获取房间详情（含各座位状态、大厅用户列表）
     * GET /api/room/{roomId}
     */
    @GetMapping("/{roomId}")
    public ResponseEntity<Map<String, Object>> getRoomInfo(@PathVariable String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return ResponseEntity.ok(Map.of("success", false, "msg", "房间不存在"));
        }

        // 4 个座位的状态（occupied / ready / userId / nickname…）
        List<Map<String, Object>> seatList = new java.util.ArrayList<>();
        for (int i = 0; i < 4; i++) {
            var p = room.getPlayer(i);
            Map<String, Object> seat = new java.util.HashMap<>();
            seat.put("seatIndex", i);
            if (p != null) {
                seat.put("occupied", true);
                seat.put("userId", p.getUserId());
                seat.put("nickname", p.getNickname());
                seat.put("team", p.getTeam());
                seat.put("online", p.isOnline());
                seat.put("ready", p.isReady());
            } else {
                seat.put("occupied", false);
            }
            seatList.add(seat);
        }

        // 大厅中未就座的玩家
        List<Map<String, Object>> lobbyList = new java.util.ArrayList<>();
        room.getLobbyUsers().forEach((uid, nick) ->
                lobbyList.add(Map.of("userId", uid, "nickname", nick)));

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("success", true);
        result.put("roomId", room.getRoomId());
        result.put("roomName", room.getRoomName());
        result.put("status", room.getStatus().name());
        result.put("creatorId", room.getCreatorId());
        result.put("currentRound", room.getCurrentRound());
        result.put("maxRounds", room.getMaxRounds());
        result.put("baseScore", room.getBaseScore());
        result.put("allowChi", room.isAllowChi());
        result.put("enableFengYu", room.isEnableFengYu());
        result.put("seats", seatList);
        result.put("lobbyUsers", lobbyList);
        result.put("allReady", room.isAllReady());

        return ResponseEntity.ok(result);
    }

    /**
     * 获取房间对局记录
     * GET /api/room/{roomId}/records
     */
    @GetMapping("/{roomId}/records")
    public ResponseEntity<Map<String, Object>> getRoomRecords(@PathVariable String roomId) {
        List<GameRecordEntity> records = gameRecordRepository.findByRoomIdOrderByRoundNumAsc(roomId);
        List<Map<String, Object>> list = records.stream().map(r -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", r.getId());
            m.put("roundNum", r.getRoundNum());
            m.put("winnerId", r.getWinnerId());
            m.put("loserId", r.getLoserId());
            m.put("score", r.getScore());
            m.put("winType", r.getWinType());
            m.put("scoreSnapshot", r.getScoreSnapshot());
            m.put("createdAt", r.getCreatedAt());
            return m;
        }).toList();
        return ResponseEntity.ok(Map.of("success", true, "records", list));
    }
}
