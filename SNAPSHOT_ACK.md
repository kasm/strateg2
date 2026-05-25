# SNAPSHOT_ACK

Date: 2026-05-24

- tests/__snapshots__/public-surfaces.test.js.snap — new modules added under the PvE/foundational-seams slice: `src/core/factions.js`, `src/core/events.js`, `src/core/victory.js`, `src/modules/pve/index.js` (and the `pve` entry in the runtime-API snapshot). No existing exports renamed or removed.

Inline (in-file) snapshot updates not tracked here:
- `tests/phase-order.test.js` — inline `PHASES` name snapshot gained the new `pveUpdate` entry between `aiUpdate` and `unitsUpdate`. Part of the same PvE slice; documented in CLAUDE.md P9 contract.
