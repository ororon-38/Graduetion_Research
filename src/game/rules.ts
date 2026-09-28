// HONOCELLO のルール(Reactに依存しない純粋ロジック)
// C++ Board と同じ規約:
//   - 座標 B = {(x,y) | x,y>=0, x+y<N}
//   - セル番号は y が外側ループ、x が内側ループの順(N=6 なら 0〜20)
//   - 手番は 黒(0) → 白(1) → 赤(2)。cells の色は 0=空, 1=黒, 2=白, 3=赤
//   - パスは明示的な状態遷移(pass カウント)。3連続パスまたは空きなしで終局

export const PLAYER_NUM = 3;
export const EMPTY = 0;

export interface State {
  readonly cells: Uint8Array; // 長さ cellCount。immutable として扱う
  readonly turn: number; // 0=黒, 1=白, 2=赤
  readonly pass: number; // 連続パス数
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

// N=6 の初期配置(C++ Board::initialBoard と同一)。色は 1=黒, 2=白, 3=赤
export const INITIAL_N6: ReadonlyArray<readonly [number, number, number]> = [
  [1, 3, 1], [2, 1, 1], [3, 2, 1],
  [1, 2, 2], [3, 1, 2], [2, 0, 2],
  [1, 1, 3], [2, 2, 3], [0, 3, 3],
];

export class HexRules {
  readonly n: number;
  readonly cellCount: number;
  readonly xs: Int8Array;
  readonly ys: Int8Array;
  private readonly idx: Int16Array; // (x*n+y) -> セル番号, 盤外は -1
  private readonly rays: Int16Array[][]; // rays[cell][dir] = その方向に並ぶセル番号
  private readonly perms: Int16Array[]; // 6種類の対称変換: perms[t][i] = 変換後のセル番号

  constructor(n: number) {
    this.n = n;
    this.cellCount = (n * (n + 1)) / 2;
    this.xs = new Int8Array(this.cellCount);
    this.ys = new Int8Array(this.cellCount);
    this.idx = new Int16Array(n * n).fill(-1);

    let k = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x + y < n; x++) {
        this.xs[k] = x;
        this.ys[k] = y;
        this.idx[x * n + y] = k;
        k++;
      }
    }

    this.rays = [];
    for (let i = 0; i < this.cellCount; i++) {
      const perDir: Int16Array[] = [];
      for (const [dx, dy] of DIRS) {
        const line: number[] = [];
        let x = this.xs[i] + dx;
        let y = this.ys[i] + dy;
        while (this.inside(x, y)) {
          line.push(this.idx[x * n + y]);
          x += dx;
          y += dy;
        }
        perDir.push(Int16Array.from(line));
      }
      this.rays.push(perDir);
    }

