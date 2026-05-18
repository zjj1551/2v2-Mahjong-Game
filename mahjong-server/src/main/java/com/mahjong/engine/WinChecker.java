package com.mahjong.engine;

import com.mahjong.model.Meld;
import com.mahjong.model.Player;
import com.mahjong.model.Tile;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 胡牌判定引擎（四川麻将版）
 */
public class WinChecker {

    private static final int TILE_KIND_COUNT = 27;

    public static WinResult checkWin(Player player, Tile winTile) {
        return checkWin(player, winTile, true);
    }

    /**
     * @param includeWinTile true=将 winTile 额外加入手牌计数（点炮/抢杠）；false=winTile 已在手牌内（自摸后判定）
     */
    public static WinResult checkWin(Player player, Tile winTile, boolean includeWinTile) {
        if (player == null || winTile == null) {
            return null;
        }

        int[] counts = player.toCountArray();
        if (!checkMissSuit(player, counts, winTile)) {
            return null;
        }
        if (includeWinTile) {
            counts[winTile.getTileId()]++;
        }

        if (!isValidHandSize(player, counts)) {
            return null;
        }

        if (player.getMelds().isEmpty() && player.getConcealedKongs().isEmpty()) {
            WinResult qiDuiResult = checkQiDui(counts);
            if (qiDuiResult != null) {
                qiDuiResult.setWinTile(winTile);
                return qiDuiResult;
            }
        }

        if (checkNormal(counts, player.getMelds().size() + player.getConcealedKongs().size())) {
            WinResult result = new WinResult();
            result.setWinTile(winTile);
            result.setQiDui(false);
            result.setQingYiSe(isQingYiSe(counts));
            return result;
        }

        return null;
    }

    private static boolean isValidHandSize(Player player, int[] counts) {
        int handSize = 0;
        for (int c : counts) {
            handSize += c;
        }
        int meldTiles = player.getMelds().size() * 3 + player.getConcealedKongs().size() * 4;
        return (handSize + meldTiles) % 3 == 2;
    }

    private static boolean checkMissSuit(Player player, int[] counts, Tile winTile) {
        int missSuit = player.getMissSuit();
        if (missSuit < 0) {
            return false;
        }
        if (counts != null) {
            for (int tileId = 0; tileId < Math.min(counts.length, TILE_KIND_COUNT); tileId++) {
                if (counts[tileId] > 0 && tileId / 9 == missSuit) {
                    return false;
                }
            }
        } else {
            for (Tile t : player.getHandTiles()) {
                if (t.getType().getIndex() == missSuit) {
                    return false;
                }
            }
        }
        return winTile.getType().getIndex() != missSuit;
    }

    private static boolean checkMissSuit(Player player, Tile winTile) {
        int missSuit = player.getMissSuit();
        if (missSuit < 0) {
            return false;
        }
        for (Tile t : player.getHandTiles()) {
            if (t.getType().getIndex() == missSuit) {
                return false;
            }
        }
        return winTile.getType().getIndex() != missSuit;
    }

    private static WinResult checkQiDui(int[] counts) {
        int pairCount = 0;
        boolean isDragonQiDui = false;
        for (int i = 0; i < TILE_KIND_COUNT; i++) {
            if (counts[i] == 2) {
                pairCount++;
            } else if (counts[i] == 4) {
                pairCount += 2;
                isDragonQiDui = true;
            } else if (counts[i] != 0) {
                return null;
            }
        }
        if (pairCount != 7) {
            return null;
        }

        WinResult result = new WinResult();
        result.setQiDui(true);
        result.setDragonQiDui(isDragonQiDui);
        result.setQingYiSe(isQingYiSe(counts));
        return result;
    }

    private static boolean checkNormal(int[] counts, int meldCount) {
        int needMeld = 4 - meldCount;
        int[] arr = Arrays.copyOf(counts, counts.length);

        for (int i = 0; i < TILE_KIND_COUNT; i++) {
            if (arr[i] >= 2) {
                arr[i] -= 2;
                if (canFormMelds(arr, needMeld)) {
                    return true;
                }
                arr[i] += 2;
            }
        }
        return false;
    }

    private static boolean canFormMelds(int[] arr, int meldsNeeded) {
        if (meldsNeeded == 0) {
            for (int c : arr) {
                if (c != 0) return false;
            }
            return true;
        }

        int first = -1;
        for (int i = 0; i < TILE_KIND_COUNT; i++) {
            if (arr[i] > 0) {
                first = i;
                break;
            }
        }
        if (first < 0) return false;

        if (arr[first] >= 3) {
            arr[first] -= 3;
            if (canFormMelds(arr, meldsNeeded - 1)) {
                arr[first] += 3;
                return true;
            }
            arr[first] += 3;
        }

        int suit = first / 9;
        int next1 = first + 1;
        int next2 = first + 2;
        if (next2 < TILE_KIND_COUNT && next2 / 9 == suit) {
            if (arr[first] >= 1 && arr[next1] >= 1 && arr[next2] >= 1) {
                arr[first]--;
                arr[next1]--;
                arr[next2]--;
                if (canFormMelds(arr, meldsNeeded - 1)) {
                    arr[first]++;
                    arr[next1]++;
                    arr[next2]++;
                    return true;
                }
                arr[first]++;
                arr[next1]++;
                arr[next2]++;
            }
        }

        return false;
    }

