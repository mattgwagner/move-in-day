// Fuzzes the lot maths. Random wall/fence layouts go into the page; this file finds the rooms and gardens
// again with its own union-find and edge counting and fails if the page disagrees on any region, area,
// fence count, door or window count or shape (rectangle, L, T, U). A garden may lean on walls (every edge
// bounds it) but needs a fence piece, and only fence and gate pieces count. Then every wish from many seeds is built here (independently) inside the lot
// as it is when that friend arrives, and the page has to say the wish is met; the same build with the door or a
// fence piece missing, or with the wrong number of tiles/fence pieces, has to be refused. Usage: node e2e/fuzz.mjs [layouts] [seeds]
import { launch, pageUrl } from "./pw.mjs";
const NL = +process.argv[2] || 400, NS = +process.argv[3] || 200;
const browser = await launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto(pageUrl("?debug"));
await page.waitForFunction(() => window.__mid);
const { WW, WH } = await page.evaluate(() => __mid.dims);
const NORDER = await page.evaluate(() => __mid.order.length);
const fails = [];
let nFails = 0;
const fail = (why, data) => { nFails++; if (fails.length < 30) fails.push({ why, data }); };
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const lots = await page.evaluate(n => Array.from({ length: n + 1 }, (_, i) => __mid.lotAfter(i)), NORDER);

/* ---------- independent region finder: union-find over tiles */
// Rooms are closed in by walls, doors and windows. Gardens by anything (a fence can lean on a wall), but a garden
// needs at least one fence or gate piece, and only those are its pieces.
function solve(lot, hw, vw, kind) {
  const bound = kind === "room" ? v => v === 1 || v === 2 || v === 3 : v => v >= 1 && v <= 5;
  const par = new Map(), find = a => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
  const tiles = [];
  for (let y = lot.y0; y < lot.y1; y++) for (let x = lot.x0; x < lot.x1; x++) { const i = y * WW + x; par.set(i, i); tiles.push(i); }
  const OUT = -1; par.set(OUT, OUT);
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) par.set(a, b); };
  const inside = (x, y) => x >= lot.x0 && x < lot.x1 && y >= lot.y0 && y < lot.y1;
  for (const i of tiles) {
    const x = i % WW, y = Math.floor(i / WW);
    // right neighbour across vertical edge x+1; down neighbour across horizontal edge y+1; plus the lot border
    if (!bound(vw[y * (WW + 1) + x + 1])) union(i, inside(x + 1, y) ? i + 1 : OUT);
    if (!bound(hw[(y + 1) * WW + x])) union(i, inside(x, y + 1) ? i + WW : OUT);
    if (x === lot.x0 && !bound(vw[y * (WW + 1) + x])) union(i, OUT);
    if (y === lot.y0 && !bound(hw[y * WW + x])) union(i, OUT);
  }
  const groups = new Map();
  for (const i of tiles) { const r = find(i); if (r === find(OUT)) continue; (groups.get(r) || groups.set(r, []).get(r)).push(i); }
  return [...groups.values()].map(ts => {
    const set = new Set(ts), edges = new Map();
    for (const i of ts) {
      const x = i % WW, y = Math.floor(i / WW);
      for (const [k, v] of [["h" + x + "," + y, hw[y * WW + x]], ["h" + x + "," + (y + 1), hw[(y + 1) * WW + x]], ["v" + x + "," + y, vw[y * (WW + 1) + x]], ["v" + (x + 1) + "," + y, vw[y * (WW + 1) + x + 1]]]) if (bound(v)) edges.set(k, v);
    }
    const vals = [...edges.values()], count = v => vals.filter(q => q === v).length;
    return { key: ts.sort((a, b) => a - b).join(","), area: ts.length, pieces: kind === "room" ? edges.size : count(4) + count(5), doors: count(kind === "room" ? 2 : 5), windows: count(3), set, shape: shapeName(ts) };
  }).filter(g => kind === "room" || g.pieces > 0);
}
/**
 * Names a set of tiles by its rows, turned each of the four ways: "rect", "L" (full rows under rows that stop
 * short of the right), "T" (full rows over rows of one middle run), "U" (rows with a middle gap over full rows), or "".
 */