    // C++ の Board::transform と同じ 6 種類(位置のみ。色は入れ替えない)
    const rot120 = (x: number, y: number): [number, number] => [y, n - 1 - x - y];
    const rot240 = (x: number, y: number): [number, number] => [n - 1 - x - y, x];
    const mirror = (x: number, y: number): [number, number] => [y, x];
    const fns: Array<(x: number, y: number) => [number, number]> = [
      (x, y) => [x, y],
      rot120,
      rot240,
      mirror,
      (x, y) => rot120(...mirror(x, y)),
      (x, y) => rot240(...mirror(x, y)),
    ];
    this.perms = fns.map((f) => {
      const p = new Int16Array(this.cellCount);
      for (let i = 0; i < this.cellCount; i++) {
        const [nx, ny] = f(this.xs[i], this.ys[i]);
        p[i] = this.idx[nx * n + ny];
      }
      return p;
    });
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x + y < this.n;
  }

  cellIndex(x: number, y: number): number {
    return this.inside(x, y) ? this.idx[x * this.n + y] : -1;
  }

  // ---------- 初期盤面 ----------
  initialState(placements: ReadonlyArray<readonly [number, number, number]> = INITIAL_N6): State {
    const cells = new Uint8Array(this.cellCount);
    for (const [x, y, color] of placements) {
      const i = this.cellIndex(x, y);
      if (i < 0) throw new Error(`初期配置が盤外です: (${x},${y})`);
      cells[i] = color;
    }
    return { cells, turn: 0, pass: 0 };
  }

  // ---------- 着手 ----------
  legalMoves(s: State): number[] {
    const color = s.turn + 1;
    const moves: number[] = [];
    for (let i = 0; i < this.cellCount; i++) {
      if (s.cells[i] !== EMPTY) continue;
      if (this.canFlipAny(s.cells, i, color)) moves.push(i);
    }
    return moves;
  }

  private canFlipAny(cells: Uint8Array, i: number, color: number): boolean {
    for (const ray of this.rays[i]) {
      let seenOpponent = false;
      for (let k = 0; k < ray.length; k++) {
        const v = cells[ray[k]];
        if (v === EMPTY) break;
        if (v === color) {
          if (seenOpponent) return true;
          break;
        }
        seenOpponent = true;
      }
    }
    return false;
  }

  applyMove(s: State, move: number): State {
    const color = s.turn + 1;
    const cells = new Uint8Array(s.cells);
    cells[move] = color;
    for (const ray of this.rays[move]) {
      // 空きに当たる or 自色に届かない方向は反転しない。近い方の自色石を基準にする
      let end = -1;
      for (let k = 0; k < ray.length; k++) {
        const v = s.cells[ray[k]];
        if (v === EMPTY) break;
        if (v === color) {
          end = k;
          break;
        }
      }
      for (let k = 0; k < end; k++) cells[ray[k]] = color;
    }
    return { cells, turn: (s.turn + 1) % PLAYER_NUM, pass: 0 };
  }

  applyPass(s: State): State {
    return { cells: s.cells, turn: (s.turn + 1) % PLAYER_NUM, pass: s.pass + 1 };
  }

  // ---------- 終局・得点 ----------
  emptyCount(s: State): number {
    let c = 0;
    for (let i = 0; i < this.cellCount; i++) if (s.cells[i] === EMPTY) c++;
    return c;
  }

  isTerminal(s: State): boolean {
    return s.pass >= PLAYER_NUM || this.emptyCount(s) === 0;
  }

  scores(s: State): [number, number, number] {
    const sc: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < this.cellCount; i++) if (s.cells[i] !== EMPTY) sc[s.cells[i] - 1]++;
    return sc;
  }

  // 1位のプレイヤー集合をビットマスクで返す(bit0=黒, bit1=白, bit2=赤)。
  // 1ビットなら勝者確定、複数ビットなら1位同数(引き分け)
  topMask(s: State): number {
    const sc = this.scores(s);
    const max = Math.max(...sc);
    let mask = 0;
    for (let p = 0; p < PLAYER_NUM; p++) if (sc[p] === max) mask |= 1 << p;
    return mask;
  }

  // ---------- 対称性を畳み込んだ状態キー ----------
  // 6種類の位置対称のうち最小の盤面文字列 + 手番 + パス数(C++ の hash() と同じ考え方)
  canonicalKey(s: State): string {
    let best = "";
    const buf = new Array<string>(this.cellCount);
    for (let t = 0; t < 6; t++) {
      const p = this.perms[t];
      for (let i = 0; i < this.cellCount; i++) buf[p[i]] = String.fromCharCode(48 + s.cells[i]);
      const str = buf.join("");
      if (t === 0 || str < best) best = str;
    }
    return `${best}|${s.turn}|${s.pass}`;
  }

  // 手番プレイヤーの次状態(合法手があれば着手、なければパス1本)。move=-1 はパス
  successors(s: State): Array<{ move: number; state: State }> {
    const moves = this.legalMoves(s);
    if (moves.length === 0) return [{ move: -1, state: this.applyPass(s) }];
    return moves.map((m) => ({ move: m, state: this.applyMove(s, m) }));
  }
}
