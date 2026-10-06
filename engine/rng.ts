/**
 * 模拟用的唯一随机源：xmur3 把字符串种子收成 32 位状态，mulberry32 往后抽取。
 * 调用方必须把 getState() 写进存档，下次从该状态继续，不能重新开种子。
 */

export interface Rng {
  nextUint32(): number;
  /** 闭区间整数。 */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  getState(): number;
}

export function xmur3(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h = (h ^= h >>> 16) >>> 0;
    return h >>> 0;
  };
}

export function rngStateFromSeed(seed: string): number {
  if (seed.length === 0) {
    throw new Error("种子不能为空");
  }
  return xmur3(seed)();
}

export function createRng(seedState: number): Rng {
  if (!Number.isInteger(seedState) || seedState < 0 || seedState > 0xffffffff) {
    throw new Error(`无效的随机数状态: ${seedState}`);
  }
  let a = seedState >>> 0;

  const nextUint32 = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  return {
    nextUint32,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new Error(`无效区间: ${min}..${max}`);
      }
      const span = max - min + 1;
      return min + (nextUint32() % span);
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error("不能从空列表抽取");
      }
      return items[this.int(0, items.length - 1)] as (typeof items)[number];
    },
    getState() {
      return a >>> 0;
    },
  };
}
