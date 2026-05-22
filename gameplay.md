# Gameplay

Strateg2 is a 1v1 real-time strategy game played in the browser on a fixed 36×20 tile map. **Red** fights **Blue** — either you vs. the in-sim AI (single-player) or two humans matched through the lobby (multiplayer). The match ends the moment one side has no buildings left except gold mines.

## Starting position

Each side begins with:

- 1 **Town Hall** (3×3) — Red on the west edge, Blue on the east.
- 3 **Peasants** standing south of the Town Hall.
- **300 gold, 200 wood** in the treasury.

Two neutral **Gold Mines** sit in the middle lanes, one near each base. Forests line the north and south strips around each Town Hall — that is your wood supply. The map has no fog of war; everything is visible from tick zero.

## Resources

| Resource | Source | Notes |
|---|---|---|
| **Gold** | Gold Mine (`10 000` per mine) | Peasants walk in, gather `5` per `1.0 s`, walk back to the Town Hall. |
| **Wood** | Forest tiles (`100` wood each) | Peasants chop a tile, haul `5` back to the Town Hall, tile is consumed when empty. |
| **Arrows** | Arrow Building (consumes wood) | Not a treasury resource — see "Arrow logistics" below. |

Peasants self-assign: if you right-click them onto a mine or a forest tile they switch to that job; if you leave them idle next to an Arrow Building with work pending, they pick up a hauling task on their own.

## Units

| Unit | HP | DMG | Range | Cooldown | Speed | Cost | Train |
|---|---|---|---|---|---|---|---|
| **Peasant** | 25 | 2 | melee | 1.0 s | 2.2 t/s | 50 g | 5 s (Town Hall) |
| **Swordsman** | 60 | 8 | melee | 1.0 s | 2.0 t/s | 80 g | 8 s (Barracks) |
| **Archer** | 35 | 6 | 6 tiles | 1.2 s | 2.0 t/s | 70 g | 8 s (Archery Range) |

- Peasants are workers, but they will fight back (badly) if ordered to attack.
- Swordsmen are the raw melee line — cheapest gold-only army unit.
- Archers can **only shoot if they have arrows in their quiver** (max `10`). A freshly trained archer is empty and useless until a peasant supplies them. See "Arrow logistics."

## Buildings

| Building | HP | Size | Cost | Purpose |
|---|---|---|---|---|
| **Town Hall** | 400 | 3×3 | — | Trains peasants. Drop-off point for gold and wood. |
| **Barracks** | 250 | 2×2 | 200 g + 100 w | Trains swordsmen. |
| **Archery Range** | 220 | 2×2 | 200 g + 100 w | Trains archers. |
| **Arrow Building** | 180 | 2×2 | 100 g + 150 w | Converts wood into arrows (`1 w → 1 arrow`, every `1.5 s`, stockpile cap `30`, internal wood cap `20`). |
| **Tower** | 250 | 2×2 | 150 g + 100 w | Garrison up to 4 archers; their shots get **1.5× range and 2× damage**. Tower stockpiles up to 20 arrows and distributes them to its garrison every `0.25 s`. |
| **Gold Mine** | 1 000 | 2×2 | — | Neutral; not destroyable for victory purposes. |

Buildings can only be placed on grass — not on forest, gold mines, or another building's footprint.

## Arrow logistics

This is the wrinkle that makes the economy more than "gold → army."

1. Build an **Arrow Building**. It does nothing on its own.
2. Peasants haul **wood from the treasury into the Arrow Building** (up to its `20`-wood internal cap).
3. The Arrow Building converts wood into arrows over time and holds them (up to `30`).
4. Peasants then haul **arrows from the Arrow Building to consumers** — non-full archers in the field, or non-full Towers with at least one archer garrisoned.

Idle peasants pick up these jobs automatically once an Arrow Building exists. The **Supply** dropdown in the HUD biases this:

- **Auto** — arrows take priority over wood when both jobs are open.
- **Wood first** — keep the building topped up before hauling out.
- **Arrows first** — push arrows out as fast as they're made.

Practical consequence: an archer army stalls without an Arrow Building + peasant supply chain. A Tower without garrisoned archers and arrow supply is just a 250-HP wall.

## Combat

- Melee: walk into range, attack on cooldown.
- Ranged: archers fire **physical arrow projectiles** that travel at `12 tiles/s`. They can miss if the target moves — unless **"Always-hit arrows"** is enabled in the HUD (on by default), in which case the projectile homes to the original target.
- Each arrow shot consumes one arrow from the archer's quiver.
- Towers: a garrisoned archer fires from the tower using tower stats (1.5× range, 2× damage). The tower itself has no attack — empty towers are dead weight.

## Controls

| Input | Effect |
|---|---|
| **Left-click** | Select a unit or building. |
| **Left-click + drag** | Box-select multiple units. |
| **Right-click on empty tile** | Move selected units there. |
| **Right-click on forest / gold mine** | Send selected peasants to gather. |
| **Right-click on enemy** | Attack-move / attack that target. |
| **Right-click on own Tower (archer selected)** | Garrison the archer. |
| **Click a Town Hall / Barracks / Archery Range** | Open its train menu in the HUD. |
| **Build menu buttons** | Enter build-placement mode for that building, then left-click a tile to place. **Cancel** exits placement. |
| **Eject all** (selection panel) | Empty a Tower's garrison. |

## HUD options

- **Auto-fight (red AI)** — toggles the in-sim AI for the red player. In single-player you usually play Red with this OFF and let Blue's AI play against you (blue's AI is on by default).
- **Always-hit arrows** — see Combat above.
- **Stacks** — visual only; how overlapping units are drawn (Spread / Badge / Overlap).
- **Supply** — peasant hauling priority (see Arrow logistics).

## The AI opponent

The AI follows a fixed priority list each tick (decides every `1.5 s`):

1. Keep peasants gathering — biased toward wood until an Arrow Building exists.
2. Build economy in order: **Arrow Building → Barracks → Archery Range → Tower**.
3. Trickle peasants up to `5`, but only when it can still afford the next building.
4. Train one swordsman per Barracks and one archer per Archery Range whenever it can afford it (queue cap 2).
5. Auto-garrison idle archers into the nearest Tower with room.
6. When its army reaches `6` units and the wave timer has expired, **attack-move the entire army at the nearest enemy building**. Wave cooldown is `30 s`.

It will never run out of gold to build because it reserves enemy-building cost before training peasants. Beating it generally means contesting before the first wave assembles, or out-massing it on archers behind Towers.

## Victory

After every tick the game checks each side's building list (excluding gold mines). The first side with **zero non-mine buildings** loses; the other side's banner appears in the game-over overlay. Click **Restart** (or any peer in MP) to reseed the match — same map, same starting position.

## Multiplayer notes

When the page is served by the Node server, the client connects to a lobby. You enter a name, see who else is online, and send/receive invites. On accept, both clients spawn a fresh sim in lockstep and the server drives ticks via `tick-commands` messages — there is no local AI in multiplayer, both sides are human. Disconnects end the match immediately.
