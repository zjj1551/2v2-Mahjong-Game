package com.mahjong.controller;

import com.mahjong.entity.UserEntity;
import com.mahjong.entity.GameRecordEntity;
import com.mahjong.service.GameRecordRepository;
import com.mahjong.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 用户管理 REST 接口
 */
@RestController
@RequestMapping("/api/user")
public class UserController {

    private final UserService userService;
    private final GameRecordRepository gameRecordRepository;

    public UserController(UserService userService, GameRecordRepository gameRecordRepository) {
        this.userService = userService;
        this.gameRecordRepository = gameRecordRepository;
    }

    /**
     * 用户注册
     * POST /api/user/register
     * Body: { "username": "xxx", "password": "xxx", "nickname": "xxx" }
     */
    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String password = body.get("password");
        String nickname = body.get("nickname");

        if (username == null || password == null || nickname == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", "参数不完整"));
        }
        if (username.length() < 3 || username.length() > 50) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", "用户名长度需为3~50"));
        }
        if (password.length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", "密码至少6位"));
        }

        try {
            UserEntity user = userService.register(username, password, nickname);
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("userId", user.getId());
            result.put("nickname", user.getNickname());
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 用户登录
     * POST /api/user/login
     * Body: { "username": "xxx", "password": "xxx" }
     */
    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String password = body.get("password");

        if (username == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", "参数不完整"));
        }

        try {
            UserEntity user = userService.login(username, password);
            if (user == null) {
                return ResponseEntity.ok(Map.of("success", false, "msg", "用户名或密码错误"));
            }
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("userId", user.getId());
            result.put("username", user.getUsername());
            result.put("nickname", user.getNickname());
            result.put("role", user.getRole());
            result.put("status", user.getStatus());
            result.put("totalScore", user.getTotalScore());
            result.put("winCount", user.getWinCount());
            result.put("gameCount", user.getGameCount());
            return ResponseEntity.ok(result);
        } catch (IllegalStateException e) {
            return ResponseEntity.ok(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 获取用户信息
     * GET /api/user/{userId}
     */
    @GetMapping("/{userId}")
    public ResponseEntity<Map<String, Object>> getUserInfo(@PathVariable Long userId) {
        Optional<UserEntity> opt = userService.findById(userId);
        if (opt.isEmpty()) {
            return ResponseEntity.ok(Map.of("success", false, "msg", "用户不存在"));
        }
        UserEntity user = opt.get();
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("userId", user.getId());
        result.put("nickname", user.getNickname());
        result.put("role", user.getRole());
        result.put("status", user.getStatus());
        result.put("totalScore", user.getTotalScore());
        result.put("winCount", user.getWinCount());
        result.put("gameCount", user.getGameCount());
        return ResponseEntity.ok(result);
    }

    /**
     * 修改昵称
     * PUT /api/user/{userId}/nickname
     * Body: { "nickname": "新昵称" }
     */
    @PutMapping("/{userId}/nickname")
    public ResponseEntity<Map<String, Object>> updateNickname(
            @PathVariable Long userId, @RequestBody Map<String, String> body) {
        String newNickname = body.get("nickname");
        if (newNickname == null || newNickname.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", "昵称不能为空"));
        }
        try {
            UserEntity user = userService.updateNickname(userId, newNickname);
            return ResponseEntity.ok(Map.of("success", true, "nickname", user.getNickname()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 积分排行榜
     * GET /api/user/leaderboard?top=10
     */
    @GetMapping("/leaderboard")
    public ResponseEntity<Map<String, Object>> leaderboard(@RequestParam(defaultValue = "10") int top) {
        List<UserEntity> leaders = userService.getLeaderboard(top);
        List<Map<String, Object>> list = leaders.stream().map(u -> {
            Map<String, Object> m = new HashMap<>();
            m.put("userId", u.getId());
            m.put("nickname", u.getNickname());
            m.put("totalScore", u.getTotalScore());
            m.put("winCount", u.getWinCount());
            m.put("gameCount", u.getGameCount());
            return m;
        }).toList();
        return ResponseEntity.ok(Map.of("success", true, "leaderboard", list));
    }

    // --- 好友系统 API ---

    /**
     * 添加好友 (或发送申请)
     * POST /api/user/friend/add
     * Body: { "userId": 1, "friendId": 2 }
     */
    @PostMapping("/friend/add")
    public ResponseEntity<Map<String, Object>> addFriend(@RequestBody Map<String, Long> body) {
        Long userId = body.get("userId");
        Long friendId = body.get("friendId");

        if (userId == null || friendId == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", "参数不完整"));
        }

        try {
            userService.addFriend(userId, friendId);
            return ResponseEntity.ok(Map.of("success", true, "msg", "操作成功"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 获取好友列表
     * GET /api/user/{id}/friends
     */
    @GetMapping("/{id}/friends")
    public ResponseEntity<Map<String, Object>> getFriends(@PathVariable Long id) {
        try {
            List<Map<String, Object>> friends = userService.getFriends(id);
            return ResponseEntity.ok(Map.of("success", true, "friends", friends));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 获取待处理的好友申请
     * GET /api/user/{id}/friend-requests
     */
    @GetMapping("/{id}/friend-requests")
    public ResponseEntity<Map<String, Object>> getPendingRequests(@PathVariable Long id) {
        try {
            List<Map<String, Object>> requests = userService.getPendingRequests(id);
            return ResponseEntity.ok(Map.of("success", true, "requests", requests));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 接受好友申请
     * POST /api/user/friend/accept/{requestId}?userId=xxx
     */
    @PostMapping("/friend/accept/{requestId}")
    public ResponseEntity<Map<String, Object>> acceptFriendRequest(
            @PathVariable Long requestId, @RequestParam Long userId) {
        try {
            userService.acceptFriendRequest(userId, requestId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 拒绝好友申请
     * POST /api/user/friend/reject/{requestId}?userId=xxx
     */
    @PostMapping("/friend/reject/{requestId}")
    public ResponseEntity<Map<String, Object>> rejectFriendRequest(
            @PathVariable Long requestId, @RequestParam Long userId) {
        try {
            userService.rejectFriendRequest(userId, requestId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 获取用户历史对局记录
     * GET /api/user/{id}/records
     */
    @GetMapping("/{id}/records")
    public ResponseEntity<Map<String, Object>> getUserRecords(
            @PathVariable Long id,
            @RequestParam(defaultValue = "20") int limit) {
        List<GameRecordEntity> records = gameRecordRepository.findByWinnerIdOrderByCreatedAtDesc(id);
        List<Map<String, Object>> list = records.stream().limit(limit).map(r -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", r.getId());
            m.put("roomId", r.getRoomId());
            m.put("roundNum", r.getRoundNum());
            m.put("winnerId", r.getWinnerId());
            m.put("loserId", r.getLoserId());
            m.put("score", r.getScore());
            m.put("winType", r.getWinType());
            m.put("scoreSnapshot", r.getScoreSnapshot());
            m.put("createdAt", r.getCreatedAt());
            return m;
        }).toList();
        return ResponseEntity.ok(Map.of("success", true, "records", list));
    }

    // --- 管理员 API ---

    /**
     * 设置用户角色
     * POST /api/user/admin/set-role
     * Body: { "adminId": 1, "targetUserId": 2, "role": 1 }
     */
    @PostMapping("/admin/set-role")
    public ResponseEntity<Map<String, Object>> setRole(@RequestBody Map<String, Object> body) {
        try {
            Long adminId = Long.valueOf(body.get("adminId").toString());
            Long targetUserId = Long.valueOf(body.get("targetUserId").toString());
            int role = Integer.parseInt(body.get("role").toString());
            userService.updateUserRole(adminId, targetUserId, role);
            return ResponseEntity.ok(Map.of("success", true, "msg", "角色修改成功"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 设置用户状态 (封禁/解封)
     * POST /api/user/admin/set-status
     * Body: { "adminId": 1, "targetUserId": 2, "status": 1 }
     */
    @PostMapping("/admin/set-status")
    public ResponseEntity<Map<String, Object>> setStatus(@RequestBody Map<String, Object> body) {
        try {
            Long adminId = Long.valueOf(body.get("adminId").toString());
            Long targetUserId = Long.valueOf(body.get("targetUserId").toString());
            int status = Integer.parseInt(body.get("status").toString());
            userService.updateUserStatus(adminId, targetUserId, status);
            return ResponseEntity.ok(Map.of("success", true, "msg", "状态修改成功"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 修改用户密码
     * POST /api/user/admin/reset-password
     * Body: { "adminId": 1, "targetUserId": 2, "newPassword": "xxx" }
     */
    @PostMapping("/admin/reset-password")
    public ResponseEntity<Map<String, Object>> resetPassword(@RequestBody Map<String, Object> body) {
        try {
            Long adminId = Long.valueOf(body.get("adminId").toString());
            Long targetUserId = Long.valueOf(body.get("targetUserId").toString());
            String newPassword = body.get("newPassword").toString();
            if (newPassword.length() < 6) {
                return ResponseEntity.badRequest().body(Map.of("success", false, "msg", "新密码至少6位"));
            }
            userService.resetUserPassword(adminId, targetUserId, newPassword);
            return ResponseEntity.ok(Map.of("success", true, "msg", "密码重置成功"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 修改用户总积分
     * POST /api/user/admin/update-score
     * Body: { "adminId": 1, "targetUserId": 2, "score": 1000 }
     */
    @PostMapping("/admin/update-score")
    public ResponseEntity<Map<String, Object>> updateScore(@RequestBody Map<String, Object> body) {
        try {
            Long adminId = Long.valueOf(body.get("adminId").toString());
            Long targetUserId = Long.valueOf(body.get("targetUserId").toString());
            int score = Integer.parseInt(body.get("score").toString());
            userService.updateUserScore(adminId, targetUserId, score);
            return ResponseEntity.ok(Map.of("success", true, "msg", "积分修改成功"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }

    /**
     * 获取所有用户列表 (管理员专用)
     * GET /api/user/admin/users?adminId=1
     */
    @GetMapping("/admin/users")
    public ResponseEntity<Map<String, Object>> getAllUsers(@RequestParam Long adminId) {
        try {
            List<UserEntity> users = userService.getAllUsers(adminId);
            List<Map<String, Object>> list = users.stream().map(u -> {
                Map<String, Object> m = new HashMap<>();
                m.put("userId", u.getId());
                m.put("username", u.getUsername());
                m.put("nickname", u.getNickname());
                m.put("role", u.getRole());
                m.put("status", u.getStatus());
                m.put("totalScore", u.getTotalScore());
                m.put("winCount", u.getWinCount());
                m.put("gameCount", u.getGameCount());
                m.put("createdAt", u.getCreatedAt() != null ? u.getCreatedAt().toString() : null);
                m.put("lastLogin", u.getLastLogin() != null ? u.getLastLogin().toString() : null);
                return m;
            }).toList();
            return ResponseEntity.ok(Map.of("success", true, "users", list));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "msg", e.getMessage()));
        }
    }
}
