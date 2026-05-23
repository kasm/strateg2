// PUBLIC API of the server lobby.
// Pure, DI-free, no I/O — easily unit-testable.
//
// Responsibilities:
//   - Track every connected client by an opaque short connId + (optional) display name.
//   - Refuse new conns while a match is in progress (capacity = 2 humans, no spectators).
//   - On accepted invite, pair two conns into a match: inviter = 'red', invitee = 'blue'.
//   - Expose the current pairing so the server's tick loop / cmd-router can gate work.
//   - Release a slot on disconnect; report whether the leaver was in the active match
//     so the server can broadcast a win + reset the sim.
//
// Connection objects are opaque to this module (just a stable identity). The
// transport layer (server/index.js) owns them; lobby only stores references.

/**
 * @typedef {Object} LobbyRecord
 * @property {string} connId    short opaque id assigned on addConn
 * @property {object} conn      transport-owned ws conn
 * @property {string|null} name display name, null until setName accepts one
 *
 * @typedef {Object} RemoveResult
 * @property {string|null} freedConnId
 * @property {boolean} wasInMatch
 * @property {object|null} opponentConn
 *
 * @typedef {Object} LobbyModule
 * @property {(conn:object) => string} addConn
 * @property {(conn:object) => RemoveResult} removeConn
 * @property {(conn:object, name:string) => {ok:boolean, reason?:string}} setName
 * @property {() => Array<{connId:string, name:string}>} roster
 * @property {(fromConn:object, toConn:object, mapW:number, mapH:number) => ({red:object, blue:object, mapW:number, mapH:number}|null)} startMatch
 * @property {() => ({red:object, blue:object}|null)} endMatch
 * @property {() => boolean} isInMatch
 * @property {() => boolean} isMatchFull
 * @property {() => ({mapW:number, mapH:number}|null)} matchDims
 * @property {(conn:object) => ('red'|'blue'|null)} matchSlotFor
 * @property {(slot:'red'|'blue') => (object|null)} matchConn
 * @property {(connId:string) => (object|null)} connById
 * @property {(conn:object) => (string|null)} connIdOf
 * @property {(conn:object) => (string|null)} nameOf
 */

/** @returns {LobbyModule} */
export function createLobby() {
  /** @type {Map<object, LobbyRecord>} */
  const byConn = new Map();
  /** @type {Map<string, LobbyRecord>} */
  const byId   = new Map();

  /** @type {{red:object|null, blue:object|null, mapW:number|null, mapH:number|null}} */
  const match = { red: null, blue: null, mapW: null, mapH: null };

  function genId() {
    // 6 chars from [a-z0-9] — collision-resistant enough for a single-server lobby.
    let id;
    do { id = Math.random().toString(36).slice(2, 8); } while (byId.has(id));
    return id;
  }

  function addConn(conn) {
    const existing = byConn.get(conn);
    if (existing) return existing.connId;
    const rec = { connId: genId(), conn, name: null };
    byConn.set(conn, rec);
    byId.set(rec.connId, rec);
    return rec.connId;
  }

  function removeConn(conn) {
    const rec = byConn.get(conn);
    if (!rec) return { freedConnId: null, wasInMatch: false, opponentConn: null };

    let wasInMatch = false;
    let opponentConn = null;
    if (match.red === conn || match.blue === conn) {
      wasInMatch = true;
      opponentConn = match.red === conn ? match.blue : match.red;
      match.red = null;
      match.blue = null;
      match.mapW = null;
      match.mapH = null;
    }

    byConn.delete(conn);
    byId.delete(rec.connId);
    return { freedConnId: rec.connId, wasInMatch, opponentConn };
  }

  function setName(conn, raw) {
    const rec = byConn.get(conn);
    if (!rec) return { ok: false, reason: 'unknown-conn' };
    const name = String(raw || '').trim();
    if (!name) return { ok: false, reason: 'empty' };
    if (name.length > 24) return { ok: false, reason: 'too-long' };
    for (const other of byConn.values()) {
      if (other === rec) continue;
      if (other.name && other.name.toLowerCase() === name.toLowerCase()) {
        return { ok: false, reason: 'duplicate' };
      }
    }
    rec.name = name;
    return { ok: true };
  }

  function roster() {
    const inMatch = new Set();
    if (match.red)  inMatch.add(match.red);
    if (match.blue) inMatch.add(match.blue);
    /** @type {Array<{connId:string, name:string}>} */
    const out = [];
    for (const rec of byConn.values()) {
      if (!rec.name) continue;
      if (inMatch.has(rec.conn)) continue;
      out.push({ connId: rec.connId, name: rec.name });
    }
    return out;
  }

  function startMatch(fromConn, toConn, mapW, mapH) {
    if (fromConn === toConn) return null;
    if (!byConn.has(fromConn) || !byConn.has(toConn)) return null;
    if (match.red || match.blue) return null;
    if (!Number.isFinite(mapW) || !Number.isFinite(mapH) || mapW <= 0 || mapH <= 0) return null;
    match.red  = fromConn;
    match.blue = toConn;
    match.mapW = mapW;
    match.mapH = mapH;
    return { red: match.red, blue: match.blue, mapW, mapH };
  }

  function endMatch() {
    if (!match.red && !match.blue) return null;
    const pair = { red: match.red, blue: match.blue };
    match.red  = null;
    match.blue = null;
    match.mapW = null;
    match.mapH = null;
    return pair;
  }

  function matchDims() {
    if (match.mapW == null || match.mapH == null) return null;
    return { mapW: match.mapW, mapH: match.mapH };
  }

  function isInMatch()   { return !!(match.red && match.blue); }
  function isMatchFull() { return isInMatch(); }

  function matchSlotFor(conn) {
    if (match.red  === conn) return 'red';
    if (match.blue === conn) return 'blue';
    return null;
  }
  function matchConn(slot) { return match[slot] || null; }

  function connById(connId) {
    const rec = byId.get(connId);
    return rec ? rec.conn : null;
  }
  function connIdOf(conn) {
    const rec = byConn.get(conn);
    return rec ? rec.connId : null;
  }
  function nameOf(conn) {
    const rec = byConn.get(conn);
    return rec ? rec.name : null;
  }

  return {
    addConn, removeConn, setName, roster,
    startMatch, endMatch, matchDims,
    isInMatch, isMatchFull,
    matchSlotFor, matchConn,
    connById, connIdOf, nameOf,
  };
}
