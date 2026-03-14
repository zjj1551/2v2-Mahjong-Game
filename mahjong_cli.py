#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
麻将后端 CLI 测试工具
========================================
用法:
  交互模式:   python mahjong_cli.py
  直接命令:   python mahjong_cli.py <命令> [参数...]
  自定义地址: MAHJONG_HOST=192.168.1.100:8080 python mahjong_cli.py ping

依赖安装:
  pip install requests           # REST 测试（必须）
  pip install websocket-client   # WebSocket 测试（可选）
"""
import sys, os, json, time, threading, random, string
from pathlib import Path

# ─── 依赖检查 ─────────────────────────────────────────────
try:
    import requests as _req
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    import websocket
    HAS_WS = True
except ImportError:
    HAS_WS = False

# ─── 配置 ─────────────────────────────────────────────────
HOST      = os.environ.get("MAHJONG_HOST", "localhost:8080")
BASE_URL  = f"http://{HOST}"
WS_URL    = f"ws://{HOST}/ws/game"
TIMEOUT   = 10
SESSION_FILE = Path.home() / ".mahjong_cli_session.json"

# ─── 颜色 ─────────────────────────────────────────────────
_NO_COLOR = bool(os.environ.get("NO_COLOR")) or not sys.stdout.isatty()
def _c(code, t): return t if _NO_COLOR else f"\033[{code}m{t}\033[0m"
def red(t):    return _c("31", t)
def green(t):  return _c("32", t)
def yellow(t): return _c("33", t)
def cyan(t):   return _c("36", t)
def bold(t):   return _c("1",  t)
def dim(t):    return _c("2",  t)

def ok(msg):   print(green(f"✓  {msg}"))
def err(msg):  print(red(f"✗  {msg}"))
def info(msg): print(cyan(f"→  {msg}"))

def die(msg, code=1):
    err(msg); sys.exit(code)

# ─── 会话 ─────────────────────────────────────────────────
def load_session():
    try:   return json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    except: return {}

def save_session(data):
    SESSION_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def clear_session():
    SESSION_FILE.unlink(missing_ok=True)

def _need_login():
    sess = load_session()
    if not sess: die("请先登录: python mahjong_cli.py login <username> <password>")
    return sess

# ─── HTTP 工具 ────────────────────────────────────────────
def _need_requests():
    if not HAS_REQUESTS:
        die("缺少 requests，请运行: pip install requests")

def _http(method, path, json_body=None, params=None):
    _need_requests()
    url = f"{BASE_URL}{path}"
    try:
        if method == "GET":
            r = _req.get(url, params=params, timeout=TIMEOUT)
        elif method == "POST":
            r = _req.post(url, json=json_body, params=params, timeout=TIMEOUT)
        elif method == "PUT":
            r = _req.put(url, json=json_body, timeout=TIMEOUT)
        elif method == "DELETE":
            r = _req.delete(url, params=params, timeout=TIMEOUT)
        return r.json()
    except _req.exceptions.ConnectionError:
        die(f"无法连接服务器 {BASE_URL}，请确认后端已启动")
    except _req.exceptions.Timeout:
        die(f"请求超时 ({TIMEOUT}s)")
    except Exception as e:
        die(f"请求异常: {e}")

get    = lambda path, params=None:         _http("GET",    path, params=params)
post   = lambda path, body=None, **kw:    _http("POST",   path, json_body=body, **kw)
put    = lambda path, body=None:          _http("PUT",    path, json_body=body)
delete = lambda path, params=None:        _http("DELETE", path, params=params)

def pretty(data):
    print(json.dumps(data, ensure_ascii=False, indent=2))

# ═══════════════════════════════════════════════════════════
# USER 命令
# ═══════════════════════════════════════════════════════════

def cmd_ping(_):
    """ping  检查服务器连通性"""
    _need_requests()
    try:
        t0 = time.time()
        _req.get(f"{BASE_URL}/api/user/leaderboard?top=1", timeout=5)
        ms = (time.time() - t0) * 1000
        ok(f"服务器在线  {BASE_URL}  ({ms:.0f}ms)")
    except _req.exceptions.ConnectionError:
        err(f"无法连接到 {BASE_URL}")
    except Exception as e:
        err(str(e))

def cmd_register(args):
    """register <username> <password> <nickname>  注册新用户"""
    if len(args) < 3:
        die("用法: register <username> <password> <nickname>")
    r = post("/api/user/register", {"username": args[0], "password": args[1], "nickname": args[2]})
    if r.get("success"):
        ok(f"注册成功  userId={r['userId']}  nickname={r['nickname']}")
    else:
        err(f"注册失败: {r.get('msg', '未知错误')}")

def cmd_login(args):
    """login <username> <password>  登录并保存本地会话"""
    if len(args) < 2:
        die("用法: login <username> <password>")
    r = post("/api/user/login", {"username": args[0], "password": args[1]})
    if r.get("success"):
        save_session({"userId": r["userId"], "username": r["username"], "nickname": r["nickname"]})
        ok(f"登录成功  userId={r['userId']}  nickname={r['nickname']}")
        info(f"积分={r.get('totalScore',0)}  胜/总={r.get('winCount',0)}/{r.get('gameCount',0)}")
    else:
        err(f"登录失败: {r.get('msg', '未知错误')}")

def cmd_logout(_):
    """logout  退出登录，清除本地会话"""
    clear_session()
    ok("已退出登录")

def cmd_whoami(_):
    """whoami  显示当前登录用户"""
    sess = load_session()
    if not sess:
        info("当前未登录"); return
    r = get(f"/api/user/{sess['userId']}")
    if r.get("success"):
        print(f"  userId    : {bold(str(r['userId']))}")
        print(f"  nickname  : {r['nickname']}")
        print(f"  积分      : {r.get('totalScore', 0)}")
        print(f"  胜/总     : {r.get('winCount', 0)} / {r.get('gameCount', 0)}")
    else:
        err(r.get("msg", "获取失败"))

def cmd_user_info(args):
    """user-info <userId>  查询任意用户信息"""
    if not args: die("用法: user-info <userId>")
    r = get(f"/api/user/{args[0]}")
    pretty(r) if r.get("success") else err(r.get("msg", "查询失败"))

def cmd_leaderboard(args):
    """leaderboard [top=10]  积分排行榜"""
    r = get("/api/user/leaderboard", {"top": args[0] if args else 10})
    if r.get("success"):
        print(bold(f"  积分排行榜 (Top {args[0] if args else 10}):"))
        for i, u in enumerate(r.get("leaderboard", []), 1):
            print(f"    {i:2}. {u['nickname']:<14} 积分:{u['totalScore']:>6}   {u['winCount']}/{u['gameCount']} 胜")
    else:
        err(r.get("msg", "获取失败"))

def cmd_update_nickname(args):
    """update-nickname <userId> <nickname>  修改昵称"""
    if len(args) < 2: die("用法: update-nickname <userId> <nickname>")
    r = put(f"/api/user/{args[0]}/nickname", {"nickname": args[1]})
    ok(f"昵称已改为: {r['nickname']}") if r.get("success") else err(r.get("msg", "修改失败"))

def cmd_user_records(args):
    """user-records [userId] [limit=20]  查看用户历史对局"""
    sess = load_session()
    uid   = args[0] if args else (str(sess["userId"]) if sess else None)
    limit = args[1] if len(args) > 1 else "20"
    if not uid: die("请先登录或指定 userId")
    r = get(f"/api/user/{uid}/records", {"limit": limit})
    if r.get("success"):
        recs = r.get("records", [])
        if not recs: info("暂无对局记录"); return
        print(bold(f"  用户 {uid} 的对局记录 ({len(recs)} 条):"))
        for rec in recs:
            print(f"    局#{rec.get('roundNum','?')}  房间:{rec.get('roomId','?')}  "
                  f"得分:{str(rec.get('score','?')):>4}  {rec.get('winType','?')}  "
                  f"{rec.get('createdAt','')}")
    else:
        err(r.get("msg", "获取失败"))

# ═══════════════════════════════════════════════════════════
# ROOM 命令
# ═══════════════════════════════════════════════════════════

def cmd_room_create(args):
    """room-create <roomName> [baseScore=1] [maxRounds=8]  创建房间（需登录）"""
    sess = _need_login()
    if not args: die("用法: room-create <roomName> [baseScore] [maxRounds]")
    r = post("/api/room/create", {
        "roomName":  args[0],
        "creatorId": sess["userId"],
        "baseScore": int(args[1]) if len(args) > 1 else 1,
        "maxRounds": int(args[2]) if len(args) > 2 else 8,
    })
    if r.get("success"):
        ok(f"房间创建成功  roomId={r['roomId']}  roomName={r['roomName']}")
    else:
        err(r.get("msg", "创建失败"))

def cmd_room_list(_):
    """room-list  列出等待中的房间"""
    r = get("/api/room/list")
    if r.get("success"):
        rooms = r.get("rooms", [])
        if not rooms: info("当前没有等待中的房间"); return
        print(bold(f"  等待中的房间 ({len(rooms)} 个):"))
        for rm in rooms:
            print(f"    {rm['roomId']}  {rm['roomName']:<12}  {rm['playerCount']}/4  "
                  f"底分:{rm.get('baseScore',1)}  局数:{rm.get('maxRounds',8)}")
    else:
        err(r.get("msg", "获取失败"))

def cmd_room_info(args):
    """room-info <roomId>  查看房间详情"""
    if not args: die("用法: room-info <roomId>")
    r = get(f"/api/room/{args[0]}")
    if r.get("success"):
        print(bold(f"  房间 {r['roomId']} ({r['roomName']}) [{r['status']}]"))
        print(f"    局: {r['currentRound']}/{r['maxRounds']}  底分:{r['baseScore']}  "
              f"创建者:{r['creatorId']}")
        for s in r.get("seats", []):
            if s.get("occupied"):
                rdy = green("●") if s.get("ready") else yellow("○")
                onl = "" if s.get("online") else dim(" (离线)")
                print(f"    [{s['seatIndex']}] {rdy} {s['nickname']}{onl}")
            else:
                print(f"    [{s['seatIndex']}] {dim('空座')}")
        lobby = r.get("lobbyUsers", [])
        if lobby:
            nicks = ", ".join(u["nickname"] for u in lobby)
            print(f"    大厅观战({len(lobby)}): {nicks}")
    else:
        err(r.get("msg", "查询失败"))

def cmd_room_records(args):
    """room-records <roomId>  查看房间对局记录"""
    if not args: die("用法: room-records <roomId>")
    r = get(f"/api/room/{args[0]}/records")
    if r.get("success"):
        recs = r.get("records", [])
        if not recs: info("该房间暂无对局记录"); return
        print(bold(f"  房间 {args[0]} 对局记录 ({len(recs)} 条):"))
        for rec in recs:
            loser = f"→ userId:{rec.get('loserId','?')}" if rec.get("loserId") else "(自摸)"
            print(f"    局#{rec.get('roundNum','?')}  胜:{rec.get('winnerId','?')} "
                  f"{loser}  得分:{str(rec.get('score','?')):>4}  "
                  f"{rec.get('winType','?')}  {rec.get('scoreSnapshot','')}")
    else:
        err(r.get("msg", "获取失败"))

def cmd_room_disband(args):
    """room-disband <roomId>  解散房间（需房主登录）"""
    sess = _need_login()
    if not args: die("用法: room-disband <roomId>")
    r = delete(f"/api/room/{args[0]}", {"creatorId": sess["userId"]})
    ok(f"房间 {args[0]} 已解散") if r.get("success") else err(r.get("msg", "解散失败"))

# ═══════════════════════════════════════════════════════════
# FRIEND 命令
# ═══════════════════════════════════════════════════════════

def cmd_friend_add(args):
    """friend-add <friendId>  发送好友申请（需登录）"""
    sess = _need_login()
    if not args: die("用法: friend-add <friendId>")
    r = post("/api/user/friend/add", {"userId": sess["userId"], "friendId": int(args[0])})
    ok("好友申请已发送（对方确认后生效）") if r.get("success") else err(r.get("msg", "操作失败"))

def cmd_friend_list(args):
    """friend-list [userId]  查看好友列表"""
    sess = load_session()
    uid = args[0] if args else (str(sess["userId"]) if sess else None)
    if not uid: die("请先登录或指定 userId")
    r = get(f"/api/user/{uid}/friends")
    if r.get("success"):
        friends = r.get("friends", [])
        if not friends: info("暂无好友"); return
        print(bold(f"  好友列表 ({len(friends)} 人):"))
        for f in friends:
            print(f"    userId:{f['friendId']}  {f['nickname']}  积分:{f.get('totalScore',0)}")
    else:
        err(r.get("msg", "获取失败"))

def cmd_friend_requests(_):
    """friend-requests  查看待处理的好友申请（需登录）"""
    sess = _need_login()
    r = get(f"/api/user/{sess['userId']}/friend-requests")
    if r.get("success"):
        reqs = r.get("requests", [])
        if not reqs: info("没有待处理的好友申请"); return
        print(bold(f"  待处理好友申请 ({len(reqs)} 条):"))
        for req in reqs:
            print(f"    requestId:{req['requestId']}  来自: {req['nickname']} (userId:{req['fromUserId']})")
    else:
        err(r.get("msg", "获取失败"))

def cmd_friend_accept(args):
    """friend-accept <requestId>  接受好友申请（需登录）"""
    sess = _need_login()
    if not args: die("用法: friend-accept <requestId>")
    r = post(f"/api/user/friend/accept/{args[0]}", params={"userId": sess["userId"]})
    ok("已接受好友申请") if r.get("success") else err(r.get("msg", "操作失败"))

def cmd_friend_reject(args):
    """friend-reject <requestId>  拒绝好友申请（需登录）"""
    sess = _need_login()
    if not args: die("用法: friend-reject <requestId>")
    r = post(f"/api/user/friend/reject/{args[0]}", params={"userId": sess["userId"]})
    ok("已拒绝好友申请") if r.get("success") else err(r.get("msg", "操作失败"))

# ═══════════════════════════════════════════════════════════
# WebSocket 测试
# ═══════════════════════════════════════════════════════════

def _ws_send(ws, msg_type, data=None, room_id=None, user_id=None):
    msg = {"type": msg_type}
    if room_id is not None: msg["roomId"]  = room_id
    if user_id is not None: msg["userId"]  = user_id
    if data    is not None: msg["data"]    = data
    ws.send(json.dumps(msg, ensure_ascii=False))

def cmd_ws_echo(args):
    """ws-echo <userId> <roomId>  连接 WebSocket，加入房间并监听5秒"""
    if not HAS_WS:
        die("缺少 websocket-client，请运行: pip install websocket-client")
    if len(args) < 2: die("用法: ws-echo <userId> <roomId>")
    user_id, room_id = int(args[0]), args[1]
    msgs = []

    def on_msg(ws, msg):
        d = json.loads(msg)
        msgs.append(d)
        print(f"    {dim('←')} {yellow(d.get('type','?'))}  "
              f"{json.dumps(d.get('data', {}), ensure_ascii=False)[:120]}")

    def on_open(ws):
        ok(f"WebSocket 已连接  userId={user_id}")
        _ws_send(ws, "C_JOIN_ROOM", room_id=room_id, user_id=user_id)
        info(f"已发送 C_JOIN_ROOM，监听5秒...")

    def on_error(ws, e): err(f"WS 错误: {e}")
    def on_close(ws, *a): pass

    ws = websocket.WebSocketApp(f"{WS_URL}?userId={user_id}",
                                 on_open=on_open, on_message=on_msg,
                                 on_error=on_error, on_close=on_close)
    t = threading.Thread(target=ws.run_forever, daemon=True)
    t.start()
    time.sleep(5)
    ws.close()
    info(f"共收到 {len(msgs)} 条消息")

def cmd_ws_game_test(_):
    """ws-game-test  注册4个bot账号，创建房间，模拟入座+准备（WebSocket 全流程连接测试）"""
    if not HAS_WS:
        die("缺少 websocket-client，请运行: pip install websocket-client")
    _need_requests()
    print(bold("\n=== WebSocket 游戏连接测试 ===\n"))

    # 1. 注册4个账号
    sfx = ''.join(random.choices(string.ascii_lowercase + string.digits, k=5))
    users = []
    for i in range(4):
        r = post("/api/user/register", {
            "username": f"bot{i}_{sfx}",
            "password": "test1234",
            "nickname": f"机器人{i}_{sfx}",
        })
        if not r.get("success"):
            err(f"注册第{i}号账号失败: {r.get('msg')}"); return
        users.append({"userId": r["userId"], "nickname": r["nickname"]})
        ok(f"  账号 bot{i}_{sfx}  uid={r['userId']}")

    # 2. 创建房间
    r = post("/api/room/create", {
        "roomName": f"ws测试_{sfx}", "creatorId": users[0]["userId"],
        "baseScore": 1, "maxRounds": 4
    })
    if not r.get("success"):
        err(f"创建房间失败: {r.get('msg')}"); return
    room_id = r["roomId"]
    ok(f"  房间创建  roomId={room_id}\n")

    # 3. 4个 WebSocket 客户端
    all_msgs  = {i: [] for i in range(4)}
    clients   = [None] * 4
    lock      = threading.Lock()

    def make_ws(idx):
        uid = users[idx]["userId"]
        nick = users[idx]["nickname"]

        def on_open(ws):
            clients[idx] = ws
            ok(f"  [{nick}] 已连接")
            time.sleep(idx * 0.3)
            _ws_send(ws, "C_JOIN_ROOM", room_id=room_id, user_id=uid)
            time.sleep(0.5)
            _ws_send(ws, "C_CHOOSE_SEAT", data={"seatIndex": idx}, room_id=room_id, user_id=uid)
            time.sleep(0.5)
            _ws_send(ws, "C_READY", room_id=room_id, user_id=uid)

        def on_msg(ws, raw):
            d = json.loads(raw)
            with lock:
                all_msgs[idx].append(d.get("type","?"))
                print(f"    [{nick}] {dim('←')} {yellow(d.get('type','?'))}")

        def on_error(ws, e): pass
        def on_close(ws, *a): pass

        return websocket.WebSocketApp(
            f"{WS_URL}?userId={uid}",
            on_open=on_open, on_message=on_msg,
            on_error=on_error, on_close=on_close,
        )

    threads = []
    for i in range(4):
        ws = make_ws(i)
        t = threading.Thread(target=ws.run_forever, daemon=True)
        t.start()
        threads.append((ws, t))

    info("等待所有客户端完成入座+准备 (6s)...")
    time.sleep(6)

    # 4. 发起开始游戏
    if clients[0]:
        info("发送 C_START_GAME...")
        _ws_send(clients[0], "C_START_GAME", room_id=room_id, user_id=users[0]["userId"])
        time.sleep(4)

    for ws, _ in threads:
        try: ws.close()
        except: pass

    print()
    print(bold("=== 各客户端收到的消息类型 ==="))
    for i, u in enumerate(users):
        types = all_msgs[i]
        print(f"  {u['nickname']}: {len(types)} 条 — {types}")
    ok("WebSocket 测试完成")

# ═══════════════════════════════════════════════════════════
# 自动化测试套件
# ═══════════════════════════════════════════════════════════

def cmd_autotest(_):
    """autotest  对所有 REST 接口进行自动化测试"""
    _need_requests()
    print(bold("\n════ 后端 REST API 自动化测试 ════\n"))
    passed, failed = [], []
    sfx   = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    state = {}  # 共享测试状态

    def T(name, fn):
        """执行一个测试用例"""
        try:
            fn()
            passed.append(name)
            print(f"  {green('PASS')}  {name}")
        except AssertionError as e:
            failed.append(name)
            print(f"  {red('FAIL')}  {name}  — {e}")
        except SystemExit as e:
            failed.append(name)
            print(f"  {red('FAIL')}  {name}  — 程序退出({e})")
        except Exception as e:
            failed.append(name)
            print(f"  {red('FAIL')}  {name}  — {type(e).__name__}: {e}")

    # ── 用户模块 ──────────────────────────────────
    print(bold("[ 用户管理 ]"))

    def reg():
        r = post("/api/user/register", {"username": f"u_{sfx}", "password": "TestPass@1", "nickname": f"测试_{sfx}"})
        assert r.get("success"), r.get("msg")
        state["uid"]  = r["userId"]
        state["user"] = f"u_{sfx}"

    def reg_dup():
        r = post("/api/user/register", {"username": f"u_{sfx}", "password": "x", "nickname": "dup"})
        assert not r.get("success"), "重复注册应失败"

    def login_ok():
        r = post("/api/user/login", {"username": f"u_{sfx}", "password": "TestPass@1"})
        assert r.get("success"), r.get("msg")
        assert r["userId"] == state["uid"]

    def login_bad():
        r = post("/api/user/login", {"username": f"u_{sfx}", "password": "wrongpass"})
        assert not r.get("success"), "错误密码应失败"

    def user_info():
        r = get(f"/api/user/{state['uid']}")
        assert r.get("success") and r["userId"] == state["uid"]

    def leaderboard():
        r = get("/api/user/leaderboard", {"top": 5})
        assert r.get("success") and isinstance(r.get("leaderboard"), list)

    def update_nick():
        r = put(f"/api/user/{state['uid']}/nickname", {"nickname": f"新昵_{sfx}"})
        assert r.get("success"), r.get("msg")

    T("注册新用户",       reg)
    T("重复注册拒绝",     reg_dup)
    T("正常登录",         login_ok)
    T("错误密码拒绝",     login_bad)
    T("查询用户信息",     user_info)
    T("积分排行榜",       leaderboard)
    T("修改昵称",         update_nick)

    # ── 房间模块 ──────────────────────────────────
    print(bold("\n[ 房间管理 ]"))

    def room_create():
        r = post("/api/room/create", {"roomName": f"房_{sfx}", "creatorId": state["uid"],
                                        "baseScore": 1, "maxRounds": 4})
        assert r.get("success"), r.get("msg")
        state["rid"] = r["roomId"]

    def room_list():
        r = get("/api/room/list")
        assert r.get("success")
        ids = [rm["roomId"] for rm in r.get("rooms", [])]
        assert state["rid"] in ids, "创建的房间不在列表"

    def room_info():
        r = get(f"/api/room/{state['rid']}")
        assert r.get("success") and r["roomId"] == state["rid"]

    def room_records():
        r = get(f"/api/room/{state['rid']}/records")
        assert r.get("success"), r.get("msg")

    def user_records():
        r = get(f"/api/user/{state['uid']}/records")
        assert r.get("success"), r.get("msg")

    def room_disband():
        r = delete(f"/api/room/{state['rid']}", {"creatorId": state["uid"]})
        assert r.get("success"), r.get("msg")

    def room_disband_gone():
        r = get("/api/room/list")
        assert r.get("success")
        ids = [rm["roomId"] for rm in r.get("rooms", [])]
        assert state["rid"] not in ids, "已解散的房间不应在列表"

    T("创建房间",         room_create)
    T("房间在列表中",     room_list)
    T("查询房间详情",     room_info)
    T("查询房间记录",     room_records)
    T("查询用户记录",     user_records)
    T("解散房间",         room_disband)
    T("解散后不在列表",   room_disband_gone)

    # ── 好友模块 ──────────────────────────────────
    print(bold("\n[ 好友系统 ]"))

    def reg2():
        r = post("/api/user/register", {"username": f"v_{sfx}", "password": "TestPass@1", "nickname": f"朋友_{sfx}"})
        assert r.get("success"), r.get("msg")
        state["uid2"] = r["userId"]

    def friend_add():
        r = post("/api/user/friend/add", {"userId": state["uid"], "friendId": state["uid2"]})
        assert r.get("success"), r.get("msg")

    def friend_pending():
        r = get(f"/api/user/{state['uid2']}/friend-requests")
        assert r.get("success"), r.get("msg")
        reqs = r.get("requests", [])
        assert len(reqs) > 0, "uid2 应收到好友申请"
        state["req_id"] = reqs[0]["requestId"]

    def friend_accept():
        r = post(f"/api/user/friend/accept/{state['req_id']}",
                 params={"userId": state["uid2"]})
        assert r.get("success"), r.get("msg")

    def friend_list_check():
        r = get(f"/api/user/{state['uid']}/friends")
        assert r.get("success")
        ids = [f["friendId"] for f in r.get("friends", [])]
        assert state["uid2"] in ids, "好友列表中应有 uid2"

    def friend_list_reverse():
        r = get(f"/api/user/{state['uid2']}/friends")
        assert r.get("success")
        ids = [f["friendId"] for f in r.get("friends", [])]
        assert state["uid"] in ids, "uid2 的好友列表中应有 uid"

    def friend_reject_test():
        # uid 再向另一用户发申请，uid3 拒绝
        r3 = post("/api/user/register", {"username": f"w_{sfx}", "password": "pass", "nickname": f"w_{sfx}"})
        if not r3.get("success"): return
        uid3 = r3["userId"]
        post("/api/user/friend/add", {"userId": state["uid"], "friendId": uid3})
        reqs = get(f"/api/user/{uid3}/friend-requests").get("requests", [])
        if not reqs: return
        rid = reqs[0]["requestId"]
        r = post(f"/api/user/friend/reject/{rid}", params={"userId": uid3})
        assert r.get("success"), r.get("msg")
        reqs_after = get(f"/api/user/{uid3}/friend-requests").get("requests", [])
        assert all(x["requestId"] != rid for x in reqs_after), "拒绝后申请应消失"

    T("注册第二用户",     reg2)
    T("发送好友申请",     friend_add)
    T("查询待处理申请",   friend_pending)
    T("接受好友申请",     friend_accept)
    T("好友列表(发送方)", friend_list_check)
    T("好友列表(接收方)", friend_list_reverse)
    T("拒绝好友申请",     friend_reject_test)

    # ── 结果 ──────────────────────────────────────
    total = len(passed) + len(failed)
    print()
    if not failed:
        print(green(bold(f"✓  全部通过  {len(passed)}/{total}")))
    else:
        print(yellow(bold(f"!  {len(passed)}/{total} 通过")))
        print(red("   失败项: " + "、".join(failed)))

# ═══════════════════════════════════════════════════════════
# 命令注册表 & 帮助
# ═══════════════════════════════════════════════════════════

COMMANDS = {
    # 基础
    "ping":             cmd_ping,
    "help":             lambda _: print_help(),
    # 用户
    "register":         cmd_register,
    "login":            cmd_login,
    "logout":           cmd_logout,
    "whoami":           cmd_whoami,
    "user-info":        cmd_user_info,
    "leaderboard":      cmd_leaderboard,
    "update-nickname":  cmd_update_nickname,
    "user-records":     cmd_user_records,
    # 房间
    "room-create":      cmd_room_create,
    "room-list":        cmd_room_list,
    "room-info":        cmd_room_info,
    "room-records":     cmd_room_records,
    "room-disband":     cmd_room_disband,
    # 好友
    "friend-add":       cmd_friend_add,
    "friend-list":      cmd_friend_list,
    "friend-requests":  cmd_friend_requests,
    "friend-accept":    cmd_friend_accept,
    "friend-reject":    cmd_friend_reject,
    # 测试
    "autotest":         cmd_autotest,
    "ws-echo":          cmd_ws_echo,
    "ws-game-test":     cmd_ws_game_test,
}

def print_help():
    sess = load_session()
    login_str = green(f"(已登录: {sess['nickname']})") if sess else dim("(未登录)")
    ws_str = green("已安装") if HAS_WS else yellow("未安装  pip install websocket-client")
    req_str = green("已安装") if HAS_REQUESTS else red("未安装  pip install requests")
    print(f"""
{bold('麻将后端 CLI 测试工具')}
  服务器地址 : {cyan(BASE_URL)}  {login_str}
  requests   : {req_str}
  websocket  : {ws_str}

