import { _decorator } from 'cc';

export type ActionTask = () => Promise<void>;

/**
 * 动作队列管理器
 * 确保麻将游戏中的动画（发牌、打牌、碰杠胡特效）按顺序播放，不发生重叠穿模。
 */
export class ActionQueue {
    private _queue: ActionTask[] = [];
    private _isRunning: boolean = false;

    /**
     * 将一个新的动作加入队列
     * @param task 一个返回 Promise 的异步函数
     */
    public enqueue(task: ActionTask): void {
        this._queue.push(task);
        if (!this._isRunning) {
            this._runNext();
        }
    }

    /**
     * 清空当前队列（通常在断线重连或重置牌局时使用）
     */
    public clear(): void {
        this._queue = [];
        this._isRunning = false;
    }

    private async _runNext(): Promise<void> {
        if (this._queue.length === 0) {
            this._isRunning = false;
            return;
        }

        this._isRunning = true;
        const task = this._queue.shift();
        
        if (task) {
            try {
                await task();
            } catch (e) {
                console.error('[ActionQueue] Task execution failed:', e);
            }
        }

        // 继续执行下一个
        this._runNext();
    }
}
