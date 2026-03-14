package com.mahjong.engine;

import com.mahjong.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * GameEngine 单元测试
 */
class GameEngineTest {

    private Room room;
    private GameEngine engine;

    @BeforeEach
    void setUp() {
        room = new Room("TEST_ROOM", "测试房间", 1000L);
        for (int i = 0; i < 4; i++) {
            Player player = new Player(i, 1000 + i, "玩家" + i, "session" + i);
            room.join(player);
        }
        engine = new GameEngine(room);
    }

    // ─── 开局测试 ────────────────────────────────────────────

    @Nested
    @DisplayName("开局测试")
    class StartRoundTests {

        @Test
        @DisplayName("开局后庄家应有14张牌")
        void startNewRound_bankerShouldHave14() {
            int bankerSeat = 0;
            List<List<Tile>> hands = engine.startNewRound(bankerSeat);

            assertEquals(14, hands.get(bankerSeat).size(), "庄家应有14张牌");
        }

        @Test
        @DisplayName("开局后闲家应各有13张牌")
        void startNewRound_othersShouldHave13() {
            int bankerSeat = 0;
            List<List<Tile>> hands = engine.startNewRound(bankerSeat);

            for (int i = 0; i < 4; i++) {
                if (i != bankerSeat) {
                    assertEquals(13, hands.get(i).size(), "座位" + i + "应有13张牌");
                }
            }
        }

        @Test
        @DisplayName("开局后游戏阶段应为SELECTING_MISS_SUIT")
        void startNewRound_phaseShouldBeSelectingMissSuit() {
            engine.startNewRound(0);
            assertEquals(GameState.Phase.SELECTING_MISS_SUIT, engine.getState().getPhase());
        }

        @Test
        @DisplayName("开局后牌墙应有55张牌")
        void startNewRound_wallShouldHave55() {
            engine.startNewRound(0);
            assertEquals(55, engine.getState().remainingWall());
        }

        @Test
        @DisplayName("人数不足4人应抛出异常")
        void startNewRound_lessThan4Players_shouldThrow() {
            Room smallRoom = new Room("SMALL", "小房间", 1000L);
            smallRoom.join(new Player(0, 1000, "玩家0", "s0"));
            GameEngine smallEngine = new GameEngine(smallRoom);

            assertThrows(IllegalStateException.class, () -> smallEngine.startNewRound(0));
        }
    }

    // ─── 定缺测试 ────────────────────────────────────────────

    @Nested
    @DisplayName("定缺测试")
    class MissSuitTests {

        @BeforeEach
        void startGame() {
            engine.startNewRound(0);
        }

        @Test
        @DisplayName("4人全部定缺后应进入PLAYING阶段")
        void selectMissSuit_allSelected_shouldEnterPlaying() {
            assertFalse(engine.selectMissSuit(0, 2)); // 第1人
            assertFalse(engine.selectMissSuit(1, 0)); // 第2人
            assertFalse(engine.selectMissSuit(2, 1)); // 第3人
            assertTrue(engine.selectMissSuit(3, 2)); // 第4人

            assertEquals(GameState.Phase.PLAYING, engine.getState().getPhase());
        }

        @Test
        @DisplayName("非定缺阶段选择定缺应抛出异常")
        void selectMissSuit_wrongPhase_shouldThrow() {
            // 先让所有人定缺完毕
            engine.selectMissSuit(0, 2);
            engine.selectMissSuit(1, 0);
            engine.selectMissSuit(2, 1);
            engine.selectMissSuit(3, 2);

            // 此时已进入PLAYING阶段，再定缺应抛异常
            assertThrows(IllegalStateException.class, () -> engine.selectMissSuit(0, 1));
        }

        @Test
        @DisplayName("无效花色索引应抛出异常")
        void selectMissSuit_invalidSuit_shouldThrow() {
            assertThrows(IllegalArgumentException.class, () -> engine.selectMissSuit(0, 5));
            assertThrows(IllegalArgumentException.class, () -> engine.selectMissSuit(0, -1));
        }

