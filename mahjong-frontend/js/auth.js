// js/auth.js
// 处理登录、注册、注销逻辑

class AuthController {

    async handleLogin(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-login');
        const userInp = document.getElementById('login-username').value.trim();
        const passInp = document.getElementById('login-password').value;

        if (!userInp || !passInp) return app.showError('请输入完整信息');

        try {
            btn.disabled = true;
            btn.querySelector('span').innerText = '登录中...';

            const res = await api.login(userInp, passInp);

            // 保存登录态 (完整保存 role 和 status)
            app.state.user = {
                userId: res.userId,
                username: userInp,
                nickname: res.nickname || userInp,
                role: res.role,
                status: res.status
            };
            localStorage.setItem('mahjong_user', JSON.stringify(app.state.user));

            app.showSuccess('登录成功');
            document.getElementById('form-login').reset();

            // 切换到大厅
            app.switchView('lobby');
            if (window.lobby) window.lobby.init();

        } catch (error) {
            app.showError(error.message);
        } finally {
            btn.disabled = false;
            btn.querySelector('span').innerText = '进入对局';
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-register');
        const userInp = document.getElementById('reg-username').value.trim();
        const nickInp = document.getElementById('reg-nickname').value.trim();
        const passInp = document.getElementById('reg-password').value;

        if (userInp.length < 3) return app.showError('账号至少3位');
        if (passInp.length < 6) return app.showError('密码至少6位');
        if (!nickInp) return app.showError('请输入昵称');

        try {
            btn.disabled = true;
            btn.querySelector('span').innerText = '注册中...';

            const res = await api.register(userInp, passInp, nickInp);

            app.showSuccess('注册成功，已自动登录！');

            app.state.user = {
                userId: res.userId,
                username: userInp,
                nickname: res.nickname,
                role: res.role || 0,
                status: res.status || 1
            };
            localStorage.setItem('mahjong_user', JSON.stringify(app.state.user));

            document.getElementById('form-register').reset();

            app.switchView('lobby');
            if (window.lobby) window.lobby.init();

        } catch (error) {
            app.showError(error.message);
        } finally {
            btn.disabled = false;
            btn.querySelector('span').innerText = '创建角色';
        }
    }

    logout() {
        app.state.user = null;
        localStorage.removeItem('mahjong_user');

        // 断开大厅可能存在的 WebSocket
        if (window.lobby && window.lobby.ws) {
            window.lobby.ws.close();
            window.lobby.ws = null;
        }

        app.showToast('已安全登出');
        app.switchView('auth');
    }
}

// 供 HTML onsubmit 调用
const auth = new AuthController();
// 将类实例挂载到 window，方便从 index.html 直接访问
window.auth = auth;
