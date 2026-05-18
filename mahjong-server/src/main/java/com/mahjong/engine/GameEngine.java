package com.mahjong.engine;

import com.mahjong.model.*;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

/**
 * 游戏状态机（四川双打竞技麻将）
 *
 * <p>
 * 管理一局麻将的完整生命周期：
 * 
 * <pre>
 *   DEALING → SELECTING_MISS_SUIT → PLAYING → (BLOOD_BATTLE) → SETTLING → GAME_OVER
 * </pre>
 *
 * <p>
 * 四川麻将特殊规则：
 * <ul>
 * <li>定缺：开局选一门花色，该花色牌不能胡</li>
 * <li>血战到底：一人胡后剩余玩家继续，直到3人胡完或牌墙摸完</li>
 * <li>不允许吃牌（默认配置）</li>
 * </ul>
 */
public class GameEngine {

    private static final Logger log = Logger.getLogger(GameEngine.class.getName());

    private final Room room;
    private GameState state;
    private final WinChecker winChecker = new WinChecker();

    public GameEngine(Room room) {
        this.room = room;
    }

    // ═══════════════════════════════════════════════════════════
    // 1. 开局：洗牌 → 发牌 → 进入定缺阶段
    // ═══════════════════════════════════════════════════════════

    /**
     * 开始新的一局
     *
     * @param bankerSeat 庄家座位号
     * @return 发完牌后每位玩家的手牌（供WebSocket推送）
     */
    public List<List<Tile>> startNewRound(int bankerSeat) {
        List<Player> players = room.getPlayerList();
        if (players.size() != 4) {
            throw new IllegalStateException("需要4位玩家才能开始");
        }

        // 重置每位玩家的状态
        for (Player p : players) {
            p.getHandTiles().clear();
            p.getMelds().clear();
            p.getConcealedKongs().clear();
            p.setMissSuit(-1);
            p.setHu(false);
            p.addScore(-p.getScore()); // 清零本局得分
        }

        // 创建新的游戏状态
        state = new GameState(bankerSeat, players);
        room.setGameState(state);

        // 洗牌
        List<Tile> deck = TileManager.createShuffledDeck();

        // 发牌：庄家14张，其余13张
        List<List<Tile>> hands = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            hands.add(new ArrayList<>());
        }
        List<Tile> remainingWall = TileManager.deal(deck, hands, bankerSeat);

        // 把牌发到每个玩家手上
        for (int seat = 0; seat < 4; seat++) {
            Player player = room.getPlayer(seat);
            if (player != null) {
                for (Tile t : hands.get(seat)) {
                    player.drawTile(t);
                }
            }
        }

        // 剩余的牌放入牌墙
        state.fillWall(remainingWall);

        // 进入定缺阶段
        state.setPhase(GameState.Phase.SELECTING_MISS_SUIT);

        log.info("新一局开始, 庄家座位=" + bankerSeat + ", 牌墙剩余=" + state.remainingWall());

