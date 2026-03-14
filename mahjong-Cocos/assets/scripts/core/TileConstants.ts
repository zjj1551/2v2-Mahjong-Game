export const TILE_MAP: { [key: number]: string } = {
    0: "w_1", 1: "w_2", 2: "w_3", 3: "w_4", 4: "w_5", 5: "w_6", 6: "w_7", 7: "w_8", 8: "w_9",
    9: "tong_1", 10: "tong_2", 11: "tong_3", 12: "tong_4", 13: "tong_5", 14: "tong_6", 15: "tong_7", 16: "tong_8", 17: "tong_9",
    18: "tiao_1", 19: "tiao_2", 20: "tiao_3", 21: "tiao_4", 22: "tiao_5", 23: "tiao_6", 24: "tiao_7", 25: "tiao_8", 26: "tiao_9",
    [-1]: "bg"
};

export enum MessageType {
    C_JOIN_ROOM = "C_JOIN_ROOM",
    C_DISCARD = "C_DISCARD",
    S_ROOM_STATE = "S_ROOM_STATE",
    S_GAME_START = "S_GAME_START",
    S_DRAW = "S_DRAW",
    S_DISCARD = "S_DISCARD"
}