{bold('用法:')}
  python mahjong_cli.py <命令> [参数...]
  python mahjong_cli.py          # 进入交互模式
  MAHJONG_HOST=1.2.3.4:8080 python mahjong_cli.py ping

{bold('用户管理:')}
  ping                                  检查服务器连通性
  register  <user> <pass> <nick>        注册新账号
  login     <user> <pass>               登录 (保存会话)
  logout                                退出登录
  whoami                                查看当前登录用户
  user-info    <userId>                 查询用户信息
  leaderboard  [top=10]                 积分排行榜
  update-nickname  <userId> <nick>      修改昵称
  user-records  [userId] [limit=20]     历史对局记录

{bold('房间管理:')}
  room-create   <name> [base=1] [rounds=8]   创建房间
  room-list                                  等待中的房间
  room-info     <roomId>                     房间详情
  room-records  <roomId>                     房间对局记录
  room-disband  <roomId>                     解散房间(需房主)

{bold('好友系统:')}
  friend-add       <friendId>      发送好友申请
  friend-list      [userId]        查看好友列表
  friend-requests                  查看待处理申请
  friend-accept    <requestId>     接受申请
  friend-reject    <requestId>     拒绝申请

{bold('测试工具:')}
  autotest                         REST API 全套自动化测试
  ws-echo    <userId> <roomId>     WS 连接监听测试
  ws-game-test                     模拟4人入座+开局 (WS)

