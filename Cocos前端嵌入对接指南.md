# Cocos 项目嵌入前端对接指南

本文档旨在说明如何将 `mahjong-Cocos` 项目完美嵌入到 `mahjong-frontend` (原生 HTML/JS 编写的 Web 前端) 的对局视图中，并实现两者之间的数据互通。

## 1. 架构概览

- **外层 Web 前端 (`mahjong-frontend`)**: 负责登录注册、大厅、排行榜、房间匹配、好友系统、以及 WebSocket 长连接的管理。
- **内层 Cocos 游戏 (`mahjong-Cocos`)**: 专注渲染麻将桌、手牌、出牌动画、特效、以及游戏内的核心表现层逻辑。
- **结合方式**: 采用 **`<iframe>` 嵌入**。Cocos 项目打包为 Web Mobile 或 Web Desktop 后，作为一个静态资源目录放在前端工程中，前端通过 `<iframe>` 加载该 Cocos 页面。
- **通信方式**: 采用原生的 `window.postMessage` API 实现跨层双向通信。因为两者将部署在同源（同域名）下，也可以直接通过 `iframe.contentWindow` 访问内部全局变量。

---

## 2. Cocos 项目的打包与部署

### 2.1 构建设置
在 Cocos Creator 中，点击菜单栏的 **项目 (Project) -> 构建发布 (Build...)**：
1. **发布平台 (Platform)**: 选择 **Web Mobile**（推荐，适配更好） 或 Web Desktop。
2. **发布路径 (Build Path)**: 建议直接指向 `mahjong-frontend` 下的一个子目录，例如 `mahjong-frontend/cocos-build`。
3. **主包压缩类型 (Main Bundle Compression Type)**: Zip。
4. **屏幕方向 (Device Orientation)**: 选择 **Landscape (横屏)**。
5. 点击 **构建 (Build)**。

### 2.2 前端目录结构预期
构建完成后，你的 `mahjong-frontend` 目录应当大致如下：
```text
mahjong-frontend/
├── index.html        (大厅/登录页面)
├── js/               (前端逻辑)
├── css/              (前端样式)
└── cocos-build/      (Cocos 构建导出的文件夹)
    ├── index.html    (Cocos 的入口页)
    ├── assets/
    ├── src/
    ├── style.css
    └── cocos-js/
```

---

## 3. 前端修改 (mahjong-frontend)

你已经在 `index.html` 里预留了 `cocos-game-stage`，只需在前端 JS 代码中动态注入 iframe。

### 3.1 注入 iframe

在 `js/app.js` 或负责进入游戏界面的逻辑中（如 `room.startGame` 成功后）：

```javascript
function initCocosGame() {
    const stage = document.getElementById('cocos-game-stage');
    stage.innerHTML = ''; // 清空占位符

    const iframe = document.createElement('iframe');
    // 指向你构建出来的 Cocos 入口文件
    iframe.src = './cocos-build/index.html'; 
    iframe.id = 'cocos-iframe';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    
    stage.appendChild(iframe);
}
```

### 3.2 接收 Cocos 的消息
前端 WebSocket 统一管理网络，当 Cocos 的动画播放完毕需要发指令（如出牌）时，Cocos 会发消息给前端，前端再代发给服务端：

```javascript
window.addEventListener('message', function(event) {
    // 确保同源安全
    if (event.origin !== window.location.origin) return;

    const data = event.data;
    if (data.type === 'COCOS_READY') {
        console.log('Cocos 引擎加载完毕，准备接收数据！');
        // 可以把当前的对局初始数据传给 Cocos
        sendToCocos('GAME_START_DATA', window.currentRoomData);
    } 
    else if (data.type === 'COCOS_SEND_WS') {
        // Cocos 想要发送 WebSocket 消息
        // 例如：{ type: 'COCOS_SEND_WS', payload: { action: 'C_DISCARD', tileId: 12 } }
        if (window.wsManager) {
            window.wsManager.send(data.payload.action, data.payload.data);
        }
    }
});

// 向 Cocos 发送消息的通用函数
function sendToCocos(action, payload) {
    const iframe = document.getElementById('cocos-iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            action: action,
            payload: payload
        }, window.location.origin);
    }
}
```

---

## 4. Cocos 端修改 (mahjong-Cocos)

目前的 Cocos 代码中，网络直接连接了 WebSocket (`WebSocketManager.ts`)。为了复用前端的网络连接，我们需要将其改造为监听 `window.addEventListener('message')`。

### 4.1 监听前端下发的消息

在 Cocos 的入口脚本（例如 `GameController.ts` 的 `onLoad` 中），增加对 iframe 外层消息的监听：

```typescript
// GameController.ts
protected onLoad(): void {
    // 如果在浏览器且属于 iframe 嵌入环境
    if (window.parent !== window) {
        window.addEventListener('message', this.onPostMessageReceived.bind(this));
        
        // 告诉外层前端，Cocos 加载好了！
        window.parent.postMessage({ type: 'COCOS_READY' }, '*');
    } else {
        // 本地测试开发时，依然使用 WebSocket
        // WebSocketManager.instance.on(MessageType.S_GAME_START, this._onGameStart, this);
    }
}

private onPostMessageReceived(event: MessageEvent) {
    const data = event.data;
    if (!data || !data.action) return;

    // 根据前端传进来的动作分发逻辑
    switch (data.action) {
        case 'S_ROOM_STATE':
            this._onRoomState(data.payload);
            break;
        case 'S_GAME_START':
            this._onGameStart(data.payload);
            break;
        case 'S_DRAW':
            this._onDraw(data.payload);
            break;
        // ... 其他操作
    }
}
```

### 4.2 向前端发送消息 (替代直接发送 WebSocket)

当你点击本地玩家的一张手牌出牌时，原先是直接调 WS：
`WebSocketManager.instance.send(MessageType.C_DISCARD, { tileId });`

现在应该改造为一个统一包装层，判断是否在内嵌环境中：

```typescript
// 封装一个与前端通信的方法
public static sendToFrontend(action: string, data: any) {
    if (window.parent !== window) {
        // 内嵌环境：委托外层 Web 发送
        window.parent.postMessage({
            type: 'COCOS_SEND_WS',
            payload: {
                action: action,
                data: data
            }
        }, '*');
    } else {
        // 独立开发测试环境：自己连 WS 发送
        WebSocketManager.instance.send(action, data);
    }
}
```

将 `MahjongTable.ts` 里的出牌：
```typescript
// 替换前
// WebSocketManager.instance.send(MessageType.C_DISCARD, { tileId });

// 替换后
sendToFrontend(MessageType.C_DISCARD, { tileId });
```

---

## 5. 对齐进度与开发建议

1. **统一网络中心 (Single Source of Truth)**：由于外层 HTML 已经包含完整的好友系统和状态管理，因此**强烈建议将 WebSocket 实例保持在外层 HTML**。内层 Cocos 彻底变成一个**纯粹的渲染和动画播放器**。
2. **样式穿透问题**：`iframe` 的背景可以设为透明（需要在 Cocos 构建面板中勾选“透明背景”，并在外层 iframe 加上 `allowtransparency="true"`）。这样 Cocos 里的麻将桌可以叠加在前端的炫酷 UI 背景之上。
3. **断线重连体验**：因为外层 HTML 维持着连接，即便页面稍微卡顿，只要 iframe 重新派发状态，Cocos 只要接收到一份完整的 `S_ROOM_STATE`，就能将整盘牌面瞬间复原。

按照上述模式，你的大前端工程就可以无缝地像播放视频一样控制 Cocos 游戏进程了。
