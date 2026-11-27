// Plays the game headless on a desktop-size window (1920×1080) with the mouse: names a player, waits for the
// first friend's wish, draws the room by real drags, adds a door, paints the floor, places a bed, sees the
// move-in and the lot grow, runs a night, checks undo depth and the keys, reloads to check the save, then
// stages every ?test=, plays as a friend (keys, pad, Use, building while driving, let go) and takes
// 1366×768 shots to prove the toolbar and the controls card fit. Usage: node e2e/play.mjs [shotsDir]
import { launch, pageUrl } from "./pw.mjs";
import { mkdirSync } from "node:fs";
const out = process.argv[2] || new URL("../shots", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
const watch = p => { p.on("pageerror", e => errors.push(e.message)); p.on("console", m => m.type() === "error" && !/fonts\.g|ERR_FILE_NOT_FOUND|net::/.test(m.text()) && errors.push(m.text())); };
let failed = false;
const check = (ok, what) => { if (!ok) { console.log("FAIL", what); failed = true; } else console.log("ok  ", what); };
const page = await ctx.newPage(); watch(page);
const ev = (f, a) => page.evaluate(f, a);
const M = page.mouse;
/** A real mouse drag between two screen points, in small steps. */
async function dragPx([x1, y1], [x2, y2], steps = 12) { await M.move(x1, y1); await M.down(); await M.move(x2, y2, { steps }); await M.up(); }
const grid = (gx, gy) => ev(([a, b]) => __mid.gridXY(a, b), [gx, gy]);
const tile = (tx, ty) => ev(([a, b]) => __mid.tileXY(a, b), [tx, ty]);
const tool = name => page.click(`#tools button[data-tool="${name}"]`);
/** A real mouse drag through several screen points on page p. */
async function M_drag(p, pts) { await p.mouse.move(...pts[0]); await p.mouse.down(); for (const q of pts.slice(1)) await p.mouse.move(q[0], q[1], { steps: 12 }); await p.mouse.up(); }
/** Stuff is split into tabs: open the piece's tab, then click the piece. */
const pickFurn = async k => { await page.click(`#ptabs button[data-tab="${await ev(k => __mid.tabOf(k), k)}"]`); await page.click(`#palette button[data-k="${k}"]`); };

await page.goto(pageUrl("?debug&speed=4"));
await page.waitForFunction(() => window.__mid);
const { WW } = await ev(() => __mid.dims);
const ORDER = await ev(() => __mid.order);
const [L0, L1, LALL] = await ev(n => [__mid.lotAfter(0), __mid.lotAfter(1), __mid.lotAfter(n)], ORDER.length);
const oy = L0.y1 - 40; // rows added above wave one's 40-row lot
await page.screenshot({ path: `${out}/0-home.png` });
await page.click("#playBtn");
check(await page.textContent("#playersScr h2") === "Who am I?", 'the first-time name screen is headed "Who am I?"');
await page.fill("#plName", "Builder");
await page.click("#plDone");
await page.waitForSelector("#hud:not([hidden])");

// 1. The first friend walks up with a wish card
await page.waitForSelector("#wish:not([hidden])", { timeout: 15000 });
const w = await ev(() => __mid.wish);
check(w && w.who === "hoot" && w.kind === "room" && w.area >= 6 && w.area <= 12, `Hoot arrives with a wish for ${w && w.area} tiles`);
await page.screenshot({ path: `${out}/1-wish-card.png` });
await page.click("#wLater");

// zoom in on the build spot so drags are big and clear
await ev(y => { __mid.zoom(1.6); __mid.center(12, y); }, L0.y0 + 11);
let a = 2; for (let k = 2; k <= w.area; k++) if (w.area % k === 0 && w.area / k <= 6 && k <= 6 && Math.abs(k - w.area / k) <= Math.abs(a - w.area / a)) a = k;
const b = w.area / a, X0 = 8, Y0 = L0.y0 + 9, X1 = X0 + a, Y1 = Y0 + b;

// 2. Walls by four real drags
await tool("wall");
await dragPx(await grid(X0, Y0), await grid(X1, Y0));
await dragPx(await grid(X1, Y0), await grid(X1, Y1));
await dragPx(await grid(X1, Y1), await grid(X0, Y1));
await dragPx(await grid(X0, Y1), await grid(X0, Y0));
const rooms = await ev(() => __mid.rooms());
check(rooms.length === 1 && rooms[0].area === w.area, `drew a ${a}×${b} room by dragging (area ${rooms[0]?.area})`);

// the 💡 hint numbers the tiles along the room's edges
await page.click("#hintBtn"); await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/1b-hint.png` });
await page.click("#hintBtn");

// a wall run that lands on nothing new does nothing, and the room isn't granted without a door
check(!(await ev(() => __mid.check().ok)), "no door yet, so no move-in");

// 3. A door on the front wall
await tool("door");
const [dx, dy] = await grid(X0 + Math.floor(a / 2) + 0.5, Y1);
await M.click(dx, dy);
check((await ev(() => __mid.rooms()))[0]?.doors === 1, "door clicked onto the front wall");

// 4. Paint the floor by dragging across every row
await tool("floor");
await page.click('#palette button:nth-child(1)'); // wood
for (let y = Y0; y < Y1; y++) await dragPx(await tile(X0, y), await tile(X1 - 1, y), 6);
const wood = await ev(([x0, y0, x1, y1, ww]) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (__mid.state.floor[y * ww + x] === 1) n++; return n; }, [X0, Y0, X1, Y1, WW]);
check(wood === w.area, `painted ${wood} wood tiles`);

// 5. A bed, by clicking with the Stuff tool. The friend may already be moving in once the door went on.
await tool("furn");
await pickFurn("bed");
await M.move(...(await tile(X0, Y0)));
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/2-ghost-bed.png` });
// over the wall the ghost turns red and nothing is placed
await pickFurn("couch");
await M.move(...(await grid(X1, Y0 + 0.5)));
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/2b-ghost-blocked.png` });
const nBefore = await ev(() => __mid.state.furn.length);
await M.click(...(await grid(X1, Y0 + 0.5)));
check((await ev(() => __mid.state.furn.length)) === nBefore, "a couch across the wall is refused");
await pickFurn("bed");
await M.click(...(await tile(X0, Y0)));
check(await ev(() => __mid.state.furn.some(f => f.k === "bed")), "bed placed with a click");

// 6. Move-in: they walk in, the lot grows a strip
await page.waitForFunction(() => __mid.state.res.length === 1, null, { timeout: 15000 });
await ev(() => __mid.fit());
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/3-move-in-lot-grows.png` });
const after = await ev(() => ({ lot: __mid.state.lot, rares: __mid.state.rares, mover: __mid.state.mover }));
check(after.lot.x1 === L1.x1 && after.lot.y0 === L1.y0 && L1.x1 > L0.x1, `lot grew from ${L0.x1} to ${after.lot.x1} wide`);
check(after.rares.includes("perch") && after.mover === 1, "Hoot's rare piece granted, next friend queued");
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/3b-after-move-in.png` });

// 7. Run a night: residents go to bed or (Hoot) up on a wall
await ev(() => __mid.hour(21.5));
await page.waitForFunction(() => __mid.people.some(p => p.id === "hoot" && (p.act === "perch" || p.act === "sleep")), null, { timeout: 15000 });
check(true, "night: Hoot heads for a wall top or a bed");
await ev(([cx, cy]) => { __mid.zoom(2); __mid.center(cx, cy); }, [X0 + a / 2, Y0 + 1]);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/4-first-night.png` });
await ev(() => __mid.hour(7.6));
await page.waitForFunction(() => __mid.people.every(p => p.act !== "sleep" && p.act !== "perch"), null, { timeout: 15000 });
check(true, "morning: everyone up again");

