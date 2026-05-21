// NetTransport: WebSocket adapter for lockstep multiplayer.
//
// Wire shape (JSON over WebSocket):
//   server -> client: { type:'hello',         playerId, initialAutoFight:{red,blue} }
//   server -> client: { type:'tick-commands', tick:number, commands:Command[] }
//   server -> client: { type:'snapshot',      snapshot:object }                  (reserved; not wired in MVP)
//   client -> server: { type:'cmd',           cmd:Command (unstamped seq/tick) }
//
// Same Transport shape as LocalTransport — the client bootstrap selects which
// factory to instantiate and never branches further on mode.
//
// WebSocket factory is injectable so the module is unit-testable without a real
// browser. Production: `new WebSocket(url)` (browser global). Tests: pass a stub.

/** @typedef {import('./local.js').Transport} Transport */

/**
 * @param {string} url
 * @param {{
 *   onAssign?: (msg:{playerId:'red'|'blue', initialAutoFight:{red:boolean,blue:boolean}}) => void,
 *   onError?:  (err:Error|Event) => void,
 *   WebSocket?: typeof WebSocket,
 * }} [opts]
 * @returns {Transport}
 */
export function createNetTransport(url, opts = {}) {
  const WS = opts.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!WS) throw new Error('NetTransport: no WebSocket available; inject one via opts.WebSocket');

  const onAssign = opts.onAssign || (() => {});
  const onError  = opts.onError  || (() => {});

  let snapshotCb         = () => {};
  let commandsForTickCb  = () => {};

  const ws = new WS(url);
  const pending = [];   // commands queued before the socket opened

  ws.addEventListener('open', () => {
    while (pending.length) ws.send(pending.shift());
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.type) {
      case 'hello':
        onAssign({ playerId: msg.playerId, initialAutoFight: msg.initialAutoFight });
        break;
      case 'tick-commands':
        commandsForTickCb(msg.tick, msg.commands);
        break;
      case 'snapshot':
        snapshotCb(msg.snapshot);
        break;
    }
  });

  ws.addEventListener('error', (e) => onError(e));

  return {
    submit(cmd) {
      const payload = JSON.stringify({ type: 'cmd', cmd });
      if (ws.readyState === 1 /* OPEN */) ws.send(payload);
      else pending.push(payload);
    },
    onSnapshot(cb)        { snapshotCb        = cb; },
    onCommandsForTick(cb) { commandsForTickCb = cb; },
  };
}
