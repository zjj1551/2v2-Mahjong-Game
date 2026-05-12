# HTML 与 Cocos 状态对齐方案

适用范围：网页前端分成两层，Cocos 负责对局内渲染，HTML 负责外壳、状态条、聊天、结算等辅助 UI。

## 目标
- 缺 X 图标：能够稳定展示玩家在线/离线状态。
- 胡图标：玩家胡牌后，其他人能立即看到，并且在重连后也能恢复显示。
- 不改 Cocos TS 版本的前提下，先把后端信号打通，HTML 层完成可见部分。

## 后端信号
- `S_ROOM_STATE`：房间实时快照，包含 `seats[].online`、`seats[].ready`、`seats[].isBot`、`seats[].missSuit`、`seats[].isHu`。
- `S_HU`：胡牌即时广播，至少包含 `seatIndex`、`isHu=true`、`score`、`winTile`、`fromSeat`、`isSelfDraw`。
- `S_SPECTATE_INIT`：观战初始化，同样包含 `isHu`，用于旁观或重连场景。

## HTML 侧已完成内容
- 网页对局页新增玩家状态条，展示每个座位的在线、准备、定缺、胡牌、AI 状态。
- `S_ROOM_STATE` 到来时刷新整条状态。
- `S_HU` 到来时立即把对应玩家标记为“胡”，不等待下一次全量状态。
- 这部分只依赖 HTML / CSS / JS，不改任何 TS。

## Cocos 同事实现颗粒度
1. 取数层：统一监听 `S_ROOM_STATE`、`S_HU`、`S_SPECTATE_INIT`，整理成一个玩家状态对象。
2. 头像层：在每个座位头像旁预留两个独立标识位，一个是缺 X，一个是胡。
3. 状态优先级：
   - 在线优先于离线遮罩。
   - 胡牌标识优先级高于普通状态，但不覆盖定缺标识。
   - 若一个玩家既已胡又离线，保留胡牌图标，离线只做灰化。
4. 刷新策略：
   - `S_ROOM_STATE` 用来做全量重绘和重连恢复。
   - `S_HU` 用来做即时点亮。
   - 新一局或重开局时，统一清空上一局的胡牌标识。
5. 表现建议：
   - 缺 X 用角标或头像上方小徽记。
   - 胡牌用金色或绿色徽记，最好固定在头像右上角，避免和定缺冲突。

## 接口示例
### `S_ROOM_STATE`
```json
{
  "type": "S_ROOM_STATE",
  "data": {
    "roomId": "R123",
    "status": "PLAYING",
    "seats": [
      { "seatIndex": 0, "nickname": "A", "online": true, "ready": true, "missSuit": 0, "isHu": false },
      { "seatIndex": 1, "nickname": "B", "online": true, "ready": true, "missSuit": 1, "isHu": true }
    ]
  }
}
```

### `S_HU`
```json
{
  "type": "S_HU",
  "data": {
    "seatIndex": 1,
    "isHu": true,
    "isSelfDraw": false,
    "score": 12,
    "fromSeat": 0,
    "winTile": { "tileId": 12 }
  }
}
```

## 实施建议
- 先由 HTML 层完成可见状态条，确保接口字段稳定。
- Cocos 同事只需要在头像组件里做状态角标，不需要改业务判定。
- 如果后面需要把状态条移入 Cocos 内，也可以复用同一套字段，不改后端。
