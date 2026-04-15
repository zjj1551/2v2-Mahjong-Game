package com.mahjong.engine;

import com.mahjong.model.Player;
import com.mahjong.model.Tile;
import com.mahjong.model.Meld;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 胡牌判定引擎（四川麻将版）
 *
 * <p>支持：平胡（4面子+1雀头）、七对、清一色、龙七对（豪华七对）
 * <p>四川麻将特殊规则：
 * <ul>
 *   <li>必须定缺，手牌中不能有定缺花色的牌</li>
 *   <li>不含风牌和箭牌</li>
 *   <li>支持血战到底：已胡牌玩家不再参与，但游戏继续</li>
 * </ul>
 */
public class WinChecker {

    /**
     * 检查玩家是否可以胡指定的牌（自摸或点炮）
     *
     * @param player    当前玩家
     * @param winTile   胡的那张牌（自摸或他人打出的）
     * @return 胡牌结果，若不能胡返回 null
     */
    public static WinResult checkWin(Player player, Tile winTile) {
        // 1. 定缺检查：手牌（含胡的那张）不能有定缺花色
        if (!checkMissSuit(player, winTile)) {
            return null;
        }

        // 构建完整手牌计数（手牌 + 胡牌）
        int[] counts = player.toCountArray();
        counts[winTile.getTileId()]++;

        // 手牌数必须是合法的（副露后剩余+副露面子+暗杠 = 完整手牌14张逻辑）
        // 胡牌时：副露面子数*3 + 暗杠数*4 + 纯手牌数 = 14
        int handSize = player.getHandTiles().size() + 1; // 加上胡的那张
        int meldTiles = player.getMelds().size() * 3 + player.getConcealedKongs().size() * 4;
        if ((handSize + meldTiles) % 3 != 2) {
            return null; // 牌数不对
        }

        // 2. 检查七对
        if (player.getMelds().isEmpty() && player.getConcealedKongs().isEmpty()) {
            WinResult qiDuiResult = checkQiDui(counts);
            if (qiDuiResult != null) {
                return qiDuiResult;
            }
        }

        // 3. 检查普通胡牌（4面子+1雀头）
        boolean canWin = checkNormal(counts, player.getMelds().size() + player.getConcealedKongs().size());
        if (canWin) {
            WinResult result = new WinResult();
            result.setWinTile(winTile);
            result.setQiDui(false);
            // 检查清一色
            result.setQingYiSe(isQingYiSe(counts));
            return result;
        }

        return null;
    }

    /**
     * 定缺检查：完整手牌（含胡的那张）不能含有定缺花色
     */
    private static boolean checkMissSuit(Player player, Tile winTile) {
        int missSuit = player.getMissSuit();
        if (missSuit < 0) return false; // 未定缺，不能胡牌

        // 手牌中不能有定缺花色
        for (Tile t : player.getHandTiles()) {
            if (t.getType().getIndex() == missSuit) return false;
        }
        // 胡的那张也不能是定缺花色
        if (winTile.getType().getIndex() == missSuit) return false;

        return true;
    }

    /**
     * 七对检查：7对不同的对子（或龙七对：含四张相同算两对）
     */
    private static WinResult checkQiDui(int[] counts) {
        int pairCount = 0;
        boolean isDragonQiDui = false;

        for (int i = 0; i < 27; i++) {
            if (counts[i] == 2) {
                pairCount++;
            } else if (counts[i] == 4) {
                // 龙七对：4张相同算两对
                pairCount += 2;
                isDragonQiDui = true;
            } else if (counts[i] != 0) {
                return null; // 有奇数张，不是七对
            }
        }

        if (pairCount == 7) {
            WinResult result = new WinResult();
            result.setQiDui(true);
            result.setDragonQiDui(isDragonQiDui);
            result.setQingYiSe(isQingYiSe(counts));
            return result;
        }
        return null;
    }

