package com.mahjong.service;

import com.mahjong.engine.GameEngine;
import com.mahjong.engine.ScoreCalculator;
import com.mahjong.engine.WinChecker;
import com.mahjong.entity.GameRecordEntity;
import com.mahjong.entity.UserEntity;
import com.mahjong.model.*;
import com.mahjong.redis.ReplayStore;
import com.mahjong.websocket.GameMessage;
import com.mahjong.websocket.MessageType;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

/**
 * 游戏业务逻辑服务
 *
 * <p>
 * 负责协调 {@link GameEngine}、{@link RoomService}、{@link UserService} 以及数据持久化，
 * 实现从开局到结算的完整业务流程。
 *
 * <p>
 * 核心职责：
 * <ul>
 * <li>开局发牌、推送手牌</li>
 * <li>定缺、出牌、碰/杠/胡的业务流转</li>
 * <li>局结算 & 全局结算、对局记录持久化</li>
 * </ul>
 */
@Service
public class GameService {

    private static final Logger log = Logger.getLogger(GameService.class.getName());

    private final RoomService roomService;
    private final UserService userService;
    private final GameRecordRepository gameRecordRepository;
    private final UserRepository userRepository;
    private final ReplayStore replayStore;

    /** roomId -> GameEngine 实例 */
    private final Map<String, GameEngine> engines = new ConcurrentHashMap<>();

