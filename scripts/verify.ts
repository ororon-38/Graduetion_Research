import { HexRules } from "./src/game/rules";
import { Analysis, fold4 } from "./src/game/analysis";

const rules = new HexRules(6);
const init = rules.initialState();
console.log("cells", rules.cellCount, "legal(initial)", rules.legalMoves(init).map(i=>`(${rules.xs[i]},${rules.ys[i]})`).join(" "));

for (const dedupe of [true, false]) {
  const t = Date.now();
  const a = new Analysis(rules, init, { dedupeEdges: dedupe });
  console.log(`\ndedupe=${dedupe}  nodes=${a.nodeCount} edgesMulti=${a.edgeCountMulti} edgesUnique=${a.edgeCountUnique}  (${Date.now()-t}ms)`);
  const root = fold4(a.pathsById(0));
  console.log("root [B,W,R,D]=", root, "total=", root.reduce((x,y)=>x+y,0));
  for (const m of rules.legalMoves(init)) {
    const cid = a.idOf(rules.applyMove(init, m))!;
    const f = fold4(a.pathsById(cid));
    console.log(`  (${rules.xs[m]},${rules.ys[m]}) ${f.join("/")} 計${f.reduce((x,y)=>x+y,0)}`);
  }
}
