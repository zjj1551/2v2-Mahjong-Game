// js/leaderboard.js
// 排行榜展示逻辑

class LeaderboardController {

    constructor() {
        this.listMini = document.getElementById('list-leaderboard-mini');
        this.tableBody = document.getElementById('table-leaderboard-body');
    }

    // 在大厅右侧加载Top 5简易榜单
    async loadMiniData() {
        try {
            this.listMini.innerHTML = '<li class="loading-text">加载风云榜...</li>';

            const res = await api.getLeaderboard();
            const list = res.leaderboard || [];

            this.listMini.innerHTML = '';

            if (list.length === 0) {
                this.listMini.innerHTML = '<li class="loading-text">此时无声胜有声，暂无战绩</li>';
                return;
            }

            // 取前5名
            const top5 = list.slice(0, 5);

            top5.forEach((user, idx) => {
                const rankSrc = idx < 3 ? `top-${idx + 1}` : '';
                const li = document.createElement('li');
                li.className = `rank-item ${rankSrc} fade-in-left`;
                li.style.animationDelay = `${idx * 0.1}s`;

                li.innerHTML = `
                    <span class="rank-num">${idx + 1}</span>
                    <span class="rank-name">${user.nickname}</span>
                    <span class="rank-score">${user.totalScore} 分</span>
                `;
                this.listMini.appendChild(li);
            });

        } catch (error) {
            console.error(error);
            this.listMini.innerHTML = '<li class="loading-text" style="color:var(--color-danger)">榜单读取失败</li>';
        }
    }

    // 在弹窗中加载完整榜单
    async loadFullData() {
        try {
            this.tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">天地玄黄，正在搜寻战神榜...</td></tr>';

            const res = await api.getLeaderboard();
            const list = res.leaderboard || [];

            this.tableBody.innerHTML = '';

            if (list.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">暂无战绩</td></tr>';
                return;
            }

            list.forEach((u, idx) => {
                const winRate = u.gameCount === 0 ? '-' : Math.round((u.winCount / u.gameCount) * 100) + '%';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight:bold; color:var(--text-muted)">#${idx + 1}</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:24px; height:24px; border-radius:50%; background:var(--color-primary); color:#000; text-align:center; font-weight:bold; line-height:24px; font-size:12px;">${u.nickname.charAt(0).toUpperCase()}</div>
                            <span>${u.nickname}</span>
                        </div>
                    </td>
                    <td style="color:var(--color-primary); font-weight:bold;">${u.totalScore}</td>
                    <td>${u.winCount} 胜 / ${u.gameCount} 局</td>
                    <td>${winRate}</td>
                `;
                this.tableBody.appendChild(tr);
            });

        } catch (error) {
            console.error(error);
            this.tableBody.innerHTML = `<tr><td colspan="5" style="color:var(--color-danger); text-align:center;">读取失败: ${error.message}</td></tr>`;
        }
    }
}

// 供全局调用
const leaderboard = new LeaderboardController();
window.leaderboard = leaderboard;
