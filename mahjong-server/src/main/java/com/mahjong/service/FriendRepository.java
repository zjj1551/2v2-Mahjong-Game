package com.mahjong.service;

import com.mahjong.entity.FriendEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FriendRepository extends JpaRepository<FriendEntity, Long> {

    List<FriendEntity> findByUserId(Long userId);
    List<FriendEntity> findByFriendId(Long friendId);

    Optional<FriendEntity> findByUserIdAndFriendId(Long userId, Long friendId);
}
