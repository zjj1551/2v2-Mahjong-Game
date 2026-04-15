package com.mahjong.redis;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mahjong.model.Room;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Logger;

/**
 * Redis 房间存储实现。
 * 仅在 app.redis.enabled=true 时生效。
 */
@Service
@ConditionalOnProperty(prefix = "app.redis", name = "enabled", havingValue = "true")
public class RedisRoomStateStore implements RoomStateStore {

    private static final Logger log = Logger.getLogger(RedisRoomStateStore.class.getName());

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final RedisStoreProperties properties;

    public RedisRoomStateStore(StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            RedisStoreProperties properties) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public void saveRoom(Room room) {
        RoomSnapshot snapshot = RoomSnapshot.fromRoom(room);
        try {
            redisTemplate.opsForValue().set(roomKey(room.getRoomId()), objectMapper.writeValueAsString(snapshot));
        } catch (JsonProcessingException e) {
            log.warning("序列化房间快照失败: roomId=" + room.getRoomId() + ", err=" + e.getMessage());
        }
    }

    @Override
    public void deleteRoom(String roomId) {
        redisTemplate.delete(roomKey(roomId));
    }

    @Override
    public Optional<RoomSnapshot> findRoom(String roomId) {
        String raw = redisTemplate.opsForValue().get(roomKey(roomId));
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(raw, RoomSnapshot.class));
        } catch (JsonProcessingException e) {
            log.warning("反序列化房间快照失败: roomId=" + roomId + ", err=" + e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public List<RoomSnapshot> findAllRooms() {
        Set<String> keys = redisTemplate.keys(properties.getKeyPrefixRoom() + "*");
        if (keys == null || keys.isEmpty()) {
            return List.of();
        }

        List<RoomSnapshot> result = new ArrayList<>();
        for (String key : keys) {
            String raw = redisTemplate.opsForValue().get(key);
            if (raw == null || raw.isBlank()) {
                continue;
            }
            try {
                result.add(objectMapper.readValue(raw, RoomSnapshot.class));
            } catch (JsonProcessingException e) {
                log.warning("反序列化房间快照失败: key=" + key + ", err=" + e.getMessage());
            }
        }
        return result;
    }

    private String roomKey(String roomId) {
        return properties.getKeyPrefixRoom() + roomId;
    }
}
