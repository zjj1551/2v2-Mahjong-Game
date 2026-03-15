package com.mahjong.service;

import com.mahjong.model.Player;
import com.mahjong.model.Room;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RoomServiceTest {

    private final RoomService roomService = new RoomService();

    @Test
    @DisplayName("创建房间后可按 roomId 查询")
    void createRoom_shouldBeQueryable() {
        Room room = roomService.createRoom("测试房", 1001L);

        assertNotNull(room.getRoomId());
        assertEquals("测试房", room.getRoomName());
        assertSame(room, roomService.getRoom(room.getRoomId()));
    }

    @Test
    @DisplayName("注册 session 后可通过 userId 取回")
    void registerSession_shouldStoreMapping() {
        roomService.registerSession(1001L, "session-1");

        assertEquals("session-1", roomService.getSessionId(1001L));
    }

    @Test
    @DisplayName("绑定房间后可通过 session 查询房间")
    void bindSessionRoom_shouldFindRoomBySession() {
        Room room = roomService.createRoom("会话房", 1001L);
        roomService.bindSessionRoom("session-1", room.getRoomId());

        assertSame(room, roomService.getRoomBySession("session-1"));
        assertEquals(room.getRoomId(), roomService.getRoomIdBySession("session-1"));
    }

    @Test
    @DisplayName("用户在大厅中时也能通过 userId 找到房间")
    void getRoomByUserId_shouldFindLobbyUser() {
        Room room = roomService.createRoom("大厅房", 1001L);
        room.enterLobby(2001L, "大厅玩家");

        assertSame(room, roomService.getRoomByUserId(2001L));
    }

    @Test
    @DisplayName("最后一名用户离开时应自动移除空房间")
    void leaveRoom_whenEmpty_shouldRemoveRoom() {
        Room room = roomService.createRoom("空房删除", 1001L);
        room.enterLobby(2001L, "玩家A");

        assertTrue(roomService.leaveRoom(room.getRoomId(), 2001L));
        assertNull(roomService.getRoom(room.getRoomId()));
    }

    @Test
    @DisplayName("解散房间时应清理 session-room 绑定")
    void disbandRoom_shouldClearSessionBinding() {
        Room room = roomService.createRoom("解散房", 1001L);
        roomService.bindSessionRoom("session-1", room.getRoomId());

        Room removed = roomService.disbandRoom(room.getRoomId());

        assertSame(room, removed);
        assertNull(roomService.getRoom(room.getRoomId()));
        assertNull(roomService.getRoomIdBySession("session-1"));
    }

    @Test
    @DisplayName("joinRoom 成功时应返回座位并绑定 session")
    void joinRoom_shouldAssignSeatAndBindSession() {
        Room room = roomService.createRoom("入座房", 1001L);
        Player player = new Player(0, 2001L, "玩家A", "session-a");

        int seat = roomService.joinRoom(room.getRoomId(), player);

        assertEquals(0, seat);
        assertSame(room, roomService.getRoomBySession("session-a"));
        assertSame(player, roomService.getPlayerBySession("session-a"));
    }
}
