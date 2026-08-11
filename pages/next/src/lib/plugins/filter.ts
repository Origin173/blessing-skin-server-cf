/**
 * Filter 值变换管线 (镜像 Blessing\Filter)。
 * 用法: filter.add('head_links', (links) => [...links, {rel:'stylesheet', href:...}])
 *       apply('head_links', []) → 串行执行所有 transform
 */

export type FilterTransform<T = any> = (value: T, ...args: any[]) => T | Promise<T>;

export interface Filter {
  add: <T>(name: string, transform: FilterTransform<T>) => void;
  /** 串行执行 transforms,前一个的返回值作为后一个的输入 */
  apply: <T>(name: string, init: T, args?: any[]) => Promise<T>;
}

export function createFilter(logger?: (name: string, error: unknown) => void): Filter {
  const registry = new Map<string, FilterTransform[]>();

  return {
    add(name, transform) {
      const list = registry.get(name) ?? [];
      list.push(transform);
      registry.set(name, list);
    },
    async apply(name, init, args = []) {
      let value: any = init;
      for (const transform of [...(registry.get(name) ?? [])]) {
        try {
          value = await transform(value, ...args);
        } catch (error) {
          if (logger) logger(name, error);
          else console.error(`[plugins] filter "${name}" failed:`, error);
        }
      }
      return value;
    },
  };
}
