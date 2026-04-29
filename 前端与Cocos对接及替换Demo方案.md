# 蜀魂麻将：前端与 Cocos 对局模块整合及 Demo 替换方案

本文档面向 **前端开发**、**Cocos 开发** 与 **后端开发**，详细阐述如何将当前的 HTML 文本指令对局 Demo（`gameConsole`）替换为真实的 Cocos Creator 3D/2D 渲染引擎，实现“大前端包小前端”的最终架构。

---

## 1. 架构定位与核心原则

*   **唯一长连接原则 (Single Connection)**：**所有的 WebSocket 连接、心跳保活、Token 鉴权必须且只能由外层 Web 前端（`mahjong-frontend`）维护**。Cocos 内部不再直连后端，彻底沦为“纯视觉渲染层”。
*   **状态下发原则 (Top-Down State)**：当 Web 前端接收到后端的对局指令（如 `S_GAME_START`, `S_DRAW`, `S_DISCARD`）时，直接通过 `window.postMessage` 透传给 Cocos 内部。
*   **操作上报原则 (Bottom-Up Action)**：当玩家在 Cocos 内点击出牌、碰杠胡时，Cocos 不直接发网络请求，而是通过 `window.parent.postMessage` 抛给 Web 前端，由 Web 前端代为发送给后端。
*   **后端无感知 (Backend Ignorance)**：**后端无需做任何修改**。对于后端而言，不管是用户在用文本控制台输入，还是在点击酷炫的 3D 麻将，后端的接口、协议、推送逻辑完全不变。

---

## 2. 前端 (Web) 改造任务

前端目前在 `index.html` 中有一个预留的 `<div id="cocos-game-stage">` 以及一套 `gameConsole` (终端操作台)。

### 2.1 引入 Cocos 构建产物
在前端工程根目录下新建 `public/game` 目录，将 Cocos 构建出来的 Web Mobile 产物（包含 `index.html`, `assets`, `cocos-js` 等）整体放入该目录。

### 2.2 替换占位符并加载 Iframe
在前端进入房间（或点击“开始游戏”）时，清空占位符，动态挂载 iframe：

```javascript
// 在 app.js 或 room.js 中
function loadCocosEngine() {
    const stage = document.getElementById('cocos-game-stage');
    stage.innerHTML = ''; // 移除提示文字

    const iframe = document.createElement('iframe');
    iframe.id = 'cocos-iframe';
    iframe.src = './game/index.html'; // 指向静态托管的 Cocos 入口
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    
    // 如果希望 Cocos 背景透明，融合进前端发光背景
    iframe.allowTransparency = "true"; 
    
    stage.appendChild(iframe);
}
```

### 2.3 隐藏旧版 Console
目前的内嵌控制台 `#modal-game-console` 不再作为主要对局工具。可以保留一个隐藏入口作为调试使用，但在用户正式进入对局时，隐藏该控制台，将焦点交给 `#cocos-game-stage`。

### 2.4 建立 `postMessage` 桥梁
在前端全局初始化通信网关：

```javascript
// 监听来自 Cocos 的操作指令
window.addEventListener('message', (event) => {
    // 跨域安全校验
    if (event.origin !== window.location.origin) return;

    const data = event.data;
    
    if (data.type === 'COCOS_READY') {
        console.log('[Web] Cocos 引擎已就绪，下发初始房间数据...');
        // Cocos 加载完成，把当前的房间状态/玩家信息塞给它
        sendToCocos('S_ROOM_STATE', window.currentRoomState);
    } 
    else if (data.type === 'COCOS_OUTBOUND') {
        // Cocos 产生了一个玩家操作，Web 负责发送给后端 WebSocket
        // 例如：{ action: 'C_DISCARD', payload: { tileId: 12 } }
        if (window.wsManager && window.wsManager.isConnected) {
            window.wsManager.send(data.action, data.payload);
        }
    }
});

// 提供一个向 Cocos 推送服务端消息的封装
window.sendToCocos = function(action, payload) {
    const iframe = document.getElementById('cocos-iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'SERVER_INBOUND',
            action: action,
            payload: payload
        }, window.location.origin);
    }
}
```

### 2.5 拦截 WebSocket 消息并透传
在原有的 WebSocket 消息处理中心（接收到服务器消息的地方），加一行透传代码：
```javascript
ws.onMessage = (msg) => {
    // 原有的状态更新逻辑
    updateLocalState(msg);
    
    // 无脑透传给 Cocos (让 Cocos 自己决定是否播放相关动画)
    window.sendToCocos(msg.type, msg.data);
};
```

