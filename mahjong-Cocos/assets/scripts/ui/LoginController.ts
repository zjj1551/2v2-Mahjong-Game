import { _decorator, Component, EditBox, Label, Button, director } from 'cc';
import { HttpManager } from '../network/HttpManager';
const { ccclass, property } = _decorator;

/**
 * 登录/注册场景控制器
 *
 * 场景节点结构：
 * Canvas
 * └── LoginPanel (登录面板)
 *     ├── EditBox_Username
 *     ├── EditBox_Password
 *     ├── Btn_Login
 *     ├── Btn_ToRegister   (切换到注册面板)
 *     └── Label_Tip
 * └── RegisterPanel (注册面板)
 *     ├── EditBox_Username
 *     ├── EditBox_Password
 *     ├── EditBox_Nickname
 *     ├── Btn_Register
 *     ├── Btn_ToLogin      (切换到登录面板)
 *     └── Label_Tip
 */
@ccclass('LoginController')
export class LoginController extends Component {

    // --- 登录面板 ---
    @property(EditBox)
    loginUsername: EditBox = null!;

    @property(EditBox)
    loginPassword: EditBox = null!;

    @property(Label)
    loginTip: Label = null!;

    // --- 注册面板 ---
    @property(EditBox)
    registerUsername: EditBox = null!;

    @property(EditBox)
    registerPassword: EditBox = null!;

    @property(EditBox)
    registerNickname: EditBox = null!;

    @property(Label)
    registerTip: Label = null!;

    // 服务器地址配置（可根据实际情况修改）
    @property
    serverHost: string = 'localhost';

    @property
    serverPort: number = 8080;

    protected start(): void {
        HttpManager.instance.setBaseUrl(this.serverHost, this.serverPort);
    }

    /** 点击登录按钮 */
    public async onLoginClick(): Promise<void> {
        const username = this.loginUsername?.string?.trim();
        const password = this.loginPassword?.string?.trim();

        if (!username || !password) {
            this._setLoginTip('请填写用户名和密码');
            return;
        }

        this._setLoginTip('登录中…');
        try {
            const result = await HttpManager.instance.login(username, password);
            if (result && result.userId) {
                this._setLoginTip('登录成功！');
                // 短暂延迟后跳转大厅
                setTimeout(() => {
                    director.loadScene('LobbyScene');
                }, 500);
            } else {
                this._setLoginTip(result?.message || '登录失败，请检查账号密码');
            }
        } catch (e: any) {
            this._setLoginTip('连接服务器失败，请确认后端已启动');
        }
    }

    /** 点击注册按钮 */
    public async onRegisterClick(): Promise<void> {
        const username = this.registerUsername?.string?.trim();
        const password = this.registerPassword?.string?.trim();
        const nickname = this.registerNickname?.string?.trim();

        if (!username || !password || !nickname) {
            this._setRegisterTip('请填写所有字段');
            return;
        }

        this._setRegisterTip('注册中…');
        try {
            const result = await HttpManager.instance.register(username, password, nickname);
            if (result && result.userId) {
                this._setRegisterTip('注册成功！请登录');
            } else {
                this._setRegisterTip(result?.message || '注册失败，用户名可能已存在');
            }
        } catch (e: any) {
            this._setRegisterTip('连接服务器失败，请确认后端已启动');
        }
    }

    private _setLoginTip(msg: string): void {
        if (this.loginTip) this.loginTip.string = msg;
    }

    private _setRegisterTip(msg: string): void {
        if (this.registerTip) this.registerTip.string = msg;
    }
}