function shapeName(ts) {
  let pts = ts.map(i => [i % WW, Math.floor(i / WW)]);
  for (let turn = 0; turn < 4; turn++) {
    const mx = Math.min(...pts.map(p => p[0])), my = Math.min(...pts.map(p => p[1]));
    pts = pts.map(([x, y]) => [x - mx, y - my]);
    const W = Math.max(...pts.map(p => p[0])) + 1, H = Math.max(...pts.map(p => p[1])) + 1;
    const rows = Array.from({ length: H }, () => new Array(W).fill(0));
    for (const [x, y] of pts) rows[y][x] = 1;
    const sig = rows.map(r => r.join("")), full = "1".repeat(W);
    if (sig.every(r => r === full)) return "rect";
    for (let k = 1; k < H; k++) {
      const top = sig.slice(0, k), bot = sig.slice(k), same = a => a.every(r => r === a[0]);
      if (!same(top) || !same(bot)) continue;
      const t = top[0], b = bot[0];
      if (b === full && /^1+0+$/.test(t)) return "L";
      if (t === full && /^0+1+0+$/.test(b)) return "T";
      if (b === full && /^1+0+1+$/.test(t)) return "U";
    }
    pts = pts.map(([x, y]) => [H - 1 - y, x]); // a quarter turn
  }
  return "";
}

/* ---------- 1. random layouts */
const shapeSeen = {};
for (let n = 0; n < NL; n++) {
  const lot = lots[ri(0, NORDER)];
  const hw = new Array(WW * (WH + 1)).fill(0), vw = new Array((WW + 1) * WH).fill(0);
  const setH = (x, y, v) => { if (x >= lot.x0 && x < lot.x1 && y >= lot.y0 && y <= lot.y1) hw[y * WW + x] = v; };
  const setV = (x, y, v) => { if (y >= lot.y0 && y < lot.y1 && x >= lot.x0 && x <= lot.x1) vw[y * (WW + 1) + x] = v; };
  const pickType = fence => fence ? (rnd() < 0.1 ? 5 : 4) : [1, 1, 1, 1, 2, 3][ri(0, 5)];
  const rects = ri(1, 6);
  for (let k = 0; k < rects; k++) {
    const fence = rnd() < 0.3, w = ri(1, 10), h = ri(1, 8), x = ri(lot.x0 - 2, lot.x1 - 1), y = ri(lot.y0 - 2, lot.y1 - 1);
    for (let i = 0; i < w; i++) { setH(x + i, y, pickType(fence)); setH(x + i, y + h, pickType(fence)); }
    for (let j = 0; j < h; j++) { setV(x, y + j, pickType(fence)); setV(x + w, y + j, pickType(fence)); }
    if (rnd() < 0.3) for (let i = 0; i < w; i++) if (rnd() < 0.4) setH(x + i, y, 0); // gaps
  }
  for (let k = 0; k < ri(0, 8); k++) { if (rnd() < 0.5) setH(ri(lot.x0, lot.x1 - 1), ri(lot.y0, lot.y1), pickType(rnd() < 0.3)); else setV(ri(lot.x0, lot.x1), ri(lot.y0, lot.y1 - 1), pickType(rnd() < 0.3)); }
  const got = await page.evaluate(L => { __mid.setLayout(L); return { rooms: __mid.rooms(), gardens: __mid.gardens() }; }, { lot, hw, vw });
  for (const [kind, list] of [["room", got.rooms], ["garden", got.gardens]]) {
    const mine = solve(lot, hw, vw, kind);
    const byKey = new Map(mine.map(r => [r.key, r]));
    if (mine.length !== list.length) fail(`${kind} count: page ${list.length}, fuzz ${mine.length}`, { n });
    for (const r of list) {
      const m = byKey.get(r.tiles.join(","));
      if (!m) { fail(`${kind} the page found is not a region here`, { n, area: r.area }); continue; }
      if (m.area !== r.area) fail(`${kind} area ${r.area} vs ${m.area}`, { n });
      if (kind === "garden" && m.pieces !== r.fence) fail(`garden fence ${r.fence} vs ${m.pieces}`, { n });
      if (kind === "room" && m.doors !== r.doors) fail(`room doors ${r.doors} vs ${m.doors}`, { n });
      if (kind === "room" && m.windows !== r.windows) fail(`room windows ${r.windows} vs ${m.windows}`, { n });
      if (kind === "room") {
        // shape: rectangle iff area equals its bounding box
        const xs = [...m.set].map(i => i % WW), ys = [...m.set].map(i => Math.floor(i / WW));
        const box = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
        if ((box === m.area) !== r.rect) fail("rectangle flag wrong", { n, area: m.area, box });
        shapeSeen[m.shape || "other"] = (shapeSeen[m.shape || "other"] || 0) + 1;
        for (const sh of ["L", "T", "U"]) if ((m.shape === sh) !== r["is" + sh]) fail(`${sh} flag: page ${r["is" + sh]}, fuzz ${m.shape}`, { n, tiles: m.key });
      }
    }
  }
}
console.log(fails.length ? "FAIL" : "ok  ", `room and garden detection over ${NL} random layouts`);

