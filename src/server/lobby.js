// PUBLIC API of the server lobby.
// Pure, DI-free, no I/O — easily unit-testable.
//
// Responsibilities:
//   - Assign 'red' / 'blue' slots to incoming connections; refuse a third human.
//   - Report which slots are currently human vs. AI-controlled. The server's tick
//     loop reads this to keep state.autoFight in sync (a slot with no human → AI).
//   - Release a slot on disconnect.
//
// Connection objects are opaque to this module (just a stable identity). The
// transport layer (server/index.js) owns them; lobby only stores references.

/**
 * @typedef {Object} LobbyModule
 * @property {(conn:object) => ('red'|'blue'|null)} assignSlot
 *   Returns the assigned playerId, or null if both slots are occupied.
 * @property {(conn:object) => ('red'|'blue'|null)} releaseSlot
 *   Frees whichever slot this connection holds. Returns the freed id, or null.
 * @property {() => Array<'red'|'blue'>} humanSlots
 * @property {() => Array<'red'|'blue'>} aiSlots
 * @property {(playerId:'red'|'blue') => boolean} isHumanSlot
 * @property {() => {red:boolean, blue:boolean}} autoFightFlags
 *   The autoFight map the server should apply to its sim and broadcast to clients:
 *   true for AI-controlled slots, false for human ones.
 */

/** @returns {LobbyModule} */
export function createLobby() {
  /** @type {{red:object|null, blue:object|null}} */
  const slots = { red: null, blue: null };

  function assignSlot(conn) {
    if (slots.red  === null) { slots.red  = conn; return 'red';  }
    if (slots.blue === null) { slots.blue = conn; return 'blue'; }
    return null;
  }

  function releaseSlot(conn) {
    for (const id of ['red', 'blue']) {
      if (slots[id] === conn) { slots[id] = null; return id; }
    }
    return null;
  }

  function humanSlots() {
    return ['red', 'blue'].filter(id => slots[id] !== null);
  }

  function aiSlots() {
    return ['red', 'blue'].filter(id => slots[id] === null);
  }

  function isHumanSlot(playerId) {
    return slots[playerId] !== null;
  }

  function autoFightFlags() {
    return {
      red:  slots.red  === null,
      blue: slots.blue === null,
    };
  }

  return { assignSlot, releaseSlot, humanSlots, aiSlots, isHumanSlot, autoFightFlags };
}
