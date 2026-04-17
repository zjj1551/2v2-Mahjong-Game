package com.mahjong.service;

import com.mahjong.entity.FriendEntity;
import com.mahjong.entity.UserEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用户服务：注册、登录、信息查询
 */
@Service
public class UserService {

    private final UserRepository userRepository;
    private final FriendRepository friendRepository;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Autowired
    public UserService(UserRepository userRepository, FriendRepository friendRepository) {
        this.userRepository = userRepository;
        this.friendRepository = friendRepository;
    }

    /**
     * 用户注册
     *
     * @return 注册成功的用户实体；失败抛出异常
     */
    public UserEntity register(String username, String rawPassword, String nickname) {
        if (userRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("用户名已存在: " + username);
        }
        if (userRepository.existsByNickname(nickname)) {
            throw new IllegalArgumentException("昵称已被使用: " + nickname);
        }

        UserEntity user = new UserEntity(username, passwordEncoder.encode(rawPassword), nickname);
        user.setTotalScore(1000);
        return userRepository.save(user);
    }

    /**
     * 用户登录验证
     *
     * @return 登录成功的用户实体；失败返回 null
     */
    public UserEntity login(String username, String rawPassword) {
        Optional<UserEntity> opt = userRepository.findByUsername(username);
        if (opt.isEmpty())
            return null;

        UserEntity user = opt.get();
        if (user.getStatus() == 1) {
            throw new IllegalStateException("账户已被封禁");
        }
        normalizeIfNeeded(user);
        if (!passwordEncoder.matches(rawPassword, user.getPassword())) {
            return null;
        }

        user.setLastLogin(LocalDateTime.now());
        userRepository.save(user);
        return user;
    }

    /**
     * 根据ID获取用户
     */
    public Optional<UserEntity> findById(Long id) {
        Optional<UserEntity> opt = userRepository.findById(id);
        opt.ifPresent(this::normalizeIfNeeded);
        return opt;
    }