    private static boolean isQingYiSe(int[] counts) {
        boolean[] hasAny = new boolean[3];
        for (int i = 0; i < TILE_KIND_COUNT; i++) {
            if (counts[i] > 0) {
                hasAny[i / 9] = true;
            }
        }
        int suitCount = 0;
        for (boolean b : hasAny) {
            if (b) suitCount++;
        }
        return suitCount == 1;
    }

    public static boolean canPeng(Player player, Tile tile) {
        if (player == null || tile == null) {
            return false;
        }
        int missSuit = player.getMissSuit();
        if (missSuit >= 0 && tile.getType().getIndex() == missSuit) {
            return false;
        }
        return player.countTile(tile.getTileId()) >= 2;
    }

    public static boolean canMingGang(Player player, Tile tile) {
        if (player == null || tile == null) {
            return false;
        }
        int missSuit = player.getMissSuit();
        if (missSuit >= 0 && tile.getType().getIndex() == missSuit) {
            return false;
        }
        return player.countTile(tile.getTileId()) >= 3;
    }

    public static List<List<Integer>> getChiOptions(Player player, Tile tile) {
        List<List<Integer>> options = new ArrayList<>();
        if (player == null || tile == null) {
            return options;
        }
        int missSuit = player.getMissSuit();
        if (missSuit >= 0 && tile.getType().getIndex() == missSuit) {
            return options;
        }
        int tileId = tile.getTileId();
        int suitStart = (tileId / 9) * 9;
        int indexInSuit = tileId % 9;
        int[] counts = player.toCountArray();

        if (indexInSuit >= 2) {
            int left2 = tileId - 2;
            int left1 = tileId - 1;
            if (counts[left2] > 0 && counts[left1] > 0) {
                options.add(List.of(left2, left1));
            }
        }
        if (indexInSuit >= 1 && indexInSuit <= 7) {
            int left = tileId - 1;
            int right = tileId + 1;
            if (counts[left] > 0 && counts[right] > 0) {
                options.add(List.of(left, right));
            }
        }
        if (indexInSuit <= 6) {
            int right1 = tileId + 1;
            int right2 = tileId + 2;
            if (counts[right1] > 0 && counts[right2] > 0) {
                options.add(List.of(right1, right2));
            }
        }

        options.removeIf(pair -> pair.stream().anyMatch(id -> id < suitStart || id >= suitStart + 9));
        return options;
    }

    public static boolean canChi(Player player, Tile tile) {
        return !getChiOptions(player, tile).isEmpty();
    }

    public static boolean canBuGang(Player player, Tile drawnTile) {
        for (Meld meld : player.getMelds()) {
            if (meld.getType() == Meld.MeldType.PENG &&
                    !meld.getTiles().isEmpty() && meld.getTiles().get(0).getTileId() == drawnTile.getTileId()) {
                return true;
            }
        }
        return false;
    }

    public static boolean canAnGang(Player player, int tileId) {
        if (player == null) {
            return false;
        }
        int missSuit = player.getMissSuit();
        if (missSuit >= 0) {
            Tile tile = Tile.fromId(tileId, 0);
            if (tile.getType().getIndex() == missSuit) {
                return false;
            }
        }
        return player.countTile(tileId) >= 4;
    }

    public static int calcShanten(int[] counts, int meldCount) {
        int needMeld = 4 - meldCount;
        int qiDuiShanten = calcQiDuiShanten(counts);
        int normalShanten = calcNormalShanten(counts, needMeld);
        return Math.min(qiDuiShanten, normalShanten);
    }

    private static int calcQiDuiShanten(int[] counts) {
        int pairs = 0;
        int singles = 0;
        for (int c : counts) {
            if (c >= 2) pairs++;
            else if (c == 1) singles++;
        }
        if (pairs > 7) pairs = 7;
        return 6 - pairs + Math.max(0, 7 - pairs - singles);
    }

    private static int calcNormalShanten(int[] counts, int needMeld) {
        int[] arr = Arrays.copyOf(counts, counts.length);
        int best = 8;

        for (int i = 0; i < TILE_KIND_COUNT; i++) {
            if (arr[i] >= 2) {
                arr[i] -= 2;
                int val = calcMeldShanten(arr, needMeld, 0);
                best = Math.min(best, val);
                arr[i] += 2;
            }
        }
        best = Math.min(best, calcMeldShanten(arr, needMeld, 1));
        return best;
    }