{bold('示例:')}
  python mahjong_cli.py ping
  python mahjong_cli.py register alice Pass@123 爱丽丝
  python mahjong_cli.py login alice Pass@123
  python mahjong_cli.py room-create 欢乐局 1 8
  python mahjong_cli.py autotest
""")

# ═══════════════════════════════════════════════════════════
# 交互模式
# ═══════════════════════════════════════════════════════════

def interactive():
    print_help()
    print(bold("交互模式：输入命令后回车，输入 'quit' 退出\n"))
    while True:
        try:
            sess = load_session()
            prompt = f"{green(sess['nickname'])}> " if sess else "mahjong> "
            line = input(prompt).strip()
        except (EOFError, KeyboardInterrupt):
            print(); break
        if not line: continue
        if line in ("quit", "exit", "q"): break
        if line in ("help", "h", "?"): print_help(); continue
        parts = line.split()
        cmd, a = parts[0], parts[1:]
        if cmd not in COMMANDS:
            err(f"未知命令: {cmd}  (输入 'help' 查看所有命令)")
            continue
        COMMANDS[cmd](a)
        print()

# ═══════════════════════════════════════════════════════════
# 入口
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    if len(sys.argv) == 1:
        interactive()
    else:
        cmd = sys.argv[1]
        if cmd in ("-h", "--help"):
            print_help()
        elif cmd in COMMANDS:
            COMMANDS[cmd](sys.argv[2:])
        else:
            err(f"未知命令: {cmd}")
            print_help()
            sys.exit(1)
