package com.mahjong.redis;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 默认回放实现：仅内存。
 */
@Service
@ConditionalOnProperty(prefix = "app.redis", name = "enabled", havingValue = "false", matchIfMissing = true)
public class InMemoryReplayStore implements ReplayStore {

    private static final int DEFAULT_MAX_EVENTS = 5000;
    private final Map<String, List<ReplayEvent>> eventMap = new ConcurrentHashMap<>();

    @Override
    public void append(String roomId, ReplayEvent event) {
        eventMap.compute(roomId, (key, list) -> {
            List<ReplayEvent> target = list == null ? new ArrayList<>() : list;
            target.add(event);
            int overflow = target.size() - DEFAULT_MAX_EVENTS;
            if (overflow > 0) {
                target.subList(0, overflow).clear();
            }
            return target;
        });
    }

    @Override
    public List<ReplayEvent> list(String roomId, int limit) {
        List<ReplayEvent> events = eventMap.getOrDefault(roomId, List.of());
        if (limit <= 0 || events.size() <= limit) {
            return new ArrayList<>(events);
        }
        return new ArrayList<>(events.subList(events.size() - limit, events.size()));
    }

    @Override
    public void clear(String roomId) {
        eventMap.remove(roomId);
    }
}