        return hands;
    }

    // ═══════════════════════════════════════════════════════════
    // 2. 定缺阶段
    // ═══════════════════════════════════════════════════════════

    /**
     * 玩家选择定缺花色
     *
     * @param seatIndex 玩家座位号
     * @param suitIndex 花色索引（0=万 1=筒 2=条）
     * @return true 表示全部4名玩家都已选完定缺，可以进入出牌阶段
     */
    public boolean selectMissSuit(int seatIndex, int suitIndex) {
        if (state.getPhase() != GameState.Phase.SELECTING_MISS_SUIT) {
            throw new IllegalStateException("当前不是定缺阶段");
        }
        if (suitIndex < 0 || suitIndex > 2) {
            throw new IllegalArgumentException("花色索引必须为0~2");
        }

        Player player = room.getPlayer(seatIndex);
        if (player.getMissSuit() >= 0) {
            throw new IllegalStateException("该玩家已完成定缺选择");
        }

        player.setMissSuit(suitIndex);
        state.incrementMissSuitSelected();

        log.info("玩家 seat=" + seatIndex + " 定缺=" + TileType.fromIndex(suitIndex));

        // 4人全部选完 → 进入出牌阶段
        if (state.getMissSuitSelectedCount() >= 4) {
            state.setPhase(GameState.Phase.PLAYING);
            // 庄家已有14张牌，等待出牌
            state.setAwaitingSeat(state.getBankerSeat());
            log.info("定缺完成，等待庄家(seat=" + state.getBankerSeat() + ")出牌");
            return true;
        }
        return false;
    }

    // ═══════════════════════════════════════════════════════════
    // 3. 出牌
    // ═══════════════════════════════════════════════════════════

    /**
     * 玩家出牌
     *
     * @param seatIndex 出牌玩家座位号
     * @param tileId    打出的牌 tileId (0~26)
     * @return 出牌结果
     */
    public DiscardResult discard(int seatIndex, int tileId) {
        validatePlaying();
        if (seatIndex != state.getAwaitingSeat()) {
            throw new IllegalStateException("现在不轮到 seat=" + seatIndex + " 出牌");
        }

        Player player = room.getPlayer(seatIndex);
        Tile discardTile = Tile.fromId(tileId, 0);
        if (player != null && player.getMissSuit() >= 0 && player.hasMissSuitTile()
                && discardTile.getType().getIndex() != player.getMissSuit()) {
            throw new IllegalStateException("定缺后必须先打出缺门牌");
        }
        Tile discarded = player.discardTile(tileId);
        state.recordDiscard(seatIndex, discarded);
        
        // 关键防连点修复：出牌后立即清空等待座位，防止在等待其他人碰杠胡的这段时间内容许该玩家再次出牌
        state.setAwaitingSeat(-1);

        log.info("玩家 seat=" + seatIndex + " 打出: " + discarded);

        // 检查其他玩家能否碰/杠/胡
        DiscardResult result = new DiscardResult();
        result.discardedTile = discarded;
        result.fromSeat = seatIndex;

        for (int seat = 0; seat < 4; seat++) {
            if (seat == seatIndex)
                continue;
            Player other = room.getPlayer(seat);
            if (other == null || other.isHu())
                continue;

            // 胡牌优先级最高
            WinChecker.WinResult winResult = winChecker.checkWin(other, discarded);
            if (winResult != null) {
                result.canHuSeats.add(seat);
            }
            // 杠
            if (winChecker.canMingGang(other, discarded)) {
                result.canGangSeats.add(seat);
            }
            // 碰
            if (winChecker.canPeng(other, discarded)) {
                result.canPengSeats.add(seat);
            }
        }

        // 吃牌仅下家可用，且受房间配置开关控制
        if (room.isAllowChi()) {
            int nextSeat = nextActiveSeat(seatIndex);
            if (nextSeat >= 0) {
                Player nextPlayer = room.getPlayer(nextSeat);
                if (nextPlayer != null && !nextPlayer.isHu()) {
                    List<List<Integer>> chiOptions = WinChecker.getChiOptions(nextPlayer, discarded);
                    if (!chiOptions.isEmpty()) {
                        result.canChiSeats.add(nextSeat);
                        result.chiOptionsBySeat.put(nextSeat, chiOptions);
                    }
                }
            }
        }

        // 如果没有人可以碰/杠/胡，自动轮到下家摸牌
        if (result.canHuSeats.isEmpty() && result.canGangSeats.isEmpty()
                && result.canPengSeats.isEmpty() && result.canChiSeats.isEmpty()) {
            result.nextDrawSeat = nextActiveSeat(seatIndex);
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════
    // 4. 摸牌
    // ═══════════════════════════════════════════════════════════

    /**
     * 下一个玩家摸牌
     *
     * @param seatIndex 摸牌的玩家座位号
     * @return 摸牌结果（含可进行的操作：暗杠/补杠/自摸胡）
     */
    public DrawResult drawTile(int seatIndex) {
        validatePlaying();
        Player player = room.getPlayer(seatIndex);
        if (player == null || player.isHu()) {
            throw new IllegalStateException("座位" + seatIndex + "不存在或已胡牌");
        }

        // 检查牌墙是否摸完
        if (state.remainingWall() == 0) {
            // 荒庄（流局）
            state.setPhase(GameState.Phase.SETTLING);
            DrawResult result = new DrawResult();
            result.isExhausted = true;
            return result;
        }

        Tile drawn = state.draw();
        player.drawTile(drawn);
        state.setCurrentSeat(seatIndex);
        state.setAwaitingSeat(seatIndex);

        log.info("玩家 seat=" + seatIndex + " 摸牌: " + drawn);

        DrawResult result = new DrawResult();
        result.drawnTile = drawn;

        // 自摸胡判定
        WinChecker.WinResult winResult = winChecker.checkWin(player, drawn, false);
        if (winResult != null) {
            result.canZiMo = true;
            result.winResult = winResult;
            // 海底捞月判定
            result.isHaiDi = (state.remainingWall() == 0);
        }

        // 暗杠判定（手牌中有4张相同的牌）
        int[] counts = player.toCountArray();
        for (int id = 0; id < 27; id++) {
            if (WinChecker.canAnGang(player, id)) {
                result.canAnGangIds.add(id);
            }
        }

        // 补杠判定（已碰的牌又摸到了）
        if (winChecker.canBuGang(player, drawn)) {
            result.canBuGang = true;
            result.buGangTileId = drawn.getTileId();
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════
    // 5. 碰牌
    // ═══════════════════════════════════════════════════════════

    /**
     * 玩家声明碰牌
     *
     * @param seatIndex 碰牌玩家座位号
     * @param tileId    要碰的牌 tileId
     * @param fromSeat  打出该牌的座位号
     */
    public void peng(int seatIndex, int tileId, int fromSeat) {
        validatePlaying();
        Player player = room.getPlayer(seatIndex);
        if (player != null && player.getMissSuit() >= 0) {
            Tile tile = Tile.fromId(tileId, 0);
            if (tile.getType().getIndex() == player.getMissSuit()) {
                throw new IllegalStateException("定缺后不能碰自己的缺门牌");
            }
        }

        // 从手牌移出2张相同的牌
        List<Tile> removed = player.removeTiles(tileId, 2);
        // 加上来源牌，组成3张碰面子
        removed.add(state.getLastDiscardedTile());
        player.addMeld(new Meld(Meld.MeldType.PENG, removed, fromSeat));

        state.setCurrentSeat(seatIndex);
        state.setAwaitingSeat(seatIndex); // 碰完后轮到该玩家出牌

        log.info("玩家 seat=" + seatIndex + " 碰牌: tileId=" + tileId + ", from=" + fromSeat);
    }

    /**
     * 玩家声明吃牌（必须提供两张手牌 tileId 组成顺子）
     */
    public void chi(int seatIndex, int tileId, int fromSeat, List<Integer> consumeTileIds) {
        validatePlaying();
        int legalNextSeat = nextActiveSeat(fromSeat);
        if (seatIndex != legalNextSeat) {
            throw new IllegalStateException("只有下家可以吃牌");
        }
        if (consumeTileIds == null || consumeTileIds.size() != 2) {
            throw new IllegalArgumentException("吃牌必须提供两张 consumeTileIds");
        }

        Player player = room.getPlayer(seatIndex);
        if (player == null || player.isHu()) {
            throw new IllegalStateException("玩家不存在或已胡牌");
        }

        if (player.getMissSuit() >= 0) {
            Tile tile = state.getLastDiscardedTile();
            if (tile != null && tile.getType().getIndex() == player.getMissSuit()) {
                throw new IllegalStateException("定缺后不能吃自己的缺门牌");
            }
        }

        List<List<Integer>> options = WinChecker.getChiOptions(player, state.getLastDiscardedTile());
        boolean matched = options.stream().anyMatch(option -> sameTileIdPair(option, consumeTileIds));
        if (!matched) {
            throw new IllegalStateException("该吃牌组合不合法");
        }

        List<Tile> removed = new ArrayList<>();
        removed.addAll(player.removeTiles(consumeTileIds.get(0), 1));
        removed.addAll(player.removeTiles(consumeTileIds.get(1), 1));
        removed.add(state.getLastDiscardedTile());
        removed.sort((a, b) -> Integer.compare(a.getTileId(), b.getTileId()));

        player.addMeld(new Meld(Meld.MeldType.CHI, removed, fromSeat));
        state.setCurrentSeat(seatIndex);
        state.setAwaitingSeat(seatIndex); // 吃完后轮到该玩家出牌

        log.info("玩家 seat=" + seatIndex + " 吃牌: tileId=" + tileId + ", consume=" + consumeTileIds + ", from=" + fromSeat);
    }

    private boolean sameTileIdPair(List<Integer> left, List<Integer> right) {
        if (left == null || right == null || left.size() != 2 || right.size() != 2) return false;
        int l1 = left.get(0), l2 = left.get(1);
        int r1 = right.get(0), r2 = right.get(1);
        return (l1 == r1 && l2 == r2) || (l1 == r2 && l2 == r1);
    }

    // ═══════════════════════════════════════════════════════════
    // 6. 杠牌（明杠/暗杠/补杠）
    // ═══════════════════════════════════════════════════════════

    /**
     * 明杠（他人打出的牌，手里有3张）
     */
    public void mingGang(int seatIndex, int tileId, int fromSeat) {
        validatePlaying();
        Player player = room.getPlayer(seatIndex);
        if (player != null && player.getMissSuit() >= 0) {
            Tile tile = Tile.fromId(tileId, 0);
            if (tile.getType().getIndex() == player.getMissSuit()) {
                throw new IllegalStateException("定缺后不能杠自己的缺门牌");
            }
        }

        List<Tile> removed = player.removeTiles(tileId, 3);
        removed.add(state.getLastDiscardedTile());
        player.addMeld(new Meld(Meld.MeldType.GANG, removed, fromSeat));

        state.incrementGangCount();
        state.setCurrentSeat(seatIndex);
        // 杠完后该玩家需要从牌墙摸一张牌
        log.info("玩家 seat=" + seatIndex + " 明杠: tileId=" + tileId);
    }

    /**
     * 暗杠（手里有4张相同的牌）
     */
    public void anGang(int seatIndex, int tileId) {
        validatePlaying();
        Player player = room.getPlayer(seatIndex);
        if (player != null && player.getMissSuit() >= 0) {
            Tile tile = Tile.fromId(tileId, 0);
            if (tile.getType().getIndex() == player.getMissSuit()) {
                throw new IllegalStateException("定缺后不能杠自己的缺门牌");
            }
        }

        List<Tile> removed = player.removeTiles(tileId, 4);
        player.addConcealedKong(removed);

        state.incrementGangCount();
        state.setCurrentSeat(seatIndex);

        log.info("玩家 seat=" + seatIndex + " 暗杠: tileId=" + tileId);
    }

    /**
     * 补杠（已碰某牌，摸到第4张）
     *
     * @return 是否被其他玩家抢杠胡（如有人抢杠胡则返回对应座位号列表）
     */
    public List<Integer> buGang(int seatIndex, int tileId) {
        validatePlaying();
        Player player = room.getPlayer(seatIndex);

        if (player != null && player.getMissSuit() >= 0) {
            Tile tile = Tile.fromId(tileId, 0);
            if (tile.getType().getIndex() == player.getMissSuit()) {
                throw new IllegalStateException("定缺后不能补杠自己的缺门牌");
            }
        }

        // 从手牌移出1张
        List<Tile> removed = player.removeTiles(tileId, 1);
        Tile gangTile = removed.get(0);

        // 找到对应的碰面子，升级为杠
        boolean found = false;
        for (Meld meld : player.getMelds()) {
            if (meld.getType() == Meld.MeldType.PENG && meld.getTiles().get(0).getTileId() == tileId) {
                // 将碰面子升级（添加第4张牌）
                meld.getTiles().add(gangTile);
                found = true;
                break;
            }
        }
        if (!found)
            throw new IllegalStateException("没有对应的碰面子可补杠");

        state.incrementGangCount();

        // 检查是否有人可以抢杠胡
        List<Integer> qiangGangHuSeats = new ArrayList<>();
        for (int seat = 0; seat < 4; seat++) {
            if (seat == seatIndex)
                continue;
            Player other = room.getPlayer(seat);
            if (other == null || other.isHu())
                continue;
            WinChecker.WinResult winResult = winChecker.checkWin(other, gangTile);
            if (winResult != null) {
                qiangGangHuSeats.add(seat);
            }
        }

        log.info("玩家 seat=" + seatIndex + " 补杠: tileId=" + tileId +
                (qiangGangHuSeats.isEmpty() ? "" : ", 抢杠胡seats=" + qiangGangHuSeats));

        return qiangGangHuSeats;
    }

    // ═══════════════════════════════════════════════════════════
    // 7. 胡牌
    // ═══════════════════════════════════════════════════════════

    /**
     * 玩家声明胡牌
     *
     * @param seatIndex   胡牌玩家座位号
     * @param winTile     胡的那张牌
     * @param isSelfDraw  是否自摸
     * @param isGangShang 是否杠上花
     * @param isQiangGang 是否抢杠胡
     * @param fromSeat    出炮玩家座位号（自摸传-1）
     * @return 得分
     */
    public int hu(int seatIndex, Tile winTile, boolean isSelfDraw,
            boolean isGangShang, boolean isQiangGang, int fromSeat) {
        validatePlaying();
        Player player = room.getPlayer(seatIndex);

        WinChecker.WinResult winResult = winChecker.checkWin(player, winTile, !isSelfDraw);
        if (winResult == null) {
            throw new IllegalStateException("不满足胡牌条件");
        }

        // 海底捞月判定
        boolean isHaiDi = (state.remainingWall() == 0);

        // 计算番数和得分
        int score = ScoreCalculator.calculate(
                player, winResult,
                isSelfDraw, isGangShang, isQiangGang, isHaiDi,
                state.getTotalGangCount(), room.getBaseScore());

        // 结算得分
        Player[] allPlayers = new Player[4];
        for (int i = 0; i < 4; i++) {
            allPlayers[i] = room.getPlayer(i);
        }
        ScoreCalculator.settle(allPlayers, seatIndex, isSelfDraw ? -1 : fromSeat, score);

        // 标记已胡
        player.setHu(true);
        state.incrementHuCount();

        log.info("玩家 seat=" + seatIndex + " 胡牌! "
                + (isSelfDraw ? "自摸" : "点炮(from=" + fromSeat + ")")
                + " 得分=" + score
                + " 牌型: 七对=" + winResult.isQiDui()
                + " 清一色=" + winResult.isQingYiSe());

        // 血战到底：检查是否还需要继续
        if (state.getHuCount() >= 3) {
            // 3人胡完，游戏结束
            state.setPhase(GameState.Phase.SETTLING);
        } else {
            // 还有人没胡，继续打（血战到底）
            state.setPhase(GameState.Phase.BLOOD_BATTLE);
        }

        return score;
    }

    // ═══════════════════════════════════════════════════════════
    // 辅助方法
    // ═══════════════════════════════════════════════════════════

    /** 校验当前是否处于可打牌状态 */
    private void validatePlaying() {
        GameState.Phase phase = state.getPhase();
        if (phase != GameState.Phase.PLAYING && phase != GameState.Phase.BLOOD_BATTLE) {
            throw new IllegalStateException("当前阶段不能进行打牌操作: " + phase);
        }
    }

    /** 获取下一个仍活跃（未胡牌）的玩家座位 */
    public int nextActiveSeat(int currentSeat) {
        for (int i = 1; i <= 3; i++) {
            int next = (currentSeat + i) % 4;
            Player p = room.getPlayer(next);
            if (p != null && !p.isHu()) {
                return next;
            }
        }
        // 所有人都胡了
        return -1;
    }

    /** 获取当前游戏状态 */
    public GameState getState() {
        return state;
    }

    /** 获取所属房间 */
    public Room getRoom() {
        return room;
    }

    // ═══════════════════════════════════════════════════════════
    // 结果数据类
    // ═══════════════════════════════════════════════════════════

    /** 出牌后的结果 */
    public static class DiscardResult {
        public Tile discardedTile;
        public int fromSeat;
        public List<Integer> canHuSeats = new ArrayList<>();
        public List<Integer> canGangSeats = new ArrayList<>();
        public List<Integer> canPengSeats = new ArrayList<>();
        public List<Integer> canChiSeats = new ArrayList<>();
        public java.util.Map<Integer, List<List<Integer>>> chiOptionsBySeat = new java.util.HashMap<>();
        /** 如果没有人能碰/杠/胡，下一个摸牌的座位号 */
        public int nextDrawSeat = -1;
    }

    /** 摸牌后的结果 */
    public static class DrawResult {
        public Tile drawnTile;
        /** 牌墙是否已摸完（荒庄） */
        public boolean isExhausted = false;
        /** 能否自摸胡 */
        public boolean canZiMo = false;
        /** 胡牌结果 */
        public WinChecker.WinResult winResult;
        /** 是否海底捞月（最后一张牌） */
        public boolean isHaiDi = false;
        /** 可暗杠的 tileId 列表 */
        public List<Integer> canAnGangIds = new ArrayList<>();
        /** 能否补杠 */
        public boolean canBuGang = false;
        /** 补杠牌的 tileId */
        public int buGangTileId = -1;
    }
}
