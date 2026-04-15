package com.mahjong.service;

import com.mahjong.model.Room;
import com.mahjong.redis.ReplayStore;
import com.mahjong.redis.RoomStateStore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

/**
 * Redis 启用时：将进程内现有房间状态迁移到 Redis。
 *
 * <p>用途：在切换到 Redis 的同一进程内，确保当前内存房间快照可立即落入 Redis。
 */
@Service
@ConditionalOnProperty(prefix = "app.redis", name = "enabled", havingValue = "true")
public class RedisMigrationService {

    private static final Logger log = Logger.getLogger(RedisMigrationService.class.getName());

    private final RoomService roomService;
    private final RoomStateStore roomStateStore;
    private final ReplayStore replayStore;

    public RedisMigrationService(RoomService roomService, RoomStateStore roomStateStore, ReplayStore replayStore) {
        this.roomService = roomService;
        this.roomStateStore = roomStateStore;
        this.replayStore = replayStore;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void migrateInMemoryRoomsToRedis() {
        List<Room> allRooms = roomService.listAllRooms();
        if (allRooms.isEmpty()) {
            log.info("Redis 迁移完成：当前无内存房间需要迁移");
            return;
        }

        int migrated = 0;
        for (Room room : allRooms) {
            roomStateStore.saveRoom(room);
            Map<String, Object> payload = new HashMap<>();
            payload.put("roomId", room.getRoomId());
            payload.put("roomName", room.getRoomName());
            payload.put("status", room.getStatus().name());
            payload.put("currentRound", room.getCurrentRound());
            replayStore.append(room.getRoomId(), "MIGRATE_IN_MEMORY_ROOM", room.getCurrentRound(), payload);
            migrated++;
        }

        log.info("Redis 迁移完成：已迁移内存房间数量=" + migrated);
    }
}
