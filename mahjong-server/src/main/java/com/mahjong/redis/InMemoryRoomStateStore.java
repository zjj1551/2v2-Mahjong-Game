package com.mahjong.redis;

import com.mahjong.model.Room;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 默认房间缓存实现：仅内存。
 */
@Service
@ConditionalOnProperty(prefix = "app.redis", name = "enabled", havingValue = "false", matchIfMissing = true)
public class InMemoryRoomStateStore implements RoomStateStore {

    private final Map<String, RoomSnapshot> rooms = new ConcurrentHashMap<>();

    @Override
    public void saveRoom(Room room) {
        rooms.put(room.getRoomId(), RoomSnapshot.fromRoom(room));
    }

    @Override
    public void deleteRoom(String roomId) {
        rooms.remove(roomId);
    }

    @Override
    public Optional<RoomSnapshot> findRoom(String roomId) {
        return Optional.ofNullable(rooms.get(roomId));
    }

    @Override
    public List<RoomSnapshot> findAllRooms() {
        return new ArrayList<>(rooms.values());
    }
}
