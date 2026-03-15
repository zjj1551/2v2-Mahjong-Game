package com.mahjong.service;

import com.mahjong.entity.FriendEntity;
import com.mahjong.entity.UserEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private FriendRepository friendRepository;

    private UserService userService;

    @BeforeEach
    void setUp() {
        userService = new UserService(userRepository, friendRepository);
    }

    @Test
    @DisplayName("注册时用户名重复应拒绝")
    void register_duplicateUsername_shouldThrow() {
        when(userRepository.existsByUsername("alice")).thenReturn(true);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> userService.register("alice", "secret123", "阿狸"));

        assertTrue(ex.getMessage().contains("用户名已存在"));
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("注册成功时应保存 BCrypt 密码")
    void register_shouldPersistEncodedPassword() {
        when(userRepository.existsByUsername("alice")).thenReturn(false);
        when(userRepository.existsByNickname("阿狸")).thenReturn(false);
        when(userRepository.save(any(UserEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        UserEntity saved = userService.register("alice", "secret123", "阿狸");

        assertEquals("alice", saved.getUsername());
        assertEquals("阿狸", saved.getNickname());
        assertNotEquals("secret123", saved.getPassword());
        assertTrue(new BCryptPasswordEncoder().matches("secret123", saved.getPassword()));
    }

    @Test
    @DisplayName("登录时密码错误返回 null")
    void login_wrongPassword_shouldReturnNull() throws Exception {
        UserEntity user = createUser(1L, "alice", "阿狸", "secret123");
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(user));

        UserEntity result = userService.login("alice", "bad-pass");

        assertNull(result);
        verify(userRepository, never()).save(any(UserEntity.class));
    }

    @Test
    @DisplayName("登录时封禁账号应抛错")
    void login_bannedUser_shouldThrow() throws Exception {
        UserEntity user = createUser(1L, "alice", "阿狸", "secret123");
        user.setStatus(1);
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(user));

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> userService.login("alice", "secret123"));

        assertEquals("账户已被封禁", ex.getMessage());
    }

    @Test
    @DisplayName("对方已有待处理申请时 addFriend 应直接互相关注")
    void addFriend_reversePendingRequest_shouldAcceptDirectly() {
        FriendEntity reverse = new FriendEntity();
        reverse.setId(10L);
        reverse.setUserId(2L);
        reverse.setFriendId(1L);
        reverse.setStatus(0);

        when(userRepository.findById(1L)).thenReturn(Optional.of(mock(UserEntity.class)));
        when(userRepository.findById(2L)).thenReturn(Optional.of(mock(UserEntity.class)));
        when(friendRepository.findByUserIdAndFriendId(1L, 2L)).thenReturn(Optional.empty());
        when(friendRepository.findByUserIdAndFriendId(2L, 1L)).thenReturn(Optional.of(reverse));

        userService.addFriend(1L, 2L);

        ArgumentCaptor<FriendEntity> captor = ArgumentCaptor.forClass(FriendEntity.class);
        verify(friendRepository, times(2)).save(captor.capture());
        List<FriendEntity> saved = captor.getAllValues();
        assertEquals(1, saved.get(0).getStatus());
        assertEquals(1, saved.get(1).getStatus());
        assertEquals(1L, saved.get(1).getUserId());
        assertEquals(2L, saved.get(1).getFriendId());
    }

    @Test
    @DisplayName("接受好友申请时应补齐反向好友关系")
    void acceptFriendRequest_shouldCreateReverseRelation() {
        FriendEntity req = new FriendEntity();
        req.setId(20L);
        req.setUserId(1L);
        req.setFriendId(2L);
        req.setStatus(0);

        when(friendRepository.findById(20L)).thenReturn(Optional.of(req));
        when(friendRepository.findByUserIdAndFriendId(2L, 1L)).thenReturn(Optional.empty());

        userService.acceptFriendRequest(2L, 20L);

        ArgumentCaptor<FriendEntity> captor = ArgumentCaptor.forClass(FriendEntity.class);
        verify(friendRepository, times(2)).save(captor.capture());
        List<FriendEntity> saved = captor.getAllValues();
        assertEquals(1, saved.get(0).getStatus());
        assertEquals(2L, saved.get(1).getUserId());
        assertEquals(1L, saved.get(1).getFriendId());
        assertEquals(1, saved.get(1).getStatus());
    }

    @Test
    @DisplayName("管理员接口在非管理员账号下应拒绝")
    void getAllUsers_nonAdmin_shouldThrow() throws Exception {
        UserEntity normalUser = createUser(1L, "alice", "阿狸", "secret123");
        normalUser.setRole(0);
        when(userRepository.findById(1L)).thenReturn(Optional.of(normalUser));

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> userService.getAllUsers(1L));

        assertEquals("无管理员权限", ex.getMessage());
    }

    private static UserEntity createUser(Long id, String username, String nickname, String rawPassword) throws Exception {
        UserEntity user = new UserEntity(username, new BCryptPasswordEncoder().encode(rawPassword), nickname);
        var field = UserEntity.class.getDeclaredField("id");
        field.setAccessible(true);
        field.set(user, id);
        return user;
    }
}
