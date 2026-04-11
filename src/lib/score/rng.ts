/**
 * XorShift128Plus シード付き疑似乱数生成器
 *
 * 32ビットペアで状態を管理し、高速かつ再現性のある乱数列を提供する。
 */
export class XorShift128Plus {
  private s0: number;
  private s1: number;

  constructor(seed: number) {
    // シードから2つの内部状態を生成（0を避ける）
    this.s0 = (seed >>> 0) | 1;
    this.s1 = (seed * 2654435761) >>> 0 | 1;
  }

  /** 0.0 以上 1.0 未満の浮動小数点数を返す */
  next(): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= (s1 << 23) | 0;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s1 = s1;
    return ((this.s0 + this.s1) >>> 0) / 4294967296;
  }
}