// 8. Undo goes back at least 30 steps (31 single clicks of sand, then 31 undos)
await ev(() => __mid.fit());
const before = await ev(() => __mid.state.floor.join(""));
await tool("yard");
await page.click('#palette button:nth-child(3)'); // sand
const lotNow = await ev(() => __mid.state.lot);
for (let i = 0; i < 31; i++) await M.click(...(await tile(lotNow.x1 - 2 - (i % 8), lotNow.y0 + 2 + Math.floor(i / 8))));
check((await ev(() => __mid.undoDepth)) >= 31, "31 paint clicks = 31 undo steps");
for (let i = 0; i < 31; i++) await page.click("#undoBtn");
check((await ev(() => __mid.state.floor.join(""))) === before, "31 undos put every tile back");

// 9. Keys are extras: R turns the hovered piece, Ctrl+Z undoes it
await tool("furn");
await ev(y => { __mid.zoom(1.6); __mid.center(12, y); }, L0.y0 + 11);
await M.move(...(await tile(X0, Y0)));
const r0 = await ev(() => __mid.state.furn.find(f => f.k === "bed").r);
await page.keyboard.press("r");
const r1 = await ev(() => __mid.state.furn.find(f => f.k === "bed").r);
await page.keyboard.press("Control+z");
const r2 = await ev(() => __mid.state.furn.find(f => f.k === "bed").r);
check(r1 !== r0 && r2 === r0, "R rotates the piece under the mouse, Ctrl+Z puts it back");
// right-drag pans; the wheel zooms
const camA = await ev(() => __mid.gridXY(10, 30));
await M.move(900, 500); await M.down({ button: "right" }); await M.move(700, 400, { steps: 8 }); await M.up({ button: "right" });
const camB = await ev(() => __mid.gridXY(10, 30));
check(Math.abs(camB[0] - camA[0] + 200) < 3 && Math.abs(camB[1] - camA[1] + 100) < 3, "right-drag pans the lot");
await M.move(960, 540); await M.wheel(0, -400); await page.waitForTimeout(100);
const camC = await ev(() => __mid.gridXY(10, 30));
check(Math.hypot(camC[0] - 960, camC[1] - 540) > Math.hypot(camB[0] - 960, camB[1] - 540) + 20, "scroll wheel zooms in");

// 10. The save survives a reload
await ev(() => __mid.save());
await page.reload(); await page.waitForFunction(() => window.__mid);
const s = await ev(() => ({ res: __mid.state.res.length, bed: __mid.state.furn.some(f => f.k === "bed"), lot: __mid.state.lot.x1, rooms: __mid.rooms().length }));
check(s.res === 1 && s.bed && s.lot === L1.x1 && s.rooms === 1, "save survives a reload (resident, bed, room, lot size)");