    /**
     * 普通胡牌判定（回溯法）：4面子 + 1雀头
     * meldCount：已有的副露面子数量
     */
    private static boolean checkNormal(int[] counts, int meldCount) {
        int[] arr = Arrays.copyOf(counts, counts.length);
        // 需要凑成的面子数 = 4 - meldCount
        int needMeld = 4 - meldCount;

        // 尝试每个可能的雀头
        for (int i = 0; i < 27; i++) {
            if (arr[i] >= 2) {
                arr[i] -= 2;
                if (canFormMelds(arr, needMeld)) {
                    arr[i] += 2;
                    return true;
                }
                arr[i] += 2;
            }
        }
        return false;
    }

    /**
     * 递归判断能否凑成指定数量的面子（顺子或刻子）
     */
    private static boolean canFormMelds(int[] arr, int meldsNeeded) {
        if (meldsNeeded == 0) {
            // 检查是否全部用完
            for (int c : arr) {
                if (c != 0) return false;
            }
            return true;
        }

        // 找到第一个非零的牌
        int first = -1;
        for (int i = 0; i < 27; i++) {
            if (arr[i] > 0) {
                first = i;
                break;
            }
        }
        if (first < 0) return false;

        // 尝试刻子
        if (arr[first] >= 3) {
            arr[first] -= 3;
            if (canFormMelds(arr, meldsNeeded - 1)) {
                arr[first] += 3;
                return true;
            }
            arr[first] += 3;
        }

        // 尝试顺子（需要同花色，且不能跨花色）
        int suit = first / 9;
        int next1 = first + 1;
        int next2 = first + 2;
        if (next2 / 9 == suit && next2 < 27) { // 同花色内
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

    /**
     * 清一色检查：所有牌（counts数组）仅使用一种花色
     */
    private static boolean isQingYiSe(int[] counts) {
        boolean[] hasAny = new boolean[3];
        for (int i = 0; i < 27; i++) {
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

    /**
     * 判断某张牌打出后，其他玩家是否可以碰（手牌中有2张相同）
     */
    public static boolean canPeng(Player player, Tile tile) {
        return player.countTile(tile.getTileId()) >= 2;
    }

    /**
     * 判断某张牌打出后，某玩家是否可以明杠（手牌中有3张相同）
     */
    public static boolean canMingGang(Player player, Tile tile) {
        return player.countTile(tile.getTileId()) >= 3;
    }

    /**
     * 判断某张牌打出后，某玩家是否可以吃（仅数值牌，返回所有可行吃法）
     * 每个吃法返回两张需要从手牌消耗的 tileId。
     */
    public static List<List<Integer>> getChiOptions(Player player, Tile tile) {
        List<List<Integer>> options = new ArrayList<>();
        int tileId = tile.getTileId();
        int suitStart = (tileId / 9) * 9;
        int indexInSuit = tileId % 9;

        int[] counts = player.toCountArray();

        // x-2, x-1, x
        if (indexInSuit >= 2) {
            int left2 = tileId - 2;
            int left1 = tileId - 1;
            if (counts[left2] > 0 && counts[left1] > 0) {
                options.add(List.of(left2, left1));
            }
        }

        // x-1, x, x+1
        if (indexInSuit >= 1 && indexInSuit <= 7) {
            int left = tileId - 1;
            int right = tileId + 1;
            if (counts[left] > 0 && counts[right] > 0) {
                options.add(List.of(left, right));
            }
        }

        // x, x+1, x+2
        if (indexInSuit <= 6) {
            int right1 = tileId + 1;
            int right2 = tileId + 2;
            if (counts[right1] > 0 && counts[right2] > 0) {
                options.add(List.of(right1, right2));
            }
        }

        // 防御式过滤：确保都在同一花色内
        options.removeIf(pair -> pair.stream().anyMatch(id -> id < suitStart || id >= suitStart + 9));
        return options;
    }

    public static boolean canChi(Player player, Tile tile) {
        return !getChiOptions(player, tile).isEmpty();
    }

    /**
     * 判断某玩家摸牌后是否可以补杠（已碰某牌，且刚摸到同种牌）
     */
    public static boolean canBuGang(Player player, Tile drawnTile) {
        for (Meld meld : player.getMelds()) {
            if (meld.getType() == Meld.MeldType.PENG &&
                    meld.getTiles().get(0).getTileId() == drawnTile.getTileId()) {
                return true;
            }
        }
        return false;
    }

    /**
     * 判断摸牌后是否可以暗杠（手牌中有4张相同）
     */
    public static boolean canAnGang(Player player, int tileId) {
        return player.countTile(tileId) >= 4;
    }

    /**
     * 计算向听数（shanten number）
     * 返回值：-1 = 已胡牌；0 = 听牌；n = 还需n张进入听牌
     */
    public static int calcShanten(int[] counts, int meldCount) {
        int needMeld = 4 - meldCount;
        // 七对向听数
        int qiDuiShanten = calcQiDuiShanten(counts);
        // 普通胡牌向听数
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
        int best = 8; // 最坏情况

        for (int i = 0; i < 27; i++) {
            if (arr[i] >= 2) {
                arr[i] -= 2;
                int val = calcMeldShanten(arr, needMeld, 0);
                best = Math.min(best, val);
                arr[i] += 2;
            }
        }
        // 也尝试无雀头
        best = Math.min(best, calcMeldShanten(arr, needMeld, 1));
        return best;
    }

    /**
     * 贪心计算面子向听数（包含面子+搭子数量）
     * noJtou = 1 表示还需要凑一个雀头，算作额外需要1张
     */
    private static int calcMeldShanten(int[] arr, int needMeld, int noJtou) {
        int[] copy = Arrays.copyOf(arr, arr.length);
        int completeMelds = 0;
        int partialMelds = 0; // 搭子（两张连续或两张相同）

        // 先贪心抽刻子
        for (int i = 0; i < 27; i++) {
            completeMelds += copy[i] / 3;
            copy[i] %= 3;
        }
        // 再贪心抽顺子
        for (int i = 0; i < 27; i++) {
            int suit = i / 9;
            while (copy[i] > 0 && i + 1 < 27 && (i + 1) / 9 == suit && i + 2 < 27 && (i + 2) / 9 == suit
                    && copy[i + 1] > 0 && copy[i + 2] > 0) {
                copy[i]--;
                copy[i + 1]--;
                copy[i + 2]--;
                completeMelds++;
            }
        }
        // 计算搭子
        for (int i = 0; i < 27; i++) {
            int suit = i / 9;
            if (copy[i] >= 2) {
                partialMelds++;
                copy[i] -= 2;
            }
            if (copy[i] > 0 && i + 1 < 27 && (i + 1) / 9 == suit && copy[i + 1] > 0) {
                partialMelds++;
                copy[i] = 0;
                copy[i + 1] = 0;
            }
            if (copy[i] > 0 && i + 2 < 27 && (i + 2) / 9 == suit && copy[i + 2] > 0) {
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
     * 获取玩家当前的听牌列表（向听数为0时，返回可以胡的牌tileId列表）
     */
    public static List<Integer> getTingTiles(Player player) {
        List<Integer> tingList = new ArrayList<>();
        int[] counts = player.toCountArray();
        int meldCount = player.getMelds().size() + player.getConcealedKongs().size();

        if (calcShanten(counts, meldCount) != 0) {
            return tingList; // 未听牌
        }

        for (int tileId = 0; tileId < 27; tileId++) {
            counts[tileId]++;
            // 需要满足向听数变为-1（已胡）
            if (calcShanten(counts, meldCount) == -1) {
                // 还要检查定缺
                Tile testTile = Tile.fromId(tileId, 0);
                if (!player.isMissSuit(testTile.getType().getIndex())) {
                    tingList.add(tileId);
                }
            }
            counts[tileId]--;
        }
        return tingList;
    }

    // ─── 胡牌结果内部类 ──────────────────────────────────────

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
