-- ============================================================
-- 四川双打竞技麻将比赛系统 - 数据库初始化脚本
-- 使用方法: 在 Navicat 中打开此文件并执行
-- ============================================================

-- 1. 创建数据库
CREATE DATABASE IF NOT EXISTS mahjong_db
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE mahjong_db;

-- 2. 用户表
CREATE TABLE IF NOT EXISTS users (
    id              BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '用户ID',
    username        VARCHAR(50)     NOT NULL                 COMMENT '用户名（登录用）',
    password        VARCHAR(100)    NOT NULL                 COMMENT '密码（BCrypt加密）',
    nickname        VARCHAR(50)     NOT NULL                 COMMENT '昵称（显示用）',
    total_score     INT             NOT NULL DEFAULT 0       COMMENT '总积分',
    win_count       INT             NOT NULL DEFAULT 0       COMMENT '总胜场',
    game_count      INT             NOT NULL DEFAULT 0       COMMENT '总局数',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
    last_login      DATETIME                                 COMMENT '最后登录时间',
    status          INT             NOT NULL DEFAULT 0       COMMENT '状态: 0=正常 1=封禁',
    PRIMARY KEY (id),
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 3. 对局记录表
CREATE TABLE IF NOT EXISTS game_records (
    id              BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '记录ID',
    room_id         VARCHAR(64)     NOT NULL                 COMMENT '房间ID',
    round_num       INT             NOT NULL                 COMMENT '第几局',
    winner_id       BIGINT                                   COMMENT '胡牌玩家ID',
    loser_id        BIGINT                                   COMMENT '出炮玩家ID（自摸为NULL）',
    win_type        VARCHAR(100)                             COMMENT '番型描述',
    score           INT             DEFAULT 0                COMMENT '本局得分',
    score_snapshot  VARCHAR(512)                             COMMENT '积分快照（JSON）',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    PRIMARY KEY (id),
    INDEX idx_room_id (room_id),
    INDEX idx_winner_id (winner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对局记录表';

-- 4. 好友表
CREATE TABLE IF NOT EXISTS friends (
    id              BIGINT          NOT NULL AUTO_INCREMENT  COMMENT '关联ID',
    user_id         BIGINT          NOT NULL                 COMMENT '发起方ID',
    friend_id       BIGINT          NOT NULL                 COMMENT '接收方ID',
    status          INT             NOT NULL DEFAULT 0       COMMENT '状态: 0=申请中, 1=已添加',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_friend (user_id, friend_id),
    INDEX idx_user_id (user_id),
    INDEX idx_friend_id (friend_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友关系表';

-- 5. 插入测试账号（密码均为 123456，BCrypt加密后）
INSERT INTO users (username, password, nickname) VALUES
    ('player1', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBpGOUKG4Lhm2W', '东风侠'),
    ('player2', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBpGOUKG4Lhm2W', '南天门'),
    ('player3', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBpGOUKG4Lhm2W', '西域客'),
    ('player4', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBpGOUKG4Lhm2W', '北极星');

SELECT '✅ 数据库初始化完成！' AS result;
SELECT CONCAT('已创建 ', COUNT(*), ' 个测试账号（密码均为 123456）') AS info FROM users;