/* ---------- 1b. shapes: random rooms walled round a union of a few rectangles, named here and by the page */
{
  const lot = lots[NORDER], f0 = nFails, seen = {};
  for (let n = 0; n < 500; n++) {
    const hw = new Array(WW * (WH + 1)).fill(0), vw = new Array((WW + 1) * WH).fill(0), set = new Set();
    // half of them are a T, U or L made on purpose (turned any way), the rest a pile of 1–3 rectangles
    const add = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set.add(y * WW + x); };
    const bx = 20, by = 20;
    if (n % 2) {
      const W = ri(3, 8), H = ri(2, 7), k = ri(1, H - 1), a = ri(1, W - 2), b = ri(a + 1, W - 1), kind = ["T", "U", "L"][n % 3];
      const grid = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const inTop = y < k;
        const on = kind === "T" ? (inTop || (x >= a && x < b)) : kind === "U" ? (!inTop || x < a || x >= b) : (!inTop || x < a);
        if (on) grid.push([x, y]);
      }
      const turn = ri(0, 3);
      for (let [x, y] of grid) { for (let t = 0; t < turn; t++) [x, y] = [H + W - y, x]; add(bx + x, by + y, 1, 1); }
    } else for (let k = ri(1, 3); k > 0; k--) add(bx + ri(0, 6), by + ri(0, 6), ri(1, 5), ri(1, 5));
    for (const i of set) { const x = i % WW, y = Math.floor(i / WW); if (!set.has(i - WW)) hw[y * WW + x] = 1; if (!set.has(i + WW)) hw[(y + 1) * WW + x] = 1; if (!set.has(i - 1)) vw[y * (WW + 1) + x] = 1; if (!set.has(i + 1)) vw[y * (WW + 1) + x + 1] = 1; }
    const got = await page.evaluate(L => { __mid.setLayout(L); return __mid.rooms(); }, { lot, hw, vw });
    for (const m of solve(lot, hw, vw, "room")) {
      const r = got.find(q => q.tiles.join(",") === m.key);
      if (!r) { fail("shape room missing", { n }); continue; }
      seen[m.shape || "other"] = (seen[m.shape || "other"] || 0) + 1;
      for (const sh of ["L", "T", "U"]) if ((m.shape === sh) !== r["is" + sh]) fail(`shape ${sh}: page ${r["is" + sh]}, fuzz ${m.shape || "other"}`, { n, tiles: m.key });
      if ((m.shape === "rect") !== r.rect) fail("shape rect flag", { n });
    }
  }
  console.log(nFails > f0 ? "FAIL" : "ok  ", `L/T/U/rectangle named the same way by the page and here over 500 shapes (${Object.entries(seen).map(([k, v]) => `${v} ${k}`).join(", ")})`);
}