    /**
     * 更新昵称
     */
    public UserEntity updateNickname(Long userId, String newNickname) {
        if (userRepository.existsByNickname(newNickname)) {
            throw new IllegalArgumentException("昵称已被使用: " + newNickname);
        }
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("用户不存在"));
        user.setNickname(newNickname);
        return userRepository.save(user);
    }

    /**
     * 积分排行榜（Top N）
     */
    public java.util.List<UserEntity> getLeaderboard(int topN) {
        java.util.List<UserEntity> leaderboard = userRepository.findAll(
                org.springframework.data.domain.PageRequest.of(0, topN,
                        org.springframework.data.domain.Sort.by(
                                org.springframework.data.domain.Sort.Direction.DESC, "totalScore")))
                .getContent();
        leaderboard.forEach(this::normalizeIfNeeded);
        return leaderboard;
    }

    // --- 管理员操作 ---
    
    private void checkAdmin(Long adminId) {
        UserEntity admin = userRepository.findById(adminId)
                .orElseThrow(() -> new IllegalArgumentException("管理员账号不存在"));
        if (admin.getRole() != 1) {
            throw new IllegalStateException("无管理员权限");
        }
    }

    /**
     * 赋予或取消管理员权限
     */
    @Transactional
    public void updateUserRole(Long adminId, Long targetUserId, int role) {
        checkAdmin(adminId);
        UserEntity targetUser = userRepository.findById(targetUserId)
                .orElseThrow(() -> new IllegalArgumentException("目标用户不存在"));
        targetUser.setRole(role);
        userRepository.save(targetUser);
    }

    /**
     * 封禁或解封账号
     */
    @Transactional
    public void updateUserStatus(Long adminId, Long targetUserId, int status) {
        checkAdmin(adminId);
        UserEntity targetUser = userRepository.findById(targetUserId)
                .orElseThrow(() -> new IllegalArgumentException("目标用户不存在"));
        targetUser.setStatus(status);
        userRepository.save(targetUser);
    }

    /**
     * 管理员修改其他用户密码
     */
    @Transactional
    public void resetUserPassword(Long adminId, Long targetUserId, String newPassword) {
        checkAdmin(adminId);
        UserEntity targetUser = userRepository.findById(targetUserId)
                .orElseThrow(() -> new IllegalArgumentException("目标用户不存在"));
        targetUser.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(targetUser);
    }

    /**
     * 管理员修改用户积分
     */
    @Transactional
    public void updateUserScore(Long adminId, Long targetUserId, int score) {
        checkAdmin(adminId);
        UserEntity targetUser = userRepository.findById(targetUserId)
                .orElseThrow(() -> new IllegalArgumentException("目标用户不存在"));
        targetUser.addTotalScore(score - targetUser.getTotalScore()); // 直接设置为目标积分
        userRepository.save(targetUser);
    }

    /**
     * 管理员获取所有用户列表（分页或全部，这里简单返回全部以供管理）
     */
    public List<UserEntity> getAllUsers(Long adminId) {
        checkAdmin(adminId);
        List<UserEntity> users = userRepository.findAll();
        users.forEach(this::normalizeIfNeeded);
        return users;
    }

    private void normalizeIfNeeded(UserEntity user) {
        if (user.getTotalScore() <= 0) {
            user.setTotalScore(500);
            userRepository.save(user);
        }
    }

    // --- 好友系统 ---

    @Transactional
    public void addFriend(Long userId, Long friendId) {
        if (userId.equals(friendId)) {
            throw new IllegalArgumentException("不能添加自己为好友");
        }
        if (userRepository.findById(userId).isEmpty() || userRepository.findById(friendId).isEmpty()) {
            throw new IllegalArgumentException("用户不存在");
        }

        // 检查是否已经是好友或已发送请求
        Optional<FriendEntity> relation = friendRepository.findByUserIdAndFriendId(userId, friendId);
        if (relation.isPresent()) {
            throw new IllegalArgumentException("好友关系已存在或正在申请中");
        }

        // 双向查找，也可能对方发了申请
        Optional<FriendEntity> reverseRelation = friendRepository.findByUserIdAndFriendId(friendId, userId);
        if (reverseRelation.isPresent() && reverseRelation.get().getStatus() == 0) {
            // 对方已经发了申请，直接同意
            FriendEntity target = reverseRelation.get();
            target.setStatus(1);
            friendRepository.save(target);

            // 建立双向
            FriendEntity rel = new FriendEntity();
            rel.setUserId(userId);
            rel.setFriendId(friendId);
            rel.setStatus(1);
            friendRepository.save(rel);
            return;
        }

        FriendEntity friendReq = new FriendEntity();
        friendReq.setUserId(userId);
        friendReq.setFriendId(friendId);
        friendReq.setStatus(0); // 待对方确认
        friendRepository.save(friendReq);
    }

    @Transactional
    public void acceptFriendRequest(Long userId, Long requestId) {
        FriendEntity req = friendRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("申请不存在"));
        if (!req.getFriendId().equals(userId)) {
            throw new IllegalArgumentException("无权操作");
        }
        if (req.getStatus() != 0) {
            throw new IllegalArgumentException("该申请已处理");
        }
        req.setStatus(1);
        friendRepository.save(req);

        // 建立反向好友关系
        Optional<FriendEntity> reverse = friendRepository.findByUserIdAndFriendId(userId, req.getUserId());
        if (reverse.isEmpty()) {
            FriendEntity rel = new FriendEntity();
            rel.setUserId(userId);
            rel.setFriendId(req.getUserId());
            rel.setStatus(1);
            friendRepository.save(rel);
        } else {
            reverse.get().setStatus(1);
            friendRepository.save(reverse.get());
        }
    }

    @Transactional
    public void rejectFriendRequest(Long userId, Long requestId) {
        FriendEntity req = friendRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("申请不存在"));
        if (!req.getFriendId().equals(userId)) {
            throw new IllegalArgumentException("无权操作");
        }
        friendRepository.delete(req);
    }

    public List<Map<String, Object>> getPendingRequests(Long userId) {
        List<FriendEntity> pending = friendRepository.findByFriendId(userId).stream()
                .filter(r -> r.getStatus() == 0).toList();
        List<Map<String, Object>> result = new java.util.ArrayList<>();
        for (FriendEntity rel : pending) {
            userRepository.findById(rel.getUserId()).ifPresent(u -> {
                result.add(Map.of(
                        "requestId", rel.getId(),
                        "fromUserId", u.getId(),
                        "nickname", u.getNickname()));
            });
        }
        return result;
    }

    public List<Map<String, Object>> getFriends(Long userId) {
        List<FriendEntity> relations = friendRepository.findByUserId(userId);
        List<Map<String, Object>> friends = new ArrayList<>();

        for (FriendEntity rel : relations) {
            if (rel.getStatus() == 1) { // 仅返回已成为好友的
                userRepository.findById(rel.getFriendId()).ifPresent(u -> {
                    friends.add(Map.of(
                            "friendId", u.getId(),
                            "username", u.getUsername(),
                            "nickname", u.getNickname(),
                            "totalScore", u.getTotalScore()));
                });
            }
        }
        return friends;
    }
}
