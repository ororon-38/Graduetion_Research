import { useEffect, useMemo, useState, } from "react";
import { HexRules } from "./game/rules";
import type { State } from "./game/rules";
import { Analysis } from "./game/analysis";
import { createCpu, } from "./game/cpu";
import type { CpuType, } from "./game/cpu";


// ============================================================
// 型
// ============================================================

type Controller = "human" | "cpu";

interface PlayerSetting {
  controller: Controller;
  cpuType: CpuType;
}


// ============================================================
// 定数
// ============================================================

const PLAYER_NAMES = [
  "黒",
  "白",
  "赤",
];

const PLAYER_COLORS = [
  "#222222",
  "#ffffff",
  "#e53935",
];


// MaxN の探索深度
// UIからは変更しない
const MAXN_DEPTH = 3;

// ================== ヘルパー関数 ==================
function hexToPixel(
  x: number,
  y: number,
  size: number,
) {
  const px =
    size *
    (
      Math.sqrt(3) * x +
      (Math.sqrt(3) / 2) * y
    ) +
    100;

  const py =
    -size * (1.5 * y) +
    300;

  return { px, py };
}


function hexPoints(
  cx: number,
  cy: number,
  size: number,
): string {

  const points: string[] = [];

  for (let i = 0; i < 6; i++) {

    const angle =
      (Math.PI / 180) *
      (60 * i - 30);

    const x =
      cx +
      size * Math.cos(angle);

    const y =
      cy +
      size * Math.sin(angle);

    points.push(`${x},${y}`);
  }

  return points.join(" ");
}


// ============================================================
// App
// ============================================================

