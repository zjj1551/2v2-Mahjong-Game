package com.mahjong.service;

import com.mahjong.entity.GameRecordEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 对局记录数据访问层
 */
@Repository
public interface GameRecordRepository extends JpaRepository<GameRecordEntity, Long> {

    List<GameRecordEntity> findByRoomIdOrderByRoundNumAsc(String roomId);

    List<GameRecordEntity> findByWinnerIdOrderByCreatedAtDesc(Long winnerId);
}
