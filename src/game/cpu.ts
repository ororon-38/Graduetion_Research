import { Analysis, MASK_SLOTS } from "./analysis";
import { HexRules, PLAYER_NUM } from "./rules";
import type { State } from "./rules";

export type Vec = [number, number, number];

export type CpuType =
  | "random"
  | "maxn-stone"
  | "maxn-path";

const POP = [0, 1, 1, 2, 1, 2, 2, 3];


// ============================================================
// CPU 共通インターフェース
// ============================================================

export interface Cpu {
  chooseMove(s: State): number;
}


// ============================================================
// Random CPU
// ============================================================

export class RandomCpu implements Cpu {
  private readonly rules: HexRules;

  constructor(rules: HexRules) {
    this.rules = rules;
  }

  chooseMove(s: State): number {
    const moves = this.rules.legalMoves(s);

    if (moves.length === 0) {
      return -1;
    }

    return moves[
      Math.floor(Math.random() * moves.length)
    ];
  }
}


// ============================================================
// MaxN CPU
// ============================================================

export class MaxNCpu implements Cpu {
  private readonly rules: HexRules;
  private readonly analysis: Analysis;
  private readonly depth: number;
  private readonly evaluation: "stone" | "path";

  constructor(
    rules: HexRules,
    analysis: Analysis,
    depth: number,
    evaluation: "stone" | "path",
  ) {
    this.rules = rules;
    this.analysis = analysis;
    this.depth = depth;
    this.evaluation = evaluation;
  }


  // ----------------------------------------------------------
  // 最善手を選択
  // ----------------------------------------------------------

  chooseMove(s: State): number {
    const moves = this.rules.legalMoves(s);

    if (moves.length === 0) {
      return -1;
    }

    const player = s.turn;

    let bestMove = moves[0];
    let bestValue = -Infinity;

    for (const move of moves) {
      const next =
        this.rules.applyMove(s, move);

      const value =
        this.maxn(next, this.depth)[player];

      if (value > bestValue) {
        bestValue = value;
        bestMove = move;
      }
    }

    return bestMove;
  }


  // ----------------------------------------------------------
  // 評価関数
  // ----------------------------------------------------------

  private evaluate(s: State): Vec {
    if (this.evaluation === "stone") {
      return this.evaluateStone(s);
    }

    return this.evaluatePath(s);
  }


  // ----------------------------------------------------------
  // 石数評価
  // ----------------------------------------------------------

  private evaluateStone(s: State): Vec {
    const scores = this.rules.scores(s);

    return [
      scores[0],
      scores[1],
      scores[2],
    ];
  }


  // ----------------------------------------------------------
  // 勝利経路評価
  // ----------------------------------------------------------

  private evaluatePath(s: State): Vec {
    const paths = this.analysis.pathsOf(s);

    if (!paths) {
      return [0, 0, 0];
    }

    let total = 0;

    const value: Vec = [0, 0, 0];

    for (let mask = 1; mask < MASK_SLOTS; mask++) {
      const count = paths[mask];

      total += count;

      for (
        let player = 0;
        player < PLAYER_NUM;
        player++
      ) {
        if (mask & (1 << player)) {
          value[player] +=
            count / POP[mask];
        }
      }
    }

    if (total === 0) {
      return [0, 0, 0];
    }

    return [
      value[0] / total,
      value[1] / total,
      value[2] / total,
    ];
  }


  // ----------------------------------------------------------
  // MaxN
  // ----------------------------------------------------------

  private maxn(
    s: State,
    depth: number,
  ): Vec {

    if (
      depth === 0 ||
      this.rules.isTerminal(s)
    ) {
      return this.evaluate(s);
    }

    const moves =
      this.rules.legalMoves(s);

    // 合法手がない場合はパス
    if (moves.length === 0) {
      return this.maxn(
        this.rules.applyPass(s),
        depth - 1,
      );
    }

    const player = s.turn;

    let best: Vec = [0, 0, 0];
    let bestValue = -Infinity;

    for (const move of moves) {
      const next =
        this.rules.applyMove(s, move);

      const value =
        this.maxn(
          next,
          depth - 1,
        );

      if (value[player] > bestValue) {
        bestValue = value[player];
        best = value;
      }
    }

    return best;
  }
}


// ============================================================
// CPU生成
// ============================================================

export function createCpu(
  type: CpuType,
  rules: HexRules,
  analysis: Analysis,
  depth: number,
): Cpu {

  switch (type) {

    case "random":
      return new RandomCpu(rules);

    case "maxn-stone":
      return new MaxNCpu(
        rules,
        analysis,
        depth,
        "stone",
      );

    case "maxn-path":
      return new MaxNCpu(
        rules,
        analysis,
        depth,
        "path",
      );
  }
}