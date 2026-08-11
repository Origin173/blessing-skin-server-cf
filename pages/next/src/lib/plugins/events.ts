/**
 * 插件事件分发器 (镜像 Laravel Event::listen/dispatch)。
 * 事件名约定见 docs/02-plugin-sdk.md §3 事件镜像表。
 */

export type EventHandler = (payload: any) => void | Promise<void>;

export interface EventBus {
  on(name: string, handler: EventHandler): void;
  once(name: string, handler: EventHandler): void;
  off(name: string, handler: EventHandler): void;
  /** 触发事件;handler 异常被捕获并记录,不影响其他 handler */
  dispatch(name: string, payload?: any): Promise<void>;
  listeners(name: string): EventHandler[];
}

interface Entry {
  handler: EventHandler;
  once: boolean;
}

export function createEventBus(logger?: (name: string, error: unknown) => void): EventBus {
  const registry = new Map<string, Entry[]>();

  function add(name: string, handler: EventHandler, once: boolean): void {
    const list = registry.get(name) ?? [];
    list.push({ handler, once });
    registry.set(name, list);
  }

  return {
    on(name, handler) {
      add(name, handler, false);
    },
    once(name, handler) {
      add(name, handler, true);
    },
    off(name, handler) {
      const list = registry.get(name) ?? [];
      registry.set(
        name,
        list.filter((entry) => entry.handler !== handler),
      );
    },
    async dispatch(name, payload) {
      const list = registry.get(name) ?? [];
      // 快照:handler 执行中新增的监听不参与本次派发 (对应 Laravel 遍历行为)
      for (const entry of [...list]) {
        try {
          await entry.handler(payload);
        } catch (error) {
          if (logger) logger(name, error);
          else console.error(`[plugins] event "${name}" handler failed:`, error);
        }
        if (entry.once) {
          this.off(name, entry.handler);
        }
      }
    },
    listeners(name) {
      return (registry.get(name) ?? []).map((entry) => entry.handler);
    },
  };
}
