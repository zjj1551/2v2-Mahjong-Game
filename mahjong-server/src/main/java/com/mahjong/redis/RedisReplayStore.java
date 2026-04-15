package com.mahjong.redis;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

/**
 * Redis 对局回放存储实现。
 * 仅在 app.redis.enabled=true 时生效。
 */
@Service
@ConditionalOnProperty(prefix = "app.redis", name = "enabled", havingValue = "true")
public class RedisReplayStore implements ReplayStore {

    private static final Logger log = Logger.getLogger(RedisReplayStore.class.getName());

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final RedisStoreProperties properties;

    public RedisReplayStore(StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            RedisStoreProperties properties) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public void append(String roomId, ReplayEvent event) {
        String key = replayKey(roomId);
        try {
            String raw = objectMapper.writeValueAsString(event);
            redisTemplate.opsForList().rightPush(key, raw);
            long max = properties.getReplayMaxEvents();
            redisTemplate.opsForList().trim(key, -max, -1);
        } catch (JsonProcessingException e) {
            log.warning("序列化回放事件失败: roomId=" + roomId + ", err=" + e.getMessage());
        }
    }

    @Override
    public List<ReplayEvent> list(String roomId, int limit) {
        String key = replayKey(roomId);
        long end = limit <= 0 ? -1 : limit - 1L;
        List<String> rows = redisTemplate.opsForList().range(key, 0, end);
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }

        List<ReplayEvent> events = new ArrayList<>();
        for (String raw : rows) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            try {
                events.add(objectMapper.readValue(raw, ReplayEvent.class));
            } catch (JsonProcessingException e) {
                log.warning("反序列化回放事件失败: roomId=" + roomId + ", err=" + e.getMessage());
            }
        }
        return events;
    }

    @Override
    public void clear(String roomId) {
        redisTemplate.delete(replayKey(roomId));
    }

    private String replayKey(String roomId) {
        return properties.getKeyPrefixReplay() + roomId;
    }
}
