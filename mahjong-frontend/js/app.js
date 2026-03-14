// js/app.js
// 全局应用状态与 UI 工具

class AppController {
    constructor() {
        this.state = {
            user: JSON.parse(localStorage.getItem('mahjong_user')), // 恢复登录态
            currentView: 'auth'
        };

        // 绑定常用 DOM
        this.toastContainer = document.getElementById('toast-container');
        this.viewAuth = document.getElementById('view-auth');
        this.viewLobby = document.getElementById('view-lobby');
    }

    init() {
        // 尝试从 LocalStorage 恢复登录态
        const savedUser = localStorage.getItem('mahjong_user');
        if (savedUser) {
            try {
                this.state.user = JSON.parse(savedUser);
                this.switchView('lobby');
                // 触发大厅数据加载
                if (window.lobby) window.lobby.init();
            } catch (e) {
                localStorage.removeItem('mahjong_user');
            }
        }
    }

    // --- UI 工具 ---

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '❌';

        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        this.toastContainer.appendChild(toast);

        // 3秒后移除
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    showSuccess(msg) { this.showToast(msg, 'success'); }
    showError(msg) { this.showToast(msg, 'error'); }

    // --- 视图路由 ---

    switchView(viewName) {
        this.state.currentView = viewName;

        // 隐藏所有视图容器并移除 active 类
        document.querySelectorAll('.view-container').forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('active');
        });

        // 显示目标视图
        const target = document.getElementById(`view-${viewName}`);
        if (target) {
            target.classList.remove('hidden');
            // 强制重绘并添加 active 类触发动画
            void target.offsetWidth;
            target.classList.add('active');
            
            // 切换视图后自动回到顶部，防止“下滑看到旧内容”
            window.scrollTo(0, 0);
        }
    }

    switchAuthTab(type) {
        const isLogin = type === 'login';

        document.getElementById('tab-login').classList.toggle('active', isLogin);
        document.getElementById('tab-register').classList.toggle('active', !isLogin);

        document.getElementById('form-login').classList.toggle('hidden', !isLogin);
        document.getElementById('form-register').classList.toggle('hidden', isLogin);
    }

    // --- 弹窗控制 ---
    showLeaderboardModal() {
        if (window.leaderboard) window.leaderboard.loadFullData();
        document.getElementById('modal-leaderboard').classList.remove('hidden');
    }

    closeLeaderboardModal() {
        document.getElementById('modal-leaderboard').classList.add('hidden');
    }

    // --- 反馈弹窗 ---
    showFeedbackModal() {
        document.getElementById('modal-feedback').classList.remove('hidden');
    }

    closeFeedbackModal() {
        document.getElementById('modal-feedback').classList.add('hidden');
    }

    async handleFeedbackSubmit(event) {
        event.preventDefault();
        const type = document.getElementById('feedback-type').value;
        const content = document.getElementById('feedback-content').value.trim();

        if (!content) return;

        // 模拟发送过程
        this.showToast('正在提交反馈...', 'info');
        
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('Feedback Submitted:', {
            to: 'b22040310@njupt.edu.cn',
            type: type,
            content: content,
            user: this.state.user?.username || 'Guest'
        });

        this.showSuccess('提交成功！感谢您的建议。');
        this.closeFeedbackModal();
        document.getElementById('feedback-content').value = '';
    }
}

// 暴露出全局实例
const app = new AppController();
window.app = app;
app.init();
