package com.mahjong.service;

import com.mahjong.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 用户数据访问层
 */
@Repository
public interface UserRepository extends JpaRepository<UserEntity, Long> {

    Optional<UserEntity> findByUsername(String username);

    Optional<UserEntity> findByNickname(String nickname);

    boolean existsByUsername(String username);

    boolean existsByNickname(String nickname);
}