/* ---------- 1c. gardens can lean on a wall; a room walled all round is never a garden */
{
  const lot = lots[NORDER], f0 = nFails;
  for (let n = 0; n < 60; n++) {
    const hw = new Array(WW * (WH + 1)).fill(0), vw = new Array((WW + 1) * WH).fill(0);
    const H = (x, y, v) => hw[y * WW + x] = v, V = (x, y, v) => vw[y * (WW + 1) + x] = v;
    const x0 = 10, y0 = 10, rw = ri(2, 7), rh = ri(2, 6);
    for (let x = x0; x < x0 + rw; x++) { H(x, y0, 1); H(x, y0 + rh, 1); }
    for (let y = y0; y < y0 + rh; y++) { V(x0, y, 1); V(x0 + rw, y, 1); }
    H(x0 + ri(0, rw - 1), y0 + rh, 2);
    // a platform on the room's east wall: fence on its other three sides (a gate now and then)
    const pw = ri(1, 6), ph = ri(1, rh), py = y0 + ri(0, rh - ph);
    const fenceType = () => (rnd() < 0.15 ? 5 : 4);
    for (let x = x0 + rw; x < x0 + rw + pw; x++) { H(x, py, fenceType()); H(x, py + ph, fenceType()); }
    for (let y = py; y < py + ph; y++) V(x0 + rw + pw, y, fenceType());
    const want = 2 * pw + ph;
    const gap = rnd() < 0.25; if (gap) H(x0 + rw, py, 0);
    const mine = solve(lot, hw, vw, "garden");
    const got = await page.evaluate(L => { __mid.setLayout(L); return { gardens: __mid.gardens(), rooms: __mid.rooms() }; }, { lot, hw, vw });
    if (gap) { if (mine.length || got.gardens.length) fail("a platform with a gap in its fence is a garden", { n }); continue; }
    if (mine.length !== 1 || mine[0].pieces !== want || mine[0].area !== pw * ph) fail(`fuzz: leaning platform ${pw}×${ph} should be one garden of ${want} pieces`, { n, mine: mine.map(g => [g.area, g.pieces]) });
    if (got.gardens.length !== 1 || got.gardens[0].fence !== want || got.gardens[0].area !== pw * ph) fail(`page: leaning platform ${pw}×${ph} should be one garden of ${want} pieces`, { n, got: got.gardens.map(g => [g.area, g.fence]) });
    if (got.rooms.length !== 1 || got.rooms[0].area !== rw * rh) fail("page: the station room changed", { n });
    // the walled room alone (no fence anywhere) is a room and never a garden
    const alone = await page.evaluate(L => { __mid.setLayout(L); return __mid.gardens().length; }, { lot, hw: hw.map(v => v === 4 || v === 5 ? 0 : v), vw: vw.map(v => v === 4 || v === 5 ? 0 : v) });
    if (alone) fail("a room walled all round counts as a garden", { n });
  }
  console.log(nFails > f0 ? "FAIL" : "ok  ", "60 platforms leaning on a wall are gardens with only their fence counted; a gap or no fence at all is not a garden");
}

/* ---------- 2. every wish can be built inside the lot it arrives on */
// Each wish is split into parts (a room or a garden) and every part is built here, side by side along the
// bottom of the lot, then counted again with solve() before the page is asked. Two-part wishes: "pair" is two
// rooms whose floor tiles add up to `total`, "combo" is a room and a garden at once.
const defs = await page.evaluate(() => __mid.furnDefs());
const NUMBER_WORDS = /\b(area|perimeter|multiply|equation|square units?|add|plus|sum|total)\b/i;
let wishFails = 0, refused = 0, leaned = 0;
/** Splits a wish into the parts that have to be built. `lean`: the Conductor's platform shares the station's east wall (every other seed). */
function partsOf(w, maxW, maxH, lean = false) {
  if (w.kind === "garden") return [{ kind: "garden", fence: w.fence, area: w.area, items: w.items }];
  if (w.kind === "combo") return [{ kind: "room", area: w.area, items: {} }, { kind: "garden", fence: w.fence, items: {}, lean }];
  if (w.kind === "pair") {
    for (let a = 4; a <= w.total - 4; a++) { const p = [{ kind: "room", area: a, items: {} }, { kind: "room", area: w.total - a, items: {} }]; if (p.every(q => shapeOf(q, maxW, maxH))) return p; }
    return null;
  }
  return [{ kind: "room", area: w.area, shape: w.shape, doors: w.doors, windows: w.windows, items: w.items }];
}
/**
 * A W×H box with rectangles [x, y, w, h] cut out of it that makes this part, or null. L: the top-right corner;
 * T: both bottom corners (a bar over a stem); U: a notch down from the top. A leaning garden (`against` = the
 * station's height) is fenced on three sides: 2W + H pieces.
 */
