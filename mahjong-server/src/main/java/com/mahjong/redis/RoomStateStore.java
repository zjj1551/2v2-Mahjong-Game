package com.mahjong.redis;

import com.mahjong.model.Room;

import java.util.List;
import java.util.Optional;

public interface RoomStateStore {

    void saveRoom(Room room);

    void deleteRoom(String roomId);

    Optional<RoomSnapshot> findRoom(String roomId);

    List<RoomSnapshot> findAllRooms();
}
