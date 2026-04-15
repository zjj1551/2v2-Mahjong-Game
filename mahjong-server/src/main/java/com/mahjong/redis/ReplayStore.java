package com.mahjong.redis;

import java.util.List;
import java.util.Map;

public interface ReplayStore {

    void append(String roomId, ReplayEvent event);

    default void append(String roomId, String eventType, int round, Map<String, Object> payload) {
        append(roomId, new ReplayEvent(eventType, round, payload));
    }

    List<ReplayEvent> list(String roomId, int limit);

    void clear(String roomId);
}
