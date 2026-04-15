package com.mahjong.redis;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * 对局回放事件。
 */
public class ReplayEvent {

    private Instant timestamp;
    private String eventType;
    private int round;
    private Map<String, Object> payload;

    public ReplayEvent() {
    }

    public ReplayEvent(String eventType, int round, Map<String, Object> payload) {
        this.timestamp = Instant.now();
        this.eventType = eventType;
        this.round = round;
        this.payload = payload == null ? new HashMap<>() : new HashMap<>(payload);
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public int getRound() {
        return round;
    }

    public void setRound(int round) {
        this.round = round;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, Object> payload) {
        this.payload = payload;
    }
}