// 11. Staged tests, each within seconds
for (const id of ORDER) {
  const p = await ctx.newPage(); watch(p);
  await p.goto(pageUrl(`?debug&test=wish:${id}`));
  let ok = true; try { await p.waitForSelector("#wish:not([hidden])", { timeout: 8000 }); } catch { ok = false; }
  const who = await p.evaluate(() => __mid.wish?.who);
  check(ok && who === id, `?test=wish:${id} shows ${id}'s wish card`);
  if (["mortimer", "fluff", "grumble", "squirm", "clanky", "conductor", "andy", "rummage", "snipper", "caw", "baron", "tock", "wick"].includes(id)) { await p.waitForTimeout(400); await p.screenshot({ path: `${out}/test-wish-${id}.png` }); }
  await p.close();
  const q = await ctx.newPage(); watch(q);
  await q.goto(pageUrl(`?debug&test=movein:${id}`));
  const want = ORDER.indexOf(id) + 1;
  ok = true; try { await q.waitForFunction(n => __mid.state.res.length === n, want, { timeout: 12000 }); } catch { ok = false; }
  check(ok, `?test=movein:${id} moves ${id} in`);
  if (id === "crooner") { await q.waitForTimeout(700); await q.screenshot({ path: `${out}/test-movein-crooner.png` }); }
  if (ORDER.indexOf(id) >= 14 && ok) {
    // wave three: the built room up close, and the lot didn't grow past its cap
    const st = await q.evaluate(() => ({ lot: __mid.state.lot, rares: __mid.state.rares, home: __mid.state.res[__mid.state.res.length - 1].home, W: __mid.dims.WW }));
    check(JSON.stringify(st.lot) === JSON.stringify(LALL) && st.rares.length === want, `?test=movein:${id}: the gift is in, the lot stays ${LALL.x1 - LALL.x0}×${LALL.y1 - LALL.y0}`);
    await q.evaluate(([i, W]) => { __mid.zoom(2); __mid.center(i % W + 0.5, Math.floor(i / W)); }, [st.home, st.W]);
    await q.waitForTimeout(500); await q.screenshot({ path: `${out}/test-movein-${id}.png` });
  }
  await q.close();
}
for (const t of ["house", "night"]) {
  const p = await ctx.newPage(); watch(p);
  await p.goto(pageUrl(`?debug&test=${t}`));
  await p.waitForFunction(n => __mid.people.length === n, ORDER.length);
  await p.evaluate(y => { __mid.zoom(1.45); __mid.center(29, y); }, 30.5 + oy);
  const enough = ORDER.length - 3; // the Conductor walks his rounds and Rummage sneaks about late in the evening
  if (t === "night") { await p.waitForFunction(n => __mid.people.filter(q => q.act === "sleep" || q.act === "perch").length >= n, enough, { timeout: 20000 }).catch(() => {}); }
  else await p.waitForTimeout(4000);
  const n = await p.evaluate(() => __mid.people.filter(q => q.act === "sleep" || q.act === "perch").length);
  if (t === "night") check(n >= enough, `?test=night: ${n} of ${ORDER.length} asleep or on watch`);
  else check(n === 0, "?test=house: everyone up and about by day");
  await p.screenshot({ path: `${out}/test-${t}.png` });
  if (t === "house") { await p.evaluate(() => __mid.fit()); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/test-house-whole-lot.png` }); await p.evaluate(y => { __mid.zoom(1.6); __mid.center(30, y); }, 21 + oy - 10); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/test-house-north.png` }); await p.evaluate(() => { __mid.zoom(1.5); __mid.center(66, 30); }); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/test-house-east.png` }); }
  await p.close();
}

// 11b. Free build from the title screen: no wishes, whole lot, every piece, friends come when clicked in
{
  const fc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await fc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug&speed=4"));
  await p.waitForFunction(() => window.__mid);
  await p.click("#freeBtn");
  await p.fill("#plName", "Free");
  await p.click("#plDone");
  await p.waitForSelector("#hud:not([hidden])");
  const st = await e(() => ({ mode: __mid.mode, lot: __mid.state.lot, rares: __mid.state.rares.length }));
  check(st.mode === "free" && JSON.stringify(st.lot) === JSON.stringify(LALL), `free build: the whole ${st.lot.x1 - st.lot.x0}×${st.lot.y1 - st.lot.y0} lot from the start`);
  check(st.rares === ORDER.length, "free build: every rare piece unlocked");
  await p.waitForTimeout(9000);
  const quiet = await e(() => !__mid.wish && !__mid.mover && document.getElementById("wish").hidden && document.getElementById("hintBtn").hidden);
  check(quiet, "free build: nobody shows up with a wish, no hint button");
  await p.click('#tools button[data-tool="furn"]');
  let gifts = 0, locked = 0;
  for (const tab of [5, 6]) { await p.click(`#ptabs button[data-tab="${tab}"]`); gifts += await e(() => document.querySelectorAll("#palette button.rare").length); locked += await e(() => document.querySelectorAll("#palette button:disabled").length); }
  check(!locked && gifts === ORDER.length, `free build: every gift in the Gifts tabs (${gifts}), none locked`);
  await p.click('#tools button[data-tool="friends"]');
  await p.click('#palette button[data-friend="crooner"]');
  const at = await e(y => __mid.tileXY(20, y), L0.y0 + 10);
  await p.mouse.click(at[0], at[1]);
  await p.waitForTimeout(500);
  const inv = await e(() => ({ res: __mid.state.res.map(r => r.id), ppl: __mid.people.map(q => q.id), label: document.querySelector('#palette button[data-friend="crooner"]').textContent }));
  check(inv.res.includes("crooner") && inv.ppl.includes("crooner") && inv.label.includes("🏠"), "free build: a click on the lot moves Crooner in");
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${out}/6-free-build.png` });
  await e(() => __mid.save());
  await p.reload(); await p.waitForFunction(() => window.__mid);
  await p.click("#playBtn");
  await p.waitForSelector("#hud:not([hidden])");
  const wishSave = await e(() => ({ mode: __mid.mode, w: __mid.state.lot.x1 - __mid.state.lot.x0, res: __mid.state.res.length, friendsBtn: document.querySelector('#tools button[data-tool="friends"]').hidden }));
  check(wishSave.mode === "wish" && wishSave.w === 30 && wishSave.res === 0 && wishSave.friendsBtn, "the wish game's save is untouched and has no Friends button (and no second name prompt)");
  await p.reload(); await p.waitForFunction(() => window.__mid);
  await p.click("#freeBtn");
  await p.waitForSelector("#hud:not([hidden])");
  check(await e(() => __mid.mode === "free" && __mid.state.res.some(r => r.id === "crooner")), "free build save survives a reload");
  await fc.close();
}

// 11c. Ghosts float through a gateless fence; Clonk can't
{
  const gc = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await gc.newPage(); watch(p);
  await p.goto(pageUrl("?debug&test=free"));
  await p.waitForFunction(() => window.__mid);
  const r = await p.evaluate(() => {
    for (const [a, b, c, d] of [[10, 20, 14, 20], [10, 24, 14, 24], [10, 20, 10, 24], [14, 20, 14, 24]]) __mid.wall(a, b, c, d, 4);
    const inside = id => __mid.pathLen(id, 5, 30, 12, 22);
    return { giggles: inside("giggles"), mumbles: inside("mumbles"), maker: inside("maker"), clonk: inside("clonk"), out: __mid.pathLen("giggles", 12, 22, 5, 30) };
  });
  check(r.giggles > 0 && r.mumbles > 0 && r.maker > 0 && r.out > 0, "the three ghosts float in and out of a gateless garden");
  check(r.clonk === -1, "Clonk still can't get through a fence");
  await gc.close();
}

// 11c. Saves from before the lot got bigger (60 wide, sidewalk at row 40, no grid size stored) load with the
// house intact in both modes: same rooms, garden, floors, furniture and residents, the same distance from the
// sidewalk. Loading twice must not shift them twice.
{
  const OW = 60, OH = 40, OWH = OH + 2;
  const pack = a => a.map(v => String.fromCharCode(48 + v)).join("");
  /** A wave-one save: a 4×3 wood room with a door, a bed and a lamp, and a 4×3 fenced garden; `res` lives in the room. */
  function oldSave({ rx, ry, gx, gy, lot, mover, rares, res, seed }) {
    const floor = new Array(OW * OWH).fill(0), hw = new Array(OW * (OWH + 1)).fill(0), vw = new Array((OW + 1) * OWH).fill(0);
    const box = (x0, y0, w, h, v) => { for (let x = x0; x < x0 + w; x++) { hw[y0 * OW + x] = v; hw[(y0 + h) * OW + x] = v; } for (let y = y0; y < y0 + h; y++) { vw[y * (OW + 1) + x0] = v; vw[y * (OW + 1) + x0 + w] = v; } };
    box(rx, ry, 4, 3, 1); hw[(ry + 3) * OW + rx + 1] = 2; // door on the front wall
    for (let y = ry; y < ry + 3; y++) for (let x = rx; x < rx + 4; x++) floor[y * OW + x] = 1;
    box(gx, gy, 4, 3, 4); // 14 fence pieces
    floor[gy * OW + gx] = 11;
    return { v: 1, picked: true, sound: false, seed, lot, floor: pack(floor), hw: pack(hw), vw: pack(vw),
      furn: [{ id: 1, k: "bed", x: rx, y: ry, r: 0 }, { id: 2, k: "lamp", x: rx + 3, y: ry, r: 0 }], nextId: 3, clock: 600, day: 3,
      mover, waiting: false, nextIn: 9999, res: res.map(id => ({ id, home: (ry + 1) * OW + rx + 2 })), rares };
  }
  const wishOld = oldSave({ rx: 10, ry: 30, gx: 20, gy: 25, lot: { x0: 0, y0: 15, x1: 46, y1: 40 }, mover: 3, rares: ["perch", "fort", "mic"], res: ["hoot"], seed: 4242 });
  const freeOld = oldSave({ rx: 50, ry: 2, gx: 30, gy: 10, lot: { x0: 0, y0: 0, x1: 60, y1: 40 }, mover: 8, rares: ["perch", "fort", "mic", "doghouse", "counter", "fireplace", "oven", "bench"], res: ["crooner"], seed: 99 });
  const mc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  // Written before the page's own script runs, once (a page writes its save on unload, so setting them from a live page would be overwritten).
  await mc.addInitScript(([w, f]) => { if (localStorage.getItem("fixture")) return; localStorage.setItem("fixture", "1"); localStorage.setItem("moveinday.players", JSON.stringify({ list: [{ id: "p1", name: "Sam" }], cur: "p1" })); localStorage.setItem("moveinday.v1.p1", JSON.stringify(w)); localStorage.setItem("moveinday.free.v1.p1", JSON.stringify(f)); }, [wishOld, freeOld]);
  const p = await mc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug"));
  /** What a save looks like after loading, in old-grid terms so it compares straight against the fixture. */
  const look = () => e(([ow, dy]) => {
    const s = __mid.state, { WW } = __mid.dims, old = i => (Math.floor(i / WW) - dy) * ow + (i % WW);
    return { lot: s.lot, mover: s.mover, grid: s.grid, rooms: __mid.rooms().map(r => ({ tiles: r.tiles.map(old).join(","), doors: r.doors })), gardens: __mid.gardens().map(g => ({ tiles: g.tiles.map(old).join(","), fence: g.fence })),
      wood: s.floor.map((v, i) => v === 1 ? old(i) : -1).filter(i => i >= 0).join(","), meadow: s.floor.map((v, i) => v === 11 ? old(i) : -1).filter(i => i >= 0).join(","),
      furn: s.furn.map(f => `${f.k}@${f.x},${f.y - dy}`).join(" "), res: s.res.map(r => `${r.id}@${old(r.home)}`).join(" "), people: __mid.people.map(q => q.id).join(" "), rares: s.rares.length };
  }, [OW, oy]);
  const tiles = (x0, y0, w, h) => { const a = []; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) a.push(y * OW + x); return a.join(","); };
  const same = (got, o, x) => got.rooms.length === 1 && got.rooms[0].tiles === tiles(x.rx, x.ry, 4, 3) && got.rooms[0].doors === 1
    && got.gardens.length === 1 && got.gardens[0].tiles === tiles(x.gx, x.gy, 4, 3) && got.gardens[0].fence === 14
    && got.wood === tiles(x.rx, x.ry, 4, 3) && got.meadow === String(x.gy * OW + x.gx)
    && got.furn === `bed@${x.rx},${x.ry} lamp@${x.rx + 3},${x.ry}` && got.res === o.res.map(r => `${r.id}@${r.home}`).join(" ") && got.people.includes(o.res[0].id);
  for (let pass = 1; pass <= 2; pass++) {
    if (pass > 1) await p.reload();
    await p.waitForFunction(() => window.__mid);
    await p.click("#playBtn"); await p.waitForSelector("#hud:not([hidden])");
    const g = await look();
    check(same(g, wishOld, { rx: 10, ry: 30, gx: 20, gy: 25 }) && g.lot.y0 === 15 + oy && g.lot.y1 === L0.y1 && g.lot.x1 === 46 && g.mover === 3 && g.grid.w === WW,
      `old 60-wide wish save loads with its room, garden, floors, bed, lamp and Hoot in place (load ${pass})${pass === 1 ? "" : ", not shifted twice"}`);
    if (pass === 1) await p.screenshot({ path: `${out}/7-migrated-wish-save.png` });
    await e(() => __mid.save());
    await p.reload(); await p.waitForFunction(() => window.__mid);
    await p.click("#freeBtn"); await p.waitForSelector("#hud:not([hidden])");
    const f = await look();
    check(same(f, freeOld, { rx: 50, ry: 2, gx: 30, gy: 10 }) && JSON.stringify(f.lot) === JSON.stringify(LALL) && f.mover === ORDER.length && f.rares === ORDER.length,
      `old 60-wide free-build save loads intact on the whole lot with every friend's gift (load ${pass})`);
    await e(() => __mid.save());
  }
  const raw = await e(() => JSON.parse(localStorage.getItem("moveinday.v1.p1")));
  check(raw.grid && raw.grid.w === WW && raw.grid.h === L0.y1, "a re-saved lot records the grid it was packed on");
  const bk = await e(() => JSON.parse(localStorage.getItem("moveinday.v1.p1.wave1") || "null"));
  check(bk && !bk.grid && bk.seed === 4242 && bk.lot.x1 === 46, "the original wave-one save is kept untouched as a backup");
  await mc.close();
}

