package com.mahjong.redis;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Redis 存储相关配置。
 */
@Component
@ConfigurationProperties(prefix = "app.redis")
public class RedisStoreProperties {

    private boolean enabled = false;
    private String keyPrefixRoom = "mahjong:room:";
    private String keyPrefixReplay = "mahjong:replay:";
    private int replayMaxEvents = 5000;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getKeyPrefixRoom() {
        return keyPrefixRoom;
    }

    public void setKeyPrefixRoom(String keyPrefixRoom) {
        this.keyPrefixRoom = keyPrefixRoom;
    }

    public String getKeyPrefixReplay() {
        return keyPrefixReplay;
    }

    public void setKeyPrefixReplay(String keyPrefixReplay) {
        this.keyPrefixReplay = keyPrefixReplay;
    }

    public int getReplayMaxEvents() {
        return replayMaxEvents;
    }

    public void setReplayMaxEvents(int replayMaxEvents) {
        this.replayMaxEvents = replayMaxEvents;
    }
}
