/**
 * sfc32 シード付き疑似乱数生成器 (ADR 0038)
 *
 * 32bit 演算のみで動作する既知の良性 PRNG。シードは splitmix32 で
 * 32bit 整数から 4 つの内部状態へ展開する（Date.now() 級シードでも
 * `seed >>> 0` で受けるため浮動小数点精度落ちがない）。
 */
export class Sfc32 {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    // splitmix32 でシードから 4 状態を生成
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- 32bit 符号なし変換のビット演算。Math.trunc は符号付き丸めで意味が異なり PRNG が壊れる
    let s = seed >>> 0;
    const split = (): number => {
      // oxlint-disable-next-line unicorn/prefer-math-trunc -- 32bit ラップアラウンド演算 (| 0)。Math.trunc に変えると PRNG が壊れる
      s = (s + 0x9e3779b9) | 0;
      let t = s ^ (s >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15;
      t = Math.imul(t, 0x735a2d97);
      // oxlint-disable-next-line unicorn/prefer-math-trunc -- 32bit 符号なし変換のビット演算。Math.trunc に変えると PRNG が壊れる
      return (t ^ (t >>> 15)) >>> 0;
    };
    this.a = split();
    this.b = split();
    this.c = split();
    this.d = split();
    // 状態を混合するウォームアップ
    for (let i = 0; i < 12; i++) this.next();
  }

  /** 0.0 以上 1.0 未満の浮動小数点数を返す */
  next(): number {
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- sfc32 の 32bit ラップアラウンド演算 (| 0)。Math.trunc に変えると PRNG が壊れる
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- 32bit ラップアラウンド演算 (| 0)。Math.trunc に変えると PRNG が壊れる
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- 32bit ラップアラウンド演算 (| 0)。Math.trunc に変えると PRNG が壊れる
    this.b = (this.c + (this.c << 3)) | 0;
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- 32bit ラップアラウンド演算 (| 0)。Math.trunc に変えると PRNG が壊れる
    this.c = ((this.c << 21) | (this.c >>> 11)) | 0;
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- 32bit ラップアラウンド演算 (| 0)。Math.trunc に変えると PRNG が壊れる
    this.c = (this.c + t) | 0;
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- 32bit 符号なし変換のビット演算。Math.trunc に変えると PRNG が壊れる
    return (t >>> 0) / 4294967296;
  }
}