// 11d. The theme pack: a pizza place with Crooner's stage, a train on a track loop, and pet cats
{
  const tc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await tc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug&test=house&speed=4"));
  await p.waitForFunction(() => window.__mid && __mid.people.length);
  const t0 = await e(() => __mid.trains);
  check(t0.length === 1, `the showcase track loop gets one train (${t0.length})`);
  await p.waitForTimeout(1500);
  const t1 = await e(() => __mid.trains);
  const moved = t1.length && Math.hypot(t1[0].head[0] - t0[0].head[0], t1[0].head[1] - t0[0].head[1]) > 0.5;
  const onTrack = await e(() => __mid.trains.every(t => __mid.state.floor[t.at[1] * __mid.dims.WW + t.at[0]] === 12));
  check(moved && onTrack, "the train runs along the track");
  const c0 = await e(() => __mid.cats);
  check(c0.length === 4 && new Set(c0.map(q => q.id)).size === 4, `two cat beds and two cat trees bring four cats (${c0.map(q => q.id).join(", ")})`);
  await p.waitForTimeout(4000);
  const c1 = await e(() => __mid.cats);
  check(c1.some((q, i) => Math.hypot(q.x - c0[i].x, q.y - c0[i].y) > 0.5), "the cats get up and wander");
  // cats only chase by day, and speed=4 runs the clock fast: set one down inside the loop at midday, twice if needed
  let chase = false;
  for (let i = 0; i < 2 && !chase; i++) { await e(() => { __mid.hour(11); __mid.putCat("mittens", 42, 5); }); chase = await p.waitForFunction(() => __mid.cats.some(q => q.act === "chase"), null, { timeout: 14000 }).then(() => true, () => false); }
  check(chase, "a cat chases the train");
  const line = await e(() => __mid.poke("pepperoni"));
  check(/^Pepperoni: /.test(line || ""), `poking a cat gets a meow (${line})`);
  await e(() => __mid.center(37, 6)); await e(() => __mid.zoom(1.6));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/7-train-and-cats.png` });
  // Showtime: Crooner takes the stage in the evening and the others come to watch.
  let onStage = false;
  for (let i = 0; i < 12 && !onStage; i++) { await e(() => { __mid.hour(18); __mid.replan(); }); await p.waitForTimeout(250); onStage = await e(() => __mid.people.some(q => q.id === "crooner" && q.piece === "stage")); }
  const sings = onStage && await p.waitForFunction(() => __mid.people.some(q => q.id === "crooner" && q.act === "sing" && q.piece === "stage"), null, { timeout: 30000 }).then(() => true, () => false);
  check(sings, "in the evening Crooner walks to the stage and sings");
  await e(() => { __mid.setClock(18); __mid.replan("crooner"); }); // everyone else decides what to do while the show is on
  const cheer = sings && await p.waitForFunction(() => __mid.people.some(q => q.act === "cheer" || (q.act === "walk" && q.piece === "stage" && q.id !== "crooner")), null, { timeout: 5000 }).then(() => true, () => false);
  check(cheer, "the others come to watch the show");
  await e(() => __mid.center(22, 7));
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/8-pizza-place-show.png` });
  await e(() => __mid.hour(22.5));
  // speed=4 runs the clock at ~32 game minutes a second, so 22:30 is still night for about 12 seconds
  const asleep = await p.waitForFunction(() => __mid.cats.every(q => q.act === "sleep" || (q.act === "walk" && q.then === "sleep")), null, { timeout: 3000 }).then(() => true, () => false);
  check(asleep, "at night every cat is asleep or on its way to bed");
  await tc.close();
}
// 11e. Laying track with the mouse, the new pieces from Stuff, and saves that keep them
{
  const fc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await fc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug&test=free"));
  await p.waitForFunction(() => window.__mid);
  const y = LALL.y0 + 5;
  await e(([x, yy]) => { __mid.center(x, yy); __mid.zoom(1); }, [10, y]);
  await p.click('#tools button[data-tool="yard"]');
  const swatch = await p.$$eval("#palette button", bs => bs.map(b => b.textContent));
  await p.click('#palette button:has-text("Track")');
  const pts = [[4, y], [12, y], [12, y + 4], [4, y + 4], [4, y]];
  const scr = []; for (const [tx, ty] of pts) scr.push(await e(([a, b]) => __mid.tileXY(a, b), [tx, ty]));
  await M_drag(p, scr);
  const laid = await e(() => __mid.state.floor.filter(v => v === 12).length);
  check(swatch.includes("Track") && laid >= 24, `the Track swatch lays a loop by dragging (${laid} tiles)`);
  await p.waitForTimeout(800);
  check(await e(() => __mid.trains.length === 1), "a train shows up on the new loop");
  // A straight line, not a loop: the train runs to the end and backs up the way it came.
  await e(([yy]) => { for (let x = 4; x < 10; x++) __mid.paint(x, yy, "track"); }, [y + 8]);
  const xs = [];
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(250); xs.push(await e(yy => __mid.trains.find(t => t.at[1] === yy)?.head[0], y + 8)); }
  const dx = xs.slice(1).map((v, i) => v - xs[i]).filter(Math.abs);
  check(dx.some(v => v > 0) && dx.some(v => v < 0), "on a straight line the train goes to the end and backs up");
  await p.click('#tools button[data-tool="furn"]');
  for (const k of ["catbed", "cattree", "stage", "pizzabar", "booth", "menuboard"]) {
    await p.click(`#ptabs button[data-tab="${await e(k => __mid.tabOf(k), k)}"]`);
    await p.click(`#palette button[data-k="${k}"]`);
  }
  const placed = await e(([yy]) => [["catbed", 20, yy], ["cattree", 22, yy], ["stage", 24, yy], ["pizzabar", 28, yy], ["booth", 31, yy], ["menuboard", 34, yy]].map(([k, x, y]) => !!__mid.place(k, x, y, 0)), [y]);
  check(placed.every(Boolean), "every new piece is in Stuff and fits on the lot");
  await p.waitForTimeout(500);
  check(await e(() => __mid.cats.length === 2), "a cat bed and a cat tree bring two cats");
  // Saved and loaded back: the track and the pieces are still there.
  const back = await e(() => { __mid.save(); const s = __mid.load(); return { now: __mid.state.floor.filter(v => v === 12).length, track: s.floor.filter(v => v === 12).length, kinds: s.furn.map(f => f.k) }; });
  check(back.track === back.now && back.track >= laid + 6 && ["catbed", "cattree", "stage", "pizzabar", "booth", "menuboard"].every(k => back.kinds.includes(k)), "a reload keeps the track and the new pieces");
  // A save naming a piece or floor this build doesn't know loads without them instead of crashing.
  const odd = await e(() => {
    __mid.save();
    const key = Object.keys(localStorage).find(k => k.includes("free.v1.")), raw = JSON.parse(localStorage.getItem(key));
    raw.furn.push({ id: 9999, k: "rocketship", x: 2, y: 2, r: 0 }); raw.floor = "~" + raw.floor.slice(1);
    localStorage.setItem(key, JSON.stringify(raw));
    const s = __mid.load(); return { unknown: s.furn.some(f => f.k === "rocketship"), floor0: s.floor[0], n: s.furn.length };
  });
  check(!odd.unknown && odd.floor0 === 0 && odd.n >= 6, "a save with an unknown piece or floor loads without them");
  await fc.close();
}

