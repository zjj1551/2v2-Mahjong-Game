package com.mahjong.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mahjong.model.Room;
import com.mahjong.service.GameRecordRepository;
import com.mahjong.service.RoomService;
import com.mahjong.service.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RoomController.class)
class RoomControllerWebMvcTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private RoomService roomService;

    @MockBean
    private GameRecordRepository gameRecordRepository;

    @MockBean
    private UserRepository userRepository;

    @Test
    @DisplayName("创建房间时写入可选配置")
    void createRoom_shouldApplyOptionalSettings() throws Exception {
        Room room = new Room("R100", "竞技房", 7L);
        when(roomService.createRoom("竞技房", 7L)).thenReturn(room);

        mockMvc.perform(post("/api/room/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "roomName", "竞技房",
                                "creatorId", 7,
                                "baseScore", 5,
                                "maxRounds", 16,
                                "allowChi", true,
                                "enableFengYu", false))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.roomId").value("R100"))
                .andExpect(jsonPath("$.roomName").value("竞技房"));

        org.junit.jupiter.api.Assertions.assertEquals(5, room.getBaseScore());
        org.junit.jupiter.api.Assertions.assertEquals(16, room.getMaxRounds());
        org.junit.jupiter.api.Assertions.assertTrue(room.isAllowChi());
        org.junit.jupiter.api.Assertions.assertFalse(room.isEnableFengYu());
    }

    @Test
    @DisplayName("房间列表返回等待中的房间")
    void listRooms_shouldReturnWaitingRooms() throws Exception {
        Room room = new Room("R101", "大厅房", 9L);
        when(roomService.listWaitingRooms()).thenReturn(List.of(room));

        mockMvc.perform(get("/api/room/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.rooms[0].roomId").value("R101"))
                .andExpect(jsonPath("$.rooms[0].roomName").value("大厅房"));
    }

    @Test
    @DisplayName("房间详情返回座位与大厅用户")
    void getRoomInfo_shouldReturnSeatsAndLobbyUsers() throws Exception {
        Room room = new Room("R102", "细节房", 9L);
        room.enterLobby(11L, "观战者");
        room.enterLobby(7L, "房主");
        room.chooseSeat(7L, 0, "session-7");
        room.setReady(7L, true);

        when(roomService.getRoom("R102")).thenReturn(room);

        mockMvc.perform(get("/api/room/R102"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.roomId").value("R102"))
                .andExpect(jsonPath("$.seats[0].occupied").value(true))
                .andExpect(jsonPath("$.seats[0].nickname").value("房主"))
                .andExpect(jsonPath("$.lobbyUsers[0].nickname").value("观战者"));
    }

    @Test
    @DisplayName("非房主不能解散房间")
    void disbandRoom_nonOwner_shouldReject() throws Exception {
        Room room = new Room("R103", "不可解散房", 1L);
        when(roomService.getRoom("R103")).thenReturn(room);

        mockMvc.perform(delete("/api/room/R103").param("creatorId", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.msg").value("只有房主才能解散房间"));

        verify(roomService, never()).disbandRoom("R103");
    }
}
