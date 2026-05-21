// NetTransport: WebSocket adapter for lockstep multiplayer.
//
// Wire shape (JSON over WebSocket):
//   server -> client: { type:'lobby-hello',    connId }
//   server -> client: { type:'players',        list:[{connId,name}] }
//   server -> client: { type:'name-accepted',  name }
//   server -> client: { type:'name-rejected',  reason }
//   server -> client: { type:'invited',        fromConnId, fromName }
//   server -> client: { type:'invite-declined',byConnId }
//   server -> client: { type:'invite-failed',  reason }
//   server -> client: { type:'hello',          playerId, initialAutoFight }  (match-start)
//   server -> client: { type:'tick-commands',  tick, commands:Command[] }
//   server -> client: { type:'match-ended',    reason, winner }
//   server -> client: { type:'full' }
//   server -> client: { type:'snapshot',       snapshot }                    (reserved)
//
//   client -> server: { type:'set-name',       name }
//   client -> server: { type:'invite',         toConnId }
//   client -> server: { type:'accept-invite',  fromConnId }
//   client -> server: { type:'decline-invite', fromConnId }
//   client -> server: { type:'cmd',            cmd:Command (unstamped seq/tick) }
//
// Same Transport core shape as LocalTransport (submit / onSnapshot /
// onCommandsForTick) — the client bootstrap selects which factory to
// instantiate and only branches on lobby vs. match elsewhere.
//
// WebSocket factory is injectable so the module is unit-testable without a
// real browser. Production: `new WebSocket(url)` (browser global). Tests: pass
// a stub.

/** @typedef {import('./local.js').Transport} Transport */

/**
 * @param {string} url
 * @param {{
 *   onAssign?:         (msg:{playerId:'red'|'blue', initialAutoFight:{red:boolean,blue:boolean}}) => void,
 *   onLobbyHello?:     (msg:{connId:string}) => void,
 *   onPlayers?:        (list:Array<{connId:string,name:string}>) => void,
 *   onNameAccepted?:   (msg:{name:string}) => void,
 *   onNameRejected?:   (msg:{reason:string}) => void,
 *   onInvited?:        (msg:{fromConnId:string,fromName:string}) => void,
 *   onInviteDeclined?: (msg:{byConnId:string}) => void,
 *   onInviteFailed?:   (msg:{reason:string}) => void,
 *   onMatchEnded?:     (msg:{reason:string, winner:'red'|'blue'|null}) => void,
 *   onFull?:           () => void,
 *   onError?:          (err:Error|Event) => void,
 *   WebSocket?:        typeof WebSocket,
 * }} [opts]
 * @returns {Transport & {
 *   setName:        (name:string) => void,
 *   invite:         (toConnId:string) => void,
 *   acceptInvite:   (fromConnId:string) => void,
 *   declineInvite:  (fromConnId:string) => void,
 * }}
 */
export function createNetTransport(url, opts = {}) {
  const WS = opts.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!WS) throw new Error('NetTransport: no WebSocket available; inject one via opts.WebSocket');

  const onAssign         = opts.onAssign         || (() => {});
  const onLobbyHello     = opts.onLobbyHello     || (() => {});
  const onPlayers        = opts.onPlayers        || (() => {});
  const onNameAccepted   = opts.onNameAccepted   || (() => {});
  const onNameRejected   = opts.onNameRejected   || (() => {});
  const onInvited        = opts.onInvited        || (() => {});
  const onInviteDeclined = opts.onInviteDeclined || (() => {});
  const onInviteFailed   = opts.onInviteFailed   || (() => {});
  const onMatchEnded     = opts.onMatchEnded     || (() => {});
  const onFull           = opts.onFull           || (() => {});
  const onError          = opts.onError          || (() => {});

  let snapshotCb         = () => {};
  let commandsForTickCb  = () => {};

  const ws = new WS(url);
  const pending = [];   // payloads queued before the socket opened

  function sendOrQueue(obj) {
    const payload = JSON.stringify(obj);
    if (ws.readyState === 1 /* OPEN */) ws.send(payload);
    else pending.push(payload);
  }

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
      case 'lobby-hello':
        onLobbyHello({ connId: msg.connId });
        break;
      case 'players':
        onPlayers(msg.list || []);
        break;
      case 'name-accepted':
        onNameAccepted({ name: msg.name });
        break;
      case 'name-rejected':
        onNameRejected({ reason: msg.reason });
        break;
      case 'invited':
        onInvited({ fromConnId: msg.fromConnId, fromName: msg.fromName });
        break;
      case 'invite-declined':
        onInviteDeclined({ byConnId: msg.byConnId });
        break;
      case 'invite-failed':
        onInviteFailed({ reason: msg.reason });
        break;
      case 'match-ended':
        onMatchEnded({ reason: msg.reason, winner: msg.winner });
        break;
      case 'tick-commands':
        commandsForTickCb(msg.tick, msg.commands);
        break;
      case 'snapshot':
        snapshotCb(msg.snapshot);
        break;
      case 'full':
        onFull();
        break;
    }
  });

  ws.addEventListener('error', (e) => onError(e));

  return {
    submit(cmd) {
      sendOrQueue({ type: 'cmd', cmd });
    },
    onSnapshot(cb)        { snapshotCb        = cb; },
    onCommandsForTick(cb) { commandsForTickCb = cb; },
    setName(name)         { sendOrQueue({ type: 'set-name',       name }); },
    invite(toConnId)      { sendOrQueue({ type: 'invite',         toConnId }); },
    acceptInvite(fromConnId)  { sendOrQueue({ type: 'accept-invite',  fromConnId }); },
    declineInvite(fromConnId) { sendOrQueue({ type: 'decline-invite', fromConnId }); },
  };
}
