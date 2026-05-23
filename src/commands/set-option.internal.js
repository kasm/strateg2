// 'setOption' command: change a sim-affecting game setting.
//
// Shape:
//   { type:'setOption', playerId, tick, seq, key, value }
//     key:'alwaysHit'      value: boolean
//     key:'supplyPriority' value: 'auto' | 'wood' | 'arrows'
//
// Why a command and not a direct state write: `alwaysHit` (arrow homing) and
// `supplyPriority` (peasant logistics) both change the simulation. Routing them
// through the dispatcher keeps the determinism invariant intact — the sim state
// is a pure function of spawnInitial() + the ordered command stream — so the
// replay recorder captures every input. It also removes a latent MP desync.
//
// `aiType` is deliberately NOT a setOption: replays run with AI off and the
// recorded log already contains every command the AI ever produced.

const SUPPLY_VALUES = ['auto', 'wood', 'arrows'];

export function validateSetOption(deps, cmd) {
  if (cmd.key === 'alwaysHit') {
    if (typeof cmd.value !== 'boolean') return { ok: false, reason: 'bad value' };
    return { ok: true };
  }
  if (cmd.key === 'supplyPriority') {
    if (!SUPPLY_VALUES.includes(cmd.value)) return { ok: false, reason: 'bad value' };
    return { ok: true };
  }
  return { ok: false, reason: 'unknown option' };
}

export function applySetOption(deps, cmd) {
  deps.state[cmd.key] = cmd.value;
}
