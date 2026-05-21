// Invariant: every Transport implementation exposes { submit, onSnapshot, onCommandsForTick }
// as callable functions. The client bootstrap should never need to branch on which
// transport it received — only on whether MP is enabled at all.

import { describe, it, expect } from 'vitest';
import { createLocalTransport } from '../src/transport/local.js';
import { createNetTransport }   from '../src/transport/net.js';

function makeFakeSim() {
  return { commands: { submit: () => {} }, state: { tick: 0 } };
}

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this._listeners = {};
  }
  addEventListener(ev, cb) { (this._listeners[ev] ||= []).push(cb); }
  send(_msg) {}
  // Convenience for tests
  _fire(ev, payload) { (this._listeners[ev] || []).forEach(cb => cb(payload)); }
}

function assertShape(t, label) {
  expect(typeof t.submit,            `${label}.submit`).toBe('function');
  expect(typeof t.onSnapshot,        `${label}.onSnapshot`).toBe('function');
  expect(typeof t.onCommandsForTick, `${label}.onCommandsForTick`).toBe('function');
}

describe('Transport contract — same shape across implementations', () => {
  it('LocalTransport exposes the canonical methods', () => {
    const t = createLocalTransport(makeFakeSim());
    assertShape(t, 'LocalTransport');
  });

  it('NetTransport exposes the canonical methods', () => {
    const t = createNetTransport('ws://test', { WebSocket: FakeWebSocket });
    assertShape(t, 'NetTransport');
  });

  it('NetTransport forwards onAssign when the server sends hello', () => {
    let received = null;
    const t = createNetTransport('ws://test', {
      WebSocket: FakeWebSocket,
      onAssign: (msg) => { received = msg; },
    });
    // The transport stores the underlying socket as an internal — we accessed it
    // via the constructor instance. Replay a hello via the listener API.
    // Because FakeWebSocket doesn't expose itself out, we instead simulate via the
    // shape: this is a smoke check on wire behavior, so we round-trip the message
    // through the transport's message handler by piggybacking on a stub object.
    // (Construct a fresh transport with an inline FakeWebSocket we can address.)
    let socketRef;
    class CaptureWS extends FakeWebSocket {
      constructor(url) { super(url); socketRef = this; }
    }
    received = null;
    createNetTransport('ws://test', {
      WebSocket: CaptureWS,
      onAssign: (msg) => { received = msg; },
    });
    socketRef._fire('message', { data: JSON.stringify({ type: 'hello', playerId: 'blue', initialAutoFight: { red: true, blue: false } }) });
    expect(received).toEqual({ playerId: 'blue', initialAutoFight: { red: true, blue: false } });
    // silence unused-var
    void t;
  });

  it('NetTransport forwards onCommandsForTick batches', () => {
    let socketRef;
    class CaptureWS extends FakeWebSocket {
      constructor(url) { super(url); socketRef = this; }
    }
    const t = createNetTransport('ws://test', { WebSocket: CaptureWS });
    let received = null;
    t.onCommandsForTick((tick, cmds) => { received = { tick, cmds }; });
    socketRef._fire('message', { data: JSON.stringify({ type: 'tick-commands', tick: 42, commands: [{ type: 'order', playerId: 'red', seq: 1, tick: 42 }] }) });
    expect(received.tick).toBe(42);
    expect(received.cmds).toHaveLength(1);
    expect(received.cmds[0].playerId).toBe('red');
  });

  it('NetTransport queues submits while the socket is connecting and flushes on open', () => {
    let socketRef;
    class CaptureWS extends FakeWebSocket {
      constructor(url) { super(url); socketRef = this; }
      send(msg) { (this.sent ||= []).push(msg); }
    }
    const t = createNetTransport('ws://test', { WebSocket: CaptureWS });
    t.submit({ type: 'order', playerId: 'red', unitIds: [1], target: { kind: 'tile', x: 5, y: 5 } });
    // Before open, nothing should have been sent on the wire.
    expect(socketRef.sent).toBeUndefined();
    socketRef.readyState = 1;
    socketRef._fire('open');
    expect(socketRef.sent).toHaveLength(1);
    expect(JSON.parse(socketRef.sent[0]).cmd.type).toBe('order');
  });
});
