export const TILE_MAP: { [key: number]: string } = {
    0: "w_1", 1: "w_2", 2: "w_3", 3: "w_4", 4: "w_5", 5: "w_6", 6: "w_7", 7: "w_8", 8: "w_9",
    9: "tong_1", 10: "tong_2", 11: "tong_3", 12: "tong_4", 13: "tong_5", 14: "tong_6", 15: "tong_7", 16: "tong_8", 17: "tong_9",
    18: "tiao_1", 19: "tiao_2", 20: "tiao_3", 21: "tiao_4", 22: "tiao_5", 23: "tiao_6", 24: "tiao_7", 25: "tiao_8", 26: "tiao_9",
    [-1]: "bg"
};

export enum MessageType {
    // Client to Server
    C_JOIN_ROOM = "C_JOIN_ROOM",
    C_LEAVE_ROOM = "C_LEAVE_ROOM",
    C_READY = "C_READY",
    C_START_GAME = "C_START_GAME",
    C_SELECT_MISS_SUIT = "C_SELECT_MISS_SUIT",
    C_DISCARD = "C_DISCARD",
    C_PENG = "C_PENG",
    C_CHI = "C_CHI",
    C_GANG = "C_GANG",
    C_AN_GANG = "C_AN_GANG",
    C_HU = "C_HU",
    C_PASS = "C_PASS",
    C_CHAT = "C_CHAT",
    C_PING = "C_PING",

    // Server to Client
    S_ROOM_STATE = "S_ROOM_STATE",
    S_SPECTATE_INIT = "S_SPECTATE_INIT",
    S_PLAYER_STATUS = "S_PLAYER_STATUS",
    S_GAME_START = "S_GAME_START",
    S_SELECT_MISS_SUIT = "S_SELECT_MISS_SUIT",
    S_MISS_SUIT_RESULT = "S_MISS_SUIT_RESULT",
    S_DRAW = "S_DRAW",
    S_DISCARD = "S_DISCARD",
    S_ACTION_OPTIONS = "S_ACTION_OPTIONS",
    S_PENG = "S_PENG",
    S_GANG = "S_GANG",
    S_CHI = "S_CHI",
    S_GANG_DRAW = "S_GANG_DRAW",
    S_HU = "S_HU",
    S_COUNTDOWN = "S_COUNTDOWN",
    S_ROUND_RESULT = "S_ROUND_RESULT",
    S_GAME_OVER = "S_GAME_OVER",
    S_CHAT = "S_CHAT",
    S_ERROR = "S_ERROR",
    S_PONG = "S_PONG"
}
