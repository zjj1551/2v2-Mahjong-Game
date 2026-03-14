package com.mahjong.websocket;

/**
 * WebSocket 统一消息体
 *
 * <pre>
 * {
 *   "type": "C_DISCARD",
 *   "roomId": "ROOM_123",
 *   "userId": 1001,
 *   "data": { "tileId": 5 }
 * }
 * </pre>
 */
public class GameMessage {

    /** 消息类型 */
    private MessageType type;

    /** 房间ID */
    private String roomId;

    /** 发送者userId（客户端消息携带；服务端消息可以不填） */
    private Long userId;

    /** 消息内容（JSON Object，具体字段依 type 而定） */
    private Object data;

    /** 错误码（仅 S_ERROR 使用） */
    private Integer errorCode;

    /** 错误描述 */
    private String errorMsg;

    public GameMessage() {}

    public GameMessage(MessageType type, Object data) {
        this.type = type;
        this.data = data;
    }

    public static GameMessage error(int code, String msg) {
        GameMessage m = new GameMessage();
        m.type = MessageType.S_ERROR;
        m.errorCode = code;
        m.errorMsg = msg;
        return m;
    }

    // ─── Getters / Setters ───────────────────────────────────

    public MessageType getType() { return type; }
    public void setType(MessageType type) { this.type = type; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public Object getData() { return data; }
    public void setData(Object data) { this.data = data; }

    public Integer getErrorCode() { return errorCode; }
    public void setErrorCode(Integer errorCode) { this.errorCode = errorCode; }

    public String getErrorMsg() { return errorMsg; }
    public void setErrorMsg(String errorMsg) { this.errorMsg = errorMsg; }
}
