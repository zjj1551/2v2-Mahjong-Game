package com.mahjong.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mahjong.entity.UserEntity;
import com.mahjong.service.GameRecordRepository;
import com.mahjong.service.UserRepository;
import com.mahjong.service.UserService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UserController.class)
class UserControllerWebMvcTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserService userService;

    @MockBean
    private GameRecordRepository gameRecordRepository;

    @MockBean
    private UserRepository userRepository;

    @Test
    @DisplayName("注册成功返回 userId 与昵称")
    void register_shouldReturnCreatedUser() throws Exception {
        UserEntity user = new UserEntity("alice", "encoded", "阿狸");
        user.setNickname("阿狸");
        setUserId(user, 101L);

        when(userService.register("alice", "secret123", "阿狸")).thenReturn(user);

        mockMvc.perform(post("/api/user/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "alice",
                                "password", "secret123",
                                "nickname", "阿狸"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.userId").value(101))
                .andExpect(jsonPath("$.nickname").value("阿狸"));
    }

    @Test
    @DisplayName("注册缺少参数时返回 400")
    void register_missingField_shouldReturnBadRequest() throws Exception {
        mockMvc.perform(post("/api/user/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "alice",
                                "password", "secret123"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));

        verify(userService, never()).register(any(), any(), any());
    }

    @Test
    @DisplayName("登录成功返回用户概要")
    void login_shouldReturnUserProfile() throws Exception {
        UserEntity user = new UserEntity("alice", "encoded", "阿狸");
        setUserId(user, 101L);
        user.setRole(1);
        user.setStatus(0);
        user.addTotalScore(88);
        user.incrementWinCount();
        user.incrementGameCount();

        when(userService.login("alice", "secret123")).thenReturn(user);

        mockMvc.perform(post("/api/user/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "alice",
                                "password", "secret123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.userId").value(101))
                .andExpect(jsonPath("$.role").value(1))
            .andExpect(jsonPath("$.totalScore").value(1088))
            .andExpect(jsonPath("$.avatarChar").value("阿"));
    }

    @Test
    @DisplayName("排行榜接口返回列表")
    void leaderboard_shouldReturnRankedUsers() throws Exception {
        UserEntity alice = new UserEntity("alice", "encoded", "阿狸");
        setUserId(alice, 1L);
        alice.addTotalScore(120);
        UserEntity bob = new UserEntity("bob", "encoded", "鲍勃");
        setUserId(bob, 2L);
        bob.addTotalScore(80);

        when(userService.getLeaderboard(5)).thenReturn(List.of(alice, bob));

        mockMvc.perform(get("/api/user/leaderboard").param("top", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.leaderboard[0].userId").value(1))
                .andExpect(jsonPath("$.leaderboard[0].totalScore").value(1120))
                .andExpect(jsonPath("$.leaderboard[1].userId").value(2));
    }

    @Test
    @DisplayName("重置密码过短时应返回 400")
    void resetPassword_shortPassword_shouldReject() throws Exception {
        mockMvc.perform(post("/api/user/admin/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "adminId", 1,
                                "targetUserId", 2,
                                "newPassword", "123"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.msg").value("新密码至少6位"));
    }

    @Test
    @DisplayName("获取用户信息时透传用户字段")
    void getUserInfo_shouldReturnUserData() throws Exception {
        UserEntity user = new UserEntity("alice", "encoded", "阿狸");
        setUserId(user, 101L);
        user.addTotalScore(66);

        when(userService.findById(101L)).thenReturn(Optional.of(user));

        mockMvc.perform(get("/api/user/101"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.userId").value(101))
                .andExpect(jsonPath("$.nickname").value("阿狸"))
                .andExpect(jsonPath("$.totalScore").value(1066))
                .andExpect(jsonPath("$.avatarColor").exists());
    }

    private static void setUserId(UserEntity user, Long id) throws Exception {
        var field = UserEntity.class.getDeclaredField("id");
        field.setAccessible(true);
        field.set(user, id);
    }
}