// 11f. Wave three
{
  // The Conductor's station: a room, then a platform fenced by mouse right up against the station's east wall.
  const cc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await cc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug&test=wish:conductor"));
  await p.waitForSelector("#wish:not([hidden])");
  await p.click("#wLater");
  const cw = await e(() => __mid.wish);
  let W = 2; for (let k = 2; k <= 10; k++) if (cw.area % k === 0 && cw.area / k <= 10 && Math.abs(k - cw.area / k) < Math.abs(W - cw.area / W)) W = k;
  const H = cw.area / W, X = LALL.x1 - 30, Y = LALL.y0 + 3; // the top of the lot: the staged friends built along the bottom
  let bh = Math.min(H, cw.fence - 4); while ((cw.fence - bh) % 2) bh--;
  const pw = (cw.fence - bh) / 2, PY = Y + H - bh;
  await e(([X, Y, W, H]) => { __mid.wall(X, Y, X + W, Y); __mid.wall(X + W, Y, X + W, Y + H); __mid.wall(X, Y + H, X + W, Y + H); __mid.wall(X, Y, X, Y + H); __mid.edge(true, X + 1, Y + H, 2); __mid.zoom(1.5); __mid.center(X + W, Y + H / 2); }, [X, Y, W, H]);
  await p.click('#tools button[data-tool="yard"]');
  await p.click('#palette button:has-text("Fence")');
  const gp = (x, y) => e(([a, b]) => __mid.gridXY(a, b), [x, y]);
  // top and far side first: the fence still has a gap, and he says so
  await M_drag(p, [await gp(X + W, PY), await gp(X + W + pw, PY)]);
  await M_drag(p, [await gp(X + W + pw, PY), await gp(X + W + pw, PY + bh)]);
  await p.waitForTimeout(600);
  const said = await e(() => __mid.mover?.says || "");
  check(/gap/.test(said) && await e(() => __mid.state.res.length) === 12, `a platform fence against the station with a gap: "${said}"`);
  await M_drag(p, [await gp(X + W + pw, PY + bh), await gp(X + W, PY + bh)]);
  const g = await e(() => __mid.gardens());
  const plat = g.find(q => q.tiles.includes(PY * WW + X + W));
  check(plat && plat.fence === cw.fence && plat.area === pw * bh, `the platform leans on the station wall: ${pw}×${bh}, ${plat?.fence} fence pieces (wanted ${cw.fence}), the wall not counted`);
  const moved = await p.waitForFunction(() => __mid.state.res.length === 13, null, { timeout: 15000 }).then(() => true, () => false);
  check(moved, "the Conductor moves in with a platform sharing the station wall");
  await e(([x, y]) => { __mid.zoom(2); __mid.center(x, y); }, [X + W, Y + H / 2]);
  await p.screenshot({ path: `${out}/9-conductor-platform-on-wall.png` });
  await cc.close();
}
{
  // A save that finished all 14 (wave two, no doorStyle) picks up mover 15 on its next load, without a reset.
  const fc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const res = ORDER.slice(0, 14).map((id, i) => ({ id, home: (LALL.y0 + 2) * WW + 4 + i * 2 })); // along the top, out of the way of new building
  const rares = ["perch", "fort", "mic", "doghouse", "counter", "fireplace", "oven", "bench", "slipper", "musicbox", "wormhole", "pizzaoven", "trainset", "shed"];
  const done = { v: 1, grid: { w: WW, h: LALL.y1 }, picked: true, sound: false, seed: 4242, lot: LALL, floor: "", hw: "", vw: "", furn: [{ id: 1, k: "bed", x: 5, y: 40, r: 0 }], nextId: 2, clock: 600, day: 9, mover: 14, waiting: false, nextIn: 25, res, rares };
  await fc.addInitScript(d => { if (localStorage.getItem("fixture")) return; localStorage.setItem("fixture", "1"); localStorage.setItem("moveinday.players", JSON.stringify({ list: [{ id: "p1", name: "Sam" }], cur: "p1" })); localStorage.setItem("moveinday.v1.p1", JSON.stringify(d)); }, done);
  const p = await fc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug&speed=4"));
  // The Journal on a save from before it existed: 14 pages open, Rummage's shut, and with no rooms left to
  // count (this fixture has no walls) Hoot's line falls back to his wish. Reading it writes nothing.
  await p.click("#homeJournal");
  check(await p.locator(".jgrid button:not(.locked)").count() === 14 && await p.locator(`.jgrid button[data-page="14"].locked`).count() === 1, "📖 Journal on a finished wave-two save: 14 pages open, Rummage's still ???");
  await p.click('.jgrid button[data-page="0"]');
  const hootWish = await e(() => __mid.sampleWishes(4242)[0].say);
  check(await p.textContent(".jpage .home") === `🏠 Hoot's wish: "${hootWish}"`, "a home that can't be found shows the wish, not a number");
  await p.click("#jBack"); await p.click("#jClose");
  check(!(await p.isHidden("#home")) && await e(d => localStorage.getItem("moveinday.v1.p1") === JSON.stringify(d), done), "Back goes to the title, and the save is byte-for-byte unchanged");
  await p.click("#playBtn"); await p.waitForSelector("#hud:not([hidden])");
  const st = await e(() => ({ res: __mid.state.res.length, ds: __mid.doorStyle, people: __mid.people.length }));
  check(st.res === 14 && st.people === 14 && JSON.stringify(st.ds) === "{}", "a finished wave-two save (no doorStyle) loads clean with all 14 at home");
  const came = await p.waitForFunction(() => __mid.wish?.who === "rummage", null, { timeout: 20000 }).then(() => true, () => false);
  check(came, "...and Rummage, friend 15, walks up with a wish");
  await p.screenshot({ path: `${out}/9-mover-15-arrives.png` });
  await e(() => __mid.solve());
  const inn = await p.waitForFunction(() => __mid.state.res.length === 15, null, { timeout: 15000 }).then(() => true, () => false);
  const after = await e(() => ({ lot: __mid.state.lot, rares: __mid.state.rares }));
  check(inn && JSON.stringify(after.lot) === JSON.stringify(LALL) && after.rares.includes("trashcan"), "Rummage moves in: his gift, and the lot stays at its cap");
  await p.waitForTimeout(3000);
  check(!(await p.textContent("#toast")).match(/lot|bigger|grew/i), "nothing says the lot grew");
  await fc.close();
}
{
  // Door styles: a sub-row on the Doors tool, saved in their own field, dropped when the door goes.
  const dc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await dc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug"));
  await p.click("#freeBtn"); await p.fill("#plName", "Doors"); await p.click("#plDone");
  await p.waitForSelector("#hud:not([hidden])");
  const y = LALL.y1 - 6;
  await e(yy => { __mid.zoom(2); __mid.center(13, yy - 0.5); }, y);
  await p.click('#tools button[data-tool="wall"]');
  await M_drag(p, [await e(([a, b]) => __mid.gridXY(a, b), [8, y]), await e(([a, b]) => __mid.gridXY(a, b), [18, y])]);
  await p.click('#tools button[data-tool="door"]');
  const looks = await p.$$eval("#palette button", bs => bs.map(b => b.textContent));
  check(looks.join() === "Plain,Spooky,Double,Number", `the Doors tool has a row of looks (${looks.join(", ")})`);
  const at = x => e(([a, b]) => __mid.gridXY(a, b), [x + 0.5, y]);
  for (const [i, x] of [[0, 9], [1, 11], [2, 13], [3, 15]]) { await p.click(`#palette button[data-door="${i}"]`); await p.mouse.click(...(await at(x))); }
  const ds = await e(() => __mid.doorStyle), rooms0 = await e(() => __mid.state.hw.filter(v => v === 2).length);
  check(rooms0 === 4 && ds[`h9,${y}`] === undefined && ds[`h11,${y}`] === 1 && ds[`h13,${y}`] === 2 && ds[`h15,${y}`] === 3, `four doors, one of each look (${JSON.stringify(ds)})`);
  await p.mouse.move(5, 5); await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/9-door-styles.png` });
  // a tap with another look picked restyles the door instead of taking it out
  await p.click('#palette button[data-door="1"]'); await p.mouse.click(...(await at(15)));
  check(await e(([k]) => __mid.doorStyle[k], [`h15,${y}`]) === 1 && await e(([i]) => __mid.state.hw[i], [y * WW + 15]) === 2, "a tap with Spooky picked turns the numbered door spooky, still a door");
  // undo puts the look back; a second tap with the same look takes the door out, and its look with it
  await p.click("#undoBtn");
  check(await e(([k]) => __mid.doorStyle[k], [`h15,${y}`]) === 3, "Undo brings the number back");
  await p.click('#palette button[data-door="3"]'); await p.mouse.click(...(await at(15)));
  check(await e(([i]) => __mid.state.hw[i], [y * WW + 15]) === 1 && await e(([k]) => __mid.doorStyle[k], [`h15,${y}`]) === undefined, "tapping a numbered door with Number picked makes it a wall and drops the look");
  await p.click("#undoBtn");
  // saved in its own field and back after a reload
  await e(() => __mid.save());
  await p.reload(); await p.waitForFunction(() => window.__mid);
  await p.click("#freeBtn"); await p.waitForSelector("#hud:not([hidden])");
  const back = await e(() => ({ ds: __mid.doorStyle, raw: JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("moveinday.free.v1.")))) }));
  check(back.ds[`h11,${y}`] === 1 && back.ds[`h13,${y}`] === 2 && back.ds[`h15,${y}`] === 3 && back.raw.doorStyle[`h13,${y}`] === 2 && /^[0-5]*$/.test(back.raw.hw) && /^[0-5]*$/.test(back.raw.vw), "door looks survive a reload, saved as doorStyle (edges stay 0–5)");
  // the bulldozer takes the door and its look; Undo brings both back, an Undo of the door itself drops it again
  await e(yy => { __mid.zoom(2); __mid.center(13, yy - 0.5); }, y);
  await p.click('#tools button[data-tool="dozer"]');
  await p.mouse.click(...(await at(13)));
  check(await e(([i]) => __mid.state.hw[i], [y * WW + 13]) === 0 && await e(([k]) => __mid.doorStyle[k], [`h13,${y}`]) === undefined, "bulldozing the double door drops its look");
  await p.click("#undoBtn");
  check(await e(([k]) => __mid.doorStyle[k], [`h13,${y}`]) === 2, "Undo brings the double door back as it was");
  await p.click('#tools button[data-tool="door"]');
  await p.click('#palette button[data-door="2"]'); await p.mouse.click(...(await at(17)));
  check(await e(([k]) => __mid.doorStyle[k], [`h17,${y}`]) === 2, "a new double door");
  await p.click("#undoBtn");
  check(await e(([k]) => __mid.doorStyle[k], [`h17,${y}`]) === undefined && await e(([i]) => __mid.state.hw[i], [y * WW + 17]) === 1, "Undo takes the new door and its look away");
  // a styled door is still just a door: Hoot walks through it
  check(await e(([yy]) => __mid.pathLen("hoot", 13, yy, 13, yy - 1), [y]) === 1, "a styled door lets friends through like any door");
  await dc.close();
}

// 12. A small laptop screen: the toolbar and palette still fit
{
  const small = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const p = await small.newPage(); watch(p);
  await p.goto(pageUrl("?debug&test=wish:biscuit"));
  await p.waitForSelector("#wish:not([hidden])");
  await p.click('#tools button[data-tool="furn"]');
  const fit = await p.evaluate(() => { const t = document.getElementById("tools"); const r = t.getBoundingClientRect(); const bs = [...t.querySelectorAll("button")].map(b => b.getBoundingClientRect()); return r.bottom <= innerHeight && bs.every(b => b.left >= 0 && b.right <= innerWidth) && document.getElementById("wish").getBoundingClientRect().bottom < document.getElementById("palette").getBoundingClientRect().top; });
  check(fit, "1366×768: every tool button on screen, wish card clear of the palette");
  // Each Stuff tab fits on screen without scrolling, and the wish card stays clear of the tabs.
  await p.evaluate(() => __mid.order.forEach(id => __mid.grant(id))); // every gift unlocked: the widest the Gifts tab gets
  const names = await p.evaluate(() => [...document.querySelectorAll("#ptabs button")].map(b => b.textContent));
  const tooWide = [];
  for (let i = 0; i < names.length; i++) {
    await p.click(`#ptabs button[data-tab="${i}"]`);
    const ok = await p.evaluate(() => { const pal = document.getElementById("palette"), r = pal.getBoundingClientRect(), tb = document.getElementById("ptabs").getBoundingClientRect(); return pal.scrollWidth <= pal.clientWidth && [...pal.children].every(b => { const q = b.getBoundingClientRect(); return q.left >= r.left && q.right <= r.right; }) && tb.right <= innerWidth && document.getElementById("wish").getBoundingClientRect().bottom < tb.top; });
    if (!ok) tooWide.push(names[i]);
    if (names[i] === "Outside" || names[i].includes("Gifts") || names[i].includes("gifts")) await p.screenshot({ path: `${out}/5-1366x768-${names[i].toLowerCase().replace(" ", "-")}.png` });
  }
  check(names.join() === "Bedroom,Living,Kitchen,Bath,Outside,Gifts,More gifts" && !tooWide.length, `1366×768: every Stuff tab (${names.join(", ")}) fits without scrolling${tooWide.length ? "; too wide: " + tooWide.join(", ") : ""}`);
  await p.screenshot({ path: `${out}/5-1366x768.png` });
  await small.close();
}