function shapeOf(p, maxW, maxH, against = 0) {
  if (p.kind === "garden" && against) { for (let H = Math.min(against, maxH); H >= 1; H--) { const W = (p.fence - H) / 2; if (Number.isInteger(W) && W >= 2 && W <= maxW) return { W, H, cut: [], lean: true }; } return null; }
  if (p.kind === "garden") { for (let a = 2; a <= p.fence / 2 - 2; a++) { const b = p.fence / 2 - a; if (b >= 2 && a <= maxW && b <= maxH && (p.area == null || a * b === p.area)) return { W: a, H: b, cut: [] }; } return null; }
  if (p.shape === "L") { for (let W = 4; W <= maxW; W++) for (let H = 4; H <= maxH; H++) for (let cw = 1; cw < W - 1; cw++) for (let ch = 1; ch < H - 1; ch++) if (W * H - cw * ch === p.area) return { W, H, cut: [[W - cw, 0, cw, ch]] }; return null; }
  if (p.shape === "T") { for (let W = 3; W <= maxW; W++) for (let H = 2; H <= maxH; H++) for (let bar = 1; bar < H; bar++) for (let left = 1; left < W - 1; left++) for (let right = 1; left + right < W; right++) if (W * H - (left + right) * (H - bar) === p.area && left + right <= W - 2) return { W, H, cut: [[0, bar, left, H - bar], [W - right, bar, right, H - bar]] }; return null; }
  if (p.shape === "U") { for (let W = 3; W <= maxW; W++) for (let H = 2; H <= maxH; H++) for (let nx = 1; nx < W - 1; nx++) for (let nw = 1; nx + nw < W; nw++) for (let nd = 1; nd < H; nd++) if (W * H - nw * nd === p.area) return { W, H, cut: [[nx, 0, nw, nd]] }; return null; }
  if (p.area == null) return { W: 5, H: 4, cut: [] };
  let best = null;
  for (let a = 2; a <= maxW; a++) if (p.area % a === 0 && p.area / a >= 2 && p.area / a <= maxH) { const c = { W: a, H: p.area / a, cut: [] }; if (!best || Math.abs(c.W - c.H) < Math.abs(best.W - best.H)) best = c; }
  return best;
}
/** Builds the parts side by side along the bottom of the lot. Returns the edges, furniture and where each part's door / first fence piece is. */
function buildParts(parts, lot, maxW, maxH, bad) {
  const hw = new Array(WW * (WH + 1)).fill(0), vw = new Array((WW + 1) * WH).fill(0), furn = [], taken = new Set();
  let x0 = lot.x0 + 1, ok = true, prevH = 0;
  const built = [];
  for (const part of parts) {
    const shape = shapeOf(part, maxW, maxH, part.lean ? prevH : 0);
    if (!shape) { bad(`no ${part.kind} shape fits a ${maxW}×${maxH} lot`); ok = false; break; }
    if (shape.lean) x0 -= 2; // right up against the room just built
    const y0 = lot.y1 - shape.H - 1, X1 = x0 + shape.W, Y1 = y0 + shape.H;
    if (X1 > lot.x1 - 1) { bad(`parts don't fit side by side in ${maxW} columns`); ok = false; break; }
    const T = part.kind === "garden" ? 4 : 1;
    // the tiles, then a wall (or fence) on every side of them that faces out
    const set = new Set();
    for (let y = y0; y < Y1; y++) for (let x = x0; x < X1; x++) if (!shape.cut.some(([cx, cy, cw, ch]) => x - x0 >= cx && x - x0 < cx + cw && y - y0 >= cy && y - y0 < cy + ch)) set.add(y * WW + x);
    for (let y = y0; y < Y1; y++) for (let x = x0; x < X1; x++) if (!set.has(y * WW + x)) taken.add(y * WW + x);
    const sides = []; // [array, index, which side of the shape]
    for (const i of set) {
      const x = i % WW, y = Math.floor(i / WW);
      if (!set.has(i - WW)) sides.push([hw, y * WW + x, "top"]);
      if (!set.has(i + WW)) sides.push([hw, (y + 1) * WW + x, "bottom"]);
      if (!set.has(i - 1)) sides.push([vw, y * (WW + 1) + x, "left"]);
      if (!set.has(i + 1)) sides.push([vw, y * (WW + 1) + x + 1, "right"]);
    }
    for (const [arr, i, side] of sides) if (!(shape.lean && side === "left")) arr[i] = T; // a leaning platform's west side is the station wall
    let door = -1;
    if (part.kind === "room") {
      // the front door on the bottom wall, then the other doors and the windows on the rest, in order
      const bottom = sides.filter(q => q[2] === "bottom" && Math.floor(q[1] / WW) === Y1).sort((a, b) => a[1] - b[1]);
      door = bottom[0][1]; hw[door] = 2;
      const rest = sides.filter(q => q[1] !== door || q[0] !== hw);
      const extra = [...Array(Math.max(0, (part.doors || 1) - 1)).fill(2), ...Array(part.windows || 0).fill(3)];
      if (extra.length > rest.length) { bad(`no wall for ${extra.length} more doors and windows`); ok = false; }
      extra.forEach((v, k) => { const [arr, i] = rest[Math.floor(k * rest.length / extra.length)]; arr[i] = v; });
    }
    // items row by row, left to right, never in the cut corner or across the walls
    for (const k of Object.entries(part.items).flatMap(([k, n]) => Array(n).fill(k))) {
      let placed = false;
      for (let r = 0; r < 2 && !placed; r++) {
        const fw = r ? defs[k].h : defs[k].w, fh = r ? defs[k].w : defs[k].h;
        for (let y = y0; y + fh <= Y1 && !placed; y++) for (let x = x0; x + fw <= X1 && !placed; x++) {
          let free = true; for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) if (taken.has((y + j) * WW + x + i)) free = false;
          if (!free) continue;
          for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) taken.add((y + j) * WW + x + i);
          furn.push({ k, x, y, r }); placed = true;
        }
      }
      if (!placed) { bad(`no room for ${k} in ${shape.W}×${shape.H}`); ok = false; }
    }
    built.push({ part, door, side: part.kind === "garden" ? y0 * WW + x0 : -1, lean: !!shape.lean });
    x0 = X1 + 2; prevH = shape.H;
  }
  return ok ? { hw, vw, furn, built } : null;
}
/** The same wish with its number(s) nudged so the right answer is a different build. */
function nudge(w, maxW, maxH) {
  const fits = p => shapeOf(p, maxW, maxH);
  if (w.kind === "pair") return { ...w, total: w.total + 1 };
  if (w.kind === "garden" && w.area != null) { for (let a = 2; a <= w.fence / 2 - 2; a++) { const b = w.fence / 2 - a; if (b >= 2 && a * b !== w.area && a <= maxW && b <= maxH) return { ...w, area: a * b }; } return { ...w, fence: w.fence + 2, area: null }; }
  if (w.kind === "garden") return { ...w, fence: w.fence + 2 };
  if (w.doors != null) return { ...w, doors: w.doors + 1 };
  if (w.windows != null) return { ...w, windows: w.windows - 1 };
  if (w.area == null) return null;
  for (const d of [1, -1, 2, -2, 3, -3, 4, -4]) { const p = { kind: "room", area: w.area + d, shape: w.shape }; if (w.area + d >= 4 && fits(p)) return { ...w, area: w.area + d }; }
  return null;
}
for (let s = 1; s <= NS; s++) {
  const wishes = await page.evaluate(sd => __mid.sampleWishes(sd), s * 7919);
  for (const w of wishes) {
    const bad = why => { wishFails++; fail(`seed ${s * 7919} ${w.id}: ${why}`, { say: w.say }); };
    const says = n => w.say.toLowerCase().includes(`exactly ${n} `);
    if (NUMBER_WORDS.test(w.say)) bad("teacher words in the wish");
    if (w.area != null) { if (w.area < 6 || w.area > 48) bad(`area ${w.area} out of 6–48`); if (!says(w.area)) bad("the tile number isn't in the words"); }
    if (w.fence != null) { if (w.fence < 10 || w.fence > 36 || w.fence % 2) bad(`fence ${w.fence} must be even, 10–36`); if (!says(w.fence)) bad("the fence number isn't in the words"); }
    if (w.kind === "pair") { if (w.total < 12 || w.total > 48) bad(`total ${w.total} out of 12–48`); if (!says(w.total)) bad("the number isn't in the words"); }
    if (w.kind === "garden" && w.fence == null) bad("garden without a fence count");
    if (w.kind === "combo" && (w.area == null || w.fence == null)) bad("combo needs both numbers");
    if (w.doors != null) { if (w.doors < 2 || w.doors > 4) bad(`doors ${w.doors} out of 2–4`); if (!says(w.doors)) bad("the door number isn't in the words"); }
    if (w.windows != null) { if (w.windows < 3 || w.windows > 6) bad(`windows ${w.windows} out of 3–6`); if (!says(w.windows)) bad("the window number isn't in the words"); }
    if (w.shape && !w.say.includes(`like ${w.shape === "L" ? "an" : "a"} ${w.shape}`)) bad(`the ${w.shape} shape isn't in the words`);
    const lot = w.lot, maxW = lot.x1 - lot.x0 - 2, maxH = lot.y1 - lot.y0 - 2;
    const parts = partsOf(w, maxW, maxH, s % 2 === 0);
    if (!parts) { bad(`can't split into two rooms that fit a ${maxW}×${maxH} lot`); continue; }
    const B = buildParts(parts, lot, maxW, maxH, bad);
    if (!B) continue;
    const { hw, vw, furn, built } = B;
    // independent count before asking the page
    for (const kind of ["room", "garden"]) {
      const mine = solve(lot, hw, vw, kind), want = parts.filter(p => p.kind === kind);
      if (mine.length !== want.length) { bad(`built ${mine.length} ${kind}s, wanted ${want.length}`); continue; }
      want.forEach((p, i) => { const m = mine.find(r => (p.area == null || r.area === p.area) && (p.fence == null || r.pieces === p.fence) && (!p.shape || r.shape === p.shape) && (p.doors == null || r.doors === p.doors) && (p.windows == null || r.windows === p.windows)); if (!m) bad(`built ${kind} ${i} the wrong size, shape or count`); });
    }
    if (w.kind === "pair" && solve(lot, hw, vw, "room").reduce((n, r) => n + r.area, 0) !== w.total) bad("the two rooms don't make the total");
    if (built.some(b => b.lean)) leaned++;
    const L = { lot, hw, vw, furn };
    if (!(await page.evaluate(([L, w]) => { __mid.setLayout(L); return __mid.checkWish(w); }, [L, w]))) bad(`page says a built ${w.kind} doesn't grant it (${JSON.stringify(parts)})`);
    // and the same build with one thing broken must be refused: the first room loses its door, or the first garden its first fence piece
    const room = built.find(b => b.door >= 0), yard = built.find(b => b.side >= 0);
    const broken = { lot, hw: hw.slice(), vw: vw.slice(), furn };
    if (room) broken.hw[room.door] = 1; else broken.hw[yard.side] = 0;
    if (await page.evaluate(([L, w]) => { __mid.setLayout(L); return __mid.checkWish(w); }, [broken, w])) bad(`page grants it with ${room ? "a room with no door" : "a gap in the fence"}`);
    else refused++;
    // the right kind of build with the wrong number (for Andy: the same fence, another shape) must be refused too
    const w2 = nudge(w, maxW, maxH);
    if (w2) {
      const B2 = buildParts(partsOf(w2, maxW, maxH) || [], lot, maxW, maxH, () => {});
      if (B2 && await page.evaluate(([L, w]) => { __mid.setLayout(L); return __mid.checkWish(w); }, [{ lot, hw: B2.hw, vw: B2.vw, furn: B2.furn }, w])) bad(`page grants it with ${JSON.stringify({ area: w2.area, fence: w2.fence, total: w2.total, doors: w2.doors, windows: w2.windows })}`);
      else if (B2) refused++;
    }
  }
}
console.log(wishFails ? "FAIL" : "ok  ", `every wish (all ${NORDER} friends) over ${NS} seeds is in range and buildable in its lot (${leaned} platforms leaning on the station wall), and ${refused} broken builds are refused`);


await browser.close();
for (const f of fails) console.log("  ", f.why, JSON.stringify(f.data));
if (errors.length) console.log("page errors:", errors.slice(0, 5));
process.exit(fails.length || errors.length ? 1 : 0);
