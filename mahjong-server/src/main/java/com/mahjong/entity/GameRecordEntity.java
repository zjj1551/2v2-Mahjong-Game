package com.mahjong.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 对局记录实体（对应 mahjong_db.game_records 表）
 */
@Entity
@Table(name = "game_records")
public class GameRecordEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_id", nullable = false, length = 64)
    private String roomId;

    /** 第几局 */
    @Column(name = "round_num", nullable = false)
    private int roundNum;

    /** 胡牌玩家userId */
    @Column(name = "winner_id")
    private Long winnerId;

    /** 出炮玩家userId（自摸为null） */
    @Column(name = "loser_id")
    private Long loserId;

    /** 番型描述（如"清一色门清自摸"） */
    @Column(name = "win_type", length = 100)
    private String winType;

    /** 本局得分（胡牌玩家获得的分） */
    @Column(name = "score")
    private int score;

    /** 局结束时4人积分快照（JSON格式） */
    @Column(name = "score_snapshot", length = 512)
    private String scoreSnapshot;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public GameRecordEntity() {}

    // ─── Getters / Setters ───────────────────────────────────

    public Long getId() { return id; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public int getRoundNum() { return roundNum; }
    public void setRoundNum(int roundNum) { this.roundNum = roundNum; }

    public Long getWinnerId() { return winnerId; }
    public void setWinnerId(Long winnerId) { this.winnerId = winnerId; }

    public Long getLoserId() { return loserId; }
    public void setLoserId(Long loserId) { this.loserId = loserId; }

    public String getWinType() { return winType; }
    public void setWinType(String winType) { this.winType = winType; }

    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }

    public String getScoreSnapshot() { return scoreSnapshot; }
    public void setScoreSnapshot(String scoreSnapshot) { this.scoreSnapshot = scoreSnapshot; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