        @Test
        @DisplayName("重复定缺应抛出异常")
        void selectMissSuit_duplicateSelection_shouldThrow() {
            engine.selectMissSuit(0, 2);
            assertThrows(IllegalStateException.class, () -> engine.selectMissSuit(0, 1));
        }
    }

    // ─── 出牌测试 ────────────────────────────────────────────

    @Nested
    @DisplayName("出牌测试")
    class DiscardTests {

        @BeforeEach
        void startAndSelectMissSuit() {
            engine.startNewRound(0);
            engine.selectMissSuit(0, 2);
            engine.selectMissSuit(1, 2);
            engine.selectMissSuit(2, 2);
            engine.selectMissSuit(3, 2);
        }

        @Test
        @DisplayName("庄家应能出牌")
        void discard_banker_shouldWork() {
            Player banker = room.getPlayer(0);
            int tileId = banker.getHandTiles().get(0).getTileId();

            GameEngine.DiscardResult result = engine.discard(0, tileId);
            assertNotNull(result);
            assertEquals(tileId, result.discardedTile.getTileId());
            assertEquals(0, result.fromSeat);
        }

        @Test
        @DisplayName("出牌后庄家手牌应减少1张")
        void discard_shouldRemoveOneFromHand() {
            Player banker = room.getPlayer(0);
            int beforeSize = banker.getHandTiles().size();
            int tileId = banker.getHandTiles().get(0).getTileId();

            engine.discard(0, tileId);

            assertEquals(beforeSize - 1, banker.getHandTiles().size());
        }

        @Test
        @DisplayName("不轮到的玩家出牌应抛出异常")
        void discard_wrongTurn_shouldThrow() {
            assertThrows(IllegalStateException.class, () -> engine.discard(1, 0));
        }
    }

    // ─── 摸牌测试 ────────────────────────────────────────────

    @Nested
    @DisplayName("摸牌测试")
    class DrawTests {

        @BeforeEach
        void startAndSelectMissSuit() {
            engine.startNewRound(0);
            engine.selectMissSuit(0, 2);
            engine.selectMissSuit(1, 2);
            engine.selectMissSuit(2, 2);
            engine.selectMissSuit(3, 2);
        }

        @Test
        @DisplayName("摸牌后手牌应增加1张")
        void drawTile_shouldAddOneToHand() {
            // 庄家先出一张牌
            Player banker = room.getPlayer(0);
            int tileId = banker.getHandTiles().get(0).getTileId();
            engine.discard(0, tileId);

            // 下家摸牌
            Player nextPlayer = room.getPlayer(1);
            int beforeSize = nextPlayer.getHandTiles().size();

            GameEngine.DrawResult result = engine.drawTile(1);
            assertNotNull(result.drawnTile);
            assertEquals(beforeSize + 1, nextPlayer.getHandTiles().size());
        }

        @Test
        @DisplayName("摸牌后牌墙应减少1张")
        void drawTile_wallShouldDecrease() {
            Player banker = room.getPlayer(0);
            int tileId = banker.getHandTiles().get(0).getTileId();
            engine.discard(0, tileId);

            int wallBefore = engine.getState().remainingWall();
            engine.drawTile(1);
            assertEquals(wallBefore - 1, engine.getState().remainingWall());
        }
    }

    // ─── nextActiveSeat 测试 ─────────────────────────────────

    @Nested
    @DisplayName("下一活跃座位")
    class NextActiveSeatTests {

        @Test
        @DisplayName("无人胡牌时应返回下家")
        void nextActiveSeat_noHu_shouldReturnNext() {
            engine.startNewRound(0);
            assertEquals(1, engine.nextActiveSeat(0));
            assertEquals(2, engine.nextActiveSeat(1));
            assertEquals(3, engine.nextActiveSeat(2));
            assertEquals(0, engine.nextActiveSeat(3));
        }

        @Test
        @DisplayName("跳过已胡牌的玩家")
        void nextActiveSeat_skipHu_shouldReturnNextActive() {
            engine.startNewRound(0);
            room.getPlayer(1).setHu(true); // 1号已胡

            assertEquals(2, engine.nextActiveSeat(0)); // 跳过1，返回2
            assertEquals(3, engine.nextActiveSeat(2)); // 正常
        }
    }
}
