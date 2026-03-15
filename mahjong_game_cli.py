#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简化版对局 CLI（仅用于“开局后”接管）

用法:
  MAHJONG_HOST=47.110.236.245:8081 python3 mahjong_game_cli.py <userId> <roomId>

说明:
  - 只保留对局阶段命令，不含登录/建房/选座/准备/开始。
  - 连接后会自动发送 C_JOIN_ROOM 以恢复会话。
"""

import json
import os
import sys
import threading
import time

try:
    import websocket
except ImportError:
    print("缺少 websocket-client，请先安装: pip install websocket-client")
    sys.exit(1)

HOST = os.environ.get("MAHJONG_HOST", "localhost:8081")
WS_URL = f"ws://{HOST}/ws/game"


def send(ws, user_id, room_id, msg_type, data=None):
    payload = {
        "type": msg_type,
        "roomId": room_id,
        "userId": int(user_id),
        "data": data or {},
    }
    ws.send(json.dumps(payload, ensure_ascii=False))


def pretty(msg_text):
    try:
        msg = json.loads(msg_text)
    except Exception:
        print(f"[RAW] {msg_text}")
        return

    msg_type = msg.get("type", "UNKNOWN")
    data = msg.get("data", {}) or {}

    if msg_type == "S_ERROR":
        print(f"[错误] {data.get('message', data)}")
        return

    if msg_type == "S_GAME_START":
        print("[开局] 收到发牌信息")
        print(f"  庄家座位: {data.get('bankerSeat')}")
        print(f"  本局/总局: {data.get('round')}/{data.get('maxRounds')}")
        print(f"  手牌: {data.get('handTiles')}")
        return

    if msg_type == "S_ACTION_OPTIONS":
        print(f"[可操作] {data}")
        return

    if msg_type in ("S_DRAW", "S_DISCARD", "S_PENG", "S_GANG", "S_HU", "S_ROUND_RESULT", "S_GAME_OVER", "S_SELECT_MISS_SUIT", "S_MISS_SUIT_RESULT", "S_CHAT", "S_PONG", "S_ROOM_STATE"):
        print(f"[{msg_type}] {json.dumps(data, ensure_ascii=False)}")
        return

    print(f"[{msg_type}] {json.dumps(data, ensure_ascii=False)}")


def recv_loop(ws, stop_flag):
    while not stop_flag[0]:
        try:
            message = ws.recv()
            if message is None:
                time.sleep(0.1)
                continue
            pretty(message)
        except Exception as exc:
            if not stop_flag[0]:
                print(f"[接收异常] {exc}")
            break


def print_help():
    print("""
命令列表（仅对局阶段）:
  miss <0|1|2>          提交定缺花色
  discard <tileId>      出牌
  pass                  跳过
  peng                  碰牌
  gang                  明杠
  bu <tileId>           补杠
  angang <tileId>       暗杠
  hu                    点炮胡
  zimo                  自摸胡
  chat <文本>            聊天
  ping                  心跳
  state                 请求房间状态(重发 C_JOIN_ROOM)
  help                  显示帮助
  quit                  退出
""")


def main():
    if len(sys.argv) < 3:
        print("用法: python3 mahjong_game_cli.py <userId> <roomId>")
        sys.exit(1)

    user_id = sys.argv[1]
    room_id = sys.argv[2]

    print(f"连接地址: {WS_URL}")
    print(f"用户ID: {user_id}, 房间ID: {room_id}")

    try:
        ws = websocket.create_connection(f"{WS_URL}?userId={user_id}", timeout=10)
    except Exception as exc:
        print(f"连接失败: {exc}")
        sys.exit(1)

    # 进入/恢复房间会话
    send(ws, user_id, room_id, "C_JOIN_ROOM", {})

    stop_flag = [False]
    t = threading.Thread(target=recv_loop, args=(ws, stop_flag), daemon=True)
    t.start()

    print_help()

    try:
        while True:
            line = input("game> ").strip()
            if not line:
                continue

            parts = line.split()
            cmd = parts[0].lower()
            args = parts[1:]

            if cmd in ("quit", "exit"):
                break
            if cmd == "help":
                print_help()
                continue
            if cmd == "miss" and len(args) == 1:
                send(ws, user_id, room_id, "C_SELECT_MISS_SUIT", {"suitIndex": int(args[0])})
                continue
            if cmd == "discard" and len(args) == 1:
                send(ws, user_id, room_id, "C_DISCARD", {"tileId": int(args[0])})
                continue
            if cmd == "pass":
                send(ws, user_id, room_id, "C_PASS", {})
                continue
            if cmd == "peng":
                send(ws, user_id, room_id, "C_PENG", {})
                continue
            if cmd == "gang":
                send(ws, user_id, room_id, "C_GANG", {"gangType": "MING", "tileId": 0})
                continue
            if cmd == "bu" and len(args) == 1:
                send(ws, user_id, room_id, "C_GANG", {"gangType": "BU", "tileId": int(args[0])})
                continue
            if cmd == "angang" and len(args) == 1:
                send(ws, user_id, room_id, "C_AN_GANG", {"tileId": int(args[0])})
                continue
            if cmd == "hu":
                send(ws, user_id, room_id, "C_HU", {"isSelfDraw": False})
                continue
            if cmd == "zimo":
                send(ws, user_id, room_id, "C_HU", {"isSelfDraw": True})
                continue
            if cmd == "chat" and args:
                send(ws, user_id, room_id, "C_CHAT", {"message": " ".join(args)})
                continue
            if cmd == "ping":
                send(ws, user_id, room_id, "C_PING", {})
                continue
            if cmd == "state":
                send(ws, user_id, room_id, "C_JOIN_ROOM", {})
                continue

            print("未知命令，输入 help 查看支持命令")

    except KeyboardInterrupt:
        pass
    finally:
        stop_flag[0] = True
        try:
            ws.close()
        except Exception:
            pass
        print("已退出")


if __name__ == "__main__":
    main()
