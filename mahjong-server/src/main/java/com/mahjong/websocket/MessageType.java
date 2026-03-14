package com.mahjong.websocket;

/**
 * WebSocket 消息类型枚举
 *
 * <p>客户端→服务器（C2S）消息类型用 "C_" 前缀，服务器→客户端（S2C）用 "S_" 前缀。
 */
public enum MessageType {

    // ──────────── 客户端 → 服务器 ────────────────────────────

    /** 玩家进入房间（携带 roomId 和 userId） */
    C_JOIN_ROOM,

    /** 玩家选择定缺花色（携带 suitIndex: 0=万 1=筒 2=条） */
    C_SELECT_MISS_SUIT,

    /** 玩家出牌（携带 tileId） */
    C_DISCARD,

    /** 玩家声明碰牌 */
    C_PENG,

    /** 玩家声明明杠（他人打出）或补杠（自己已碰的牌再摸一张） */
    C_GANG,

    /** 玩家声明暗杠（自己手里4张） */
    C_AN_GANG,

    /** 玩家声明胡牌（点炮或自摸） */
    C_HU,

    /** 玩家选择跳过（不碰/不杠/不胡） */
    C_PASS,

    /** 玩家发送聊天消息 */
    C_CHAT,
    /** 玩家选择座位（data: {seatIndex: 0-3}） */
    C_CHOOSE_SEAT,

    /** 玩家从座位起身，回到大厅 */
    C_LEAVE_SEAT,

    /** 玩家切换准备状态（必须已就座） */
    C_READY,

    /** 玩家完全离开房间 */
    C_LEAVE_ROOM,

    /** 房主解散房间（仅房主可用） */
    C_DISBAND_ROOM,

    /** 房间内好友邀请：data: {targetUserId} */
    C_INVITE_FRIEND,

    /** 房主强制开始游戏（需或1个以上就座玩家） */
    C_START_GAME,
    /** 心跳包 */
    C_PING,

    // ──────────── 服务器 → 客户端 ────────────────────────────

    /** 房间状态同步（玩家列表、座位、队伍） */
    S_ROOM_STATE,

    /** 游戏开始，发牌信息（只发给自己的手牌） */
    S_GAME_START,

    /** 定缺阶段开始 */
    S_SELECT_MISS_SUIT,

    /** 某玩家定缺结果广播 */
    S_MISS_SUIT_RESULT,

    /** 摸牌通知（只发给摸牌的玩家） */
    S_DRAW,

    /** 出牌广播（全房间）：谁打了什么牌 */
    S_DISCARD,

    /** 询问玩家是否碰/杠/胡（携带可用操作列表） */
    S_ACTION_OPTIONS,

    /** 碰牌广播 */
    S_PENG,

    /** 杠牌广播（明杠/补杠/暗杠） */
    S_GANG,

    /** 杠后摸牌（发给杠牌玩家） */
    S_GANG_DRAW,

    /** 胡牌广播（含胡牌型、得分） */
    S_HU,

    /** 本局结算广播（含各人得分、队伍总分） */
    S_ROUND_RESULT,

    /** 全局比赛结束广播 */
    S_GAME_OVER,

    /** 聊天广播 */
    S_CHAT,

    /** 玩家上线/离线通知 */
    S_PLAYER_STATUS,

    /** 房间已解散（房主离开或主动解散）data: {roomId, reason} */
    S_ROOM_DISBANDED,

    /** 玩家离开房间成功回执 data: {userId} */
    S_LEAVE_ROOM,

    /** 座位变动广播（有人入座或起身）data: {seatIndex, action: "SIT"/"STAND", userId, nickname} */
    S_SEAT_CHANGED,

    /** 玩家准备状态变动 data: {seatIndex, userId, ready} */
    S_READY_CHANGED,

    /** 倒计时提醒 */
    S_COUNTDOWN,

    /** 好友邀请通知 data: {roomId, roomName, inviterId, inviterNickname} */
    S_ROOM_INVITE,

    /** 观战初始化（进入进行中房间时） data: {players, discardPiles, round, bankerSeat, phase} */
    S_SPECTATE_INIT,

    /** 错误消息（操作不合法等） */
    S_ERROR,

    /** 心跳响应 */
    S_PONG
}
