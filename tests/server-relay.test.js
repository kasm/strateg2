// Unit tests for the server's lockstep modules.
// Both modules are pure DI-free and easily testable in isolation.

import { describe, it, expect } from 'vitest';
import { createLobby } from '../src/server/lobby.js';
import { createRelay } from '../src/server/relay.js';

describe('createLobby', () => {
  it('assigns red, then blue, then refuses overflow', () => {
    const lobby = createLobby();
    const a = {}, b = {}, c = {};
    expect(lobby.assignSlot(a)).toBe('red');
    expect(lobby.assignSlot(b)).toBe('blue');
    expect(lobby.assignSlot(c)).toBe(null);
  });

  it('reports autoFight=true for empty slots, false for occupied', () => {
    const lobby = createLobby();
    expect(lobby.autoFightFlags()).toEqual({ red: true, blue: true });
    const a = {};
    lobby.assignSlot(a);
    expect(lobby.autoFightFlags()).toEqual({ red: false, blue: true });
    const b = {};
    lobby.assignSlot(b);
    expect(lobby.autoFightFlags()).toEqual({ red: false, blue: false });
  });

  it('releaseSlot frees the slot and flips autoFight back on', () => {
    const lobby = createLobby();
    const a = {};
    lobby.assignSlot(a);
    expect(lobby.autoFightFlags().red).toBe(false);
    expect(lobby.releaseSlot(a)).toBe('red');
    expect(lobby.autoFightFlags().red).toBe(true);
  });

  it('humanSlots / aiSlots partition correctly', () => {
    const lobby = createLobby();
    const a = {};
    lobby.assignSlot(a);
    expect(lobby.humanSlots()).toEqual(['red']);
    expect(lobby.aiSlots()).toEqual(['blue']);
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