    /**
     * roomId -> 等待响应碰/杠/胡的上下文。
     * 当有多个可响应玩家时，需要收集所有人的选择后再处理。
     */
    private final Map<String, PendingAction> pendingActions = new ConcurrentHashMap<>();
    /** 超时自动出牌定时器（每次轮到玩家操作时重置） */
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);
    /** roomId -> 当前倒计时任务 */
    private final Map<String, ScheduledFuture<?>> countdownTasks = new ConcurrentHashMap<>();
    /** 出牌等待超时秒数 */
    private static final int DISCARD_TIMEOUT_SECONDS = 20;
    /** 人机动作延时（毫秒），用于模拟思考并让客户端先收到提示消息 */
    private static final long BOT_ACTION_DELAY_MS = 650L;
    /** roomId -> 本局胡牌玩家座位（用于庄家轮转） */
    private final Map<String, Integer> lastWinnerSeatMap = new ConcurrentHashMap<>();
    /** roomId -> 整场累计个人分（seat0~3） */
    private final Map<String, int[]> matchSeatScores = new ConcurrentHashMap<>();
    @Autowired
    public GameService(RoomService roomService, UserService userService,
            GameRecordRepository gameRecordRepository, UserRepository userRepository,
            ReplayStore replayStore) {
        this.roomService = roomService;
        this.userService = userService;
        this.gameRecordRepository = gameRecordRepository;
        this.userRepository = userRepository;
        this.replayStore = replayStore;
    }

    // ═══════════════════════════════════════════════════════════
    // 消息发送回调接口（由 GameWebSocketHandler 注入实现）
    // ═══════════════════════════════════════════════════════════

    /** 消息发送回调 */
    public interface MessageSender {
        /** 向房间内所有玩家广播 */
        void broadcast(Room room, GameMessage message);

        /** 向指定 sessionId 推送 */
        void sendToSession(String sessionId, GameMessage message);
    }

    private MessageSender messageSender;

    public void setMessageSender(MessageSender sender) {
        this.messageSender = sender;
    }

    // ═══════════════════════════════════════════════════════════
    // 1. 开始游戏
    // ═══════════════════════════════════════════════════════════

    /**
     * 四人满座后启动游戏
     */
    public void startGame(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null || !room.isFull()) {
            throw new IllegalStateException("房间不存在或人数不足");
        }
        if (room.getStatus() != Room.RoomStatus.READY) {
            throw new IllegalStateException("房间状态不允许开始游戏: " + room.getStatus());
        }

        room.setStatus(Room.RoomStatus.PLAYING);
        room.incrementRound();
        roomService.syncRoomSnapshot(roomId);

        GameEngine engine = new GameEngine(room);
        engines.put(roomId, engine);
        matchSeatScores.put(roomId, new int[4]);

        // 庄家默认0号座位（首局），后续可按规则轮转
        int bankerSeat = (room.getCurrentRound() - 1) % 4;
        List<List<Tile>> hands = engine.startNewRound(bankerSeat);

        log.info("游戏开始: roomId=" + roomId + ", round=" + room.getCurrentRound());
        replayStore.append(roomId, "GAME_START", room.getCurrentRound(), Map.of(
            "bankerSeat", bankerSeat,
            "maxRounds", room.getMaxRounds(),
            "baseScore", room.getBaseScore()));

        // 向每位玩家推送手牌（只发自己的牌）
        if (messageSender != null) {
            for (int seat = 0; seat < 4; seat++) {
                Player player = room.getPlayer(seat);
                if (player == null)
                    continue;

                Map<String, Object> data = new HashMap<>();
                data.put("seatIndex", seat);
                data.put("bankerSeat", bankerSeat);
                data.put("round", room.getCurrentRound());
                data.put("maxRounds", room.getMaxRounds());
                data.put("handTiles", tilesToList(hands.get(seat)));

                messageSender.sendToSession(player.getSessionId(),
                        new GameMessage(MessageType.S_GAME_START, data));
            }

            // 推送进入定缺阶段
            messageSender.broadcast(room,
                    new GameMessage(MessageType.S_SELECT_MISS_SUIT, Map.of("message", "请选择定缺花色")));
        }

        // 自动触发人机定缺
        scheduleBotMissSuitSelection(roomId);
    }

    // ═══════════════════════════════════════════════════════════
    // 2. 定缺
    // ═══════════════════════════════════════════════════════════

    /**
     * 玩家选择定缺花色
     */
    public void selectMissSuit(String roomId, int seatIndex, int suitIndex) {
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();

        boolean allSelected = engine.selectMissSuit(seatIndex, suitIndex);

        if (messageSender != null) {
            // 广播某玩家定缺选择
            Map<String, Object> resultData = new HashMap<>();
            resultData.put("seatIndex", seatIndex);
            resultData.put("suitIndex", suitIndex);
            messageSender.broadcast(room, new GameMessage(MessageType.S_MISS_SUIT_RESULT, resultData));

            // 所有人定缺完毕 → 庄家出牌
            if (allSelected) {
                int bankerSeat = engine.getState().getBankerSeat();
                Map<String, Object> drawData = new HashMap<>();
                drawData.put("seatIndex", bankerSeat);
                drawData.put("message", "定缺完成，等待庄家出牌");
                Player banker = room.getPlayer(bankerSeat);
                if (banker != null) {
                    messageSender.sendToSession(banker.getSessionId(),
                            new GameMessage(MessageType.S_DRAW, drawData));
                }
                // 启动庄家出牌倒计时
                startDiscardCountdown(roomId, bankerSeat);
                if (isBotSeat(room, bankerSeat)) {
                    scheduleBotDrawPhaseAction(roomId, bankerSeat, null);
                }
            }
        }

        if (!allSelected) {
            // 某个玩家已选完后，继续补齐其余人机定缺
            scheduleBotMissSuitSelection(roomId);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. 出牌
    // ═══════════════════════════════════════════════════════════

    /**
     * 玩家出牌
     */
    public void discard(String roomId, int seatIndex, int tileId) {
        cancelCountdown(roomId); // 玩家已主动出牌，取消倒计时
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();

        GameEngine.DiscardResult result = engine.discard(seatIndex, tileId);
        replayStore.append(roomId, "DISCARD", room.getCurrentRound(), Map.of(
            "seatIndex", seatIndex,
            "tileId", tileId,
            "tileName", result.discardedTile.toString()));

        if (messageSender != null) {
            // 广播出牌
            Map<String, Object> discardData = new HashMap<>();
            discardData.put("seatIndex", seatIndex);
            discardData.put("tileId", tileId);
            discardData.put("tileName", result.discardedTile.toString());
            messageSender.broadcast(room, new GameMessage(MessageType.S_DISCARD, discardData));

            // 检查是否有人可以碰/杠/胡/吃
            if (!result.canHuSeats.isEmpty() || !result.canGangSeats.isEmpty()
                    || !result.canPengSeats.isEmpty() || !result.canChiSeats.isEmpty()) {
                // 记录等待响应
                PendingAction pending = new PendingAction(roomId, seatIndex, tileId, result);
                pendingActions.put(roomId, pending);

                // 向有选项的玩家发送操作提示（同一玩家可同时拥有多种动作）
                Set<Integer> notifiedSeats = new HashSet<>();
                notifiedSeats.addAll(result.canHuSeats);
                notifiedSeats.addAll(result.canGangSeats);
                notifiedSeats.addAll(result.canPengSeats);
                notifiedSeats.addAll(result.canChiSeats);

                for (int seat : notifiedSeats) {
                    sendActionOptions(
                            room,
                            seat,
                            result.canHuSeats.contains(seat),
                            result.canGangSeats.contains(seat),
                            result.canPengSeats.contains(seat),
                            result.canChiSeats.contains(seat),
                            result.chiOptionsBySeat.getOrDefault(seat, List.of()));
                    if (isBotSeat(room, seat)) {
                        scheduleBotReaction(roomId, seat,
                                result.canHuSeats.contains(seat),
                                result.canGangSeats.contains(seat),
                                result.canPengSeats.contains(seat),
                                result.canChiSeats.contains(seat),
                                result.chiOptionsBySeat.getOrDefault(seat, List.of()));
                    }
                }
            } else {
                // 无人可响应，下家摸牌
                if (result.nextDrawSeat >= 0) {
                    doDrawTile(roomId, result.nextDrawSeat);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 4. 碰牌
    // ═══════════════════════════════════════════════════════════

    /**
     * 玩家声明碰牌
     */
    public void peng(String roomId, int seatIndex) {
        cancelCountdown(roomId);
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();
        GameState state = engine.getState();

        int tileId = state.getLastDiscardedTile().getTileId();
        int fromSeat = state.getLastDiscardSeat();

        engine.peng(seatIndex, tileId, fromSeat);
        pendingActions.remove(roomId);
        replayStore.append(roomId, "PENG", room.getCurrentRound(), Map.of(
            "seatIndex", seatIndex,
            "tileId", tileId,
            "fromSeat", fromSeat));

        if (messageSender != null) {
            Map<String, Object> pengData = new HashMap<>();
            pengData.put("seatIndex", seatIndex);
            pengData.put("tileId", tileId);
            pengData.put("fromSeat", fromSeat);
            messageSender.broadcast(room, new GameMessage(MessageType.S_PENG, pengData));

            // 碰完后玩家需要出牌，启动倒计时
            startDiscardCountdown(roomId, seatIndex);
            if (isBotSeat(room, seatIndex)) {
                scheduleBotDrawPhaseAction(roomId, seatIndex, null);
            }
        }
    }

    /**
     * 玩家声明吃牌
     */
    public void chi(String roomId, int seatIndex, List<Integer> consumeTileIds) {
        cancelCountdown(roomId);
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();
        GameState state = engine.getState();

        PendingAction pending = pendingActions.get(roomId);
        if (pending == null) {
            throw new IllegalStateException("当前没有可响应的打牌动作");
        }
        if (!pending.discardResult.canChiSeats.contains(seatIndex)) {
            throw new IllegalStateException("当前玩家不可吃牌");
        }

        int tileId = state.getLastDiscardedTile().getTileId();
        int fromSeat = state.getLastDiscardSeat();

        List<Integer> resolvedConsume = consumeTileIds;
        if (resolvedConsume == null || resolvedConsume.size() != 2) {
            List<List<Integer>> options = pending.discardResult.chiOptionsBySeat.getOrDefault(seatIndex, List.of());
            if (options.size() == 1) {
                resolvedConsume = options.get(0);
            } else {
                throw new IllegalArgumentException("存在多个吃牌组合，请明确传入 consumeTileIds");
            }
        }

        engine.chi(seatIndex, tileId, fromSeat, resolvedConsume);
        pendingActions.remove(roomId);
        replayStore.append(roomId, "CHI", room.getCurrentRound(), Map.of(
            "seatIndex", seatIndex,
            "tileId", tileId,
            "fromSeat", fromSeat,
            "consumeTileIds", resolvedConsume));

        if (messageSender != null) {
            Map<String, Object> chiData = new HashMap<>();
            chiData.put("seatIndex", seatIndex);
            chiData.put("tileId", tileId);
            chiData.put("fromSeat", fromSeat);
            chiData.put("consumeTileIds", resolvedConsume);
            messageSender.broadcast(room, new GameMessage(MessageType.S_CHI, chiData));

            // 吃完后玩家需要出牌，启动倒计时
            startDiscardCountdown(roomId, seatIndex);
            if (isBotSeat(room, seatIndex)) {
                scheduleBotDrawPhaseAction(roomId, seatIndex, null);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 5. 杠牌
    // ═══════════════════════════════════════════════════════════

    /**
     * 明杠（他人打出的牌）
     */
    public void mingGang(String roomId, int seatIndex) {
        cancelCountdown(roomId);
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();
        GameState state = engine.getState();

        int tileId = state.getLastDiscardedTile().getTileId();
        int fromSeat = state.getLastDiscardSeat();

        engine.mingGang(seatIndex, tileId, fromSeat);
        pendingActions.remove(roomId);
        replayStore.append(roomId, "GANG", room.getCurrentRound(), Map.of(
            "seatIndex", seatIndex,
            "tileId", tileId,
            "gangType", "MING",
            "fromSeat", fromSeat));

        if (messageSender != null) {
            Map<String, Object> gangData = new HashMap<>();
            gangData.put("seatIndex", seatIndex);
            gangData.put("tileId", tileId);
            gangData.put("gangType", "MING");
            messageSender.broadcast(room, new GameMessage(MessageType.S_GANG, gangData));
        }

        // 杠完后需要摸一张牌
        doDrawTile(roomId, seatIndex);
    }

    /**
     * 暗杠（自己手里有4张）
     */
    public void anGang(String roomId, int seatIndex, int tileId) {
        cancelCountdown(roomId);
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();

        engine.anGang(seatIndex, tileId);
        replayStore.append(roomId, "GANG", room.getCurrentRound(), Map.of(
            "seatIndex", seatIndex,
            "tileId", tileId,
            "gangType", "AN"));

        if (messageSender != null) {
            Map<String, Object> gangData = new HashMap<>();
            gangData.put("seatIndex", seatIndex);
            gangData.put("tileId", tileId);
            gangData.put("gangType", "AN");
            messageSender.broadcast(room, new GameMessage(MessageType.S_GANG, gangData));
        }

        // 暗杠后摸一张
        doDrawTile(roomId, seatIndex);
    }

    /**
     * 补杠（已碰某牌，又摸到第4张）
     */
    public void buGang(String roomId, int seatIndex, int tileId) {
        cancelCountdown(roomId);
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();

        List<Integer> qiangGangHuSeats = engine.buGang(seatIndex, tileId);
        replayStore.append(roomId, "GANG", room.getCurrentRound(), Map.of(
            "seatIndex", seatIndex,
            "tileId", tileId,
            "gangType", "BU"));

        if (messageSender != null) {
            Map<String, Object> gangData = new HashMap<>();
            gangData.put("seatIndex", seatIndex);
            gangData.put("tileId", tileId);
            gangData.put("gangType", "BU");
            messageSender.broadcast(room, new GameMessage(MessageType.S_GANG, gangData));
        }

        if (!qiangGangHuSeats.isEmpty()) {
            // 有人可抢杠胡，等待响应
            for (int seat : qiangGangHuSeats) {
                sendActionOptions(room, seat, true, false, false, false, List.of());
            }
        } else {
            // 无人抢杠，补杠后摸牌
            doDrawTile(roomId, seatIndex);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 6. 胡牌
    // ═══════════════════════════════════════════════════════════

    /**
     * 玩家声明胡牌
     *
     * @param seatIndex  胡牌玩家座位
     * @param isSelfDraw 是否自摸
     */
    public void hu(String roomId, int seatIndex, boolean isSelfDraw) {
        cancelCountdown(roomId);
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();
        GameState state = engine.getState();

        Tile winTile;
        int fromSeat;
        boolean isGangShang = false;
        boolean isQiangGang = false;

        if (isSelfDraw) {
            // 自摸：刚摸到的牌
            Player player = room.getPlayer(seatIndex);
            List<Tile> hand = player.getHandTiles();
            winTile = hand.get(hand.size() - 1); // 最后摸到的牌
            fromSeat = -1;
        } else {
            // 点炮/抢杠
            winTile = state.getLastDiscardedTile();
            fromSeat = state.getLastDiscardSeat();
        }
        // 先获取胡牌结果（用于展示和记录）
        Player huPlayer = room.getPlayer(seatIndex);
        WinChecker.WinResult winResult = WinChecker.checkWin(huPlayer, winTile, !isSelfDraw);
        int score = engine.hu(seatIndex, winTile, isSelfDraw, isGangShang, isQiangGang, fromSeat);
        pendingActions.remove(roomId);

        Map<String, Object> huReplay = new HashMap<>();
        huReplay.put("seatIndex", seatIndex);
        huReplay.put("winTile", tileToMap(winTile));
        huReplay.put("isSelfDraw", isSelfDraw);
        huReplay.put("score", score);
        huReplay.put("fromSeat", fromSeat);
        huReplay.put("winType", buildWinTypeDesc(winResult, isSelfDraw));
        replayStore.append(roomId, "HU", room.getCurrentRound(), huReplay);

        if (messageSender != null) {
            Map<String, Object> huData = new HashMap<>();
            huData.put("seatIndex", seatIndex);
            huData.put("isHu", true);
            huData.put("winTile", tileToMap(winTile));
            huData.put("isSelfDraw", isSelfDraw);
            huData.put("score", score);
            huData.put("fromSeat", fromSeat);
            // 推送胡牌类型给前端展示
            huData.put("winType", buildWinTypeDesc(winResult, isSelfDraw));
            messageSender.broadcast(room, new GameMessage(MessageType.S_HU, huData));
        }

        // 庄家轮转：记录胡牌玩家座位
        lastWinnerSeatMap.put(roomId, seatIndex);

        // 保存对局记录
        saveGameRecord(room, engine, seatIndex, fromSeat, score, winResult, isSelfDraw);

        // 检查游戏状态
        if (state.getPhase() == GameState.Phase.SETTLING) {
            handleRoundEnd(roomId);
        } else {
            // 血战到底：继续，下个未胡玩家摸牌
            int nextSeat = engine.nextActiveSeat(seatIndex);
            if (nextSeat >= 0) {
                doDrawTile(roomId, nextSeat);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 7. 跳过（PASS）
    // ═══════════════════════════════════════════════════════════

    /**
     * 玩家选择跳过碰/杠/胡
     */
    public void pass(String roomId, int seatIndex) {
        PendingAction pending = pendingActions.get(roomId);
        if (pending == null)
            return;

        pending.passedSeats.add(seatIndex);

        // 检查是否所有等待中的玩家都已响应
        GameEngine.DiscardResult result = pending.discardResult;
        Set<Integer> allPendingSeats = new HashSet<>();
        allPendingSeats.addAll(result.canHuSeats);
        allPendingSeats.addAll(result.canGangSeats);
        allPendingSeats.addAll(result.canPengSeats);
        allPendingSeats.addAll(result.canChiSeats);

        if (pending.passedSeats.containsAll(allPendingSeats)) {
            // 所有人都跳过，轮到下家摸牌
            pendingActions.remove(roomId);
            replayStore.append(roomId, "PASS_ALL", getEngine(roomId).getRoom().getCurrentRound(), Map.of(
                    "fromSeat", pending.fromSeat,
                    "respondedSeats", new ArrayList<>(pending.passedSeats)));
            GameEngine engine = getEngine(roomId);
            int nextSeat = engine.nextActiveSeat(pending.fromSeat);
            if (nextSeat >= 0) {
                doDrawTile(roomId, nextSeat);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 内部方法
    // ═══════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════
    // 倒计时管理
    // ═══════════════════════════════════════════════════════════

    /**
     * 启动出牌倒计时：推送 S_COUNTDOWN 消息，超时后自动出最后一张手牌
     */
    private void startDiscardCountdown(String roomId, int seatIndex) {
        cancelCountdown(roomId);
        Room room = roomService.getRoom(roomId);
        if (room == null) return;
        Player player = room.getPlayer(seatIndex);
        if (player == null) return;

        // 推送倒计时开始给所有人
        if (messageSender != null) {
            messageSender.broadcast(room, new GameMessage(MessageType.S_COUNTDOWN,
                    Map.of("seatIndex", seatIndex, "seconds", DISCARD_TIMEOUT_SECONDS)));
        }

        ScheduledFuture<?> future = scheduler.schedule(() -> {
            try {
                handleDiscardTimeout(roomId, seatIndex);
            } catch (Exception e) {
                log.warning("超时自动出牌异常: roomId=" + roomId + ", seat=" + seatIndex + ", " + e.getMessage());
            }
        }, DISCARD_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        countdownTasks.put(roomId, future);
    }

    /** 取消当前倒计时任务 */
    private void cancelCountdown(String roomId) {
        ScheduledFuture<?> old = countdownTasks.remove(roomId);
        if (old != null && !old.isDone()) {
            old.cancel(false);
        }
    }

    /**
     * 超时处理：自动打出最后一张摸到的牌（或手牌中第一张）
     */
    private void handleDiscardTimeout(String roomId, int seatIndex) {
        GameEngine engine = engines.get(roomId);
        if (engine == null) return;
        Room room = engine.getRoom();
        Player player = room.getPlayer(seatIndex);
        if (player == null || player.isHu()) return;

        List<Tile> hand = player.getHandTiles();
        if (hand.isEmpty()) return;

        // 超时出最后一张牌
        Tile autoDiscard = hand.get(hand.size() - 1);
        log.info("超时自动出牌: roomId=" + roomId + ", seat=" + seatIndex + ", tile=" + autoDiscard);
        discard(roomId, seatIndex, autoDiscard.getTileId());
    }

    /**
     * 执行摸牌逻辑并推送消息
     */
    private void doDrawTile(String roomId, int seatIndex) {
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();

        GameEngine.DrawResult drawResult = engine.drawTile(seatIndex);

        if (drawResult.isExhausted) {
            // 荒庄（流局）
            replayStore.append(roomId, "ROUND_EXHAUSTED", room.getCurrentRound(), Map.of(
                "remaining", engine.getState().remainingWall()));
            handleRoundEnd(roomId);
            return;
        }

        replayStore.append(roomId, "DRAW", room.getCurrentRound(), Map.of(
            "seatIndex", seatIndex,
            "tileId", drawResult.drawnTile.getTileId(),
            "tileName", drawResult.drawnTile.toString(),
            "remaining", engine.getState().remainingWall()));

        if (messageSender != null) {
            Player player = room.getPlayer(seatIndex);
            if (player == null)
                return;

            Map<String, Object> drawData = new HashMap<>();
            drawData.put("seatIndex", seatIndex);
            drawData.put("tile", tileToMap(drawResult.drawnTile));
            drawData.put("remaining", engine.getState().remainingWall());

            // 附加可用操作
            List<String> actions = new ArrayList<>();
            if (drawResult.canZiMo)
                actions.add("HU");
            if (!drawResult.canAnGangIds.isEmpty())
                actions.add("AN_GANG");
            if (drawResult.canBuGang)
                actions.add("BU_GANG");
            drawData.put("actions", actions);
            drawData.put("canAnGangIds", drawResult.canAnGangIds);
            if (drawResult.canBuGang) {
                drawData.put("buGangTileId", drawResult.buGangTileId);
            }

            // 听牌提示：计算当前手牌的听牌列表
            List<Integer> tingTiles = WinChecker.getTingTiles(player);
            drawData.put("tingTiles", tingTiles);

            messageSender.sendToSession(player.getSessionId(),
                    new GameMessage(MessageType.S_DRAW, drawData));

            // 摸牌后启动出牌倒计时
            startDiscardCountdown(roomId, seatIndex);
            if (player.isBot()) {
                scheduleBotDrawPhaseAction(roomId, seatIndex, drawResult);
            }
        }
    }

    /**
     * 向玩家发送操作选项提示
     */
    private void sendActionOptions(Room room, int seatIndex,
            boolean canHu, boolean canGang, boolean canPeng, boolean canChi,
            List<List<Integer>> chiOptions) {
        if (messageSender == null)
            return;
        Player player = room.getPlayer(seatIndex);
        if (player == null)
            return;

        Map<String, Object> data = new HashMap<>();
        data.put("seatIndex", seatIndex);
        List<String> actions = new ArrayList<>();
        if (canHu)
            actions.add("HU");
        if (canGang)
            actions.add("GANG");
        if (canPeng)
            actions.add("PENG");
        if (canChi)
            actions.add("CHI");
        actions.add("PASS");
        data.put("actions", actions);
        if (canChi && chiOptions != null && !chiOptions.isEmpty()) {
            List<Map<String, Object>> optionsPayload = new ArrayList<>();
            for (List<Integer> option : chiOptions) {
                optionsPayload.add(Map.of("consumeTileIds", option));
            }
            data.put("chiOptions", optionsPayload);
        }

        messageSender.sendToSession(player.getSessionId(),
                new GameMessage(MessageType.S_ACTION_OPTIONS, data));
    }

    private boolean isBotSeat(Room room, int seatIndex) {
        Player player = room.getPlayer(seatIndex);
        return player != null && player.isBot();
    }

    private void scheduleBotMissSuitSelection(String roomId) {
        GameEngine engine = engines.get(roomId);
        if (engine == null) {
            return;
        }
        if (engine.getState().getPhase() != GameState.Phase.SELECTING_MISS_SUIT) {
            return;
        }
        Room room = engine.getRoom();
        for (int seat = 0; seat < 4; seat++) {
            Player bot = room.getPlayer(seat);
            if (bot == null || !bot.isBot() || bot.getMissSuit() >= 0) {
                continue;
            }
            final int botSeat = seat;
            scheduleBotTask(roomId, () -> {
                GameEngine currentEngine = engines.get(roomId);
                if (currentEngine == null) {
                    return;
                }
                if (currentEngine.getState().getPhase() != GameState.Phase.SELECTING_MISS_SUIT) {
                    return;
                }
                Player currentBot = currentEngine.getRoom().getPlayer(botSeat);
                if (currentBot == null || !currentBot.isBot() || currentBot.getMissSuit() >= 0) {
                    return;
                }
                int missSuit = chooseBotMissSuit(currentBot);
                selectMissSuit(roomId, botSeat, missSuit);
            });
        }
    }

    private int chooseBotMissSuit(Player bot) {
        int[] suitCounts = new int[] {0, 0, 0};
        for (Tile tile : bot.getHandTiles()) {
            int suit = tile.getType().getIndex();
            if (suit >= 0 && suit < 3) {
                suitCounts[suit]++;
            }
        }
        int min = Math.min(suitCounts[0], Math.min(suitCounts[1], suitCounts[2]));
        List<Integer> candidates = new ArrayList<>();
        for (int suit = 0; suit < 3; suit++) {
            if (suitCounts[suit] == min) {
                candidates.add(suit);
            }
        }
        int idx = ThreadLocalRandom.current().nextInt(candidates.size());
        return candidates.get(idx);
    }

    private void scheduleBotReaction(String roomId, int seatIndex,
            boolean canHu, boolean canGang, boolean canPeng, boolean canChi,
            List<List<Integer>> chiOptions) {
        scheduleBotTask(roomId, () -> {
            PendingAction pending = pendingActions.get(roomId);
            if (pending == null) {
                return;
            }
            if (canHu && pending.discardResult.canHuSeats.contains(seatIndex)) {
                hu(roomId, seatIndex, false);
                return;
            }
            if (canGang && pending.discardResult.canGangSeats.contains(seatIndex)) {
                mingGang(roomId, seatIndex);
                return;
            }
            if (canPeng && pending.discardResult.canPengSeats.contains(seatIndex)) {
                peng(roomId, seatIndex);
                return;
            }
            if (canChi && pending.discardResult.canChiSeats.contains(seatIndex)) {
                List<Integer> consume = (chiOptions == null || chiOptions.isEmpty()) ? null : chiOptions.get(0);
                chi(roomId, seatIndex, consume);
                return;
            }
            pass(roomId, seatIndex);
        });
    }

    private void scheduleBotDrawPhaseAction(String roomId, int seatIndex, GameEngine.DrawResult drawResult) {
        scheduleBotTask(roomId, () -> {
            GameEngine engine = engines.get(roomId);
            if (engine == null) {
                return;
            }
            Room room = engine.getRoom();
            Player bot = room.getPlayer(seatIndex);
            if (bot == null || !bot.isBot() || bot.isHu()) {
                return;
            }
            if (engine.getState().getAwaitingSeat() != seatIndex) {
                return;
            }

            if (drawResult != null) {
                if (drawResult.canZiMo) {
                    hu(roomId, seatIndex, true);
                    return;
                }
                if (!drawResult.canAnGangIds.isEmpty()) {
                    anGang(roomId, seatIndex, drawResult.canAnGangIds.get(0));
                    return;
                }
                if (drawResult.canBuGang) {
                    buGang(roomId, seatIndex, drawResult.buGangTileId);
                    return;
                }
            }

            int discardTileId = chooseBotDiscardTile(bot);
            discard(roomId, seatIndex, discardTileId);
        });
    }

    private int chooseBotDiscardTile(Player bot) {
        List<Tile> hand = bot.getHandTiles();
        if (hand == null || hand.isEmpty()) {
            throw new IllegalStateException("人机手牌为空，无法出牌");
        }

        List<Tile> missSuitTiles = new ArrayList<>();
        int missSuit = bot.getMissSuit();
        if (missSuit >= 0 && missSuit <= 2) {
            for (Tile tile : hand) {
                if (tile.getType().getIndex() == missSuit) {
                    missSuitTiles.add(tile);
                }
            }
        }

        List<Tile> candidates = missSuitTiles.isEmpty() ? hand : missSuitTiles;
        int idx = ThreadLocalRandom.current().nextInt(candidates.size());
        return candidates.get(idx).getTileId();
    }

    private void scheduleBotTask(String roomId, Runnable action) {
        long delay = BOT_ACTION_DELAY_MS + ThreadLocalRandom.current().nextLong(0, 350);
        scheduler.schedule(() -> {
            try {
                action.run();
            } catch (Exception e) {
                log.fine("人机动作取消: roomId=" + roomId + ", reason=" + e.getMessage());
            }
        }, delay, TimeUnit.MILLISECONDS);
    }

    /**
     * 单局结束处理
     */
    private void handleRoundEnd(String roomId) {
        cancelCountdown(roomId);
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();
        int[] seatTotals = matchSeatScores.computeIfAbsent(roomId, key -> new int[4]);

        // 先累计本局个人分，避免 startNewRound 重置后丢失历史分。
        for (int i = 0; i < 4; i++) {
            Player p = room.getPlayer(i);
            if (p != null) {
                seatTotals[i] += p.getScore();
            }
        }

        replayStore.append(roomId, "ROUND_END", room.getCurrentRound(), Map.of(
            "round", room.getCurrentRound()));

        if (messageSender != null) {
            // 广播本局结算
            Map<String, Object> resultData = new HashMap<>();
            resultData.put("round", room.getCurrentRound());
            List<Map<String, Object>> scores = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                Player p = room.getPlayer(i);
                if (p == null)
                    continue;
                Map<String, Object> ps = new HashMap<>();
                ps.put("seatIndex", i);
                ps.put("userId", p.getUserId());
                ps.put("nickname", p.getNickname());
                ps.put("score", p.getScore());
                ps.put("hu", p.isHu());
                scores.add(ps);
            }
            resultData.put("players", scores);
            messageSender.broadcast(room, new GameMessage(MessageType.S_ROUND_RESULT, resultData));
        }

        // 判断是否已打完全部局数
        if (room.getCurrentRound() >= room.getMaxRounds()) {
            handleGameOver(roomId);
        } else {
            // 下一局
            room.incrementRound();
            roomService.syncRoomSnapshot(roomId);
            // 庄家轮转：胡牌则胡牌者为庄；荒庄则保留当前庄家
            int bankerSeat = lastWinnerSeatMap.getOrDefault(roomId, engine.getState().getBankerSeat());
            List<List<Tile>> hands = engine.startNewRound(bankerSeat);

            replayStore.append(roomId, "ROUND_START", room.getCurrentRound(), Map.of(
                    "bankerSeat", bankerSeat,
                    "round", room.getCurrentRound()));

            if (messageSender != null) {
                for (int seat = 0; seat < 4; seat++) {
                    Player player = room.getPlayer(seat);
                    if (player == null)
                        continue;

                    Map<String, Object> data = new HashMap<>();
                    data.put("seatIndex", seat);
                    data.put("bankerSeat", bankerSeat);
                    data.put("round", room.getCurrentRound());
                    data.put("handTiles", tilesToList(hands.get(seat)));
                    messageSender.sendToSession(player.getSessionId(),
                            new GameMessage(MessageType.S_GAME_START, data));
                }
                messageSender.broadcast(room,
                        new GameMessage(MessageType.S_SELECT_MISS_SUIT, Map.of("message", "请选择定缺花色")));
            }

            scheduleBotMissSuitSelection(roomId);
        }
    }

    /**
     * 全局比赛结束
     */
    private void handleGameOver(String roomId) {
        cancelCountdown(roomId);
        GameEngine engine = getEngine(roomId);
        Room room = engine.getRoom();
        room.setStatus(Room.RoomStatus.FINISHED);
        roomService.syncRoomSnapshot(roomId);

        int[] seatTotals = matchSeatScores.getOrDefault(roomId, new int[4]);
        int[] teamTotals = new int[2];
        for (int seat = 0; seat < 4; seat++) {
            Player p = room.getPlayer(seat);
            if (p != null) {
                teamTotals[p.getTeam()] += seatTotals[seat];
            }
        }

        // 更新用户战绩
        for (int i = 0; i < 4; i++) {
            Player p = room.getPlayer(i);
            if (p == null)
                continue;
            int teamScore = teamTotals[p.getTeam()];
            userService.findById(p.getUserId()).ifPresent(user -> {
                // 双人模式按队伍结算：同队两人同步增加队伍总分。
                user.addTotalScore(teamScore);
                user.incrementGameCount();
                if (p.isHu()) {
                    user.incrementWinCount();
                }
                userRepository.save(user);
            });
        }

        List<Map<String, Object>> finalScores = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Player p = room.getPlayer(i);
            if (p == null)
                continue;
            Map<String, Object> ps = new HashMap<>();
            ps.put("seatIndex", i);
            ps.put("userId", p.getUserId());
            ps.put("nickname", p.getNickname());
            ps.put("individualScore", seatTotals[i]);
            ps.put("team", p.getTeam());
            ps.put("teamScore", teamTotals[p.getTeam()]);
            // 兼容前端原字段：整场展示默认按队伍总分排序/展示
            ps.put("totalScore", teamTotals[p.getTeam()]);
            finalScores.add(ps);
        }

        if (messageSender != null) {
            Map<String, Object> overData = new HashMap<>();
            overData.put("players", finalScores);
            messageSender.broadcast(room, new GameMessage(MessageType.S_GAME_OVER, overData));
        }

        Map<String, Object> replayData = new HashMap<>();
        replayData.put("players", finalScores);
        replayStore.append(roomId, "GAME_OVER", room.getCurrentRound(), replayData);

        // 清理引擎
        engines.remove(roomId);
        pendingActions.remove(roomId);
        lastWinnerSeatMap.remove(roomId);
        matchSeatScores.remove(roomId);

        log.info("比赛结束: roomId=" + roomId);
    }

    /**
     * 生成胡牌类型描述字符串
     */
    private String buildWinTypeDesc(WinChecker.WinResult winResult, boolean isSelfDraw) {
        if (winResult == null) return "胡牌";
        StringBuilder sb = new StringBuilder();
        if (winResult.isDragonQiDui()) {
            sb.append("龙七对");
        } else if (winResult.isQiDui()) {
            sb.append("七对");
        } else {
            sb.append("平胡");
        }
        if (winResult.isQingYiSe()) {
            sb.append("+清一色");
        }
        if (isSelfDraw) {
            sb.append("+自摩");
        }
        return sb.toString();
    }

    /**
     * 保存对局记录到数据库
     */
    private void saveGameRecord(Room room, GameEngine engine, int winnerSeat, int loserSeat, int score,
            WinChecker.WinResult winResult, boolean isSelfDraw) {
        Player winner = room.getPlayer(winnerSeat);
        Player loser = loserSeat >= 0 ? room.getPlayer(loserSeat) : null;

        GameRecordEntity record = new GameRecordEntity();
        record.setRoomId(room.getRoomId());
        record.setRoundNum(room.getCurrentRound());
        record.setWinnerId(winner.getUserId());
        record.setLoserId(loser != null ? loser.getUserId() : null);
        record.setScore(score);
        record.setWinType(buildWinTypeDesc(winResult, isSelfDraw));

        // 积分快照
        StringBuilder snapshot = new StringBuilder();
        for (int i = 0; i < 4; i++) {
            Player p = room.getPlayer(i);
            if (p != null) {
                if (snapshot.length() > 0)
                    snapshot.append(",");
                snapshot.append(p.getNickname()).append(":").append(p.getScore());
            }
        }
        record.setScoreSnapshot(snapshot.toString());

        gameRecordRepository.save(record);

        Map<String, Object> summary = new HashMap<>();
        summary.put("roundNum", room.getCurrentRound());
        summary.put("winnerId", winner.getUserId());
        summary.put("loserId", loser != null ? loser.getUserId() : null);
        summary.put("score", score);
        summary.put("winType", buildWinTypeDesc(winResult, isSelfDraw));
        summary.put("scoreSnapshot", snapshot.toString());
        replayStore.append(room.getRoomId(), "ROUND_SUMMARY", room.getCurrentRound(), summary);
    }

    /**
     * 获取引擎实例（校验存在性）
     */
    private GameEngine getEngine(String roomId) {
        GameEngine engine = engines.get(roomId);
        if (engine == null) {
            throw new IllegalStateException("游戏未开始或已结束: roomId=" + roomId);
        }
        return engine;
    }

    // ─── 数据转换工具方法 ────────────────────────────────────

    private Map<String, Object> tileToMap(Tile tile) {
        Map<String, Object> m = new HashMap<>();
        m.put("tileId", tile.getTileId());
        m.put("type", tile.getType().name());
        m.put("point", tile.getPoint());
        m.put("name", tile.toString());
        return m;
    }

    private List<Map<String, Object>> tilesToList(List<Tile> tiles) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Tile t : tiles) {
            list.add(tileToMap(t));
        }
        return list;
    }

    // ─── 等待操作上下文 ──────────────────────────────────────

    /**
     * 出牌后等待其他玩家碰/杠/胡响应的上下文
     */
    private static class PendingAction {
        final String roomId;
        final int fromSeat;
        final int tileId;
        final GameEngine.DiscardResult discardResult;
        final Set<Integer> passedSeats = new HashSet<>();

        PendingAction(String roomId, int fromSeat, int tileId, GameEngine.DiscardResult discardResult) {
            this.roomId = roomId;
            this.fromSeat = fromSeat;
            this.tileId = tileId;
            this.discardResult = discardResult;
        }
    }

    /**
     * 向观战者推送当前公开局面（进入进行中房间时调用）
     * 只发送公开信息：各玩家弃牌区、明牌（碰/杠）、当前局数、庄家座位等，不含任何人的手牌
     */
    public void pushSpectateState(String roomId, String targetSessionId) {
        if (messageSender == null) return;
        GameEngine engine = engines.get(roomId);
        if (engine == null) return;

        Room room = engine.getRoom();
        GameState state = engine.getState();

        Map<String, Object> data = new HashMap<>();
        data.put("round", room.getCurrentRound());
        data.put("bankerSeat", state.getBankerSeat());
        data.put("phase", state.getPhase().name());
        data.put("remaining", state.remainingWall());

        // 各座位公开信息（弃牌区 + 明牌组合 + 定缺花色）
        List<Map<String, Object>> playerInfos = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Player p = room.getPlayer(i);
            if (p == null) continue;
            Map<String, Object> pi = new HashMap<>();
            pi.put("seatIndex", i);
            pi.put("userId", p.getUserId());
            pi.put("nickname", p.getNickname());
            pi.put("score", p.getScore());
            pi.put("isHu", p.isHu());
            pi.put("missSuit", p.getMissSuit());
            // 弃牌区
            List<Tile> discards = state.getDiscardPiles().getOrDefault(i, List.of());
            pi.put("discards", tilesToList(discards));
            // 明牌组合（碰/杠）
            List<Map<String, Object>> melds = new ArrayList<>();
            for (var meld : p.getMelds()) {
                Map<String, Object> meldMap = new HashMap<>();
                meldMap.put("type", meld.getType().name());
                meldMap.put("tiles", tilesToList(meld.getTiles()));
                melds.add(meldMap);
            }
            pi.put("melds", melds);
            playerInfos.add(pi);
        }
        data.put("players", playerInfos);

        messageSender.sendToSession(targetSessionId,
                new GameMessage(MessageType.S_SPECTATE_INIT, data));
    }
}
