// js/api.js
// 封装与后端的 REST API 交互

function resolveApiBaseUrl() {
    return '/api';
}

const API_BASE_URL = resolveApiBaseUrl();

class ApiService {
    async request(endpoint, method = 'GET', data = null) {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const result = await response.json();

            // 如果 HTTP 状态码不是 2xx，或者返回包里的 success 是 false
            if (!response.ok || result.success === false) {
                const errMsg = result.msg || result.message || '请求失败';
                throw new Error(errMsg);
            }
            return result;
        } catch (error) {
            console.error(`[API Error] ${method} ${url}:`, error);
            if (error.message.includes('Failed to fetch')) {
                throw new Error('连接服务器失败，请确认后端服务已启动');
            }
            throw error; // 抛出给上层调用者处理 (显示 Toast)
        }
    }

    // --- 用户相关 ---
    register(username, password, nickname) {
        return this.request('/user/register', 'POST', { username, password, nickname });
    }

    login(username, password) {
        return this.request('/user/login', 'POST', { username, password });
    }

    getUserInfo(userId) {
        return this.request(`/user/${userId}`, 'GET');
    }

    getLeaderboard() {
        return this.request('/user/leaderboard', 'GET');
    }

    updateNickname(userId, nickname) {
        return this.request(`/user/${userId}/nickname`, 'PUT', { nickname });
    }

    getUserRecords(userId, limit = 20) {
        return this.request(`/user/${userId}/records?limit=${limit}`, 'GET');
    }

    // --- 房间相关 ---
    createRoom(creatorId, roomName, baseScore, maxRounds) {
        return this.request('/room/create', 'POST', { creatorId, roomName, baseScore, maxRounds });
    }

    getRoomList() {
        return this.request('/room/list', 'GET');
    }

    getRoomInfo(roomId) {
        return this.request(`/room/${roomId}`, 'GET');
    }

    disbandRoomByHttp(roomId, creatorId) {
        return this.request(`/room/${roomId}?creatorId=${creatorId}`, 'DELETE');
    }

    getRoomRecords(roomId) {
        return this.request(`/room/${roomId}/records`, 'GET');
    }

    // --- 好友系统 ---
    addFriend(userId, friendId) {
        return this.request('/user/friend/add', 'POST', { userId, friendId });
    }

    getFriendsList(userId) {
        return this.request(`/user/${userId}/friends`, 'GET');
    }

    getFriendRequests(userId) {
        return this.request(`/user/${userId}/friend-requests`, 'GET');
    }

    acceptFriendRequest(requestId, userId) {
        return this.request(`/user/friend/accept/${requestId}?userId=${userId}`, 'POST');
    }

    rejectFriendRequest(requestId, userId) {
        return this.request(`/user/friend/reject/${requestId}?userId=${userId}`, 'POST');
    }

    // --- 管理员专用接口 ---
    adminGetAllUsers(adminId) {
        return this.request(`/user/admin/users?adminId=${adminId}`, 'GET');
    }

    adminSetRole(adminId, targetUserId, role) {
        return this.request('/user/admin/set-role', 'POST', { adminId, targetUserId, role });
    }

    adminSetStatus(adminId, targetUserId, status) {
        return this.request('/user/admin/set-status', 'POST', { adminId, targetUserId, status });
    }

    adminResetPassword(adminId, targetUserId, newPassword) {
        return this.request('/user/admin/reset-password', 'POST', { adminId, targetUserId, newPassword });
    }

    adminUpdateScore(adminId, targetUserId, score) {
        return this.request('/user/admin/update-score', 'POST', { adminId, targetUserId, score });
    }
}

// 导出单例对象
const api = new ApiService();