// 13. Play as a friend: take over by mouse, walk with keys, build while driving, use, let go
{
  const pc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await pc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  const until = (f, a, ms = 8000) => p.waitForFunction(f, a, { timeout: ms });
  await p.goto(pageUrl("?debug&test=free"));
  await p.waitForFunction(() => window.__mid && __mid.mode === "free");
  const all = await e(n => __mid.lotAfter(n), ORDER.length);
  const hx = 20, hy = all.y0 + 15;
  await e(([x, y]) => __mid.invite("crooner", x, y), [hx, hy]);
  await until(([x, y]) => { const q = __mid.people.find(p => p.id === "crooner"); return q && q.act !== "walk" && Math.floor(q.x) === x && Math.floor(q.y) === y; }, [hx, hy], 15000);
  await e(([x, y]) => { __mid.zoom(1.5); __mid.center(x, y); __mid.replan("crooner"); }, [hx, hy]);
  // a real click on Crooner in Look mode offers "Play as", and the button takes over
  const q0 = await e(() => __mid.people.find(p => p.id === "crooner"));
  await p.click('#tools button[data-tool="look"]');
  const at = await e(([x, y]) => __mid.gridXY(x, y - 0.6), [q0.x, q0.y]);
  await p.mouse.click(at[0], at[1]);
  await p.waitForSelector("#dOffer:not([hidden])");
  check((await p.textContent("#dPlay")).includes("Crooner"), "clicking a friend in Look offers 🎮 Play as Crooner");
  await p.click("#dPlay");
  await p.waitForSelector("#dCard:not([hidden])");
  check((await e(() => __mid.driven))?.id === "crooner" && (await p.textContent("#dName")).includes("Crooner"), "the Play as button takes over Crooner and shows the controls card");
  const tileNow = async () => (await e(() => __mid.driven)).tile;
  const walkKey = async (key, ms) => { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); await until(() => __mid.driven.act !== "walk"); };
  const [cx, cy] = await tileNow();
  await walkKey("ArrowRight", 1100);
  const [rx, ry] = await tileNow();
  check(rx >= cx + 2 && ry === cy, `holding → walks him right (${cx}→${rx})`);
  const cam0 = await e(() => __mid.gridXY(0, 0));
  // building while driving: a wall run with a door, by mouse
  await p.click('#tools button[data-tool="wall"]');
  await M_drag(p, [await e(([x, y]) => __mid.gridXY(x, y), [rx + 2, ry - 2]), await e(([x, y]) => __mid.gridXY(x, y), [rx + 2, ry + 3])]);
  await p.click('#tools button[data-tool="door"]');
  const dp = await e(([x, y]) => __mid.gridXY(x, y), [rx + 2, ry + 0.5]);
  await p.mouse.click(dp[0], dp[1]);
  const cam1 = await e(() => __mid.gridXY(0, 0));
  check((await e(() => __mid.driven))?.id === "crooner" && cam0[0] === cam1[0] && cam0[1] === cam1[1], "built a wall and a door with the mouse while still playing as him; the camera stayed put");
  await p.keyboard.press("Space"); // the Door button has focus: Space must not click it, only try to use
  check(await e(() => __mid.tool) === "door", "Space while driving doesn't click the focused toolbar button");
  await walkKey("d", 1700);
  const [tx2] = await tileNow();
  check(tx2 >= rx + 2, `D walks him through the door (${rx}→${tx2})`);
  // a wall with no door stops him
  await walkKey("s", 450);
  const [bx, by] = await tileNow();
  await walkKey("a", 1200);
  const [bx2] = await tileNow();
  check(by === ry + 1 && bx2 === rx + 2, `the wall stops him without a door (${bx}→${bx2}, row ${by})`);
  // Use: a TV beside him, then a bed (daytime: a nap), then walking off gets him up
  await e(([x, y]) => __mid.place("tv", x, y - 1), [bx2, by]);
  await p.waitForFunction(() => document.getElementById("dUse").textContent.includes("TV"));
  check(await e(() => __mid.useTarget) === "tv", "the Use button names the TV beside him");
  await p.click("#dUse");
  check((await e(() => __mid.driven)).act === "watch", "✨ Use watches TV");
  await walkKey("s", 300);
  await e(([x, y]) => __mid.place("bed", x + 1, y + 1), [bx2, by]);
  await p.keyboard.press("Space");
  const nap = await e(() => __mid.driven);
  check(nap.act === "nap" && nap.piece === "bed", `Space beside the bed: a daytime nap (${nap.act})`);
  await p.screenshot({ path: `${out}/6-play-as.png` });
  // Undo something else: the bed comes back as a new object, and Use still gets him up
  await p.click('#tools button[data-tool="furn"]');
  await p.click(`#ptabs button[data-tab="${await e(() => __mid.tabOf("lamp"))}"]`);
  await p.click('#palette button[data-k="lamp"]');
  const lampAt = await e(([x, y]) => __mid.tileXY(x + 3, y + 3), [bx2, by]);
  const nFurn = await e(() => __mid.state.furn.length);
  await p.mouse.click(lampAt[0], lampAt[1]);
  check(await e(() => __mid.state.furn.length) === nFurn + 1, "placed a lamp by mouse while he's in bed");
  await p.click("#undoBtn");
  await p.waitForTimeout(100);
  await p.keyboard.press("Space");
  check((await e(() => __mid.driven)).act === "stand", "after an Undo, Space still gets him out of bed");
  // a night sleep on a bed that gets bulldozed: he gets up
  await e(() => __mid.setClock(22));
  await p.keyboard.press("Space");
  check((await e(() => __mid.driven)).act === "sleep", "Space on the bed at night: asleep");
  await p.click('#tools button[data-tool="dozer"]');
  const bedAt = await e(([x, y]) => __mid.tileXY(x + 1, y + 2), [bx2, by]);
  await p.mouse.click(bedAt[0], bedAt[1]);
  await p.waitForFunction(() => __mid.driven.act === "stand");
  check(!(await e(() => __mid.state.furn.some(f => f.k === "bed"))), "bulldozing the bed he's asleep in gets him up");
  await e(() => __mid.setClock(11));
  await e(([x, y]) => __mid.place("bed", x + 1, y + 1), [bx2, by]);
  await p.keyboard.press("Space");
  // moving him with the Friends tool sticks, even straight out of bed
  await p.click('#tools button[data-tool="friends"]');
  await e(([x, y]) => __mid.invite("crooner", x, y), [bx2 - 6, by + 1]);
  await p.waitForFunction(([x]) => { const d = __mid.driven; return d.act === "stand" && d.tile[0] === x; }, [bx2 - 6], { timeout: 15000 });
  await p.waitForTimeout(300);
  check((await e(() => __mid.driven)).tile[0] === bx2 - 6, "the Friends tool moves him out of bed and he stays where he was sent");
  await e(([x, y]) => __mid.invite("crooner", x, y), [bx2, by + 1]);
  await p.waitForFunction(([x]) => { const d = __mid.driven; return d.act === "stand" && d.tile[0] === x; }, [bx2], { timeout: 15000 });
  await walkKey("s", 300);
  const up = await e(() => __mid.driven);
  check(up.act === "stand" && up.tile[0] === bx2 && up.tile[1] === by + 2, `walking off gets him out of bed and on his way (${up.tile})`);
  // Esc lets go and his AI takes over again
  await p.keyboard.press("Escape");
  await p.waitForSelector("#drive", { state: "hidden" });
  await until(() => { const q = __mid.people.find(p => p.id === "crooner"); return q.act !== "stand" && q.act !== "idle"; }, null, 8000);
  check(await e(() => __mid.driven) === null, "Esc lets go: the card closes and Crooner goes back to doing his own thing");
  // the pad works without a keyboard
  await e(() => __mid.playAs("crooner"));
  const pad0 = await tileNow();
  const pb = await p.$('#dPad button[data-d="2"]'), bb = await pb.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up();
  await until(() => __mid.driven.act !== "walk");
  const pad1 = await tileNow();
  check(pad1[1] > pad0[1], "holding the ▼ pad button walks him down");
  await p.click("#dGo");
  check(await e(() => __mid.driven) === null, "✋ Let go hands him back");
  await pc.close();
}
{
  // the wish game: any resident, never the friend waiting with a wish; ghosts still go through walls, Clonk bonks
  const pc = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const p = await pc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug&test=wish:mumbles"));
  await p.waitForSelector("#wish:not([hidden])");
  check(await e(() => __mid.playAs("mumbles")) === false && await e(() => __mid.playAs("hoot")) === true, "wish game: the waiting friend can't be played, a resident can");
  await p.click("#wLater");
  const g = await e(() => __mid.driven.tile);
  await e(([x, y]) => { __mid.wall(x + 1, y - 1, x + 1, y + 2); __mid.playAs("giggles"); }, g);
  const gi = await e(() => __mid.driven);
  await e(([x, y]) => __mid.wall(x + 1, y - 1, x + 1, y + 2), gi.tile);
  await p.keyboard.down("ArrowRight"); await p.waitForTimeout(900); await p.keyboard.up("ArrowRight");
  await p.waitForFunction(() => __mid.driven.act !== "walk");
  check((await e(() => __mid.driven)).tile[0] > gi.tile[0] + 1, "Giggles (a ghost) walks straight through a wall");
  await e(() => __mid.playAs("clonk"));
  const ck = await e(() => __mid.driven);
  await e(([x, y]) => __mid.wall(x + 1, y - 1, x + 1, y + 2), ck.tile);
  await p.keyboard.down("ArrowRight"); await p.waitForTimeout(200);
  const bonk = await e(() => __mid.driven.act);
  await p.keyboard.up("ArrowRight");
  check(bonk === "bonk" && (await e(() => __mid.driven)).tile[0] === ck.tile[0], "Clonk bonks into the wall instead of walking through");
  const fit = await e(() => { const r = document.getElementById("dCard").getBoundingClientRect(), t = document.getElementById("tools").getBoundingClientRect(), h = document.getElementById("hudRight").getBoundingClientRect(); return r.right <= innerWidth && r.bottom < t.top && r.top >= h.bottom; });
  check(fit, "1366×768: the controls card fits between the HUD and the toolbar");
  await p.screenshot({ path: `${out}/6-play-as-1366.png` });
  await p.goto(pageUrl("?debug&test=playas:mortimer"));
  await p.waitForFunction(() => __mid.driven?.id === "mortimer" && !document.getElementById("dCard").hidden);
  check(true, "?test=playas:mortimer stages the showcase house already playing as Mortimer");
  await pc.close();
}

