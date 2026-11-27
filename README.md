# Move-In Day

Build anything on an open lot seen from above: walls, doors, windows, floors, a yard, furniture. Friends from the other games walk up the sidewalk one at a time with a wish (a room with exactly 12 floor tiles, a garden with exactly 18 fence pieces, a kitchen with a fridge and a stove). When the lot has it, they move in, the lot grows a strip (30×20 up to 80×50 over the first 14 move-ins; after that it's full size and the reward is the gift and the party), and they leave a rare piece of furniture. Later friends ask for bigger numbers and two-part wishes (an L-shaped kitchen, two rooms that make a number together, a room plus a fenced platform, a lawn with a set fence and a set number of squares inside), then new shapes (a T, a U) and rooms with a set number of doors or windows. Residents wander, use the furniture, sleep at night and keep their home-game quirks.

- The whole game is `public/index.html`: Canvas 2D + Web Audio, no image or audio files.
- Free build (title screen) skips the wishes: the whole lot and every piece from the start, friends come when invited.
- Desktop first (full-screen Chromium at 1920×1080, still fits 1366×768). Stuff is in tabs (Bedroom, Living, Kitchen, Bath, Outside, Gifts, More gifts) so each fits without scrolling. Mouse: click, drag, right-drag or drag empty ground in 👀 Look to pan, scroll wheel to zoom. Every action has a button; keys are optional extras (Ctrl+Z undo, R rotate, Esc cancel, arrows/WASD pan).
- Preview: `bun server.ts` (127.0.0.1:4853; set `HOST` to reach it from another device).
- Deploy: `npm run deploy` (assets-only Worker `move-in-day` on Red Leg Dev). Pushing does not deploy.

## Cast

Arrival order: Hoot, Giggles, Crooner, Officer Biscuit, Mortimer, Clonk, Mumbles, the Math Maker, then Fluff, Grumble, Squirm, Chef Clanky, the Conductor and Andy, then (wave three) Rummage, the Snipper, Captain Caw, Baron Von Squeak, Tock and Wick. Homes: Door Codes (Hoot, Clonk, Crooner, Fluff, Grumble, Squirm, Andy), Midnight Hotel (Giggles, Mortimer), Comic Cop (Officer Biscuit, Chef Clanky, Rummage, the Snipper, Captain Caw, Baron Von Squeak), Creakwood (Mumbles, Tock, Wick), Math Maker, Midnight Line (the Conductor). Each is a small version of the `draw*` function in their home repo, same colours and props; the wave-three six use the same copied drawings Math Maker does (the `COMIC`/`CREAK` closures), drawn small.

Quirks: Hoot perches on walls at night, Clonk bonks walls, Crooner sings in the tub, Giggles hides, Mumbles jiggles furniture, Fluff gathers in room corners with two tiny dust-bunny pals, Grumble naps anywhere (and is grumpy when poked awake), Squirm tunnels under walls and pops up elsewhere (out of a worm hole if there is one), Clanky creeps stop-start and clacks his jaw, the Conductor walks his rounds with a lantern in the late evening, Andy mows the grass, Rummage naps by day and sneaks about at night rummaging through everyone's stuff, the Snipper trims the plants, Captain Caw goes after anything shiny, Baron Von Squeak zaps furniture with his Mis-Spell Ray (it wobbles and gets a mixed-up name), Tock hoots every hour on the hour and sits by a lamp to make his shadow huge, and Wick investigates (his flame lights the dark and flickers when he's startled).

Gifts: perch, blanket fort, mic stand, doghouse, shop counter, fireplace, bakery oven, workbench, giant slipper, music box, worm hole, pizza oven, toy train set, garden shed, then a shiny trash can (Rummage), barber chair (Snipper), crow's nest (Caw), Mis-Spell Ray (Baron), grandfather clock that shows the lot's time (Tock) and a clue board (Wick).

## Wishes and the lot

- A room is tiles closed in by walls, doors and windows, with at least one door. A garden is closed in by fences and gates, and it may lean on a building: walls, doors and windows can be some of its sides. It needs at least one fence or gate, and only those count as its fence pieces, so a room walled all the way round is never a garden. (The Conductor's platform against the station wall counts.)
- Shapes: an L is the box minus one corner; a T is the box minus both corners of one side, cut the same depth; a U is the box minus a notch in the middle of one side. Any way round.
- A save that finished all 14 meets Rummage on its next load. Wave three's wishes are rolled after Andy's, so every save keeps the numbers it already had.

## Door styles

The 🚪 Doors tool has a row of looks: plain, spooky purple, double, and a numbered door with a plaque. Tap a wall to put a door in that look; tap a door in another look to restyle it, or in the same look to take it out. Looks are saved in their own field (`doorStyle: {"h12,30": 2}`), never as new edge values, so pathing and rooms don't change and older builds can still load the save. A door that's bulldozed, turned back into a wall or undone loses its look; Undo puts it back.

## Pets, the pizza place and trains

- **Cats** (Pepperoni, Mittens, Noodle, Pickles) are pets, not movers: each cat bed (Bedroom) or cat tree (Living) brings one, up to four. They nap on beds and in sunny spots (next to a window or out in the yard), climb cat trees, rub against residents, sleep at night and chase the train by day. Runtime only (`cats`), rebuilt from the pieces on load.
- **Pizza place:** pizza counter, booth and menu board (Kitchen), stage (Living), on the existing Checkers floor. From 16:00 Crooner takes the stage and sings, and the others come over to cheer.
- **Track** is a Yard paint. Every connected stretch of 3+ tiles gets a little train (a loop runs round, a line goes back and forth); walls, windows and fences cut the line. Trains are runtime only (`trains`); the track saves and undoes like any floor.
- A save that names a piece or floor this build doesn't know loads without it rather than crashing (so a rollback can't break a newer save — but roll forward anyway).