    private static int calcMeldShanten(int[] arr, int needMeld, int noJtou) {
        int[] copy = Arrays.copyOf(arr, arr.length);
        int completeMelds = 0;
        int partialMelds = 0;

        for (int i = 0; i < TILE_KIND_COUNT; i++) {
            completeMelds += copy[i] / 3;
            copy[i] %= 3;
        }

        for (int i = 0; i < TILE_KIND_COUNT; i++) {
            int suit = i / 9;
            while (copy[i] > 0 && i + 1 < TILE_KIND_COUNT && i + 2 < TILE_KIND_COUNT
                    && (i + 1) / 9 == suit && (i + 2) / 9 == suit
                    && copy[i + 1] > 0 && copy[i + 2] > 0) {
                copy[i]--;
                copy[i + 1]--;
                copy[i + 2]--;
                completeMelds++;
            }
        }

        for (int i = 0; i < TILE_KIND_COUNT; i++) {
            int suit = i / 9;
            if (copy[i] >= 2) {
                partialMelds++;
                copy[i] -= 2;
            }
            if (copy[i] > 0 && i + 1 < TILE_KIND_COUNT && (i + 1) / 9 == suit && copy[i + 1] > 0) {
                partialMelds++;
                copy[i] = 0;
                copy[i + 1] = 0;
            }
            if (copy[i] > 0 && i + 2 < TILE_KIND_COUNT && (i + 2) / 9 == suit && copy[i + 2] > 0) {
                partialMelds++;
                copy[i] = 0;
                copy[i + 2] = 0;
            }
        }

        if (completeMelds > needMeld) completeMelds = needMeld;
        int total = needMeld - completeMelds;
        int partialUsed = Math.min(partialMelds, total);
        return (needMeld - completeMelds - partialUsed) * 2 + (total - partialUsed) + noJtou - 1;
    }

    /**
     * 获取玩家当前的听牌列表。
     * 13张时：返回摸哪些牌可胡。
     * 14张时：返回打掉哪一张后进入听牌状态，再能胡哪些牌的并集。
     */
    public static List<Integer> getTingTiles(Player player) {
        int[] counts = player.toCountArray();
        int meldCount = player.getMelds().size() + player.getConcealedKongs().size();
        int handSize = player.getHandTiles().size();
        Set<Integer> waiting = new LinkedHashSet<>();

        if (handSize % 3 == 1) {
            if (calcShanten(counts, meldCount) != 0) {
                return new ArrayList<>();
            }
            collectWinningTiles(player, counts, waiting);
        } else if (handSize % 3 == 2) {
            for (int discardId = 0; discardId < TILE_KIND_COUNT; discardId++) {
                if (counts[discardId] <= 0) continue;
                counts[discardId]--;
                if (calcShanten(counts, meldCount) == 0) {
                    collectWinningTiles(player, counts, waiting);
                }
                counts[discardId]++;
            }
        }

        return new ArrayList<>(waiting);
    }

    private static void collectWinningTiles(Player player, int[] baseCounts, Set<Integer> waiting) {
        for (int tileId = 0; tileId < TILE_KIND_COUNT; tileId++) {
            if (canWinAfterAdding(player, baseCounts, tileId)) {
                waiting.add(tileId);
            }
        }
    }

    private static boolean canWinAfterAdding(Player player, int[] baseCounts, int tileId) {
        if (player.getMissSuit() >= 0) {
            Tile tile = Tile.fromId(tileId, 0);
            if (tile.getType().getIndex() == player.getMissSuit()) {
                return false;
            }
        }
        int[] counts = Arrays.copyOf(baseCounts, baseCounts.length);
        counts[tileId]++;
        return checkWinByCounts(player, counts, Tile.fromId(tileId, 0), false) != null;
    }

    private static WinResult checkWinByCounts(Player player, int[] counts, Tile winTile, boolean includeWinTile) {
        if (!checkMissSuit(player, counts, winTile)) {
            return null;
        }

        int[] working = Arrays.copyOf(counts, counts.length);
        if (includeWinTile) {
            working[winTile.getTileId()]++;
        }
        if (!isValidHandSize(player, working)) {
            return null;
        }

        if (player.getMelds().isEmpty() && player.getConcealedKongs().isEmpty()) {
            WinResult qiDuiResult = checkQiDui(working);
            if (qiDuiResult != null) {
                qiDuiResult.setWinTile(winTile);
                return qiDuiResult;
            }
        }

        if (checkNormal(working, player.getMelds().size() + player.getConcealedKongs().size())) {
            WinResult result = new WinResult();
            result.setWinTile(winTile);
            result.setQiDui(false);
            result.setQingYiSe(isQingYiSe(working));
            return result;
        }

        return null;
    }

    public static class WinResult {
        private Tile winTile;
        private boolean qiDui;
        private boolean dragonQiDui;
        private boolean qingYiSe;

        public Tile getWinTile() { return winTile; }
        public void setWinTile(Tile winTile) { this.winTile = winTile; }
        public boolean isQiDui() { return qiDui; }
        public void setQiDui(boolean qiDui) { this.qiDui = qiDui; }
        public boolean isDragonQiDui() { return dragonQiDui; }
        public void setDragonQiDui(boolean dragonQiDui) { this.dragonQiDui = dragonQiDui; }
        public boolean isQingYiSe() { return qingYiSe; }
        public void setQingYiSe(boolean qingYiSe) { this.qingYiSe = qingYiSe; }
    }
}
