// 全状態グラフの構築と、終局結果ごとの経路数DP(C++ の StateDatabase + OutcomeDistribution 相当)
//
// paths の格納形式: 状態ごとに長さ 8 の配列。添字は「1位プレイヤーのビットマスク」
//   1=黒勝ち, 2=白勝ち, 4=赤勝ち, 3/5/6=2人同数1位, 7=3人同数1位, 0 は未使用
// C++ の 4 分類(黒/白/赤/引分)は fold4() で得られる。
import { HexRules } from "./rules";
import type { State } from "./rules";

export const MASK_SLOTS = 8;

export interface AnalysisOptions {
  // true: 同じ親→同じ子(対称で一致)の重複エッジを1本にまとめる
  // false: 手ごとに別エッジとして数える
  dedupeEdges: boolean;
}

export class Analysis {
  readonly nodeCount: number;
  readonly edgeCountMulti: number; // 手ごとに数えたエッジ数
  readonly edgeCountUnique: number; // (親,子) の重複を除いたエッジ数
  readonly rootId = 0;

  readonly terminalCount: number;
  readonly terminalDistribution: [number, number, number, number];

  private readonly keyToId: Map<string, number>;
  private readonly children: number[][];
  private readonly pathTable: Float64Array;
  private readonly rules: HexRules;

  constructor(rules: HexRules, initial: State, opts: AnalysisOptions = { dedupeEdges: true }) {
    this.rules = rules;
    this.keyToId = new Map();
    const states: State[] = [];
    const children: number[][] = [];

    const intern = (s: State): number => {
      const key = rules.canonicalKey(s);
      let id = this.keyToId.get(key);
      if (id === undefined) {
        id = states.length;
        this.keyToId.set(key, id);
        states.push(s);
        children.push([]);
      }
      return id;
    };

    intern(initial);
    let multi = 0;
    let unique = 0;
    // 状態は生成順に BFS で展開する(states は伸びながら走査)
    for (let id = 0; id < states.length; id++) {
      const s = states[id];
      if (rules.isTerminal(s)) continue;
      const seen = new Set<number>();
      for (const { state } of rules.successors(s)) {
        const cid = intern(state);
        multi++;
        if (!seen.has(cid)) {
          seen.add(cid);
          unique++;
          children[id].push(cid);
        } else if (!opts.dedupeEdges) {
          children[id].push(cid);
        }
      }
    }
    this.nodeCount = states.length;
    this.edgeCountMulti = multi;
    this.edgeCountUnique = unique;
    this.children = children;

    // 終局状態数を集計
    let terminalCount = 0;

    const terminalDistribution: [number, number, number, number] =
      [0, 0, 0, 0];

    for (const s of states) {
      if (!rules.isTerminal(s)) {
        continue;
      }

      terminalCount++;

      const mask = rules.topMask(s);

      if (mask === 1) {
        terminalDistribution[0]++;
      } else if (mask === 2) {
        terminalDistribution[1]++;
      } else if (mask === 4) {
        terminalDistribution[2]++;
      } else {
        terminalDistribution[3]++;
      }
    }

    this.terminalCount = terminalCount;
    this.terminalDistribution = terminalDistribution;

    // 逆順DP: 遷移は (石数, passCount) の辞書式順序で必ず増えるので、その降順に処理すればよい
    const rank = new Int32Array(this.nodeCount);
    for (let id = 0; id < this.nodeCount; id++) {
      rank[id] = (rules.cellCount - rules.emptyCount(states[id])) * 4 + states[id].pass;
    }
    const order = Array.from({ length: this.nodeCount }, (_, i) => i).sort((a, b) => rank[b] - rank[a]);

    this.pathTable = new Float64Array(this.nodeCount * MASK_SLOTS);
    for (const id of order) {
      const base = id * MASK_SLOTS;
      const s = states[id];
      if (rules.isTerminal(s)) {
        this.pathTable[base + rules.topMask(s)] = 1;
      } else {
        for (const c of children[id]) {
          const cb = c * MASK_SLOTS;
          for (let m = 1; m < MASK_SLOTS; m++) this.pathTable[base + m] += this.pathTable[cb + m];
        }
      }
    }
  }

  idOf(s: State): number | undefined {
    return this.keyToId.get(this.rules.canonicalKey(s));
  }

  // 状態 id の結果別経路数(長さ8、添字=1位マスク)
  pathsById(id: number): Float64Array {
    return this.pathTable.subarray(id * MASK_SLOTS, (id + 1) * MASK_SLOTS);
  }

  pathsOf(s: State): Float64Array | undefined {
    const id = this.idOf(s);
    return id === undefined ? undefined : this.pathsById(id);
  }

  childIds(id: number): readonly number[] {
    return this.children[id];
  }
}

// [黒勝ち, 白勝ち, 赤勝ち, 引分(同数1位すべて)] に畳む
export function fold4(p: ArrayLike<number>): [number, number, number, number] {
  return [p[1], p[2], p[4], p[3] + p[5] + p[6] + p[7]];
}