export default function App() {

  // ----------------------------------------------------------
  // ルール・解析
  // ----------------------------------------------------------

  const rules = useMemo(
    () => new HexRules(6),
    [],
  );

  const analysis = useMemo(
    () =>
      new Analysis(
        rules,
        rules.initialState(),
        {
          dedupeEdges: false,
        },
      ),
    [rules],
  );


  // ----------------------------------------------------------
  // プレイヤー設定
  // ----------------------------------------------------------

  const [players, setPlayers] =
    useState<PlayerSetting[]>([
      {
        controller: "human",
        cpuType: "random",
      },
      {
        controller: "cpu",
        cpuType: "maxn-stone",
      },
      {
        controller: "cpu",
        cpuType: "maxn-path",
      },
    ]);


  // ----------------------------------------------------------
  // ゲーム状態
  // ----------------------------------------------------------

  const [state, setState] =
    useState<State>(() =>
      rules.initialState()
    );

  const [started, setStarted] =
    useState(false);

  const [message, setMessage] =
    useState(
      "プレイヤーを設定してください。"
    );


  // ----------------------------------------------------------
  // 現在情報
  // ----------------------------------------------------------

  const scores =
    rules.scores(state);

  const legalMoves =
    rules.legalMoves(state);

  const terminal =
    rules.isTerminal(state);

  const currentSetting =
    players[state.turn];


  // ==========================================================
  // プレイヤー設定変更
  // ==========================================================

  const changeController = (
    player: number,
    controller: Controller,
  ) => {

    setPlayers((old) =>
      old.map((p, i) =>
        i === player
          ? {
            ...p,
            controller,
          }
          : p
      )
    );
  };


  const changeCpuType = (
    player: number,
    cpuType: CpuType,
  ) => {

    setPlayers((old) =>
      old.map((p, i) =>
        i === player
          ? {
            ...p,
            cpuType,
          }
          : p
      )
    );
  };


  // ==========================================================
  // ゲーム開始
  // ==========================================================

  const startGame = () => {

    setState(
      rules.initialState()
    );

    setStarted(true);

    setMessage(
      "ゲーム開始"
    );
  };


  // ==========================================================
  // リセット
  // ==========================================================

  const resetGame = () => {

    setState(
      rules.initialState()
    );

    setStarted(false);

    setMessage(
      "プレイヤーを設定してください。"
    );
  };


  // ==========================================================
  // 人間の着手
  // ==========================================================

  const humanMove = (
    move: number,
  ) => {

    if (!started) return;

    if (terminal) return;

    if (
      currentSetting.controller
      !== "human"
    ) {
      return;
    }

    if (
      !legalMoves.includes(move)
    ) {
      return;
    }

    setState(
      rules.applyMove(
        state,
        move,
      )
    );
  };


  // ==========================================================
  // CPU・自動パス
  // ==========================================================

  useEffect(() => {

    if (!started) return;

    if (
      rules.isTerminal(state)
    ) {
      return;
    }


    const moves =
      rules.legalMoves(state);


    // --------------------------------------------------------
    // 合法手なし → 自動パス
    // --------------------------------------------------------

    if (moves.length === 0) {

      const timer =
        window.setTimeout(
          () => {

            setMessage(
              `${PLAYER_NAMES[state.turn]}はパス`
            );

            setState(
              rules.applyPass(state)
            );
          },
          500,
        );

      return () =>
        window.clearTimeout(timer);
    }


    // --------------------------------------------------------
    // 人間なら待つ
    // --------------------------------------------------------

    const setting =
      players[state.turn];

    if (
      setting.controller
      === "human"
    ) {

      setMessage(
        `${PLAYER_NAMES[state.turn]}の手番`
      );

      return;
    }


    // --------------------------------------------------------
    // CPU
    // --------------------------------------------------------

    setMessage(
      `${PLAYER_NAMES[state.turn]} CPU 思考中...`
    );


    const timer =
      window.setTimeout(
        () => {

          const cpu =
            createCpu(
              setting.cpuType,
              rules,
              analysis,
              MAXN_DEPTH,
            );

          const move =
            cpu.chooseMove(state);


          // 念のため
          if (move < 0) {

            setState(
              rules.applyPass(state)
            );

            return;
          }


          setState(
            rules.applyMove(
              state,
              move,
            )
          );
        },
        300,
      );


    return () =>
      window.clearTimeout(timer);

  }, [
    state,
    started,
    players,
    rules,
    analysis,
  ]);


  // ==========================================================
  // 終局メッセージ
  // ==========================================================

  useEffect(() => {

    if (
      !started ||
      !terminal
    ) {
      return;
    }

    const finalScores =
      rules.scores(state);

    const max =
      Math.max(...finalScores);

    const winners =
      finalScores
        .map(
          (score, i) => ({
            score,
            i,
          })
        )
        .filter(
          (x) =>
            x.score === max
        )
        .map(
          (x) =>
            PLAYER_NAMES[x.i]
        );


    if (
      winners.length === 1
    ) {

      setMessage(
        `ゲーム終了：${winners[0]}の勝利`
      );

    } else {

      setMessage(
        `ゲーム終了：${winners.join("・")}の引き分け`
      );
    }

  }, [
    terminal,
    started,
    state,
    rules,
  ]);


  // ==========================================================
  // 画面
  // ==========================================================

  return (

    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "24px",
        fontFamily: "sans-serif",
      }}
    >

      <h1>
        HONOTHELLO
      </h1>


      {/* ====================================================
          プレイヤー設定
          ==================================================== */}

      {!started && (

        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "24px",
          }}
        >

          {players.map(
            (player, index) => (

              <div
                key={index}
                style={{
                  border:
                    "1px solid #cccccc",
                  borderRadius: "8px",
                  padding: "16px",
                  minWidth: "200px",
                }}
              >

                <h3>
                  {PLAYER_NAMES[index]}
                </h3>


                <div>
                  <label>
                    プレイヤー
                  </label>

                  <br />

                  <select
                    value={
                      player.controller
                    }
                    onChange={(e) =>
                      changeController(
                        index,
                        e.target.value as Controller,
                      )
                    }
                  >

                    <option value="human">
                      人間
                    </option>

                    <option value="cpu">
                      CPU
                    </option>

                  </select>
                </div>


                {player.controller
                  === "cpu" && (

                    <div
                      style={{
                        marginTop: "12px",
                      }}
                    >

                      <label>
                        アルゴリズム
                      </label>

                      <br />

                      <select
                        value={
                          player.cpuType
                        }
                        onChange={(e) =>
                          changeCpuType(
                            index,
                            e.target.value as CpuType,
                          )
                        }
                      >

                        <option value="random">
                          ランダム
                        </option>

                        <option value="maxn-stone">
                          Maxⁿ（石数）
                        </option>

                        <option value="maxn-path">
                          Maxⁿ（勝利経路）
                        </option>

                      </select>

                    </div>
                  )}

              </div>
            )
          )}

        </div>
      )}


      {/* ====================================================
          開始 / リセット
          ==================================================== */}

      {!started ? (

        <button
          onClick={startGame}
          style={{
            padding:
              "10px 24px",
            fontSize: "16px",
          }}
        >
          ゲーム開始
        </button>

      ) : (

        <button
          onClick={resetGame}
          style={{
            padding:
              "8px 18px",
          }}
        >
          設定に戻る
        </button>
      )}


      {/* ====================================================
          ゲーム情報
          ==================================================== */}

      {started && (

        <>

          <hr
            style={{
              margin: "24px 0",
            }}
          />


          <h2>
            {message}
          </h2>


          <div
            style={{
              display: "flex",
              gap: "24px",
              marginBottom: "24px",
            }}
          >

            <strong>
              黒：{scores[0]}
            </strong>

            <strong>
              白：{scores[1]}
            </strong>

            <strong>
              赤：{scores[2]}
            </strong>

          </div>


          {/* ================================================
            六角形盤面
          ================================================ */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "20px",
            }}
          >
            <svg
              width={600}
              height={420}
            >

              {Array.from(
                { length: rules.cellCount },
                (_, cell) => {

                  const x =
                    rules.xs[cell];

                  const y =
                    rules.ys[cell];

                  const value =
                    state.cells[cell];

                  const { px, py } =
                    hexToPixel(
                      x,
                      y,
                      36,
                    );

                  const legal =
                    !terminal &&
                    currentSetting.controller === "human" &&
                    legalMoves.includes(cell);


                  return (

                    <g
                      key={cell}
                      onClick={() => {
                        if (legal) {
                          humanMove(cell);
                        }
                      }}
                      style={{
                        cursor:
                          legal
                            ? "pointer"
                            : "default",
                      }}
                    >

                      {/* 六角形 */}
                      <polygon
                        points={
                          hexPoints(
                            px,
                            py,
                            36,
                          )
                        }
                        fill="#4f9b55"
                        stroke="#222"
                        strokeWidth={2}
                      />


                      {/* 石 */}
                      {value !== 0 && (

                        <circle
                          cx={px}
                          cy={py}
                          r={23}

                          fill={
                            PLAYER_COLORS[
                            value - 1
                            ]
                          }

                          stroke="#222"
                          strokeWidth={2}
                        />

                      )}


                      {/* 合法手 */}
                      {value === 0 &&
                        legal && (

                          <circle
                            cx={px}
                            cy={py}
                            r={7}
                            fill="#8fd3ff"
                          />

                        )}


                      {/* 座標確認用
            <text
              x={px}
              y={py + 5}
              textAnchor="middle"
              fontSize="11"
            >
              {x},{y}
            </text>
            */}

                    </g>
                  );
                }
              )}

            </svg>
          </div>


          {/* ================================================
              現在の設定
              ================================================ */}

          <div
            style={{
              marginTop: "28px",
              padding: "12px",
              background:
                "#f2f2f2",
            }}
          >

            {players.map(
              (player, i) => (

                <div key={i}>

                  {PLAYER_NAMES[i]}
                  {" : "}

                  {player.controller
                    === "human"
                    ? "人間"
                    : cpuLabel(
                      player.cpuType
                    )}

                </div>
              )
            )}

          </div>

        </>
      )}

    </div>
  );
}


// ============================================================
// CPU名表示
// ============================================================

function cpuLabel(
  type: CpuType,
): string {

  switch (type) {

    case "random":
      return "CPU / ランダム";

    case "maxn-stone":
      return "CPU / Maxⁿ（石数）";

    case "maxn-path":
      return "CPU / Maxⁿ（勝利経路）";
  }
}