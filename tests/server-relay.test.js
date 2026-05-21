// Unit tests for the server's lockstep modules.
// Both modules are pure DI-free and easily testable in isolation.

import { describe, it, expect } from 'vitest';
import { createLobby } from '../src/server/lobby.js';
import { createRelay } from '../src/server/relay.js';

describe('createLobby', () => {
  it('addConn returns a fresh connId per conn and is idempotent for the same conn', () => {
    const lobby = createLobby();
    const a = {}, b = {};
    const idA = lobby.addConn(a);
    const idB = lobby.addConn(b);
    expect(idA).not.toBe(idB);
    expect(typeof idA).toBe('string');
    expect(lobby.addConn(a)).toBe(idA);
    expect(lobby.connIdOf(a)).toBe(idA);
    expect(lobby.connById(idA)).toBe(a);
  });

  it('setName trims, rejects empty / duplicate (case-insensitive) / overlong', () => {
    const lobby = createLobby();
    const a = {}, b = {};
    lobby.addConn(a); lobby.addConn(b);
    expect(lobby.setName(a, '  ')).toEqual({ ok: false, reason: 'empty' });
    expect(lobby.setName(a, '  Alice  ')).toEqual({ ok: true });
    expect(lobby.nameOf(a)).toBe('Alice');
    expect(lobby.setName(b, 'alice')).toEqual({ ok: false, reason: 'duplicate' });
    expect(lobby.setName(b, 'B'.repeat(25))).toEqual({ ok: false, reason: 'too-long' });
    expect(lobby.setName(b, 'Bob')).toEqual({ ok: true });
  });

  it('roster excludes unnamed conns and in-match conns', () => {
    const lobby = createLobby();
    const a = {}, b = {}, c = {};
    lobby.addConn(a); lobby.addConn(b); lobby.addConn(c);
    lobby.setName(a, 'Alice');
    lobby.setName(b, 'Bob');
    // c is unnamed -> excluded
    expect(lobby.roster().map(r => r.name).sort()).toEqual(['Alice', 'Bob']);
    lobby.startMatch(a, b);
    expect(lobby.roster()).toEqual([]);
    lobby.setName(c, 'Carol');
    expect(lobby.roster().map(r => r.name)).toEqual(['Carol']);
  });

  it('startMatch assigns inviter=red, invitee=blue; refuses when busy or self-invite', () => {
    const lobby = createLobby();
    const a = {}, b = {}, c = {};
    lobby.addConn(a); lobby.addConn(b); lobby.addConn(c);
    expect(lobby.startMatch(a, a)).toBe(null);
    const pair = lobby.startMatch(a, b);
    expect(pair).toEqual({ red: a, blue: b });
    expect(lobby.isInMatch()).toBe(true);
    expect(lobby.isMatchFull()).toBe(true);
    expect(lobby.matchSlotFor(a)).toBe('red');
    expect(lobby.matchSlotFor(b)).toBe('blue');
    expect(lobby.matchConn('red')).toBe(a);
    expect(lobby.startMatch(a, c)).toBe(null);
    expect(lobby.startMatch(c, b)).toBe(null);
  });

  it('endMatch clears the pairing and frees the lobby', () => {
    const lobby = createLobby();
    const a = {}, b = {};
    lobby.addConn(a); lobby.addConn(b);
    lobby.startMatch(a, b);
    const pair = lobby.endMatch();
    expect(pair).toEqual({ red: a, blue: b });
    expect(lobby.isInMatch()).toBe(false);
    expect(lobby.matchSlotFor(a)).toBe(null);
    expect(lobby.endMatch()).toBe(null);
  });

  it('removeConn reports wasInMatch + opponent for an in-match conn', () => {
    const lobby = createLobby();
    const a = {}, b = {}, c = {};
    lobby.addConn(a); lobby.addConn(b); lobby.addConn(c);
    lobby.startMatch(a, b);
    const res = lobby.removeConn(b);
    expect(res.wasInMatch).toBe(true);
    expect(res.opponentConn).toBe(a);
    expect(res.freedConnId).toBeTruthy();
    expect(lobby.isInMatch()).toBe(false);
    // out-of-match removal:
    const res2 = lobby.removeConn(c);
    expect(res2.wasInMatch).toBe(false);
    expect(res2.opponentConn).toBe(null);
  });
});

describe('createRelay', () => {
  it('stamps monotonic per-player seq numbers (identical to dispatcher pattern)', () => {
    const r = createRelay();
    expect(r.stampSeq('red')).toBe(1);
    expect(r.stampSeq('red')).toBe(2);
    expect(r.stampSeq('blue')).toBe(1);
    expect(r.stampSeq('red')).toBe(3);
  });

  it('collectTick produces a deterministic (playerId, seq) ordering', () => {
    const r = createRelay();
    const a = { playerId: 'red',  seq: r.stampSeq('red')  };
    const b = { playerId: 'blue', seq: r.stampSeq('blue') };
    const c = { playerId: 'red',  seq: r.stampSeq('red')  };
    // Enqueue in scrambled order
    r.enqueue(c); r.enqueue(b); r.enqueue(a);
    const batch = r.collectTick(99);
    expect(batch.map(x => [x.playerId, x.seq])).toEqual([
      ['blue', 1],
      ['red',  1],
      ['red',  2],
    ]);
  });

  it('collectTick stamps a missing tick field with serverTick', () => {
    const r = createRelay();
    const c = { playerId: 'red', seq: r.stampSeq('red') };
    r.enqueue(c);
    r.collectTick(42);
    expect(c.tick).toBe(42);
  });

  it('collectTick preserves an already-set tick (rare but allowed)', () => {
    const r = createRelay();
    const c = { playerId: 'red', seq: r.stampSeq('red'), tick: 7 };
    r.enqueue(c);
    r.collectTick(42);
    expect(c.tick).toBe(7);
  });

  it('empties the buffer after collectTick', () => {
    const r = createRelay();
    r.enqueue({ playerId: 'red', seq: r.stampSeq('red') });
    expect(r.pendingCount()).toBe(1);
    r.collectTick(0);
    expect(r.pendingCount()).toBe(0);
  });

  it('reset clears seq counters and buffer', () => {
    const r = createRelay();
    r.stampSeq('red');
    r.enqueue({ playerId: 'red', seq: 1 });
    r.reset();
    expect(r.pendingCount()).toBe(0);
    expect(r.stampSeq('red')).toBe(1);
  });
});