{
  // The Journal (move-in-day#14): a page per friend, open once they've moved in on the wish save.
  const jc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await jc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug&test=wish:mortimer&speed=4"));
  await p.waitForFunction(() => window.__mid);
  await p.waitForSelector("#hud:not([hidden])");
  const W = Object.fromEntries((await e(() => __mid.sampleWishes(12345))).map(w => [w.id, w]));
  await p.click("#journalBtn");
  check(await p.locator(".jgrid button").count() === ORDER.length && await p.locator(".jgrid button.locked").count() === ORDER.length - 4
    && await p.textContent("#journalScr .tag") === `4 of ${ORDER.length} friends moved in`, "📖 Journal from the HUD: a page for all 20, the four who moved in are open");
  await p.screenshot({ path: `${out}/10-journal-grid.png` });
  const clock0 = await e(() => __mid.state.clock);
  await p.click('.jgrid button[data-page="3"]');
  const pg = await e(() => { const q = s => document.querySelector(s)?.textContent; return { h: q(".jpage h3"), from: q(".jpage .from"), facts: document.querySelectorAll(".jpage li").length, home: q(".jpage .home") }; });
  check(pg.h === "Officer Biscuit" && pg.from === "from Comic Cop" && pg.facts === 3, "Officer Biscuit's page: name, home game and three facts");
  check(pg.home === `🏠 Officer Biscuit's room: ${W.biscuit.area} floor tiles`, `...and his room as built: ${pg.home}`);
  await p.screenshot({ path: `${out}/10-journal-biscuit.png` });
  await p.click("#jPrev"); await p.click("#jPrev");
  check(await p.textContent(".jpage .home") === `🏠 Giggles' hiding garden: ${W.giggles.fence} fence pieces`, "◀ ◀ turns back to Giggles: her garden's fence pieces");
  await p.click("#jNext"); await p.click("#jNext"); await p.click("#jNext");
  const locked = await e(() => {
    const c = document.querySelector(".jpage canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let ink = 0, other = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250) { if (d[i] === 0x3b && d[i + 1] === 0x2a && d[i + 2] === 0x1c) ink++; else other++; }
    return { locked: !!document.querySelector(".jpage.locked"), h: document.querySelector(".jpage h3").textContent, hint: document.querySelector(".jpage .hint")?.textContent, facts: document.querySelectorAll(".jpage li").length, ink, other };
  });
  check(locked.locked && locked.h === "???" && locked.hint === "Hasn't moved in yet." && locked.facts === 0 && locked.ink > 2000 && locked.other === 0, `▶ to Mortimer, who hasn't moved in: a dark silhouette, "???", no facts (${locked.ink} silhouette pixels)`);
  await p.screenshot({ path: `${out}/10-journal-locked.png` });
  check(await e(() => __mid.state.clock) === clock0, "the game waits while the Journal is open");
  await p.click("#jBack"); await p.click("#jClose");
  check(await p.isHidden("#journalScr") && await p.isVisible("#hud") && await p.isHidden("#home"), "Back, Back: straight back to the game");
  await e(() => __mid.solve());
  const inn = await p.waitForFunction(() => __mid.state.res.length === 5, null, { timeout: 15000 }).then(() => true, () => false);
  await p.click("#journalBtn"); await p.click('.jgrid button[data-page="4"]');
  check(inn && await p.textContent(".jpage h3") === "Mortimer" && await p.textContent(".jpage .home") === `🏠 Mortimer's back room: ${W.mortimer.area} floor tiles`, "Mortimer moves in and his page opens, with his back room");
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  check(await p.isHidden("#journalScr"), "Esc, Esc closes it too");
  await jc.close();
  // Free build opens the Journal but reads the wish save, so inviting everyone doesn't open their pages.
  const fc = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const f = await fc.newPage(); watch(f);
  await f.goto(pageUrl("?debug&test=free"));
  await f.waitForFunction(() => window.__mid);
  await f.evaluate(() => { __mid.invite("hoot", 10, 30); __mid.invite("clonk", 12, 30); });
  await f.click("#journalBtn");
  check(await f.locator(".jgrid button.locked").count() === ORDER.length && (await f.textContent("#journalScr .tag")).startsWith(`0 of ${ORDER.length}`), "Free build: inviting friends opens no Journal pages");
  await f.screenshot({ path: `${out}/10-journal-1366.png` });
  await fc.close();
}

{
  // Players: delete one. Asks first, No keeps them, Yes removes both lots but parks a copy,
  // the other player's lot is untouched, and the last player has no 🗑️.
  const dc = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const lot = seed => JSON.stringify({ grid: { w: 80, h: 50 }, picked: true, seed, res: [] });
  await dc.addInitScript(([a, b, c]) => { if (localStorage.getItem("fixture")) return; localStorage.setItem("fixture", "1"); localStorage.setItem("moveinday.players", JSON.stringify({ list: [{ id: "p1", name: "Sam" }, { id: "p2", name: "Sis" }], cur: "p2" })); localStorage.setItem("moveinday.v1.p1", a); localStorage.setItem("moveinday.v1.p2", b); localStorage.setItem("moveinday.free.v1.p2", c); }, [lot(111), lot(222), lot(333)]);
  const p = await dc.newPage(); watch(p);
  const e = (f, a) => p.evaluate(f, a);
  await p.goto(pageUrl("?debug"));
  check(await p.textContent("#playersBtn") === "👤 Who am I?", 'the title button reads "👤 Who am I?"');
  await p.click("#playersBtn");
  check(await p.textContent("#playersScr h2") === "Who am I?", 'the player screen is headed "Who am I?"');
  check(await p.locator("[data-del]").count() === 2, "Players: every row has a 🗑️ while there are two");
  await p.click('[data-del="p2"]');
  check(await p.locator(".pl .ask").textContent() === "Delete Sis's lot?", "🗑️ asks \"Delete Sis's lot?\" on the page");
  await p.click("[data-delno]");
  check(await p.locator(".pl").count() === 2 && await e(() => !!localStorage.getItem("moveinday.v1.p2")), "No keeps Sis and her lot");
  await p.click('[data-del="p2"]');
  await p.screenshot({ path: `${out}/7-delete-ask.png` });
  await p.click('[data-delyes="p2"]');
  const st = await e(() => ({ players: JSON.parse(localStorage.getItem("moveinday.players")), keys: Object.keys(localStorage) }));
  check(st.players.list.length === 1 && st.players.cur === "p1", "Yes removes Sis and switches to Sam");
  check(!st.keys.includes("moveinday.v1.p2") && !st.keys.includes("moveinday.free.v1.p2"), "both of Sis's lots are gone");
  check(st.keys.filter(k => /^moveinday\.(free\.)?v1\.p2\.deleted\.\d+$/.test(k)).length === 2, "both are parked under .deleted.<time> for a hand restore");
  check(await e(() => JSON.parse(localStorage.getItem("moveinday.v1.p1")).seed) === 111, "Sam's lot is untouched");
  check(await p.locator("[data-del]").count() === 0 && await p.locator("#plAdd").count() === 1, "the last player has no 🗑️; ➕ New player is there");
  await p.reload(); await p.waitForFunction(() => window.__mid);
  check(await e(() => JSON.parse(localStorage.getItem("moveinday.players")).list.map(x => x.name).join()) === "Sam", "the delete sticks after a reload");
  await dc.close();
}

await browser.close();
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 5).join(" | ") : ""}`);
console.log(`screenshots in ${out}`);
process.exit(failed ? 1 : 0);
