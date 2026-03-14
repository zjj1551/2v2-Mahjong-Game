package com.mahjong.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 用户实体（对应 mahjong_db.users 表）
 */
@Entity
@Table(name = "users")
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String username;

    @Column(nullable = false, length = 100)
    private String password; // BCrypt 加密后存储

    @Column(nullable = false, unique = true, length = 50)
    private String nickname;

    /** 用户总积分（赛事积分排行用） */
    @Column(name = "total_score", nullable = false)
    private int totalScore = 0;

    /** 总胜场 */
    @Column(name = "win_count", nullable = false)
    private int winCount = 0;

    /** 总局数 */
    @Column(name = "game_count", nullable = false)
    private int gameCount = 0;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "last_login")
    private LocalDateTime lastLogin;

    /** 账户状态：0=正常 1=封禁 */
    @Column(nullable = false)
    private int status = 0;

    /** 账户角色：0=普通用户 1=管理员 */
    @Column(nullable = false)
    private int role = 0;

    public UserEntity() {}

    public UserEntity(String username, String password, String nickname) {
        this.username = username;
        this.password = password;
        this.nickname = nickname;
    }

    // ─── Getters / Setters ───────────────────────────────────

    public Long getId() { return id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getNickname() { return nickname; }
    public void setNickname(String nickname) { this.nickname = nickname; }

    public int getTotalScore() { return totalScore; }
    public void addTotalScore(int delta) { this.totalScore += delta; }

    public int getWinCount() { return winCount; }
    public void incrementWinCount() { this.winCount++; }

    public int getGameCount() { return gameCount; }
    public void incrementGameCount() { this.gameCount++; }

    public LocalDateTime getCreatedAt() { return createdAt; }

    public LocalDateTime getLastLogin() { return lastLogin; }
    public void setLastLogin(LocalDateTime lastLogin) { this.lastLogin = lastLogin; }

    public int getStatus() { return status; }
    public void setStatus(int status) { this.status = status; }

    public int getRole() { return role; }
    public void setRole(int role) { this.role = role; }
}
