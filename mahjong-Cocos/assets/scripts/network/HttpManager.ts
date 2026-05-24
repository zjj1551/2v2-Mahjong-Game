/**
 * REST API 管理器
 * 统一封装 fetch 请求，管理 baseUrl 和用户 token
 */
export class HttpManager {
    private static _instance: HttpManager | null = null;
    private _baseUrl: string = 'http://localhost:8080/api';
    private _userId: number = -1;

    public static get instance(): HttpManager {
        if (!this._instance) {
            this._instance = new HttpManager();
        }
        return this._instance;
    }

    public setBaseUrl(host: string, port: number): void {
        this._baseUrl = `http://${host}:${port}/api`;
    }

    public get userId(): number {
        return this._userId;
    }

    public setUserId(id: number): void {
        this._userId = id;
    }

    /** 用户注册 */
    public async register(username: string, password: string, nickname: string): Promise<any> {
        return this._post('/user/register', { username, password, nickname });
    }

    /** 用户登录，成功后自动保存 userId */
    public async login(username: string, password: string): Promise<any> {
        const result = await this._post('/user/login', { username, password });
        if (result && result.userId) {
            this._userId = result.userId;
        }
        return result;
    }

    /** 创建房间 */
    public async createRoom(roomName: string, baseScore: number = 1, maxRounds: number = 4): Promise<any> {
        return this._post('/room/create', {
            userId: this._userId,
            roomName,
            baseScore,
            maxRounds
        });
    }

    /** 获取开放房间列表 */
    public async getRoomList(): Promise<any[]> {
        return this._get('/room/list');
    }

    /** 获取排行榜 */
    public async getLeaderboard(): Promise<any[]> {
        return this._get('/user/leaderboard');
    }

    private async _post(path: string, body: any): Promise<any> {
        try {
            const resp = await fetch(this._baseUrl + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`HTTP ${resp.status}: ${text}`);
            }
            return await resp.json();
        } catch (e) {
            console.error(`[HttpManager] POST ${path} failed:`, e);
            throw e;
        }
    }

    private async _get(path: string): Promise<any> {
        try {
            const resp = await fetch(this._baseUrl + path);
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`HTTP ${resp.status}: ${text}`);
            }
            return await resp.json();
        } catch (e) {
            console.error(`[HttpManager] GET ${path} failed:`, e);
            throw e;
        }
    }
}