---

## 3. Cocos 端改造任务

Cocos 端需要**彻底剥离自身的 WebSocket 客户端代码**，转而成为一个被动接收消息的渲染容器。

### 3.1 新增跨端通信桥 (`MessageBridge.ts`)
在 Cocos 工程中新建一个全局单例脚本，替代原来的 `WebSocketManager`。

```typescript
import { director, EventTarget } from 'cc';

export class MessageBridge extends EventTarget {
    private static _instance: MessageBridge;
    public static get instance() {
        if (!this._instance) this._instance = new MessageBridge();
        return this._instance;
    }

    public init() {
        if (window.parent !== window) {
            window.addEventListener('message', this.onMessageReceived.bind(this));
            // 通知前端：Cocos 准备好了，可以灌数据了
            window.parent.postMessage({ type: 'COCOS_READY' }, '*');
        }
    }

    // 接收 Web 传进来的服务端数据，并触发 Cocos 内部事件
    private onMessageReceived(event: MessageEvent) {
        const data = event.data;
        if (data && data.type === 'SERVER_INBOUND') {
            console.log('[Cocos] 收到前端透传的服务端指令:', data.action);
            this.emit(data.action, data.payload);
        }
    }

    // 供 Cocos 内部的 UI/Table 调用，向上汇报操作
    public send(action: string, payload: any) {
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'COCOS_OUTBOUND',
                action: action,
                payload: payload
            }, '*');
        } else {
            console.warn('[Cocos] 当前非 iframe 环境，无法发送指令:', action);
        }
    }
}
```

### 3.2 替换现有代码的 `WebSocketManager` 引用
全局搜索 Cocos 项目中的 `WebSocketManager.instance`：
1. **监听事件侧**（如 `GameController.ts`, `MahjongTable.ts`）：
   将 `WebSocketManager.instance.on(...)` 全部替换为 `MessageBridge.instance.on(...)`。
2. **发送操作侧**（如 `ActionController.ts` 点击碰/杠、`MahjongTable.ts` 拖拽出牌）：
   将 `WebSocketManager.instance.send(action, data)` 替换为 `MessageBridge.instance.send(action, data)`。

### 3.3 背景透明化处理 (可选但推荐)
为了让 Cocos 麻将桌和前端的 HTML 炫光背景融为一体：
1. 在 Cocos Creator 面板中，选中 `Camera`，将 `Clear Color` 的 Alpha(A) 通道设为 `0`。
2. 构建发布 Web Mobile 时，在构建选项中勾选 **透明画布 (Transparent Canvas)**。

---

## 4. 后端 (Server) 确认事项

**结论：后端完全无须改动。**

*   后端仍通过 WebSocket (`wss://[domain]/ws`) 保持单一长连接。
*   通信协议的数据结构、收发频率均保持不变。
*   安全与鉴权机制（JWT Token 等）全部在 Web 前端完成，Cocos 甚至不需要知道 Token 的存在。

---

## 5. 联调检查清单 (Checklist)

开发对接时，前后端及 Cocos 工程师需按以下步骤确认：

1. [ ] **构建部署流**：Cocos 是否成功打包，前端 `public/game/index.html` 是否能通过浏览器直接访问。
2. [ ] **Iframe 挂载**：前端点击“进入房间”后，`cocos-game-stage` 内是否成功渲染出麻将桌。
3. [ ] **握手通信**：查看控制台，Web 端是否打印了 `[Web] Cocos 引擎已就绪`。
4. [ ] **入场初始化**：Cocos 是否成功接收到了前端透传的 `S_ROOM_STATE` 并正确渲染了 4 个玩家的头像、昵称、庄家标识。
5. [ ] **出牌逆向通信**：在 Cocos 中点击自己的手牌，查看外层 Web 控制台是否捕捉到了 `COCOS_OUTBOUND` 的 `C_DISCARD` 消息。
6. [ ] **广播闭环**：Web 将出牌上报后端 -> 后端广播 `S_DISCARD` 给所有人 -> Web 拦截广播 -> Web `postMessage` 传给 Cocos -> Cocos 播放其他人的弃牌动画。

--- 

按照此方案实施，团队分工将极为明确：前端专注于大厅与业务流，Cocos 专注于对局内演出，后端专注于核心规则裁决。融合过程仅需数小时的通信接口对接即可完成。