## Play as a friend

Click any friend who lives on the lot (👀 Look) and press **🎮 Play as** to drive them, in both the wish game and Free build. Arrows/WASD or the pad walk them a tile at a time through the same rules as their AI (the three ghosts go through walls, Clonk bonks into them), Space or the ✨ button uses the piece they're on or right beside (a bed by day is a nap), and Esc or ✋ Let go hands them back. While driving, the keys walk the friend instead of panning; the camera follows them while they walk, and every build tool still works with the mouse. The friend waiting with a wish and the cats can't be played. Runtime only (`driven`), never saved.

## The Journal and "Who am I?"

- **📖 Journal** (title screen and HUD): a portrait grid of all 20 friends in arrival order, then a page each with ◀ ▶ and Back. A page opens once that friend has moved in on the player's wish save (`moveinday.v1.<id>`); Free build opens the Journal but reads the wish save, so inviting friends there unlocks nothing. Locked pages are a dark silhouette with "???". An open page shows the friend large, their home game, three facts and one line about their home on this lot.
- **Facts** are copied word for word from the friend's other games so they read the same everywhere: Door Codes `FACTS` for its own seven (Hoot, Crooner, Clonk, Fluff, Grumble, Squirm, Andy), the Math Maker's Journal for Mortimer, Mumbles, Tock, Wick and the four Comic Cop villains. Giggles, Officer Biscuit, the Math Maker, Chef Clanky and the Conductor had none, so theirs are new here.
- **The home line** counts the room or garden that holds the friend's saved home tile as it stands now (floor tiles; fence pieces for gardens; plus squares inside, doors, windows or the shape when the wish asked for them). If that space can't be found (walls bulldozed, or another friend's home in it too) it shows their wish instead, never a guessed number. Nothing new is saved.
- **👤 Who am I?** is the player screen (pick, rename, add, delete players).

## Tests

- `npm run fuzz`: random wall/fence layouts checked against an independent union-find (rooms, gardens that lean on walls, area, fence count, doors, windows, rectangle/L/T/U), 500 random shapes named by their rows here and by the page, platforms leaning on a wall (and the same with a gap, or no fence at all), then every wish from 200 seeds (all 20 friends, two-part wishes included; every other Conductor platform leans on the station) built independently inside the lot it arrives on and confirmed by the page; the same build with the door or a fence piece missing, or with the wrong number, must be refused. Mutation-checked: dropping the T's same-depth rule or the garden's needs-a-fence rule fails it.
- `npm run play [shotsDir]`: Playwright at 1920×1080 with real mouse drags: draws Hoot's room, adds a door, paints, places a bed, sees the move-in and the lot grow, runs a night, checks 31 undos, R / Ctrl+Z / right-drag / wheel, reloads, stages every `?test=`, loads wave-one (60-wide) wish and free saves to check the migration, plays free build, solves the Conductor with a platform fenced by mouse against the station wall, loads a finished 14-friend save (no `doorStyle`) and meets friend 15, puts in a door of each look and checks restyle, undo, bulldoze and reload, runs the theme pack (a train on a loop and on a line, four cats wandering, chasing and sleeping, Crooner on stage with an audience, track laid by mouse, new pieces saved and reloaded, a save with an unknown piece) checks every Stuff tab fits at 1366×768, opens the Journal (four friends in, Biscuit's and Giggles' home lines against their wishes, Mortimer a silhouette until he moves in, the game paused behind it, Free build unlocking nothing, a pre-Journal save showing its wish fallback and left byte-for-byte unchanged) and checks the "Who am I?" headings. Needs playwright-core (found in `~/Code/killsaws`) and `/usr/bin/chromium`. Screenshots go to `shots/` (gitignored).
- `npm run check` runs both.

## Debug hooks

- `?debug` exposes `window.__mid`: `state`, `wish`, `people`, `place(kind,x,y,rot)`, `wall(x1,y1,x2,y2[,type])`, `paint(x,y,kind)`, `arrive(id)`, `grant(id)`, `day(n)`, `hour(h)`, `rooms()` (with `doors`, `windows`, `isL`/`isT`/`isU`), `gardens()`, `doorStyle`, `check()`, `solve()`, `gridXY(gx,gy)` / `tileXY(tx,ty)` (screen points for drags), `zoom(z)`, `center(tx,ty)`, `order`, `dims`, `tabOf(kind)`, `invite(id,x,y)`, `setMode(m)`, `cats`, `trains`, `poke(id)`, `replan([skipId])`, `setClock(h)`, `putCat(id,x,y)`, `playAs(id)`, `letGo()`, `use()`, `driven`, `useTarget`.
- `?test=wish:<id> | movein:<id> | night | house | playas:<id>` stages each within seconds, in a separate test save. `?speed=4` runs the clock faster.

## Saves

Per player, the Door Codes pattern: `moveinday.players` holds `{list, cur}` and each player's lot is `moveinday.v1.<id>` (free build: `moveinday.free.v1.<id>`), floors and edges packed as strings. Undo (40 steps) is in memory only.

Each save records the grid its arrays are packed on (`grid: {w, h}`). A save without one is from wave one (60 wide, a 40-row lot with the sidewalk at row 40): `migrate()` re-packs it onto the 80×50 grid, keeping every tile's column and its distance from the sidewalk, and moves the lot, furniture and residents' homes down with it. The next save writes the new grid, so it never shifts twice. If the grid changes again, bump `WW`/`LOT_H` and the same code handles it.
